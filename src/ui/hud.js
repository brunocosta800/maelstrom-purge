// HUD em DOM por cima do canvas
import { WEAPONS, AMMO_LABEL } from '../game/weapons.js';

const $ = id => document.getElementById(id);

export class HUD {
    constructor() {
        this.el = $('hud');
        this.slots = $('slots');
        for (let i = 1; i <= 6; i++) { const s = document.createElement('i'); s.textContent = i; this.slots.appendChild(s); }
        this.last = {};
    }
    show(v) { this.el.classList.toggle('hidden', !v); }

    level(def, idx, total) {
        $('lvl-name').textContent = `FASE ${idx}/${total} — ${def.name.toUpperCase()}`;
        document.documentElement.style.setProperty('--accent', '#' + def.accent.toString(16).padStart(6, '0'));
    }
    wave(text) { $('wave-info').textContent = text; }
    kills(n, time) {
        $('kills').textContent = `ABATES ${n}`;
        const m = Math.floor(time / 60), s = Math.floor(time % 60);
        $('timer').textContent = `${m}:${String(s).padStart(2, '0')}`;
    }

    vitals(p) {
        const hp = Math.ceil(p.hp), ar = Math.ceil(p.armor);
        if (this.last.hp !== hp) { $('hp').textContent = hp; $('st-hp').classList.toggle('low', hp <= 30); this.last.hp = hp; }
        if (this.last.ar !== ar) { $('armor').textContent = ar; this.last.ar = ar; }
    }

    ammo(p, weaponId) {
        const W = WEAPONS[weaponId];
        const txt = W.ammo ? String(p.ammo[W.ammo]) : '∞';
        if (this.last.ammo !== txt) { $('ammo').textContent = txt; this.last.ammo = txt; }
        const lbl = W.ammo ? AMMO_LABEL[W.ammo] : 'MUNIÇÃO';
        if (this.last.lbl !== lbl) { $('ammo-label').textContent = lbl; this.last.lbl = lbl; }
        const key = [...p.owned].join() + '|' + weaponId;
        if (this.last.slots !== key) {
            [...this.slots.children].forEach((s, i) => {
                s.classList.toggle('own', p.owned.has(i + 1));
                s.classList.toggle('cur', weaponId === i + 1);
            });
            this.last.slots = key;
        }
    }

    weapon(id) {
        $('weapon-name').textContent = WEAPONS[id].name.toUpperCase();
        const gap = { 1: 6, 2: 22, 3: 10, 4: 12, 5: 4, 6: 14 }[id];
        $('crosshair').style.setProperty('--gap', gap + 'px');
    }

    dash(p) {
        const key = p.dashCharges;
        if (this.last.dash === key) return;
        [...$('dash-pips').children].forEach((el, i) => el.classList.toggle('off', i >= p.dashCharges));
        this.last.dash = key;
    }

    hitmarker(kill) {
        const h = $('hitmarker');
        h.classList.remove('show', 'kill');
        void h.offsetWidth;
        h.classList.add('show');
        if (kill) h.classList.add('kill');
    }

    message(text, kind = 'info') {
        const m = document.createElement('div');
        m.className = 'msg ' + kind;
        m.textContent = text;
        $('messages').appendChild(m);
        setTimeout(() => m.remove(), 2600);
    }

    pickup(text) {
        const m = document.createElement('div');
        m.className = 'pickup-msg';
        m.textContent = text;
        this.el.appendChild(m);
        setTimeout(() => m.remove(), 1800);
    }

    // seta vermelha apontando de onde veio o dano
    damageFrom(from, p) {
        const dx = from.x - p.pos.x, dz = from.z - p.pos.z;
        const ang = Math.atan2(dx, -dz) + p.yaw;
        const d = document.createElement('div');
        d.className = 'dmg-dir';
        d.style.transform = `rotate(${ang}rad)`;
        $('damage-dirs').appendChild(d);
        setTimeout(() => d.remove(), 900);
    }

    compass(target, p) {
        const c = $('compass');
        if (!target) { c.classList.add('hidden'); return; }
        c.classList.remove('hidden');
        const dx = target.x - p.pos.x, dz = target.z - p.pos.z;
        const ang = Math.atan2(dx, -dz) + p.yaw;
        $('compass-arrow').style.transform = `rotate(${ang}rad)`;
    }

    boss(enemy) {
        const b = $('boss');
        if (!enemy) { b.classList.add('hidden'); return; }
        b.classList.remove('hidden');
        $('boss-fill').style.width = Math.max(0, enemy.hp / enemy.maxHp * 100) + '%';
    }

    executeHint(v) { $('execute-hint').classList.toggle('hidden', !v); }
}
