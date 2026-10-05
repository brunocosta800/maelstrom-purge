// Gera as amostras visuais dos shaders (docs/shaders/*.png). Uso: node amostras.mjs <pasta> [url-base]
import puppeteer from 'puppeteer-core';
import path from 'path';
import fs from 'fs';

const out = path.resolve(process.argv[2] || 'amostras');
const base = process.argv[3] || 'http://localhost:5173';
fs.mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({
    executablePath: process.env.BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
    args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'],
});
async function shot(url, file, w, h) {
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: h });
    page.on('pageerror', e => console.log(file, 'pageerror', e.message));
    await page.goto(base + url, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction('window.__ready === true', { timeout: 120000 });
    await new Promise(r => setTimeout(r, 700));
    await page.screenshot({ path: path.join(out, file) });
    await page.close();
    console.log('ok', file);
}
for (const s of ['totem', 'parede', 'caixote', 'chao', 'lava', 'ceu', 'fogo', 'portal', 'onda', 'raios', 'particulas'])
    await shot(`/tools/captura/shaders.html?s=${s}`, `${s}.png`, 960, 540);
for (const fx of ['normal', 'hit', 'stagger', 'dissolve'])
    await shot(`/tools/captura/bestiario.html?t=imp&fx=${fx}`, `inimigo_${fx}.png`, 520, 700);
await browser.close();
