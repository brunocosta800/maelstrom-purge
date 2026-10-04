// Efeitos visuais: partículas (GPU), traçantes, raios, explosões, luzes de impacto e tremor de câmera
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GPUParticles, beamMaterial, shockwaveMaterial } from '../shaders/entities.js';
import { gameTime } from '../shaders/world.js';

const R = Math.random;
const _v = new THREE.Vector3();

// Feixe = dois planos cruzados ao longo de +Z (visível de qualquer ângulo)
function beamGeometry() {
    const a = new THREE.PlaneGeometry(1, 1);
    a.rotateX(-Math.PI / 2); a.translate(0, 0, 0.5);
    const b = a.clone(); b.rotateZ(Math.PI / 2);
    return mergeGeometries([a, b]);
}

export class Effects {
    constructor(scene) {
        this.scene = scene;
        this.blood = new GPUParticles(scene, 5000, false);
        this.glow = new GPUParticles(scene, 6000, true);
        this.shake = 0;
        this.beams = [];
        const geo = beamGeometry();
        const mats = {
            bullet: beamMaterial(0xffc861), rail: beamMaterial(0xb04dff), lightning: beamMaterial(0x7fd8ff),
            plasma: beamMaterial(0x40e0ff),
        };
        for (const [kind, mat] of Object.entries(mats)) {
            for (let i = 0; i < (kind === 'lightning' ? 40 : 24); i++) {
                const m = new THREE.Mesh(geo, mat);
                m.visible = false; m.frustumCulled = false; m.renderOrder = 4;
                m.userData = { kind, life: 0, max: 1, fade: 1, width: 0.05 };
                scene.add(m);
                this.beams.push(m);
            }
        }
        // luzes fixas (quantidade constante evita recompilar shaders quando algo explode)
        this.lights = [new THREE.PointLight(0xff7733, 0, 22, 1.6), new THREE.PointLight(0xff7733, 0, 22, 1.6)];
        this.lights.forEach(l => { l.userData.life = 0; scene.add(l); });
        this.lightIdx = 0;
        // ondas de choque (chefe)
        const sg = new THREE.PlaneGeometry(2, 2); sg.rotateX(-Math.PI / 2);
        const sm = shockwaveMaterial();
        this.rings = [0, 1].map(() => { const m = new THREE.Mesh(sg, sm); m.visible = false; m.position.y = 0.15; m.renderOrder = 5; scene.add(m); return m; });
    }

    get t() { return gameTime.value; }

    flash(pos, color = 0xff7733, intensity = 60, life = 0.25) {
        const l = this.lights[this.lightIdx++ % this.lights.length];
        l.position.copy(pos); l.color.setHex(color); l.intensity = intensity;
        l.userData.life = life; l.userData.max = life; l.userData.peak = intensity;
    }

    bloodBurst(pos, dir, n = 18, scale = 1, color = [0.55, 0.0, 0.03]) {
        for (let i = 0; i < n; i++) {
            const s = (3 + R() * 6) * scale;
            this.blood.emit(this.t, pos.x, pos.y, pos.z,
                dir.x * s + (R() - 0.5) * 5 * scale, dir.y * s + R() * 5 * scale, dir.z * s + (R() - 0.5) * 5 * scale,
                0.6 + R() * 0.8, color[0] * (0.7 + R() * 0.5), color[1], color[2], (0.06 + R() * 0.1) * scale, 16, 1.6, 1, 0.6);
        }
        // névoa
        for (let i = 0; i < 4; i++) {
            this.blood.emit(this.t, pos.x, pos.y, pos.z, (R() - 0.5) * 1.5, R() * 1.5, (R() - 0.5) * 1.5,
                0.4, color[0] * 0.8, 0, 0.02, 0.15 * scale, 0, 2.2, 0, 2.0);
        }
    }

    gibs(pos, scale = 1) {
        this.bloodBurst(pos, _v.set(0, 1, 0), 40, 1.4 * scale);
        for (let i = 0; i < 10; i++) {
            this.blood.emit(this.t, pos.x, pos.y, pos.z, (R() - 0.5) * 9, 4 + R() * 6, (R() - 0.5) * 9,
                1.6, 0.35, 0.02, 0.03, 0.22 * scale, 18, 0.9, 1, 0.3);
        }
    }

    sparks(pos, normal, color = [1, 0.7, 0.3], n = 8) {
        for (let i = 0; i < n; i++) {
            const s = 3 + R() * 7;
            this.glow.emit(this.t, pos.x, pos.y, pos.z,
                normal.x * s + (R() - 0.5) * 6, normal.y * s + (R() - 0.2) * 6, normal.z * s + (R() - 0.5) * 6,
                0.2 + R() * 0.3, color[0], color[1], color[2], 0.04 + R() * 0.04, 14, 0.3, 0, 1.5);
        }
        this.glow.emit(this.t, pos.x, pos.y, pos.z, 0, 0, 0, 0.08, color[0], color[1], color[2], 0.5, 0, 0.2);
        this.blood.emit(this.t, pos.x, pos.y, pos.z, normal.x * 0.6, 0.6, normal.z * 0.6, 0.8, 0.12, 0.12, 0.12, 0.25, 0, 2.5, 0, 1); // fumaça
    }

