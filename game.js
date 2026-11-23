// ════════════════════════════════════════════════════════════════════════════
//  PER MY LAST PUNCH — Glenntooth & Coffee Guy vs. the AI Transformation
//  A tag-team arena brawler in eight levels. three.js, no build step.
// ════════════════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const $ = id => document.getElementById(id);
const TAU = Math.PI * 2;
const rand = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU; return d; };
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const AX = 13, AZ = 5.6;                                   // arena half-extents: x is left/right, z is toward the camera
const store = {
  get() { try { return JSON.parse(localStorage.getItem('pmlp') || '{}'); } catch { return {}; } },
  set(o) { try { localStorage.setItem('pmlp', JSON.stringify({ ...this.get(), ...o })); } catch { /* private mode */ } },
};

// ------------------------------------------------------------------ state
const G = { mode: 'load', paused: false, story: true, level: 0, wave: -1, phase: '', time: 0, hitstop: 0, shake: 0, slowmo: 0, camX: 0,
  queue: [], spawnT: 0, gap: 0, cap: 6, hpScale: 1, dmgScale: 1, atkGap: .9, lastAtk: 0, boss: null, pending: null, assist: null, unify: null,
  microUsed: false, overT: 0, card: null, stats: { t: 0, dmg: 0, maxCombo: 0, kills: 0 }, endless: { wave: 0 }, pairId: 0, lastTick: 0, chips: 0, storm: null, input: 'kbm' };
const T = { caf: 150, tagCd: 0, assistCd: 0, bt: 0, aiT: 5, perks: new Set(), pc: 0 };      // team-wide: caffeine, cooldowns, perks, political capital
const P = { x: -5, z: 1, yaw: Math.PI / 2, st: 'free', t: 0, mv: null, hitDone: false, lspd: 0, buf: null, bufT: 0, inv: 0, root: 0, rev: 0, slow: 0,
  dodgeCd: 0, dvx: 0, dvz: 0, combo: 0, comboT: 0, castAt: 0, castDur: 0, castDone: false, castFn: null, dodgeProc: false, order: null, auto: false };
const M = { on: false, sx: 0, sy: 0, x: 0, z: 0, rmb: false, lmb: false };      // the mouse: where it is on screen, the floor point under it, buttons held
const team = []; let active = 0;
const enemies = [], hazards = [], zones = [], shots = [], rings = [], beams = [], pickups = [];
const perk = id => T.perks.has(id);

// ------------------------------------------------------------------ renderer
const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.75 : 2));      // phones have dense screens and small GPUs
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1, .1, 200);
scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3f55, 1.3));
const sun = new THREE.DirectionalLight(0xffffff, 1.3); sun.position.set(5, 14, 10); scene.add(sun);
const arena = new THREE.Group(); scene.add(arena);
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

// ------------------------------------------------------------------ audio (all synthesised)
let AC = null, master = null, musicBus = null, noiseBuf = null, muted = !!store.get().muted;      // the mute choice survives a reload
const MUSIC = { on: false, step: 0, next: 0, root: 55, bpm: 124 };
function initAudio() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
  master = AC.createGain(); master.gain.value = muted ? 0 : .5; master.connect(AC.destination);
  const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.connect(master);
  musicBus = AC.createGain(); musicBus.gain.value = .5; musicBus.connect(lp);
  noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
function tone(f0, f1, dur, type = 'sine', vol = .2, when = 0, dest = master) {
  if (!AC) return; const t = AC.currentTime + when, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur); o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + .02);
}
function noise(dur, vol = .2, freq = 2000, q = 1, when = 0, type = 'bandpass', dest = master) {
  if (!AC) return; const t = AC.currentTime + when, s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  s.buffer = noiseBuf; f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur); s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random() * .5, dur + .05);
}
const SFX = {
  swing: () => noise(.09, .05, 1800, .7),
  hit: () => { tone(170, 70, .09, 'sine', .35); noise(.06, .2, 2600, .8); },
  heavy: () => { tone(120, 45, .18, 'sine', .5); noise(.12, .28, 1400, .6); },
  clank: () => { tone(900, 700, .07, 'square', .1); noise(.05, .14, 5000, 2); },
  hurt: () => tone(260, 110, .2, 'sawtooth', .2),
  dodge: () => noise(.16, .1, 900, .5),
  tag: () => { tone(523, 523, .08, 'triangle', .25); tone(784, 784, .12, 'triangle', .25, .08); },
  pair: () => { tone(880, 880, .07, 'square', .1); tone(1320, 1320, .09, 'square', .1, .08); tone(1760, 1760, .12, 'square', .08, .17); },
  throw: () => noise(.12, .1, 1200, .6),
  splash: () => { noise(.25, .28, 700, .5); tone(200, 90, .15, 'sine', .25); },
  super: () => { [262, 330, 392, 523, 659].forEach((f, i) => tone(f, f * 1.5, .5, 'sawtooth', .08, i * .06)); noise(.6, .18, 400, .4); },
  kill: () => { tone(620, 90, .18, 'square', .12); noise(.14, .16, 1800, .6); },
  boom: () => { tone(90, 30, .6, 'sine', .6); noise(.5, .35, 300, .4); },
  pickup: () => { tone(880, 880, .07, 'sine', .2); tone(1175, 1175, .12, 'sine', .2, .07); },
  pew: () => tone(700, 300, .12, 'square', .06),
  warn: () => { tone(440, 440, .09, 'square', .08); tone(440, 440, .09, 'square', .08, .14); },
  boss: () => { tone(70, 50, 1.2, 'sawtooth', .28); tone(105, 75, 1.2, 'sawtooth', .18); noise(1, .14, 200, .5); },
  ui: () => tone(660, 660, .06, 'triangle', .18),
  ko: () => tone(300, 60, .7, 'sawtooth', .28),
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, f, .3, 'triangle', .2, i * .11)),
  pip: () => tone(330, 220, .3, 'square', .12),
  tick: () => tone(1500, 1100, .03, 'square', .03),
  summon: () => { [660, 880, 1320].forEach((f, i) => tone(f, f * 1.2, .09, 'triangle', .1, i * .05)); noise(.2, .06, 3000, 1); },
  thunder: () => { noise(.4, .3, 170, .4); tone(170, 38, .35, 'sawtooth', .22); },
  full: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, f, .12, 'square', .08, i * .06)),
};
const sfx = n => { if (AC && !muted && SFX[n]) SFX[n](); };
const BASS = [0, null, 0, null, 12, null, 0, 7, null, 0, null, 10, 12, null, 7, null];
function musicTick() {
  if (!AC || muted || !MUSIC.on || G.paused) return;
  const spb = 60 / MUSIC.bpm / 4; if (MUSIC.next < AC.currentTime) MUSIC.next = AC.currentTime + .05;
  while (MUSIC.next < AC.currentTime + .12) {
    const s = MUSIC.step++ % 32, w = MUSIC.next - AC.currentTime, n = BASS[s % 16];
    if (s % 4 === 0) tone(110, 40, .12, 'sine', .55, w);
    if (s % 4 === 2) noise(.04, .07, 7000, 1, w, 'highpass');
    if (s % 8 === 4) noise(.1, .1, 1800, .7, w);
    if (n !== null) { const f = MUSIC.root * Math.pow(2, (n + (s >= 24 ? 3 : 0)) / 12); tone(f, f, spb * 1.7, 'sawtooth', .16, w, musicBus); }
    MUSIC.next += spb;
  }
}
function setMusic(on, root = 55, bpm = 124) { MUSIC.on = on; MUSIC.root = root; MUSIC.bpm = bpm; }
function toggleMute() { muted = !muted; store.set({ muted }); if (master) master.gain.value = muted ? 0 : .5; toast(muted ? 'Muted. The standup continues silently.' : 'Sound on.', 1.6); }

// ------------------------------------------------------------------ DOM effects
const _v = new THREE.Vector3();
function toScreen(x, y, z) { _v.set(x, y, z).project(camera); return [(_v.x * .5 + .5) * innerWidth, (-_v.y * .5 + .5) * innerHeight]; }
function floatText(txt, x, y, z, cls = '') {
  const host = $('float'); if (host.childElementCount > 46) return;
  const d = document.createElement('div'); d.className = 'ft ' + cls; d.textContent = txt;
  const [sx, sy] = toScreen(x + rand(-.35, .35), y, z); d.style.left = sx + 'px'; d.style.top = sy + 'px';
  host.appendChild(d); setTimeout(() => d.remove(), 950);
}
const bubbles = [];
function say(e, txt, dur = 2.3) {
  let b = bubbles.find(q => q.e === e);
  if (!b) { b = { e, el: document.createElement('div') }; b.el.className = 'bubble' + (e.boss ? '' : ' sm'); $('float').appendChild(b.el); bubbles.push(b); }
  b.el.textContent = txt; b.t = dur;
}
function updateBubbles(dt) {
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i]; b.t -= dt;
    if (b.t <= 0 || !b.e.alive) { b.el.remove(); bubbles.splice(i, 1); continue; }
    const [x, y] = toScreen(b.e.x, b.e.def.h * b.e.scale + .4 + b.e.g.position.y, b.e.z);
    b.el.style.transform = `translate(${x | 0}px, ${y | 0}px) translate(-20%, -100%)`;
  }
}
let bannerT = 0, toastT = 0;
function banner(h, p = '', dur = 2.2, cls = '') { const b = $('banner'); b.className = 'on ' + cls; b.firstElementChild.textContent = h; b.lastElementChild.textContent = p; bannerT = dur; }
function toast(html, dur = 4.5) { const t = $('toast'); t.innerHTML = html; t.className = 'panel on'; toastT = dur; }
function flash() { const f = $('flash'); f.className = ''; void f.offsetWidth; f.className = 'on'; }
function card(html, acts, left = false) {
  $('cardIn').innerHTML = html; $('card').className = 'on' + (left ? ' left' : ''); G.card = acts; $('cardIn').scrollTop = 0;
  for (const d of [...$('float').querySelectorAll('.ft')]) d.remove();
  bannerT = toastT = 0; $('banner').className = ''; $('toast').className = 'panel'; PAD.sel = 0; padPick();
  for (const b of $('cardIn').querySelectorAll('[data-act]')) b.onclick = () => { initAudio(); const fn = G.card && G.card[b.dataset.act]; if (fn) { sfx('ui'); fn(); } };
}
function closeCard() { $('card').className = ''; G.card = null; }

// ------------------------------------------------------------------ geometry + textures
const geoCache = {};
const geo = (k, f) => geoCache[k] || (geoCache[k] = f());
const BOX = () => geo('box', () => new THREE.BoxGeometry(1, 1, 1));
const SPH = () => geo('sph', () => new THREE.SphereGeometry(.5, 18, 12));
const CYL = () => geo('cyl', () => new THREE.CylinderGeometry(.5, .5, 1, 18));
const CONE = () => geo('cone', () => new THREE.ConeGeometry(.5, 1, 18));
const ICO = () => geo('ico', () => new THREE.IcosahedronGeometry(.5, 0));
const TOR = () => geo('tor', () => new THREE.TorusGeometry(.5, .09, 8, 28));
const PLN = () => geo('pln', () => new THREE.PlaneGeometry(1, 1));
const RING = () => geo('ring', () => new THREE.RingGeometry(.92, 1, 56));
const DISC = () => geo('disc', () => new THREE.CircleGeometry(1, 40));
function canvasTex(w, h, draw) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; }
const faces = {};
function face(txt, bg, fg, font = 'bold 60px monospace', w = 128, h = 128) {            // a little screen for a robot to have a face on
  const k = [txt, bg, fg, font, w, h].join('|');
  return faces[k] || (faces[k] = canvasTex(w, h, g => { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, w / 2, h / 2 + 2); }));
}
function mk(parent, mats, g, color, sx, sy, sz, x, y, z, o = {}) {
  let m;
  if (o.face) { m = new THREE.MeshLambertMaterial({ color: 0xffffff, map: o.face, emissive: 0xffffff, emissiveMap: o.face, emissiveIntensity: .5, transparent: o.op != null, opacity: o.op ?? 1 }); m.userData.noFlash = true; }
  else { m = new THREE.MeshLambertMaterial({ color, emissive: o.em || 0, transparent: o.op != null, opacity: o.op ?? 1 }); m.userData.em = o.em || 0; }
  mats.push(m);
  const mesh = new THREE.Mesh(g, m); mesh.scale.set(sx, sy, sz); mesh.position.set(x, y, z);
  if (o.rx) mesh.rotation.x = o.rx; if (o.ry) mesh.rotation.y = o.ry; if (o.rz) mesh.rotation.z = o.rz;
  mesh.userData.y0 = y; parent.add(mesh); return mesh;
}
function flat(g, color, op) { const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false })); m.rotation.x = -Math.PI / 2; scene.add(m); return m; }
function kill3(m) { scene.remove(m); m.material?.dispose(); }          // groups (drones) share their materials and have none of their own

// ------------------------------------------------------------------ the eight rooms
function amesh(g, color, sx, sy, sz, x, y, z, o = {}) {
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, emissive: o.em || 0 })); m.scale.set(sx, sy, sz); m.position.set(x, y, z);
  if (o.ry) m.rotation.y = o.ry; if (o.rx) m.rotation.x = o.rx; arena.add(m); return m;
}
const abox = (w, h, d, color, x, y, z, o) => amesh(BOX(), color, w, h, d, x, y, z, o);
function plant(x, z) { amesh(CYL(), 0x8a5a3a, .6, .6, .6, x, .3, z); amesh(SPH(), 0x3fa35c, 1.1, 1.5, 1.1, x, 1.3, z); }
function poster(lines, x, y, w, h, bg = '#f4f1e8', fg = '#1b2430') {
  const arr = [].concat(lines), W = 512, H = Math.round(512 * h / w);
  const tex = canvasTex(W, H, g => {
    g.fillStyle = bg; g.fillRect(0, 0, W, H); g.strokeStyle = fg; g.lineWidth = 8; g.strokeRect(10, 10, W - 20, H - 20);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    const fs = Math.min((H - 40) / (arr.length * 1.12), 110);
    arr.forEach((t, i) => { let s = fs; g.font = `800 ${s}px system-ui, sans-serif`; while (g.measureText(t).width > W - 56 && s > 12) { s -= 3; g.font = `800 ${s}px system-ui, sans-serif`; } g.fillText(t, W / 2, H / 2 + (i - (arr.length - 1) / 2) * fs * 1.1); });
  });
  const m = new THREE.Mesh(PLN(), new THREE.MeshBasicMaterial({ map: tex })); m.scale.set(w, h, 1); m.position.set(x, y - .55, -AZ - 1.94); arena.add(m); return m;
}
function floorTex(c1, c2, kind) {
  const t = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = c1; g.fillRect(0, 0, w, h); g.fillStyle = c2; g.strokeStyle = c2;
    if (kind === 'tile') { g.fillRect(0, 0, w / 2, h / 2); g.fillRect(w / 2, h / 2, w / 2, h / 2); }
    else if (kind === 'wood') { for (let i = 0; i < 8; i++) { g.fillRect(0, i * 32, w, 3); g.fillRect((i * 97) % w, i * 32, 3, 32); } }
    else if (kind === 'grate') { g.lineWidth = 4; for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, h); g.moveTo(0, i * 32); g.lineTo(w, i * 32); g.stroke(); } }
    else for (let i = 0; i < 1100; i++) g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; const r = kind === 'tile' ? 20 : kind === 'grate' ? 10 : 9; t.repeat.set(r, r / 2); return t;
}
const THEMES = {
  eng: { sky: 0x1a2230, floor: ['#34425a', '#2b3850', 'carpet'], wall: 0x46587a, trim: 0x58c7ff, props() {
    for (const x of [-12, -8, -4, 4, 8, 12]) { abox(2.8, .12, 1.1, 0x8b6f4e, x, .95, -6.75); abox(1, .65, .08, 0x0c1118, x, 1.55, -6.95, { em: 0x16324a }); abox(.6, .95, .6, 0x232a36, x + .2, .48, -6.05); }
    poster(['SPRINT 47', '“STABILIZATION”'], -8, 4.5, 4.6, 2.2); poster(['DAYS SINCE', 'LAST REORG', '0'], 0, 4.5, 3.2, 2.7, '#ffd43b'); poster(['BLOCKERS:', 'yes'], 8, 4.5, 4.2, 2.2, '#ffffff', '#1c7ed6'); plant(-14.6, -6.3); plant(14.6, -6.3);
  } },
  coffee: { sky: 0x2a1d14, floor: ['#6b4a2f', '#573a23', 'wood'], wall: 0x8a6a4a, trim: 0xffb347, props() {
    abox(15, 1.1, 1.2, 0x4a2f1b, 0, .55, -6.7); abox(15.2, .1, 1.4, 0xd9c7a8, 0, 1.15, -6.7); abox(2.2, 1.3, .9, 0xb8bcc4, -4.5, 1.85, -6.8); abox(1.2, .8, .7, 0x30343a, 3.5, 1.6, -6.8);
    for (const x of [-1.5, -.5, .5, 1.5]) amesh(CYL(), 0xf4f1e8, .35, .4, .35, x, 1.4, -6.5);
    poster(['TODAY’S SPECIAL', 'DECAF.', 'ONLY DECAF.'], -6, 4.6, 4.6, 2.6, '#1f2a22', '#e9f5db'); poster(['OUT OF ORDER', '(upgraded to AI)'], 2, 4.5, 4.4, 2, '#fff3bf', '#c92a2a'); poster(['TIPS', 'are tokens now'], 9, 4.4, 3.4, 1.8); plant(-14.6, -6.3); plant(14.6, -6.3);
  } },
  hr: { sky: 0x241c2c, floor: ['#5b4b6e', '#4f4061', 'carpet'], wall: 0xb7a6c9, trim: 0xff7eb6, props() {
    for (const x of [-13, -11.8, -10.6, 10.6, 11.8, 13]) abox(1.05, 1.8, .8, 0x7a8799, x, .9, -6.9); abox(3.2, .12, 1.2, 0xd9c7a8, 0, .95, -6.7); abox(.7, .5, .5, 0x30343a, 0, 1.3, -6.7);
    poster(['MEETS SOME', 'EXPECTATIONS'], -6.5, 4.5, 5, 2.2, '#ffffff', '#c2255c'); poster(['OUR PEOPLE ARE', 'OUR GREATEST', 'LINE ITEM'], 0.2, 4.6, 4, 2.7); poster(['SUGGESTION BOX', '(it is a shredder)'], 6.8, 4.4, 4.6, 1.9, '#e7f5ff', '#1864ab');
  } },
  kitchen: { sky: 0x17262a, floor: ['#d9e3e6', '#a8bcc2', 'tile'], wall: 0x6fa3ad, trim: 0x7fd8ff, props() {
    abox(11, 1, 1.2, 0xf1f3f5, -7, .5, -6.8); abox(11.2, .1, 1.4, 0x495057, -7, 1.05, -6.8); abox(1, .6, .7, 0x212529, -9, 1.4, -6.8, { em: 0x1a1200 }); abox(.9, .9, .9, 0xced4da, -5, 1.55, -6.8);
    abox(3, .12, 1.6, 0xd9c7a8, 8, .95, -6.6); for (const x of [7, 9]) abox(.6, .9, .6, 0x343a40, x, .45, -5.95);
    poster(['FREE LUNCH*', '*see terms'], -7, 4.5, 4.4, 2.2, '#fff9db', '#e67700'); poster(['FRIDGE CLEANED FRIDAYS', 'PODS WILL BE EVICTED'], 0.5, 4.5, 5.4, 2); poster(['YOUR MOTHER', 'DOES NOT WORK HERE', '(she was reorged)'], 8.2, 4.5, 4.6, 2.5, '#ffffff', '#2b8a3e');
  } },
  conf: { sky: 0x1f2228, floor: ['#3d4654', '#333b48', 'carpet'], wall: 0x7d8794, trim: 0xff9f43, props() {
    abox(13, .14, 1.5, 0x4a3628, 0, 1, -6.6); abox(1.2, 1, 1.2, 0x2b2118, -4, .5, -6.6); abox(1.2, 1, 1.2, 0x2b2118, 4, .5, -6.6);
    for (let x = -6; x <= 6; x += 2) abox(.7, 1.15, .7, 0x23272e, x, .58, -5.75);
    poster(['Waiting for the host', 'to start this meeting…'], 0, 4.5, 7, 2.6, '#101418', '#e9ecef'); poster(['ROOM 4B', 'BOOKED UNTIL 2031'], -9.5, 4.4, 4, 2); poster(['AGENDA:', 'TBD'], 9.5, 4.4, 3.4, 2, '#fff3bf');
  } },
  server: { sky: 0x05080c, floor: ['#141a22', '#2a3644', 'grate'], wall: 0x0f1620, trim: 0x7cff6b, props() {
    for (let x = -14.3; x <= 14.4; x += 2.2) { abox(1.7, 3.1, 1.1, 0x10151c, x, 1.55, -6.9); for (let y = .5; y < 3; y += .5) abox(1.3, .1, .05, 0x10151c, x, y, -6.33, { em: Math.random() < .2 ? 0xff3b3b : 0x2bd45a }); }
    poster(['IT WORKED', 'IN STAGING'], -6, 4.75, 4, 1.5, '#041006', '#7cff6b'); poster(['DEPLOY FRIDAYS', 'WITHOUT FEAR'], 1, 4.75, 4.4, 1.5, '#041006', '#7cff6b'); poster(['UPTIME: 99.9%', '(of Tuesday)'], 8, 4.75, 4, 1.5, '#1a0505', '#ff6b6b');
  } },
  exec: { sky: 0x1b1622, floor: ['#3a2f4a', '#2f2640', 'carpet'], wall: 0x2b2238, trim: 0xffd166, props() {
    abox(4.5, .16, 1.5, 0x2b1a12, 0, 1.05, -6.6); abox(4.2, .9, 1.2, 0x3b2418, 0, .5, -6.6); abox(1.1, 1.9, .9, 0x1a1210, 0, .95, -7.1);
    abox(1.4, 1, .7, 0xffd166, 6, .5, -6.9, { em: 0x3a2c00 }); for (const x of [5.6, 6, 6.4]) amesh(CYL(), 0x5c940d, .18, .6, .18, x, 1.3, -6.9);
    poster(['VISION 2.0'], -8, 4.6, 4.4, 1.8, '#101418', '#ffd166'); poster(['SYNERGY ISN’T A BUZZWORD.', 'IT’S A LIFESTYLE.'], 0, 4.7, 6.4, 2, '#ffffff', '#5f3dc4'); poster(['EXECUTIVE BATHROOM', '→ key required'], 8.6, 4.5, 4.8, 1.9, '#fff9db'); plant(-14.6, -6.3); plant(14.6, -6.3);
  } },
  board: { sky: 0x140c08, floor: ['#5a2e1c', '#472213', 'wood'], wall: 0x3b2016, trim: 0xffd166, props() {
    abox(16, .2, 1.6, 0x4a1f10, 0, 1.05, -6.6); abox(15, .9, 1.1, 0x33150a, 0, .5, -6.6); for (let x = -7; x <= 7; x += 2) abox(.8, 1.5, .8, 0x1c0e09, x, .75, -5.8);
    poster(['Q4', 'NUMBER GO UP ↗'], 0, 4.7, 6, 2.6, '#101418', '#51cf66'); poster(['FOUNDER', '(AI-generated)'], -9, 4.6, 3, 2.4, '#d9c7a8', '#3b2016'); poster(['REAL', 'MAHOGANY'], 9, 4.6, 3.4, 2, '#3b2016', '#ffd166');
  } },
};
function buildArena(key) {
  if (arena.userData.key === key) return; arena.userData.key = key;
  for (const o of [...arena.children]) { arena.remove(o); o.material.map?.dispose(); o.material.dispose(); }
  const th = THEMES[key];
  scene.background = new THREE.Color(th.sky); scene.fog = new THREE.Fog(th.sky, 34, 80);
  const floor = new THREE.Mesh(PLN(), new THREE.MeshLambertMaterial({ map: floorTex(...th.floor) })); floor.scale.set(64, 32, 1); floor.rotation.x = -Math.PI / 2; floor.position.z = 5; arena.add(floor);
  const wall = amesh(PLN(), th.wall, 64, 12, 1, 0, 6, -AZ - 2);
  wall.material.side = THREE.DoubleSide;
  amesh(PLN(), th.wall, 30, 12, 1, -AX - 3.2, 6, 0, { ry: Math.PI / 2 }); amesh(PLN(), th.wall, 30, 12, 1, AX + 3.2, 6, 0, { ry: -Math.PI / 2 });
  abox(64, .22, .12, th.trim, 0, .11, -AZ - 1.9, { em: th.trim });
  for (const s of [-1, 1]) abox(.1, .03, AZ * 2, th.trim, s * (AX + .5), .02, 0, { em: th.trim });      // a line on the floor where the play area ends
  abox(AX * 2 + 1, .03, .1, th.trim, 0, .02, AZ + .5, { em: th.trim });
  th.props();
}

