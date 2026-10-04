// Mapa em grade: geometria, colisão, raycast (DDA 3D) e campo de fluxo (BFS) para a IA.
import * as THREE from 'three/webgpu';
import { wallMaterial, floorMaterial, lavaMaterial, neonTotemMaterial, crateMaterial } from '../shaders/world.js';

export const CELL = 4;
export const WALL_H = 6;
// Tipo de cada célula. Antes o tipo era deduzido da altura (h === 2.2), mas o Float32Array guarda
// 2.2 como 2.200000047683716 e os caixotes nunca eram desenhados: viravam "paredes invisíveis".
const KIND = { FLOOR: 0, WALL: 1, TOTEM: 2, CRATE: 3 };
const KIND_OF = { '#': KIND.WALL, 'P': KIND.TOTEM, 'c': KIND.CRATE };
const HEIGHT_OF = [0, WALL_H, 8, 2.2];
const INSET_OF = [0, 0, CELL * 0.2, CELL * 0.05]; // totens e caixotes não ocupam a célula inteira

export class Level {
    constructor(def) {
        this.def = def;
        this.rows = def.map.length;
        this.cols = Math.max(...def.map.map(r => r.length));
        this.height = new Float32Array(this.rows * this.cols);
        this.lava = new Uint8Array(this.rows * this.cols);
        this.kind = new Uint8Array(this.rows * this.cols);
        this.flow = new Int16Array(this.rows * this.cols);
        this.flowFrom = -1;
        this.marks = { start: null, exit: null, spawns: [], items: [] };
        for (let r = 0; r < this.rows; r++) {
            const line = def.map[r];
            for (let c = 0; c < this.cols; c++) {
                const ch = line[c] || '#';
                const i = r * this.cols + c;
                if (KIND_OF[ch]) { this.kind[i] = KIND_OF[ch]; this.height[i] = HEIGHT_OF[KIND_OF[ch]]; }
                if (ch === 'L') this.lava[i] = 1;
                const p = this.cellCenter(c, r);
                if (ch === 'S') this.marks.start = p;
                else if (ch === 'X') this.marks.exit = p;
                else if (ch === 'o') this.marks.spawns.push(p);
                else if ('HARCB23456M'.includes(ch)) this.marks.items.push({ ch, pos: p });
            }
        }
        this.group = new THREE.Group();
    }

    cellCenter(c, r) {
        return new THREE.Vector3((c - this.cols / 2 + 0.5) * CELL, 0, (r - this.rows / 2 + 0.5) * CELL);
    }
    colOf(x) { return Math.floor(x / CELL + this.cols / 2); }
    rowOf(z) { return Math.floor(z / CELL + this.rows / 2); }
    idx(c, r) { return (c < 0 || r < 0 || c >= this.cols || r >= this.rows) ? -1 : r * this.cols + c; }
    heightAt(c, r) { const i = this.idx(c, r); return i < 0 ? WALL_H : this.height[i]; }
    solid(c, r) { return this.heightAt(c, r) > 0; }
    kindAt(c, r) { const i = this.idx(c, r); return i < 0 ? KIND.WALL : this.kind[i]; }
    isLava(x, z) { const i = this.idx(this.colOf(x), this.rowOf(z)); return i >= 0 && this.lava[i] === 1; }

