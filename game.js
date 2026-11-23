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
  microUsed: false, overT: 0, card: null, stats: { t: 0, dmg: 0, maxCombo: 0, kills: 0 }, endless: { wave: 0 } };
const T = { caf: 150, tagCd: 0, assistCd: 0, bt: 0, aiT: 5, perks: new Set(), pc: 0 };      // team-wide: caffeine, cooldowns, perks, political capital
const P = { x: -5, z: 1, yaw: Math.PI / 2, st: 'free', t: 0, mv: null, hitDone: false, lspd: 0, buf: null, bufT: 0, inv: 0, root: 0, rev: 0, slow: 0,
  dodgeCd: 0, dvx: 0, dvz: 0, combo: 0, comboT: 0, castAt: 0, castDur: 0, castDone: false, castFn: null, dodgeProc: false };
const team = []; let active = 0;
const enemies = [], hazards = [], zones = [], shots = [], rings = [], beams = [], pickups = [];
const perk = id => T.perks.has(id);

// ------------------------------------------------------------------ renderer
const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1, .1, 200);
scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3f55, 1.3));
const sun = new THREE.DirectionalLight(0xffffff, 1.3); sun.position.set(5, 14, 10); scene.add(sun);
const arena = new THREE.Group(); scene.add(arena);
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

// ------------------------------------------------------------------ audio (all synthesised)
let AC = null, master = null, musicBus = null, noiseBuf = null, muted = false;
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
function toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : .5; toast(muted ? 'Muted. The standup continues silently.' : 'Sound on.', 1.6); }

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
  bannerT = toastT = 0; $('banner').className = ''; $('toast').className = 'panel';
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
function kill3(m) { scene.remove(m); m.material.dispose(); }

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
function bolt(x1, y1, z1, x2, y2, z2, color = 0x6fb7ff) {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true }), g = new THREE.Group(), n = 5; let px = x1, py = y1, pz = z1;
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

