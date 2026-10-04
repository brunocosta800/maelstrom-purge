// Inimigos: tipos, IA (campo de fluxo + linha de visão), ataques, atordoamento/execução e animação procedural
import * as THREE from 'three/webgpu';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { Rig, BONES_UE, BONES_MIXAMO, poseHumanoid } from './rig.js';
import { enemyMaterial } from '../shaders/entities.js';
import { assets, firstMaterial } from './assets.js';
import { sfx } from '../engine/audio.js';

export const TYPES = {
    zumbi: {
        model: 'zombie', bones: BONES_MIXAMO, height: 1.85, hp: 80, speed: 2.9, radius: 0.45,
        melee: { dmg: 12, range: 1.9, cd: 1.3, windup: 0.45 }, pain: 0.5, walkRate: 5.5, armDown: 0.05, armsForward: 1.4, lean: 0.25,
        drop: 0.35, score: 100,
    },
    puglin: {
        model: 'puglin', bones: BONES_UE, height: 1.2, hp: 45, speed: 7.4, radius: 0.4,
        melee: { dmg: 7, range: 1.7, cd: 0.85, windup: 0.22, lunge: 10 }, pain: 0.7, walkRate: 15, armDown: 1.25, lean: 0.45,
        drop: 0.3, score: 80,
    },
    imp: {
        model: 'imp', bones: BONES_UE, height: 2.05, hp: 140, speed: 4.4, radius: 0.5,
        melee: { dmg: 16, range: 2.1, cd: 1.4, windup: 0.4 },
        ranged: { dmg: 12, speed: 17, cd: [1.8, 3.2], windup: 0.55, count: 1, spread: 0, range: 34 },
        keepAway: 8, pain: 0.45, walkRate: 8, armDown: 1.2, lean: 0.15, drop: 0.5, score: 200,
    },
    impElite: {
        model: 'imp', skin: 2, bones: BONES_UE, height: 2.45, hp: 320, speed: 4.9, radius: 0.6,
        glow: 0xa020ff, edge: 0xb040ff, tint: 0xffd0ff,
        melee: { dmg: 22, range: 2.4, cd: 1.3, windup: 0.4 },
        ranged: { dmg: 14, speed: 20, cd: [1.5, 2.6], windup: 0.5, count: 3, spread: 0.16, range: 38, color: 'void' },
        keepAway: 10, pain: 0.2, walkRate: 7.5, armDown: 1.2, lean: 0.1, drop: 1, score: 500,
    },
    boss: {
        model: 'imp', skin: 1, bones: BONES_UE, height: 6.2, hp: 3300, speed: 3.6, radius: 1.5,
        glow: 0xff3300, edge: 0xffaa00, tint: 0xffb0a0,
        melee: { dmg: 30, range: 4.2, cd: 1.8, windup: 0.6 },
        ranged: { dmg: 15, speed: 19, cd: [1.1, 2.0], windup: 0.6, count: 5, spread: 0.13, range: 60 },
        pain: 0, walkRate: 4.5, armDown: 1.2, lean: 0.1, boss: true, drop: 0, score: 5000,
    },
};

const DIFF = {
    facil: { hp: 0.8, dmg: 0.6, proj: 0.85 },
    normal: { hp: 1, dmg: 1, proj: 1 },
    pesadelo: { hp: 1.25, dmg: 1.5, proj: 1.2 },
};

const templates = {};

// Prepara materiais e medidas de cada tipo (uma vez, depois do carregamento)
export function prepareEnemyTemplates() {
    for (const [key, T] of Object.entries(TYPES)) {
        const src = assets[T.model];
        const base = firstMaterial(src);
        src.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(src);
        const modelH = box.max.y - box.min.y;
        let geoH = 1;
        src.traverse(o => { if (o.isSkinnedMesh && geoH === 1) { o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox; geoH = Math.max(b.max.y - b.min.y, b.max.z - b.min.z); } });
        const noiseScale = 11 / geoH; // ~11 "manchas" de ruído ao longo da altura do corpo, em qualquer escala
        let mats;
        if (T.model === 'zombie') {
            mats = assets.skins.zombie.map(map => enemyMaterial(base, { mapOverride: map, noiseScale, tint: 0xd8e0d0 }));
        } else {
            const skins = assets.skins[T.model];
            const map = T.skin ? skins[T.skin] : null;
            mats = [enemyMaterial(base, { mapOverride: map, noiseScale, glow: T.glow ?? 0xff2200, edge: T.edge ?? 0xff5500, tint: T.tint ?? 0xffffff, glowStrength: T.boss ? 6 : 3 })];
        }
        templates[key] = { src, mats, scale: T.height / modelH };
    }
}

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3(), _f = new THREE.Vector3();

