// Grava gameplay do jogo com Edge headless + CDP screencast e gera MP4 + prints.
// Uso: node capture.mjs <url> <saida-sem-extensao> <cenario.mjs> [--headed]
import puppeteer from 'puppeteer-core';
import ffmpegPath from 'ffmpeg-static';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { pathToFileURL } from 'url';

const [url, outBaseRaw, scenarioFile, ...flags] = process.argv.slice(2);
const outBase = path.resolve(outBaseRaw);
const scenario = (await import(pathToFileURL(path.resolve(scenarioFile)).href)).default;
const W = 1280, H = 720;

const browser = await puppeteer.launch({
    // Edge vem instalado no Windows; troque pelo caminho do Chrome se preferir (ou use a variável BROWSER)
    executablePath: process.env.BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: !flags.includes('--headed'),
    args: [`--window-size=${W},${H}`, '--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist',
        '--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
    defaultViewport: { width: W, height: H },
});
const page = await browser.newPage();
const logs = [];
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => logs.push(`[pageerror] ${e.stack || e.message}`));

// Pointer Lock falso: headless não suporta, então simulamos a API.
await page.evaluateOnNewDocument(() => {
    let locked = null;
    Object.defineProperty(Document.prototype, 'pointerLockElement', { get: () => locked });
    Element.prototype.requestPointerLock = function () {
        locked = this; setTimeout(() => document.dispatchEvent(new Event('pointerlockchange')), 0);
        return Promise.resolve();
    };
    Document.prototype.exitPointerLock = function () {
        locked = null; setTimeout(() => document.dispatchEvent(new Event('pointerlockchange')), 0);
    };
    window.__look = (dx, dy) => document.dispatchEvent(new MouseEvent('mousemove', { movementX: dx, movementY: dy }));
    window.__mouse = (type) => document.dispatchEvent(new MouseEvent(type, { button: 0, bubbles: true }));
});

const framesDir = outBase + '_frames';
fs.rmSync(framesDir, { recursive: true, force: true });
fs.mkdirSync(framesDir, { recursive: true });
const cdp = await page.createCDPSession();
const frames = [];
cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    const f = path.join(framesDir, `f${String(frames.length).padStart(5, '0')}.jpg`);
    fs.writeFileSync(f, Buffer.from(data, 'base64'));
    frames.push({ f, t: metadata.timestamp });
    await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => { });
});

await page.goto(url, { waitUntil: 'networkidle0', timeout: 120000 });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const ctx = {
    page, sleep,
    key: async (code, ms) => { await page.keyboard.down(code); await sleep(ms); await page.keyboard.up(code); },
    down: code => page.keyboard.down(code),
    up: code => page.keyboard.up(code),
    look: async (dx, dy = 0, steps = 10, ms = 300) => { for (let i = 0; i < steps; i++) { await page.evaluate((a, b) => window.__look(a, b), dx / steps, dy / steps); await sleep(ms / steps); } },
    fire: async ms => { await page.evaluate(() => window.__mouse('mousedown')); await sleep(ms); await page.evaluate(() => window.__mouse('mouseup')); },
    shot: async (name) => { await page.screenshot({ path: `${outBase}_${name}.png` }); },
    eval: (fn, ...a) => page.evaluate(fn, ...a),
};

await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 80, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
try { await scenario(ctx); } catch (e) { console.log('SCENARIO ERROR', e.message); console.log(logs.join(String.fromCharCode(10))); await page.screenshot({ path: outBase + '_erro.png' }); }
await cdp.send('Page.stopScreencast');
await sleep(300);

// Monta o vídeo respeitando o tempo real de cada frame
if (frames.length > 1) {
    const list = frames.map((fr, i) => {
        const dur = i < frames.length - 1 ? Math.max(0.001, frames[i + 1].t - fr.t) : 0.1;
        return `file '${fr.f.replace(/\\/g, '/')}'\nduration ${dur.toFixed(4)}`;
    }).join('\n') + `\nfile '${frames[frames.length - 1].f.replace(/\\/g, '/')}'\n`;
    const listFile = path.join(framesDir, 'list.txt');
    fs.writeFileSync(listFile, list);
    execFileSync(ffmpegPath, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile,
        '-vf', 'fps=30,scale=1280:-2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '26', outBase + '.mp4']);
}
const span = frames.length ? (frames.at(-1).t - frames[0].t) : 0;
console.log(`frames=${frames.length} duracao=${span.toFixed(1)}s fps_medio=${(frames.length / Math.max(span, 0.001)).toFixed(1)}`);
fs.writeFileSync(outBase + '_console.log', logs.join('\n'));
console.log(logs.slice(0, 30).join('\n'));
fs.rmSync(framesDir, { recursive: true, force: true });
await browser.close();