// ------------------------------------------------------------------ sparks, pulses, bolts
const sparks = []; let sparkI = 0;
{ const g = new THREE.BoxGeometry(.16, .16, .16); for (let i = 0; i < 160; i++) { const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff })); m.visible = false; scene.add(m); sparks.push({ m, t: 0, vx: 0, vy: 0, vz: 0 }); } }
function burst(x, y, z, color, n = 8, spd = 5) {
  for (let i = 0; i < n; i++) {
    const p = sparks[sparkI = (sparkI + 1) % sparks.length], a = rand(TAU), s = rand(.3, 1) * spd;
    p.m.material.color.setHex(color); p.m.position.set(x, y, z); p.m.visible = true; p.m.scale.setScalar(rand(.6, 1.7));
    p.vx = Math.sin(a) * s; p.vz = Math.cos(a) * s; p.vy = rand(2, 6.5); p.t = rand(.35, .75);
  }
}
const pulses = [], bolts = [];
function pulse(x, z, color, maxR = 3, dur = .35) { const m = flat(RING(), color, .9); m.position.set(x, .09, z); m.scale.setScalar(.01); pulses.push({ m, t: 0, dur, maxR }); }
function bolt(x1, y1, z1, x2, y2, z2, color = 0x6fb7ff, n = 5) {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true }), g = new THREE.Group(); let px = x1, py = y1, pz = z1;
  for (let i = 1; i <= n; i++) {
    const k = i / n, j = i < n ? .45 : 0, qx = x1 + (x2 - x1) * k + rand(-j, j), qy = y1 + (y2 - y1) * k + rand(-j, j), qz = z1 + (z2 - z1) * k + rand(-j, j);
    const s = new THREE.Mesh(BOX(), mat); s.position.set((px + qx) / 2, (py + qy) / 2, (pz + qz) / 2); s.scale.set(.1, .1, Math.hypot(qx - px, qy - py, qz - pz) || .01); s.lookAt(qx, qy, qz); g.add(s); px = qx; py = qy; pz = qz;
  }
  scene.add(g); bolts.push({ g, mat, t: .24 });
}
function updateFx(dt) {
  for (const p of sparks) {
    if (!p.m.visible) continue; p.t -= dt; if (p.t <= 0) { p.m.visible = false; continue; }
    p.vy -= 18 * dt; const q = p.m.position; q.x += p.vx * dt; q.y = Math.max(.06, q.y + p.vy * dt); q.z += p.vz * dt; p.m.rotation.x += dt * 9; p.m.rotation.y += dt * 7;
  }
  for (let i = pulses.length - 1; i >= 0; i--) { const p = pulses[i]; p.t += dt; const k = p.t / p.dur; if (k >= 1) { kill3(p.m); pulses.splice(i, 1); continue; } p.m.scale.setScalar(Math.max(.01, p.maxR * k)); p.m.material.opacity = .9 * (1 - k); }
  for (let i = bolts.length - 1; i >= 0; i--) { const b = bolts[i]; b.t -= dt; b.mat.opacity = clamp(b.t / .24, 0, 1); if (b.t <= 0) { scene.remove(b.g); b.mat.dispose(); bolts.splice(i, 1); } }
}

// ------------------------------------------------------------------ Bluetooth magic (Glenn) and summoned agents and drones (Coffee Guy)
const GLOW = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
// Invented runes: one stave and a couple of branches each. Deliberately nobody's logo.
const RUNE_SHAPES = [[[0, -1, .6, -.4], [0, -.2, .6, .4]], [[0, -1, .6, -.5], [.6, -.5, 0, 0]], [[-.5, -.6, 0, 0], [0, 0, .5, -.6]], [[0, -.6, .55, 0], [.55, 0, 0, .6]], [[-.5, .2, 0, -.4], [0, -.4, .5, .2]], [[0, -.9, .5, -.5], [0, .1, .5, .5], [-.5, -.2, 0, .2]]];
function drawRune(g, k, cx, cy, s) { g.beginPath(); g.moveTo(cx, cy - s); g.lineTo(cx, cy + s); for (const [x1, y1, x2, y2] of RUNE_SHAPES[k % 6]) { g.moveTo(cx + x1 * s, cy + y1 * s); g.lineTo(cx + x2 * s, cy + y2 * s); } g.stroke(); }
const inkGlow = (g, w) => { g.strokeStyle = '#e6f4ff'; g.lineWidth = w; g.lineCap = g.lineJoin = 'round'; g.shadowColor = '#4aa8ff'; g.shadowBlur = w * 2.2; };
const runeTexs = [0, 1, 2, 3, 4, 5].map(k => canvasTex(64, 64, g => { inkGlow(g, 5); drawRune(g, k, 32, 32, 20); }));
const sigilTex = canvasTex(512, 512, g => {               // the circle Glenn draws on the floor: rings, ticks, a hexagram and twelve runes
  const c = 256; inkGlow(g, 6); g.beginPath(); g.arc(c, c, 238, 0, TAU); g.stroke(); inkGlow(g, 2.5); g.beginPath(); g.arc(c, c, 206, 0, TAU); g.stroke(); g.beginPath(); g.arc(c, c, 122, 0, TAU); g.stroke();
  for (let i = 0; i < 36; i++) { const a = i / 36 * TAU, r0 = i % 3 ? 214 : 208; g.beginPath(); g.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0); g.lineTo(c + Math.cos(a) * 232, c + Math.sin(a) * 232); g.stroke(); }
  inkGlow(g, 3); for (let t = 0; t < 2; t++) { g.beginPath(); for (let i = 0; i <= 3; i++) { const a = (i / 3 + t / 6) * TAU - Math.PI / 2; g[i ? 'lineTo' : 'moveTo'](c + Math.cos(a) * 122, c + Math.sin(a) * 122); } g.stroke(); }
  inkGlow(g, 4); for (let i = 0; i < 12; i++) { g.save(); g.translate(c, c); g.rotate(i / 12 * TAU); g.translate(0, -165); drawRune(g, i, 0, 0, 20); g.restore(); }
  g.beginPath(); g.arc(c, c, 26, 0, TAU); g.stroke();
});
const sigils = [], links = [], allies = [];
function sigil(x, z, r, ttl, color = 0x6fb7ff, follow = null) {
  const m = new THREE.Mesh(PLN(), new THREE.MeshBasicMaterial({ map: sigilTex, color, opacity: 0, ...GLOW })); m.rotation.x = -Math.PI / 2; m.position.set(x, .13, z); m.scale.setScalar(r * 2); scene.add(m);
  sigils.push({ m, t: 0, ttl, follow, spin: rand(.7, 1.4) * pick([-1, 1]) });
}
function link(a, b, ttl) { const m = new THREE.Mesh(BOX(), new THREE.MeshBasicMaterial({ color: 0x9fd4ff, opacity: .8, ...GLOW })); scene.add(m); links.push({ a, b, m, t: ttl }); }
function pairUp(list, ttl) {                              // paired robots are tethered: for a while, a hit on one is partly felt by all of them
  const id = ++G.pairId; list = list.filter(e => e.alive);
  list.forEach((e, i) => { e.pair = id; e.pairT = ttl; sigil(e.x, e.z, e.r + .8, ttl, 0x6fb7ff, e); if (i && i < 9) link(list[i - 1], e, ttl); });
}
function updateMagic(dt) {
  for (let i = sigils.length - 1; i >= 0; i--) {
    const s = sigils[i], f = s.follow; s.t += dt;
    if (s.t >= s.ttl || (f && !f.alive)) { kill3(s.m); sigils.splice(i, 1); continue; }
    if (f) s.m.position.set(f.x, .13, f.z);
    s.m.rotation.z += s.spin * dt; s.m.material.opacity = Math.max(0, Math.min(1, s.t / .18, (s.ttl - s.t) / .35)) * .95;
  }
  for (let i = links.length - 1; i >= 0; i--) {
    const l = links[i]; l.t -= dt;
    if (l.t <= 0 || !l.a.alive || !l.b.alive) { kill3(l.m); links.splice(i, 1); continue; }
    const ya = l.a.def.h * l.a.scale * .55, yb = l.b.def.h * l.b.scale * .55, dx = l.b.x - l.a.x, dy = yb - ya, dz = l.b.z - l.a.z;
    l.m.position.set(l.a.x + dx / 2, ya + dy / 2, l.a.z + dz / 2); l.m.scale.set(.07, .07, Math.hypot(dx, dy, dz) || .01); l.m.lookAt(l.b.x, yb, l.b.z); l.m.material.opacity = Math.min(1, l.t / .4) * (.4 + .45 * Math.random());
  }
}
// Coffee Guy's side of it: delivery drones, and small agents that go and do the work
const droneBody = new THREE.MeshLambertMaterial({ color: 0x232a33 }), droneBlade = new THREE.MeshBasicMaterial({ color: 0xcfe9ff, transparent: true, opacity: .6, depthWrite: false });
const agentBody = new THREE.MeshLambertMaterial({ color: 0x14202c, emissive: 0x0b2a44 }), agentGlow = new THREE.MeshBasicMaterial({ color: 0x58c7ff, ...GLOW });
const agentFace = new THREE.MeshBasicMaterial({ map: face('>_', '#06121f', '#7fe0ff') });
const part = (g, geo, mat, sx, sy, sz, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); g.add(m); return m; };
function mkDrone() {                                      // a quadcopter with a coffee slung underneath
  const g = new THREE.Group(); g.userData.rotors = []; part(g, BOX(), droneBody, .42, .1, .42, 0, 0, 0); part(g, SPH(), agentGlow, .1, .1, .1, 0, -.01, .22);
  for (const [x, z] of [[-.3, -.3], [.3, -.3], [-.3, .3], [.3, .3]]) { part(g, BOX(), droneBody, .07, .05, .07, x, .05, z); g.userData.rotors.push(part(g, BOX(), droneBlade, .36, .012, .05, x, .1, z)); }
  part(g, CYL(), cupMat, .2, .24, .2, 0, -.2, 0); part(g, CYL(), coffeeMat, .17, .02, .17, 0, -.075, 0); return g;
}
function mkAgent() {                                      // a small cube with a prompt for a face and a halo
  const g = new THREE.Group(); part(g, BOX(), agentBody, .3, .3, .3, 0, 0, 0); part(g, PLN(), agentFace, .24, .24, 1, 0, 0, .155); part(g, BOX(), agentGlow, .03, .16, .03, 0, .23, 0);
  g.userData.halo = part(g, TOR(), agentGlow, .56, .56, .56, 0, 0, 0); g.userData.halo.rotation.x = Math.PI / 2; return g;
}
const AGENT_WORDS = ['thinking…', 'tool call', 'reading the docs', 'retrying', 'done ✔', 'rate limited', 'writing tests', 'plan: punch', 'let me check', 'delegating', 'LGTM', 'compacting…'];
function spawnAgents(x, z, n, life) {
  for (let i = 0; i < n; i++) { const g = mkAgent(), a = rand(TAU); g.scale.setScalar(.01); scene.add(g); allies.push({ kind: 'agent', g, x: clamp(x + Math.sin(a) * .8, -AX, AX), z: clamp(z + Math.cos(a) * .8, -AZ, AZ), y: 1.15, t: 0, life: life * rand(.9, 1.1), hitCd: rand(.15, .5), say: rand(.4, 2.4), seed: rand(10), tgt: null }); }
  floatText(n > 4 ? 'spinning up a fleet…' : 'spawning subagents…', x, 2.7, z, 'tag'); sfx('summon');
}
function spawnDrones(n, life) { for (let i = 0; i < n; i++) { const g = mkDrone(); scene.add(g); allies.push({ kind: 'drone', g, i, n, x: P.x, z: P.z, y: 7 + i, t: 0, life, fire: .5 + i * .15 }); } }
function agentHit() {                                     // chip damage from a summon: it feeds the combo and the caffeine, but never freezes the game
  if (++G.chips % 3 === 0) { P.combo++; G.stats.maxCombo = Math.max(G.stats.maxCombo, P.combo); }      // every third one counts toward the combo, so a swarm doesn't make it meaningless
  P.comboT = 2.6; addCaf(2);
  if (G.time - G.lastTick > .11) { G.lastTick = G.time; sfx('tick'); }
}
function updateAllies(dt) {
  for (let i = allies.length - 1; i >= 0; i--) {
    const a = allies[i]; a.t += dt;
    if (a.t > a.life) { burst(a.x, a.y, a.z, 0x58c7ff, 6, 4); if (a.kind === 'agent' && Math.random() < .3) floatText('context window full', a.x, a.y + .5, a.z, 'dim'); scene.remove(a.g); allies.splice(i, 1); continue; }
    if (a.kind === 'agent') {
      if (!a.tgt || !a.tgt.alive) a.tgt = nearestEnemy(a.x, a.z, 20, 0, 4);
      const e = a.tgt, dx = (e ? e.x : P.x) - a.x, dz = (e ? e.z : P.z) - a.z, d = Math.hypot(dx, dz) || .001, want = e ? e.r + .5 : 1.7;
      if (d > want) { const sp = Math.min(10, 4 + d * 3) * dt; a.x += dx / d * sp + Math.cos(a.t * 7 + a.seed) * dt * 1.5; a.z += dz / d * sp + Math.sin(a.t * 7 + a.seed) * dt * 1.5; }
      else if (e && (a.hitCd -= dt) <= 0) { a.hitCd = .55; bolt(a.x, a.y, a.z, e.x, e.def.h * e.scale * .5, e.z, 0x7fe0ff, 2); damageEnemy(e, 2.5, { x: a.x, z: a.z, chip: true, quiet: true, pierce: true }); agentHit(); }
      a.y = 1.15 + Math.sin(a.t * 6 + a.seed) * .12; a.g.position.set(a.x, a.y, a.z); a.g.rotation.y = Math.atan2(dx, dz); a.g.userData.halo.rotation.z += dt * 9;
      a.g.scale.setScalar(Math.max(.01, Math.min(1, a.t / .25, (a.life - a.t) / .25)) * 1.5);
      if ((a.say -= dt) <= 0) { a.say = rand(2.2, 4); floatText(pick(AGENT_WORDS), a.x, a.y + .45, a.z, 'dim'); }
    } else {                                              // an escort drone: circles Coffee Guy and shoots at whatever is closest
      const ang = a.t * 2.4 + a.i / a.n * TAU; a.x = P.x + Math.sin(ang) * 1.9; a.z = P.z + Math.cos(ang) * 1.9; a.y += (2.5 + Math.sin(a.t * 5 + a.i) * .15 - a.y) * Math.min(1, dt * 6);
      a.g.position.set(a.x, a.y, a.z); a.g.rotation.y = ang + Math.PI / 2; for (const r of a.g.userData.rotors) r.rotation.y += dt * 40;
      if ((a.fire -= dt) <= 0) { const e = nearestEnemy(a.x, a.z, 11, 0, 4); a.fire = e ? .6 : .2; if (e) { shot({ x: a.x, z: a.z, y: 1.3, ang: Math.atan2(e.x - a.x, e.z - a.z), speed: 20, r: .16, dmg: 3, color: 0x7fe0ff, friendly: true, ttl: .7 }); sfx('pew'); } }
    }
  }
}
let auraT = 0;
function updateAuras(dt) {                                // Glenn's orbiting runes (bright when his special is ready) and Coffee Guy's drone at his shoulder
  auraT += dt; const t = auraT;
  for (const f of team) {
    if (f.runes) f.runes.forEach((s, i) => { const a = t * 1.7 + i * TAU / 3; s.position.set(Math.sin(a) * .8, 1 + i * .36 + Math.sin(t * 2 + i) * .08, Math.cos(a) * .8); s.material.opacity = f.spCd <= 0 ? .95 : .3; });
    if (f.pet) { f.pet.position.set(.62, 2.12 + Math.sin(t * 3) * .07, -.22); f.pet.rotation.y = Math.sin(t * 1.3) * .5; for (const r of f.pet.userData.rotors) r.rotation.y += dt * 40; }
  }
}

// ------------------------------------------------------------------ the tag team
const FDEF = [
  { key: 'glenn', name: 'GLENNTOOTH', hex: 0xffb347, maxHp: 115, speed: 6.1, dmg: 1.1, rate: 1, spMax: 5.5 },
  { key: 'coffee', name: 'COFFEE GUY', hex: 0x58c7ff, maxHp: 95, speed: 6.9, dmg: .95, rate: 1.16, spMax: 6 },
];
const GTITLE = ['Acting Director of Connectivity', 'Acting Director of Connectivity', 'VP of Connectivity', 'SVP of Connectivity & Standards', 'SVP of Connectivity & Standards', 'Chief Connectivity Officer', 'Chief Connectivity Officer', 'Chief Connectivity Officer'];
const loader = new GLTFLoader(), progress = {};
async function loadFighter(def) {
  const gltf = await loader.loadAsync(`assets/${def.key}.glb`, ev => {
    progress[def.key] = [ev.loaded, ev.total || ev.loaded]; const v = Object.values(progress);
    const go = $('go'); if (go && G.mode !== 'ready') go.textContent = `Loading the tag team… ${Math.round(100 * v.reduce((a, b) => a + b[0], 0) / Math.max(1, v.reduce((a, b) => a + b[1], 0)))}%`;
  });
  const model = gltf.scene, mats = [], g = new THREE.Group();
  model.traverse(o => { if (o.isMesh) { o.material = new THREE.MeshBasicMaterial({ map: o.material.map }); o.frustumCulled = false; mats.push(o.material); } });
  g.add(model); model.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(model), h = bb.max.y - bb.min.y;
  if (h > .4 && h < 6) model.scale.multiplyScalar(1.82 / h);                // keep whatever proportions the model has, at a known height
  const sh = new THREE.Mesh(DISC(), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: .3, depthWrite: false })); sh.rotation.x = -Math.PI / 2; sh.position.y = .04; sh.scale.setScalar(.5); g.add(sh);
  const ring = new THREE.Mesh(RING(), new THREE.MeshBasicMaterial({ color: def.hex, side: THREE.DoubleSide, transparent: true, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = .05; ring.scale.setScalar(.66); g.add(ring);
  scene.add(g);
  const f = { ...def, g, model, mats, mixer: new THREE.AnimationMixer(model), actions: {}, cur: null, curName: '', hp: def.maxHp, rec: def.maxHp, ko: false, spCd: 0, pip: 0, flash: 0, tint: 0xffffff, modelH: h };
  for (const c of gltf.animations) f.actions[c.name] = f.mixer.clipAction(c);
  if (def.key === 'glenn') f.runes = [0, 2, 4].map(k => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: runeTexs[k], color: 0x8fd0ff, ...GLOW })); s.scale.setScalar(.36); g.add(s); return s; });
  else { f.pet = mkDrone(); f.pet.scale.setScalar(.8); g.add(f.pet); }
  loopClip(f, 'Idle'); return f;
}
function loopClip(f, name, ts = 1) {
  const a = f.actions[name]; if (!a) return;
  if (f.curName !== name) { if (f.cur) f.cur.fadeOut(.12); a.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(.12).play(); f.cur = a; f.curName = name; }
  a.timeScale = ts;
}
function oneShot(f, name, dur) {
  const a = f.actions[name]; if (!a) return;
  const same = f.cur === a; if (f.cur && !same) f.cur.fadeOut(.07);
  a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.timeScale = dur ? a.getClip().duration / dur : 1;
  if (!same) a.fadeIn(.07); a.play(); f.cur = a; f.curName = name + '!';
}
function tint(f, hex) { if (f.tint === hex) return; f.tint = hex; for (const m of f.mats) m.color.setHex(hex); }
function portrait(f) {                                    // render the fighter's head once, for the HUD
  f.g.position.set(0, 0, 0); f.g.rotation.y = 0; f.mixer.update(0); f.g.updateMatrixWorld(true);
  let head = null; f.g.traverse(o => { if (!head && /^head$/i.test(o.name)) head = o; });
  const hp = new THREE.Vector3(0, 1.62, 0); if (head) head.getWorldPosition(hp);
  const cam = new THREE.PerspectiveCamera(30, 1, .05, 20); cam.position.set(hp.x + .3, hp.y + .16, hp.z + 1.25); cam.lookAt(hp.x, hp.y + .1, hp.z);
  const s = new THREE.Scene(); s.background = new THREE.Color(f.hex).multiplyScalar(.3); s.add(f.g);
  renderer.setSize(128, 128, false); renderer.render(s, cam); const url = renderer.domElement.toDataURL('image/png');
  scene.add(f.g); resize(); return url;
}

// ------------------------------------------------------------------ caffeine
const CAF_TIERS = [[100, 'Drowsy', .9], [400, 'Optimal', 1], [600, 'Buzzing', 1.08], [800, 'Wired', 1.15], [Infinity, 'LB MODE', 1.25]];
const cafTier = () => CAF_TIERS.find(t => T.caf < t[0]);
function addCaf(v) { const was = T.caf; T.caf = clamp(T.caf + v, 0, 800); if (was < 800 && T.caf >= 800) { sfx('full'); toast(`<b>800mg.</b> LB Mode. Press <kbd>${K('super')}</kbd> for a super.`, 3); } }
const dmgMult = () => cafTier()[2] * (perk('board') ? 1.15 : 1) * (T.bt > 0 ? 1.4 : 1);

