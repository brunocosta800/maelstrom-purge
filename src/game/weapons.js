// Armas: definição, modelo em primeira pessoa, disparo (hitscan, projétil, perfurante e corrente elétrica)
import * as THREE from 'three/webgpu';
import { assets } from './assets.js';
import { orbMaterial } from '../shaders/entities.js';
import { sfx } from '../engine/audio.js';

export const WEAPONS = {
    1: { key: 'pistol', name: 'Pistola Overture', ammo: null, dmg: 24, rate: 0.27, spread: 0.008, pellets: 1, auto: false, kick: 0.012, back: 0.06, len: 0.3, pos: [0.2, -0.2, -0.42], flash: 0xffd080, tracer: 'bullet' },
    2: { key: 'shotgun', name: 'Escopeta Carnificina', ammo: 'shells', cost: 1, dmg: 13, rate: 0.9, spread: 0.075, pellets: 9, auto: false, kick: 0.07, back: 0.16, len: 0.62, pos: [0.22, -0.24, -0.5], flash: 0xff9a40, tracer: 'bullet', push: 7 },
    3: { key: 'rifle', name: 'Metralhadora Pulsar', ammo: 'bullets', cost: 1, dmg: 15, rate: 0.085, spread: 0.022, pellets: 1, auto: true, kick: 0.008, back: 0.04, len: 0.8, pos: [0.22, -0.24, -0.55], flash: 0x60ffff, tracer: 'bullet' },
    4: { key: 'plasma', name: 'Canhão de Plasma', ammo: 'cells', cost: 2, dmg: 45, splash: 60, radius: 3.8, rate: 0.6, projectile: true, speed: 42, auto: true, kick: 0.035, back: 0.1, len: 0.45, pos: [0.2, -0.22, -0.45], flash: 0x40c0ff },
    5: { key: 'rail', name: 'Railgun Tsunami', ammo: 'cells', cost: 6, dmg: 220, rate: 1.1, pierce: true, auto: false, kick: 0.08, back: 0.2, len: 0.95, pos: [0.22, -0.24, -0.55], flash: 0xc070ff, tracer: 'rail' },
    6: { key: 'lightning', name: 'Lança-Raios Maelstrom', ammo: 'cells', cost: 1, costEvery: 2, dmg: 12, rate: 0.075, chain: 3, range: 24, auto: true, kick: 0.003, back: 0.015, len: 0.36, pos: [0.25, -0.27, -0.6], flash: 0x80e0ff },
};
export const AMMO_MAX = { bullets: 300, shells: 50, cells: 300 };
export const AMMO_LABEL = { bullets: 'BALAS', shells: 'CARTUCHOS', cells: 'CÉLULAS' };

const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Vector3(), _hit = {};

// Converte os materiais Phong do FBX em PBR e corrige o espaço de cor (as cores vieram escuras demais)
export function prepareGuns() {
    const cache = new Map();
    for (const gun of Object.values(assets.guns)) {
        if (!gun) continue;
        gun.traverse(o => {
            if (!o.isMesh) return;
            const conv = m => {
                if (cache.has(m)) return cache.get(m);
                const c = m.color.clone().convertLinearToSRGB();
                const bright = /muzzle|detail|barrel/i.test(m.name) && c.getHSL({}).s > 0.5;
                const n = new THREE.MeshStandardNodeMaterial({
                    color: c, roughness: 0.4, metalness: 0.45,
                    emissive: bright ? c : 0x000000, emissiveIntensity: bright ? 0.25 : 0,
                });
                cache.set(m, n);
                return n;
            };
            o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
        });
    }
}

