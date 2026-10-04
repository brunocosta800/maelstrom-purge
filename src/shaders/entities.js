// Shaders de personagens, partículas e efeitos (TSL → WGSL)
import * as THREE from 'three/webgpu';
import {
    Fn, uniform, uv, sin, vec2, vec3, vec4, float, mix, smoothstep, positionLocal, texture, If, Discard,
    mx_noise_float, oneMinus, instancedDynamicBufferAttribute, clamp, max, length, atan, pow, abs, step, fract, exp, positionView,
} from 'three/tsl';
import { gameTime } from './world.js';

// S3 (evoluído) — material dos inimigos.
// Original (commit ec79988): onBeforeCompile injetava "uniform hitMix" no MeshPhongMaterial e fazia
//   gl_FragColor = mix(gl_FragColor, vec4(1,0,0,1), hitMix);
// No WebGPU não existe onBeforeCompile; o efeito foi reescrito com nós TSL e ganhou:
//   - uniforms POR OBJETO (onObjectUpdate): um único material serve todos os inimigos do mesmo tipo;
//   - dissolução por ruído 3D (nascimento e morte), com borda incandescente;
//   - pulso laranja de "atordoado" (inimigo pronto para execução).
export function enemyMaterial(src, { mapOverride = null, noiseScale = 6, edge = 0xff5500, glow = 0xff2200, glowStrength = 2, tint = 0xffffff } = {}) {
    const m = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide });
    const map = mapOverride || src.map;
    m.normalMap = src.normalMap || null;
    if (src.roughnessMap) m.roughnessMap = src.roughnessMap;
    if (src.metalnessMap) m.metalnessMap = src.metalnessMap;
    m.roughness = src.roughness ?? 0.8;
    m.metalness = src.metalness ?? 0.0;

    const hit = uniform(0).onObjectUpdate(({ object }) => object.userData.hit || 0);
    const dissolve = uniform(0).onObjectUpdate(({ object }) => object.userData.dissolve || 0);
    const stagger = uniform(0).onObjectUpdate(({ object }) => object.userData.stagger || 0);
    const tintC = uniform(new THREE.Color(tint));
    const edgeC = uniform(new THREE.Color(edge));
    const glowC = uniform(new THREE.Color(glow));

    const n = mx_noise_float(positionLocal.mul(noiseScale)).mul(0.5).add(0.5);

    m.colorNode = Fn(() => {
        If(n.lessThan(dissolve), () => { Discard(); });
        const base = map ? texture(map, uv()).rgb.mul(tintC) : tintC;
        return vec4(mix(base, vec3(1.0, 0.0, 0.0), hit.mul(0.8)), 1.0); // mesmo "mix para vermelho" do original
    })();

    m.emissiveNode = Fn(() => {
        const eyes = src.emissiveMap ? texture(src.emissiveMap, uv()).rgb.mul(glowC).mul(glowStrength) : vec3(0.0);
        const edgeGlow = oneMinus(smoothstep(0.0, 0.07, n.sub(dissolve))).mul(step(0.001, dissolve));
        const pulse = sin(gameTime.mul(14.0)).mul(0.5).add(0.5);
        return eyes
            .add(edgeC.mul(edgeGlow.mul(6.0)))
            .add(vec3(1.0, 0.05, 0.02).mul(hit.mul(1.5)))
            .add(vec3(1.0, 0.45, 0.0).mul(stagger.mul(pulse).mul(1.6)));
    })();
    return m;
}

