// Teclado + mouse com Pointer Lock (câmera própria, sem PointerLockControls, para permitir recuo e tremor)
export const input = {
    keys: new Set(),
    pressed: new Set(),   // teclas apertadas neste frame
    mouseDown: false,
    mouseDX: 0, mouseDY: 0,
    wheel: 0,
    locked: false,
    sensitivity: 0.0022,
};

export function initInput(canvas, { onLock, onUnlock }) {
    document.addEventListener('keydown', e => {
        if (!input.keys.has(e.code)) input.pressed.add(e.code);
        input.keys.add(e.code);
        if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    document.addEventListener('keyup', e => input.keys.delete(e.code));
    document.addEventListener('mousedown', e => { if (e.button === 0 && input.locked) input.mouseDown = true; });
    document.addEventListener('mouseup', e => { if (e.button === 0) input.mouseDown = false; });
    document.addEventListener('mousemove', e => {
        if (!input.locked) return;
        input.mouseDX += e.movementX || 0;
        input.mouseDY += e.movementY || 0;
    });
    document.addEventListener('wheel', e => { if (input.locked) input.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
        const was = input.locked;
        input.locked = document.pointerLockElement === canvas;
        if (input.locked && !was) onLock();
        if (!input.locked && was) { input.mouseDown = false; input.keys.clear(); onUnlock(); }
    });
}

export function requestLock(canvas) {
    const p = canvas.requestPointerLock?.({ unadjustedMovement: true });
    if (p && p.catch) p.catch(() => canvas.requestPointerLock());
}

export function endFrame() {
    input.pressed.clear();
    input.mouseDX = 0; input.mouseDY = 0; input.wheel = 0;
}