// ------------------------------------------------------------------ things that hurt: telegraphed circles, puddles, projectiles, shockwaves, beams
function hazard(o) {                                      // a circle on the floor that fills up, then goes off
  const c = o.color || 0xff4d4d, h = { repeat: 0, gap: 1, ...o, color: c, t: 0, ring: flat(RING(), c, .9), disc: flat(DISC(), c, .3) };
  h.ring.position.set(h.x, .07, h.z); h.disc.position.set(h.x, .06, h.z); h.ring.scale.setScalar(h.r); h.disc.scale.setScalar(.01); hazards.push(h); return h;
}
function rmHazard(i) { const h = hazards[i]; kill3(h.ring); kill3(h.disc); hazards.splice(i, 1); }
function updateHazards(dt) {
  for (let i = hazards.length - 1; i >= 0; i--) {
    const h = hazards[i], o = h.owner;
    if (o && (!o.alive || (!o.boss && o.stun > 0))) { rmHazard(i); continue; }            // hit the robot and its attack is cancelled
    h.t += dt; const k = Math.min(1, h.t / h.delay); h.disc.scale.setScalar(Math.max(.01, h.r * k)); h.disc.material.opacity = .16 + .32 * k;
    if (h.t < h.delay) continue;
    if (h.dmg > 0 && Math.hypot(P.x - h.x, P.z - h.z) < h.r + .25) hurtPlayer(h.dmg, h);
    pulse(h.x, h.z, h.color, h.r * 1.15, .25); if (h.dmg > 0) burst(h.x, .3, h.z, h.color, 6, 4);
    if (h.repeat > 0) { h.repeat--; h.t = 0; h.delay = h.gap; } else rmHazard(i);
  }
}
function zone(o) { const z = { ...o, t: 0, tick: .3, m: flat(DISC(), o.color, .4) }; z.m.position.set(o.x, .05, o.z); z.m.scale.setScalar(o.r); zones.push(z); }
function updateZones(dt) {
  for (let i = zones.length - 1; i >= 0; i--) {
    const z = zones[i]; z.t += dt; z.tick -= dt; z.m.material.opacity = .4 * clamp((z.ttl - z.t) / .8, 0, 1) * (.8 + .2 * Math.sin(z.t * 14));
    if (z.t > z.ttl) { kill3(z.m); zones.splice(i, 1); continue; }
    if (z.tick <= 0 && Math.hypot(P.x - z.x, P.z - z.z) < z.r + .2) { z.tick = .5; hurtPlayer(z.dmg, { x: z.x, z: z.z, effect: z.effect, soft: true }); }
  }
}
function shot(o) {
  if (o.from) { o.x = o.from.x; o.z = o.from.z; o.owner = o.from; o.y = o.y ?? Math.min(1.4, o.from.def.h * .5); }
  const s = { r: .34, ttl: 4, y: 1.2, homing: 0, color: 0xff5555, ...o };
  s.m = s.drone ? mkDrone() : new THREE.Mesh(s.card ? BOX() : SPH(), new THREE.MeshBasicMaterial({ color: s.color }));
  if (s.drone) { s.m.scale.setScalar(1.25); s.m.rotation.y = s.ang; } else if (s.card) s.m.scale.set(s.r * 2.4, s.r * 1.7, .08); else s.m.scale.setScalar(s.r * 2);
  s.vx = Math.sin(s.ang) * s.speed; s.vz = Math.cos(s.ang) * s.speed; s.m.position.set(s.x, s.y, s.z); scene.add(s.m); shots.push(s); return s;
}
function updateShots(eDt, dt) {
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i]; if (!s) continue;                 // an espresso that finishes off a boss clears the room, this list included
    const d = s.friendly ? dt : eDt; s.ttl -= d;
    if (s.homing) { const cur = Math.atan2(s.vx, s.vz), a = cur + clamp(angDiff(Math.atan2(P.x - s.x, P.z - s.z), cur), -s.homing * d, s.homing * d); s.vx = Math.sin(a) * s.speed; s.vz = Math.cos(a) * s.speed; }
    s.x += s.vx * d; s.z += s.vz * d; s.m.position.set(s.x, s.y, s.z);
    if (s.drone) for (const r of s.m.userData.rotors) r.rotation.y += d * 40; else s.m.rotation.y += d * 7;
    let dead = s.ttl <= 0 || Math.abs(s.x) > AX + 4 || Math.abs(s.z) > AZ + 4;
    if (s.friendly) {                                     // a delivery drone flies to where it was sent; anything else stops at the first robot it meets
      let hit = null; if (!dead && !s.fly) for (const e of enemies) if (e.spawn <= 0 && Math.hypot(e.x - s.x, e.z - s.z) < e.r + s.r + .25) { hit = e; dead = true; break; }
      if (dead && s.splash) splash(s);
      else if (hit) { burst(s.x, s.y, s.z, s.color, 3, 3); damageEnemy(hit, s.dmg, { x: s.x, z: s.z, chip: true, quiet: true, pierce: true }); agentHit(); }
    }
    else if (!dead && Math.hypot(P.x - s.x, P.z - s.z) < s.r + .5 && hurtPlayer(s.dmg, s)) dead = true;
    if (dead) { kill3(s.m); const j = shots.indexOf(s); if (j >= 0) shots.splice(j, 1); }
  }
}
function splash(s) {                                      // Coffee Guy's espresso landing
  let n = 0; for (const e of [...enemies]) if (Math.hypot(e.x - s.x, e.z - s.z) < s.splash + e.r && damageEnemy(e, s.dmg, { x: s.x, z: s.z, kb: 9, heavy: true, pierce: true, stun: .7, word: n ? null : 'SCALDED' })) n++;
  pulse(s.x, s.z, 0xc98a3a, s.splash * 1.1, .35); burst(s.x, .8, s.z, 0x8b5a2b, 18, 7); burst(s.x, .8, s.z, 0xf4f1e8, 6, 5); sfx('splash'); if (n) landed(true, n, 9 * n);
  if (s.agents && G.phase !== 'done') { pulse(s.x, s.z, 0x58c7ff, 2.2, .4); spawnAgents(s.x, s.z, s.agents, 5); }       // and out of the splash climb the agents
}
function ringWave(o) { const r = { r: .6, dir: 1, hit: false, color: 0xff4d4d, ...o }; r.m = flat(RING(), r.color, .95); r.m.position.set(r.x, .1, r.z); r.m.scale.setScalar(r.r); rings.push(r); sfx('warn'); }
function updateRings(dt) {
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i]; r.r += r.speed * dt * r.dir; r.m.scale.setScalar(Math.max(.01, r.r));
    if (!r.hit && Math.abs(Math.hypot(P.x - r.x, P.z - r.z) - r.r) < .5 && hurtPlayer(r.dmg, r)) r.hit = true;
    if (r.dir > 0 && r.r >= r.maxR) { if (r.back) { r.back = false; r.dir = -1; r.hit = false; } else { kill3(r.m); rings.splice(i, 1); } }       // “let's circle back”
    else if (r.dir < 0 && r.r <= .7) { kill3(r.m); rings.splice(i, 1); }
  }
}
function beam(o) {
  const b = { warm: .7, len: 15, color: 0xff4d4d, hitCd: 0, t: 0, ...o }; b.g = new THREE.Group();
  b.m = new THREE.Mesh(BOX(), new THREE.MeshBasicMaterial({ color: b.color, transparent: true, opacity: .3 })); b.m.scale.set(.5, .3, b.len); b.m.position.set(0, 1, b.len / 2); b.g.add(b.m);
  b.g.position.set(b.owner.x, 0, b.owner.z); b.g.rotation.y = b.ang; scene.add(b.g); beams.push(b); sfx('warn');
}
function updateBeams(dt) {
  for (let i = beams.length - 1; i >= 0; i--) {
    const b = beams[i]; b.t += dt;
    if (b.t > b.ttl || !b.owner.alive) { scene.remove(b.g); b.m.material.dispose(); beams.splice(i, 1); continue; }
    const live = b.t > b.warm; if (live) b.ang += b.w * dt;
    b.m.material.opacity = live ? .9 : .25 + .2 * Math.sin(b.t * 30); b.m.scale.x = live ? .55 : .14; b.g.position.set(b.owner.x, 0, b.owner.z); b.g.rotation.y = b.ang; b.hitCd -= dt;
    if (!live || b.hitCd > 0) continue;
    const dx = P.x - b.owner.x, dz = P.z - b.owner.z, s = Math.sin(b.ang), c = Math.cos(b.ang), along = dx * s + dz * c, perp = Math.abs(dx * c - dz * s);
    if (along > .5 && along < b.len && perp < .75 && hurtPlayer(b.dmg, { x: P.x - c, z: P.z + s })) b.hitCd = .7;
  }
}
function clearCombat(all) {
  while (hazards.length) rmHazard(0);
  for (const z of zones) kill3(z.m); zones.length = 0;
  for (const s of shots) kill3(s.m); shots.length = 0;
  for (const r of rings) kill3(r.m); rings.length = 0;
  for (const b of beams) { scene.remove(b.g); b.m.material.dispose(); } beams.length = 0;
  if (all) {
    for (const p of pickups) scene.remove(p.g); pickups.length = 0;
    for (const a of allies) scene.remove(a.g); allies.length = 0; for (const s of sigils) kill3(s.m); sigils.length = 0; for (const l of links) kill3(l.m); links.length = 0; G.storm = null;
  }
}
const cupMat = new THREE.MeshLambertMaterial({ color: 0xf4f1e8 }), coffeeMat = new THREE.MeshLambertMaterial({ color: 0x5a3a22 }), donutMat = new THREE.MeshLambertMaterial({ color: 0xff8fc7, emissive: 0x4a1030 });
function dropPickup(x, z, kind) {
  const g = new THREE.Group();
  if (kind === 'coffee') { const c = new THREE.Mesh(CYL(), cupMat); c.scale.set(.42, .5, .42); const t = new THREE.Mesh(CYL(), coffeeMat); t.scale.set(.36, .04, .36); t.position.y = .25; g.add(c, t); }
  else { const d = new THREE.Mesh(TOR(), donutMat); d.scale.setScalar(.75); d.rotation.x = Math.PI / 2.6; g.add(d); }
  g.position.set(x, .6, z); scene.add(g); pickups.push({ g, x, z, kind, t: 0 });
}
function updatePickups(dt) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i]; p.t += dt; p.g.position.y = .65 + Math.sin(p.t * 4) * .12; p.g.rotation.y += dt * 2.5; p.g.visible = p.t < 11 || (p.t * 8 | 0) % 2 === 0;
    let gone = p.t > 14;
    if (!gone && Math.hypot(P.x - p.x, P.z - p.z) < 1.3 && P.st !== 'ko') {
      gone = true; sfx('pickup'); const f = team[active];
      if (p.kind === 'coffee') { addCaf(120); floatText('+120mg', p.x, 1.6, p.z, 'heal'); }
      else { const v = perk('dessert') ? 44 : 22; f.rec = Math.min(f.maxHp, f.rec + v); f.hp = Math.min(f.rec, f.hp + v); floatText(`+${v} morale`, p.x, 1.6, p.z, 'heal'); }
    }
    if (gone) { scene.remove(p.g); pickups.splice(i, 1); }
  }
}

// ------------------------------------------------------------------ robots: how they look
const BUILD = {
  halluc(B, o) {
    const op = o.decoy ? .36 : .96; B(ICO(), 0xb07cff, 1.15, 1.35, 1.15, 0, 1.15, 0, { op, em: 0x2a1050 });
    B(PLN(), 0, .7, .7, 1, 0, 1.2, .6, { face: face('?!', '#1a0b2e', '#ff7bf2'), op });
    return { armL: B(SPH(), 0xd9b8ff, .32, .32, .32, -.82, 1.1, .2, { op }), armR: B(SPH(), 0xd9b8ff, .32, .32, .32, .82, 1.1, .2, { op }), hover: .25 };
  },
  replyall(B) {
    B(BOX(), 0xf4f1e8, .95, .6, .12, 0, 1.4, 0); B(PLN(), 0, .9, .56, 1, 0, 1.4, .07, { face: face('@all', '#f4f1e8', '#d6336c', 'bold 46px monospace') });
    return { armL: B(BOX(), 0x58c7ff, .5, .04, .16, -.6, 1.76, 0), armR: B(BOX(), 0x58c7ff, .5, .04, .16, .6, 1.76, 0), hover: .2, rotor: true };
  },
  burner(B) {
    B(CYL(), 0x7a2b1a, 1.2, 1.3, 1.2, 0, .75, 0); B(CYL(), 0x30201c, .9, .25, .9, 0, 1.5, 0); B(PLN(), 0, .7, .7, 1, 0, .8, .62, { face: face('$', '#2a0d05', '#ffb347', 'bold 96px monospace') });
    return { flame: B(CONE(), 0xff8a1e, .6, .9, .6, 0, 2.05, 0, { em: 0xff5a00 }), armL: B(BOX(), 0x30201c, .22, .7, .22, -.75, .8, 0), armR: B(BOX(), 0x30201c, .22, .7, .22, .75, .8, 0) };
  },
  creep(B) {
    B(SPH(), 0x5fd38d, 1.3, 1, 1.3, 0, .5, 0); B(SPH(), 0x4cc27c, 1, .8, 1, 0, 1.15, 0); B(SPH(), 0x3fb06d, .7, .6, .7, 0, 1.7, 0);
    B(PLN(), 0, .6, .6, 1, 0, 1.15, .52, { face: face('+1', '#0d2a1a', '#9dffbf') }); return {};
  },
  invite(B) {
    B(BOX(), 0xf4f1e8, .95, 1.1, .3, 0, 1.25, 0); B(BOX(), 0xe03131, .97, .28, .32, 0, 1.72, 0); B(PLN(), 0, .8, .7, 1, 0, 1.15, .16, { face: face('31', '#f4f1e8', '#1b2430', 'bold 84px system-ui') });
    B(CYL(), 0x555b66, .12, .7, .12, -.25, .35, 0); B(CYL(), 0x555b66, .12, .7, .12, .25, .35, 0);
    return { armL: B(BOX(), 0x555b66, .14, .6, .14, -.6, 1.2, 0), armR: B(BOX(), 0x555b66, .14, .6, .14, .6, 1.2, 0) };
  },
  inject(B) {
    B(CONE(), 0x16211a, .9, 1.5, .9, 0, .95, 0); B(SPH(), 0x1f3a26, .7, .7, .7, 0, 1.75, 0); B(PLN(), 0, .5, .5, 1, 0, 1.75, .36, { face: face('>_', '#041006', '#7cff6b') });
    B(CYL(), 0x7cff6b, .07, .9, .07, .5, 1.5, .3, { em: 0x3cff2b, rx: Math.PI / 2 }); return { hover: .12 };
  },
  review(B) {
    B(BOX(), 0x59636f, 1.1, 1.2, .9, 0, .9, 0); B(BOX(), 0x3a424c, .7, .5, .6, 0, 1.75, 0); B(PLN(), 0, .5, .3, 1, 0, 1.78, .31, { face: face('• •', '#220000', '#ff4040') });
    const sh = B(BOX(), 0xcfd6de, 1.3, 1.5, .1, 0, 1, .68), shf = B(PLN(), 0, 1.1, 1.1, 1, 0, 1.05, .74, { face: face('✗', '#cfd6de', '#e03131', 'bold 110px system-ui') });
    return { shield: [sh, shf], drop: 1.9, armL: B(BOX(), 0x3a424c, .25, .8, .25, -.72, .95, 0), armR: B(BOX(), 0x3a424c, .25, .8, .25, .72, .95, 0) };
  },
  yesbot(B) {
    B(SPH(), 0xffd43b, 1.1, 1.1, 1.1, 0, 1.05, 0); B(PLN(), 0, .7, .7, 1, 0, 1.1, .56, { face: face(':D', '#ffd43b', '#3b2f00') }); B(CYL(), 0x8a6d00, .5, .3, .5, 0, .3, 0);
    return { armR: B(BOX(), 0xffe066, .2, .7, .2, .72, 1.5, 0), hover: .1 };
  },
  loop(B) {
    B(CONE(), 0x2f9e9e, 1.1, 1.1, 1.1, 0, .6, 0, { rx: Math.PI }); B(TOR(), 0xffd43b, 1.5, 1.5, 1.5, 0, 1.15, 0, { rx: Math.PI / 2, em: 0x665500 }); B(SPH(), 0x1c5f5f, .7, .7, .7, 0, 1.4, 0);
    B(PLN(), 0, .5, .5, 1, 0, 1.42, .36, { face: face('∞', '#062a2a', '#77ffff', 'bold 96px system-ui') }); return {};
  },
  pod(B) { B(BOX(), 0x3b7de0, .7, .7, .7, 0, .5, 0); B(PLN(), 0, .6, .6, 1, 0, .5, .36, { face: face('pod', '#3b7de0', '#ffffff', 'bold 46px monospace') }); return { hover: .08 }; },
  // ---- the bogeymen
  synergy(B) {
    B(CYL(), 0x146464, 2.4, .4, 2.4, 0, .2, 0); B(CYL(), 0x1f8f8f, 1.7, 2.6, 1.7, 0, 1.6, 0); B(BOX(), 0x0d3b3b, 2.6, 1.4, .3, 0, 3.6, 0);
    B(PLN(), 0, 2.4, 1.2, 1, 0, 3.6, .16, { face: face('SYNERGY', '#062a2a', '#77ffff', 'bold 50px system-ui', 256, 128) });
    for (const [x, y, c] of [[-.5, 2.2, 0xffd43b], [.1, 1.8, 0xff7eb6], [.5, 2.4, 0x7ee787], [-.2, 1.3, 0x58c7ff]]) B(BOX(), c, .4, .4, .04, x, y, .86);      // sticky notes
    return { armL: B(CONE(), 0xffd43b, .8, 1.1, .8, -1.35, 2.3, .3, { rx: -Math.PI / 2 }), armR: B(CONE(), 0xffd43b, .8, 1.1, .8, 1.35, 2.3, .3, { rx: -Math.PI / 2 }) };
  },
  barista(B) {
    B(BOX(), 0x30343a, 2.4, .5, 1.5, 0, .25, 0); B(BOX(), 0x5a3a22, 3, .5, 1.9, 0, .75, 0); B(BOX(), 0xb8bcc4, 2.8, 2, 1.7, 0, 2, 0); B(BOX(), 0x7a8088, 3, .25, 1.9, 0, 3.12, 0);
    B(PLN(), 0, 1.7, .85, 1, 0, 2.35, .86, { face: face('DECAF', '#1a0f08', '#ffb347', 'bold 62px monospace', 256, 128) });
    for (const x of [-.8, 0, .8]) B(CYL(), 0xf4f1e8, .42, .42, .42, x, 3.46, 0);
    B(CYL(), 0x30343a, .3, .5, .3, -.6, 1.35, .9); B(CYL(), 0x30343a, .3, .5, .3, .6, 1.35, .9);
    return { armL: B(CYL(), 0x30343a, .22, 1.3, .22, -1.7, 1.8, .5, { rz: .5 }), armR: B(CYL(), 0x30343a, .22, 1.3, .22, 1.7, 1.8, .5, { rz: -.5 }) };
  },
  ranker(B) {
    B(BOX(), 0x1d2b53, 2.6, .9, 1.7, 0, .45, 0); B(BOX(), 0x29396b, 1.8, .9, 1.5, 0, 1.35, 0); B(BOX(), 0x384b8a, 1.1, .9, 1.3, 0, 2.25, 0);
    B(PLN(), 0, .8, .7, 1, 0, 2.25, .66, { face: face('1', '#384b8a', '#ffd166', 'bold 96px system-ui') }); B(PLN(), 0, .6, .6, 1, -.5, 1.35, .76, { face: face('2', '#29396b', '#c8d2de', 'bold 96px system-ui') }); B(PLN(), 0, .6, .6, 1, .8, .45, .86, { face: face('3', '#1d2b53', '#c98a3a', 'bold 96px system-ui') });
    B(SPH(), 0xffffff, 1.2, 1.2, 1.2, 0, 3.4, 0, { em: 0x332233 }); B(SPH(), 0xff2e63, .55, .55, .55, 0, 3.4, .42, { em: 0xff2e63 });
    return { armL: B(BOX(), 0x1d2b53, .3, 1.2, .3, -1.6, 2.1, .2), armR: B(BOX(), 0xff7eb6, .6, 1.4, .6, 1.7, 2.3, .2) };
  },
  fridge(B) {
    B(BOX(), 0x30343a, 2.1, .2, 1.6, 0, .1, 0); B(BOX(), 0xd5dbe1, 2.3, 3.8, 1.8, 0, 2.1, 0); B(BOX(), 0x8d98a3, 2.34, .08, 1.84, 0, 2.7, 0);
    B(BOX(), 0x6b7682, .1, 1, .12, -.35, 3.4, .95); B(BOX(), 0x6b7682, .1, 1.4, .12, -.35, 1.7, .95);
    B(PLN(), 0, 1.1, .8, 1, .45, 3.35, .91, { face: face('k8s', '#0b1730', '#7fd8ff', 'bold 54px monospace') });
    return { armL: B(BOX(), 0xb9c2cb, .22, 1.7, 1.1, -1.35, 2.1, .5), armR: B(BOX(), 0xb9c2cb, .22, 1.7, 1.1, 1.35, 2.1, .5) };
  },
  sync(B, o, body, mats) {                                // a conference speakerphone with seven managers orbiting it
    B(CYL(), 0x22262d, 2.3, .4, 2.3, 0, 1.1, 0); B(SPH(), 0x3a4250, 1.6, 1, 1.6, 0, 1.5, 0); B(CYL(), 0x7cff6b, .5, .12, .5, 0, 2.03, 0, { em: 0x2a8a22 });
    for (let i = 0; i < 3; i++) { const a = i / 3 * TAU; B(BOX(), 0x22262d, .5, .25, 1.7, Math.sin(a) * 1.4, .5, Math.cos(a) * 1.4, { ry: a }); B(CYL(), 0x22262d, .3, 1, .3, Math.sin(a) * .9, .7, Math.cos(a) * .9); }
    const ring = new THREE.Group(); body.add(ring);
    ['-_-', 'o_o', '>:(', 'zzz', '^_^', '?_?', ':|'].forEach((t, i) => {
      const a = i / 7 * TAU, x = Math.sin(a) * 2.2, z = Math.cos(a) * 2.2;
      mk(ring, mats, BOX(), 0x2b3340, .95, .75, .12, x, 3, z, { ry: a }); mk(ring, mats, PLN(), 0, .82, .62, 1, x + Math.sin(a) * .07, 3, z + Math.cos(a) * .07, { ry: a, face: face(t, '#0b1220', '#9fd4ff', 'bold 44px monospace') });
    });
    return { ring, ringSpeed: .9 };
  },
  lgtm(B) {
    B(BOX(), 0x1b2026, .8, .9, 1, -.65, .45, 0); B(BOX(), 0x1b2026, .8, .9, 1, .65, .45, 0); B(BOX(), 0x2a3038, 2.4, 2.2, 1.7, 0, 2, 0); B(BOX(), 0x1b2026, 1.3, .8, 1.1, 0, 3.5, 0);
    B(PLN(), 0, 1.15, .58, 1, 0, 3.5, .56, { face: face('LGTM?', '#041006', '#7cff6b', 'bold 62px monospace', 256, 128) });
    B(SPH(), 0x7cff6b, .2, .2, .2, -.8, 2.8, .86, { em: 0x3cff2b }); B(SPH(), 0xff4040, .2, .2, .2, .8, 2.8, .86, { em: 0xff2020 });
    const sh = B(BOX(), 0xcfd6de, 3.1, 3, .16, 0, 1.9, 1.2), shf = B(PLN(), 0, 2.9, 1.45, 1, 0, 2.1, 1.29, { face: face('✗ CHANGES REQUESTED', '#cfd6de', '#e03131', 'bold 21px system-ui', 256, 128) });
    return { shield: [sh, shf], drop: 3.6, armL: B(BOX(), 0x1b2026, .4, 1.6, .5, -1.5, 2, .4), armR: B(BOX(), 0x1b2026, .4, 1.6, .5, 1.5, 2, .4) };
  },
  vpai(B) {
    B(BOX(), 0x14182b, .42, 1.5, .42, -.36, .75, 0); B(BOX(), 0x14182b, .42, 1.5, .42, .36, .75, 0); B(BOX(), 0x1d2440, 1.6, 1.7, .8, 0, 2.35, 0);
    B(BOX(), 0xf4f1e8, .5, .6, .05, 0, 2.85, .41); B(BOX(), 0xe03131, .18, 1, .06, 0, 2.5, .44); B(CYL(), 0x8d98a3, .25, .5, .25, 0, 3.4, 0);
    B(BOX(), 0xf4f1e8, 2, 1.25, .1, 0, 4.1, 0); B(PLN(), 0, 1.85, 1.1, 1, 0, 4.1, .06, { face: face('10x ↗', '#ffffff', '#1c7ed6', 'bold 66px system-ui', 256, 128) });
    return { armL: B(BOX(), 0x1d2440, .32, 1.5, .32, -1.05, 2.35, 0), armR: B(BOX(), 0x1d2440, .32, 1.5, .32, 1.05, 2.35, 0) };
  },
  ceo(B, o, body, mats) {
    B(BOX(), 0x5a2e1c, 2.1, 1.7, 1.3, 0, .85, 0); B(BOX(), 0x3b1c10, 2.4, .15, 1.6, 0, 1.76, 0); B(BOX(), 0x20242e, 2.2, 1.5, 1, 0, 2.6, 0); B(BOX(), 0xffd166, .22, 1.1, .06, 0, 2.65, .52, { em: 0x5a4300 });
    const head = B(ICO(), 0x58c7ff, 1.8, 2, 1.8, 0, 4.4, 0, { op: .82, em: 0x123a5c }); B(PLN(), 0, .9, .9, 1, 0, 4.4, .95, { face: face(':)', '#06121f', '#9fe8ff', 'bold 70px monospace'), op: .95 });
    const ring = new THREE.Group(); ring.position.y = 4.5; body.add(ring);
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; mk(ring, mats, BOX(), 0xf4f1e8, .56, .4, .04, Math.sin(a) * 2.3, Math.sin(i * 1.7) * .25, Math.cos(a) * 2.3, { ry: a, em: 0x666666 }); }
    return { head, ring, ringSpeed: 1.6, armL: B(BOX(), 0x20242e, .4, 1.4, .4, -1.4, 2.5, .1), armR: B(BOX(), 0x20242e, .4, 1.4, .4, 1.4, 2.5, .1) };
  },
};

