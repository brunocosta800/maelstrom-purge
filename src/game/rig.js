import * as THREE from 'three/webgpu';

// Rig procedural: anima ossos com rotações descritas no espaço do modelo em repouso (T-pose).
// Isso evita depender dos eixos locais de cada osso (que mudam de um exportador para outro):
// "girar a coxa em torno do eixo lateral X" funciona igual no Imp, no Puglin e no zumbi.
//
// Para um osso com rotação local de repouso L e rotação de mundo do pai em repouso P,
// aplicar um delta D (espaço do modelo) resulta em: L' = P⁻¹ · D · P · L
// Como cada filho usa o P de repouso, os deltas se compõem de forma hierárquica.

const _q = new THREE.Quaternion();
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();

export class Rig {
    constructor(root, boneMap) {
        this.root = root;
        this.bones = {};
        root.updateMatrixWorld(true);
        const rootInv = root.getWorldQuaternion(new THREE.Quaternion()).invert();
        const rootInvM = new THREE.Matrix4().copy(root.matrixWorld).invert();
        const all = {};
        root.traverse(o => { if (o.isBone) all[o.name] = o; });
        for (const [key, name] of Object.entries(boneMap)) {
            const bone = all[name];
            if (!bone) continue;
            const parentRest = bone.parent.getWorldQuaternion(new THREE.Quaternion()).premultiply(rootInv);
            bone.getWorldPosition(_v).applyMatrix4(rootInvM);
            this.bones[key] = {
                bone,
                restLocal: bone.quaternion.clone(),
                parentRest,
                parentRestInv: parentRest.clone().invert(),
                restPos: _v.clone(),
                delta: new THREE.Quaternion(),
            };
        }
        this.all = all;
    }

    has(key) { return !!this.bones[key]; }

    // Lado do osso em repouso (+1 = +X do modelo, -1 = -X)
    side(key) { const b = this.bones[key]; return b ? Math.sign(b.restPos.x) || 1 : 1; }

    // Define o delta do osso como rotação Euler (rad) no espaço do modelo, ordem 'XYZ' ou outra
    set(key, x, y = 0, z = 0, order = 'XYZ') {
        const b = this.bones[key];
        if (!b) return;
        b.delta.setFromEuler(_e.set(x, y, z, order));
    }

    apply() {
        for (const k in this.bones) {
            const b = this.bones[k];
            _qa.copy(b.parentRestInv).multiply(b.delta).multiply(b.parentRest);
            b.bone.quaternion.copy(_qa).multiply(b.restLocal);
        }
    }

    reset() { for (const k in this.bones) this.bones[k].delta.identity(); }
}

// Mapeamento de nomes de ossos de cada modelo para nomes genéricos
export const BONES_UE = {
    pelvis: 'pelvis', spine1: 'spine_01', spine2: 'spine_02', spine3: 'spine_03', neck: 'neck_01', head: 'Head',
    upperarmL: 'upperarm_l', upperarmR: 'upperarm_r', lowerarmL: 'lowerarm_l', lowerarmR: 'lowerarm_r',
    thighL: 'thigh_l', thighR: 'thigh_r', calfL: 'calf_l', calfR: 'calf_r', footL: 'foot_l', footR: 'foot_r',
};

export const BONES_MIXAMO = {
    pelvis: 'Hips', spine1: 'Spine', spine2: 'Spine1', spine3: 'Spine2', neck: 'Neck', head: 'Head',
    upperarmL: 'LeftArm', upperarmR: 'RightArm', lowerarmL: 'LeftForeArm', lowerarmR: 'RightForeArm',
    thighL: 'LeftUpLeg', thighR: 'RightUpLeg', calfL: 'LeftLeg', calfR: 'RightLeg', footL: 'LeftFoot', footR: 'RightFoot',
};

// Pose comum: braços abaixados a partir da T-pose, com o balanço da caminhada.
// p: { walk (fase rad), stride (0..1), armsForward (rad), lean (rad), armDown (rad) }
export function poseHumanoid(rig, p) {
    const stride = p.stride ?? 1;
    const w = p.walk ?? 0;
    const sw = Math.sin(w) * 0.55 * stride;
    const bend = (ph) => Math.max(0, Math.sin(w + ph)) * 0.9 * stride;
    const down = p.armDown ?? 1.2;
    const fwd = p.armsForward ?? 0;

    rig.set('thighL', -sw + (p.crouch ?? 0) * -0.6, 0, 0);
    rig.set('thighR', sw + (p.crouch ?? 0) * -0.6, 0, 0);
    rig.set('calfL', bend(Math.PI) + (p.crouch ?? 0) * 1.1, 0, 0);
    rig.set('calfR', bend(0) + (p.crouch ?? 0) * 1.1, 0, 0);

    rig.set('spine1', (p.lean ?? 0) * 0.5, Math.sin(w) * 0.08 * stride, 0);
    rig.set('spine2', (p.lean ?? 0) * 0.5, 0, 0);
    rig.set('head', p.headPitch ?? 0, p.headYaw ?? 0, p.headRoll ?? 0);

    const sL = rig.side('upperarmL'), sR = rig.side('upperarmR');
    const armL = p.armL ?? (sw * 0.8 - fwd);
    const armR = p.armR ?? (-sw * 0.8 - fwd);
    rig.set('upperarmL', armL, 0, -sL * down, 'XZY');
    rig.set('upperarmR', armR, 0, -sR * down, 'XZY');
    rig.set('lowerarmL', 0, -sL * (p.elbowL ?? 0.35), 0);
    rig.set('lowerarmR', 0, -sR * (p.elbowR ?? 0.35), 0);
    rig.apply();
}
