// Renderizador WebGPU + pipeline de pós-processamento em TSL
import * as THREE from 'three/webgpu';
import { pass, uniform, mix, vec3, vec4, smoothstep, distance, screenUV, vec2, float, luminance, sin, oneMinus, Fn } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { gameTime } from '../shaders/world.js';

export const post = {
    damage: uniform(0),     // vinheta vermelha ao tomar dano
    lowHealth: uniform(0),  // pulso quando a vida está baixa
    heal: uniform(0),       // vinheta verde ao pegar vida
    desat: uniform(0),      // dessaturação (morte / pause)
    dash: uniform(0),       // vinheta azulada no dash
};

export async function createRenderer() {
    if (!navigator.gpu) {
        const err = new Error('WebGPU não está disponível neste navegador.');
        err.code = 'NO_WEBGPU';
        throw err;
    }
    const renderer = new THREE.WebGPURenderer({ antialias: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.setClearColor(0x000000, 0);
    document.body.appendChild(renderer.domElement);
    await renderer.init();
    return renderer;
}

// Duas cenas: o mundo e a arma em primeira pessoa (renderizada por cima, nunca atravessa paredes)
export function createPipeline(renderer, scene, weaponScene, camera, weaponCamera) {
    const pipeline = new THREE.RenderPipeline(renderer);
    const worldPass = pass(scene, camera, { samples: 4 });
    const gunPass = pass(weaponScene, weaponCamera, { samples: 4 });
    const world = worldPass.getTextureNode('output');
    const gun = gunPass.getTextureNode('output');

    const base = mix(world.rgb, gun.rgb, gun.a);
    const glow = bloom(vec4(base, 1.0), 0.85, 0.45, 0.6);

    const composed = Fn(() => {
        const c = base.add(glow.rgb).toVar();

        const edge = smoothstep(0.25, 0.85, distance(screenUV, vec2(0.5)).mul(1.35));
        const beat = sin(gameTime.mul(7.0)).mul(0.5).add(0.5);
        c.assign(mix(c, vec3(0.6, 0.0, 0.0), edge.mul(post.damage).mul(0.85)));
        c.assign(mix(c, vec3(0.35, 0.0, 0.0), edge.mul(post.lowHealth).mul(beat).mul(0.6)));
        c.assign(mix(c, vec3(0.1, 0.9, 0.3), edge.mul(post.heal).mul(0.5)));
        c.assign(mix(c, vec3(0.3, 0.6, 1.0), edge.mul(post.dash).mul(0.5)));
        c.assign(mix(c, vec3(luminance(c)).mul(vec3(1.0, 0.75, 0.75)), post.desat));
        // vinheta permanente
        c.assign(c.mul(oneMinus(edge.mul(0.35))));
        return vec4(c, 1.0);
    })();

    pipeline.outputNode = composed;
    return pipeline;
}
