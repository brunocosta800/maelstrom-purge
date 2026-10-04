// Gera os retratos PNG (fundo transparente) do bestiário. Uso: node retratos.mjs <pasta-de-saida> [url-base]
import puppeteer from 'puppeteer-core';
import path from 'path';
import fs from 'fs';

const out = path.resolve(process.argv[2] || 'retratos');
const base = process.argv[3] || 'http://localhost:5173';
fs.mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({
    executablePath: process.env.BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
    args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'],
});
for (const t of ['zumbi', 'puglin', 'imp', 'impElite', 'boss', 'armas']) {
    const page = await browser.newPage();
    await page.setViewport(t === 'armas' ? { width: 1600, height: 900 } : { width: 900, height: 1100 });
    page.on('pageerror', e => console.log(t, 'pageerror', e.message));
    await page.goto(`${base}/tools/captura/bestiario.html?t=${t}`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction('window.__ready === true', { timeout: 120000 });
    await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: path.join(out, `${t}.png`), omitBackground: true });
    console.log('ok', t);
    await page.close();
}
await browser.close();
