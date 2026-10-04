// Áudio 100% procedural com Web Audio API: efeitos sonoros + trilha estilo "metal" gerada em tempo real.
// (Evolução do som de tiro procedural do commit e571d3e.)

let ctx = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null, distCurve = null;
let musicOn = true;

export function initAudio() {
    if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        master = ctx.createGain(); master.gain.value = 0.8;
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -12; comp.ratio.value = 4;
        master.connect(comp); comp.connect(ctx.destination);
        sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
        musicBus = ctx.createGain(); musicBus.gain.value = 0.32; musicBus.connect(master);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        distCurve = new Float32Array(1024);
        for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; distCurve[i] = Math.tanh(x * 6); }
    }
    if (ctx.state === 'suspended') ctx.resume();
}

export function toggleMusic() { musicOn = !musicOn; if (musicBus) musicBus.gain.value = musicOn ? 0.32 : 0; return musicOn; }

// ---------- blocos básicos ----------
function noise(t, dur, { type = 'lowpass', freq = 1000, q = 1, gain = 0.5, attack = 0.002, freqEnd = null, dest = sfxBus, pan = 0 } = {}) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let out = g;
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
    src.connect(f); f.connect(g); out.connect(dest);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
}

function tone(t, dur, { type = 'sine', freq = 440, freqEnd = null, gain = 0.4, attack = 0.003, dest = sfxBus, distort = false, pan = 0 } = {}) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (distort) { const ws = ctx.createWaveShaper(); ws.curve = distCurve; o.connect(ws); node = ws; }
    node.connect(g);
    let out = g;
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
    out.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
}

const ok = () => ctx && ctx.state === 'running';