// S2 (evoluído) — sistema de partículas na GPU.
// Original (commit ec79988): um THREE.Points + ShaderMaterial NOVO a cada tiro, física no vertex shader:
//   pos = position + velocity*t;  pos.y -= 25*t*t*0.5;  alpha = 1 - 2t;  gl_PointSize = 15*(10/-z)
// Problemas no WebGPU: não existe gl_PointSize (pontos têm sempre 1 px) e criar material por tiro
// força compilação de pipeline (travadas). Solução: UM sprite instanciado com buffer circular;
// a CPU só escreve origem/velocidade/tempo de nascimento e a GPU calcula a trajetória.
export class GPUParticles {
    constructor(scene, capacity = 4000, additive = false) {
        const max_ = capacity; // (não usar "max" como nome: encobre a função max() do TSL)
        this.max = capacity;
        this.cursor = 0;
        this.dirtyMin = Infinity;
        this.dirtyMax = -1;
        const mk = () => {
            const a = new THREE.InstancedBufferAttribute(new Float32Array(max_ * 4), 4);
            a.setUsage(THREE.DynamicDrawUsage);
            return a;
        };
        this.aOrigin = mk(); // xyz origem, w tempo de nascimento
        this.aVel = mk();    // xyz velocidade, w vida
        this.aColor = mk();  // rgb cor, w tamanho
        this.aPhys = mk();   // x gravidade, y tamanho final, z "gruda no chão", w arrasto
        for (let i = 0; i < max_; i++) this.aOrigin.array[i * 4 + 3] = -1000;

        const o = instancedDynamicBufferAttribute(this.aOrigin);
        const v = instancedDynamicBufferAttribute(this.aVel);
        const c = instancedDynamicBufferAttribute(this.aColor);
        const ph = instancedDynamicBufferAttribute(this.aPhys);

        const m = new THREE.SpriteNodeMaterial({
            transparent: true, depthWrite: false,
            blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        });
        const age = gameTime.sub(o.w);
        const life = v.w;
        const k = clamp(age.div(life), 0.0, 1.0);
        // arrasto exponencial aproximado: deslocamento = v * (1 - e^-dt) / d
        const drag = max(ph.w, 0.0001);
        const tt = clamp(age, 0.0, life);
        const travel = oneMinus(exp(drag.mul(tt).negate())).div(drag);
        m.positionNode = Fn(() => {
            const pos = o.xyz.add(v.xyz.mul(travel)).sub(vec3(0.0, ph.x.mul(0.5).mul(tt).mul(tt), 0.0)).toVar();
            // sangue empoça no chão (y mínimo), faíscas podem atravessar
            pos.y.assign(mix(pos.y, max(pos.y, 0.03), ph.z));
            return pos;
        })();
        const alive = step(0.0, age).mul(step(age, life));
        m.scaleNode = c.w.mul(mix(float(1.0), ph.y, k)).mul(alive);
        m.colorNode = Fn(() => {
            const d = length(uv().sub(0.5));
            If(d.greaterThan(0.5), () => { Discard(); });
            const soft = oneMinus(smoothstep(0.25, 0.5, d));
            // some perto da câmera: partícula colada na lente vira um borrão que tampa a tela
            const nearFade = smoothstep(0.5, 2.2, positionView.z.negate());
            const a = oneMinus(k).mul(soft).mul(nearFade);
            return vec4(c.rgb.mul(additive ? 1.8 : 1.0), a);
        })();

        this.sprite = new THREE.Sprite(m);
        this.sprite.count = max_;
        this.sprite.frustumCulled = false;
        this.sprite.renderOrder = additive ? 3 : 2;
        scene.add(this.sprite);
    }

    emit(t, x, y, z, vx, vy, vz, life, r, g, b, size, gravity = 0, sizeEnd = 1, stick = 0, drag = 0) {
        const i = this.cursor;
        this.cursor = (this.cursor + 1) % this.max;
        const j = i * 4;
        const A = this.aOrigin.array, V = this.aVel.array, C = this.aColor.array, P = this.aPhys.array;
        A[j] = x; A[j + 1] = y; A[j + 2] = z; A[j + 3] = t;
        V[j] = vx; V[j + 1] = vy; V[j + 2] = vz; V[j + 3] = life;
        C[j] = r; C[j + 1] = g; C[j + 2] = b; C[j + 3] = size;
        P[j] = gravity; P[j + 1] = sizeEnd; P[j + 2] = stick; P[j + 3] = drag;
        if (i < this.dirtyMin) this.dirtyMin = i;
        if (i > this.dirtyMax) this.dirtyMax = i;
    }

    // Envia para a GPU só o trecho do buffer que mudou neste frame
    flush() {
        if (this.dirtyMax < 0) return;
        const start = this.dirtyMin * 4, count = (this.dirtyMax - this.dirtyMin + 1) * 4;
        for (const a of [this.aOrigin, this.aVel, this.aColor, this.aPhys]) {
            a.clearUpdateRanges();
            a.addUpdateRange(start, count);
            a.needsUpdate = true;
        }
        this.dirtyMin = Infinity;
        this.dirtyMax = -1;
    }