export class WeaponSystem {
    constructor(game, weaponScene) {
        this.game = game;
        this.root = new THREE.Group();
        weaponScene.add(this.root);
        this.models = {};
        this.muzzles = {};
        for (const [id, W] of Object.entries(WEAPONS)) {
            const src = assets.guns[W.key];
            const holder = new THREE.Group();
            if (src) {
                const m = src.clone();
                const box = new THREE.Box3().setFromObject(m);
                const size = box.getSize(new THREE.Vector3());
                const s = W.len / size.z;
                m.scale.multiplyScalar(s);
                // origem do FBX fica perto do cabo; o cano aponta para -Z (frente da câmera)
                holder.add(m);
                this.muzzles[id] = new THREE.Vector3((box.min.x + box.max.x) / 2 * s, (box.min.y + (box.max.y - box.min.y) * 0.62) * s, box.min.z * s);
            } else {
                this.muzzles[id] = new THREE.Vector3(0, 0, -W.len);
            }
            holder.position.set(...W.pos);
            holder.visible = false;
            this.root.add(holder);
            this.models[id] = holder;
        }
        // clarão do cano
        this.flash = new THREE.Sprite(orbMaterial(0xffffff, 0xffaa40));
        this.flash.visible = false;
        this.flash.renderOrder = 10;
        this.root.add(this.flash);
        this.flashLight = new THREE.PointLight(0xffaa40, 0, 6, 1.5);
        this.root.add(this.flashLight);

        this.current = 1;
        this.cooldown = 0;
        this.switchT = 0;
        this.pending = null;
        this.recoil = 0;      // empurra a arma para trás
        this.recoilRot = 0;
        this.flashT = 0;
        this.tick = 0;
        this.bob = 0;
        this.sway = new THREE.Vector2();
        this.models[1].visible = true;
    }

    select(id) {
        const p = this.game.player;
        if (!p.owned.has(id) || id === this.current || this.pending) return;
        this.pending = id;
        this.switchT = 0;
        sfx.switchWeapon();
    }

    cycle(dir) {
        const owned = [...this.game.player.owned].sort();
        let i = owned.indexOf(this.pending ?? this.current);
        i = (i + dir + owned.length) % owned.length;
        this.select(owned[i]);
    }

    hasAmmo(id) {
        const W = WEAPONS[id], p = this.game.player;
        return !W.ammo || p.ammo[W.ammo] >= (W.cost || 1);
    }

    update(dt, firing) {
        const g = this.game, p = g.player;
        this.cooldown -= dt;
        // troca de arma: abaixa, troca, levanta
        if (this.pending) {
            this.switchT += dt;
            if (this.switchT > 0.14 && this.models[this.current].visible) {
                this.models[this.current].visible = false;
                this.current = this.pending;
                this.models[this.current].visible = true;
                g.hud.weapon(this.current);
            }
            if (this.switchT > 0.3) { this.pending = null; this.cooldown = Math.max(this.cooldown, 0.05); }
        }
        const W = WEAPONS[this.current];
        if (firing && !this.pending && this.cooldown <= 0) {
            if (this.hasAmmo(this.current)) {
                this.fire(W);
                this.cooldown = W.rate;
                if (!W.auto) g.input.mouseDown = false;
            } else {
                sfx.dryFire();
                this.cooldown = 0.3;
                g.input.mouseDown = false;
                // troca automática para a melhor arma com munição
                const best = [...p.owned].sort((a, b) => b - a).find(id => this.hasAmmo(id));
                if (best) this.select(best);
                g.hud.message('SEM MUNIÇÃO', 'warn');
            }
        }

        // animação da arma (balanço ao andar, inércia do mouse, recuo, troca)
        const speed = Math.hypot(p.vel.x, p.vel.z);
        this.bob += dt * (p.onGround ? speed * 0.9 : 0);
        const bobAmt = Math.min(1, speed / 10) * (p.onGround ? 1 : 0.3);
        this.sway.x += (-g.input.mouseDX * 0.0004 - this.sway.x) * Math.min(1, dt * 10);
        this.sway.y += (g.input.mouseDY * 0.0004 - this.sway.y) * Math.min(1, dt * 10);
        this.recoil += (0 - this.recoil) * Math.min(1, dt * 14);
        this.recoilRot += (0 - this.recoilRot) * Math.min(1, dt * 12);
        const sw = this.pending ? Math.sin(Math.min(1, this.switchT / 0.3) * Math.PI) : 0;
        const holder = this.models[this.current];
        const P = W.pos;
        holder.position.set(
            P[0] + Math.sin(this.bob) * 0.025 * bobAmt + this.sway.x,
            P[1] - Math.abs(Math.cos(this.bob)) * 0.02 * bobAmt + this.sway.y - sw * 0.35 - p.landDip * 0.05,
            P[2] + this.recoil,
        );
        holder.rotation.set(this.recoilRot, -this.sway.x * 2, -this.sway.x * 1.5);

        this.flashT -= dt;
        this.flash.visible = this.flashT > 0;
        this.flashLight.intensity = this.flashT > 0 ? 8 : 0;
        if (this.flash.visible) {
            this.flash.position.copy(this.muzzles[this.current]).applyEuler(holder.rotation).add(holder.position);
            this.flashLight.position.copy(this.flash.position);
        }
    }