// ---------- efeitos ----------
export const sfx = {
    shot(id) {
        if (!ok()) return; const t = ctx.currentTime;
        if (id === 1) { // pistola
            noise(t, 0.16, { type: 'bandpass', freq: 1800, q: 1.5, gain: 0.5 });
            tone(t, 0.12, { type: 'triangle', freq: 320, freqEnd: 60, gain: 0.45 });
        } else if (id === 2) { // escopeta
            noise(t, 0.45, { type: 'lowpass', freq: 2400, freqEnd: 300, gain: 0.9 });
            tone(t, 0.3, { type: 'square', freq: 120, freqEnd: 30, gain: 0.6, distort: true });
            noise(t + 0.32, 0.08, { type: 'highpass', freq: 3000, gain: 0.2 }); // "clack" do pump
            noise(t + 0.45, 0.06, { type: 'highpass', freq: 2500, gain: 0.18 });
        } else if (id === 3) { // metralhadora
            noise(t, 0.09, { type: 'highpass', freq: 1200, gain: 0.4 });
            tone(t, 0.07, { type: 'sawtooth', freq: 240, freqEnd: 70, gain: 0.3, distort: true });
        } else if (id === 4) { // plasma
            tone(t, 0.25, { type: 'sawtooth', freq: 900, freqEnd: 120, gain: 0.3 });
            tone(t, 0.2, { type: 'sine', freq: 1600, freqEnd: 300, gain: 0.25 });
        } else if (id === 5) { // railgun
            tone(t, 0.05, { type: 'square', freq: 2400, freqEnd: 1800, gain: 0.25 });
            noise(t, 0.7, { type: 'bandpass', freq: 5000, freqEnd: 400, q: 3, gain: 0.7 });
            tone(t, 0.6, { type: 'sawtooth', freq: 140, freqEnd: 40, gain: 0.5, distort: true });
        } else if (id === 6) { // raio
            noise(t, 0.1, { type: 'bandpass', freq: 3000 + Math.random() * 3000, q: 4, gain: 0.35 });
            tone(t, 0.1, { type: 'square', freq: 90 + Math.random() * 40, gain: 0.2, distort: true });
        }
    },
    dryFire() { if (!ok()) return; noise(ctx.currentTime, 0.05, { type: 'highpass', freq: 4000, gain: 0.2 }); },
    switchWeapon() { if (!ok()) return; const t = ctx.currentTime; noise(t, 0.05, { type: 'highpass', freq: 2500, gain: 0.2 }); noise(t + 0.12, 0.05, { type: 'highpass', freq: 1800, gain: 0.2 }); },
    hitmarker(kill) { if (!ok()) return; tone(ctx.currentTime, 0.06, { type: 'square', freq: kill ? 1400 : 2200, gain: kill ? 0.18 : 0.08 }); },
    enemyPain(type, pan) {
        if (!ok()) return; const t = ctx.currentTime;
        const base = type === 'puglin' ? 520 : type === 'zumbi' ? 160 : 260;
        tone(t, 0.25, { type: 'sawtooth', freq: base * (0.9 + Math.random() * 0.3), freqEnd: base * 0.6, gain: 0.22, distort: true, pan });
        noise(t, 0.2, { type: 'bandpass', freq: base * 3, q: 2, gain: 0.15, pan });
    },
    enemyDeath(type, pan) {
        if (!ok()) return; const t = ctx.currentTime;
        const base = type === 'puglin' ? 420 : type === 'zumbi' ? 130 : type === 'boss' ? 70 : 200;
        const dur = type === 'boss' ? 2.5 : 0.7;
        tone(t, dur, { type: 'sawtooth', freq: base, freqEnd: base * 0.3, gain: 0.35, distort: true, pan });
        noise(t, dur * 0.8, { type: 'lowpass', freq: 900, freqEnd: 100, gain: 0.3, pan });
    },
    growl(type, pan) {
        if (!ok()) return; const t = ctx.currentTime;
        const base = type === 'puglin' ? 300 : type === 'zumbi' ? 90 : type === 'boss' ? 45 : 140;
        const dur = type === 'boss' ? 1.8 : 0.6;
        tone(t, dur, { type: 'sawtooth', freq: base, freqEnd: base * 1.3, gain: 0.18, distort: true, attack: 0.08, pan });
        tone(t, dur, { type: 'square', freq: base * 0.5, freqEnd: base * 0.4, gain: 0.12, attack: 0.1, pan });
    },
    melee() { if (!ok()) return; noise(ctx.currentTime, 0.18, { type: 'lowpass', freq: 700, gain: 0.5 }); },
    fireball(pan) { if (!ok()) return; const t = ctx.currentTime; noise(t, 0.5, { type: 'bandpass', freq: 600, freqEnd: 1800, q: 1, gain: 0.35, attack: 0.05, pan }); },
    explosion(big = false) {
        if (!ok()) return; const t = ctx.currentTime;
        noise(t, big ? 1.4 : 0.7, { type: 'lowpass', freq: big ? 1500 : 2500, freqEnd: 60, gain: big ? 1.0 : 0.7 });
        tone(t, big ? 1.0 : 0.5, { type: 'sine', freq: 90, freqEnd: 25, gain: big ? 0.9 : 0.6 });
    },
    hurt() { if (!ok()) return; const t = ctx.currentTime; tone(t, 0.2, { type: 'sawtooth', freq: 180, freqEnd: 90, gain: 0.25, distort: true }); noise(t, 0.12, { type: 'lowpass', freq: 600, gain: 0.4 }); },
    pickup(kind) {
        if (!ok()) return; const t = ctx.currentTime;
        const notes = kind === 'health' ? [523, 659, 784] : kind === 'armor' ? [392, 523, 659] : kind === 'weapon' ? [262, 392, 523, 784] : [660, 880];
        notes.forEach((f, i) => tone(t + i * 0.06, 0.18, { type: 'square', freq: f, gain: 0.12 }));
    },
    dash() { if (!ok()) return; noise(ctx.currentTime, 0.25, { type: 'bandpass', freq: 800, freqEnd: 3000, q: 0.8, gain: 0.35, attack: 0.02 }); },
    jump() { if (!ok()) return; noise(ctx.currentTime, 0.08, { type: 'lowpass', freq: 500, gain: 0.15 }); },
    land() { if (!ok()) return; noise(ctx.currentTime, 0.1, { type: 'lowpass', freq: 300, gain: 0.3 }); },
    execute() {
        if (!ok()) return; const t = ctx.currentTime;
        noise(t, 0.3, { type: 'lowpass', freq: 1200, freqEnd: 100, gain: 0.9 });
        tone(t, 0.3, { type: 'square', freq: 80, freqEnd: 30, gain: 0.7, distort: true });
        noise(t + 0.08, 0.25, { type: 'bandpass', freq: 400, q: 0.7, gain: 0.5 });
    },
    spawn(pan) { if (!ok()) return; const t = ctx.currentTime; tone(t, 0.5, { type: 'sine', freq: 200, freqEnd: 900, gain: 0.12, attack: 0.1, pan }); noise(t, 0.5, { type: 'highpass', freq: 3000, gain: 0.08, attack: 0.2, pan }); },
    wave() { if (!ok()) return; const t = ctx.currentTime; [0, 0.25].forEach(d => tone(t + d, 0.6, { type: 'sawtooth', freq: 110, gain: 0.3, distort: true, attack: 0.03 })); },
    portal() { if (!ok()) return; const t = ctx.currentTime; [261, 329, 392, 523].forEach((f, i) => tone(t + i * 0.12, 0.8, { type: 'triangle', freq: f, gain: 0.18 })); },
    slam() { if (!ok()) return; const t = ctx.currentTime; tone(t, 1.0, { type: 'sine', freq: 60, freqEnd: 20, gain: 1.0 }); noise(t, 0.9, { type: 'lowpass', freq: 400, freqEnd: 40, gain: 0.9 }); },
};