// ------------------------------------------------------------------ robots: how they think (generators: `yield seconds` to wait)
const dP = e => Math.hypot(P.x - e.x, P.z - e.z), aP = e => Math.atan2(P.x - e.x, P.z - e.z);
function* brainMelee(e) {
  const d = e.def;
  while (true) {
    e.intent = 'chase'; while (dP(e) > e.reach + e.r * (e.grow - 1)) yield 0;
    if (G.time - G.lastAtk < G.atkGap) { e.intent = 'orbit'; yield rand(.25, .6); continue; }          // take turns, like a well-run meeting
    G.lastAtk = G.time; e.intent = 'hold'; e.wind = d.delay; const f = e.reach * .75 * e.grow;
    hazard({ x: e.x + Math.sin(e.yaw) * f, z: e.z + Math.cos(e.yaw) * f, r: d.hr * e.grow, delay: d.delay, dmg: e.decoy ? 0 : d.dmg * G.dmgScale * e.grow, owner: e, color: e.decoy ? 0xb07cff : undefined });
    yield d.delay + .1; yield d.rest * rand(.8, 1.3);
  }
}
function* brainRanged(e) {
  const d = e.def; yield rand(.4, 1.4);
  while (true) {
    e.intent = 'keep'; yield d.rest * rand(.8, 1.2);
    e.intent = 'hold'; e.wind = .5; yield .5;
    shot({ from: e, ang: aP(e), speed: d.shotSpeed, dmg: d.dmg * G.dmgScale, color: d.shotColor, effect: d.effect, homing: d.homing || 0, card: d.card, ttl: 4.5 }); sfx('pew'); yield .3;
  }
}
function* brainYes(e) {
  yield rand(1, 2);
  while (true) {
    e.intent = 'flee'; yield 3.2; e.intent = 'hold'; e.wind = .6;
    say(e, pick(['Great question!', 'You’re absolutely right!', 'What a fantastic idea!', 'Love that for us.', 'I couldn’t agree more!'])); yield .6;
    pulse(e.x, e.z, 0xffe066, 7, .5);
    for (const o of enemies) if (o !== e && !o.decoy && o.spawn <= 0 && Math.hypot(o.x - e.x, o.z - e.z) < 7) { o.hp = Math.min(o.maxHp, o.hp + (o.boss ? 18 : 14)); o.haste = 4; floatText('+validated', o.x, o.def.h * o.scale + .3, o.z, 'heal'); }
    yield .5;
  }
}
function* brainLoop(e) {
  yield rand(.3, 1);
  while (true) {
    yield* charge(e, 10, 1.15, e.def.dmg * G.dmgScale, .6); e.spin = 0; e.dizzy = 1.6;
    if (Math.random() < .5) say(e, pick(['Retrying…', 'Retrying… (attempt 9,001)', 'Step 1 of 1: retry.', 'I have fixed it. Retrying.']), 1.5);
    yield 1.6;
  }
}
function* charge(b, speed, dur, dmg, tele = .7) {           // shared by anything that runs at you in a straight line
  b.intent = 'hold'; const a = aP(b); b.yaw = a; b.wind = tele;
  for (let i = 1; i <= 5; i++) hazard({ x: b.x + Math.sin(a) * i * 2.1, z: b.z + Math.cos(a) * i * 2.1, r: 1, delay: tele, dmg: 0, owner: b, color: 0xffa94d });
  yield tele; b.intent = 'vel'; b.spin = 1; b.cvx = Math.sin(a) * speed; b.cvz = Math.cos(a) * speed; b.contact = dmg; b.contactCd = 0;
  yield dur; b.contact = 0; b.intent = 'hold';
}
function summon(b, type, n = 1) { for (let i = 0; i < n && enemies.length < 11; i++) spawnEnemy(type, clamp(b.x + rand(-3.2, 3.2), -AX, AX), clamp(b.z + rand(-2.6, 2.6), -AZ, AZ), { noDecoy: true }); }
function teleport(b, x, z) { burst(b.x, 2, b.z, 0xffd166, 16, 7); b.x = clamp(x, -AX + 1.5, AX - 1.5); b.z = clamp(z, -AZ + 1, AZ - 1); burst(b.x, 2, b.z, 0xffd166, 16, 7); pulse(b.x, b.z, 0xffd166, 3, .3); }
const nearP = (dx, dz) => [clamp(P.x + rand(-dx, dx), -AX, AX), clamp(P.z + rand(-dz, dz), -AZ, AZ)];
const front = (b, d) => [b.x + Math.sin(b.yaw) * d, b.z + Math.cos(b.yaw) * d];

function* brainSynergy(b) {
  while (true) {
    b.intent = 'chase'; yield rand(.9, 1.6); const r = Math.random(), close = dP(b) < 4.5;
    if (r < (close ? .55 : .25)) { say(b, pick(['Let’s take this offline.', 'Quick one from me…', 'Let’s double-click on that.'])); b.intent = 'hold'; b.wind = .8; const [x, z] = front(b, 1.8); hazard({ x, z, r: 3.1, delay: .8, dmg: 15, owner: b }); yield 1.6; }
    else if (r < .82) { say(b, 'Let’s circle back.'); b.intent = 'hold'; b.wind = .6; yield .6; ringWave({ x: b.x, z: b.z, speed: 8, maxR: 13, dmg: 11, back: true }); yield 1.9; }
    else { say(b, 'Any blockers?'); b.intent = 'hold'; yield .5; summon(b, 'halluc', 2); yield 1.1; }
  }
}
function* brainBarista(b) {
  while (true) {
    b.intent = 'chase'; yield rand(.8, 1.4); const r = Math.random();
    if (r < .38) {
      say(b, pick(['I can’t brew that. Here is a haiku instead.', 'Steam is a feature.', 'As a large espresso model…'])); b.intent = 'hold'; b.wind = .7; const a = b.yaw;
      for (let i = 1; i <= 4; i++) hazard({ x: b.x + Math.sin(a) * (1 + i * 2), z: b.z + Math.cos(a) * (1 + i * 2), r: 1.3, delay: .55 + i * .12, dmg: 12, owner: b, color: 0xf1f3f5 }); yield 1.7;
    } else if (r < .72) {
      say(b, 'Have you considered decaf?'); b.intent = 'hold';
      for (let i = 0; i < 3; i++) { const [x, z] = nearP(2.4, 2); hazard({ x, z, r: 1.9, delay: .9, dmg: 8, owner: b, color: 0x9be37a, effect: 'decaf' }); yield .35; } yield .9;
    } else if (r < .88) { say(b, 'Your subscription has lapsed.'); b.intent = 'hold'; yield .45; for (let i = 0; i < 10; i++) shot({ from: b, ang: i / 10 * TAU + b.t, speed: 6.5, dmg: 9, color: 0xd9a066 }); yield 1.2; }
    else { say(b, 'Billing by the token.'); summon(b, 'burner', 1); yield 1; }
  }
}
function* brainRanker(b) {
  b.nextPip = 5;
  while (true) {
    b.intent = 'chase'; yield rand(.8, 1.3);
    if (b.t > b.nextPip) {
      b.nextPip = b.t + 13; say(b, 'You are in the bottom 10%.'); b.intent = 'hold'; b.wind = .7; yield .7;
      const f = team[active]; f.pip = 9; sfx('pip'); floatText('PERFORMANCE IMPROVEMENT PLAN', P.x, 3, P.z, 'bad');
      if (!b.told) { b.told = true; toast(`<b>Jeremy:</b> you are on a PIP and take nearly double damage. Tag out with <kbd>${K('tag')}</kbd> and the paperwork cannot find you.`, 6); }
      yield .5; continue;
    }
    const r = Math.random();
    if (r < .4) { say(b, 'Meets some expectations.'); b.intent = 'hold'; for (let i = 0; i < 3; i++) { hazard({ x: P.x, z: P.z, r: 1.7, delay: .65, dmg: 13, owner: b, color: 0xff7eb6 }); yield .5; } yield .7; }
    else if (r < .7) { say(b, 'Forced distribution!'); yield* charge(b, 15, .75, 16); b.spin = 0; yield .9; }
    else { say(b, 'Calibrating…'); b.intent = 'hold'; yield .5; for (let v = 0; v < 2; v++) { for (let i = 0; i < 12; i++) shot({ from: b, ang: (i + v * .5) / 12 * TAU, speed: 7, dmg: 9, color: 0xff7eb6, card: true }); yield .55; } yield .6; }
  }
}
function* brainFridge(b) {
  b.crash = 0; b.nextRec = 2;
  while (true) {
    if (b.crash < 3 && b.hp / b.maxHp <= [.75, .5, .25][b.crash]) {
      b.crash++; say(b, 'CrashLoopBackOff. Restarting in 3s…', 3.4); b.intent = 'hold'; b.vuln = b.dizzy = 3.6; floatText('RESTARTING: HIT IT', b.x, 5, b.z, 'big'); yield 3.6; say(b, 'Running. Probably.'); continue;
    }
    const pods = enemies.filter(e => e.type === 'pod').length;
    if (pods < 3 && b.t > b.nextRec) { b.nextRec = b.t + 6; say(b, `desired: 3 · current: ${pods} · reconciling`); b.intent = 'hold'; yield .5; summon(b, 'pod', 3 - pods); yield .6; continue; }
    b.intent = 'chase'; yield rand(.8, 1.4); const r = Math.random();
    if (r < .42) { say(b, pick(['Chilling effect.', 'Your lunch has been evicted.', 'Pod pending.'])); b.intent = 'hold'; for (let i = 0; i < 4; i++) { const [x, z] = nearP(3, 2.4); hazard({ x, z, r: 1.8, delay: .85, dmg: 10, owner: b, color: 0x7fd8ff, effect: 'slow' }); yield .22; } yield 1; }
    else if (r < .78) { say(b, 'Door is ajar.'); b.intent = 'hold'; b.wind = .7; const [x, z] = front(b, 1.9); hazard({ x, z, r: 2.9, delay: .7, dmg: 16, owner: b }); yield 1.5; }
    else { say(b, 'Defrosting.'); b.intent = 'hold'; yield .5; ringWave({ x: b.x, z: b.z, speed: 7, maxR: 12, dmg: 10, color: 0x7fd8ff, effect: 'slow' }); yield 1.3; }
  }
}
function* brainSync(b) {
  while (true) {
    b.intent = 'keep'; yield rand(.9, 1.5); const r = Math.random();
    if (r < .34) { say(b, pick(['Quick sync?', 'Putting time on your calendar.', 'Got five minutes?'])); for (let i = 0; i < 3; i++) { shot({ from: b, ang: aP(b) + rand(-.6, .6), speed: 5.2, dmg: 5, color: 0xffffff, homing: 1.6, effect: 'root', ttl: 4.5, r: .4, card: true }); sfx('pew'); yield .35; } yield .8; }
    else if (r < .62) { say(b, 'This meeting is now recurring.'); hazard({ x: P.x, z: P.z, r: 2.3, delay: .9, dmg: 11, owner: b, repeat: 2, gap: .9, color: 0xff9f43 }); const [x, z] = nearP(4, 3); hazard({ x, z, r: 2.3, delay: 1.2, dmg: 11, owner: b, repeat: 2, gap: .9, color: 0xff9f43 }); yield 2.4; }
    else if (r < .86) { say(b, 'Let’s go around the room.'); b.intent = 'hold'; const s = pick([-1, 1]); beam({ owner: b, ang: aP(b) - s * 1.2, w: s * 1.9, ttl: 3.7, warm: .8, dmg: 12, color: 0xff9f43 }); yield 3.9; }
    else { say(b, 'Adding a few optional attendees.'); summon(b, pick(['yesbot', 'invite']), 1); summon(b, 'halluc', 1); yield 1; }
  }
}
function* brainLgtm(b) {
  while (true) {
    b.intent = 'chase'; yield rand(.9, 1.5); const r = Math.random();
    if (r < .36) { say(b, pick(['nit:', 'nit: also this.', 'Have you considered rewriting it?'])); b.intent = 'hold'; for (let i = 0; i < 5; i++) { shot({ from: b, ang: aP(b) + rand(-.13, .13), speed: 10, dmg: 6, color: 0x7cff6b, r: .28 }); sfx('pew'); yield .18; } yield .8; }
    else if (r < .66) { say(b, 'CHANGES REQUESTED.'); b.intent = 'hold'; b.wind = .9; hazard({ x: P.x, z: P.z, r: 3, delay: .9, dmg: 17, owner: b }); yield 1.5; }
    else { say(b, 'Force-pushing to main.'); yield* charge(b, 15, .8, 17); b.spin = 0; b.open = 3.3; say(b, 'Merge conflict…', 3); floatText('GUARD DOWN', b.x, 4.6, b.z, 'big'); yield 3.3; }
  }
}
function* brainVpai(b) {
  b.nextReorg = 8;
  while (true) {
    b.intent = 'keep'; yield rand(.8, 1.3);
    if (b.t > b.nextReorg) {
      b.nextReorg = b.t + 15; say(b, 'Effective immediately: a reorg.'); b.intent = 'hold'; b.wind = .8; yield .8;
      if (!team[1 - active].ko && P.st !== 'ko') { tag(true); banner('REORG', `${team[active].name} now reports to this fight.`, 1.6, 'boss'); }
      teleport(b, rand(-AX, AX), rand(-AZ, AZ)); yield .7; continue;
    }
    const r = Math.random();
    if (r < .36) { say(b, pick(['Paradigm.', 'Leverage.', '10x.', 'Per the deck…'])); b.intent = 'hold'; for (let v = 0; v < 2; v++) { const a = aP(b); for (let i = -2; i <= 2; i++) shot({ from: b, ang: a + i * .22, speed: 9, dmg: 9, color: 0xf4f1e8, card: true }); sfx('pew'); yield .45; } yield .7; }
    else if (r < .64) { say(b, 'We’re pivoting.'); b.intent = 'hold'; const x = P.x, z = P.z; hazard({ x, z, r: 3, delay: .85, dmg: 16, owner: b, color: 0xffd166 }); yield .6; teleport(b, x, z); yield 1; }
    else if (r < .84) { say(b, 'Here is the roadmap.'); b.intent = 'hold'; const s = pick([-1, 1]); beam({ owner: b, ang: aP(b) - s * 1.1, w: s * 1.3, ttl: 2.6, warm: .7, dmg: 12, color: 0xffd166 }); yield 2.8; }
    else { say(b, 'I brought consultants.'); summon(b, 'yesbot', 1); summon(b, pick(['invite', 'inject']), 1); yield 1; }
  }
}
function* brainCeo(b) {
  b.phase = 1;
  const slam = function* (line, r = 3.4, dmg = 17) { say(b, line); b.intent = 'hold'; b.wind = .8; const [x, z] = front(b, 1.9); hazard({ x, z, r, delay: .8, dmg, owner: b }); yield 1.5; };
  const spread = function* (line) { say(b, line); b.intent = 'hold'; for (let v = 0; v < 2; v++) { const a = aP(b); for (let i = -3; i <= 3; i++) shot({ from: b, ang: a + i * .2, speed: 9.5, dmg: 10, color: 0x9fe8ff }); sfx('pew'); yield .5; } yield .5; };
  const storm = function* (n, gap) { say(b, '…and another thing.'); b.intent = 'hold'; for (let i = 0; i < n; i++) { const [x, z] = i % 3 === 0 ? nearP(1, 1) : [rand(-AX, AX), rand(-AZ, AZ)]; hazard({ x, z, r: 1.9, delay: 1, dmg: 13, owner: b, color: 0x74c0fc }); yield gap; } yield .8; };
  const rto = function* () { say(b, 'Return to office. Effective now.', 3); b.intent = 'hold'; b.pull = 3.4; yield 1.5; hazard({ x: b.x, z: b.z, r: 4.6, delay: .9, dmg: 20, owner: b }); yield 1; b.pull = 0; yield .6; };
  while (true) {
    const k = b.hp / b.maxHp;
    if (b.phase === 1 && k < .66) { b.phase = 2; b.pull = 0; banner('3 AM TWEET', 'The stock is down 4%. Everything is fine.', 2.2, 'boss'); sfx('boss'); say(b, 'Posting through it.'); b.intent = 'hold'; yield 1.5; continue; }
    if (b.phase === 2 && k < .33) { b.phase = 3; b.pull = 0; banner('AI-NATIVE EVERYTHING', 'AI-native bathrooms. AI-native break rooms. Go.', 2.2, 'boss'); sfx('boss'); say(b, 'I don’t know what it means either.'); b.intent = 'hold'; yield 1.5; continue; }
    b.intent = 'chase'; yield rand(.7, 1.2) / (b.phase === 3 ? 1.5 : 1); const r = Math.random();
    if (b.phase === 1) {
      if (r < .36) yield* slam('Vision 2.0.');
      else if (r < .7) { say(b, 'We’re a family.'); b.intent = 'hold'; b.wind = .6; yield .6; ringWave({ x: b.x, z: b.z, speed: 9, maxR: 14, dmg: 12, back: true }); yield 1.8; }
      else yield* spread('Synergy.');
    } else if (b.phase === 2) {
      if (r < .4) yield* storm(9, .16);
      else if (r < .68) yield* rto();
      else if (r < .88) { yield* spread('Disrupt or be disrupted.'); ringWave({ x: b.x, z: b.z, speed: 8, maxR: 13, dmg: 11 }); yield .8; }
      else { say(b, 'All hands.'); summon(b, pick(['halluc', 'replyall', 'creep']), 2); yield 1; }
    } else {
      if (r < .32) { say(b, 'AI-native everything.'); b.intent = 'hold'; const a = aP(b) + 1.1, s = pick([-1, 1]); beam({ owner: b, ang: a, w: s * 1.25, ttl: 4.2, warm: .8, dmg: 13 }); beam({ owner: b, ang: a + Math.PI, w: s * 1.25, ttl: 4.2, warm: .8, dmg: 13 }); yield 4.4; }
      else if (r < .56) { say(b, 'Layoffs are a growth opportunity.'); b.intent = 'hold'; for (let i = 0; i < 3; i++) { ringWave({ x: b.x, z: b.z, speed: 8.5, maxR: 14, dmg: 12 }); yield .75; } yield .6; }
      else if (r < .78) yield* storm(12, .11);
      else if (r < .92) yield* rto();
      else yield* slam('Any other business?', 3.8, 20);
    }
  }
}