export class Enemy {
    constructor(game, typeKey, pos) {
        const T = TYPES[typeKey], tpl = templates[typeKey];
        const diff = DIFF[game.difficulty];
        this.game = game;
        this.type = typeKey;
        this.T = T;
        this.diff = diff;
        this.maxHp = this.hp = Math.round(T.hp * diff.hp);
        this.radius = T.radius;
        this.model = SkeletonUtils.clone(tpl.src);
        const mat = tpl.mats[Math.floor(Math.random() * tpl.mats.length)];
        this.meshes = [];
        this.model.traverse(o => {
            if (o.isMesh) {
                o.material = mat; o.frustumCulled = false; o.castShadow = false;
                o.userData = { hit: 0, dissolve: 1, stagger: 0 };
                this.meshes.push(o);
            }
        });
        this.model.scale.setScalar(tpl.scale);
        this.group = new THREE.Group();
        this.group.add(this.model);
        this.group.position.copy(pos);
        this.group.rotation.y = Math.random() * Math.PI * 2;
        game.scene.add(this.group);
        this.rig = new Rig(this.model, T.bones);
        this.head = this.rig.all[T.bones.head];
        this.hand = this.rig.all[T.model === 'zombie' ? 'RightHand' : 'hand_r'] || this.head;

        this.state = 'spawn';
        this.t = 0;              // tempo no estado
        this.walk = Math.random() * 10;
        this.vel = new THREE.Vector3();
        this.attackCd = 1 + Math.random();
        this.rangedCd = T.ranged ? T.ranged.cd[0] + Math.random() * 2 : 0;
        this.strafe = Math.random() < 0.5 ? 1 : -1;
        this.strafeT = 0;
        this.hitFlash = 0;
        this.headPos = new THREE.Vector3();
        this.alive = true;
        this.lastSeen = 0;
        this.slamCd = 6; this.summonCd = 12; this.phase = 1;
        this.yOff = 0;
        this.setFx('dissolve', 1);
        this.updateHead();
    }

    setFx(name, v) { for (const m of this.meshes) m.userData[name] = v; }

    get pos() { return this.group.position; }
    get vulnerable() { return this.alive && this.state !== 'spawn' && this.state !== 'dying'; }

    updateHead() {
        this.group.updateMatrixWorld(true);
        this.head.getWorldPosition(this.headPos);
        // cabeça do modelo fica abaixo do topo; sobe um pouco para o centro do crânio
        this.headPos.y += this.T.height * 0.04;
    }

    // Raio × (cilindro do corpo + esfera da cabeça). Retorna {t, head} ou null
    rayHit(o, d, maxT) {
        const hr = this.T.height * (this.T.boss ? 0.12 : 0.13);
        let best = null;
        // cabeça
        _v.subVectors(o, this.headPos);
        const b = _v.dot(d), c = _v.lengthSq() - hr * hr, disc = b * b - c;
        if (disc >= 0) { const t = -b - Math.sqrt(disc); if (t > 0 && t < maxT) best = { t, head: true }; }
        // corpo: cilindro vertical (só XZ), limitado em altura
        const r = this.radius, px = o.x - this.pos.x, pz = o.z - this.pos.z;
        const A = d.x * d.x + d.z * d.z, B = px * d.x + pz * d.z, C = px * px + pz * pz - r * r;
        const disc2 = B * B - A * C;
        if (A > 1e-8 && disc2 >= 0) {
            const t = (-B - Math.sqrt(disc2)) / A;
            const y = o.y + d.y * t - this.pos.y;
            const top = this.headPos.y - this.pos.y - hr * 0.5;
            if (t > 0 && t < maxT && y > 0 && y < top && (!best || t < best.t)) best = { t, head: false };
        }
        return best;
    }

    // distância de um ponto ao "corpo" (para explosões e projéteis)
    distTo(p) {
        const y = Math.max(this.pos.y, Math.min(p.y, this.headPos.y));
        return Math.max(0, Math.hypot(p.x - this.pos.x, y - p.y, p.z - this.pos.z) - this.radius);
    }