    explosion(pos, radius = 3.5, color = [0.3, 0.9, 1.0], big = false) {
        const n = big ? 90 : Math.round(16 + radius * 10);
        for (let i = 0; i < n; i++) {
            _v.set(R() - 0.5, R() - 0.3, R() - 0.5).normalize().multiplyScalar(radius * (2 + R() * 4));
            this.glow.emit(this.t, pos.x, pos.y, pos.z, _v.x, _v.y, _v.z, 0.35 + R() * 0.4,
                color[0], color[1], color[2], 0.06 + R() * 0.12, 4, 0.2, 0, 3);
        }
        this.glow.emit(this.t, pos.x, pos.y, pos.z, 0, 0, 0, 0.15, 1, 0.9, 0.8, radius * 0.6, 0, 1.6);
        for (let i = 0; i < (big ? 10 : 3); i++) {
            this.blood.emit(this.t, pos.x, pos.y, pos.z, (R() - 0.5) * 3, R() * 2.5, (R() - 0.5) * 3, 1.2,
                0.06, 0.06, 0.07, (0.25 + R() * 0.3) * radius * 0.5, -1, 2.2, 0, 1.2);
        }
        const hex = new THREE.Color(color[0], color[1], color[2]).getHex();
        this.flash(pos, hex, big ? 220 : 120, 0.35);
        this.addShake(big ? 0.6 : 0.25);
    }

    trail(pos, color, size = 0.25) {
        this.glow.emit(this.t, pos.x, pos.y, pos.z, (R() - 0.5) * 0.8, (R() - 0.5) * 0.8 + 0.4, (R() - 0.5) * 0.8,
            0.25 + R() * 0.15, color[0], color[1], color[2], size, 0, 0.1, 0, 1);
    }

    spawnColumn(pos, color = [1, 0.25, 0.1]) {
        for (let i = 0; i < 50; i++) {
            const a = R() * Math.PI * 2, r = 0.6 + R() * 0.6;
            this.glow.emit(this.t + R() * 0.5, pos.x + Math.cos(a) * r, 0.1, pos.z + Math.sin(a) * r,
                -Math.cos(a) * 0.6, 3 + R() * 4, -Math.sin(a) * 0.6, 0.7, color[0], color[1], color[2], 0.1, 0, 0.2, 0, 0.5);
        }
        this.flash(_v.copy(pos).setY(1.5), new THREE.Color(...color).getHex(), 50, 0.6);
    }

    beam(from, to, kind, width = 0.05, life = 0.06) {
        const m = this.beams.find(b => !b.visible && b.userData.kind === kind);
        if (!m) return;
        m.visible = true;
        m.position.copy(from);
        m.lookAt(to);
        const len = from.distanceTo(to);
        m.scale.set(width, width, len);
        m.userData.life = life; m.userData.max = life; m.userData.fade = 1; m.userData.width = width;
    }

    // raio em zigue-zague entre dois pontos
    lightning(from, to) {
        const segs = 6;
        let prev = from.clone();
        const d = _v.subVectors(to, from);
        const len = d.length();
        for (let i = 1; i <= segs; i++) {
            const p = from.clone().addScaledVector(d, i / segs);
            if (i < segs) p.add(new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(len * 0.08));
            this.beam(prev, p, 'lightning', 0.07, 0.07);
            prev = p;
        }
        this.glow.emit(this.t, to.x, to.y, to.z, 0, 0, 0, 0.1, 0.5, 0.85, 1, 0.6, 0, 0.3);
    }

    shockwave(pos) {
        const m = this.rings.find(r => !r.visible) || this.rings[0];
        m.visible = true; m.position.x = pos.x; m.position.z = pos.z;
        m.userData = { k: 0, r: 0.5 };
        m.scale.setScalar(0.5);
        return m;
    }

    addShake(v) { this.shake = Math.min(1.2, this.shake + v); }

    update(dt) {
        for (const m of this.beams) {
            if (!m.visible) continue;
            m.userData.life -= dt;
            m.userData.fade = Math.max(0, m.userData.life / m.userData.max);
            const w = m.userData.width * (0.4 + 0.6 * m.userData.fade);
            m.scale.x = w; m.scale.y = w;
            if (m.userData.life <= 0) m.visible = false;
        }
        for (const l of this.lights) {
            if (l.userData.life > 0) {
                l.userData.life -= dt;
                l.intensity = l.userData.peak * Math.max(0, l.userData.life / l.userData.max);
            } else l.intensity = 0;
        }
        this.shake = Math.max(0, this.shake - dt * 2.2);
        this.blood.flush();
        this.glow.flush();
    }

    clear() {
        this.blood.clear(); this.glow.clear();
        this.beams.forEach(b => { b.visible = false; });
        this.rings.forEach(r => { r.visible = false; });
        this.lights.forEach(l => { l.intensity = 0; l.userData.life = 0; });
        this.shake = 0;
    }
}
