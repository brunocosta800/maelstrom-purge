// Cenário do "antes": gameplay do jogo original (commit ec79988)
export default async ({ page, sleep, key, down, up, look, fire, shot }) => {
    await sleep(2500);
    await shot('menu');
    await page.click('#blocker');
    await sleep(1500);
    await shot('inicio');
    // olha em volta procurando os zumbis
    await look(600, 0, 30, 2500);
    await look(-1200, 0, 30, 2500);
    await shot('olhando');
    // anda para frente atirando com o revólver
    await down('KeyW'); await fire(1500); await up('KeyW');
    // SMG
    await key('Digit2', 50);
    await look(400, 0, 10, 800);
    await fire(2000);
    await shot('smg');
    // shotgun
    await key('Digit3', 50);
    await down('KeyA'); await fire(1500); await up('KeyA');
    await look(-300, 0, 10, 800);
    await fire(1200);
    await shot('shotgun');
    // espera os zumbis chegarem
    await down('KeyS'); await sleep(1500); await up('KeyS');
    await look(700, 0, 20, 2000);
    await sleep(3000);
    await shot('zumbis_perto');
    await key('Space', 50);
    await sleep(1500);
};
