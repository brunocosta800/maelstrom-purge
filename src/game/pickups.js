// Itens coletáveis: vida, armadura, munição, armas e "orbes" que os inimigos derrubam
import * as THREE from 'three/webgpu';
import { haloMaterial } from '../shaders/entities.js';
import { assets } from './assets.js';
import { sfx } from '../engine/audio.js';

export const ITEM = {
    H: { kind: 'health', amount: 25, color: 0x20ff60, label: '+25 VIDA' },
    M: { kind: 'mega', amount: 100, color: 0x40a0ff, label: 'MEGAVIDA!' },
    R: { kind: 'armor', amount: 50, color: 0x3080ff, label: '+50 ARMADURA' },
    A: { kind: 'bullets', amount: 60, color: 0xffd040, label: '+60 BALAS' },
    B: { kind: 'shells', amount: 12, color: 0xff8030, label: '+12 CARTUCHOS' },
    C: { kind: 'cells', amount: 50, color: 0x40ffff, label: '+50 CÉLULAS' },
    orbH: { kind: 'health', amount: 6, color: 0x20ff60, small: true, label: null },
    orbA: { kind: 'ammoMix', amount: 1, color: 0xffd040, small: true, label: null },
    orbR: { kind: 'armor', amount: 5, color: 0x3080ff, small: true, label: null },
};
const GUN_KEY = { 2: 'shotgun', 3: 'rifle', 4: 'plasma', 5: 'rail', 6: 'lightning' };

const shared = {};
function mats(color) {
    if (!shared[color]) {
        shared[color] = {
            body: new THREE.MeshStandardNodeMaterial({ color: 0x111111, emissive: color, emissiveIntensity: 2.2, roughness: 0.3, metalness: 0.5 }),
            halo: haloMaterial(color),
        };
    }
    return shared[color];
}

function buildMesh(def, ch) {
    const g = new THREE.Group();
    const m = mats(def.color);
    if (def.small) {
        g.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.16), m.body));
    } else if (def.kind === 'health' || def.kind === 'mega') {
        const s = def.kind === 'mega' ? 1.4 : 1;
        g.add(new THREE.Mesh(new THREE.BoxGeometry(0.5 * s, 0.16 * s, 0.16 * s), m.body));
        g.add(new THREE.Mesh(new THREE.BoxGeometry(0.16 * s, 0.5 * s, 0.16 * s), m.body));
    } else if (def.kind === 'armor') {
        g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), m.body));
    } else if (def.kind === 'weapon') {
        const gun = assets.guns[GUN_KEY[ch]];
        if (gun) {
            const c = gun.clone();
            const box = new THREE.Box3().setFromObject(c);
            const sz = box.getSize(new THREE.Vector3());
            c.scale.multiplyScalar(0.8 / Math.max(sz.x, sz.y, sz.z));
            c.rotation.y = Math.PI / 2;
            g.add(c);
        }
    } else {
        g.add(new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.3, 0.3), m.body));
    }
    const halo = new THREE.Sprite(m.halo);
    halo.scale.setScalar(def.small ? 0.9 : 1.8);
    g.add(halo);
    return g;
}

export class Pickups {
    constructor(game) { this.game = game; this.list = []; }

    add(ch, pos, { drop = false } = {}) {
        let def = ITEM[ch];
        if (!def && GUN_KEY[ch]) def = { kind: 'weapon', weapon: +ch, color: 0xff9a30, label: null };
        if (!def) return;
        const mesh = buildMesh(def, ch);
        mesh.position.copy(pos).setY(drop ? 0.8 : 1.0);
        this.game.scene.add(mesh);
        const it = { def, ch, mesh, base: mesh.position.y, phase: Math.random() * 6, vel: new THREE.Vector3(), drop, life: drop ? 20 : Infinity };
        if (drop) it.vel.set((Math.random() - 0.5) * 4, 3 + Math.random() * 2, (Math.random() - 0.5) * 4);
        this.list.push(it);
    }

    update(dt, time) {
        const p = this.game.player;
        for (let i = this.list.length - 1; i >= 0; i--) {
            const it = this.list[i], m = it.mesh;
            it.life -= dt;
            if (it.drop) {
                // orbes saltam e depois são atraídos pelo jogador
                const d = m.position.distanceTo(p.eye);
                // só atrai se o jogador puder usar (senão o orbe grudava na câmera com a vida cheia)
                if (d < 5 && it.life < 19.6 && this.game.canCollect(it.def)) {
                    const pull = m.position.clone().sub(p.eye).normalize().multiplyScalar(-Math.min(30, 60 / Math.max(d, 0.5)) * dt);
                    m.position.add(pull);
                } else {
                    it.vel.y -= 14 * dt;
                    m.position.addScaledVector(it.vel, dt);
                    if (m.position.y < 0.4) { m.position.y = 0.4; it.vel.set(0, 0, 0); }
                }
            } else {
                m.position.y = it.base + Math.sin(time * 2.2 + it.phase) * 0.15;
            }
            m.rotation.y += dt * 1.8;
            const dist = Math.hypot(m.position.x - p.pos.x, m.position.z - p.pos.z);
            const close = it.drop ? (m.position.distanceTo(p.eye) < 1.0 || dist < 1.2) : (dist < 1.4 && p.pos.y < 1.6);
            if (close && this.game.collect(it)) {
                this.game.scene.remove(m);
                this.list.splice(i, 1);
                continue;
            }
            if (it.life <= 0) { this.game.scene.remove(m); this.list.splice(i, 1); }
        }
    }

    clear() { for (const it of this.list) this.game.scene.remove(it.mesh); this.list.length = 0; }
}

export { GUN_KEY };
export function pickupSound(def) { sfx.pickup(def.kind === 'health' || def.kind === 'mega' ? 'health' : def.kind === 'armor' ? 'armor' : def.kind === 'weapon' ? 'weapon' : 'ammo'); }
