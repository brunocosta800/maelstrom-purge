// Bot injetado na página: mira suavemente no inimigo visível mais próximo e atira (só para gravar gameplay/testar)
window.__bot = {
    on: true, fire: true, aimSpeed: 7, target: null,
    tick() {
        const g = window.__game;
        if (!g || g.state !== 'playing' || !this.on) return;
        const p = g.player;
        let best = null, bd = 1e9;
        for (const e of g.enemies) {
            if (!e.vulnerable) continue;
            const d = e.pos.distanceTo(p.pos);
            const see = g.level.lineOfSight(p.eye, e.headPos);
            const score = d + (see ? 0 : 1000) + (e.state === 'stagger' ? -5 : 0);
            if (score < bd) { bd = score; best = e; }
        }
        this.target = best;
        if (!best) { g.input.mouseDown = false; return; }
        const aim = best.headPos.clone().lerp(best.pos, 0.35);
        const dx = aim.x - p.eye.x, dy = aim.y - p.eye.y, dz = aim.z - p.eye.z;
        const yaw = Math.atan2(-dx, -dz);
        const pitch = Math.atan2(dy, Math.hypot(dx, dz));
        let dyaw = Math.atan2(Math.sin(yaw - p.yaw), Math.cos(yaw - p.yaw));
        const k = Math.min(1, this.aimSpeed * 0.016);
        p.yaw += dyaw * k + (Math.random() - 0.5) * 0.01;
        p.pitch += (pitch - p.pitch) * k;
        const see = bd < 1000;
        g.input.mouseDown = this.fire && see && Math.abs(dyaw) < 0.12;
    },
};
setInterval(() => window.__bot.tick(), 16);