    damage(amount, { from = null, head = false, kind = 'bullet', point = null } = {}) {
        if (!this.vulnerable) return false;
        const g = this.game;
        if (this.state === 'stagger') amount *= 2;
        this.hp -= amount;
        this.hitFlash = 0.15;
        g.stats.damageDealt += amount;
        const pan = g.panOf(this.pos);
        if (this.hp <= 0) { this.die(kind); return true; }
        // atordoado: pronto para ser executado (estilo Doom Eternal)
        if (!this.T.boss && this.hp <= this.maxHp * 0.22 && this.state !== 'stagger') {
            this.enter('stagger');
            return false;
        }
        if (this.T.boss) {
            if (this.phase === 1 && this.hp < this.maxHp * 0.5) {
                this.phase = 2;
                g.hud.message('O ARQUIDEMÔNIO ESTÁ FURIOSO!', 'danger');
                sfx.growl('boss', 0);
                this.summonCd = 0.5;
            }
            return false;
        }
        if (this.state !== 'stagger' && Math.random() < this.T.pain * (amount / 25) && this.state !== 'pain') {
            this.enter('pain');
            sfx.enemyPain(this.type, pan);
            if (from) { _v.subVectors(this.pos, from).setY(0).normalize(); this.vel.addScaledVector(_v, Math.min(8, amount * 0.12)); }
        }
        return false;
    }

    die(kind) {
        const g = this.game;
        this.enter('dying');
        this.hp = 0;
        this.setFx('stagger', 0);
        g.onEnemyKilled(this, kind);
        sfx.enemyDeath(this.type, g.panOf(this.pos));
        _v.copy(this.pos).setY(this.T.height * 0.6);
        if (kind === 'explosion' || kind === 'execute' || kind === 'rail') g.fx.gibs(_v, this.T.boss ? 3 : 1);
        else g.fx.bloodBurst(_v, _w.set(0, 1, 0), 30, this.T.boss ? 3 : 1.2);
    }

    enter(s) { this.state = s; this.t = 0; }