    // ponto do cano no mundo (aproximação: posição da arma na câmera transformada pelo olhar)
    muzzleWorld(out) {
        const g = this.game, holder = this.models[this.current];
        out.copy(this.muzzles[this.current]).add(holder.position);
        out.applyQuaternion(g.camera.quaternion).add(g.camera.position);
        return out;
    }

    fire(W) {
        const g = this.game, p = g.player, cam = g.camera;
        if (W.ammo) {
            this.tick++;
            if (!W.costEvery || this.tick % W.costEvery === 0) p.ammo[W.ammo] -= W.cost || 1;
        }
        g.stats.shots++;
        sfx.shot(+Object.keys(WEAPONS).find(k => WEAPONS[k] === W));
        this.recoil = W.back;
        this.recoilRot = W.kick * 4;
        p.kick(W.kick);
        this.flashT = W.key === 'lightning' ? 0.06 : 0.05;
        this.flash.material.rotation = Math.random() * Math.PI;
        this.flash.scale.setScalar(W.key === 'shotgun' ? 0.22 : 0.14);
        g.fx.flash(cam.position, W.flash, W.key === 'shotgun' ? 25 : 12, 0.06);

        cam.getWorldDirection(_d);
        _o.copy(cam.position);
        const muzzle = this.muzzleWorld(_q);

        if (W.projectile) {
            // nasce um pouco à frente para não colidir com a própria parede encostada
            const start = _p.copy(_o).addScaledVector(_d, 0.6);
            g.projectiles.fire(start, _d, { speed: W.speed, dmg: W.dmg, splash: W.splash, radius: W.radius, owner: 'player', kind: 'plasma' });
            return;
        }
        if (W.key === 'lightning') return this.fireLightning(W, _o, _d, muzzle);

        const right = _p.set(1, 0, 0).applyQuaternion(cam.quaternion).clone();
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
        let anyHit = false, kill = false;
        for (let i = 0; i < (W.pellets || 1); i++) {
            const dir = _d.clone();
            if (W.spread) {
                const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * W.spread;
                dir.addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
            }
            const wallT = g.level.raycast(_o, dir, 200, _hit);
            const wallKind = _hit.kind, wallAxis = _hit.axis;
            if (W.pierce) {
                const hits = [];
                for (const e of g.enemies) { if (!e.vulnerable) continue; const h = e.rayHit(_o, dir, wallT); if (h) hits.push({ e, h }); }
                hits.sort((a, b) => a.h.t - b.h.t);
                for (const { e, h } of hits) {
                    const pt = _o.clone().addScaledVector(dir, h.t);
                    kill = e.damage(W.dmg * (h.head ? 1.5 : 1), { from: p.pos, head: h.head, kind: 'rail', point: pt }) || kill;
                    g.fx.bloodBurst(pt, dir, 20, 1.3);
                    anyHit = true;
                }
                const end = _o.clone().addScaledVector(dir, wallT);
                g.fx.beam(muzzle, end, 'rail', 0.14, 0.45);
                for (let k = 0; k < 40; k++) { const t = Math.random(); g.fx.trail(_p.lerpVectors(muzzle, end, t), [0.7, 0.3, 1], 0.12); }
                if (wallKind !== 'none') g.fx.sparks(end, this.normalOf(wallAxis, dir), [0.8, 0.4, 1], 14);
                continue;
            }
            let best = null;
            for (const e of g.enemies) {
                if (!e.vulnerable) continue;
                const h = e.rayHit(_o, dir, best ? best.h.t : wallT);
                if (h) best = { e, h };
            }
            if (best) {
                const pt = _o.clone().addScaledVector(dir, best.h.t);
                const dmg = W.dmg * (best.h.head ? 1.5 : 1);
                kill = best.e.damage(dmg, { from: p.pos, head: best.h.head, kind: W.key === 'shotgun' ? 'shotgun' : 'bullet', point: pt }) || kill;
                if (W.push && best.e.alive) best.e.vel.addScaledVector(_p.copy(dir).setY(0).normalize(), W.push / W.pellets);
                g.fx.bloodBurst(pt, _p.copy(dir).negate(), 6, best.e.T.boss ? 1.5 : 0.8);
                if (i === 0 || Math.random() < 0.4) g.fx.beam(muzzle, pt, 'bullet', 0.03, 0.05);
                anyHit = true;
            } else {
                const end = _o.clone().addScaledVector(dir, Math.min(wallT, 120));
                if (i === 0 || Math.random() < 0.4) g.fx.beam(muzzle, end, 'bullet', 0.03, 0.05);
                if (wallKind !== 'none') g.fx.sparks(end, this.normalOf(wallAxis, dir), [1, 0.75, 0.35], W.pellets > 1 ? 3 : 7);
            }
        }
        if (anyHit) { g.stats.hits++; g.hud.hitmarker(kill); sfx.hitmarker(kill); }
    }