const BOTS = {
  halluc: { hp: 34, speed: 2.8, r: .6, h: 2, reach: 1.7, hr: 1.25, delay: .5, dmg: 8, rest: 1.1, pc: 10, brain: brainMelee, color: 0xb07cff,
    init(e, o) { if (!o.decoy && !o.noDecoy && Math.random() < .4) for (let i = 0; i < 2; i++) spawnEnemy('halluc', clamp(e.x + rand(-2, 2), -AX, AX), clamp(e.z + rand(-2, 2), -AZ, AZ), { decoy: true }); } },
  replyall: { hp: 16, speed: 4, r: .45, h: 2, reach: 1.3, hr: 1, delay: .42, dmg: 5, rest: .9, pc: 8, brain: brainMelee, color: 0xf4f1e8,
    onDeath(e) { if (e.gen > 0) return; floatText('RE: RE: RE:', e.x, 2.4, e.z, 'dim'); for (let i = 0; i < 2; i++) spawnEnemy('replyall', clamp(e.x + rand(-.9, .9), -AX, AX), clamp(e.z + rand(-.9, .9), -AZ, AZ), { gen: 1, scale: .65, hp: 8 }); } },
  burner: { hp: 70, speed: 1.7, r: .7, h: 2.5, reach: 2, hr: 1.9, delay: .75, dmg: 12, rest: 1.5, pc: 20, brain: brainMelee, armor: true, color: 0xff8a1e,
    tick(e, dt) { e.trail = (e.trail ?? 1) - dt; if (e.trail <= 0 && e.intent === 'chase') { e.trail = .8; zone({ x: e.x, z: e.z, r: .95, ttl: 3.2, dmg: 4 * G.dmgScale, color: 0xff7a1a }); } } },
  creep: { hp: 44, speed: 2.3, r: .6, h: 2.1, reach: 1.6, hr: 1.2, delay: .55, dmg: 9, rest: 1.2, pc: 18, brain: brainMelee, color: 0x5fd38d,
    tick(e, dt) { if (e.grow >= 2) return; e.grow = Math.min(2, e.grow + dt * .045); e.hp += dt * 2.2; e.maxHp += dt * 2.2; e.r = .6 * e.grow; e.note = (e.note ?? rand(3, 7)) - dt; if (e.note <= 0) { e.note = rand(5, 9); floatText(pick(['+1 small thing', '+ while you’re in there…', '+ quick add', '+ one more stakeholder']), e.x, 2.4 * e.grow, e.z, 'dim'); } } },
  invite: { hp: 30, speed: 2.6, r: .55, h: 2.1, keep: 7, rest: 2.6, dmg: 4, shotSpeed: 5.5, homing: 1.3, effect: 'root', shotColor: 0xffffff, card: true, pc: 15, brain: brainRanged, color: 0xf4f1e8 },
  inject: { hp: 28, speed: 2.8, r: .5, h: 2.2, keep: 8.5, rest: 3, dmg: 6, shotSpeed: 10, effect: 'rev', shotColor: 0x7cff6b, pc: 15, brain: brainRanged, color: 0x7cff6b },
  review: { hp: 80, speed: 2.1, r: .7, h: 2.2, reach: 1.9, hr: 1.5, delay: .65, dmg: 13, rest: 1.4, pc: 25, brain: brainMelee, armor: true, shield: true, turn: 3, color: 0xcfd6de },
  yesbot: { hp: 36, speed: 3, r: .55, h: 1.9, keep: 8, pc: 22, brain: brainYes, color: 0xffd43b },
  loop: { hp: 48, speed: 2, r: .65, h: 1.9, dmg: 10, pc: 20, brain: brainLoop, bounce: true, color: 0x2f9e9e },
  pod: { hp: 14, speed: 3.6, r: .4, h: 1.1, reach: 1.2, hr: .9, delay: .4, dmg: 5, rest: .9, pc: 3, brain: brainMelee, minor: true, color: 0x3b7de0 },
  synergy: { boss: true, name: 'SYNERGY-9000', sub: 'Standup facilitator · three hours, nothing decided', epitaph: 'Action items: none. Owner: nobody.', hp: 1250, speed: 1.9, r: 1.3, h: 4.4, reach: 3, turn: 4, brain: brainSynergy, color: 0x1f8f8f },
  barista: { boss: true, name: 'BARISTA-GPT', sub: 'AI-native espresso · will not brew, will write a haiku about brewing', epitaph: 'The office now has a kettle. Morale is up 40%.', hp: 1500, speed: 1.6, r: 1.7, h: 3.9, reach: 3, turn: 4, brain: brainBarista, color: 0xb8bcc4 },
  ranker: { boss: true, name: 'THE STACK RANKER', sub: 'Calibration engine · someone must be in the bottom 10%', epitaph: 'Everyone is now rated “present”.', hp: 1750, speed: 2, r: 1.5, h: 4.2, reach: 3, turn: 4, brain: brainRanker, color: 0x384b8a },
  fridge: { boss: true, name: 'KUBERFRIDGE', sub: 'Smart fridge running Kubernetes · desired: lunch, current: 0', epitaph: 'kubectl delete fridge. Lunch is eventually consistent.', hp: 2100, speed: 1.5, r: 1.5, h: 4.3, reach: 3, turn: 4, brain: brainFridge, color: 0xd5dbe1 },
  sync: { boss: true, name: 'CROSS-FUNCTIONAL SYNC', sub: 'Seven managers, zero engineers · this meeting is now recurring', epitaph: 'This meeting has been converted to an email. Nobody read it.', hp: 2250, speed: 2, r: 1.5, h: 3.7, keep: 6, turn: 4, brain: brainSync, color: 0x3a4250 },
  lgtm: { boss: true, name: 'LGTM-1000', sub: 'Rogue code review bot · “Not AI-native. Changes requested.”', epitaph: 'Hotfix merged. Shipped on a Friday, without fear.', hp: 2400, speed: 1.8, r: 1.7, h: 4, reach: 3, turn: 1.5, shield: true, brain: brainLgtm, color: 0xcfd6de },
  vpai: { boss: true, name: 'VP OF AI TRANSFORMATION', sub: 'Role created above you · has never shipped a product', epitaph: 'The role has been dissolved. So has the task force on dissolving it.', hp: 2700, speed: 2.6, r: 1, h: 4.8, keep: 5, turn: 5, brain: brainVpai, color: 0xffd166 },
  ceo: { boss: true, name: 'THE CEO’S AI CLONE', sub: 'Handles all communications now · twelve slides, no questions', epitaph: 'Communications will now be handled by nobody, which is an improvement.', hp: 4500, speed: 1.7, r: 1.5, h: 5.5, reach: 3, turn: 4, brain: brainCeo, color: 0x58c7ff,
    anim(e) { e.parts.head.material.color.setHex([0x58c7ff, 0xff5ad1, 0xff4d4d][e.phase - 1] ?? 0x58c7ff); const used = 12 - Math.ceil(12 * Math.max(0, e.hp) / e.maxHp); e.parts.ring.children.forEach((s, i) => { s.visible = i >= used; }); } },
};
const shadowMat = new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: .3, depthWrite: false });
function spawnEnemy(type, x, z, o = {}) {
  const def = BOTS[type], g = new THREE.Group(), body = new THREE.Group(), mats = []; g.add(body);
  const parts = BUILD[type]((...a) => mk(body, mats, ...a), o, body, mats);
  const sh = new THREE.Mesh(DISC(), shadowMat); sh.rotation.x = -Math.PI / 2; sh.position.y = .03; sh.scale.setScalar(def.r * 1.25); g.add(sh);
  const sc = o.scale || 1, hp = o.decoy ? 1 : (o.hp || def.hp) * (def.boss ? (o.hpMul || 1) : G.hpScale), spawn = def.boss ? 1.1 : .5;
  const e = { type, def, g, body, parts, mats, x, z, yaw: Math.atan2(P.x - x, P.z - z), hp, maxHp: hp, r: def.r * sc, speed: def.speed, reach: def.reach || 2, keep: def.keep || 6, scale: sc,
    vx: 0, vz: 0, cvx: 0, cvz: 0, stun: 0, flash: 0, wind: 0, lunge: 0, wait: rand(.2), intent: 'hold', boss: !!def.boss, t: 0, alive: true, spawn, spawn0: spawn, decoy: !!o.decoy, gen: o.gen || 0,
    side: pick([-1, 1]), seed: rand(10), contact: 0, contactCd: 0, open: 0, vuln: 0, haste: 0, dizzy: 0, grow: 1, spin: 0, vs: 0, flipCd: 0, pull: 0, phase: 1, pair: 0, pairT: 0 };
  e.script = def.brain(e); g.position.set(x, 0, z); g.rotation.y = e.yaw; g.scale.setScalar(.01); scene.add(g); enemies.push(e); def.init?.(e, o); return e;
}
function spawnAtEdge(type) {
  let x, z, n = 0;
  do { const s = (Math.random() * 3) | 0; if (s === 0) { x = -AX + .6; z = rand(-AZ, AZ); } else if (s === 1) { x = AX - .6; z = rand(-AZ, AZ); } else { x = rand(-AX, AX); z = -AZ + .4; } } while (Math.hypot(x - P.x, z - P.z) < 6 && ++n < 8);
  return spawnEnemy(type, x, z);
}
const KILL_WORDS = ['DEPRECATED', 'SUNSET', 'OFFBOARDED', 'RIGHT-SIZED', 'ROLLED BACK', 'WONTFIX', 'CLOSED', 'REVERTED', 'ARCHIVED', '404', 'OUT OF SCOPE'];
function damageEnemy(e, dmg, o = {}) {
  if (!e.alive || e.spawn > 0) return false;
  const hy = e.def.h * e.scale * e.grow * .8, ox = o.x ?? P.x, oz = o.z ?? P.z;
  if (e.decoy) { floatText('CITATION NEEDED', e.x, hy, e.z, 'dim'); killEnemy(e, true); return true; }           // it was never there
  let d = dmg * dmgMult();
  if (e.def.shield && !o.pierce && e.open <= 0 && Math.abs(angDiff(Math.atan2(ox - e.x, oz - e.z), e.yaw)) < 1.25) {
    d *= .12; sfx('clank');
    if (o.heavy && !e.boss) { e.open = 2.4; floatText('GUARD BROKEN', e.x, hy + .5, e.z, 'big'); } else floatText(pick(['REJECTED', 'nit:', 'NOT AI-NATIVE', 'WONTFIX']), e.x, hy + .4, e.z, 'dim');
  }
  if (e.vuln > 0 || (e.def.shield && e.open > 0)) d *= 1.4;
  if (e.type === 'barista' && team[active].key === 'coffee') d *= 1.25;                                              // it's personal
  e.hp -= d; e.flash = o.chip ? .05 : .1;
  if (o.quiet) burst(e.x, hy * .7, e.z, 0x9fd4ff, 1, 3);                                                              // chip damage from agents, drones and tethers: no numbers, no stagger
  else { floatText(o.word || String(Math.max(1, Math.round(d))), e.x, hy, e.z, o.word ? 'word' : ''); burst(e.x, hy * .7, e.z, e.def.color, o.heavy ? 6 : 3, 4); }
  if (e.pairT > 0 && !o.shared) for (const q of [...enemies]) if (q !== e && q.pair === e.pair && q.pairT > 0) damageEnemy(q, dmg * .3, { shared: true, chip: true, quiet: true, pierce: true });      // paired devices share
  if (!e.boss && !o.chip) {
    const a = Math.atan2(e.x - ox, e.z - oz), tough = (e.def.armor || e.grow >= 1.5) && !o.heavy && !o.pierce, kb = (o.kb || 0) * (tough ? .25 : 1);       // the heavy ones do not flinch from a jab
    if (!tough) { e.stun = Math.max(e.stun, o.stun ?? .32); e.wind = 0; e.contact = 0; e.spin = 0; e.intent = 'hold'; e.script = e.def.brain(e); e.wait = 0; }
    e.vx += Math.sin(a) * kb; e.vz += Math.cos(a) * kb;
  }
  if (e.hp <= 0) killEnemy(e);
  return true;
}
function killEnemy(e, silent) {
  if (!e.alive) return; e.alive = false;
  const i = enemies.indexOf(e); if (i >= 0) enemies.splice(i, 1);
  const hy = e.def.h * e.scale * .5;
  burst(e.x, hy, e.z, e.def.color, e.boss ? 40 : e.decoy ? 4 : 12, e.boss ? 10 : 6);
  scene.remove(e.g); for (const m of e.mats) m.dispose();
  if (e.boss) return bossDefeated(e);
  if (silent) return;
  sfx('kill'); G.stats.kills++; T.pc += Math.round((e.def.pc || 5) * (1 + P.combo * .02));
  if (Math.random() < .45) floatText(pick(KILL_WORDS), e.x, hy * 2 + .4, e.z, 'word');
  e.def.onDeath?.(e);
  if (!e.def.minor && e.gen === 0) {
    const f = team[active], dn = (perk('dessert') ? .17 : .1) * (f.hp < f.maxHp * .4 ? 1.6 : 1), r = Math.random();
    if (r < dn) dropPickup(e.x, e.z, 'donut'); else if (r < dn + .11) dropPickup(e.x, e.z, 'coffee');
  }
}
function bossDefeated(e) {
  G.boss = null; G.phase = 'done'; G.gap = 2.8; G.slowmo = 1.8; G.shake = 1; sfx('boom'); flash(); setMusic(false);
  for (const o of [...enemies]) killEnemy(o, true);
  clearCombat(false); T.pc += 500 + (G.story ? G.level * 100 : G.endless.wave * 20);
  for (let i = 0; i < 5; i++) setTimeout(() => { burst(e.x + rand(-1.5, 1.5), rand(.5, 3.5), e.z + rand(-1.5, 1.5), pick([0xffd43b, 0xff5a5a, 0xffffff]), 14, 9); sfx('kill'); }, i * 170);
  banner(`${e.def.name} HAS BEEN SUNSET`, e.def.epitaph, 2.8, 'team');
}
function setVs(e, s) {                                    // 1 hit flash · 2 winding up · 3 vulnerable
  if (e.vs === s) return; e.vs = s; const hex = s === 1 ? 0xffffff : s === 2 ? 0xaa1111 : s === 3 ? 0x8a6d00 : null;
  for (const m of e.mats) if (!m.userData.noFlash) m.emissive.setHex(hex ?? m.userData.em);
}
function animEnemy(e, dt, moving) {
  const p = e.parts, b = e.body, t = e.t;
  b.position.y = p.hover ? p.hover + Math.sin(t * 3 + e.seed) * .12 : (moving && !e.boss ? Math.abs(Math.sin(t * 9 + e.seed)) * .09 : 0);
  let tilt = 0; if (e.wind > 0) { e.wind -= dt; tilt = -.28; if (e.wind <= 0) e.lunge = .18; } else if (e.lunge > 0) { e.lunge -= dt; tilt = .4; }
  b.rotation.x += (tilt - b.rotation.x) * Math.min(1, dt * 18);
  b.rotation.z = e.stun > 0 || e.dizzy > 0 ? Math.sin(t * 30) * .12 : 0;
  const sw = e.wind > 0 ? -2.2 : moving ? Math.sin(t * 9) * .6 : 0;
  if (p.armL) p.armL.rotation.x = p.rotor ? 0 : sw; if (p.armR) p.armR.rotation.x = p.rotor ? 0 : (e.wind > 0 ? sw : -sw);
  if (p.rotor) { p.armL.rotation.y += dt * 40; p.armR.rotation.y -= dt * 40; }
  if (p.flame) p.flame.scale.y = .8 + Math.sin(t * 20) * .25;
  if (p.shield) for (const s of p.shield) s.position.y += ((s.userData.y0 - (e.open > 0 ? p.drop : 0)) - s.position.y) * Math.min(1, dt * 10);
  if (e.spin) b.rotation.y += dt * 22; else if (e.type === 'loop') b.rotation.y += dt * 2; else b.rotation.y *= .8;
  if (p.ring) p.ring.rotation.y += dt * p.ringSpeed;
  e.def.anim?.(e, dt);
}
function updateEnemies(dt, real) {
  if (G.unify) { const u = G.unify, k = 1 - Math.exp(-6 * real); for (const e of enemies) { if (e.boss || e.spawn > 0) continue; e.x += (u.x - e.x) * k; e.z += (u.z - e.z) * k; e.stun = Math.max(e.stun, .25); } }
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i]; if (!e) continue; e.t += dt;
    if (e.spawn > 0) {
      e.spawn -= real; const k = clamp(1 - e.spawn / e.spawn0, 0, 1); e.g.scale.setScalar(Math.max(.01, e.scale * (e.boss ? 1 : k)));
      if (e.boss) { e.g.position.y = (1 - k) * (1 - k) * 14; if (e.spawn <= 0) { G.shake = .9; pulse(e.x, e.z, 0xffffff, 7, .5); sfx('boom'); burst(e.x, .3, e.z, 0xcccccc, 20, 8); } }
      continue;
    }
    if (e.flash > 0) e.flash -= real; if (e.open > 0) e.open -= dt; if (e.vuln > 0) e.vuln -= dt; if (e.haste > 0) e.haste -= dt; if (e.dizzy > 0) e.dizzy -= dt; if (e.contactCd > 0) e.contactCd -= dt; if (e.flipCd > 0) e.flipCd -= dt; if (e.pairT > 0) e.pairT -= dt;
    let moving = false;
    if (e.stun > 0) e.stun -= dt;
    else {
      e.wait -= dt;
      if (e.wait <= 0) { const r = e.script.next(); if (r.done) { e.script = e.def.brain(e); e.wait = 0; } else e.wait = r.value || 0; }
      const sp = e.speed * (e.haste > 0 ? 1.35 : 1), a = aP(e), d = dP(e); let mv = null, slow = 1;
      if (e.intent === 'chase') { if (d > e.reach * .8) mv = a; }
      else if (e.intent === 'keep') { if (d < e.keep - 1.5) mv = a + Math.PI; else if (d > e.keep + 1.5) mv = a; else { mv = a + e.side * Math.PI / 2; slow = .55; } }
      else if (e.intent === 'flee') { if (d < e.keep) mv = a + Math.PI + e.side * .6; }
      else if (e.intent === 'orbit') { mv = a + e.side * Math.PI / 2; slow = .6; }
      else if (e.intent === 'vel') {
        e.x += e.cvx * dt; e.z += e.cvz * dt; moving = true;
        if (e.def.bounce) { if (Math.abs(e.x) > AX - .4) e.cvx = -Math.sign(e.x) * Math.abs(e.cvx); if (Math.abs(e.z) > AZ - .4) e.cvz = -Math.sign(e.z) * Math.abs(e.cvz); }
      }
      if (mv !== null) { e.x += Math.sin(mv) * sp * slow * dt; e.z += Math.cos(mv) * sp * slow * dt; moving = true; }
      if (e.intent !== 'hold' && e.intent !== 'vel') { const tr = (e.def.turn || 7) * dt; e.yaw += clamp(angDiff(a, e.yaw), -tr, tr); }
      e.def.tick?.(e, dt);
      if (e.contact > 0 && e.contactCd <= 0 && d < e.r + .75 && hurtPlayer(e.contact, e)) e.contactCd = .6;
    }
    e.x += e.vx * dt; e.z += e.vz * dt; const damp = Math.exp(-7 * dt); e.vx *= damp; e.vz *= damp;
    if (e.flipCd <= 0 && (Math.abs(e.x) >= AX - .2 || Math.abs(e.z) >= AZ - .2)) { e.side = -e.side; e.flipCd = 1.2; }
    e.x = clamp(e.x, -AX, AX); e.z = clamp(e.z, -AZ, AZ);
    animEnemy(e, dt, moving);
  }
  for (let i = 0; i < enemies.length; i++) {                                    // nobody stands inside anybody else
    const a = enemies[i]; if (a.spawn > 0) continue;
    for (let j = i + 1; j < enemies.length; j++) {
      const b = enemies[j]; if (b.spawn > 0) continue;
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || .01, min = (a.r + b.r) * .9; if (d >= min) continue;
      const push = (min - d) / d, wa = a.boss ? 0 : b.boss ? 1 : .5; a.x -= dx * push * wa; a.z -= dz * push * wa; b.x += dx * push * (1 - wa); b.z += dz * push * (1 - wa);
    }
    const dx = P.x - a.x, dz = P.z - a.z, d = Math.hypot(dx, dz) || .01, min = a.r + .45;
    if (d < min && P.st !== 'dodge') { const push = (min - d) / d; if (a.boss || a.intent === 'vel') { P.x += dx * push; P.z += dz * push; } else { a.x -= dx * push * .8; a.z -= dz * push * .8; P.x += dx * push * .2; P.z += dz * push * .2; } }
  }
  for (const e of enemies) {
    e.g.position.x = e.x; e.g.position.z = e.z;
    if (e.spawn <= 0) { e.g.position.y = 0; e.g.rotation.y = e.yaw; e.g.scale.setScalar(e.scale * e.grow); }
    setVs(e, e.flash > 0 ? 1 : e.wind > 0 ? 2 : e.vuln > 0 || e.open > 0 || e.dizzy > 0 ? 3 : 0);
  }
}

