import fs from 'fs';
const BOT = fs.readFileSync(new URL('./bot.js', import.meta.url), 'utf8');
export default async ({ page, sleep, shot, eval: ev }) => {
    await page.waitForFunction('window.__game && window.__game.state === "menu"', { timeout: 120000 });
    await page.addScriptTag({ content: BOT });
    await ev(() => { __game.godMode = true; __bot.on = false; });
    await page.click('#level-select button[data-level="3"]');
    await page.click('#start-btn');
    await sleep(800);
    await ev(() => { const g = __game; g.waveIdx = 0; g.waveDelay = 0; g.spawnQueue = []; });
    await sleep(1500);
    await ev(() => {
        const g = __game, b = g.boss; if (!b) return;
        b.pos.set(0, 0, -8); g.enemies.filter(e => e !== b).forEach(e => e.remove());
        const p = g.player; p.pos.set(0, 0, 10); p.yaw = 0; p.pitch = 0.12;
    });
    await sleep(1200);
    await shot('chefe_a');
    await ev(() => { __bot.on = true; });
    for (let i = 0; i < 8; i++) { await sleep(900); await shot('chefe_b' + i); }
};