// ---------- trilha procedural ----------
// Sequenciador com "lookahead": agenda as notas alguns ms à frente no relógio do áudio.
const BPM = 152;
const STEP = 60 / BPM / 4; // semicolcheia
const E2 = 82.41;
const semis = s => E2 * Math.pow(2, s / 12);
// riff em Mi (afinação drop), 0 = pausa; números = semitons acima de E2 (+1 para não confundir com pausa)
const RIFF_A = [1, 1, 0, 1, 1, 0, 1, 4, 1, 1, 0, 1, 7, 0, 6, 0];
const RIFF_B = [1, 1, 0, 1, 1, 0, 1, 11, 10, 0, 8, 0, 7, 0, 4, 2];
const KICK = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0];
const SNARE = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];
const PAD = [0, 3, 7, 5];

let seqTimer = null, nextTime = 0, stepIdx = 0, bar = 0;
let intensity = 0, targetIntensity = 0;

export function setMusicIntensity(v) { targetIntensity = v; }

function kick(t, g) { tone(t, 0.25, { type: 'sine', freq: 150, freqEnd: 40, gain: 0.9 * g, dest: musicBus }); }
function snare(t, g) { noise(t, 0.18, { type: 'bandpass', freq: 1800, q: 0.7, gain: 0.5 * g, dest: musicBus }); tone(t, 0.1, { type: 'triangle', freq: 200, freqEnd: 150, gain: 0.3 * g, dest: musicBus }); }
function hat(t, g) { noise(t, 0.04, { type: 'highpass', freq: 7000, gain: 0.12 * g, dest: musicBus }); }
function bass(t, f, g) {
    tone(t, STEP * 0.95, { type: 'sawtooth', freq: f, gain: 0.32 * g, distort: true, dest: musicBus });
    tone(t, STEP * 0.95, { type: 'sawtooth', freq: f * 1.498, gain: 0.18 * g, distort: true, dest: musicBus }); // quinta (power chord)
}
function pad(t, f, dur, g) {
    [1, 1.5, 2.0].forEach((m, i) => tone(t, dur, { type: 'triangle', freq: f * m * 2, gain: 0.05 * g, attack: 0.4, dest: musicBus }));
}

function schedule() {
    if (!ok()) return;
    while (nextTime < ctx.currentTime + 0.12) {
        intensity += (targetIntensity - intensity) * 0.08;
        const s = stepIdx % 16;
        const t = nextTime;
        const combat = intensity > 0.35;
        if (s === 0 && bar % 2 === 0) pad(t, semis(PAD[(bar / 2) % 4]), STEP * 32, 1.0 - intensity * 0.5);
        if (s % 2 === 0) hat(t, 0.4 + intensity * 0.6);
        if (combat) {
            const riff = (bar % 4 === 3) ? RIFF_B : RIFF_A;
            if (riff[s]) bass(t, semis(riff[s] - 1), intensity);
            if (KICK[s]) kick(t, intensity);
            if (SNARE[s]) snare(t, intensity);
        } else if (s === 0 || s === 8) {
            kick(t, 0.35);
        }
        nextTime += STEP;
        stepIdx++;
        if (stepIdx % 16 === 0) bar++;
    }
}

export function startMusic() {
    if (!ctx || seqTimer) return;
    nextTime = ctx.currentTime + 0.1;
    seqTimer = setInterval(schedule, 25);
}