    clear() {
        for (let i = 0; i < this.max; i++) this.aOrigin.array[i * 4 + 3] = -1000;
        this.dirtyMin = 0; this.dirtyMax = this.max - 1;
    }
}

// S8 — Bola de fogo / plasma: núcleo branco, borda colorida, ruído "fervendo"
export function orbMaterial(core, rim) {
    const coreC = uniform(new THREE.Color(core));
    const rimC = uniform(new THREE.Color(rim));
    const m = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    m.colorNode = Fn(() => {
        const p = uv().sub(0.5);
        const d = length(p).mul(2.0);
        const ang = atan(p.y, p.x);
        const boil = mx_noise_float(vec3(ang.mul(2.0), d.mul(3.0).sub(gameTime.mul(6.0)), gameTime)).mul(0.25);
        const shape = oneMinus(smoothstep(0.35, 1.0, d.add(boil)));
        const core2 = oneMinus(smoothstep(0.0, 0.45, d));
        return vec4(mix(rimC, coreC, core2).mul(3.0), shape);
    })();
    return m;
}

// S9 — Portal de saída: espiral polar animada; "open" controla se está ativo
export const portalOpen = uniform(0);
export function portalMaterial() {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    m.colorNode = Fn(() => {
        const p = uv().sub(0.5).mul(2.0);
        const r = length(p);
        const a = atan(p.y, p.x);
        const swirl = sin(a.mul(5.0).add(r.mul(14.0)).sub(gameTime.mul(5.0))).mul(0.5).add(0.5);
        const ring = oneMinus(smoothstep(0.0, 0.08, abs(r.sub(0.92))));
        const inner = oneMinus(smoothstep(0.6, 0.95, r)).mul(swirl).mul(portalOpen);
        const col = mix(vec3(1.0, 0.1, 0.05), vec3(0.2, 1.0, 0.9), portalOpen);
        const alpha = clamp(ring.add(inner.mul(0.9)).add(oneMinus(r).mul(portalOpen).mul(0.6)), 0.0, 1.0)
            .mul(step(r, 1.0));
        return vec4(col.mul(float(1.5).add(portalOpen.mul(2.0))), alpha);
    })();
    return m;
}

// Traçante / raio: faixa com núcleo brilhante; a opacidade vem de cada objeto
export function beamMaterial(color) {
    const c = uniform(new THREE.Color(color));
    const fade = uniform(1).onObjectUpdate(({ object }) => object.userData.fade ?? 1);
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    m.colorNode = Fn(() => {
        const across = abs(uv().x.sub(0.5)).mul(2.0);
        const core = oneMinus(smoothstep(0.0, 1.0, across));
        return vec4(c.mul(core.mul(4.0)), core.mul(fade));
    })();
    return m;
}

// Halo dos itens coletáveis
export function haloMaterial(color) {
    const c = uniform(new THREE.Color(color));
    const m = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    m.colorNode = Fn(() => {
        const d = length(uv().sub(0.5)).mul(2.0);
        const pulse = sin(gameTime.mul(3.0)).mul(0.15).add(0.85);
        return vec4(c.mul(0.9), oneMinus(smoothstep(0.0, 1.0, d)).mul(0.35).mul(pulse));
    })();
    return m;
}

// Onda de choque do chefe: anel no chão que se expande
export function shockwaveMaterial() {
    const life = uniform(0).onObjectUpdate(({ object }) => object.userData.k ?? 0);
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    m.colorNode = Fn(() => {
        const r = length(uv().sub(0.5)).mul(2.0);
        const ring = smoothstep(0.86, 0.97, r).mul(oneMinus(smoothstep(0.97, 1.0, r)));
        const sparks = mx_noise_float(vec3(uv().mul(30.0), gameTime.mul(4.0))).mul(0.5).add(0.5);
        return vec4(vec3(1.0, 0.35, 0.05).mul(4.0), ring.mul(sparks.add(0.5)).mul(oneMinus(life)));
    })();
    return m;
}
