// Carregamento dos assets com barra de progresso e erros visíveis (corrige o bug B6).
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

// Assets enviados pelo grupo (pacotes gratuitos da Quaternius — ver docs/ASSETS.md).
// Strings literais em new URL(...) para o Vite copiar os arquivos no build.
const FILES = {
    imp: new URL('../assets/Mobs/Exports/GLB (Godot-Unreal)/Imp.glb', import.meta.url).href,
    puglin: new URL('../assets/Mobs/Exports/GLB (Godot-Unreal)/Puglin.glb', import.meta.url).href,
    impSkin2: new URL('../assets/Mobs/Textures/T_Imp_BaseColor_2.png', import.meta.url).href,
    impSkin3: new URL('../assets/Mobs/Textures/T_Imp_BaseColor_3.png', import.meta.url).href,
    puglinSkin2: new URL('../assets/Mobs/Textures/T_Puglin_BaseColor_2.png', import.meta.url).href,
    puglinSkin3: new URL('../assets/Mobs/Textures/T_Puglin_BaseColor_3.png', import.meta.url).href,
    pistol: new URL('../assets/Sci-Fi Gun Pack by @Quaternius/FBX/Pistol.fbx', import.meta.url).href,
    shotgun: new URL('../assets/Sci-Fi Gun Pack by @Quaternius/FBX/LongPistol.fbx', import.meta.url).href,
    rifle: new URL('../assets/Sci-Fi Gun Pack by @Quaternius/FBX/Rifle.fbx', import.meta.url).href,
    plasma: new URL('../assets/Sci-Fi Gun Pack by @Quaternius/FBX/Ray Gun.fbx', import.meta.url).href,
    rail: new URL('../assets/Sci-Fi Gun Pack by @Quaternius/FBX/Sniper rifle.fbx', import.meta.url).href,
    lightning: new URL('../assets/Sci-Fi Gun Pack by @Quaternius/FBX/Lightning Gun.fbx', import.meta.url).href,
    // assets originais do projeto (public/) — BASE_URL para funcionar fora da raiz (GitHub Pages)
    zombie: import.meta.env.BASE_URL + 'characterMedium.fbx',
    zombieA: import.meta.env.BASE_URL + 'Textures/zombieA.png',
    zombieC: import.meta.env.BASE_URL + 'Textures/zombieC.png',
};

export const assets = {};

export async function loadAssets(onProgress) {
    const manager = new THREE.LoadingManager();
    const errors = [];
    manager.onProgress = (_u, loaded, total) => onProgress(loaded / total);
    manager.onError = u => errors.push(decodeURIComponent(u.split('/').slice(-2).join('/')));
    const gltf = new GLTFLoader(manager), fbx = new FBXLoader(manager), tex = new THREE.TextureLoader(manager);

    const safe = (p, name) => p.catch(e => { errors.push(name); console.error('Falha ao carregar', name, e); return null; });
    const texture = (u, flipY) => safe(tex.loadAsync(u).then(t => { t.colorSpace = THREE.SRGBColorSpace; t.flipY = flipY; return t; }), u);

    const [imp, puglin, zombie, ...rest] = await Promise.all([
        safe(gltf.loadAsync(FILES.imp), 'Imp.glb'),
        safe(gltf.loadAsync(FILES.puglin), 'Puglin.glb'),
        safe(fbx.loadAsync(FILES.zombie), 'characterMedium.fbx'),
        texture(FILES.impSkin2, false), texture(FILES.impSkin3, false),
        texture(FILES.puglinSkin2, false), texture(FILES.puglinSkin3, false),
        texture(FILES.zombieA, true), texture(FILES.zombieC, true), // flipY=true: correção do commit ec79988
        ...['pistol', 'shotgun', 'rifle', 'plasma', 'rail', 'lightning'].map(k => safe(fbx.loadAsync(FILES[k]), k)),
    ]);
    const [impSkin2, impSkin3, puglinSkin2, puglinSkin3, zombieA, zombieC, ...guns] = rest;

    if (!imp || !puglin || !zombie) {
        const e = new Error('Não foi possível carregar: ' + errors.join(', '));
        e.code = 'ASSETS';
        throw e;
    }
    assets.imp = imp.scene;
    assets.puglin = puglin.scene;
    assets.zombie = zombie;
    assets.skins = { imp: [null, impSkin2, impSkin3], puglin: [null, puglinSkin2, puglinSkin3], zombie: [zombieA, zombieC] };
    assets.guns = {};
    ['pistol', 'shotgun', 'rifle', 'plasma', 'rail', 'lightning'].forEach((k, i) => { assets.guns[k] = guns[i]; });
    assets.errors = errors;
    return assets;
}

// Material original do primeiro SkinnedMesh do modelo (para copiar mapas)
export function firstMaterial(root) {
    let mat = null;
    root.traverse(o => { if (!mat && o.isMesh) mat = Array.isArray(o.material) ? o.material[0] : o.material; });
    return mat;
}
