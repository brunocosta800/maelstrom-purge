// MAELSTROM PURGE — FPS estilo Doom em Three.js + WebGPU
import './style.css';
import * as THREE from 'three/webgpu';
import { createRenderer, createPipeline, post } from './engine/renderer.js';
import { initInput, requestLock, endFrame, input } from './engine/input.js';
import { initAudio, sfx, startMusic, setMusicIntensity, toggleMusic } from './engine/audio.js';
import { gameTime, accent, accent2, skyNode, skyFlash } from './shaders/world.js';
import { portalMaterial, portalOpen } from './shaders/entities.js';
import { loadAssets } from './game/assets.js';
import { Level } from './game/level.js';
import { LEVELS } from './game/levels.js';
import { Player } from './game/player.js';
import { Enemy, prepareEnemyTemplates, TYPES } from './game/enemies.js';
import { WeaponSystem, prepareGuns, WEAPONS, AMMO_MAX } from './game/weapons.js';
import { Projectiles } from './game/projectiles.js';
import { Pickups, pickupSound } from './game/pickups.js';
import { Effects } from './game/effects.js';
import { HUD } from './ui/hud.js';

const $ = id => document.getElementById(id);
const DIFF_DMG = { facil: 0.6, normal: 1, pesadelo: 1.5 };

class Game {
    constructor() {
        this.state = 'loading';
        this.difficulty = 'normal';
        this.levelIndex = 0;
        this.enemies = [];
        this.input = input;
        this.timeScale = 1;
        this.hitstop = 0;
        this.godMode = false;
    }

    get diffDmg() { return DIFF_DMG[this.difficulty]; }

    async boot() {
        try {
            this.renderer = await createRenderer();
        } catch (e) {
            return this.fatal(e.code === 'NO_WEBGPU'
                ? 'Este navegador não tem WebGPU. Use Chrome ou Edge atualizado (versão 113+) e confira em chrome://gpu se "WebGPU" está como "Hardware accelerated".'
                : 'Falha ao iniciar o WebGPU: ' + e.message);
        }
        this.isWebGPU = !!this.renderer.backend.isWebGPUBackend;
        const badge = this.isWebGPU ? 'WEBGPU ✓' : 'WEBGL2 (fallback)';
        $('backend-badge').textContent = badge; $('backend-mini').textContent = badge;
        if (!this.isWebGPU) { $('backend-badge').classList.add('warn'); $('backend-mini').classList.add('warn'); }

        // cenas
        this.scene = new THREE.Scene();
        this.scene.backgroundNode = skyNode();
        this.camera = new THREE.PerspectiveCamera(82, innerWidth / innerHeight, 0.05, 220);
        this.camera.rotation.order = 'YXZ';
        this.hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
        this.scene.add(this.hemi);
        this.moon = new THREE.DirectionalLight(0xffffff, 1.2);
        this.moon.position.set(30, 60, 20);
        this.scene.add(this.moon);

        this.weaponScene = new THREE.Scene();
        this.weaponCamera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.01, 10);
        this.weaponScene.add(new THREE.HemisphereLight(0xffffff, 0x302020, 2.2));
        const wl = new THREE.DirectionalLight(0xffffff, 2.2); wl.position.set(-1, 2, 1.5); this.weaponScene.add(wl);
        this.weaponRim = new THREE.DirectionalLight(0xff2a6d, 3); this.weaponRim.position.set(2, 0.5, -1); this.weaponScene.add(this.weaponRim);

        this.pipeline = createPipeline(this.renderer, this.scene, this.weaponScene, this.camera, this.weaponCamera);

        // assets
        try {
            await loadAssets(f => { $('load-fill').style.width = Math.round(f * 100) + '%'; $('load-text').textContent = `Carregando demônios… ${Math.round(f * 100)}%`; });
        } catch (e) {
            return this.fatal(e.message + '. Verifique se a pasta src/assets está completa.');
        }
        $('load-text').textContent = 'Compilando shaders WGSL…';
        prepareGuns();
        prepareEnemyTemplates();