    build(scene) {
        const wallM = wallMaterial(), totemM = neonTotemMaterial(), crateM = crateMaterial();
        const walls = [], totems = [], crates = [], lavas = [];
        for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
            const i = r * this.cols + c, k = this.kind[i];
            const p = this.cellCenter(c, r);
            if (k === KIND.WALL) {
                // só cria paredes com algum vizinho livre, inclusive na diagonal (as internas nunca aparecem)
                let open = false;
                for (let dr = -1; dr <= 1 && !open; dr++) for (let dc = -1; dc <= 1; dc++) { const j = this.idx(c + dc, r + dr); if (j >= 0 && this.height[j] === 0) { open = true; break; } }
                if (open) walls.push(p);
            } else if (k === KIND.TOTEM) totems.push(p);
            else if (k === KIND.CRATE) crates.push(p);
            if (this.lava[i]) lavas.push(p);
        }
        const inst = (geo, mat, list, y) => {
            if (!list.length) return;
            const im = new THREE.InstancedMesh(geo, mat, list.length);
            const m = new THREE.Matrix4();
            list.forEach((p, k) => { m.makeTranslation(p.x, y, p.z); im.setMatrixAt(k, m); });
            im.computeBoundingSphere();
            this.group.add(im);
        };
        inst(new THREE.BoxGeometry(CELL, WALL_H, CELL), wallM, walls, WALL_H / 2);
        inst(new THREE.BoxGeometry(CELL * 0.6, 8, CELL * 0.6), totemM, totems, 4);
        inst(new THREE.BoxGeometry(CELL * 0.9, 2.2, CELL * 0.9), crateM, crates, 1.1);
        if (lavas.length) {
            const lg = new THREE.PlaneGeometry(CELL, CELL); lg.rotateX(-Math.PI / 2);
            inst(lg, lavaMaterial(this.def.lavaHot ?? 0xff6a00, this.def.lavaDark ?? 0x2a0300), lavas, 0.03);
        }
        const fg = new THREE.PlaneGeometry(this.cols * CELL, this.rows * CELL);
        fg.rotateX(-Math.PI / 2);
        const floor = new THREE.Mesh(fg, floorMaterial());
        this.group.add(floor);
        scene.add(this.group);
    }

    dispose(scene) {
        scene.remove(this.group);
        this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    }

    // Move um círculo (x,z,raio) por (dx,dz) deslizando nas paredes. Retorna true se bateu.
    moveCircle(pos, dx, dz, rad, minH = 0) {
        let hit = false;
        pos.x += dx;
        if (this.overlaps(pos.x, pos.z, rad, minH, pos.y)) { pos.x -= dx; hit = true; this.slideAxis(pos, 'x', dx, rad, minH); }
        pos.z += dz;
        if (this.overlaps(pos.x, pos.z, rad, minH, pos.y)) { pos.z -= dz; hit = true; this.slideAxis(pos, 'z', dz, rad, minH); }
        return hit;
    }
    // aproxima até encostar (busca binária curta) para não parar "longe" da parede
    slideAxis(pos, axis, d, rad, minH) {
        let lo = 0, hi = d;
        for (let k = 0; k < 5; k++) {
            const mid = (lo + hi) / 2;
            pos[axis] += mid;
            const bad = this.overlaps(pos.x, pos.z, rad, minH, pos.y);
            pos[axis] -= mid;
            if (bad) hi = mid; else lo = mid;
        }
        pos[axis] += lo;
    }
    overlaps(x, z, rad, minH = 0, y = 0) {
        const c0 = this.colOf(x - rad), c1 = this.colOf(x + rad), r0 = this.rowOf(z - rad), r1 = this.rowOf(z + rad);
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
            const h = this.heightAt(c, r);
            if (h <= minH || h <= y + 0.05) continue;
            // teste círculo × quadrado
            const cx = (c - this.cols / 2) * CELL, cz = (r - this.rows / 2) * CELL;
            const shrink = INSET_OF[this.kindAt(c, r)];
            const nx = Math.max(cx + shrink, Math.min(x, cx + CELL - shrink));
            const nz = Math.max(cz + shrink, Math.min(z, cz + CELL - shrink));
            if ((x - nx) ** 2 + (z - nz) ** 2 < rad * rad) return true;
        }
        return false;
    }

    // Raycast 3D por DDA na grade. Retorna a distância até a parede/chão (ou maxDist).
    raycast(o, d, maxDist = 200, out = null) {
        let c = this.colOf(o.x), r = this.rowOf(o.z);
        const stepC = d.x > 0 ? 1 : -1, stepR = d.z > 0 ? 1 : -1;
        const x0 = (c - this.cols / 2) * CELL, z0 = (r - this.rows / 2) * CELL;
        const tdC = Math.abs(d.x) > 1e-6 ? CELL / Math.abs(d.x) : Infinity;
        const tdR = Math.abs(d.z) > 1e-6 ? CELL / Math.abs(d.z) : Infinity;
        let tmC = Math.abs(d.x) > 1e-6 ? ((d.x > 0 ? x0 + CELL - o.x : o.x - x0) / Math.abs(d.x)) : Infinity;
        let tmR = Math.abs(d.z) > 1e-6 ? ((d.z > 0 ? z0 + CELL - o.z : o.z - z0) / Math.abs(d.z)) : Infinity;
        const tFloor = d.y < -1e-6 ? -o.y / d.y : Infinity;
        let t = 0, axis = -1;
        for (let n = 0; n < 128 && t < maxDist; n++) {
            const h = this.heightAt(c, r);
            const tExit = Math.min(tmC, tmR);
            if (h > 0) {
                // pilares e caixotes ocupam só parte da célula
                const shrink = INSET_OF[this.kindAt(c, r)];
                const tIn = shrink ? this.boxEnter(o, d, c, r, shrink, t, tExit) : t;
                if (tIn !== null) {
                    const yIn = o.y + d.y * tIn;
                    if (yIn < h && yIn > -0.01) return this._res(out, tIn, axis, this.kindAt(c, r) === KIND.TOTEM ? 'totem' : 'wall');
                    if (d.y < 0 && yIn >= h) {
                        const tTop = (h - o.y) / d.y;
                        if (tTop <= tExit) return this._res(out, tTop, 2, 'top');
                    }
                }
            }
            if (tFloor <= tExit) return this._res(out, Math.min(tFloor, maxDist), 3, 'floor');
            if (tmC < tmR) { t = tmC; tmC += tdC; c += stepC; axis = 0; }
            else { t = tmR; tmR += tdR; r += stepR; axis = 1; }
            if (c < -1 || r < -1 || c > this.cols || r > this.rows) break;
        }
        return this._res(out, maxDist, -1, 'none');
    }
    boxEnter(o, d, c, r, s, t0, t1) {
        const minX = (c - this.cols / 2) * CELL + s, maxX = minX + CELL - 2 * s;
        const minZ = (r - this.rows / 2) * CELL + s, maxZ = minZ + CELL - 2 * s;
        let tn = t0, tf = t1;
        for (const [oo, dd, mn, mx] of [[o.x, d.x, minX, maxX], [o.z, d.z, minZ, maxZ]]) {
            if (Math.abs(dd) < 1e-8) { if (oo < mn || oo > mx) return null; continue; }
            let a = (mn - oo) / dd, b = (mx - oo) / dd;
            if (a > b) [a, b] = [b, a];
            tn = Math.max(tn, a); tf = Math.min(tf, b);
            if (tn > tf) return null;
        }
        return tn;
    }
    _res(out, t, axis, kind) {
        if (out) { out.t = t; out.axis = axis; out.kind = kind; }
        return t;
    }
    lineOfSight(a, b) {
        const d = new THREE.Vector3().subVectors(b, a);
        const len = d.length();
        d.divideScalar(len);
        return this.raycast(a, d, len) >= len - 0.05;
    }

    // BFS a partir da célula do jogador; cada célula guarda a distância (em passos) até ele
    updateFlow(px, pz) {
        const pc = this.colOf(px), pr = this.rowOf(pz);
        const start = this.idx(pc, pr);
        if (start < 0 || start === this.flowFrom) return;
        this.flowFrom = start;
        const f = this.flow; f.fill(-1);
        const q = new Int32Array(this.rows * this.cols);
        let qh = 0, qt = 0;
        q[qt++] = start; f[start] = 0;
        while (qh < qt) {
            const i = q[qh++], c = i % this.cols, r = (i / this.cols) | 0;
            for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
                if (!dc && !dr) continue;
                const j = this.idx(c + dc, r + dr);
                if (j < 0 || f[j] >= 0 || this.height[j] > 0) continue;
                if (dc && dr && (this.solid(c + dc, r) || this.solid(c, r + dr))) continue; // sem cortar quina
                f[j] = f[i] + 1;
                q[qt++] = j;
            }
        }
    }
    // direção sugerida pelo campo de fluxo a partir de (x,z)
    flowDir(x, z, out) {
        const c = this.colOf(x), r = this.rowOf(z), i = this.idx(c, r);
        if (i < 0 || this.flow[i] < 0) return null;
        let best = this.flow[i], bc = c, br = r;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
            const j = this.idx(c + dc, r + dr);
            if (j < 0 || this.flow[j] < 0) continue;
            if (dc && dr && (this.solid(c + dc, r) || this.solid(c, r + dr))) continue;
            if (this.flow[j] < best) { best = this.flow[j]; bc = c + dc; br = r + dr; }
        }
        const p = this.cellCenter(bc, br);
        out.set(p.x - x, 0, p.z - z);
        if (out.lengthSq() < 0.01) return null;
        return out.normalize();
    }
}