    update(dt) {
        const g = this.game, T = this.T, p = g.player;
        this.t += dt;
        if (this.hitFlash > 0) { this.hitFlash -= dt; this.setFx('hit', Math.max(0, this.hitFlash / 0.15)); }

        const toP = _d.subVectors(p.pos, this.pos).setY(0);
        const dist = toP.length();
        toP.divideScalar(dist || 1);
        const eye = _v.copy(this.pos).setY(this.pos.y + T.height * 0.8);
        const canSee = (this._seeT = (this._seeT || 0) - dt) <= 0
            ? (this._seeT = 0.15, this._see = g.level.lineOfSight(eye, p.eye))
            : this._see;

        let moveSpeed = 0;
        let pose = { walk: this.walk, stride: 0, lean: T.lean, armDown: T.armDown, armsForward: T.armsForward ?? 0 };
        const faceTarget = Math.atan2(toP.x, toP.z);

        switch (this.state) {
            case 'spawn': {
                const k = Math.min(1, this.t / 0.9);
                this.setFx('dissolve', 1 - k);
                if (k >= 1) { this.enter('chase'); this.setFx('dissolve', 0); if (Math.random() < 0.5 || T.boss) sfx.growl(this.type, g.panOf(this.pos)); }
                this.turnTo(faceTarget, dt, 3);
                break;
            }
            case 'chase': {
                this.attackCd -= dt; this.rangedCd -= dt;
                if (T.boss) { this.slamCd -= dt; this.summonCd -= dt; }
                // corpo a corpo
                if (dist < T.melee.range + p.radius && this.attackCd <= 0 && canSee) { this.enter('melee'); break; }
                // chefe: pancada no chão e invocação
                if (T.boss && this.slamCd <= 0 && dist < 22) { this.enter('slam'); this.slamCd = this.phase === 2 ? 6 : 9; break; }
                if (T.boss && this.phase === 2 && this.summonCd <= 0) { this.enter('summon'); this.summonCd = 14; break; }
                // à distância
                if (T.ranged && canSee && this.rangedCd <= 0 && dist < T.ranged.range && dist > 3) { this.enter('ranged'); break; }

                const dir = this.steer(toP, dist, canSee, dt);
                moveSpeed = T.speed * (this.phase === 2 ? 1.25 : 1);
                if (T.keepAway && canSee && dist < T.keepAway) {
                    // imps mantêm distância e andam de lado
                    this.strafeT -= dt;
                    if (this.strafeT <= 0) { this.strafe *= -1; this.strafeT = 1 + Math.random() * 1.5; }
                    dir.set(-toP.z * this.strafe - toP.x * 0.6, 0, toP.x * this.strafe - toP.z * 0.6).normalize();
                    moveSpeed *= 0.8;
                }
                this.accelerate(dir, moveSpeed, dt, 10);
                this.turnTo(canSee ? faceTarget : Math.atan2(this.vel.x, this.vel.z), dt, 8);
                pose.stride = Math.min(1.2, this.vel.length() / T.speed);
                break;
            }
            case 'melee': {
                const m = T.melee;
                this.turnTo(faceTarget, dt, 10);
                this.accelerate(_f.set(0, 0, 0), 0, dt, 12);
                const k = this.t / m.windup;
                if (k < 1) {
                    pose.armR = pose.armL = -2.4 * k; pose.lean = T.lean - 0.2 * k;
                    if (m.lunge && this.t > m.windup * 0.6 && !this._lunged) { this._lunged = true; this.vel.addScaledVector(toP, m.lunge); }
                } else if (!this._struck) {
                    this._struck = true;
                    if (dist < m.range + p.radius + 0.4 && canSee) {
                        p.hurt(m.dmg * this.diff.dmg, this.pos);
                        sfx.melee();
                    }
                } else {
                    const k2 = Math.min(1, (this.t - m.windup) / 0.3);
                    pose.armR = pose.armL = -2.4 + 3.2 * k2; pose.lean = T.lean + 0.4 * k2;
                    if (this.t > m.windup + 0.35) { this.enter('chase'); this.attackCd = m.cd; this._struck = this._lunged = false; }
                }
                break;
            }
            case 'ranged': {
                const r = T.ranged;
                this.turnTo(faceTarget, dt, 10);
                this.accelerate(_f.set(0, 0, 0), 0, dt, 8);
                if (this.t < r.windup) {
                    const k = this.t / r.windup;
                    pose.armR = -2.8 * k; pose.elbowR = 0.2 + k; pose.lean = T.lean - 0.15 * k;
                    if (T.boss) pose.armL = -2.8 * k;
                    if (this.t < dt * 1.5) { sfx.fireball(g.panOf(this.pos)); }
                    // brasa na mão durante a preparação
                    if (Math.random() < 0.5) { this.hand.getWorldPosition(_w); g.fx.trail(_w, T.ranged.color === 'void' ? [0.6, 0.1, 1] : [1, 0.35, 0.05], T.boss ? 0.35 : 0.2); }
                } else if (!this._thrown) {
                    this._thrown = true;
                    this.hand.getWorldPosition(_w);
                    const n = r.count + (this.phase === 2 ? 2 : 0);
                    for (let i = 0; i < n; i++) {
                        const a = (i - (n - 1) / 2) * r.spread;
                        // mira com leve antecipação do movimento do jogador
                        const lead = Math.min(0.6, dist / (r.speed * this.diff.proj)) * 0.5;
                        _f.copy(p.eye).addScaledVector(p.vel, lead).setY(p.eye.y - 0.35).sub(_w).normalize();
                        _f.applyAxisAngle(THREE.Object3D.DEFAULT_UP, a);
                        g.projectiles.fire(_w, _f, { speed: r.speed * this.diff.proj, dmg: r.dmg * this.diff.dmg, owner: 'enemy', kind: r.color === 'void' ? 'void' : 'fire', big: T.boss });
                    }
                } else {
                    const k = Math.min(1, (this.t - r.windup) / 0.25);
                    pose.armR = -2.8 + 2.4 * k; pose.lean = T.lean + 0.2 * k;
                    if (T.boss) pose.armL = pose.armR;
                    if (this.t > r.windup + 0.35) { this.enter('chase'); this._thrown = false; this.rangedCd = r.cd[0] + Math.random() * (r.cd[1] - r.cd[0]); }
                }
                break;
            }
            case 'pain': {
                this.accelerate(_f.set(0, 0, 0), 0, dt, 6);
                pose.lean = -0.35; pose.headPitch = -0.3; pose.armL = 0.4; pose.armR = 0.3;
                if (this.t > 0.28) this.enter('chase');
                break;
            }
            case 'stagger': {
                this.accelerate(_f.set(0, 0, 0), 0, dt, 6);
                const s = Math.sin(this.t * 6);
                pose.lean = 0.6; pose.headRoll = s * 0.3; pose.armL = 0.3 + s * 0.2; pose.armR = 0.3 - s * 0.2; pose.crouch = 0.3;
                this.setFx('stagger', 1);
                if (this.t > 4) { this.setFx('stagger', 0); this.hp = Math.max(this.hp, this.maxHp * 0.3); this.enter('chase'); }
                break;
            }
            case 'slam': {
                // pula e cai criando uma onda de choque (pule para desviar!)
                this.accelerate(_f.set(0, 0, 0), 0, dt, 4);
                const up = 0.5, air = 0.6;
                if (this.t < up) { pose.crouch = this.t / up; pose.armL = pose.armR = -2.5 * (this.t / up); }
                else if (this.t < up + air) {
                    const k = (this.t - up) / air;
                    this.yOff = Math.sin(k * Math.PI) * 4;
                    pose.armL = pose.armR = -2.8; pose.crouch = 0;
                    this.vel.copy(toP).multiplyScalar(Math.min(dist, 14) / air * 0.6);
                } else if (!this._slammed) {
                    this._slammed = true; this.yOff = 0; this.vel.set(0, 0, 0);
                    g.bossSlam(this);
                } else {
                    pose.crouch = Math.max(0, 1 - (this.t - up - air) / 0.5); pose.armL = pose.armR = 0.8;
                    if (this.t > up + air + 0.6) { this.enter('chase'); this._slammed = false; }
                }
                break;
            }
            case 'summon': {
                this.accelerate(_f.set(0, 0, 0), 0, dt, 6);
                pose.armL = pose.armR = -3.0; pose.lean = -0.3; pose.headPitch = -0.5;
                if (this.t > 0.8 && !this._summoned) { this._summoned = true; g.summonMinions(this, 3); }
                if (this.t > 1.4) { this.enter('chase'); this._summoned = false; }
                break;
            }
            case 'dying': {
                this.accelerate(_f.set(0, 0, 0), 0, dt, 5);
                const k = Math.min(1, this.t / 0.55);
                this.model.rotation.x = -Math.PI / 2 * (1 - Math.pow(1 - k, 3));
                pose.armL = pose.armR = -1.2; pose.stride = 0;
                const dk = Math.max(0, (this.t - 0.6) / 1.0);
                this.setFx('dissolve', Math.min(1, dk));
                if (dk >= 1) this.remove();
                break;
            }
        }

        // integra movimento com colisão
        if (this.state !== 'spawn') {
            _w.copy(this.vel).multiplyScalar(dt);
            g.level.moveCircle(this.pos, _w.x, _w.z, this.radius);
            this.separate(dt);
        }
        this.pos.y = this.yOff;

        this.walk += dt * T.walkRate * Math.min(1.3, this.vel.length() / T.speed);
        pose.walk = this.walk;
        if (this.state === 'chase') pose.stride = Math.min(1.2, this.vel.length() / T.speed);
        poseHumanoid(this.rig, pose);
        this.updateHead();
    }