    fireLightning(W, o, d, muzzle) {
        const g = this.game, p = g.player;
        // alvo: inimigo visível mais alinhado com a mira; depois salta para os vizinhos
        let target = null, bestScore = 0.9;
        for (const e of g.enemies) {
            if (!e.vulnerable) continue;
            _p.copy(e.headPos).lerp(e.pos, 0.4).sub(o);
            const dist = _p.length();
            if (dist > W.range) continue;
            const dot = _p.divideScalar(dist).dot(d);
            if (dot > bestScore && g.level.lineOfSight(o, e.headPos)) { bestScore = dot; target = e; }
        }
        if (!target) {
            const wallT = g.level.raycast(o, d, W.range);
            g.fx.lightning(muzzle, _p.copy(o).addScaledVector(d, wallT));
            return;
        }
        let from = muzzle.clone(), cur = target, kill = false;
        const done = new Set();
        for (let i = 0; i < W.chain && cur; i++) {
            done.add(cur);
            const pt = cur.headPos.clone().lerp(cur.pos, 0.45);
            g.fx.lightning(from, pt);
            kill = cur.damage(W.dmg * (i === 0 ? 1 : 0.7), { from: p.pos, kind: 'bullet', point: pt }) || kill;
            from = pt;
            let next = null, nd = 9;
            for (const e of g.enemies) {
                if (!e.vulnerable || done.has(e)) continue;
                const dd = e.pos.distanceTo(cur.pos);
                if (dd < nd) { nd = dd; next = e; }
            }
            cur = next;
        }
        g.stats.hits++;
        g.hud.hitmarker(kill);
    }

    normalOf(axis, dir) {
        if (axis === 0) return new THREE.Vector3(-Math.sign(dir.x), 0, 0);
        if (axis === 1) return new THREE.Vector3(0, 0, -Math.sign(dir.z));
        return new THREE.Vector3(0, 1, 0);
    }
}
