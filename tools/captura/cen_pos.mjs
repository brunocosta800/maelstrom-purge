// Amostras do pós-processamento: mesma cena com cada vinheta, e a arma encostada na parede (duas camadas)
export default async ({ page, sleep, shot, eval: ev }) => {
    await page.waitForFunction('window.__game && window.__game.state === "menu"', { timeout: 120000 });
    await page.click('#start-btn');
    await sleep(2500);
    await ev(() => {
        const g = __game; g.godMode = true; g.waveDelay = 1e9;
        const p = g.player; p.pos.set(0, 0, 6); p.yaw = 0.35; p.pitch = 0.05; p.vel.set(0, 0, 0);
    });
    await sleep(800);
    // congela a lógica (o render continua) para as vinhetas não sumirem
    await ev(async () => { __game.state = 'congelado'; });
    const set = (k, v) => ev(async (k, v) => { const url = performance.getEntriesByType('resource').map(e => e.name).find(n => n.includes('/src/engine/renderer.js')); const m = await import(url); /* mesmo endereço que o jogo usou = mesma instância */ for (const n of ['damage', 'heal', 'desat', 'lowHealth', 'dash']) m.post[n].value = 0; if (k) m.post[k].value = v; }, k, v);
    await set(null, 0); await sleep(300); await shot('pos_normal');
    await set('damage', 1); await sleep(300); await shot('pos_dano');
    await set('heal', 1); await sleep(300); await shot('pos_cura');
    await set('desat', 0.8); await sleep(300); await shot('pos_pausa');
    await set(null, 0);
    // arma encostada na parede norte da célula (1,1)
    await ev(() => {
        const g = __game, L = g.level, c = L.cellCenter(1, 1);
        g.player.pos.set(c.x, 0, c.z - 1.5); g.player.yaw = 0; g.player.pitch = -0.05; g.player.updateEye(); g.player.updateCamera(0.016);
    });
    await sleep(400); await shot('pos_parede');
};