    steer(toP, dist, canSee, dt) {
        const g = this.game;
        if (canSee && dist < 7) return _f.copy(toP);
        const d = g.level.flowDir(this.pos.x, this.pos.z, _f);
        return d || _f.copy(toP);
    }

    accelerate(dir, speed, dt, accel) {
        _w.copy(dir).multiplyScalar(speed);
        const k = 1 - Math.exp(-accel * dt);
        this.vel.x += (_w.x - this.vel.x) * k;
        this.vel.z += (_w.z - this.vel.z) * k;
    }

    turnTo(target, dt, rate, face = null) {
        if (face !== null) target = face;
        let a = target - this.group.rotation.y;
        a = Math.atan2(Math.sin(a), Math.cos(a));
        this.group.rotation.y += a * Math.min(1, rate * dt);
    }

    // separação entre inimigos e do jogador (sem empilhar)
    separate(dt) {
        const g = this.game;
        for (const o of g.enemies) {
            if (o === this || !o.alive || o.state === 'dying') continue;
            const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z;
            const min = this.radius + o.radius;
            const d2 = dx * dx + dz * dz;
            if (d2 < min * min && d2 > 1e-6) {
                const d = Math.sqrt(d2), push = (min - d) * 0.5;
                g.level.moveCircle(this.pos, dx / d * push, dz / d * push, this.radius);
            }
        }
        const p = g.player;
        const dx = this.pos.x - p.pos.x, dz = this.pos.z - p.pos.z;
        const min = this.radius + p.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min && d2 > 1e-6) {
            const d = Math.sqrt(d2);
            g.level.moveCircle(this.pos, dx / d * (min - d), dz / d * (min - d), this.radius);
        }
    }

    remove() {
        this.alive = false;
        this.game.scene.remove(this.group);
    }
}
