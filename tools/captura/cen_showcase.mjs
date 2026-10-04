import fs from 'fs';
const BOT = fs.readFileSync(new URL('./bot.js', import.meta.url), 'utf8');
// Momentos de destaque: execução e chefe
export default async ({ page, sleep, key, down, up, shot, eval: ev }) => {
    await page.waitForFunction('window.__game && window.__game.state === "menu"', { timeout: 120000 });
    await page.addScriptTag({ content: BOT });
    await ev(() => { __bot.on = false; __game.godMode = true; });
    await page.click('#level-select button[data-level="3"]');
    await page.click('#start-btn');
    await sleep(1500);
    // execução: imp atordoado na frente do jogador
    await ev(() => {
        const g = __game; g.spawnQueue = []; g.waveDelay = 999;
        const p = g.player; p.yaw = 0; p.pitch = -0.1;
        const pos = p.pos.clone(); pos.z -= 3.2;
        const e = g.spawnEnemy('imp', pos);
        e.state = 'chase'; e.setFx('dissolve', 0);
        e.damage(e.maxHp * 0.85, {});
    });
    await sleep(500);
    await shot('execucao_antes');
    await key('KeyF', 40);
    await sleep(120);
    await shot('execucao');
    await sleep(1500);
    // chefe
    await ev(() => {
        const g = __game; g.waveDelay = 0.1; g.waveIdx = 0; g.enemies.forEach(e => e.remove()); g.enemies = []; g.spawnQueue = [];
    });
    await ev(() => { __bot.on = true; });
    for (let i = 0; i < 14; i++) {
        await down(i % 2 ? 'KeyA' : 'KeyD'); await sleep(900); await up(i % 2 ? 'KeyA' : 'KeyD');
        if (i % 3 === 1) await key('Space', 30);
        if (i >= 3 && i % 2 === 1) await shot('chefe_' + i);
    }
};
