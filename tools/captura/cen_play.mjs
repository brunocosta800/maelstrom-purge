// Partida com bot: fase escolhida por env LEVEL, duração por env SECS
import fs from 'fs';
const BOT = fs.readFileSync(new URL('./bot.js', import.meta.url), 'utf8');
export default async ({ page, sleep, down, up, key, shot, eval: ev }) => {
    const level = +(process.env.LEVEL || 1) - 1;
    const secs = +(process.env.SECS || 40);
    await page.waitForFunction('window.__game && window.__game.state === "menu"', { timeout: 120000 });
    await page.addScriptTag({ content: BOT });
    if (process.env.GOD) await ev(() => { __game.godMode = true; });
    await page.click(`#level-select button[data-level="${level}"]`);
    if (process.env.DIFF) await page.click(`#diff-select button[data-diff="${process.env.DIFF}"]`);
    await page.click('#start-btn');
    const t0 = Date.now();
    let n = 0;
    const strafes = ['KeyA', 'KeyD'];
    while ((Date.now() - t0) / 1000 < secs) {
        const st = await ev(() => ({ s: __game.state, ex: !document.getElementById('execute-hint').classList.contains('hidden') }));
        if (st.s === 'dead' || st.s === 'complete' || st.s === 'victory') { await shot('end_' + st.s); break; }
        if (st.ex) await key('KeyF', 40);
        const k = strafes[n % 2];
        await down(k);
        if (n % 3 === 0) await down('KeyW');
        if (n % 5 === 2) await key('ShiftLeft', 30);
        if (n % 7 === 4) await key('Space', 30);
        await sleep(700);
        await up(k); await up('KeyW');
        if (n % 12 === 6) await shot('t' + n);
        n++;
    }
    console.log(await ev(() => JSON.stringify({ state: __game.state, hp: __game.player.hp, armor: __game.player.armor, wave: __game.waveIdx, stats: __game.stats, alive: __game.enemies.length, ammo: __game.player.ammo, owned: [...__game.player.owned] })));
};
