// Jogador: movimento rápido estilo Doom (strafe, pulo, dash), vida/armadura e câmera com recuo e tremor
import * as THREE from 'three/webgpu';
import { sfx } from '../engine/audio.js';
import { post } from '../engine/renderer.js';

const EYE = 1.7;
const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3();

export class Player {
    constructor(game) {
        this.game = game;
        this.pos = new THREE.Vector3();
        this.vel = new THREE.Vector3();
        this.eye = new THREE.Vector3();
        this.radius = 0.45;
        this.yaw = 0; this.pitch = 0;
        this.kickPitch = 0;
        this.reset();
    }

    reset() {
        this.hp = 100; this.armor = 0;
        this.ammo = { bullets: 60, shells: 0, cells: 0 };
        this.owned = new Set([1]);
        this.dashCharges = 2; this.dashT = 0; this.dashRecharge = 0;
        this.invuln = 0; this.dead = false; this.lavaT = 0; this.landDip = 0;
    }

    snapshot() { return { hp: Math.max(this.hp, 100), armor: this.armor, ammo: { ...this.ammo }, owned: [...this.owned] }; }
    restore(s) { this.hp = s.hp; this.armor = s.armor; this.ammo = { ...s.ammo }; this.owned = new Set(s.owned); this.dead = false; }

    spawn(p, yaw = Math.PI) {
        this.pos.copy(p).setY(0);
        this.vel.set(0, 0, 0);
        this.yaw = yaw; this.pitch = 0;
        this.onGround = true;
        this.updateEye();
    }

    updateEye() { this.eye.set(this.pos.x, this.pos.y + EYE, this.pos.z); }

    // distância de um ponto à cápsula do jogador
    distToPoint(p) {
        const y = Math.max(this.pos.y + 0.3, Math.min(p.y, this.pos.y + EYE));
        return Math.hypot(p.x - this.pos.x, p.y - y, p.z - this.pos.z) - this.radius;
    }

    kick(amount) { this.kickPitch += amount; }

    hurt(amount, from) {
        if (this.dead || this.invuln > 0 || this.game.godMode) return;
        const g = this.game;
        // armadura absorve metade do dano
        const absorbed = Math.min(this.armor, amount * 0.5);
        this.armor -= absorbed;
        amount -= absorbed;
        this.hp -= amount;
        g.stats.damageTaken += amount + absorbed;
        post.damage.value = Math.min(1, post.damage.value + 0.35 + amount * 0.02);
        g.fx.addShake(0.15 + amount * 0.012);
        sfx.hurt();
        if (from) g.hud.damageFrom(from, this);
        if (this.hp <= 0) { this.hp = 0; this.dead = true; g.onPlayerDeath(); }
        g.hud.vitals(this);
    }

    update(dt, input, level) {
        const g = this.game;
        // olhar
        this.yaw -= input.mouseDX * input.sensitivity;
        this.pitch -= input.mouseDY * input.sensitivity;
        this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));

        // intenção de movimento no plano
        _f.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
        _r.set(-_f.z, 0, _f.x);
        const k = input.keys;
        _v.set(0, 0, 0);
        if (k.has('KeyW')) _v.add(_f);
        if (k.has('KeyS')) _v.sub(_f);
        if (k.has('KeyD')) _v.add(_r);
        if (k.has('KeyA')) _v.sub(_r);
        const wish = _v.lengthSq() > 0 ? _v.normalize() : null;

        // dash (Shift): duas cargas que recarregam
        if ((input.pressed.has('ShiftLeft') || input.pressed.has('ShiftRight')) && this.dashCharges > 0) {
            const dir = wish ? wish.clone() : _f.clone();
            this.vel.x = dir.x * 24; this.vel.z = dir.z * 24;
            this.dashT = 0.17; this.dashCharges--;
            if (this.dashRecharge <= 0) this.dashRecharge = 1.3;
            sfx.dash();
            post.dash.value = 1;
        }
        if (this.dashRecharge > 0) {
            this.dashRecharge -= dt;
            if (this.dashRecharge <= 0 && this.dashCharges < 2) { this.dashCharges++; if (this.dashCharges < 2) this.dashRecharge = 1.3; }
        }

        const maxSpeed = 10.5;
        if (this.dashT > 0) {
            this.dashT -= dt;
        } else {
            const accel = this.onGround ? 80 : 25;
            if (wish) {
                const cur = this.vel.x * wish.x + this.vel.z * wish.z;
                const add = Math.max(0, Math.min(accel * dt, maxSpeed - cur));
                this.vel.x += wish.x * add; this.vel.z += wish.z * add;
            }
            // atrito forte no chão = parada rápida e controle preciso
            const fr = this.onGround ? (wish ? 6 : 12) : 0.5;
            const sp = Math.hypot(this.vel.x, this.vel.z);
            if (sp > 0) {
                const drop = sp * fr * dt;
                const ns = Math.max(0, sp - drop);
                this.vel.x *= ns / sp; this.vel.z *= ns / sp;
            }
        }

        // pulo e gravidade
        if (k.has('Space') && this.onGround) { this.vel.y = 7.2; this.onGround = false; sfx.jump(); }
        this.vel.y -= 20 * dt;
        const wasAir = !this.onGround;
        this.pos.y += this.vel.y * dt;
        if (this.pos.y <= 0) {
            if (wasAir && this.vel.y < -6) { this.landDip = Math.min(1, -this.vel.y / 14); sfx.land(); }
            this.pos.y = 0; this.vel.y = 0; this.onGround = true;
        }
        this.landDip = Math.max(0, this.landDip - dt * 4);

        level.moveCircle(this.pos, this.vel.x * dt, this.vel.z * dt, this.radius);

        // lava / ácido
        if (this.onGround && level.isLava(this.pos.x, this.pos.z)) {
            this.lavaT -= dt;
            if (this.lavaT <= 0) { this.lavaT = 0.5; this.hurt(6 * g.diffDmg, null); }
        }

        this.invuln = Math.max(0, this.invuln - dt);
        this.updateEye();
        this.updateCamera(dt);
        post.damage.value = Math.max(0, post.damage.value - dt * 1.6);
        post.dash.value = Math.max(0, post.dash.value - dt * 4);
        post.heal.value = Math.max(0, post.heal.value - dt * 2);
        post.lowHealth.value = this.hp < 30 ? 1 : Math.max(0, post.lowHealth.value - dt);
    }

    updateCamera(dt) {
        const g = this.game, cam = g.camera;
        const speed = Math.hypot(this.vel.x, this.vel.z);
        this.bobT = (this.bobT || 0) + dt * speed * (this.onGround ? 1.15 : 0);
        const bob = this.onGround ? Math.sin(this.bobT) * 0.045 * Math.min(1, speed / 10) : 0;
        this.kickPitch += (0 - this.kickPitch) * Math.min(1, dt * 10);
        const s = g.fx.shake;
        const sx = (Math.random() - 0.5) * s * 0.06, sy = (Math.random() - 0.5) * s * 0.06;
        cam.position.set(this.pos.x, this.pos.y + EYE + bob - this.landDip * 0.15, this.pos.z);
        cam.rotation.set(this.pitch + this.kickPitch + sy, this.yaw + sx, 0, 'YXZ');
        // FOV aumenta no dash e em alta velocidade
        const targetFov = 82 + Math.min(10, Math.max(0, speed - 10) * 0.8);
        cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 8);
        cam.updateProjectionMatrix();
    }
}