        this.hud = new HUD();
        this.fx = new Effects(this.scene);
        this.player = new Player(this);
        this.weapons = new WeaponSystem(this, this.weaponScene);
        this.projectiles = new Projectiles(this);
        this.pickups = new Pickups(this);
        this.buildPortal();

        initInput(this.renderer.domElement, { onLock: () => this.onLock(), onUnlock: () => this.onUnlock() });
        window.addEventListener('resize', () => this.resize());
        this.setupMenu();

        // pré-compila tudo numa fase de teste para não travar na primeira aparição de cada inimigo
        this.loadLevel(0);
        await this.warmup();

        $('loading').classList.add('hidden');
        this.showMenu();
        this.last = performance.now();
        this.renderer.setAnimationLoop(() => this.frame());
        window.__game = this; // usado pelos scripts de captura de vídeo
    }

    fatal(msg) {
        $('loading').classList.add('hidden');
        $('error').classList.remove('hidden');
        $('error-text').textContent = msg;
        console.error(msg);
    }

    async warmup() {
        const tmp = [];
        for (const k of Object.keys(TYPES)) {
            const e = new Enemy(this, k, new THREE.Vector3(0, 0, -6 - tmp.length * 2));
            e.setFx('dissolve', 0);
            tmp.push(e);
        }
        this.projectiles.fire(new THREE.Vector3(0, 1, -3), new THREE.Vector3(0, 0, -1), { speed: 0, dmg: 0, owner: 'enemy', kind: 'fire' });
        this.projectiles.fire(new THREE.Vector3(0, 1, -3), new THREE.Vector3(0, 0, -1), { speed: 0, dmg: 0, owner: 'enemy', kind: 'void' });
        this.projectiles.fire(new THREE.Vector3(0, 1, -3), new THREE.Vector3(0, 0, -1), { speed: 0, dmg: 0, owner: 'player', kind: 'plasma' });
        for (let id = 1; id <= 6; id++) this.weapons.models[id].visible = true;
        this.fx.beam(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, -5), 'bullet');
        this.fx.beam(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, -5), 'rail');
        this.fx.beam(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, -5), 'lightning');
        this.player.updateCamera(0.016);
        try {
            await this.renderer.compileAsync(this.scene, this.camera);
            await this.renderer.compileAsync(this.weaponScene, this.weaponCamera);
        } catch (e) { console.warn('compileAsync', e); }
        this.pipeline.render();
        for (let id = 1; id <= 6; id++) this.weapons.models[id].visible = id === this.weapons.current;
        tmp.forEach(e => e.remove());
        this.projectiles.clear();
        this.fx.clear();
    }

    buildPortal() {
        this.portal = new THREE.Group();
        const disc = new THREE.Mesh(new THREE.CircleGeometry(1.7, 48), portalMaterial());
        disc.position.y = 2.0;
        this.portal.add(disc);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.12, 12, 48),
            new THREE.MeshStandardNodeMaterial({ color: 0x111111, emissive: 0xff3020, emissiveIntensity: 2.5, metalness: 0.8, roughness: 0.3 }));
        ring.position.y = 2.0;
        this.portalRing = ring;
        this.portal.add(ring);
        this.portalDisc = disc;
        this.scene.add(this.portal);
    }

    // ---------------- menu e estados ----------------
    setupMenu() {
        const ls = $('level-select');
        LEVELS.forEach((L, i) => {
            const b = document.createElement('button');
            b.textContent = `${i + 1}. ${L.name}`;
            b.dataset.level = i;
            if (i === 0) b.classList.add('on');
            b.onclick = e => { e.stopPropagation(); this.levelIndex = i; [...ls.children].forEach(c => c.classList.toggle('on', c === b)); };
            ls.appendChild(b);
        });
        [...$('diff-select').children].forEach(b => b.onclick = e => {
            e.stopPropagation();
            this.difficulty = b.dataset.diff;
            [...$('diff-select').children].forEach(c => c.classList.toggle('on', c === b));
        });
        $('start-btn').onclick = e => {
            e.stopPropagation();
            initAudio(); startMusic();
            this.player.reset();
            this.giveLoadoutFor(this.levelIndex);
            this.loadLevel(this.levelIndex);
            this.state = 'playing';
            requestLock(this.renderer.domElement);
        };
        $('overlay').addEventListener('click', () => this.onOverlayClick());
    }

    // ao começar direto numa fase avançada, recebe as armas das fases anteriores
    giveLoadoutFor(idx) {
        const p = this.player;
        const unlock = [[], [2], [2, 3, 4], [2, 3, 4, 5]][idx];
        unlock.forEach(w => p.owned.add(w));
        if (idx > 0) { p.ammo.shells = 24; p.ammo.bullets = 150; p.armor = 50; }
        if (idx > 1) p.ammo.cells = 80;
        if (idx > 2) p.ammo.cells = 140;
    }

    showMenu() {
        this.state = 'menu';
        $('menu').classList.remove('hidden');
        $('overlay').classList.add('hidden');
        this.hud.show(false);
        post.desat.value = 0;
    }

    overlay(title, body, hint) {
        $('ov-title').textContent = title;
        $('ov-body').innerHTML = body;
        $('ov-hint').textContent = hint;
        $('overlay').classList.remove('hidden');
        this.hud.show(false);
    }

    onLock() {
        $('menu').classList.add('hidden');
        $('overlay').classList.add('hidden');
        this.hud.show(true);
        if (this.state === 'paused') this.state = 'playing';
        post.desat.value = 0;
        this.last = performance.now();
    }

    // Esc → pausa de verdade: nada se move (corrige o bug B1)
    onUnlock() {
        if (this.state === 'playing') {
            this.state = 'paused';
            post.desat.value = 0.6;
            this.overlay('PAUSADO', '<p>Os demônios esperam.</p>', 'Clique para continuar · M liga/desliga a música');
            $('ov-body').insertAdjacentHTML('beforeend', '<p><button id="quit-btn">Voltar ao menu</button></p>');
            $('quit-btn').onclick = e => { e.stopPropagation(); this.showMenu(); };
        }
    }

    onOverlayClick() {
        initAudio();
        if (this.state === 'paused') requestLock(this.renderer.domElement);
        else if (this.state === 'dead') {
            this.player.restore(this.levelSnapshot);
            this.loadLevel(this.levelIndex);
            this.state = 'playing';
            requestLock(this.renderer.domElement);
        } else if (this.state === 'complete') {
            this.levelIndex++;
            this.loadLevel(this.levelIndex);
            this.state = 'playing';
            requestLock(this.renderer.domElement);
        } else if (this.state === 'victory') {
            this.showMenu();
        }
    }

    // ---------------- fases ----------------
    loadLevel(idx) {
        const def = LEVELS[idx];
        if (this.level) this.level.dispose(this.scene);
        this.enemies.forEach(e => e.alive && e.remove());
        this.enemies = [];
        this.projectiles.clear();
        this.pickups.clear();
        this.fx.clear();

        this.level = new Level(def);
        this.level.build(this.scene);
        accent.value.setHex(def.accent);
        accent2.value.setHex(def.accent2);
        this.scene.fog = new THREE.FogExp2(def.fog, def.fogDensity);
        this.hemi.color.setHex(def.hemi[0]); this.hemi.groundColor.setHex(def.hemi[1]); this.hemi.intensity = def.hemi[2];
        this.moon.color.setHex(def.accent).lerp(new THREE.Color(0xffffff), 0.6);
        this.weaponRim.color.setHex(def.accent);
        this.hud.level(def, idx + 1, LEVELS.length);

        const s = this.level.marks.start;
        // olha para o centro do mapa ao nascer (corrige o bug B4: sempre volta ao início)
        this.player.spawn(s, Math.atan2(s.x, s.z));
        this.player.hp = Math.max(this.player.hp, 1);
        this.levelSnapshot = this.player.snapshot();

        for (const it of this.level.marks.items) this.pickups.add(it.ch, it.pos);
        this.portal.position.copy(this.level.marks.exit);
        portalOpen.value = 0;
        this.portalRing.material.emissive.setHex(0xff3020);

        this.waveIdx = -1;
        this.spawnQueue = [];
        this.waveDelay = 2.0;
        this.levelDone = false;
        this.stats = { kills: 0, shots: 0, hits: 0, damageTaken: 0, damageDealt: 0, executions: 0, time: 0 };
        this.boss = null;
        this.totalWaves = def.waves.length;
        this.hud.wave('PREPARE-SE…');
        this.hud.vitals(this.player);
        this.hud.weapon(this.weapons.current);
        // começa com a melhor arma que tem munição
        const best = [...this.player.owned].sort((a, b) => b - a).find(id => this.weapons.hasAmmo(id)) || 1;
        this.weapons.models[this.weapons.current].visible = false;
        this.weapons.current = best; this.weapons.pending = null;
        this.weapons.models[best].visible = true;
        this.hud.weapon(best);
        this.hud.message(def.name.toUpperCase(), 'big');
        setTimeout(() => this.hud.message(def.subtitle, 'info'), 600);
    }

    updateWaves(dt) {
        if (this.levelDone) return;
        const alive = this.enemies.filter(e => e.alive && e.state !== 'dying').length;
        // fila de surgimento: um inimigo a cada 0,35 s
        if (this.spawnQueue.length) {
            this.spawnT -= dt;
            if (this.spawnT <= 0) { this.spawnEnemy(this.spawnQueue.shift()); this.spawnT = 0.35; }
        }
        const waves = this.level.def.waves;
        const cur = waves[this.waveIdx];
        const curSize = cur ? cur.reduce((a, [, n]) => a + n, 0) : 0;
        const ready = !this.spawnQueue.length && (this.waveIdx < 0 || alive <= Math.floor(curSize * 0.2));
        if (ready && this.waveIdx < waves.length - 1) {
            this.waveDelay -= dt;
            if (this.waveDelay <= 0) {
                this.waveIdx++;
                const w = waves[this.waveIdx];
                for (const [type, n] of w) for (let i = 0; i < n; i++) this.spawnQueue.push(type);
                // embaralha para misturar os tipos
                this.spawnQueue.sort(() => Math.random() - 0.5);
                if (this.spawnQueue.includes('boss')) { this.spawnQueue = ['boss', ...this.spawnQueue.filter(t => t !== 'boss')]; }
                this.spawnT = 0.2;
                this.waveDelay = 2.5;
                this.hud.message(this.waveIdx === waves.length - 1 ? 'ONDA FINAL' : `ONDA ${this.waveIdx + 1}`, 'danger');
                sfx.wave();
            }
        }
        if (this.waveIdx === waves.length - 1 && !this.spawnQueue.length && alive === 0) {
            this.levelDone = true;
            portalOpen.value = 1;
            this.portalRing.material.emissive.setHex(0x20ffe0);
            this.hud.message('ÁREA LIMPA — PORTAL ABERTO', 'good');
            sfx.portal();
        }
        const remaining = alive + this.spawnQueue.length;
        if (this.waveIdx >= 0 && !this.levelDone) this.hud.wave(`ONDA ${this.waveIdx + 1}/${waves.length} · ${remaining} INIMIGOS`);
        else if (this.levelDone) this.hud.wave('VÁ ATÉ O PORTAL');
    }

    spawnEnemy(type, near = null) {
        const p = this.player.pos;
        let pos;
        if (near) {
            pos = near.clone();
        } else {
            // pontos de surgimento longe do jogador, com um pouco de aleatoriedade
            const sp = this.level.marks.spawns
                .map(s => ({ s, d: s.distanceTo(p) + Math.random() * 12 }))
                .filter(o => o.d > 12)
                .sort((a, b) => b.d - a.d);
            const pick = sp.length ? sp[Math.floor(Math.random() * Math.min(3, sp.length))].s : this.level.marks.spawns[0];
            pos = pick.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2));
        }
        const e = new Enemy(this, type, pos);
        this.enemies.push(e);
        this.fx.spawnColumn(pos, TYPES[type].glow ? [0.6, 0.1, 1] : [1, 0.25, 0.08]);
        sfx.spawn(this.panOf(pos));
        if (type === 'boss') { this.boss = e; this.hud.message('O ARQUIDEMÔNIO DESPERTOU', 'big'); sfx.growl('boss', 0); }
        return e;
    }

    summonMinions(boss, n) {
        for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2;
            const pos = boss.pos.clone().add(new THREE.Vector3(Math.cos(a) * 4, 0, Math.sin(a) * 4));
            if (this.level.overlaps(pos.x, pos.z, 0.5)) continue;
            this.spawnEnemy('puglin', pos);
        }
    }

    bossSlam(boss) {
        sfx.slam();
        this.fx.addShake(1.0);
        this.fx.explosion(boss.pos.clone().setY(0.3), 3, [1, 0.4, 0.05], true);
        const ring = this.fx.shockwave(boss.pos);
        this.shock = { ring, center: boss.pos.clone(), r: 0.5, hit: false, dmg: 25 * this.diffDmg };
    }

    updateShock(dt) {
        const s = this.shock;
        if (!s) return;
        s.r += dt * 15;
        s.ring.scale.setScalar(s.r);
        s.ring.userData.k = s.r / 22;
        const p = this.player;
        const d = Math.hypot(p.pos.x - s.center.x, p.pos.z - s.center.z);
        if (!s.hit && Math.abs(d - s.r) < 0.9 && p.pos.y < 0.5) {
            s.hit = true;
            p.hurt(s.dmg, s.center);
            p.vel.y = 6;
            p.onGround = false;
        }
        if (s.r > 22) { s.ring.visible = false; this.shock = null; }
    }

    // ---------------- eventos ----------------
    onEnemyKilled(e, kind) {
        this.stats.kills++;
        this.totalKills = (this.totalKills || 0) + 1;
        if (kind === 'shotgun' || kind === 'execute' || kind === 'rail') { this.hitstop = 0.05; }
        const T = e.T;
        // drops: munição e às vezes vida (incentiva o jogador a ser agressivo)
        const pos = e.pos.clone().setY(1);
        if (kind === 'execute') {
            for (let i = 0; i < 5; i++) this.pickups.add('orbH', pos, { drop: true });
            this.pickups.add('orbA', pos, { drop: true });
            this.pickups.add('orbR', pos, { drop: true });
        } else {
            if (Math.random() < T.drop) this.pickups.add('orbA', pos, { drop: true });
            if (Math.random() < T.drop * 0.6) this.pickups.add('orbH', pos, { drop: true });
            if (T.boss) { for (let i = 0; i < 10; i++) this.pickups.add('orbH', pos, { drop: true }); }
        }
        if (e === this.boss) {
            this.boss = null;
            this.hud.boss(null);
            this.hud.message('ARQUIDEMÔNIO DESTRUÍDO', 'big');
            this.timeScale = 0.3; this.slowmo = 1.5;
            // mata os lacaios que restaram
            this.enemies.forEach(o => { if (o !== e && o.vulnerable) o.die('explosion'); });
        }
    }

    onPlayerDeath() {
        this.state = 'dead';
        post.desat.value = 0.8;
        document.exitPointerLock();
        setTimeout(() => {
            this.overlay('VOCÊ MORREU', this.statsTable(), 'Clique para tentar de novo');
        }, 50);
    }

    statsTable() {
        const s = this.stats;
        const acc = s.shots ? Math.round(s.hits / s.shots * 100) : 0;
        const m = Math.floor(s.time / 60), sec = Math.floor(s.time % 60);
        return `<table>
            <tr><td>Abates</td><td>${s.kills}</td></tr>
            <tr><td>Execuções</td><td>${s.executions}</td></tr>
            <tr><td>Precisão</td><td>${acc}%</td></tr>
            <tr><td>Dano causado</td><td>${Math.round(s.damageDealt)}</td></tr>
            <tr><td>Dano recebido</td><td>${Math.round(s.damageTaken)}</td></tr>
            <tr><td>Tempo</td><td>${m}:${String(sec).padStart(2, '0')}</td></tr></table>`;
    }

    completeLevel() {
        document.exitPointerLock();
        if (this.levelIndex >= LEVELS.length - 1) {
            this.state = 'victory';
            this.overlay('MAELSTROM PURGADA', this.statsTable() +
                '<p style="font-size:15px;color:#999;margin-top:20px">Modelos: Quaternius (Bestiary — Dungeon Monsters, Sci-Fi Gun Pack) · Renderizado com WebGPU + TSL</p>',
                'Clique para voltar ao menu');
        } else {
            this.state = 'complete';
            sfx.portal();
            this.overlay(`FASE ${this.levelIndex + 1} CONCLUÍDA`, this.statsTable(), `Clique para ir para: ${LEVELS[this.levelIndex + 1].name}`);
        }
    }

    canCollect(d) {
        const p = this.player;
        if (d.kind === 'health') return p.hp < 100;
        if (d.kind === 'mega') return p.hp < 200;
        if (d.kind === 'armor') return p.armor < 100;
        if (d.kind === 'ammoMix') return [...p.owned].some(id => WEAPONS[id].ammo && p.ammo[WEAPONS[id].ammo] < AMMO_MAX[WEAPONS[id].ammo]) || p.ammo.bullets < AMMO_MAX.bullets;
        return true;
    }

    collect(it) {
        const p = this.player, d = it.def;
        let ok = false;
        if (d.kind === 'health') { if (p.hp < 100) { p.hp = Math.min(100, p.hp + d.amount); ok = true; post.heal.value = d.small ? 0.3 : 1; } }
        else if (d.kind === 'mega') { if (p.hp < 200) { p.hp = Math.min(200, p.hp + d.amount); ok = true; post.heal.value = 1; } }
        else if (d.kind === 'armor') { if (p.armor < 100) { p.armor = Math.min(100, p.armor + d.amount); ok = true; } }
        else if (d.kind === 'ammoMix') {
            for (const id of p.owned) {
                const W = WEAPONS[id];
                if (!W.ammo || p.ammo[W.ammo] >= AMMO_MAX[W.ammo]) continue;
                const add = { bullets: 20, shells: 4, cells: 12 }[W.ammo];
                p.ammo[W.ammo] = Math.min(AMMO_MAX[W.ammo], p.ammo[W.ammo] + add); ok = true;
            }
            if (!ok && p.ammo.bullets < AMMO_MAX.bullets) { p.ammo.bullets += 15; ok = true; }
        } else if (d.kind === 'weapon') {
            const W = WEAPONS[d.weapon];
            const isNew = !p.owned.has(d.weapon);
            p.owned.add(d.weapon);
            if (W.ammo) p.ammo[W.ammo] = Math.min(AMMO_MAX[W.ammo], p.ammo[W.ammo] + { bullets: 80, shells: 16, cells: 60 }[W.ammo]);
            ok = true;
            if (isNew) { this.hud.message(`${W.name.toUpperCase()}!`, 'warn'); this.weapons.select(d.weapon); }
        } else if (AMMO_MAX[d.kind] !== undefined) {
            if (p.ammo[d.kind] < AMMO_MAX[d.kind]) { p.ammo[d.kind] = Math.min(AMMO_MAX[d.kind], p.ammo[d.kind] + d.amount); ok = true; }
        }
        if (ok) {
            pickupSound(d);
            if (d.label) this.hud.pickup(d.label);
            this.hud.vitals(p);
        }
        return ok;
    }

    // execução (estilo "glory kill"): inimigo atordoado perto e na frente
    findExecutable() {
        const p = this.player;
        const fwd = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
        let best = null, bd = 4;
        for (const e of this.enemies) {
            if (e.state !== 'stagger') continue;
            const v = e.pos.clone().sub(p.pos).setY(0);
            const d = v.length();
            if (d < bd && v.normalize().dot(fwd) > 0.4) { bd = d; best = e; }
        }
        return best;
    }

    execute(e) {
        const p = this.player;
        const dir = e.pos.clone().sub(p.pos).setY(0).normalize();
        p.vel.x = dir.x * 14; p.vel.z = dir.z * 14;
        p.invuln = 0.6;
        p.kick(-0.08);
        this.fx.addShake(0.5);
        sfx.execute();
        this.stats.executions++;
        e.die('execute');
        this.hud.message('EXECUTADO!', 'warn');
        this.hitstop = 0.09;
    }

    panOf(pos) {
        const p = this.player;
        const dx = pos.x - p.pos.x, dz = pos.z - p.pos.z;
        const right = dx * Math.cos(p.yaw) - dz * Math.sin(p.yaw);
        const d = Math.hypot(dx, dz) || 1;
        return Math.max(-1, Math.min(1, right / d)) * 0.8;
    }

    resize() {
        this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
        this.weaponCamera.aspect = innerWidth / innerHeight; this.weaponCamera.updateProjectionMatrix();
        this.renderer.setSize(innerWidth, innerHeight);
    }

    // ---------------- laço principal ----------------
    frame() {
        const now = performance.now();
        let dt = Math.min(0.05, (now - this.last) / 1000);
        this.last = now;

        if (input.pressed.has('KeyM')) { const on = toggleMusic(); if (this.hud) this.hud.message(on ? 'MÚSICA LIGADA' : 'MÚSICA DESLIGADA', 'info'); }

        if (this.state === 'playing') {
            if (this.hitstop > 0) { this.hitstop -= dt; dt *= 0.05; }
            if (this.slowmo > 0) { this.slowmo -= dt; if (this.slowmo <= 0) this.timeScale = 1; }
            dt *= this.timeScale;
            this.update(dt);
        } else if (this.state === 'menu') {
            // câmera orbitando a arena no menu
            const t = now / 1000;
            this.camera.position.set(Math.sin(t * 0.1) * 18, 6, Math.cos(t * 0.1) * 18);
            this.camera.lookAt(0, 2, 0);
            gameTime.value += dt;
        }
        this.pipeline.render();
        endFrame();
    }

    update(dt) {
        gameTime.value += dt;
        const p = this.player;
        this.stats.time += dt;

        p.update(dt, input, this.level);
        this.level.updateFlow(p.pos.x, p.pos.z);

        // armas
        for (let i = 1; i <= 6; i++) if (input.pressed.has('Digit' + i)) this.weapons.select(i);
        if (input.wheel) this.weapons.cycle(input.wheel > 0 ? 1 : -1);
        this.weapons.update(dt, input.mouseDown);

        // execução
        const exe = this.findExecutable();
        this.hud.executeHint(!!exe);
        if (exe && input.pressed.has('KeyF')) this.execute(exe);

        for (const e of this.enemies) if (e.alive) e.update(dt);
        this.enemies = this.enemies.filter(e => e.alive);
        this.projectiles.update(dt);
        this.pickups.update(dt, gameTime.value);
        this.updateWaves(dt);
        this.updateShock(dt);
        this.fx.update(dt);

        // portal
        this.portalDisc.lookAt(p.eye.x, 2, p.eye.z);
        this.portalRing.lookAt(p.eye.x, 2, p.eye.z);
        if (this.levelDone && p.pos.distanceTo(this.portal.position) < 1.8 && this.state === 'playing') this.completeLevel();

        // relâmpagos no céu de vez em quando
        skyFlash.value = Math.max(0, skyFlash.value - dt * 3);
        if (Math.random() < dt * 0.08) skyFlash.value = 0.8;

        // HUD
        this.hud.vitals(p);
        this.hud.ammo(p, this.weapons.current);
        this.hud.dash(p);
        this.hud.kills(this.stats.kills, this.stats.time);
        this.hud.compass(this.levelDone ? this.portal.position : null, p);
        if (this.boss) this.hud.boss(this.boss);

        const fighting = this.enemies.some(e => e.state !== 'spawn');
        setMusicIntensity(fighting ? 1 : 0.15);
    }
}

const game = new Game();
game.boot();