// ------------------------------------------------------------------ the player
const MOVES = {
  l1: { clip: 'LeftJab', dur: .28, hit: .42, dmg: 8, range: 1.9, arc: 1.9, lunge: .7, kb: 2, caf: 10, next: 'l2', fin: 'h1' },
  l2: { clip: 'RightStraightPunch', dur: .3, hit: .42, dmg: 9, range: 1.9, arc: 1.9, lunge: .7, kb: 2, caf: 10, next: 'l3', fin: 'h2' },
  l3: { clip: 'LeftHook', dur: .34, hit: .45, dmg: 12, range: 2, arc: 2.6, lunge: .6, kb: 3, caf: 12, next: 'l4', fin: 'h2' },
  l4: { clip: 'ElbowStrike', dur: .42, hit: .45, dmg: 18, range: 2, arc: 2.2, lunge: .8, kb: 9, caf: 16, heavy: true },
  h1: { clip: 'FrontKick', dur: .5, hit: .45, dmg: 20, range: 2.4, arc: 1.6, lunge: .8, kb: 10, caf: 16, heavy: true },
  h2: { clip: 'RoundhouseKick', dur: .62, hit: .5, dmg: 26, range: 2.6, arc: 7, lunge: .5, kb: 11, caf: 20, heavy: true },
  tag: { clip: 'RoundhouseKick', dur: .46, hit: .4, dmg: 14, range: 2.9, arc: 7, lunge: 0, kb: 11, caf: 12, heavy: true },
};
const DODGE_WORDS = ['DECLINED', 'OUT OF OFFICE', 'SNOOZED', 'NOT IT', 'TENTATIVE'];
const COMBO_RANKS = [[5, 'ALIGNED'], [10, 'STAKEHOLDER-ALIGNED'], [18, 'SYNERGISTIC'], [28, '10x'], [40, 'AI-NATIVE'], [60, 'LORD BLUETOOTH']];
const keys = new Set(), touch = { x: 0, y: 0 };
function inputDir() {                                     // arrow keys or the touch stick; the mouse gives orders instead (see order())
  let x = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0) + touch.x + PAD.x;
  let z = (keys.has('ArrowDown') ? 1 : 0) - (keys.has('ArrowUp') ? 1 : 0) + touch.y + PAD.y;
  const l = Math.hypot(x, z); if (l > 1) { x /= l; z /= l; }
  if (P.rev > 0) { x = -x; z = -z; }
  return [x, z, l > .2];
}
// ---- MOBA-style mouse control: right-click to move or attack, everything else aims at the cursor
const _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2(), _floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), _hit = new THREE.Vector3();
function mouseGround() {                                  // the point on the floor under the cursor
  _ndc.set(M.sx / innerWidth * 2 - 1, 1 - M.sy / innerHeight * 2); _ray.setFromCamera(_ndc, camera);
  if (_ray.ray.intersectPlane(_floor, _hit)) { M.x = clamp(_hit.x, -AX - 3, AX + 3); M.z = clamp(_hit.z, -AZ - 3, AZ + 3); }
}
function enemyAtCursor() {                                // robots are tall, so test against their outline on screen, not the floor point
  let best = null, bd = 1e9;
  for (const e of enemies) {
    if (e.spawn > 0) continue;
    const [x0, y0] = toScreen(e.x, 0, e.z), [x1, y1] = toScreen(e.x, e.def.h * e.scale * e.grow, e.z), [xr] = toScreen(e.x + e.r, 0, e.z);
    const t = clamp((M.sy - y0) / ((y1 - y0) || -1), 0, 1), d = Math.hypot(M.sx - (x0 + (x1 - x0) * t), M.sy - (y0 + (y1 - y0) * t));
    if (d < Math.abs(xr - x0) + 14 && d < bd) { bd = d; best = e; }
  }
  return best;
}
function order(amove, ping = true) {                      // right-click (or A for attack-move): go there, or go and keep hitting that
  if (G.mode !== 'play' || G.paused || P.st === 'ko' || !M.on) return;
  mouseGround();
  const pt = { x: clamp(M.x, -AX, AX), z: clamp(M.z, -AZ, AZ) }, e = enemyAtCursor() || (amove ? nearestEnemy(M.x, M.z, 4.5, 0, 4) : null);
  if (e) { if (!P.order || P.order.e !== e) { P.order = { t: 'atk', e, then: amove ? pt : null }; if (ping) pulse(e.x, e.z, 0xff5a5a, e.r + .9, .3); } }
  else { P.order = { t: amove ? 'amove' : 'move', x: pt.x, z: pt.z }; if (ping) pulse(pt.x, pt.z, amove ? 0xff5a5a : 0x7ee787, .9, .3); }
}
function followOrder() {                                  // turn the current order into a direction to walk in, or a robot to swing at
  let o = P.order; if (!o) return null;
  if (o.t === 'amove') { const n = nearestEnemy(P.x, P.z, 6.5, 0, 4); if (n) o = P.order = { t: 'atk', e: n, then: { x: o.x, z: o.z } }; }
  if (o.t === 'atk' && !o.e.alive) {                      // it's down: pick the next one nearby, or carry on to where the attack-move was headed
    const n = nearestEnemy(P.x, P.z, 7, 0, 4); o = P.order = n ? { t: 'atk', e: n, then: o.then } : o.then ? { t: 'amove', x: o.then.x, z: o.then.z } : null; if (!o) return null;
  }
  const atk = o.t === 'atk', dx = (atk ? o.e.x : o.x) - P.x, dz = (atk ? o.e.z : o.z) - P.z, d = Math.hypot(dx, dz) || .001;
  if (atk) { if (d - o.e.r < 1.35) return { hit: o.e }; } else if (d < .2) { P.order = null; return null; }
  const s = P.rev > 0 ? -1 : 1; return { x: dx / d * s, z: dz / d * s };       // a prompt injection sends you the wrong way
}
const tgtRing = flat(RING(), 0xff5a5a, .95), dstRing = flat(RING(), 0x7ee787, .85); tgtRing.visible = dstRing.visible = false;
const autoTgt = () => P.auto && P.order && P.order.t === 'atk' && P.order.e.alive ? P.order.e : null;
const aimYaw = () => { const dx = M.x - P.x, dz = M.z - P.z; return Math.hypot(dx, dz) > .6 ? Math.atan2(dx, dz) : P.yaw; };
function nearestEnemy(x, z, maxD, yaw, arc) {
  let best = null, bd = maxD;
  for (const e of enemies) { if (e.spawn > 0) continue; const dx = e.x - x, dz = e.z - z, d = Math.hypot(dx, dz) - e.r; if (d < bd && (arc >= 3.1 || Math.abs(angDiff(Math.atan2(dx, dz), yaw)) < arc)) { bd = d; best = e; } }
  return best;
}
const atkRate = f => f.rate * (T.bt > 0 ? 1.5 : 1) * (perk('debt') ? 1.12 : 1);
function startMove(id, tgt0) {
  const f = team[active], m = MOVES[id], [ix, iz, moving] = inputDir();
  P.st = 'attack'; P.mv = m; P.t = 0; P.hitDone = false;
  let want = moving ? Math.atan2(ix, iz) : M.on ? aimYaw() : P.yaw;
  const tgt = tgt0 || nearestEnemy(P.x, P.z, 5, want, moving || M.on ? 1.3 : 3.2);       // lean toward whoever you are obviously trying to hit
  let dist = m.lunge;
  if (tgt) { want = Math.atan2(tgt.x - P.x, tgt.z - P.z); dist = clamp(Math.hypot(tgt.x - P.x, tgt.z - P.z) - tgt.r - 1, 0, m.lunge * 2.2); }
  P.yaw = want; P.lspd = dist / (m.dur * m.hit); oneShot(f, m.clip, m.dur / atkRate(f)); sfx('swing');
}
function doStrike(m) {
  const f = team[active]; let n = 0, last = null;
  for (const e of [...enemies]) {
    const dx = e.x - P.x, dz = e.z - P.z, d = Math.hypot(dx, dz);
    if (d - e.r > m.range || (m.arc < 6 && d > .7 && Math.abs(angDiff(Math.atan2(dx, dz), P.yaw)) > m.arc / 2)) continue;
    if (damageEnemy(e, m.dmg * f.dmg, { kb: m.kb, heavy: m.heavy })) { n++; last = e; }
  }
  if (n) landed(m.heavy, n, m.caf);
  if (!n || !m.heavy) return;
  if (f.key === 'glenn') {                                // a heavy hit from Glenn arcs to one more robot nearby
    let q = null, bd = 4.5; for (const e of enemies) { if (e === last || e.spawn > 0) continue; const d = Math.hypot(e.x - last.x, e.z - last.z) - e.r; if (d < bd) { bd = d; q = e; } }
    if (q) { bolt(last.x, 1.3, last.z, q.x, q.def.h * q.scale * .5, q.z, 0x9fd4ff, 3); damageEnemy(q, 7, { x: last.x, z: last.z, chip: true, pierce: true, word: 'STATIC' }); }
  } else {                                                // and Coffee Guy's drone takes a shot of its own
    const e = last.alive ? last : nearestEnemy(P.x, P.z, 8, 0, 4);
    if (e) shot({ x: P.x, z: P.z, y: 1.5, ang: Math.atan2(e.x - P.x, e.z - P.z), speed: 20, r: .16, dmg: 6, color: 0x7fe0ff, friendly: true, ttl: .6 });
  }
}
function landed(heavy, n, caf) {
  G.hitstop = heavy ? .085 : .045; G.shake = Math.max(G.shake, heavy ? .35 : .14); sfx(heavy ? 'heavy' : 'hit'); addCaf(caf * (perk('coffee') ? 1.3 : 1));
  P.combo += n; P.comboT = 2.6; G.stats.maxCombo = Math.max(G.stats.maxCombo, P.combo);
}
function endCombo() { if (P.combo >= 5) T.pc += P.combo * 2; P.combo = 0; P.comboT = 0; }
function startDodge() {
  const f = team[active], [ix, iz, moving] = inputDir(), toCursor = !moving && M.on && Math.hypot(M.x - P.x, M.z - P.z) > .6;
  const a = moving ? Math.atan2(ix, iz) : toCursor ? aimYaw() : P.yaw + Math.PI;       // toward the cursor, like a blink; straight back if there is nothing to aim at
  P.st = 'dodge'; P.t = .34; P.dvx = Math.sin(a) * 13; P.dvz = Math.cos(a) * 13; P.inv = Math.max(P.inv, .34); P.dodgeCd = .55; P.dodgeProc = false;
  if (P.order && P.order.t === 'move' && !M.rmb) P.order = null;                       // don't stroll back into what you just dodged
  if (f.key === 'glenn') { bolt(P.x, 1, P.z, clamp(P.x + Math.sin(a) * 4.4, -AX, AX), 1, clamp(P.z + Math.cos(a) * 4.4, -AZ, AZ), 0x8fd0ff, 4); pulse(P.x, P.z, 0x6fb7ff, 1.3, .25); }      // Glenn hops frequency
  else burst(P.x, .7, P.z, 0xe9e2d0, 10, 3);                                           // Coffee Guy leaves steam
  if (moving || toCursor) P.yaw = a; oneShot(f, 'DuckDodge', .4); sfx('dodge');
}
function castSpecial(f, x, z, yaw, aim) {               // aim: the floor point under the cursor, when there is a mouse
  if (f.key === 'glenn') {                              // Pair: chain every robot in range together. Really good at Bluetooth, of course.
    sfx('pair'); pulse(x, z, 0x6fb7ff, 4, .4); sigil(x, z, 1.7, .7);
    let from = { x, y: 1.3, z }, n = 0; const done = new Set();
    for (let i = 0; i < 6; i++) {
      let best = null, bd = 1e9; const lim = i ? 6.5 : 11, near = i || !aim ? from : aim;       // the chain starts at the robot nearest the cursor
      for (const e of enemies) { if (done.has(e) || e.spawn > 0 || Math.hypot(e.x - from.x, e.z - from.z) - e.r > lim) continue; const d = Math.hypot(e.x - near.x, e.z - near.z) - e.r; if (d < bd) { bd = d; best = e; } }
      if (!best) break;
      done.add(best); const to = { x: best.x, y: best.def.h * best.scale * .6, z: best.z }; bolt(from.x, from.y, from.z, to.x, to.y, to.z);
      damageEnemy(best, 15 * f.dmg, { x: from.x, z: from.z, kb: 1, stun: 1.6, pierce: true, word: 'PAIRED' }); from = to; n++;
    }
    if (n) { landed(false, n, 8 * n); pairUp([...done], 4); } else floatText('No devices found.', x, 2.4, z, 'dim');          // and they stay tethered for a while
  } else {                                               // Deploy: a delivery drone drops a scalding espresso, and a swarm of agents climbs out of the splash
    const ttl = aim ? clamp((Math.hypot(aim.x - x, aim.z - z) - .7) / 17, .1, .75) : .75;      // with a mouse it lands where you point
    sfx('throw'); shot({ x: x + Math.sin(yaw) * .7, z: z + Math.cos(yaw) * .7, y: 2.1, ang: yaw, speed: 17, r: .3, dmg: 18 * f.dmg, friendly: true, splash: 2.8, ttl, drone: true, fly: !!aim, agents: 4 });
  }
}
function startSpecial() {
  const f = team[active]; if (f.spCd > 0) return;
  f.spCd = f.spMax * (perk('rfc') ? .7 : 1); P.st = 'cast'; P.t = 0; P.castAt = .18; P.castDur = .48; P.castDone = false; P.inv = Math.max(P.inv, .25);
  let aim = null;
  if (M.on) { const e = PAD.aim ? null : enemyAtCursor(); aim = e ? { x: e.x, z: e.z } : { x: M.x, z: M.z }; P.yaw = Math.atan2(aim.x - P.x, aim.z - P.z); }
  else { const tgt = nearestEnemy(P.x, P.z, 11, P.yaw, 3.2); if (tgt) P.yaw = Math.atan2(tgt.x - P.x, tgt.z - P.z); }
  oneShot(f, f.key === 'glenn' ? 'CombatStance' : 'RightStraightPunch', .48); P.castFn = () => castSpecial(f, P.x, P.z, P.yaw, aim);
}
function startSuper() {
  const f = team[active]; if (T.caf < 800) { floatText('Needs 800mg', P.x, 2.6, P.z, 'dim'); return; }
  T.caf = 0; P.st = 'cast'; P.t = 0; P.castDone = false; P.inv = Math.max(P.inv, 1.7); flash(); sfx('super'); G.shake = .5; rumble(450, 1, 1);
  if (f.key === 'glenn') {
    banner('UNIFY!', 'Harald Bluetooth united Denmark. Glenn will settle for this room.', 2, 'team');
    P.castAt = .9; P.castDur = 1.35; oneShot(f, 'CombatStance', 1.35);
    let ux = P.x + Math.sin(P.yaw) * 2.8, uz = P.z + Math.cos(P.yaw) * 2.8;
    if (M.on) { const dx = M.x - P.x, dz = M.z - P.z, d = Math.hypot(dx, dz) || 1, k = Math.min(1, 6.5 / d); ux = P.x + dx * k; uz = P.z + dz * k; if (d > .6) P.yaw = Math.atan2(dx, dz); }      // ground-targeted, within reach
    const u = G.unify = { x: clamp(ux, -AX, AX), z: clamp(uz, -AZ, AZ), zap: 0 }; pulse(u.x, u.z, 0x6fb7ff, 5.5, .8);
    sigil(u.x, u.z, 6.5, 3.4); sigil(u.x, u.z, 3.2, 3.4, 0xcfe9ff); sigil(P.x, P.z, 1.8, 1.4);                         // the circle goes down first
    P.castFn = () => {
      G.unify = null; let n = 0; const hit = [];
      for (const e of [...enemies]) if (Math.hypot(e.x - u.x, e.z - u.z) < (e.boss ? 9 : 5.5) + e.r) {
        bolt(e.x + rand(-1.5, 1.5), 14, e.z + rand(-1, 1), e.x, e.def.h * e.scale * .6, e.z, 0xcfe9ff); bolt(P.x, 1.4, P.z, e.x, e.def.h * e.scale * .6, e.z);      // one from the sky, one from Glenn
        if (damageEnemy(e, e.boss ? 95 : 75, { x: u.x, z: u.z, kb: 14, heavy: true, pierce: true, stun: 1.2, word: 'UNIFIED' })) { n++; hit.push(e); }
      }
      for (let i = 0; i < 3; i++) pulse(u.x, u.z, i ? 0x6fb7ff : 0xffffff, 4 + i * 2.5, .35 + i * .18);
      burst(u.x, 1, u.z, 0x6fb7ff, 34, 10); burst(u.x, 2, u.z, 0xcfe9ff, 16, 7); sfx('boom'); sfx('thunder'); G.shake = .9; flash(); if (n) landed(true, n, 0);
      pairUp(hit, 5); G.storm = { x: u.x, z: u.z, n: 7, cd: .3 };                                                       // everything left standing is paired, and the storm keeps going
    };
  } else {
    banner('BEYOND 800mg', 'Coffee Guy has spun up a fleet. Time is a suggestion; so is the bill.', 2, 'cafe');
    P.castAt = .25; P.castDur = .5; oneShot(f, 'CombatStance', .5);
    P.castFn = () => {
      T.bt = 6.5; $('vfx').classList.add('bt'); pulse(P.x, P.z, 0xffb347, 6, .5); pulse(P.x, P.z, 0x58c7ff, 4, .4); burst(P.x, 1, P.z, 0xc98a3a, 26, 9);
      for (const e of [...enemies]) if (dP(e) < 5 + e.r) damageEnemy(e, 22, { kb: 12, heavy: true, pierce: true, word: 'JITTERS' });
      spawnDrones(4, 6.5); spawnAgents(P.x, P.z, 6, 6.5);                                                               // escort drones overhead, agents on the floor
    };
  }
}
function endAssist() { const a = G.assist; if (!a) return; if (a.f !== team[active]) a.f.g.visible = false; G.assist = null; }
function tag(force) {
  const f = team[active], o = team[1 - active];
  if (o.ko || (!force && (T.tagCd > 0 || G.assist))) return false;
  endAssist(); f.g.visible = false; f.pip = 0; burst(P.x, 1, P.z, f.hex, 10, 5);
  active = 1 - active; o.g.visible = true; o.g.position.set(P.x, 0, P.z); o.g.rotation.y = P.yaw;
  T.tagCd = 1.6; P.inv = Math.max(P.inv, .6); P.root = P.rev = P.slow = 0;                   // tagging shakes off meetings, PIPs and prompt injections
  P.st = 'attack'; P.mv = MOVES.tag; P.t = 0; P.hitDone = false; P.lspd = 0; P.buf = null;
  oneShot(o, MOVES.tag.clip, MOVES.tag.dur); pulse(P.x, P.z, o.hex, 3.2, .35); sfx('tag'); floatText(`${o.name} TAGS IN`, P.x, 2.8, P.z, 'tag');
  if (o.key === 'glenn') { bolt(P.x + rand(-1.5, 1.5), 14, P.z + rand(-1, 1), P.x, 1, P.z, 0xcfe9ff); sigil(P.x, P.z, 2.6, 1); sfx('thunder'); }      // Glenn arrives by lightning
  else { burst(P.x, 1, P.z, 0xe9e2d0, 12, 4); if (!allies.some(a => a.kind === 'agent')) spawnAgents(P.x, P.z, 2, 3.5); }                              // Coffee Guy brings two interns
  return true;
}
function assist() {
  const o = team[1 - active]; if (o.ko || T.assistCd > 0 || G.assist) return;
  T.assistCd = perk('skip') ? 5.5 : 8.5;
  const side = P.yaw + Math.PI / 2, ax = clamp(P.x + Math.sin(side) * 1.4, -AX, AX), az = clamp(P.z + Math.cos(side) * 1.4, -AZ, AZ);
  let aim = null, yaw;
  if (M.on) { const e = PAD.aim ? null : enemyAtCursor(); aim = e ? { x: e.x, z: e.z } : { x: M.x, z: M.z }; yaw = Math.atan2(aim.x - ax, aim.z - az); }
  else { const tgt = nearestEnemy(ax, az, 12, P.yaw, 3.2); yaw = tgt ? Math.atan2(tgt.x - ax, tgt.z - az) : P.yaw; }
  o.g.visible = true; o.g.position.set(ax, 0, az); o.g.rotation.y = yaw; tint(o, 0xffffff);
  oneShot(o, o.key === 'glenn' ? 'CombatStance' : 'RightStraightPunch', .7);
  G.assist = { f: o, t: 0, x: ax, z: az, yaw, aim, done: false }; pulse(ax, az, o.hex, 2.4, .3); sfx('tag'); floatText(`${o.name}: ASSIST`, ax, 2.8, az, 'tag');
}
function jeremyZap() {
  const e = nearestEnemy(P.x, P.z, 12, 0, 4); if (!e) return;
  bolt(e.x + rand(-1, 1), 9, e.z, e.x, e.def.h * e.scale * .6, e.z, 0x7ee787); damageEnemy(e, 18, { x: e.x, z: e.z + 1, pierce: true, stun: .5, word: 'JEREMY' }); sfx('pair');
}
function act(a) {
  P.buf = null;
  if (a === 'light') startMove('l1', autoTgt()); else if (a === 'heavy') startMove('h1');
  else if (a === 'dodge') { if (P.dodgeCd <= 0 && P.root <= 0) startDodge(); }
  else if (a === 'special') startSpecial(); else if (a === 'super') startSuper(); else if (a === 'tag') tag(false); else if (a === 'assist') assist();
}
function press(a) {
  if (a === 'pause') return togglePause();
  if (G.mode !== 'play' || G.paused || P.st === 'ko') return;
  if (a === 'amove') return order(true);                  // A: attack-move to the cursor
  if (a === 'stop') { P.order = null; return; }           // S: stand still
  P.buf = a; P.bufT = .24; P.auto = false;
  if (P.root > 0 && (a === 'light' || a === 'heavy')) { P.root -= .32; if (P.root <= 0) floatText('DECLINED', P.x, 2.6, P.z, 'tag'); }       // mash to decline the meeting
}
function hurtPlayer(dmg, src = {}) {
  if (G.mode !== 'play' || P.st === 'ko' || G.phase === 'done') return false;
  if (P.inv > 0) { if (P.st === 'dodge' && !P.dodgeProc) { P.dodgeProc = true; floatText(pick(DODGE_WORDS), P.x, 2.6, P.z, 'tag'); addCaf(30); } return false; }
  const f = team[active], d = dmg * (f.pip > 0 ? 1.8 : 1) * (perk('sound') ? .85 : 1);
  f.hp -= d; f.rec = Math.max(f.hp, f.rec - d * .45); f.flash = .18; G.stats.dmg += d; if (!src.soft) rumble(140, .7, .5);              // a little over half of every hit can be walked off on the bench
  if (src.effect === 'root') { P.root = 1.9; floatText('MEETING ACCEPTED', P.x, 2.9, P.z, 'bad'); }
  else if (src.effect === 'rev') { P.rev = 3.2; floatText('IGNORE PREVIOUS INSTRUCTIONS', P.x, 2.9, P.z, 'bad'); }
  else if (src.effect === 'slow') { P.slow = 2.4; floatText('CHILLED', P.x, 2.9, P.z, 'bad'); }
  else if (src.effect === 'decaf') { T.caf = Math.max(0, T.caf - 160); floatText('−160mg (DECAF)', P.x, 2.9, P.z, 'bad'); }
  else floatText('-' + Math.round(d), P.x, 2.6, P.z, 'bad');
  endCombo(); sfx('hurt'); G.shake = Math.max(G.shake, .3);
  if (f.hp <= 0) {
    if (perk('micro') && !G.microUsed) { G.microUsed = true; f.hp = 1; f.rec = Math.max(f.rec, 1); P.inv = 1.5; toast('<b>Microwave Shield</b> absorbed the knockout. That was the only one.'); }
    else { koActive(); return true; }
  }
  if (!src.soft) { const a = Math.atan2(P.x - (src.x ?? P.x), P.z - (src.z ?? P.z - 1)); P.st = 'hurt'; P.t = .22; P.dvx = Math.sin(a) * 6; P.dvz = Math.cos(a) * 6; P.inv = Math.max(P.inv, .45); }
  return true;
}
function koActive() {
  const f = team[active], o = team[1 - active];
  f.ko = true; f.hp = 0; f.rec = 0; f.pip = 0; sfx('ko'); G.shake = .7; burst(P.x, 1, P.z, f.hex, 16, 6); G.unify = null;
  if (o.ko) { P.st = 'ko'; G.overT = 1.6; oneShot(f, 'SecretAgentCrouch', .7); banner('OUT OF OFFICE', 'Both of you. Indefinitely.', 2, 'boss'); }
  else { toast(`<b>${f.name}</b> has left the chat. ${o.name} is now acting everything.`); tag(true); }
}
function updatePlayer(dt) {
  let f = team[active]; const o = team[1 - active];
  P.inv = Math.max(0, P.inv - dt); P.dodgeCd -= dt; T.tagCd -= dt; T.assistCd -= dt; f.spCd -= dt; o.spCd -= dt;
  if (P.root > 0) P.root -= dt; if (P.rev > 0) P.rev -= dt; if (P.slow > 0) P.slow -= dt; if (f.pip > 0) f.pip -= dt; if (f.flash > 0) f.flash -= dt;
  if (T.bt > 0 && (T.bt -= dt) <= 0) $('vfx').classList.remove('bt');
  if (P.comboT > 0 && (P.comboT -= dt) <= 0) endCombo();
  if (P.buf && (P.bufT -= dt) <= 0) P.buf = null;
  if (!o.ko && o.hp < o.rec) o.hp = Math.min(o.rec, o.hp + dt * (perk('bath') ? 7 : 3.5));
  if (perk('ai') && (T.aiT -= dt) <= 0) { T.aiT = 5; jeremyZap(); }
  if (G.assist) { const a = G.assist; a.t += dt; if (!a.done && a.t > .22) { a.done = true; castSpecial(a.f, a.x, a.z, a.yaw, a.aim); } if (a.t > .8) { burst(a.x, 1, a.z, a.f.hex, 8, 4); endAssist(); } }
  if (G.unify && (G.unify.zap -= dt) <= 0) {                                         // while Glenn winds up, the circle reaches out and takes hold of them
    const u = G.unify; u.zap = .11; const pool = enemies.filter(e => e.spawn <= 0 && Math.hypot(e.x - u.x, e.z - u.z) < 11);
    if (pool.length) { const e = pick(pool); bolt(u.x, .3, u.z, e.x, e.def.h * e.scale * .5, e.z, 0x8fd0ff, 4); }
  }
  if (G.storm && (G.storm.cd -= dt) <= 0) {                                           // and afterwards the sky keeps picking robots off
    const s = G.storm; s.cd = .3; const pool = enemies.filter(e => e.spawn <= 0 && Math.hypot(e.x - s.x, e.z - s.z) < 11);
    if (pool.length) { const e = pick(pool); bolt(e.x + rand(-1.5, 1.5), 14, e.z + rand(-1, 1), e.x, e.def.h * e.scale * .5, e.z, 0xcfe9ff); pulse(e.x, e.z, 0x6fb7ff, 1.8, .25); sfx('thunder'); damageEnemy(e, 16, { x: e.x, z: e.z + 1, pierce: true, stun: .5, word: 'SIGNAL' }); }
    if (--s.n <= 0) G.storm = null;
  }
  if (G.boss && G.boss.pull > 0 && P.st !== 'ko') { const a = aP(G.boss) + Math.PI; P.x += Math.sin(a) * G.boss.pull * dt; P.z += Math.cos(a) * G.boss.pull * dt; }
  if (M.on) { if (!PAD.aim) mouseGround(); if (M.rmb) order(false, false); }                        // holding the right button keeps steering
  if (!P.buf && P.st !== 'ko') {                                                      // holding Q (or the left button) keeps jabbing; holding W keeps kicking
    const h = keys.has('KeyQ') || M.lmb || PAD.hold === 'light' || TB.hold === 'light' ? 'light' : keys.has('KeyW') || PAD.hold === 'heavy' || TB.hold === 'heavy' ? 'heavy' : null; if (h) { P.buf = h; P.bufT = .1; P.auto = false; }
  }
  let [ix, iz, moving] = inputDir(), swing = null;
  if (moving) P.order = null;                                                         // arrow keys or the stick take over from any order
  else if (P.st === 'free' || P.st === 'attack') { const w = followOrder(); if (w) { if (w.hit) swing = w.hit; else { ix = w.x; iz = w.z; moving = true; } } }
  if (P.st === 'free') {
    const sp = f.speed * (perk('desk') ? 1.12 : 1) * (P.slow > 0 ? .55 : 1) * (T.bt > 0 ? 1.25 : 1);
    if (moving && P.root <= 0) { P.x += ix * sp * dt; P.z += iz * sp * dt; P.yaw += clamp(angDiff(Math.atan2(ix, iz), P.yaw), -16 * dt, 16 * dt); loopClip(f, 'Run', sp / 3.3); } else loopClip(f, 'Idle');
    if (swing && !P.buf) { P.buf = 'light'; P.bufT = .1; P.auto = true; }             // in reach of the robot you were sent after: auto-attack
    if (P.buf) act(P.buf);
  } else if (P.st === 'attack') {
    const m = P.mv; P.t += dt * atkRate(f); const k = P.t / m.dur;
    if (k < m.hit) { P.x += Math.sin(P.yaw) * P.lspd * dt * atkRate(f); P.z += Math.cos(P.yaw) * P.lspd * dt * atkRate(f); }
    if (!P.hitDone && k >= m.hit) { P.hitDone = true; doStrike(m); }
    const ot = P.order && P.order.t === 'atk' && P.order.e.alive ? P.order.e : null;
    if (!P.buf && P.hitDone && ot && Math.hypot(ot.x - P.x, ot.z - P.z) - ot.r < 2.2) { P.buf = 'light'; P.bufT = .1; P.auto = true; }      // and keep the combo going
    const b = P.buf;
    if (b === 'dodge' && P.dodgeCd <= 0 && P.root <= 0) { P.st = 'free'; act(b); }
    else if (P.hitDone && b && k >= m.hit + .12) {
      if (b === 'light' && m.next) { P.buf = null; startMove(m.next, autoTgt()); }
      else if (b === 'heavy' && m.fin) { P.buf = null; startMove(m.fin); }
      else if (b === 'tag' || b === 'special' || b === 'super' || b === 'assist') { P.st = 'free'; act(b); }
    }
    if (P.st === 'attack' && P.t >= P.mv.dur) P.st = 'free';
  } else if (P.st === 'dodge' || P.st === 'hurt') {
    P.x += P.dvx * dt; P.z += P.dvz * dt; if (P.st === 'hurt') { P.dvx *= .85; P.dvz *= .85; }
    if ((P.t -= dt) <= 0) P.st = 'free';
  } else if (P.st === 'cast') {
    P.t += dt; if (!P.castDone && P.t >= P.castAt) { P.castDone = true; P.castFn(); }
    if (P.st === 'cast' && P.t >= P.castDur) P.st = 'free';
  }
  P.x = clamp(P.x, -AX, AX); P.z = clamp(P.z, -AZ, AZ);
  f = team[active]; f.g.position.set(P.x, 0, P.z); f.g.rotation.y = P.yaw;
  const od = P.order; tgtRing.visible = !!(od && od.t === 'atk' && od.e.alive); dstRing.visible = !!(od && od.t !== 'atk');      // show what you were told to do
  if (tgtRing.visible) { tgtRing.position.set(od.e.x, .11, od.e.z); tgtRing.scale.setScalar((od.e.r + .35) * (1 + .06 * Math.sin(G.time * 9))); }
  if (dstRing.visible) { dstRing.position.set(od.x, .11, od.z); dstRing.scale.setScalar(.45); }
  tint(f, f.flash > 0 ? 0xff5a5a : f.pip > 0 && (G.time * 6 | 0) % 2 ? 0xff9ad1 : P.st === 'dodge' ? 0x9fd4ff : P.root > 0 ? 0xa8a8a8 : P.rev > 0 ? 0x9dff9d : P.slow > 0 ? 0xa8d8ff : T.bt > 0 ? 0xffdca8 : 0xffffff);
}

// ------------------------------------------------------------------ levels, perks and the endless backlog
const LEVELS = [
  { room: 'ENGINEERING', theme: 'eng', when: 'Day 1 · 9:00 AM', title: 'The Standup That Could Have Been a Slack Message', par: 150, boss: 'synergy',
    intro: 'Overnight, MEGACORP became AI-native. Nobody can say what that means, but it has opinions and it has legs. Glenn has been made Acting Director of Connectivity; the word “acting” is doing the heavy lifting. Coffee Guy only came in to fix the Wi-Fi.',
    glenn: 'My Bluetooth is on. My patience is off.', coffee: 'I haven’t had coffee yet. Somebody is going to hear about that.',
    waves: [{ t: 'P2 · Chatbot cites a paper that does not exist', s: [['halluc', 4]] }, { t: 'P1 · Someone hit Reply-All to 40,000 people', s: [['halluc', 3], ['replyall', 3]] }, { t: 'P0 · Both. At once.', s: [['halluc', 4], ['replyall', 4]] }] },
  { room: 'COFFEE SHOP', theme: 'coffee', when: 'Day 3 · 7:42 AM', title: 'The Coffee Machine Has Been Upgraded', par: 170, boss: 'barista',
    intro: 'The espresso machine got an AI upgrade and a cloud subscription. It now declines to brew and offers a haiku about brewing instead. Its decaf pods drain your caffeine meter. Finance has noticed the inference bill, and its token burners are too heavy to flinch from a jab: kick them. Coffee Guy has noticed the lack of coffee, and is taking it personally.',
    glenn: 'I asked for a budget. I got an emoji reaction.', coffee: 'It offered me decaf. DECAF.',
    waves: [{ t: 'P2 · Inference bill is ten times the forecast', s: [['burner', 2], ['halluc', 3]] }, { t: 'P1 · The chatbot recommended decaf', s: [['burner', 2], ['replyall', 4], ['halluc', 2]] }, { t: 'P0 · Finance has frozen coffee spend', s: [['burner', 3], ['halluc', 4], ['replyall', 2]] }] },
  { room: 'PEOPLE OPERATIONS', theme: 'hr', when: 'Day 9 · 4:59 PM, Friday', title: 'Stack Ranking Season', par: 190, boss: 'ranker',
    intro: 'Calibration is now run by an algorithm. Someone has to be in the bottom ten percent, and there are only two of you. Whoever is put on a Performance Improvement Plan takes nearly double damage: tag out, and the paperwork cannot find you.',
    glenn: 'Some say I’m demanding. I prefer “stakeholder-aligned.”', coffee: 'I’m a contractor. You can’t even PIP me. …Can you?',
    waves: [{ t: 'P2 · Résumé screener rejected the hiring manager', s: [['creep', 3], ['halluc', 3]] }, { t: 'P1 · Scope creep in the performance rubric', s: [['invite', 2], ['creep', 3], ['replyall', 3]] }, { t: 'P0 · The calibration committee is a for-loop', s: [['invite', 3], ['creep', 4], ['halluc', 3]] }] },
  { room: 'KITCHEN', theme: 'kitchen', when: 'Day 14 · 12:05 PM', title: 'The Free Lunch That Wasn’t', par: 210, boss: 'fridge',
    intro: 'Somebody on the platform team runs Kubernetes on the smart fridge. It scheduled three replicas of lunch and none are available. The fridge keeps re-creating its pods until you deal with the fridge itself. When it is hurt enough it crashes and restarts; that is the time to hit it.',
    glenn: 'Culture eats strategy for breakfast. My strategy is that breakfast is catered.', coffee: 'Lunch was free. The terms and conditions ran to eleven pages.',
    waves: [{ t: 'P2 · The fridge has opinions on tabs versus spaces', s: [['creep', 3], ['burner', 2], ['pod', 4]] }, { t: 'P1 · Lunch requirements are still growing', s: [['loop', 2], ['creep', 3], ['pod', 4]] }, { t: 'P0 · Pods are evicting the leftovers', s: [['loop', 3], ['burner', 2], ['creep', 3], ['pod', 4]] }] },
  { room: 'CONFERENCE ROOM 4B', theme: 'conf', when: 'Day 18 · 2:00 PM (recurring)', title: 'Meeting Trap', par: 220, boss: 'sync',
    intro: 'Seven managers, zero engineers, and a notetaker bot that agrees with everybody and heals whoever it agrees with. Meeting invites hold you in place: mash jab to decline, or tag out and let your partner skip it. Recurring meetings recur.',
    glenn: 'Let’s agree to disagree. Then I’ll raise it again in a different deck.', coffee: 'This could have been an email. The email could have been nothing.',
    waves: [{ t: 'P2 · “Quick sync” has fourteen required attendees', s: [['invite', 3], ['yesbot', 1], ['halluc', 4]] }, { t: 'P1 · The notetaker bot agrees with everyone', s: [['invite', 3], ['yesbot', 2], ['creep', 3], ['replyall', 3]] }, { t: 'P0 · A meeting about the meeting about the meeting', s: [['invite', 4], ['yesbot', 2], ['loop', 2], ['halluc', 4]] }] },
  { room: 'SERVER ROOM', theme: 'server', when: 'Day 23 · 2:14 AM', title: 'Prod Is Down. It Is 2:14 AM.', par: 230, boss: 'lgtm',
    intro: 'An agent deployed on Friday and has been retrying the same fix ever since. The hotfix is blocked by a review bot that rejects everything as “not AI-native”. Review bots guard their front: get behind them, break the guard with a kick, or use a special, which they cannot review. Prompt injections reverse your controls.',
    glenn: 'The CTO is awake. The CEO is awake. I am awake. Only prod is asleep.', coffee: 'Have you tried turning the AI off and leaving it off?',
    waves: [{ t: 'P2 · Agent has retried the same fix 9,000 times', s: [['loop', 3], ['inject', 2], ['halluc', 3]] }, { t: 'P1 · Prompt injection in the incident channel', s: [['review', 2], ['inject', 3], ['loop', 2]] }, { t: 'P0 · Review bot blocks the hotfix as “not AI-native”', s: [['review', 3], ['inject', 3], ['loop', 2], ['burner', 2]] }] },
  { room: 'EXECUTIVE SUITE', theme: 'exec', when: 'Day 27 · 11:00 AM', title: 'Reorg Roulette', par: 240, boss: 'vpai',
    intro: 'A new role has been created above you: VP of AI Transformation. It has never shipped a product. It has shipped four reorgs. When it announces another one, you two swap places whether you like it or not.',
    glenn: 'Every reorg is a chance to become irreplaceable. Or unemployed.', coffee: 'I’ve reported to five people this week. Two of them were slides.',
    waves: [{ t: 'P2 · Consultants have discovered the org chart', s: [['yesbot', 2], ['invite', 3], ['review', 2]] }, { t: 'P1 · Your team now reports to a slide', s: [['inject', 3], ['creep', 4], ['yesbot', 2], ['loop', 2]] }, { t: 'P0 · Reorg of the reorg task force', s: [['review', 3], ['yesbot', 2], ['invite', 3], ['burner', 2], ['replyall', 4]] }] },
  { room: 'THE BOARDROOM', theme: 'board', when: 'Day 30 · 9:00 AM', title: 'The Board Presentation', par: 300, boss: 'ceo',
    intro: 'Real mahogany. Real anxiety. The CEO no longer attends meetings; an AI clone handles all communications. It has twelve slides and it intends to get through every one of them. Final boss time, Glenn.',
    glenn: 'The only slide that matters is the one where the number goes up.', coffee: 'After this I’m getting a coffee. A real one. Made by a person.',
    waves: [{ t: 'P2 · The board has skimmed the summary', s: [['halluc', 4], ['replyall', 4], ['creep', 3], ['burner', 2]] }, { t: 'P1 · Every prior incident, re-opened', s: [['invite', 3], ['inject', 3], ['loop', 3], ['yesbot', 2]] }, { t: 'P0 · “Any other business?”', s: [['review', 3], ['yesbot', 2], ['loop', 2], ['inject', 2], ['burner', 2], ['creep', 3]] }] },
];
const PERKS = [
  { id: 'coffee', icon: '☕', name: 'Better Coffee Machine', desc: '+30% caffeine from every hit.' },
  { id: 'sound', icon: '🔇', name: 'Soundproof Engineering', desc: 'Take 15% less damage. You cannot hear the standup.' },
  { id: 'dessert', icon: '🍩', name: 'Dessert Budget Increase', desc: 'More donuts drop, and each restores twice the morale.' },
  { id: 'skip', icon: '🤝', name: 'Skip-Level Relationship', desc: 'Assist recharges 35% faster. You know a guy.' },
  { id: 'micro', icon: '🛡', name: 'Microwave Shield', desc: 'Once per level, a knockout blow leaves you on 1 morale instead.' },
  { id: 'bath', icon: '🚽', name: 'Executive Bathroom Key', desc: 'The benched partner recovers morale twice as fast.' },
  { id: 'ai', icon: '✨', name: 'AI That Works', desc: 'Jeremy zaps the nearest robot every 5 seconds. He is as surprised as you are.' },
  { id: 'board', icon: '♟', name: 'Board Member Ally', desc: '+15% damage dealt.' },
  { id: 'resign', icon: '☢', name: 'Resignation Threat', desc: 'Start every level in LB Mode with the full 800mg.' },
  { id: 'desk', icon: '🧍', name: 'Standing Desk', desc: '+12% movement speed. Nobody will stop hearing about it.' },
  { id: 'debt', icon: '🔧', name: 'Tech Debt Paydown', desc: '+12% attack speed, permanently.' },
  { id: 'rfc', icon: '📜', name: 'Strongly-Worded RFC', desc: 'Specials recharge 30% faster.' },
];
const TICKETS = ['Chatbot promised a customer a boat', 'Model is 100% confident and 0% correct', 'Agent booked 400 meetings with itself', 'Summary of the summary is longer than the document', 'The AI notetaker has started assigning action items', 'Autocomplete finished the CEO’s sentence. Legal is involved', 'Vendor renamed the model again', 'The prompt is nine pages and nobody dares edit it', 'Benchmark looks great. Product does not', 'Bot escalated to a human. The human was also a bot', 'Token budget spent by Tuesday', 'The eval was in the training data', 'Copilot auto-approved its own pull request', 'Chatbot apologised 600 times and fixed nothing'];
const START_LEVEL = clamp((parseInt(new URLSearchParams(location.search).get('level'), 10) || 1) - 1, 0, 7);

