// Fluxos: pausa, morte → tentar de novo, fim de fase → próxima fase
export default async ({ page, sleep, shot, eval: ev }) => {
    const st = () => ev(() => ({ s: __game.state, hp: __game.player.hp, lvl: __game.levelIndex, wave: __game.waveIdx, enemies: __game.enemies.length, pos: [__game.player.pos.x.toFixed(1), __game.player.pos.z.toFixed(1)] }));
    await page.waitForFunction('window.__game && window.__game.state === "menu"', { timeout: 120000 });
    await page.click('#start-btn'); await sleep(4000);
    console.log('jogando', JSON.stringify(await st()));
    // pausa: congela inimigos e HP
    await ev(() => document.exitPointerLock());
    await sleep(300);
    const a = await ev(() => __game.enemies.map(e => e.pos.x.toFixed(2)).join());
    await sleep(2000);
    const b = await ev(() => __game.enemies.map(e => e.pos.x.toFixed(2)).join());
    console.log('pausa', JSON.stringify(await st()), 'inimigos parados:', a === b);
    await shot('pausa');
    await page.click('#overlay'); await sleep(500);
    console.log('retomou', JSON.stringify(await st()));
    // morte
    await ev(() => { __game.player.hurt(500, __game.player.pos.clone().add({ x: 3, y: 0, z: 0, isVector3: true })); });
    await sleep(800);
    console.log('morte', JSON.stringify(await st()));
    await shot('morte');
    await page.click('#overlay'); await sleep(1500);
    console.log('tentou de novo', JSON.stringify(await st()));
    // fim de fase: mata tudo e pula as ondas
    await ev(() => { const g = __game; g.waveIdx = g.level.def.waves.length - 1; g.spawnQueue = []; g.enemies.forEach(e => e.remove()); g.enemies = []; });
    await sleep(800);
    await ev(() => { const g = __game; g.player.pos.copy(g.portal.position); });
    await sleep(800);
    console.log('portal', JSON.stringify(await st()));
    await shot('fase_concluida');
    await page.click('#overlay'); await sleep(2500);
    console.log('fase 2', JSON.stringify(await st()));
    await shot('fase2');
};
