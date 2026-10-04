// Mostra cada arma parada e depois disparando
export default async ({ page, sleep, key, fire, shot, eval: ev }) => {
    await page.waitForFunction('window.__game && window.__game.state === "menu"', { timeout: 120000 });
    await page.click('#start-btn');
    await sleep(1200);
    await ev(() => { const g = __game; g.godMode = true; g.level.def.waves = [[['zumbi', 0]]]; [2, 3, 4, 5, 6].forEach(i => g.player.owned.add(i)); g.player.ammo = { bullets: 300, shells: 50, cells: 300 }; g.player.pitch = 0; });
    for (let i = 1; i <= 6; i++) {
        await key('Digit' + i, 50);
        await sleep(600);
        await shot('gun' + i);
        await fire(i === 6 ? 500 : 120);
        await sleep(i === 6 ? 0 : 30);
        await shot('gun' + i + '_fire');
        await sleep(600);
    }
};
