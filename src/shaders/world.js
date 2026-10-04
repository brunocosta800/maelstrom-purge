// Shaders do cenário em TSL (Three Shading Language) — compilados para WGSL pelo WebGPURenderer.
// Ver docs/SHADERS.md para a origem e as adaptações de cada um.
import * as THREE from 'three/webgpu';
import {
    Fn, uniform, uv, sin, vec2, vec3, vec4, float, mix, smoothstep, distance, positionWorld, normalWorld,
    fract, abs, step, max, pow, floor, mx_noise_float, mx_fractal_noise_float, positionWorldDirection,
    clamp, oneMinus, hash, select, cameraPosition,
} from 'three/tsl';

// Tempo do jogo (congela no pause) e cores da fase atual — compartilhados por todos os shaders
export const gameTime = uniform(0);
export const accent = uniform(new THREE.Color(0xff2a6d));
export const accent2 = uniform(new THREE.Color(0x00e5ff));
export const skyFlash = uniform(0);

// S1 — "Grade neon pulsante": porte FIEL do GLSL original (commit 2252980) para TSL.
// Original:
//   float grid  = sin(vUv.y * 50.0 + time * 5.0) * 0.5 + 0.5;
//   float pulse = sin(time * 2.0) * 0.5 + 0.5;
//   vec3 finalColor = mix(color2, color1, grid * pulse);
//   finalColor *= smoothstep(0.8, 0.2, distance(vUv, vec2(0.5)));
// Adaptação: smoothstep(0.8, 0.2, x) com borda invertida é indefinido no GLSL e no WGSL;
// trocado por 1 - smoothstep(0.2, 0.8, x), que é o comportamento pretendido.
export function neonTotemMaterial() {
    const color2 = uniform(new THREE.Color(0x111111));
    const m = new THREE.MeshBasicNodeMaterial();
    m.colorNode = Fn(() => {
        const vUv = uv();
        const grid = sin(vUv.y.mul(50.0).add(gameTime.mul(5.0))).mul(0.5).add(0.5);
        const pulse = sin(gameTime.mul(2.0)).mul(0.5).add(0.5);
        const finalColor = mix(color2, accent, grid.mul(pulse));
        const dist = distance(vUv, vec2(0.5));
        return finalColor.mul(oneMinus(smoothstep(0.2, 0.8, dist))).mul(2.2); // ×2.2: alimenta o bloom
    })();
    return m;
}

// Coordenada 2D da face da parede a partir da posição de mundo (não depende das UVs da caixa)
const wallUV = Fn(() => {
    const n = abs(normalWorld);
    const u = select(n.x.greaterThan(0.5), positionWorld.z, positionWorld.x);
    return vec2(u, positionWorld.y);
});

// S4 — Painéis metálicos com faixa de neon e "pulso de dados" correndo pela parede
export function wallMaterial() {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.55, metalness: 0.65 });
    const p = wallUV();
    const panel = floor(vec2(p.x.div(2.0), p.y.div(1.5)));
    const local = fract(vec2(p.x.div(2.0), p.y.div(1.5)));
    const seam = max(step(local.x, 0.03), step(local.y, 0.04));
    const tone = hash(panel.x.add(panel.y.mul(17.0))).mul(0.05);
    m.colorNode = vec3(float(0.16).add(tone)).mul(oneMinus(seam.mul(0.6))).mul(vec3(0.85, 0.9, 1.0));

    m.emissiveNode = Fn(() => {
        // faixa baixa (0.55 a 0.7 m) e faixa alta, na cor da fase
        const band = smoothstep(0.5, 0.55, p.y).mul(oneMinus(smoothstep(0.7, 0.75, p.y)));
        const top = smoothstep(5.3, 5.35, p.y).mul(oneMinus(smoothstep(5.45, 5.5, p.y)));
        const scan = pow(fract(p.x.mul(0.05).sub(gameTime.mul(0.35))), 10.0).mul(5.0);
        const flicker = sin(gameTime.mul(31.0).add(panel.x)).mul(0.08).add(0.92);
        const stripe = band.add(top).mul(float(1.4).add(scan)).mul(flicker);
        // luzinhas nas emendas dos painéis
        const dots = step(0.985, hash(panel.x.mul(3.1).add(panel.y.mul(7.7))))
            .mul(seam).mul(sin(gameTime.mul(4.0).add(panel.y)).mul(0.5).add(0.5));
        return accent.mul(stripe).add(accent2.mul(dots.mul(2.0)));
    })();
    return m;
}