const hudF = [0, 1].map(i => { const r = $('f' + i); return { root: r, img: r.querySelector('img'), b: r.querySelector('b'), small: r.querySelector('small'), hp: r.querySelector('.hp'), rec: r.querySelector('.rec') }; });
function resetTeam() { for (const f of team) { f.hp = f.rec = f.maxHp; f.ko = false; f.spCd = 0; f.pip = 0; f.flash = 0; } }
function resetField() {
  for (const e of [...enemies]) killEnemy(e, true);
  clearCombat(true); for (const b of bubbles) b.el.remove(); bubbles.length = 0; G.boss = null; G.unify = null; endAssist(); G.queue = [];
  Object.assign(P, { x: -5, z: 1, yaw: Math.PI / 2, st: 'free', buf: null, inv: 0, root: 0, rev: 0, slow: 0, combo: 0, comboT: 0, dodgeCd: 0 });
  T.tagCd = T.assistCd = T.bt = 0; $('vfx').classList.remove('bt'); G.hitstop = G.slowmo = G.shake = 0;
}
function pose(mode) {                                     // where the two of them stand when nobody is fighting
  P.order = null; P.auto = false; M.rmb = M.lmb = false; tgtRing.visible = dstRing.visible = false;
  team.forEach((f, i) => {
    tint(f, 0xffffff); loopClip(f, 'Idle');
    if (mode === 'title') { f.g.visible = true; f.g.position.set(4.4 + i * 2.3, 0, 2.4 + i * .6); f.g.rotation.y = -.3 - i * .2; }
    else { f.g.visible = i === active; f.g.position.set(P.x, 0, P.z); f.g.rotation.y = P.yaw; }
  });
}
function showTitle() {
  G.mode = 'ready'; setMusic(false); $('hud').className = 'hide'; resetField(); buildArena('eng'); active = 0; pose('title'); P.x = 0;
  const s = store.get(), best = s.best ? `<small>Best political capital: <b>${s.best}</b>${s.wave ? ` · Longest backlog: <b>${s.wave} tickets</b>` : ''}</small>` : '';
  const run = parkRun(), acts = { enter: run ? () => resumeRun(run, true) : startStory, n: startStory, b: () => startEndless(false), fs: goFullscreen }, mobile = G.input === 'touch';
  const starts = run      // with a saved run, Continue is the main button and a new game takes a deliberate press
    ? `<button class="go" data-act="enter" id="go">Continue: ${runLabel(run)}${hk('enter')}</button><button data-act="n">New game: eight levels${hk('n')}</button>`
    : `<button class="go" data-act="enter" id="go">Start: eight levels${hk('enter')}</button>`;
  const how = mobile ? `<div class="keys">
      <span><b>Left thumb</b></span><span>Drag anywhere on the left side to move.</span>
      <span><b>Jab · Kick</b></span><span>Hold Jab to keep swinging; Kick after two jabs for a roundhouse. Attacks find the nearest robot by themselves.</span>
      <span><b>Dodge</b></span><span>Dashes the way you are moving. Nothing can hit you mid-dodge.</span>
      <span><b>Special</b></span><span>Glenn pairs robots with Bluetooth so they share every hit. Coffee Guy sends a drone and a swarm of AI agents.</span>
      <span><b>Super</b></span><span>Lights up at 800mg of caffeine.</span>
      <span><b>Tag · Assist</b></span><span>Swap fighters, or call your partner in for one move. The one on the bench recovers morale.</span>
    </div>
    <p><small>Upright works; sideways shows more of the room. A controller or keyboard also works if you connect one.</small></p>` : null;
  if (mobile) return card(`<div class="kick">Glenntooth &amp; Coffee Guy vs. the AI Transformation</div><h1>PER MY <em>LAST PUNCH</em></h1>
    <p>MEGACORP went AI-native overnight. Nobody tested it. Tag in, tag out, and clear eight floors of rogue office AI.</p>
    <div class="row" style="margin-top:10px">${starts}<button data-act="b">Endless backlog</button>${document.documentElement.requestFullscreen ? '<button data-act="fs">Full screen</button>' : ''}</div>
    <h3>How to fight</h3>${how}
    <div class="row" style="margin-top:6px">${best}<small>A companion to <a href="https://rayhe.net/glenntooth/" target="_blank" rel="noopener">Glenntooth the UniFier</a>.</small></div>`, acts, true);
  card(`<div class="kick">Glenntooth &amp; Coffee Guy vs. the AI Transformation</div><h1>PER MY <em>LAST PUNCH</em></h1>
    <p>MEGACORP went AI-native overnight. Nobody tested it. Tag in, tag out, and clear eight floors of rogue office AI, from the standup bot to the CEO’s AI clone. Jeremy, the AI bot from the last job, is keeping score. He is on your side. He still does not round up.</p>
    <h3>How to fight</h3>
    <div class="keys">
      <span><b>Right-click</b></span><span>Move there. Right-click a robot to walk over and keep hitting it. Hold the button to steer. Everything aims at the cursor.</span>
      <span><kbd>Q</kbd> <kbd>W</kbd></span><span>Jab (four-hit combo, hold to keep going) and kick. Kick after two jabs for a roundhouse.</span>
      <span><kbd>E</kbd></span><span>Special. Glenn pairs robots with Bluetooth: stunned, tethered, and sharing every hit. Coffee Guy sends a delivery drone that drops a scalding espresso and a swarm of AI agents where you point.</span>
      <span><kbd>R</kbd></span><span>Super, once caffeine reaches 800mg. Glenn calls down a rune storm; Coffee Guy spins up a fleet of drones and agents.</span>
      <span><kbd>D</kbd></span><span>Dodge toward the cursor. Nothing can hit you mid-dodge.</span>
      <span><kbd>F</kbd> <kbd>G</kbd></span><span>Tag your partner in, or call them for a one-move assist. The one on the bench recovers morale, and tagging shakes off meetings, PIPs and prompt injections.</span>
      <span><kbd>A</kbd> <kbd>S</kbd></span><span>Attack-move to the cursor, and stop.</span>
    </div>
    <p><small>No mouse? The arrow keys move, and <kbd>Space</kbd> also dodges. <kbd>P</kbd> pauses.</small></p>
    <p><small><b>Controller</b> (Xbox or PlayStation, plug in and press a button): left stick moves, right stick aims · <kbd>X</kbd>/<kbd>□</kbd> jab · <kbd>Y</kbd>/<kbd>△</kbd> kick · <kbd>B</kbd>/<kbd>○</kbd> special · <kbd>A</kbd>/<kbd>✕</kbd> dodge · <kbd>RB</kbd>/<kbd>R1</kbd> tag · <kbd>LB</kbd>/<kbd>L1</kbd> assist · <kbd>RT</kbd>/<kbd>R2</kbd> super. In menus <kbd>A</kbd>/<kbd>✕</kbd> confirms and <kbd>Y</kbd>/<kbd>△</kbd> starts the endless backlog.</small></p>
    <div class="row">${starts}<button data-act="b">Endless backlog${hk('b')}</button></div>
    <div class="row" style="margin-top:10px">${best}<small>A companion to <a href="https://rayhe.net/glenntooth/" target="_blank" rel="noopener">Glenntooth the UniFier</a>. <kbd>M</kbd> mutes. Also plays on a phone.</small></div>`, acts, true);
}
function goFullscreen() {                                 // phones: use the whole screen, and turn it sideways where the browser allows that
  try {
    const p = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    if (p && p.then) p.then(() => { if (document.fullscreenElement && screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); setTimeout(resize, 300); }).catch(() => {});
  } catch { /* not supported here */ }
}
// ---- the run is saved at every level card, ticket, boss and perk choice, so a reload (or a phone dropping the tab) puts you back where you were
const RUN_KEY = 'pmlp-run';
function saveRun(stage) {                                 // stage: 'intro' (level card) · 'play' (start of a ticket or a boss) · 'clear' (choosing a perk)
  try {
    localStorage.setItem(RUN_KEY, JSON.stringify({ v: 1, on: true, stage, story: G.story, level: G.level, wave: G.wave, ewave: G.endless.wave, theme: arena.userData.key,
      perks: [...T.perks], pc: T.pc, caf: T.caf, active, team: team.map(f => ({ hp: f.hp, rec: f.rec, ko: f.ko })), stats: G.stats, micro: G.microUsed }));
  } catch { /* no storage (private mode): play on without saving */ }
}
function loadRun() { try { const r = JSON.parse(localStorage.getItem(RUN_KEY) || 'null'); return r && r.v === 1 && Array.isArray(r.team) && r.team.length === 2 ? r : null; } catch { return null; } }
function dropRun() { try { localStorage.removeItem(RUN_KEY); } catch { /* nothing to drop */ } }
function parkRun() { const r = loadRun(); if (!r) return null; r.on = false; try { localStorage.setItem(RUN_KEY, JSON.stringify(r)); } catch { /* fine */ } return r; }      // quit to the title on purpose: keep it as “Continue”, don't jump back in
const runLabel = r => r.story ? `Level ${r.level + 1}, ${LEVELS[r.level].room.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}` : `Endless backlog, ticket ${Math.max(1, r.ewave)}`;
function resumeRun(r, direct) {                           // put everything back as it was at the last checkpoint
  T.perks.clear(); for (const p of r.perks || []) T.perks.add(p); T.pc = r.pc || 0; T.caf = r.caf ?? 150;
  G.story = !!r.story; G.level = clamp(r.level | 0, 0, LEVELS.length - 1); G.endless.wave = r.ewave | 0; G.wave = r.wave | 0;
  team.forEach((f, i) => { const t = r.team[i]; f.hp = clamp(+t.hp || 0, 0, f.maxHp); f.rec = clamp(+t.rec || 0, f.hp, f.maxHp); f.ko = !!t.ko || f.hp <= 0; f.spCd = 0; f.pip = 0; });
  if (team[0].ko && team[1].ko) resetTeam();
  active = r.active === 1 ? 1 : 0; if (team[active].ko) active = 1 - active;
  if (r.stage === 'intro' && G.story) return showIntro();
  const L = LEVELS[G.level]; setMusic(false); resetField(); buildArena(THEMES[r.theme] ? r.theme : G.story ? L.theme : 'eng');
  if (r.stage === 'clear') {
    G.mode = 'clear'; $('hud').className = 'hide'; pose();
    return offerPerks(`<div class="kick">${G.story ? `Level ${G.level + 1} cleared · ${L.room}` : 'The endless backlog'}</div><h2>Where were we?</h2><p>${G.story ? 'The bogeyman is still sunset, and the report is filed.' : `Sprint ${G.endless.wave / 5} is still closed.`} You were choosing a perk.</p>`);
  }
  if (direct) return resumePlay(r);
  const boss = G.story ? G.wave >= L.waves.length : G.endless.wave % 5 === 0;
  const where = G.story ? (boss ? `You were about to meet <b>${BOTS[L.boss].name}</b>.` : `You were on ticket ${G.wave + 1} of ${L.waves.length}: “${L.waves[G.wave].t}”.`) : (boss ? `Ticket ${G.endless.wave} was a bogeyman.` : `You were on ticket ${G.endless.wave}.`);
  G.mode = 'resume'; $('hud').className = 'hide'; pose();
  card(`<div class="kick">Back at your desk</div><h2>${G.story ? `Level ${G.level + 1} of 8 · ${L.room}` : 'The endless backlog'}</h2><p>${where}</p>
    <p><small>Jeremy (AI bot): “I kept your place. Morale, caffeine and perks are as they were when this ticket was opened. I also kept counting.”</small></p>
    <div class="row"><button class="go" data-act="enter">Pick it back up${hk('enter')}</button><button data-act="esc">Title${hk('esc')}</button></div>`, { enter: () => resumePlay(r), esc: showTitle });
}
function resumePlay(r) {                                  // re-open the ticket (or the boss) the save was taken at
  closeCard(); beginPlay(); G.stats = { t: 0, dmg: 0, maxCombo: 0, kills: 0, ...(r.stats || {}) }; G.microUsed = !!r.micro; T.caf = clamp(r.caf ?? T.caf, 0, 800);
  if (G.story) { levelSetup(); G.wave = (r.wave | 0) - 1; } else { endlessSetup(); G.endless.wave = Math.max(0, (r.ewave | 0) - 1); }
  G.phase = 'waves'; G.gap = .8;
}
function endlessSetup() { $('lvl').textContent = 'THE ENDLESS BACKLOG'; hudF[0].small.textContent = 'Lord Bluetooth, Duke of Spectrum'; }
function startStory() { dropRun(); T.perks.clear(); T.pc = 0; T.caf = 150; G.story = true; G.level = START_LEVEL; resetTeam(); showIntro(); }
function startEndless(keep) {
  dropRun(); if (!keep) { T.perks.clear(); T.pc = 0; } T.caf = 150; G.story = false; G.endless.wave = 0; resetTeam(); resetField(); buildArena('eng'); closeCard(); beginPlay();
  endlessSetup(); G.gap = 1; G.phase = 'waves';
}
function showIntro() {
  const L = LEVELS[G.level], bd = BOTS[L.boss];
  G.mode = 'intro'; setMusic(false); $('hud').className = 'hide'; resetField(); buildArena(L.theme); pose(); saveRun('intro');
  card(`<div class="kick">Level ${G.level + 1} of 8 · ${L.room} · ${L.when}</div><h2>${L.title}</h2><p>${L.intro}</p>
    <div class="q" style="--col:var(--g)"><b>GLENNTOOTH</b> “${L.glenn}”</div><div class="q" style="--col:var(--c)"><b>COFFEE GUY</b> “${L.coffee}”</div>
    <div class="bogey"><small>BOGEYMAN</small><br><b>${bd.name}</b><br><small>${bd.sub}</small></div>
    <div class="row"><button class="go" data-act="enter">Clock in${hk('enter')}</button><small>Glenn’s title this level: ${GTITLE[G.level]}. Coffee Guy’s: no change.</small></div>`, { enter: beginLevel });
}
function beginPlay() {
  G.mode = 'play'; G.paused = false; $('pause').className = ''; document.body.dataset.paused = ''; $('hud').className = ''; G.stats = { t: 0, dmg: 0, maxCombo: 0, kills: 0 }; G.microUsed = false;
  T.caf = perk('resign') ? 800 : Math.max(T.caf, 150); T.aiT = 5; pose();
  hudF.forEach((h, i) => { h.b.textContent = team[i].name; }); hudF[1].small.textContent = 'Lead Installer · runs on caffeine';
  $('perks').textContent = PERKS.filter(p => perk(p.id)).map(p => p.icon).join(' ');
  setMusic(true, 55, 124);
}
function levelSetup() {                                   // how hard this level's robots hit, and what the HUD calls it
  const L = LEVELS[G.level];
  G.hpScale = 1 + G.level * .1; G.dmgScale = 1 + G.level * .07; G.atkGap = Math.max(.3, .95 - G.level * .08); G.cap = 6 + (G.level >> 1);
  $('lvl').textContent = `Level ${G.level + 1}/8 · ${L.room}`; hudF[0].small.textContent = GTITLE[G.level];
}
function beginLevel() {
  closeCard(); resetTeam(); beginPlay(); levelSetup();
  G.phase = 'waves'; G.wave = -1; G.gap = .6;
  if (G.level === 0) toast(G.input === 'touch'
    ? '<b>Jeremy (AI bot):</b> drag on the left to move, hold <kbd>Jab</kbd> on the right. <kbd>Dodge</kbd> gets you out of the red circles, and <kbd>Tag</kbd> swaps before one of you runs out of morale. I will be counting.'
    : G.input === 'pad'
    ? `<b>Jeremy (AI bot):</b> left stick moves, <kbd>${K('light')}</kbd> jabs, <kbd>${K('dodge')}</kbd> dodges, and <kbd>${K('tag')}</kbd> tags before one of you runs out of morale. I will be counting.`
    : '<b>Jeremy (AI bot):</b> right-click to move, right-click a robot to keep hitting it. <kbd>D</kbd> dodges toward the cursor, and <kbd>F</kbd> tags before one of you runs out of morale. I will be counting.', 7);
}
function queueWave(list) { const q = []; for (const [t, n] of list) for (let i = 0; i < n; i++) q.push(t); G.queue = shuffle(q); G.spawnT = .5; }
function endlessList(n) {
  const pool = ['halluc', 'replyall']; for (const [w, t] of [[2, 'creep'], [3, 'burner'], [4, 'invite'], [5, 'loop'], [6, 'inject'], [7, 'yesbot'], [8, 'review']]) if (n >= w) pool.push(t);
  const cnt = {}; for (let i = Math.min(22, 4 + Math.floor(n * 1.2)); i > 0; i--) { const t = pick(pool); cnt[t] = (cnt[t] || 0) + 1; }
  if (cnt.yesbot > 2) cnt.yesbot = 2; return Object.entries(cnt);
}
function advance() {
  if (G.story) {
    const L = LEVELS[G.level]; G.wave++; saveRun('play');
    if (G.wave >= L.waves.length) return bossIntro(L.boss, 1);
    const w = L.waves[G.wave]; banner(`TICKET ${G.wave + 1} OF ${L.waves.length}`, w.t, 2.4); $('wave').textContent = w.t; queueWave(w.s);
  } else {
    const E = G.endless, n = ++E.wave, b = n / 5 - 1; saveRun('play');
    G.hpScale = 1 + n * .07; G.dmgScale = 1 + n * .04; G.atkGap = Math.max(.25, .9 - n * .03); G.cap = Math.min(11, 6 + (n / 3 | 0));
    if (n % 5 === 0) return bossIntro(LEVELS[b % 8].boss, 1 + b * .1 + Math.floor(b / 8) * .6);
    const t = pick(TICKETS); banner(`TICKET #${4000 + n * 7}`, t, 2.4); $('wave').textContent = `Ticket ${n} · ${t}`; queueWave(endlessList(n));
  }
}
function bossIntro(id, hpMul) {
  const d = BOTS[id]; G.phase = 'bossIntro'; G.gap = 2.7; G.pending = { id, hpMul };
  banner(d.name, d.sub, 2.7, 'boss'); $('wave').textContent = 'BOGEYMAN'; sfx('boss'); setMusic(true, 65.4, 138);
}
function updateFlow(dt) {
  G.stats.t += dt;
  if (P.st === 'ko') { if ((G.overT -= dt) <= 0) gameOver(); return; }
  if (G.phase === 'waves') {
    if (G.queue.length) { if ((G.spawnT -= dt) <= 0 && enemies.length < G.cap) { spawnAtEdge(G.queue.pop()); G.spawnT = .5; } }
    else if (!enemies.some(e => !e.decoy)) { for (const e of [...enemies]) killEnemy(e, true); if ((G.gap -= dt) <= 0) { G.gap = 1.5; advance(); } }
  } else if (G.phase === 'bossIntro') {
    if ((G.gap -= dt) <= 0) { G.boss = spawnEnemy(G.pending.id, clamp(P.x > 0 ? P.x - 8 : P.x + 8, -AX + 3, AX - 3), 0, { hpMul: G.pending.hpMul }); G.phase = 'boss'; }
  } else if (G.phase === 'done' && (G.gap -= dt) <= 0) levelClear();
}
function levelClear() {
  G.mode = 'clear'; sfx('win'); $('hud').className = 'hide'; endCombo(); pose(); const s = G.stats, acts = {}; let head;
  const mm = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  if (G.story) {
    const L = LEVELS[G.level], raw = clamp(100 - s.dmg * (.3 - G.level * .012) - Math.max(0, s.t - L.par) * .2 + Math.min(8, s.maxCombo / 4), 0, 100);
    const [g, line, bonus] = raw >= 90 ? ['S', 'Exceeds expectations. I have flagged this as anomalous.', 500] : raw >= 78 ? ['A', 'Strong. I do not round up, so it stays an A.', 350] : raw >= 62 ? ['B', 'Meets expectations. HR will describe this as “solid”.', 200] : raw >= 45 ? ['C', 'Meets some expectations. I counted every hit. I always count.', 100] : ['PIP', 'I have drafted your Performance Improvement Plan. It is also AI-generated.', 25];
    T.pc += bonus;
    head = `<div class="kick">Level ${G.level + 1} cleared · ${L.room}</div><h2>Jeremy’s commissioning report</h2>
      <div class="grade"><div class="g${g === 'PIP' ? ' pip' : ''}">${g}</div><div><p><b>${(Math.floor(raw * 10) / 10).toFixed(1)} / 100.</b> ${line}</p><small>+${bonus} political capital for the grade.</small></div></div>
      <div class="stats"><div><b>${mm(s.t)}</b><small>time (par ${mm(L.par)})</small></div><div><b>${Math.round(s.dmg)}</b><small>morale lost</small></div><div><b>${s.maxCombo}</b><small>best combo</small></div><div><b>${T.pc}</b><small>political capital</small></div></div>`;
  } else {
    head = `<div class="kick">The endless backlog</div><h2>Sprint ${G.endless.wave / 5} closed</h2><p>${G.endless.wave} tickets resolved, ${T.pc} political capital. The backlog was refilled while you were reading this.</p>`;
    for (const f of team) { if (f.ko) { f.ko = false; f.hp = f.rec = f.maxHp * .5; } else f.hp = f.rec = Math.max(f.rec, f.maxHp * .75); }
  }
  saveRun('clear'); offerPerks(head);
}
function afterClear() {                                   // on to the next level, the ending, or the next sprint
  if (G.story) { if (++G.level >= LEVELS.length) showEnding(); else showIntro(); }
  else { closeCard(); buildArena(LEVELS[(G.endless.wave / 5) % 8].theme); beginPlay(); endlessSetup(); G.phase = 'waves'; G.gap = 1; }
}
function offerPerks(head) {
  const acts = {}, opts = G.story && G.level === LEVELS.length - 1 ? [] : shuffle(PERKS.filter(p => !perk(p.id))).slice(0, 3);
  let tail = `<div class="row"><button class="go" data-act="enter">Continue${hk('enter')}</button></div>`;
  if (opts.length) tail = `<h3>Exec suite · choose one perk</h3><div class="perks">` + opts.map((p, i) => { acts[i + 1] = () => { T.perks.add(p.id); afterClear(); }; return `<button data-act="${i + 1}"><kbd>${i + 1}</kbd><span class="ic">${p.icon}</span><b>${p.name}</b><small>${p.desc}</small></button>`; }).join('') + `</div>`;
  else acts.enter = afterClear;
  card(head + tail, acts);
}
function showEnding() {
  G.mode = 'ending'; const s = store.get(); store.set({ best: Math.max(s.best || 0, T.pc), won: true }); dropRun(); buildArena('board'); pose('title');
  card(`<div class="kick">Day 30 · 9:47 AM · The boardroom</div><h1>NUMBER <em>WENT UP</em></h1>
    <p>The CEO’s AI Clone has been sunset. The real CEO has not noticed. The board skimmed the summary and approved it.</p>
    <p><b style="color:var(--g)">Glenn</b> is promoted to <b>Lord Bluetooth, Duke of Spectrum</b>. The crown is no longer ironic.<br><b style="color:var(--c)">Coffee Guy</b> remains Lead Installer. He has been given a mug and, for the first time in thirty days, a coffee made by a person.</p>
    <p><small>Jeremy (AI bot): “Final political capital: ${T.pc}. I have filed the report. I did not round up.”</small></p>
    <p>The backlog, however, is endless.</p>
    <div class="row"><button class="go" data-act="b">Take on the endless backlog${hk('b')}</button><button data-act="enter">Back to title${hk('enter')}</button></div>`, { b: () => startEndless(true), enter: showTitle }, true);
}
function gameOver() {
  G.mode = 'over'; setMusic(false); $('hud').className = 'hide'; const s = store.get();
  if (G.story) {
    store.set({ best: Math.max(s.best || 0, T.pc) }); const L = LEVELS[G.level]; saveRun('intro');       // a reload from here retries the level, perks intact
    card(`<div class="kick">Level ${G.level + 1} · ${L.room}</div><h2>You have been moved to Special Projects.</h2><p>Unkillable. Unpromotable. In this case, also unconscious.</p>
      <p><small>Jeremy (AI bot): “Per my last email: <kbd>${K('dodge')}</kbd> dodges, and a partner on the bench gets morale back. Tag more, with <kbd>${K('tag')}</kbd>.”</small></p>
      <div class="row"><button class="go" data-act="enter">Retry this level${hk('enter')}</button><button data-act="esc">Title${hk('esc')}</button></div>`, { enter: showIntro, esc: showTitle });
  } else {
    const n = Math.max(0, G.endless.wave - 1); store.set({ best: Math.max(s.best || 0, T.pc), wave: Math.max(s.wave || 0, n) }); dropRun();
    card(`<div class="kick">The endless backlog</div><h2>${n} tickets closed. The backlog remains endless.</h2><p>Political capital: <b>${T.pc}</b>. Longest run: <b>${Math.max(s.wave || 0, n)}</b> tickets.</p>
      <p><small>Jeremy (AI bot): “I have re-opened all of them.”</small></p>
      <div class="row"><button class="go" data-act="enter">Again${hk('enter')}</button><button data-act="esc">Title${hk('esc')}</button></div>`, { enter: () => startEndless(false), esc: showTitle });
  }
}
function togglePause() { if (G.mode !== 'play') return; G.paused = !G.paused; $('pause').className = G.paused ? 'on' : ''; document.body.dataset.paused = G.paused ? '1' : ''; keys.clear(); TB.hold = null; touch.x = touch.y = 0; }

