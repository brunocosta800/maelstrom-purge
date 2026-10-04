// Investiga paredes invisíveis: compara colisão (grade) com o que é desenhado
export default async ({ page, sleep, shot, eval: ev }) => {
    await page.waitForFunction('window.__game && window.__game.state === "menu"', { timeout: 120000 });
    await page.click('#start-btn');
    await sleep(1000);
    for (let li = 0; li < 4; li++) {
        const info = await ev(async (li) => {
            const g = __game;
            g.godMode = true;
            g.levelIndex = li; g.loadLevel(li);
            g.level.def.waves.forEach(w => w.length = 0);
            g.waveDelay = 1e9;
            const L = g.level;
            // 1) células sólidas sem malha desenhada que encostam (8 vizinhos) em célula livre
            const drawn = new Set();
            L.group.children.forEach(m => { if (m.isInstancedMesh) for (let i = 0; i < m.count; i++) { const M = new m.matrixWorld.constructor(); m.getMatrixAt(i, M); const x = M.elements[12], z = M.elements[14]; drawn.add(L.colOf(x) + ',' + L.rowOf(z) + ':' + m.geometry.parameters?.height); } });
            const suspects = [];
            for (let r = 0; r < L.rows; r++) for (let c = 0; c < L.cols; c++) {
                const h = L.height[r * L.cols + c]; if (!h) continue;
                let touches = false;
                for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const j = L.idx(c + dc, r + dr); if (j >= 0 && L.height[j] === 0) touches = true; }
                const has = [...drawn].some(k => k.startsWith(c + ',' + r + ':'));
                if (touches && !has) suspects.push([c, r, h, L.def.map[r][c]]);
            }
            // 2) caminha pela grade: posições livres onde overlaps() acusa colisão
            const ghost = [];
            for (let r = 0; r < L.rows; r++) for (let c = 0; c < L.cols; c++) {
                if (L.height[r * L.cols + c]) continue;
                const p = L.cellCenter(c, r);
                if (L.overlaps(p.x, p.z, 0.45)) ghost.push([c, r, L.def.map[r][c]]);
            }
            const meshes = L.group.children.map(m => [m.type, m.count ?? 1, m.geometry.type, m.geometry.parameters?.height, m.visible, m.frustumCulled]);
            return { level: L.def.name, rows: L.rows, cols: L.cols, suspects, ghost, meshes };
        }, li);
        console.log(JSON.stringify(info));
        // fotos de um caixote e de um totem desta fase
        for (const ch of ['c', 'P']) {
            const ok = await ev((ch) => {
                const g = __game, L = g.level;
                for (let r = 0; r < L.rows; r++) for (let c = 0; c < L.cols; c++) if (L.def.map[r][c] === ch) {
                    // procura uma célula livre 2 casas ao sul
                    for (const [dc, dr] of [[0, 2], [0, -2], [2, 0], [-2, 0]]) {
                        const j = L.idx(c + dc, r + dr);
                        if (j >= 0 && L.height[j] === 0) {
                            const p = L.cellCenter(c + dc, r + dr), t = L.cellCenter(c, r);
                            g.player.pos.set(p.x, 0, p.z);
                            g.player.yaw = Math.atan2(-(t.x - p.x), -(t.z - p.z)); g.player.pitch = 0;
                            return true;
                        }
                    }
                }
                return false;
            }, ch);
            if (ok) { await sleep(500); await shot(`L${li + 1}_${ch === 'c' ? 'caixote' : 'totem'}`); }
        }
    }
};
