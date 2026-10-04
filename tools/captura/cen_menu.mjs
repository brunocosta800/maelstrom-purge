export default async ({ page, sleep, shot }) => {
    await page.waitForFunction('window.__game && window.__game.state === "menu"', { timeout: 120000 });
    await sleep(4000);
    await shot('menu');
};