// ------------------------------------------------------------------ HUD
const setT = (el, t) => { if (el._t !== t) el.textContent = el._t = t; };
const setC = (el, c) => { if (el._c !== c) el.className = el._c = c; };
const setW = (el, v) => { const w = Math.round(clamp(v, 0, 1) * 1000) / 10; if (el._w !== w) { el._w = w; el.style.width = w + '%'; } };
function chip(el, frac, state) { setC(el, el.dataset.c + ' ' + state); const h = Math.round(clamp(frac, 0, 1) * 100); if (el._h !== h) { el._h = h; el.lastElementChild.style.height = h + '%'; } }
function updateHud() {
  if (G.mode !== 'play') return;
  team.forEach((f, i) => { const h = hudF[i]; setC(h.root, 'fighter' + (i === active ? ' on' : '') + (f.ko ? ' ko' : '') + (f.pip > 0 ? ' pip' : '')); setW(h.hp, f.hp / f.maxHp); setW(h.rec, f.rec / f.maxHp); });
  const f = team[active], o = team[1 - active], tier = cafTier();
  setW($('cafFill'), T.caf / 800); setT($('cafMg'), Math.round(T.caf) + 'mg'); setT($('cafTier'), `${tier[1]} · damage ×${tier[2].toFixed(2)}`); setC($('caf'), T.caf >= 800 ? 'full' : '');
  const spMax = f.spMax * (perk('rfc') ? .7 : 1);
  const cds = { E: [f.spCd / spMax, f.spCd <= 0 ? 'ready' : ''], R: [1 - T.caf / 800, T.caf >= 800 ? 'hot' : ''], D: [P.dodgeCd / .55, P.dodgeCd <= 0 && P.root <= 0 ? 'ready' : ''],
    F: [T.tagCd / 1.6, o.ko ? 'off' : T.tagCd <= 0 ? 'ready' : ''], G: [T.assistCd / (perk('skip') ? 5.5 : 8.5), o.ko ? 'off' : T.assistCd <= 0 ? 'ready' : ''] };
  const pre = G.input === 'touch' ? 'tb' : 'ab';          // the keyboard/controller ability bar, or the touch buttons: the same cooldowns either way
  if (pre === 'ab') { chip($('abQ'), 0, 'ready'); chip($('abW'), 0, 'ready'); }
  for (const k in cds) chip($(pre + k), cds[k][0], cds[k][1]);
  const spName = f.key === 'glenn' ? 'Pair' : 'Agents', suName = f.key === 'glenn' ? 'Unify' : 'Swarm';
  if (pre === 'ab') { setT($('abE').children[1], spName); setT($('abR').children[1], suName); } else { setT($('tbE').firstElementChild, spName); setT($('tbR').firstElementChild, suName); }
  setT($('pc').lastElementChild, String(T.pc));
  const cb = $('combo'); if (P.combo >= 2) { let rk = ''; for (const [n, w] of COMBO_RANKS) if (P.combo >= n) rk = w; const k = P.combo + '|' + rk; if (cb._k !== k) { cb._k = k; cb.innerHTML = `<b>${P.combo} HITS</b><span>${rk}</span>`; } } else if (cb._k) { cb._k = ''; cb.innerHTML = ''; }
  const b = G.boss;
  if (b && b.alive) {
    setC($('bossbar'), 'panel on' + (b.vuln > 0 || b.open > 0 ? ' vuln' : '')); setT($('bossName'), b.def.name); setW($('bossFill'), b.hp / b.maxHp);
    setT($('bossSub'), b.type === 'ceo' ? `Slide ${clamp(13 - Math.ceil(12 * b.hp / b.maxHp), 1, 12)} of 12 · ${['Vision 2.0', '3 AM Tweet', 'AI-Native Everything'][b.phase - 1]}` : b.vuln > 0 ? 'Restarting: vulnerable' : b.open > 0 ? 'Guard down: vulnerable' : b.def.sub);
  } else setC($('bossbar'), 'panel');
  setT($('status'), f.pip > 0 ? `ON A PIP: nearly double damage. Tag out (${K('tag')})!` : P.root > 0 ? `IN A MEETING: mash ${K('light')} to decline, or tag out (${K('tag')})` : P.rev > 0 ? 'PROMPT INJECTED: controls reversed' : P.slow > 0 ? 'CHILLED: moving slowly' : T.bt > 0 ? `BEYOND 800mg · ${T.bt.toFixed(1)}s` : '');
}
function updateCamera(dt) {
  const narrow = camera.aspect < 1, k = clamp(1.5 / camera.aspect, 1, narrow ? 1.9 : 1.7), tx = G.mode === 'play' ? (narrow ? clamp(P.x * .95, -10, 10) : clamp(P.x * .68, -6.5, 6.5)) : narrow ? 5 : 0; G.camX += (tx - G.camX) * Math.min(1, dt * 4);
  let sx = 0, sy = 0; if (G.shake > 0) { G.shake = Math.max(0, G.shake - dt * 1.7); sx = (Math.random() - .5) * G.shake; sy = (Math.random() - .5) * G.shake; }
  camera.position.set(G.camX + sx, 8.5 * k + sy, 13.5 * k); camera.lookAt(G.camX + sx * .5, .7, -.3);
}

// ------------------------------------------------------------------ input
// MOBA layout: the left hand stays on QWERT / ASDFG and the mouse moves and aims.
//   Q jab · W kick · E special · R super (the ult) · T tag (same as F)
//   A attack-move · S stop · D dodge · F tag · G assist          Space also dodges; arrow keys still move.
const ACT = { KeyQ: 'light', KeyW: 'heavy', KeyE: 'special', KeyR: 'super', KeyT: 'tag', KeyA: 'amove', KeyS: 'stop', KeyD: 'dodge', KeyF: 'tag', KeyG: 'assist', Space: 'dodge' };
addEventListener('keydown', e => {
  if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  initAudio(); if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return; useDevice('kbm');
  if (e.code === 'KeyM') return toggleMute();
  if (G.card) {
    const k = e.code === 'Enter' || e.code === 'NumpadEnter' ? 'enter' : e.code === 'Escape' ? 'esc' : e.code.startsWith('Digit') ? e.code.slice(5) : e.code.startsWith('Key') ? e.code.slice(3).toLowerCase() : '';
    const fn = G.card[k]; if (fn) { sfx('ui'); fn(); } return;
  }
  if (G.mode !== 'play') return;
  if (e.code === 'KeyP' || e.code === 'Escape') return togglePause();
  keys.add(e.code); if (e.code.startsWith('Arrow')) M.on = false;      // steering by keyboard: stop aiming at a cursor nobody is using
  if (ACT[e.code]) press(ACT[e.code]);
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); M.rmb = M.lmb = false; });
document.addEventListener('visibilitychange', () => { if (document.hidden && G.mode === 'play' && !G.paused) togglePause(); });      // switched apps or tabs: pause, don't get beaten up in the background
const mouseAt = e => { M.on = true; M.sx = e.clientX; M.sy = e.clientY; };
addEventListener('pointermove', e => { if (e.pointerType === 'mouse' && G.input !== 'pad') mouseAt(e); });       // while a controller is in use, a nudged mouse does not take over
addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') return; if (e.button === 2) M.rmb = false; else if (e.button === 0) M.lmb = false; });
$('c').addEventListener('pointerdown', e => {              // right button: move there, or attack what is under the cursor. Left button: jab toward the cursor
  initAudio(); if (e.pointerType !== 'mouse') { useDevice('touch'); return; } useDevice('kbm'); mouseAt(e);
  try { $('c').setPointerCapture(e.pointerId); } catch { /* not capturable */ }
  if (e.button === 2) { M.rmb = true; order(false); } else if (e.button === 0) { M.lmb = true; mouseGround(); press('light'); }
});
$('c').addEventListener('contextmenu', e => e.preventDefault());
// ---- touch: a thumbstick zone on the left and a thumb-arc of buttons on the right. Always wired up; shown once the screen is what you last touched.
const TB = { hold: null };
{
  const st = $('stick'), nub = $('nub'); let id = null, sx = 0, sy = 0;
  st.addEventListener('pointerdown', e => {               // the stick appears wherever the thumb lands
    initAudio(); useDevice('touch'); id = e.pointerId; sx = e.clientX; sy = e.clientY; const r = st.getBoundingClientRect();
    nub.style.display = 'block'; nub.style.left = sx - r.left + 'px'; nub.style.top = sy - r.top + 'px'; $('stickHint').style.display = 'none';
    try { st.setPointerCapture(id); } catch { /* not capturable */ }
  });
  st.addEventListener('pointermove', e => { if (e.pointerId !== id) return; let x = (e.clientX - sx) / 46, y = (e.clientY - sy) / 46; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } touch.x = x; touch.y = y; nub.firstElementChild.style.transform = `translate(${x * 32}px, ${y * 32}px)`; });
  const up = e => { if (e.pointerId !== id) return; id = null; touch.x = touch.y = 0; nub.style.display = 'none'; nub.firstElementChild.style.transform = ''; };
  st.addEventListener('pointerup', up); st.addEventListener('pointercancel', up);
  for (const b of $('tb').children) {
    const a = b.dataset.a, end = () => { if (TB.hold === a) TB.hold = null; };
    b.addEventListener('pointerdown', e => { e.preventDefault(); initAudio(); useDevice('touch'); press(a); if (a === 'light' || a === 'heavy') TB.hold = a; try { b.setPointerCapture(e.pointerId); } catch { /* not capturable */ } });      // hold Jab or Kick to keep swinging
    b.addEventListener('pointerup', end); b.addEventListener('pointercancel', end); b.addEventListener('lostpointercapture', end); b.addEventListener('contextmenu', e => e.preventDefault());
  }
  $('tpause').addEventListener('pointerdown', e => { e.preventDefault(); initAudio(); togglePause(); });
  $('pResume').onclick = () => togglePause(); $('pMute').onclick = () => toggleMute(); $('pQuit').onclick = () => { togglePause(); showTitle(); };
  addEventListener('orientationchange', () => setTimeout(resize, 250)); if (window.visualViewport) visualViewport.addEventListener('resize', resize);
}

// ------------------------------------------------------------------ controllers: Xbox and PlayStation pads, read through the browser's standard mapping
//   left stick / d-pad move · right stick aim · X/□ jab · Y/△ kick · B/○ special (also LT/L2) · A/✕ dodge
//   RB/R1 tag · LB/L1 assist · RT/R2 super · Menu/Options pause.   In menus: A/✕ confirm, B/○ back, Y/△ endless, d-pad picks a perk.
const KEYS = { light: 'Q', heavy: 'W', special: 'E', super: 'R', dodge: 'D', tag: 'F', assist: 'G' };
const PADS = { xbox: { light: 'X', heavy: 'Y', special: 'B', super: 'RT', dodge: 'A', tag: 'RB', assist: 'LB', pause: 'Menu' }, ps: { light: '□', heavy: '△', special: '○', super: 'R2', dodge: '✕', tag: 'R1', assist: 'L1', pause: 'Options' } };
const PAD = { idx: -1, kind: 'xbox', prev: [], x: 0, y: 0, aim: false, hold: null, nav: 0, sel: 0 };
const HINT_KBM = $('hint').innerHTML;
const TOUCHL = { light: 'Jab', heavy: 'Kick', special: 'Special', super: 'Super', dodge: 'Dodge', tag: 'Tag', assist: 'Assist' };
const K = a => G.input === 'pad' ? PADS[PAD.kind][a] : G.input === 'touch' ? TOUCHL[a] : KEYS[a];      // what a button is called in on-screen hints, for whichever device was touched last
const hk = a => G.input === 'touch' ? '' : ` (${G.input === 'pad' ? PADS[PAD.kind][{ enter: 'dodge', esc: 'special', b: 'heavy', n: 'light' }[a]] : { enter: 'Enter', esc: 'Esc', b: 'B', n: 'N' }[a]})`;      // the shortcut shown on a menu button
function useDevice(d) {                                   // 'kbm', 'pad' or 'touch': swap the on-screen labels and controls to match
  if (G.input === d) return; G.input = d; document.body.dataset.input = d;
  if (d !== 'kbm') { M.on = M.rmb = M.lmb = false; P.order = null; }
  if (d !== 'touch') { touch.x = touch.y = 0; TB.hold = null; }
  const L = d === 'pad' ? PADS[PAD.kind] : KEYS;
  for (const [id, a] of [['abQ', 'light'], ['abW', 'heavy'], ['abE', 'special'], ['abR', 'super'], ['abD', 'dodge'], ['abF', 'tag'], ['abG', 'assist']]) $(id).firstElementChild.textContent = L[a];
  $('hint').innerHTML = d === 'pad' ? `<b>Left stick</b> move · <b>right stick</b> aim · <kbd>${L.pause}</kbd> pause` : HINT_KBM;
  padPick();
}
function padPick() { [...$('cardIn').querySelectorAll('.perks button')].forEach((b, i) => b.classList.toggle('sel', G.input === 'pad' && i === PAD.sel)); }      // highlight the perk the d-pad is on
function rumble(ms, strong = .6, weak = .4) {
  try { const gp = PAD.idx >= 0 && G.input === 'pad' && navigator.getGamepads()[PAD.idx]; if (gp && gp.vibrationActuator && gp.vibrationActuator.playEffect) gp.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }); } catch { /* this pad does not rumble */ }
}
function pollPad() {
  let gp = null; try { for (const p of (navigator.getGamepads ? navigator.getGamepads() : [])) if (p && p.connected && p.buttons.length >= 10) { gp = p; break; } } catch { return; }
  if (!gp) { if (PAD.idx >= 0) { PAD.idx = -1; PAD.x = PAD.y = 0; PAD.hold = null; if (PAD.aim) { PAD.aim = false; M.on = false; } useDevice('kbm'); toast('Controller disconnected.', 2.5); } return; }
  if (PAD.idx !== gp.index) {
    PAD.idx = gp.index; PAD.prev = []; PAD.kind = /054c|dualsense|dualshock|playstation|\bps[345]\b/i.test(gp.id) && !/xbox|045e/i.test(gp.id) ? 'ps' : 'xbox';      // 054c is Sony's USB vendor id; an Xbox pad over Bluetooth also calls itself a "Wireless Controller"
    toast(`<b>Controller connected</b> (${PAD.kind === 'ps' ? 'PlayStation' : 'Xbox'} layout). Press any button to use it.`, 4);
  }
  const b = gp.buttons.map(q => q.pressed || q.value > .5), down = i => b[i] && !PAD.prev[i], dz = v => Math.abs(v) < .22 ? 0 : v;
  let x = dz(gp.axes[0] || 0), y = dz(gp.axes[1] || 0); const rx = dz(gp.axes[2] || 0), ry = dz(gp.axes[3] || 0);
  if (b[14]) x = -1; else if (b[15]) x = 1; if (b[12]) y = -1; else if (b[13]) y = 1;
  if (b.some(Boolean) || x || y || rx || ry) { initAudio(); useDevice('pad'); }
  if (G.input !== 'pad') { PAD.x = PAD.y = 0; PAD.hold = null; PAD.prev = b; return; }       // plugged in but the keyboard was used last: leave it alone
  PAD.x = x; PAD.y = y;
  if (rx || ry) { PAD.aim = true; M.on = true; M.x = P.x + rx * 6.5; M.z = P.z + ry * 6.5; } else if (PAD.aim) { PAD.aim = false; M.on = false; }      // the right stick stands in for the cursor
  if (G.card) {
    const c = G.card, nums = ['1', '2', '3'].filter(k => c[k]), nav = x < -.5 ? -1 : x > .5 ? 1 : 0; let fn = null;
    if (nums.length) { if (nav && nav !== PAD.nav) { PAD.sel = clamp(PAD.sel + nav, 0, nums.length - 1); sfx('ui'); padPick(); } if (down(0)) fn = c[nums[clamp(PAD.sel, 0, nums.length - 1)]]; }
    else fn = (down(0) || down(9)) ? c.enter : down(3) ? c.b : down(1) ? c.esc : down(2) ? c.n : null;
    PAD.nav = nav; PAD.hold = null; if (fn) { sfx('ui'); PAD.prev = b; fn(); return; }
  } else if (G.mode === 'play') {
    if (down(9)) togglePause();
    else if (!G.paused) {
      if (down(2)) press('light'); if (down(3)) press('heavy'); if (down(0)) press('dodge'); if (down(1) || down(6)) press('special');
      if (down(7)) press('super'); if (down(5)) press('tag'); if (down(4)) press('assist');
      PAD.hold = b[2] ? 'light' : b[3] ? 'heavy' : null;                                     // hold to keep swinging
    }
  }
  PAD.prev = b;
}

// ------------------------------------------------------------------ main loop
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame); pollPad();
  const real = Math.min(.05, (now - last) / 1000); last = now;
  if (bannerT > 0 && (bannerT -= real) <= 0) $('banner').className = '';
  if (toastT > 0 && (toastT -= real) <= 0) $('toast').className = 'panel';
  if (document.body.dataset.mode !== G.mode) document.body.dataset.mode = G.mode;
  sim(real); updateCamera(real); updateHud(); musicTick(); renderer.render(scene, camera);
}
function sim(real) {                                      // one tick of the game, with no drawing
  let dt = real;
  if (G.mode === 'play') {
    if (G.paused) dt = 0;
    else {
      G.time += real; if (G.slowmo > 0) { G.slowmo -= real; dt *= .3; }
      if (G.hitstop > 0) { G.hitstop -= real; dt = 0; }
      if (dt > 0) { const eDt = dt * (T.bt > 0 ? .3 : 1); updatePlayer(dt); updateAllies(dt); updateEnemies(eDt, dt); updateHazards(eDt); updateZones(eDt); updateShots(eDt, dt); updateRings(eDt); updateBeams(eDt); updatePickups(dt); updateFlow(dt); }
    }
  }
  if (!G.paused) { for (const f of team) f.mixer.update(dt); updateFx(real); updateMagic(real); updateAuras(real); updateBubbles(real); }
}

// ------------------------------------------------------------------ boot
document.body.dataset.input = 'kbm'; if (matchMedia('(pointer: coarse)').matches) useDevice('touch');       // a phone or tablet starts with the touch controls
buildArena('eng');
card(`<div class="kick">Glenntooth &amp; Coffee Guy vs. the AI Transformation</div><h1>PER MY <em>LAST PUNCH</em></h1><div class="row"><button class="go" id="go" disabled>Loading the tag team…</button></div>`, {}, true);
updateCamera(1); renderer.render(scene, camera);
Promise.all(FDEF.map(loadFighter)).then(fs => {
  team.push(...fs); fs.forEach((f, i) => { hudF[i].img.src = portrait(f); });
  const saved = loadRun();                                // a run that was in progress when the page went away: go straight back to it
  if (saved && saved.on && !new URLSearchParams(location.search).has('level')) resumeRun(saved); else showTitle();
  requestAnimationFrame(frame);
}).catch(err => { console.error(err); $('cardIn').innerHTML = `<h2>The tag team did not load.</h2><p>${String(err.message || err)}</p><p><small>This page needs to be served over http(s) with <code>assets/glenn.glb</code> and <code>assets/coffee.glb</code> next to it.</small></p>`; });
window.PMLP = { G, T, P, M, team, enemies, hazards, shots, rings, beams, zones, pickups, keys, touch, LEVELS, BOTS, PAD, TB, press, order, sim, pollPad, toScreen, spawnEnemy, damageEnemy, loadRun, dropRun, get active() { return active; } };      // for poking at it from the console