// Caixotes: metal claro, faixa de perigo amarela/preta no topo e cantos em neon (bem visíveis no escuro)
export function crateMaterial() {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.6, metalness: 0.35 });
    const p = wallUV();
    // os caixotes ocupam [0,2 ; 3,8] m dentro de cada célula de 4 m
    const local = fract(p.x.div(4.0)).mul(4.0);
    const corner = max(oneMinus(smoothstep(0.0, 0.12, abs(local.sub(0.2)))), oneMinus(smoothstep(0.0, 0.12, abs(local.sub(3.8)))));
    const band = smoothstep(1.7, 1.72, p.y).mul(oneMinus(smoothstep(2.0, 2.02, p.y)));
    const stripes = step(0.5, fract(p.x.add(p.y).mul(1.25)));
    const panel = mix(vec3(0.24, 0.22, 0.2), vec3(0.3, 0.28, 0.25), step(0.5, fract(p.y.mul(1.5))));
    const hazard = mix(vec3(0.03), vec3(0.95, 0.72, 0.05), stripes);
    m.colorNode = mix(panel, hazard, band);
    m.emissiveNode = accent.mul(corner.mul(1.6))
        .add(vec3(0.6, 0.45, 0.03).mul(band.mul(stripes).mul(0.5)))
        .add(accent.mul(oneMinus(smoothstep(0.0, 0.04, abs(p.y.sub(0.3)))).mul(1.2)));
    return m;
}

// S5 — Chão: grade de 2 m com linhas emissivas e uma onda de energia que sai do centro
export function floorMaterial() {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.35, metalness: 0.5 });
    const xz = positionWorld.xz;
    const cell = fract(xz.div(2.0));
    // (smoothstep com bordas invertidas é indefinido no WGSL → usamos 1 - smoothstep)
    const line = max(
        max(smoothstep(0.975, 1.0, cell.x), smoothstep(0.975, 1.0, cell.y)),
        max(oneMinus(smoothstep(0.0, 0.025, cell.x)), oneMinus(smoothstep(0.0, 0.025, cell.y))));
    const grime = mx_noise_float(vec3(xz.mul(0.35), 0.0)).mul(0.5).add(0.5);
    m.colorNode = vec3(0.035, 0.035, 0.045).mul(float(0.6).add(grime.mul(0.8)));
    m.roughnessNode = float(0.25).add(grime.mul(0.5));
    m.emissiveNode = Fn(() => {
        const r = xz.length();
        const wave = pow(fract(r.mul(0.04).sub(gameTime.mul(0.25))), 14.0).mul(1.5);
        // linhas somem com a distância da câmera (evita serrilhado/"faíscas" no horizonte)
        const fade = oneMinus(smoothstep(8.0, 34.0, distance(positionWorld, cameraPosition)));
        return accent.mul(line.mul(float(0.12).add(wave)).mul(fade));
    })();
    return m;
}

// S6 — Lava / ácido: ruído fractal animado, auto-iluminado (MeshBasic) e com ondulação na malha
export function lavaMaterial(hot, dark) {
    const hotC = uniform(new THREE.Color(hot));
    const darkC = uniform(new THREE.Color(dark));
    const m = new THREE.MeshBasicNodeMaterial();
    m.colorNode = Fn(() => {
        const p = positionWorld.xz.mul(0.35);
        const n = mx_fractal_noise_float(vec3(p, gameTime.mul(0.25)), 3, 2.0, 0.5).mul(0.5).add(0.5);
        const n2 = mx_noise_float(vec3(p.mul(2.5).add(gameTime.mul(0.4)), 1.0)).mul(0.5).add(0.5);
        const heat = smoothstep(0.35, 0.8, n.mul(0.7).add(n2.mul(0.3)));
        return mix(darkC, hotC.mul(1.7), heat);
    })();
    return m;
}

// S7 — Céu infernal: degradê + nuvens de ruído fractal + clarões (relâmpagos)
export function skyNode() {
    return Fn(() => {
        const d = positionWorldDirection;
        const h = clamp(d.y, -0.2, 1.0);
        const cloudUV = d.xz.div(max(d.y.add(0.25), 0.05)).mul(0.6).add(vec2(gameTime.mul(0.02), 0.0));
        const clouds = mx_fractal_noise_float(vec3(cloudUV, gameTime.mul(0.03)), 4, 2.0, 0.5).mul(0.5).add(0.5);
        const horizon = accent.mul(0.07);
        const base = mix(horizon, vec3(0.005, 0.0, 0.01), smoothstep(0.0, 0.6, h));
        const cl = smoothstep(0.45, 0.85, clouds).mul(oneMinus(smoothstep(0.1, 0.9, h)));
        const flash = skyFlash.mul(clouds);
        return base.add(accent.mul(cl.mul(0.1))).add(vec3(0.8, 0.7, 1.0).mul(flash.mul(0.5)));
    })();
}
