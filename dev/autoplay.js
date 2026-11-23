// Dev-only test harness for Per My Last Punch. Not loaded by index.html.
// Paste into the browser console on the game page (after the title has loaded), then:
//   runStory({ skill: .4 })      plays all eight levels with an autoplayer and returns one line per level
//   runBot(30, { skill: .8 })    plays the current fight for 30 simulated seconds
// It steps the game with PMLP.sim(dt) and never draws, so a whole run takes a few seconds.
// Options: skill (0..1, chance it dodges each telegraphed circle), noTag (never tags or assists), mash (seconds between attack presses).
window.runBot = function (seconds, opts = {}) {
  const { P, enemies, hazards, G, T, team, touch, press } = PMLP;
  const dt = 1 / 60; let t = 0, atkT = 0; const skill = opts.skill ?? .7, mash = opts.mash ?? .12;
  while (t < seconds && G.mode === 'play') {
    t += dt;
    let tgt = null, bd = 1e9;
    for (const e of enemies) { if (e.spawn > 0 || e.decoy) continue; const d = Math.hypot(e.x - P.x, e.z - P.z) - e.r; if (d < bd) { bd = d; tgt = e; } }
    touch.x = 0; touch.y = 0;
    let danger = null;
    for (const h of hazards) { if (h.dmg <= 0) continue; if (h._bot === undefined || h.t < .05) h._bot = Math.random() < skill; if (h._bot && h.delay - h.t < .28 && Math.hypot(P.x - h.x, P.z - h.z) < h.r + .4) danger = h; }
    if (danger) { const a = Math.atan2(P.x - danger.x, P.z - danger.z); touch.x = Math.sin(a); touch.y = Math.cos(a); press('dodge'); }
    else if (tgt) {
      const a = Math.atan2(tgt.x - P.x, tgt.z - P.z);
      if (bd > 1.4) { touch.x = Math.sin(a); touch.y = Math.cos(a); }
      if (bd < 1.9) { atkT -= dt; if (atkT <= 0) { atkT = mash; press(Math.random() < (opts.kick ?? .15) ? 'heavy' : 'light'); } }
      if (bd < 9 && team[PMLP.active].spCd <= 0 && Math.random() < .03) press('special');
      if (T.caf >= 800 && bd < 4 && Math.random() < .05) press('super');
      if (!opts.noTag && T.assistCd <= 0 && bd < 8 && Math.random() < .01) press('assist');
    }
    const f = team[PMLP.active], o = team[1 - PMLP.active];
    if (!opts.noTag && !o.ko && T.tagCd <= 0 && ((f.hp < f.maxHp * .35 && o.hp > f.hp + 15) || f.pip > 0 || P.root > .6)) press('tag');
    PMLP.sim(dt);
  }
  touch.x = touch.y = 0;
};
window.runStory = function (opts = {}) {                  // start from the title screen
  const { G } = PMLP, out = [];
  if (G.mode !== 'ready') return 'not at title: ' + G.mode;
  G.card.enter();
  for (let i = G.level; i < 8; i++) {
    G.card.enter(); let bossT = 0, t = 0;
    while (G.mode === 'play' && t < 900) { runBot(1, opts); t += 1; if (G.phase === 'boss') bossT += 1; }
    out.push(`L${i + 1} ${G.mode} t=${Math.round(G.stats.t)} boss=${bossT}s dmg=${Math.round(G.stats.dmg)} hp=${PMLP.team.map(f => f.ko ? 'KO' : Math.round(f.hp)).join('/')} combo=${G.stats.maxCombo} ${(document.querySelector('#cardIn .g') || {}).textContent || ''}` + (G.mode !== 'clear' ? ` [${G.phase} wave ${G.wave} boss ${G.boss ? Math.round(G.boss.hp) : '-'}]` : ''));
    if (G.mode !== 'clear') { G.card.esc(); return out; }
    const c = G.card; (c[1 + (Math.random() * 3 | 0)] || c[1] || c.enter)();
  }
  out.push('end=' + G.mode + ' pc=' + PMLP.T.pc); G.card.enter(); return out;
};