// ------------------------------------------------------------------ the tag team
const FDEF = [
  { key: 'glenn', name: 'GLENNTOOTH', hex: 0xffb347, maxHp: 115, speed: 6.1, dmg: 1.1, rate: 1, spMax: 5.5 },
  { key: 'coffee', name: 'COFFEE GUY', hex: 0x58c7ff, maxHp: 95, speed: 6.9, dmg: .95, rate: 1.16, spMax: 4.5 },
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
function addCaf(v) { const was = T.caf; T.caf = clamp(T.caf + v, 0, 800); if (was < 800 && T.caf >= 800) { sfx('full'); toast('<b>800mg.</b> LB Mode. Press <kbd>F</kbd> for a super.', 3); } }
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
  s.m = new THREE.Mesh(s.cup ? CYL() : s.card ? BOX() : SPH(), new THREE.MeshBasicMaterial({ color: s.color }));
  if (s.card) s.m.scale.set(s.r * 2.4, s.r * 1.7, .08); else if (s.cup) s.m.scale.set(.34, .42, .34); else s.m.scale.setScalar(s.r * 2);
  s.vx = Math.sin(s.ang) * s.speed; s.vz = Math.cos(s.ang) * s.speed; s.m.position.set(s.x, s.y, s.z); scene.add(s.m); shots.push(s); return s;
}
function updateShots(eDt, dt) {
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i], d = s.friendly ? dt : eDt; s.ttl -= d;
    if (s.homing) { const cur = Math.atan2(s.vx, s.vz), a = cur + clamp(angDiff(Math.atan2(P.x - s.x, P.z - s.z), cur), -s.homing * d, s.homing * d); s.vx = Math.sin(a) * s.speed; s.vz = Math.cos(a) * s.speed; }
    s.x += s.vx * d; s.z += s.vz * d; s.m.position.set(s.x, s.y, s.z); s.m.rotation.y += d * 7;
    let dead = s.ttl <= 0 || Math.abs(s.x) > AX + 4 || Math.abs(s.z) > AZ + 4;
    if (s.friendly) { if (!dead) for (const e of enemies) if (e.spawn <= 0 && Math.hypot(e.x - s.x, e.z - s.z) < e.r + s.r + .25) { dead = true; break; } if (dead) splash(s); }
    else if (!dead && Math.hypot(P.x - s.x, P.z - s.z) < s.r + .5 && hurtPlayer(s.dmg, s)) dead = true;
    if (dead) { kill3(s.m); shots.splice(i, 1); }
  }
}
function splash(s) {                                      // Coffee Guy's espresso landing
  let n = 0; for (const e of [...enemies]) if (Math.hypot(e.x - s.x, e.z - s.z) < s.splash + e.r && damageEnemy(e, s.dmg, { x: s.x, z: s.z, kb: 9, heavy: true, pierce: true, stun: .7, word: n ? null : 'SCALDED' })) n++;
  pulse(s.x, s.z, 0xc98a3a, s.splash * 1.1, .35); burst(s.x, .8, s.z, 0x8b5a2b, 18, 7); burst(s.x, .8, s.z, 0xf4f1e8, 6, 5); sfx('splash'); if (n) landed(true, n, 9 * n);
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
  if (all) { for (const p of pickups) scene.remove(p.g); pickups.length = 0; }
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
      if (!b.told) { b.told = true; toast('<b>Jeremy:</b> you are on a PIP and take nearly double damage. Tag out with <kbd>Q</kbd> and the paperwork cannot find you.', 6); }
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
  synergy: { boss: true, name: 'SYNERGY-9000', sub: 'Standup facilitator · three hours, nothing decided', epitaph: 'Action items: none. Owner: nobody.', hp: 780, speed: 1.9, r: 1.3, h: 4.4, reach: 3, turn: 4, brain: brainSynergy, color: 0x1f8f8f },
  barista: { boss: true, name: 'BARISTA-GPT', sub: 'AI-native espresso · will not brew, will write a haiku about brewing', epitaph: 'The office now has a kettle. Morale is up 40%.', hp: 950, speed: 1.6, r: 1.7, h: 3.9, reach: 3, turn: 4, brain: brainBarista, color: 0xb8bcc4 },
  ranker: { boss: true, name: 'THE STACK RANKER', sub: 'Calibration engine · someone must be in the bottom 10%', epitaph: 'Everyone is now rated “present”.', hp: 1100, speed: 2, r: 1.5, h: 4.2, reach: 3, turn: 4, brain: brainRanker, color: 0x384b8a },
  fridge: { boss: true, name: 'KUBERFRIDGE', sub: 'Smart fridge running Kubernetes · desired: lunch, current: 0', epitaph: 'kubectl delete fridge. Lunch is eventually consistent.', hp: 1300, speed: 1.5, r: 1.5, h: 4.3, reach: 3, turn: 4, brain: brainFridge, color: 0xd5dbe1 },
  sync: { boss: true, name: 'CROSS-FUNCTIONAL SYNC', sub: 'Seven managers, zero engineers · this meeting is now recurring', epitaph: 'This meeting has been converted to an email. Nobody read it.', hp: 1400, speed: 2, r: 1.5, h: 3.7, keep: 6, turn: 4, brain: brainSync, color: 0x3a4250 },
  lgtm: { boss: true, name: 'LGTM-1000', sub: 'Rogue code review bot · “Not AI-native. Changes requested.”', epitaph: 'Hotfix merged. Shipped on a Friday, without fear.', hp: 1500, speed: 1.8, r: 1.7, h: 4, reach: 3, turn: 1.5, shield: true, brain: brainLgtm, color: 0xcfd6de },
  vpai: { boss: true, name: 'VP OF AI TRANSFORMATION', sub: 'Role created above you · has never shipped a product', epitaph: 'The role has been dissolved. So has the task force on dissolving it.', hp: 1700, speed: 2.6, r: 1, h: 4.8, keep: 5, turn: 5, brain: brainVpai, color: 0xffd166 },
  ceo: { boss: true, name: 'THE CEO’S AI CLONE', sub: 'Handles all communications now · twelve slides, no questions', epitaph: 'Communications will now be handled by nobody, which is an improvement.', hp: 2800, speed: 1.7, r: 1.5, h: 5.5, reach: 3, turn: 4, brain: brainCeo, color: 0x58c7ff,
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
    side: pick([-1, 1]), seed: rand(10), contact: 0, contactCd: 0, open: 0, vuln: 0, haste: 0, dizzy: 0, grow: 1, spin: 0, vs: 0, flipCd: 0, pull: 0, phase: 1 };
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
  e.hp -= d; e.flash = .1;
  floatText(o.word || String(Math.max(1, Math.round(d))), e.x, hy, e.z, o.word ? 'word' : '');
  burst(e.x, hy * .7, e.z, e.def.color, o.heavy ? 6 : 3, 4);
  if (!e.boss) {
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
    if (e.flash > 0) e.flash -= real; if (e.open > 0) e.open -= dt; if (e.vuln > 0) e.vuln -= dt; if (e.haste > 0) e.haste -= dt; if (e.dizzy > 0) e.dizzy -= dt; if (e.contactCd > 0) e.contactCd -= dt; if (e.flipCd > 0) e.flipCd -= dt;
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
function inputDir() {
  let x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + touch.x;
  let z = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) + touch.y;
  const l = Math.hypot(x, z); if (l > 1) { x /= l; z /= l; }
  if (P.rev > 0) { x = -x; z = -z; }
  return [x, z, l > .2];
}
function nearestEnemy(x, z, maxD, yaw, arc) {
  let best = null, bd = maxD;
  for (const e of enemies) { if (e.spawn > 0) continue; const dx = e.x - x, dz = e.z - z, d = Math.hypot(dx, dz) - e.r; if (d < bd && (arc >= 3.1 || Math.abs(angDiff(Math.atan2(dx, dz), yaw)) < arc)) { bd = d; best = e; } }
  return best;
}
const atkRate = f => f.rate * (T.bt > 0 ? 1.5 : 1) * (perk('debt') ? 1.12 : 1);
function startMove(id) {
  const f = team[active], m = MOVES[id], [ix, iz, moving] = inputDir();
  P.st = 'attack'; P.mv = m; P.t = 0; P.hitDone = false;
  let want = moving ? Math.atan2(ix, iz) : P.yaw;
  const tgt = nearestEnemy(P.x, P.z, 5, want, moving ? 1.3 : 3.2);                // lean toward whoever you are obviously trying to hit
  let dist = m.lunge;
  if (tgt) { want = Math.atan2(tgt.x - P.x, tgt.z - P.z); dist = clamp(Math.hypot(tgt.x - P.x, tgt.z - P.z) - tgt.r - 1, 0, m.lunge * 2.2); }
  P.yaw = want; P.lspd = dist / (m.dur * m.hit); oneShot(f, m.clip, m.dur / atkRate(f)); sfx('swing');
}
function doStrike(m) {
  const f = team[active]; let n = 0;
  for (const e of [...enemies]) {
    const dx = e.x - P.x, dz = e.z - P.z, d = Math.hypot(dx, dz);
    if (d - e.r > m.range || (m.arc < 6 && d > .7 && Math.abs(angDiff(Math.atan2(dx, dz), P.yaw)) > m.arc / 2)) continue;
    if (damageEnemy(e, m.dmg * f.dmg, { kb: m.kb, heavy: m.heavy })) n++;
  }
  if (n) landed(m.heavy, n, m.caf);
}
function landed(heavy, n, caf) {
  G.hitstop = heavy ? .085 : .045; G.shake = Math.max(G.shake, heavy ? .35 : .14); sfx(heavy ? 'heavy' : 'hit'); addCaf(caf * (perk('coffee') ? 1.3 : 1));
  P.combo += n; P.comboT = 2.6; G.stats.maxCombo = Math.max(G.stats.maxCombo, P.combo);
}
function endCombo() { if (P.combo >= 5) T.pc += P.combo * 2; P.combo = 0; P.comboT = 0; }
function startDodge() {
  const f = team[active], [ix, iz, moving] = inputDir(), a = moving ? Math.atan2(ix, iz) : P.yaw + Math.PI;
  P.st = 'dodge'; P.t = .34; P.dvx = Math.sin(a) * 13; P.dvz = Math.cos(a) * 13; P.inv = Math.max(P.inv, .34); P.dodgeCd = .55; P.dodgeProc = false;
  if (moving) P.yaw = a; oneShot(f, 'DuckDodge', .4); sfx('dodge');
}
function castSpecial(f, x, z, yaw) {
  if (f.key === 'glenn') {                              // Pair: chain every robot in range together. Really good at Bluetooth, of course.
    sfx('pair'); pulse(x, z, 0x6fb7ff, 4, .4);
    let from = { x, y: 1.3, z }, n = 0; const done = new Set();
    for (let i = 0; i < 6; i++) {
      let best = null, bd = i ? 6.5 : 11;
      for (const e of enemies) { if (done.has(e) || e.spawn > 0) continue; const d = Math.hypot(e.x - from.x, e.z - from.z) - e.r; if (d < bd) { bd = d; best = e; } }
      if (!best) break;
      done.add(best); const to = { x: best.x, y: best.def.h * best.scale * .6, z: best.z }; bolt(from.x, from.y, from.z, to.x, to.y, to.z);
      damageEnemy(best, 15 * f.dmg, { x: from.x, z: from.z, kb: 1, stun: 1.6, pierce: true, word: 'PAIRED' }); from = to; n++;
    }
    if (n) landed(false, n, 8 * n); else floatText('No devices found.', x, 2.4, z, 'dim');
  } else {                                               // Espresso shot: scalding, and it splashes
    sfx('throw'); shot({ x: x + Math.sin(yaw) * .7, z: z + Math.cos(yaw) * .7, y: 1.3, ang: yaw, speed: 17, r: .3, dmg: 24 * f.dmg, color: 0xf4f1e8, friendly: true, splash: 2.8, ttl: .75, cup: true });
  }
}
function startSpecial() {
  const f = team[active]; if (f.spCd > 0) return;
  f.spCd = f.spMax * (perk('rfc') ? .7 : 1); P.st = 'cast'; P.t = 0; P.castAt = .18; P.castDur = .48; P.castDone = false; P.inv = Math.max(P.inv, .25);
  const tgt = nearestEnemy(P.x, P.z, 11, P.yaw, 3.2); if (tgt) P.yaw = Math.atan2(tgt.x - P.x, tgt.z - P.z);
  oneShot(f, f.key === 'glenn' ? 'CombatStance' : 'RightStraightPunch', .48); P.castFn = () => castSpecial(f, P.x, P.z, P.yaw);
}
function startSuper() {
  const f = team[active]; if (T.caf < 800) { floatText('Needs 800mg', P.x, 2.6, P.z, 'dim'); return; }
  T.caf = 0; P.st = 'cast'; P.t = 0; P.castDone = false; P.inv = Math.max(P.inv, 1.7); flash(); sfx('super'); G.shake = .5;
  if (f.key === 'glenn') {
    banner('UNIFY!', 'Harald Bluetooth united Denmark. Glenn will settle for this room.', 2, 'team');
    P.castAt = .9; P.castDur = 1.35; oneShot(f, 'CombatStance', 1.35);
    const u = G.unify = { x: clamp(P.x + Math.sin(P.yaw) * 2.8, -AX, AX), z: clamp(P.z + Math.cos(P.yaw) * 2.8, -AZ, AZ) };
    P.castFn = () => {
      G.unify = null; let n = 0;
      for (const e of [...enemies]) if (Math.hypot(e.x - u.x, e.z - u.z) < (e.boss ? 9 : 5.5) + e.r) { bolt(P.x, 1.4, P.z, e.x, e.def.h * e.scale * .6, e.z); if (damageEnemy(e, e.boss ? 95 : 75, { x: u.x, z: u.z, kb: 14, heavy: true, pierce: true, stun: 1.2, word: 'UNIFIED' })) n++; }
      pulse(u.x, u.z, 0x6fb7ff, 7, .5); pulse(u.x, u.z, 0xffffff, 5, .35); burst(u.x, 1, u.z, 0x6fb7ff, 30, 10); sfx('boom'); G.shake = .9; flash(); if (n) landed(true, n, 0);
    };
  } else {
    banner('BEYOND 800mg', 'Coffee Guy has left the recommended daily limit. Time is a suggestion.', 2, 'cafe');
    P.castAt = .25; P.castDur = .5; oneShot(f, 'CombatStance', .5);
    P.castFn = () => {
      T.bt = 6.5; $('vfx').classList.add('bt'); pulse(P.x, P.z, 0xffb347, 6, .5); burst(P.x, 1, P.z, 0xc98a3a, 26, 9);
      for (const e of [...enemies]) if (dP(e) < 5 + e.r) damageEnemy(e, 22, { kb: 12, heavy: true, pierce: true, word: 'JITTERS' });
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
  return true;
}
function assist() {
  const o = team[1 - active]; if (o.ko || T.assistCd > 0 || G.assist) return;
  T.assistCd = perk('skip') ? 5.5 : 8.5;
  const side = P.yaw + Math.PI / 2, ax = clamp(P.x + Math.sin(side) * 1.4, -AX, AX), az = clamp(P.z + Math.cos(side) * 1.4, -AZ, AZ);
  const tgt = nearestEnemy(ax, az, 12, P.yaw, 3.2), yaw = tgt ? Math.atan2(tgt.x - ax, tgt.z - az) : P.yaw;
  o.g.visible = true; o.g.position.set(ax, 0, az); o.g.rotation.y = yaw; tint(o, 0xffffff);
  oneShot(o, o.key === 'glenn' ? 'CombatStance' : 'RightStraightPunch', .7);
  G.assist = { f: o, t: 0, x: ax, z: az, yaw, done: false }; pulse(ax, az, o.hex, 2.4, .3); sfx('tag'); floatText(`${o.name}: ASSIST`, ax, 2.8, az, 'tag');
}
function jeremyZap() {
  const e = nearestEnemy(P.x, P.z, 12, 0, 4); if (!e) return;
  bolt(e.x + rand(-1, 1), 9, e.z, e.x, e.def.h * e.scale * .6, e.z, 0x7ee787); damageEnemy(e, 18, { x: e.x, z: e.z + 1, pierce: true, stun: .5, word: 'JEREMY' }); sfx('pair');
}
function act(a) {
  P.buf = null;
  if (a === 'light') startMove('l1'); else if (a === 'heavy') startMove('h1');
  else if (a === 'dodge') { if (P.dodgeCd <= 0 && P.root <= 0) startDodge(); }
  else if (a === 'special') startSpecial(); else if (a === 'super') startSuper(); else if (a === 'tag') tag(false); else if (a === 'assist') assist();
}
function press(a) {
  if (a === 'pause') return togglePause();
  if (G.mode !== 'play' || G.paused || P.st === 'ko') return;
  P.buf = a; P.bufT = .24;
  if (P.root > 0 && (a === 'light' || a === 'heavy')) { P.root -= .32; if (P.root <= 0) floatText('DECLINED', P.x, 2.6, P.z, 'tag'); }       // mash to decline the meeting
}
function hurtPlayer(dmg, src = {}) {
  if (G.mode !== 'play' || P.st === 'ko' || G.phase === 'done') return false;
  if (P.inv > 0) { if (P.st === 'dodge' && !P.dodgeProc) { P.dodgeProc = true; floatText(pick(DODGE_WORDS), P.x, 2.6, P.z, 'tag'); addCaf(30); } return false; }
  const f = team[active], d = dmg * (f.pip > 0 ? 1.8 : 1) * (perk('sound') ? .85 : 1);
  f.hp -= d; f.rec = Math.max(f.hp, f.rec - d * .45); f.flash = .18; G.stats.dmg += d;              // a little over half of every hit can be walked off on the bench
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
  if (G.assist) { const a = G.assist; a.t += dt; if (!a.done && a.t > .22) { a.done = true; castSpecial(a.f, a.x, a.z, a.yaw); } if (a.t > .8) { burst(a.x, 1, a.z, a.f.hex, 8, 4); endAssist(); } }
  if (G.boss && G.boss.pull > 0 && P.st !== 'ko') { const a = aP(G.boss) + Math.PI; P.x += Math.sin(a) * G.boss.pull * dt; P.z += Math.cos(a) * G.boss.pull * dt; }
  const [ix, iz, moving] = inputDir();
  if (P.st === 'free') {
    const sp = f.speed * (perk('desk') ? 1.12 : 1) * (P.slow > 0 ? .55 : 1) * (T.bt > 0 ? 1.25 : 1);
    if (moving && P.root <= 0) { P.x += ix * sp * dt; P.z += iz * sp * dt; P.yaw += clamp(angDiff(Math.atan2(ix, iz), P.yaw), -16 * dt, 16 * dt); loopClip(f, 'Run', sp / 3.3); } else loopClip(f, 'Idle');
    if (P.buf) act(P.buf);
  } else if (P.st === 'attack') {
    const m = P.mv; P.t += dt * atkRate(f); const k = P.t / m.dur;
    if (k < m.hit) { P.x += Math.sin(P.yaw) * P.lspd * dt * atkRate(f); P.z += Math.cos(P.yaw) * P.lspd * dt * atkRate(f); }
    if (!P.hitDone && k >= m.hit) { P.hitDone = true; doStrike(m); }
    const b = P.buf;
    if (b === 'dodge' && P.dodgeCd <= 0 && P.root <= 0) { P.st = 'free'; act(b); }
    else if (P.hitDone && b && k >= m.hit + .12) {
      if (b === 'light' && m.next) { P.buf = null; startMove(m.next); }
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
  team.forEach((f, i) => {
    tint(f, 0xffffff); loopClip(f, 'Idle');
    if (mode === 'title') { f.g.visible = true; f.g.position.set(4.4 + i * 2.3, 0, 2.4 + i * .6); f.g.rotation.y = -.3 - i * .2; }
    else { f.g.visible = i === active; f.g.position.set(P.x, 0, P.z); f.g.rotation.y = P.yaw; }
  });
}
function showTitle() {
  G.mode = 'ready'; setMusic(false); $('hud').className = 'hide'; resetField(); buildArena('eng'); active = 0; pose('title'); P.x = 0;
  const s = store.get(), best = s.best ? `<small>Best political capital: <b>${s.best}</b>${s.wave ? ` · Longest backlog: <b>${s.wave} tickets</b>` : ''}</small>` : '';
  card(`<div class="kick">Glenntooth &amp; Coffee Guy vs. the AI Transformation</div><h1>PER MY <em>LAST PUNCH</em></h1>
    <p>MEGACORP went AI-native overnight. Nobody tested it. Tag in, tag out, and clear eight floors of rogue office AI, from the standup bot to the CEO’s AI clone. Jeremy, the AI bot from the last job, is keeping score. He is on your side. He still does not round up.</p>
    <h3>How to fight</h3>
    <div class="keys">
      <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span><span>Move. <kbd>Space</kbd> dodges, and nothing can hit you mid-dodge.</span>
      <span><kbd>J</kbd> <kbd>K</kbd></span><span>Jab (four-hit combo) and kick. Kick after two jabs for a roundhouse.</span>
      <span><kbd>L</kbd></span><span>Special. Glenn pairs robots together and stuns them; Coffee Guy throws a scalding espresso.</span>
      <span><kbd>Q</kbd></span><span>Tag your partner in. The one on the bench recovers morale, and tagging shakes off meetings, PIPs and prompt injections.</span>
      <span><kbd>E</kbd></span><span>Assist: your partner jumps in for one move.</span>
      <span><kbd>F</kbd></span><span>Super, once caffeine reaches 800mg.</span>
    </div>
    <p class="rot">On a phone, turn it sideways first. This is a landscape kind of fight.</p>
    <div class="row"><button class="go" data-act="enter" id="go">Start: eight levels (Enter)</button><button data-act="b">Endless backlog (B)</button></div>
    <div class="row" style="margin-top:10px">${best}<small>A companion to <a href="https://rayhe.net/glenntooth/" target="_blank" rel="noopener">Glenntooth the UniFier</a>. <kbd>M</kbd> mutes.</small></div>`,
  { enter: startStory, b: () => startEndless(false) }, true);
}
function startStory() { T.perks.clear(); T.pc = 0; T.caf = 150; G.story = true; G.level = START_LEVEL; resetTeam(); showIntro(); }
function startEndless(keep) {
  if (!keep) { T.perks.clear(); T.pc = 0; } T.caf = 150; G.story = false; G.endless.wave = 0; resetTeam(); resetField(); buildArena('eng'); closeCard(); beginPlay();
  $('lvl').textContent = 'THE ENDLESS BACKLOG'; hudF[0].small.textContent = 'Lord Bluetooth, Duke of Spectrum'; G.gap = 1; G.phase = 'waves';
}
function showIntro() {
  const L = LEVELS[G.level], bd = BOTS[L.boss];
  G.mode = 'intro'; setMusic(false); $('hud').className = 'hide'; resetField(); buildArena(L.theme); pose();
  card(`<div class="kick">Level ${G.level + 1} of 8 · ${L.room} · ${L.when}</div><h2>${L.title}</h2><p>${L.intro}</p>
    <div class="q" style="--col:var(--g)"><b>GLENNTOOTH</b> “${L.glenn}”</div><div class="q" style="--col:var(--c)"><b>COFFEE GUY</b> “${L.coffee}”</div>
    <div class="bogey"><small>BOGEYMAN</small><br><b>${bd.name}</b><br><small>${bd.sub}</small></div>
    <div class="row"><button class="go" data-act="enter">Clock in (Enter)</button><small>Glenn’s title this level: ${GTITLE[G.level]}. Coffee Guy’s: no change.</small></div>`, { enter: beginLevel });
}
function beginPlay() {
  G.mode = 'play'; G.paused = false; $('pause').className = ''; $('hud').className = ''; G.stats = { t: 0, dmg: 0, maxCombo: 0, kills: 0 }; G.microUsed = false;
  T.caf = perk('resign') ? 800 : Math.max(T.caf, 150); T.aiT = 5; pose();
  hudF.forEach((h, i) => { h.b.textContent = team[i].name; }); hudF[1].small.textContent = 'Lead Installer · runs on caffeine';
  $('perks').textContent = PERKS.filter(p => perk(p.id)).map(p => p.icon).join(' ');
  setMusic(true, 55, 124);
}
function beginLevel() {
  const L = LEVELS[G.level]; closeCard(); resetTeam(); beginPlay();
  G.hpScale = 1 + G.level * .1; G.dmgScale = 1 + G.level * .07; G.atkGap = Math.max(.3, .95 - G.level * .08); G.cap = 6 + (G.level >> 1);
  $('lvl').textContent = `Level ${G.level + 1}/8 · ${L.room}`; hudF[0].small.textContent = GTITLE[G.level];
  G.phase = 'waves'; G.wave = -1; G.gap = .6;
  if (G.level === 0) toast('<b>Jeremy (AI bot):</b> jab with <kbd>J</kbd>, dodge with <kbd>Space</kbd>, and tag with <kbd>Q</kbd> before one of you runs out of morale. I will be counting.', 7);
}
function queueWave(list) { const q = []; for (const [t, n] of list) for (let i = 0; i < n; i++) q.push(t); G.queue = shuffle(q); G.spawnT = .5; }
function endlessList(n) {
  const pool = ['halluc', 'replyall']; for (const [w, t] of [[2, 'creep'], [3, 'burner'], [4, 'invite'], [5, 'loop'], [6, 'inject'], [7, 'yesbot'], [8, 'review']]) if (n >= w) pool.push(t);
  const cnt = {}; for (let i = Math.min(22, 4 + Math.floor(n * 1.2)); i > 0; i--) { const t = pick(pool); cnt[t] = (cnt[t] || 0) + 1; }
  if (cnt.yesbot > 2) cnt.yesbot = 2; return Object.entries(cnt);
}
function advance() {
  if (G.story) {
    const L = LEVELS[G.level]; G.wave++;
    if (G.wave >= L.waves.length) return bossIntro(L.boss, 1);
    const w = L.waves[G.wave]; banner(`TICKET ${G.wave + 1} OF ${L.waves.length}`, w.t, 2.4); $('wave').textContent = w.t; queueWave(w.s);
  } else {
    const E = G.endless, n = ++E.wave, b = n / 5 - 1;
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
  const next = () => {
    if (G.story) { if (++G.level >= LEVELS.length) showEnding(); else showIntro(); }
    else { closeCard(); buildArena(LEVELS[(G.endless.wave / 5) % 8].theme); beginPlay(); G.phase = 'waves'; G.gap = 1; }
  };
  const opts = G.story && G.level === LEVELS.length - 1 ? [] : shuffle(PERKS.filter(p => !perk(p.id))).slice(0, 3);
  let tail = `<div class="row"><button class="go" data-act="enter">Continue (Enter)</button></div>`;
  if (opts.length) tail = `<h3>Exec suite · choose one perk</h3><div class="perks">` + opts.map((p, i) => { acts[i + 1] = () => { T.perks.add(p.id); next(); }; return `<button data-act="${i + 1}"><kbd>${i + 1}</kbd><span class="ic">${p.icon}</span><b>${p.name}</b><small>${p.desc}</small></button>`; }).join('') + `</div>`;
  else acts.enter = next;
  card(head + tail, acts);
}
function showEnding() {
  G.mode = 'ending'; const s = store.get(); store.set({ best: Math.max(s.best || 0, T.pc), won: true }); buildArena('board'); pose('title');
  card(`<div class="kick">Day 30 · 9:47 AM · The boardroom</div><h1>NUMBER <em>WENT UP</em></h1>
    <p>The CEO’s AI Clone has been sunset. The real CEO has not noticed. The board skimmed the summary and approved it.</p>
    <p><b style="color:var(--g)">Glenn</b> is promoted to <b>Lord Bluetooth, Duke of Spectrum</b>. The crown is no longer ironic.<br><b style="color:var(--c)">Coffee Guy</b> remains Lead Installer. He has been given a mug and, for the first time in thirty days, a coffee made by a person.</p>
    <p><small>Jeremy (AI bot): “Final political capital: ${T.pc}. I have filed the report. I did not round up.”</small></p>
    <p>The backlog, however, is endless.</p>
    <div class="row"><button class="go" data-act="b">Take on the endless backlog (B)</button><button data-act="enter">Back to title (Enter)</button></div>`, { b: () => startEndless(true), enter: showTitle }, true);
}
function gameOver() {
  G.mode = 'over'; setMusic(false); $('hud').className = 'hide'; const s = store.get();
  if (G.story) {
    store.set({ best: Math.max(s.best || 0, T.pc) }); const L = LEVELS[G.level];
    card(`<div class="kick">Level ${G.level + 1} · ${L.room}</div><h2>You have been moved to Special Projects.</h2><p>Unkillable. Unpromotable. In this case, also unconscious.</p>
      <p><small>Jeremy (AI bot): “Per my last email: <kbd>Space</kbd> dodges, and a partner on the bench gets morale back. Tag more.”</small></p>
      <div class="row"><button class="go" data-act="enter">Retry this level (Enter)</button><button data-act="esc">Title (Esc)</button></div>`, { enter: showIntro, esc: showTitle });
  } else {
    const n = Math.max(0, G.endless.wave - 1); store.set({ best: Math.max(s.best || 0, T.pc), wave: Math.max(s.wave || 0, n) });
    card(`<div class="kick">The endless backlog</div><h2>${n} tickets closed. The backlog remains endless.</h2><p>Political capital: <b>${T.pc}</b>. Longest run: <b>${Math.max(s.wave || 0, n)}</b> tickets.</p>
      <p><small>Jeremy (AI bot): “I have re-opened all of them.”</small></p>
      <div class="row"><button class="go" data-act="enter">Again (Enter)</button><button data-act="esc">Title (Esc)</button></div>`, { enter: () => startEndless(false), esc: showTitle });
  }
}
function togglePause() { if (G.mode !== 'play') return; G.paused = !G.paused; $('pause').className = G.paused ? 'on' : ''; keys.clear(); }

// ------------------------------------------------------------------ HUD
const setT = (el, t) => { if (el._t !== t) el.textContent = el._t = t; };
const setC = (el, c) => { if (el._c !== c) el.className = el._c = c; };
const setW = (el, v) => { const w = Math.round(clamp(v, 0, 1) * 1000) / 10; if (el._w !== w) { el._w = w; el.style.width = w + '%'; } };
function chip(el, frac, state) { setC(el, 'cd ' + state); const h = Math.round(clamp(frac, 0, 1) * 100); if (el._h !== h) { el._h = h; el.lastElementChild.style.height = h + '%'; } }
function updateHud() {
  if (G.mode !== 'play') return;
  team.forEach((f, i) => { const h = hudF[i]; setC(h.root, 'fighter' + (i === active ? ' on' : '') + (f.ko ? ' ko' : '') + (f.pip > 0 ? ' pip' : '')); setW(h.hp, f.hp / f.maxHp); setW(h.rec, f.rec / f.maxHp); });
  const f = team[active], o = team[1 - active], tier = cafTier();
  setW($('cafFill'), T.caf / 800); setT($('cafMg'), Math.round(T.caf) + 'mg'); setT($('cafTier'), `${tier[1]} · damage ×${tier[2].toFixed(2)}`); setC($('caf'), T.caf >= 800 ? 'full' : '');
  const spMax = f.spMax * (perk('rfc') ? .7 : 1);
  chip($('cdSp'), f.spCd / spMax, f.spCd <= 0 ? 'ready' : ''); chip($('cdTag'), T.tagCd / 1.6, o.ko ? 'off' : T.tagCd <= 0 ? 'ready' : '');
  chip($('cdAs'), T.assistCd / (perk('skip') ? 5.5 : 8.5), o.ko ? 'off' : T.assistCd <= 0 ? 'ready' : ''); chip($('cdSu'), 1 - T.caf / 800, T.caf >= 800 ? 'hot' : '');
  setT($('pc').lastElementChild, String(T.pc));
  const cb = $('combo'); if (P.combo >= 2) { let rk = ''; for (const [n, w] of COMBO_RANKS) if (P.combo >= n) rk = w; const k = P.combo + '|' + rk; if (cb._k !== k) { cb._k = k; cb.innerHTML = `<b>${P.combo} HITS</b><span>${rk}</span>`; } } else if (cb._k) { cb._k = ''; cb.innerHTML = ''; }
  const b = G.boss;
  if (b && b.alive) {
    setC($('bossbar'), 'panel on' + (b.vuln > 0 || b.open > 0 ? ' vuln' : '')); setT($('bossName'), b.def.name); setW($('bossFill'), b.hp / b.maxHp);
    setT($('bossSub'), b.type === 'ceo' ? `Slide ${clamp(13 - Math.ceil(12 * b.hp / b.maxHp), 1, 12)} of 12 · ${['Vision 2.0', '3 AM Tweet', 'AI-Native Everything'][b.phase - 1]}` : b.vuln > 0 ? 'Restarting: vulnerable' : b.open > 0 ? 'Guard down: vulnerable' : b.def.sub);
  } else setC($('bossbar'), 'panel');
  setT($('status'), f.pip > 0 ? 'ON A PIP: nearly double damage. Tag out (Q)!' : P.root > 0 ? 'IN A MEETING: mash J to decline, or tag out' : P.rev > 0 ? 'PROMPT INJECTED: controls reversed' : P.slow > 0 ? 'CHILLED: moving slowly' : T.bt > 0 ? `BEYOND 800mg · ${T.bt.toFixed(1)}s` : '');
}
function updateCamera(dt) {
  const narrow = camera.aspect < 1, k = clamp(1.5 / camera.aspect, 1, 1.7), tx = G.mode === 'play' ? (narrow ? clamp(P.x * .95, -10, 10) : clamp(P.x * .68, -6.5, 6.5)) : narrow ? 5 : 0; G.camX += (tx - G.camX) * Math.min(1, dt * 4);
  let sx = 0, sy = 0; if (G.shake > 0) { G.shake = Math.max(0, G.shake - dt * 1.7); sx = (Math.random() - .5) * G.shake; sy = (Math.random() - .5) * G.shake; }
  camera.position.set(G.camX + sx, 8.5 * k + sy, 13.5 * k); camera.lookAt(G.camX + sx * .5, .7, -.3);
}

// ------------------------------------------------------------------ input
const ACT = { KeyJ: 'light', KeyZ: 'light', KeyK: 'heavy', KeyX: 'heavy', KeyL: 'special', KeyC: 'special', Space: 'dodge', ShiftLeft: 'dodge', KeyQ: 'tag', Tab: 'tag', KeyE: 'assist', KeyF: 'super', KeyR: 'super' };
addEventListener('keydown', e => {
  if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  initAudio(); if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.code === 'KeyM') return toggleMute();
  if (G.card) {
    const k = e.code === 'Enter' || e.code === 'NumpadEnter' ? 'enter' : e.code === 'Escape' ? 'esc' : e.code.startsWith('Digit') ? e.code.slice(5) : e.code.startsWith('Key') ? e.code.slice(3).toLowerCase() : '';
    const fn = G.card[k]; if (fn) { sfx('ui'); fn(); } return;
  }
  if (G.mode !== 'play') return;
  if (e.code === 'KeyP' || e.code === 'Escape') return togglePause();
  keys.add(e.code); if (ACT[e.code]) press(ACT[e.code]);
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
$('c').addEventListener('pointerdown', e => { initAudio(); if (e.pointerType === 'mouse') press(e.button === 2 ? 'heavy' : 'light'); });
$('c').addEventListener('contextmenu', e => e.preventDefault());
if (matchMedia('(pointer: coarse)').matches) {              // phones and tablets: a thumbstick on the left, buttons on the right
  $('touch').className = 'on'; const st = $('stick'), nub = $('nub'); let id = null, sx = 0, sy = 0;
  st.addEventListener('pointerdown', e => { initAudio(); id = e.pointerId; sx = e.clientX; sy = e.clientY; nub.style.display = 'block'; nub.style.left = sx - st.getBoundingClientRect().left + 'px'; nub.style.top = sy - st.getBoundingClientRect().top + 'px'; st.setPointerCapture(id); });
  st.addEventListener('pointermove', e => { if (e.pointerId !== id) return; let x = (e.clientX - sx) / 48, y = (e.clientY - sy) / 48; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } touch.x = x; touch.y = y; nub.firstElementChild.style.transform = `translate(${x * 30}px, ${y * 30}px)`; });
  const up = e => { if (e.pointerId !== id) return; id = null; touch.x = touch.y = 0; nub.style.display = 'none'; nub.firstElementChild.style.transform = ''; };
  st.addEventListener('pointerup', up); st.addEventListener('pointercancel', up);
  for (const b of $('tb').children) b.addEventListener('pointerdown', e => { e.preventDefault(); initAudio(); press(b.dataset.a); });
}

// ------------------------------------------------------------------ main loop
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
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
      if (dt > 0) { const eDt = dt * (T.bt > 0 ? .3 : 1); updatePlayer(dt); updateEnemies(eDt, dt); updateHazards(eDt); updateZones(eDt); updateShots(eDt, dt); updateRings(eDt); updateBeams(eDt); updatePickups(dt); updateFlow(dt); }
    }
  }
  if (!G.paused) { for (const f of team) f.mixer.update(dt); updateFx(real); updateBubbles(real); }
}

// ------------------------------------------------------------------ boot
buildArena('eng');
card(`<div class="kick">Glenntooth &amp; Coffee Guy vs. the AI Transformation</div><h1>PER MY <em>LAST PUNCH</em></h1><div class="row"><button class="go" id="go" disabled>Loading the tag team…</button></div>`, {}, true);
updateCamera(1); renderer.render(scene, camera);
Promise.all(FDEF.map(loadFighter)).then(fs => {
  team.push(...fs); fs.forEach((f, i) => { hudF[i].img.src = portrait(f); });
  showTitle(); requestAnimationFrame(frame);
}).catch(err => { console.error(err); $('cardIn').innerHTML = `<h2>The tag team did not load.</h2><p>${String(err.message || err)}</p><p><small>This page needs to be served over http(s) with <code>assets/glenn.glb</code> and <code>assets/coffee.glb</code> next to it.</small></p>`; });
window.PMLP = { G, T, P, team, enemies, hazards, shots, rings, beams, zones, pickups, keys, touch, LEVELS, BOTS, press, sim, spawnEnemy, damageEnemy, get active() { return active; } };      // for poking at it from the console
