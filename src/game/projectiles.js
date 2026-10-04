// Projéteis visíveis e desviáveis: bolas de fogo dos imps e plasma do jogador
import * as THREE from 'three/webgpu';
import { orbMaterial } from '../shaders/entities.js';
import { sfx } from '../engine/audio.js';

const KINDS = {
    fire: { core: 0xffe9a0, rim: 0xff3a00, size: 0.55, trail: [1, 0.35, 0.05] },
    void: { core: 0xffd0ff, rim: 0x8a00ff, size: 0.6, trail: [0.6, 0.1, 1] },
    plasma: { core: 0xe0ffff, rim: 0x00a0ff, size: 0.45, trail: [0.2, 0.8, 1] },
};
const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _hit = {};

export class Projectiles {
    constructor(game) {
        this.game = game;
        this.list = [];
        this.mats = {};
        for (const [k, v] of Object.entries(KINDS)) this.mats[k] = orbMaterial(v.core, v.rim);
    }

    fire(from, dir, { speed, dmg, owner, kind, splash = 0, radius = 0, big = false }) {
        const K = KINDS[kind];
        const s = new THREE.Sprite(this.mats[kind]);
        const size = K.size * (big ? 1.5 : 1);
        s.scale.setScalar(size);
        s.position.copy(from);
        s.renderOrder = 6;
        this.game.scene.add(s);
        this.list.push({ s, vel: dir.clone().multiplyScalar(speed), dmg, owner, kind, splash, radius, size, life: 6, K, big });
    }

    update(dt) {
        const g = this.game, p = g.player;
        for (let i = this.list.length - 1; i >= 0; i--) {
            const pr = this.list[i];
            pr.life -= dt;
            const pos = pr.s.position;
            const stepLen = pr.vel.length() * dt;
            _d.copy(pr.vel).normalize();
            let impact = null;

            // parede / chão neste passo
            const tWall = g.level.raycast(pos, _d, stepLen + 0.01, _hit);
            if (tWall <= stepLen) impact = { t: tWall, wall: true };

            if (pr.owner === 'enemy') {
                // segmento × cápsula do jogador
                _v.copy(pos).addScaledVector(_d, impact ? impact.t : stepLen);
                const dPlayer = p.distToPoint(_v) - pr.size * 0.4;
                if (dPlayer < 0) impact = { t: impact ? impact.t : stepLen, player: true };
            } else {
                let best = null;
                for (const e of g.enemies) {
                    if (!e.vulnerable) continue;
                    const h = e.rayHit(pos, _d, (impact ? impact.t : stepLen) + pr.size * 0.4);
                    if (h && (!best || h.t < best.t)) best = { t: h.t, enemy: e, head: h.head };
                }
                if (best) impact = best;
            }

            if (impact) {
                pos.addScaledVector(_d, impact.t);
                this.explode(pr, impact);
                g.scene.remove(pr.s);
                this.list.splice(i, 1);
                continue;
            }
            pos.addScaledVector(_d, stepLen);
            // rastro
            for (let k = 0; k < 2; k++) g.fx.trail(pos, pr.K.trail, Math.min(0.28, pr.size * 0.4));
            pr.s.material.rotation = 0;
            if (pr.life <= 0) { g.scene.remove(pr.s); this.list.splice(i, 1); }
        }
    }

    explode(pr, impact) {
        const g = this.game, pos = pr.s.position;
        if (pr.owner === 'enemy') {
            if (impact.player) g.player.hurt(pr.dmg, pos);
            g.fx.explosion(pos, pr.big ? 1.6 : 1.0, pr.K.trail, false);
            g.fx.shake = Math.max(g.fx.shake, impact.player ? 0.35 : 0.1);
            sfx.explosion(false);
        } else {
            // plasma: dano direto + dano em área com queda linear
            if (impact.enemy) impact.enemy.damage(pr.dmg, { from: g.player.pos, kind: 'explosion', point: pos });
            for (const e of g.enemies) {
                if (!e.vulnerable) continue;
                const d = e.distTo(pos);
                if (d < pr.radius) e.damage(pr.splash * (1 - d / pr.radius), { from: pos, kind: 'explosion' });
            }
            g.fx.explosion(pos, pr.radius * 0.6, pr.K.trail, false);
            sfx.explosion(false);
            g.stats.hits++;
        }
    }

    clear() {
        for (const pr of this.list) this.game.scene.remove(pr.s);
        this.list.length = 0;
    }
}
