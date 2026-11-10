/* Act VII, scene 17: the model at work, and Hafiz's speculative decoding.
   It opens on the cursor Act VI ended with. A screen grows around it and the model answers one token at a time; each
   token is a whole forward pass through the model (the stack beside the screen pulses once per token). You pick the
   question (three short answers about Hafiz and his work). Then speculative decoding, as a race: the big model alone
   against the big model with a small drafter that guesses several tokens ahead, checked in one pass (kept tokens turn
   mint, the first miss is struck out and fixed in gold). Then the question his paper studies, how far to draft, as a
   toy chart you can play with (draft length, task). Then his Zidong Taichu internship and the paper. It ends with the
   screen shrinking to a point of light, the first frame of the globe. */
import * as THREE from 'three';
import { col, rng, sstep, clamp, lerp, easeInOut, pixelScale, glowTexture, FONTS } from '../core/util.js';
import { slab, floor, motes } from '../core/glass.js';

const PROMPTS = [
  { q: 'What does Hafiz work on?', a: 'He makes large AI models run fast on real hardware: LLM inference, model compression and deployment on GPUs, FPGAs and NPUs, at IHEP in Beijing, where he is a PhD student.' },
  { q: 'Why make models faster?', a: 'A faster model answers sooner, costs less, and fits where big ones cannot: on a detector’s chip, on a phone, or on a server answering millions of requests a day.' },
  { q: 'What is speculative decoding?', a: 'A small drafter guesses several tokens ahead, and the big model checks them all in one pass. It keeps what it agrees with and fixes the first miss: the same answer, only faster.' }
];
// Word pieces: long words split in two, the way a tokenizer would.
const tokens = s => (s.match(/[^\s]+\s*/g) || []).flatMap(w => { const core = w.trim(); if (core.length > 8 && /^[a-z]+[,.:]?$/i.test(core)) { const k = Math.ceil(core.length * .55); return [w.slice(0, k), w.slice(k)]; } return [w]; });
const TASKS = [{ k: 'HumanEval', a: .8, sub: 'code: very predictable' }, { k: 'GSM8K', a: .72, sub: 'maths, step by step' }, { k: 'MT-Bench', a: .62, sub: 'open conversation' }];
const speedup = (a, k) => ((1 - Math.pow(a, k + 1)) / (1 - a)) / (1 + .15 + .04 * k);   // toy: one drafter pass for the whole block, a little verification cost per drafted token

export default function inference(ctx) {
  const { small, ui, score, pointer, renderer, coarse } = ctx;
  const scene = new THREE.Scene();
  scene.background = col('#05050c');
  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, .05, 300);
  const r = rng(9505);
  let tall = false;
  scene.add(floor(-1.6, '#8a6cff'));
  const dust = motes(small ? 160 : 360, [40, 14, 30], '#cdb8ff'); scene.add(dust.pts);

  /* ---------- The screen: a canvas texture we draw the conversation into ---------- */
  const cvs = document.createElement('canvas'), g = cvs.getContext('2d');
  const tex = new THREE.CanvasTexture(cvs); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 })); scene.add(screen);
  const frame = slab(1, 1, .06, '#b49bff'); scene.add(frame);
  const cursor = new THREE.Mesh(new THREE.BoxGeometry(.07, .2, .02), new THREE.MeshBasicMaterial({ color: col('#f4efe0'), transparent: true })); scene.add(cursor);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: col('#e8dcff'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 })); scene.add(glow);
  let SW = 10, SH = 5.6, SC = new THREE.Vector3(1.8, 3.2, 0), CWp = 1600, CHp = 900;

  /* ---------- The big model and its drafter, pulsing once per pass ---------- */
  const big = Array.from({ length: 6 }, () => { const s = slab(2.4, .3, .8); scene.add(s); return s; });
  const drafter = Array.from({ length: 3 }, () => { const s = slab(1.2, .26, .6, '#ffd27a'); scene.add(s); return s; });
  const bigPulse = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: col('#9ff7dc'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 })); bigPulse.scale.setScalar(1.6); scene.add(bigPulse);
  const drPulse = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: col('#ffd27a'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 })); drPulse.scale.setScalar(1.1); scene.add(drPulse);
  let BIG0 = new THREE.Vector3(-6.6, 1.6, 0), DR0 = new THREE.Vector3(-4, 1.6, 0);

  /* ---------- State ---------- */
  let pick = 0, chatT0 = -1, raceT0 = -1, task = 1, kDraft = 5, userBudget = false;
  const ans = () => tokens(PROMPTS[pick].a);
  // The speculative schedule: per round, k drafted tokens, how many the big model accepted (seeded, so it replays the same).
  function schedule(toks, k, a) {
    const rr = rng(77), rounds = []; let i = 0;
    while (i < toks.length) { let acc = 0; while (acc < k && rr() < a) acc++; acc = Math.min(acc, toks.length - i - 1); rounds.push({ i, k: Math.min(k, toks.length - i), acc }); i += acc + 1; }
    return rounds;
  }
  const T_PASS = .16, T_DRAFT = .1, T_FIX = .22;

  /* ---------- Drawing the screen ---------- */
  function layout() {
    if (tall) { SW = 6.4; SH = 8.8; SC.set(0, 4.6, 0); CWp = 820; CHp = 1130; BIG0.set(-1.4, -.6, 0); DR0.set(1.4, -.6, 0); }
    else { SW = 11; SH = 6.2; SC.set(1.6, 3.2, 0); CWp = 1420; CHp = 800; BIG0.set(-6.6, 1.6, 0); DR0.set(-4, 1.6, 0); }
    cvs.width = CWp; cvs.height = CHp; screen.scale.set(SW, SH, 1); screen.position.copy(SC); frame.scale.set(SW + .1, SH + .1, 1); frame.position.copy(SC).add(new THREE.Vector3(0, 0, -.05));
    big.forEach((s, j) => s.position.copy(BIG0).add(new THREE.Vector3(0, j * .42, 0)));
    drafter.forEach((s, j) => s.position.copy(DR0).add(new THREE.Vector3(0, j * .38, 0)));
    drawn = '';
  }
  const F = (w, px, fam = FONTS.sans) => `${w} ${px}px ${fam}`;
  function flow(list, x0, y0, maxW, size, style) {
    // list: [{t, s}] with s = '' | 'ghost' | 'ok' | 'bad' | 'fix'; returns the end cursor
    let x = x0, y = y0; g.font = F(500, size); g.textBaseline = 'top';
    list.forEach(({ t, s }) => {
      const w = g.measureText(t).width;
      if (x + w > x0 + maxW && x > x0) { x = x0; y += size * 1.45; }
      if (s === 'ok' || s === 'fix' || s === 'ghost') { g.fillStyle = s === 'ok' ? 'rgba(98,245,176,.18)' : s === 'fix' ? 'rgba(255,211,110,.28)' : 'rgba(205,187,255,.08)'; g.fillRect(x - 2, y - 3, g.measureText(t.trimEnd()).width + 4, size * 1.28); }
      g.fillStyle = s === 'ghost' ? 'rgba(205,187,255,.6)' : s === 'bad' ? '#ff8a96' : s === 'fix' ? '#ffe6a8' : s === 'ok' ? '#d6ffe9' : '#f4efe0';
      g.font = F(s === 'ghost' ? 400 : 500, size, s === 'ghost' ? FONTS.sans : FONTS.sans); if (s === 'ghost') g.font = `italic 400 ${size}px ${FONTS.sans}`;
      g.fillText(t, x, y);
      if (s === 'bad') { g.strokeStyle = '#ff8a96'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y + size * .6); g.lineTo(x + g.measureText(t.trimEnd()).width, y + size * .6); g.stroke(); }
      x += w;
    });
    return { x, y };
  }
  let drawn = '';
  function panel(title) {
    g.clearRect(0, 0, CWp, CHp);
    const grd = g.createLinearGradient(0, 0, 0, CHp); grd.addColorStop(0, 'rgba(14,10,30,.96)'); grd.addColorStop(1, 'rgba(6,6,14,.96)');
    g.fillStyle = grd; g.beginPath(); g.roundRect(4, 4, CWp - 8, CHp - 8, 28); g.fill();
    g.strokeStyle = 'rgba(205,187,255,.35)'; g.lineWidth = 3; g.stroke();
    g.font = F(400, 22, FONTS.mono); g.fillStyle = 'rgba(205,187,255,.7)'; g.textBaseline = 'top'; g.fillText(title, 40, 32);
    g.fillStyle = 'rgba(205,187,255,.15)'; g.fillRect(40, 70, CWp - 80, 2);
  }
  function drawChat(t) {
    const toks = ans(), el = chatT0 < 0 ? 0 : t - chatT0, typed = Math.min(PROMPTS[pick].q.length, Math.floor(el * 28)), n = clamp(Math.floor((el - PROMPTS[pick].q.length / 28 - .3) / T_PASS), 0, toks.length);
    const key = `c${pick}|${typed}|${n}|${Math.floor(t * 2) % 2}`; if (key === drawn) return n; drawn = key;
    panel('chat · a deployed model · one token per forward pass');
    const size = tall ? 40 : 38;
    g.font = F(600, size); g.fillStyle = '#ffe6a8'; g.textBaseline = 'top';
    g.fillText(`> ${PROMPTS[pick].q.slice(0, typed)}`, 40, 110);
    const end = flow(toks.slice(0, n).map(t2 => ({ t: t2, s: '' })), 40, 110 + size * 2, CWp - 80, size);
    if (Math.floor(t * 2) % 2 && n < toks.length) { g.fillStyle = '#f4efe0'; g.fillRect(end.x + 2, end.y, 4, size * 1.1); }
    g.font = F(400, 22, FONTS.mono); g.fillStyle = 'rgba(159,247,220,.8)'; g.fillText(`forward passes: ${n}`, 40, CHp - 60);
    tex.needsUpdate = true; return n;
  }
  function specState(el, toks, rounds) {
    // walk the rounds to time el: what is settled, what is drafted, what was struck
    let tt = 0, out = [], passes = 0;
    for (const rd of rounds) {
      const dur = T_DRAFT + T_PASS + (rd.acc < rd.k ? T_FIX : 0);
      if (el < tt + dur) {
        const u = el - tt, live = [];
        for (let j = 0; j < rd.k; j++) { const t2 = toks[rd.i + j]; if (u < T_DRAFT) live.push({ t: t2, s: 'ghost' }); else if (u < T_DRAFT + T_PASS) live.push({ t: t2, s: 'ghost' }); else live.push({ t: t2, s: j < rd.acc ? 'ok' : j === rd.acc ? 'bad' : 'ghost' }); }
        return { list: out.concat(live), passes: passes + (u > T_DRAFT ? 1 : 0), pulse: u > T_DRAFT && u < T_DRAFT + T_PASS, draft: u < T_DRAFT, done: false };
      }
      for (let j = 0; j < rd.acc; j++) out.push({ t: toks[rd.i + j], s: 'ok' });
      out.push({ t: toks[rd.i + rd.acc], s: 'fix' });
      passes++; tt += dur;
    }
    return { list: out, passes, pulse: false, draft: false, done: true, time: tt };
  }
  let lastRace = null;
  function drawRace(t) {
    const toks = tokens(PROMPTS[2].a), rounds = schedule(toks, 5, .74), el = raceT0 < 0 ? 0 : t - raceT0;
    const nA = clamp(Math.floor(el / T_PASS), 0, toks.length), sp = specState(el, toks, rounds), doneA = nA >= toks.length;
    const tA = toks.length * T_PASS, tB = specState(1e9, toks, rounds).time;
    const key = `r${nA}|${sp.list.length}|${sp.list.map(o => o.s[0] || '-').join('')}|${sp.passes}`;
    lastRace = { pulseA: !doneA && (el % T_PASS) < T_PASS * .6, pulseB: sp.pulse, draft: sp.draft, el, tA, tB };
    if (raceT0 >= 0 && el > tA + 2.2) raceT0 = t;   // loop
    if (key === drawn) return; drawn = key;
    panel('speculative decoding · the same answer, two ways');
    const size = tall ? 30 : 30, half = tall ? 0 : (CWp - 120) / 2, colW = tall ? CWp - 80 : half;
    const ax = 40, ay = 110, bx = tall ? 40 : 80 + half, by = tall ? CHp / 2 + 30 : 110;
    g.font = F(600, 26); g.fillStyle = '#cdbbff'; g.fillText('The big model alone', ax, ay);
    g.fillStyle = '#ffd27a'; g.fillText('With a drafter', bx, by);
    flow(toks.slice(0, nA).map(t2 => ({ t: t2, s: '' })), ax, ay + 50, colW, size);
    flow(sp.list, bx, by + 50, colW, size);
    g.font = F(400, 21, FONTS.mono);
    g.fillStyle = 'rgba(205,187,255,.85)'; g.fillText(`big-model passes: ${nA}${doneA ? ` · done in ${tA.toFixed(2)} s` : ''}`, ax, tall ? CHp / 2 - 40 : CHp - 60);
    g.fillStyle = 'rgba(255,211,110,.9)'; g.fillText(`big-model passes: ${sp.passes}${sp.done ? ` · done in ${tB.toFixed(2)} s · ${(tA / tB).toFixed(1)}× faster here` : ''}`, bx, CHp - 60);
    tex.needsUpdate = true;
  }
  function drawBudget() {
    const key = `b${task}|${kDraft}`; if (key === drawn) return; drawn = key;
    panel('how far to draft? a toy model for intuition, not measured data');
    const x0 = tall ? 90 : 110, x1 = CWp - 60, y0 = CHp - (tall ? 260 : 150), y1 = tall ? 150 : 120, K = 12, ymax = 3.5;
    const X = k => x0 + (k - 1) / (K - 1) * (x1 - x0), Y = v => y0 - (v - 1) / (ymax - 1) * (y0 - y1);
    g.strokeStyle = 'rgba(205,187,255,.4)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x0, y1); g.lineTo(x0, y0); g.lineTo(x1, y0); g.stroke();
    g.font = F(400, 20, FONTS.mono); g.fillStyle = 'rgba(205,187,255,.7)';
    for (let v = 1; v <= 3.5; v += .5) { g.fillText(`${v.toFixed(1)}×`, x0 - 70, Y(v) - 10); g.fillStyle = 'rgba(205,187,255,.08)'; g.fillRect(x0, Y(v), x1 - x0, 1); g.fillStyle = 'rgba(205,187,255,.7)'; }
    for (let k = 1; k <= K; k++) g.fillText(String(k), X(k) - 6, y0 + 14);
    g.fillText('draft length (tokens guessed per round) →', x0, y0 + 46); g.fillText('speed-up', x0 - 70, y1 - 40);
    TASKS.forEach((tk, i) => {
      g.strokeStyle = i === task ? '#ffd27a' : 'rgba(205,187,255,.25)'; g.lineWidth = i === task ? 4 : 2; g.beginPath();
      for (let k = 1; k <= K; k++) { const v = speedup(tk.a, k); k === 1 ? g.moveTo(X(k), Y(v)) : g.lineTo(X(k), Y(v)); } g.stroke();
      const v = speedup(tk.a, K); g.fillStyle = i === task ? '#ffd27a' : 'rgba(205,187,255,.5)'; g.fillText(tk.k, X(K) - 120, Y(v) - 28);
    });
    const tk = TASKS[task]; let best = 1; for (let k = 1; k <= K; k++) if (speedup(tk.a, k) > speedup(tk.a, best)) best = k;
    g.fillStyle = 'rgba(98,245,176,.9)'; g.beginPath(); g.arc(X(best), Y(speedup(tk.a, best)), 9, 0, 7); g.fill(); g.fillText('best here', X(best) - 40, Y(speedup(tk.a, best)) - 40);
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(X(kDraft), Y(speedup(tk.a, kDraft)), 12, 0, 7); g.fill();
    const acc = (1 - Math.pow(tk.a, kDraft + 1)) / (1 - tk.a) - 1, waste = kDraft - acc;
    g.font = F(600, tall ? 30 : 30); g.fillStyle = '#f4efe0';
    g.fillText(`${kDraft} drafted · ${acc.toFixed(1)} kept · ${waste.toFixed(1)} wasted · ${speedup(tk.a, kDraft).toFixed(2)}×`, x0, tall ? y0 + 110 : y1 - 4 + 0);
    tex.needsUpdate = true;
  }

  /* ---------- Controls, cards ---------- */
  const ctl = document.createElement('div'); ctl.className = 'race-ctl inf-ctl';
  ctl.innerHTML = `<div class="ic-ask"><span>Ask the model</span><div class="rc-row">${PROMPTS.map((o, i) => `<button type="button" data-q="${i}">${o.q}</button>`).join('')}</div></div>
    <div class="ic-budget"><span>Draft length <b class="ic-k">5</b></span><input type="range" min="1" max="12" step="1" value="5" aria-label="Draft length"><div class="rc-row">${TASKS.map((o, i) => `<button type="button" data-t="${i}">${o.k}</button>`).join('')}</div></div>`;
  const cardT = document.createElement('aside'); cardT.className = 'paper-card mini-card taichu-card';
  cardT.innerHTML = `<div class="pc-img"><img src="../assets/showcase/place-taichu.webp" alt="The Zidong Taichu office building in Beijing" loading="lazy"></div><div class="pc-body"><small>Algorithm R&amp;D intern · Jul – Oct 2026 · Beijing</small><h3>Zidong Taichu (紫东太初)</h3><p>Reproduced DFlash and DSpark speculative decoding for Qwen3.5-4B and built a DSpark-capable vLLM runtime. Fixed model loading, hybrid attention and CUDA Graph issues, then benchmarked on GSM8K, HumanEval and MT-Bench on an RTX 4090.</p><ul><li>up to <b>3.03×</b> faster decoding</li></ul></div>`;
  const cardP = document.createElement('aside'); cardP.className = 'paper-card mini-card';
  cardP.innerHTML = `<div class="pc-img"><img src="../assets/showcase/paper-draft.webp" alt="The first page of the paper" loading="lazy"></div><div class="pc-body"><small>First author · submitted to IEEE CSCWD 2027</small><h3>Draft-budget trade-offs in block-parallel speculative decoding: an empirical study</h3><p>How far should the drafter guess? Acceptance, scheduling, latency, throughput and answer quality, measured across draft budgets (later runs on an RTX 5090 at IHEP).</p><div class="pc-btns"><a class="pc-btn" href="../index.html#projects" target="_blank" rel="noopener">Case study <span aria-hidden="true">↗</span></a></div></div>`;
  ctx.$('#scene-ui').append(ctl, cardT, cardP);
  ctl.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => { pick = +b.dataset.q; chatT0 = ctx.time; drawn = ''; score.sfx('pop'); }));
  ctl.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => { task = +b.dataset.t; userBudget = true; score.sfx('chime', { f: 440 + task * 110 }); }));
  const range = ctl.querySelector('input'); range.addEventListener('input', () => { kDraft = +range.value; userBudget = true; score.sfx('tick'); });

  /* ---------- Camera ---------- */
  const cpos = new THREE.Vector3(), cat = new THREE.Vector3(), off = new THREE.Vector3(), turn = new THREE.Vector2(), tmp = new THREE.Vector3();
  const S = (a, b) => [new THREE.Vector3(...a), new THREE.Vector3(...b)];
  function shot(p) {
    const fit = (w, h) => Math.max(w / camera.aspect, h) / (2 * Math.tan(THREE.MathUtils.degToRad(21)));
    const OPEN = S([0, 2.2, 5], [0, 2.2, 0]);
    const WIDE = tall ? S([SC.x, SC.y + 1.9, fit(SW + .8, SH / .55)], [SC.x, SC.y + 1.6, 0]) : S([-1.4, 3.3, fit(18.4, 9)], [-1.4, 3.1, 0]);
    const FAR = S([WIDE[1].x, WIDE[1].y, WIDE[0].z * 2.6], [WIDE[1].x, WIDE[1].y, 0]);
    const seq = [[0, OPEN], [.03, OPEN], [.1, WIDE], [.89, WIDE], [.955, FAR], [1, FAR]];
    let i = 0; while (i < seq.length - 2 && p > seq[i + 1][0]) i++;
    const [pa, A] = seq[i], [pb, B] = seq[i + 1], e = easeInOut(clamp((p - pa) / Math.max(1e-4, pb - pa)));
    cpos.lerpVectors(A[0], B[0], e); cat.lerpVectors(A[1], B[1], e);
  }

  let localP = 0, started = false;
  return {
    id: 'infer', scene, camera, extra: {},
    captions: [
      { at: [.02, .11], html: 'A trained, compressed, deployed model, at work. You ask; it answers <b>one token at a time</b>.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.11, .3], html: 'Each token needs a whole <b>forward pass</b> through every block. That is why long answers take time.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.12, .3], html: '<span class="hint-dot"></span>Pick a question below', x: 50, y: 77, cls: 'hint desk', align: 'center' },
      { at: [.31, .43], html: '<b>Speculative decoding</b>: a small drafter guesses a few tokens ahead; the big model checks them in one pass and keeps the good ones.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.43, .55], html: 'Same answer, far fewer big-model passes. In my work this made answers up to <b>3.03×</b> faster.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.56, .72], html: 'How far should it guess? Too little wastes the drafter; too much, and rejected guesses cost you. My paper measures that trade-off.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.57, .72], html: '<span class="hint-dot"></span>Drag the draft length · switch the task', x: 50, y: 74, cls: 'hint desk', align: 'center' },
      { at: [.73, .88], html: 'I did this at <b>Zidong Taichu</b> in Beijing, inside vLLM, then kept going at IHEP with my own drafter.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.9, 1.05], html: 'And this is happening all over the world, millions of times a second.', x: 50, y: 14, cls: 'note center-note', align: 'center' }
    ],
    resize(aspect) { camera.aspect = aspect; camera.updateProjectionMatrix(); tall = aspect < 1; layout(); },
    init() { this.resize(innerWidth / innerHeight); },
    show(on) { if (!on) { ctl.classList.remove('on'); cardT.classList.remove('on'); cardP.classList.remove('on'); } },
    pointer() {},
    update(p, info) {
      localP = p;
      const t = info.time, act = info.active, dt = info.dt, px = pixelScale(renderer, camera);
      dust.mat.uniforms.uTime.value = t; dust.mat.uniforms.uPx.value = px;
      if (p > .08 && !started && act) { started = true; chatT0 = t; }
      if (p < .05) started = false;

      /* The screen grows out of the cursor, and shrinks back to a point at the end. */
      const grow = easeInOut(clamp((p - .025) / .06)), shrink = easeInOut(clamp((p - .895) / .055)), sc = grow * (1 - shrink * .985);
      screen.scale.set(SW * Math.max(.001, sc), SH * Math.max(.001, sc), 1); frame.scale.set((SW + .1) * Math.max(.001, sc), (SH + .1) * Math.max(.001, sc), 1);
      const cen = new THREE.Vector3(0, 2.2, 0).lerp(SC, grow).lerp(tall ? new THREE.Vector3(SC.x, SC.y + 1.6, 0) : new THREE.Vector3(-1.4, 3.1, 0), shrink); screen.position.copy(cen);   // it shrinks to the centre of the frame: the globe opens on that point frame.position.copy(cen).add(tmp.set(0, 0, -.05));
      screen.material.opacity = sstep(.03, .07, p); frame.userData.set(.5 * sstep(.03, .07, p) * (1 - shrink), 0);
      cursor.position.set(0, 2.2, .05); cursor.material.opacity = (1 - sstep(.03, .06, p)) * (Math.sin(t * 6) > 0 ? 1 : .2);
      glow.position.copy(cen); glow.scale.setScalar(1.2 + shrink * 1.5); glow.material.opacity = shrink * .9;

      /* What the screen shows. */
      let pulseA = false, pulseB = false, draft = false;
      if (p < .31) { const n = drawChat(t); pulseA = n > 0 && n < ans().length && ((t - chatT0) % T_PASS) < T_PASS * .6; }
      else if (p < .56) { if (raceT0 < 0 || p < .315) raceT0 = raceT0 < 0 ? t : raceT0; drawRace(t); pulseA = lastRace.pulseA; pulseB = lastRace.pulseB; draft = lastRace.draft; }
      else if (p < .73) { if (!userBudget) { const want = 2 + Math.round(clamp((p - .58) / .12) * 8); if (want !== kDraft) { kDraft = want; range.value = String(want); } } ctl.querySelector('.ic-k').textContent = kDraft; drawBudget(); }
      else { if (raceT0 < 0) raceT0 = t; drawRace(t); pulseA = lastRace.pulseA; pulseB = lastRace.pulseB; draft = lastRace.draft; }
      if (p < .3) raceT0 = -1;

      /* The stacks: the big model pulses once per pass; the drafter flickers while it guesses. */
      const stackO = sstep(.07, .12, p) * (1 - shrink) * (tall ? 0 : 1), drO = sstep(.3, .35, p) * (1 - sstep(.56, .6, p) * (p < .73 ? 1 : 0)) * (1 - shrink);
      big.forEach((s, j) => s.userData.set(.5 * stackO, pulseA || pulseB ? .6 : 0));
      drafter.forEach(s => s.userData.set(.5 * Math.max(drO, p > .73 ? stackO : 0) * (tall ? 0 : 1), draft ? .8 : 0));
      bigPulse.position.copy(BIG0).add(tmp.set(0, ((t * 6) % 1) * 2.2, .5)); bigPulse.material.opacity = (pulseA || pulseB) ? .6 * stackO : 0;
      drPulse.position.copy(DR0).add(tmp.set(0, ((t * 9) % 1) * 1, .4)); drPulse.material.opacity = draft ? .7 : 0;

      /* Words in the world and on the page. */
      ctl.classList.toggle('on', act && ((p > .1 && p < .3) || (p > .56 && p < .72)));
      ctl.classList.toggle('budget', p > .5);
      ctl.querySelectorAll('[data-q]').forEach((b, i) => b.classList.toggle('sel', i === pick));
      ctl.querySelectorAll('[data-t]').forEach((b, i) => b.classList.toggle('sel', i === task));
      cardT.classList.toggle('on', act && p > .74 && p < .81);
      cardP.classList.toggle('on', act && p > .81 && p < .885);

      /* Camera. */
      shot(p);
      const want = pointer.inside && !coarse ? pointer.ndc : null;
      turn.x += ((want ? want.x : 0) - turn.x) * Math.min(1, dt * 2); turn.y += ((want ? want.y : 0) - turn.y) * Math.min(1, dt * 2);
      off.subVectors(cpos, cat).applyAxisAngle(new THREE.Vector3(0, 1, 0), -turn.x * .04); off.y += turn.y * .25;
      camera.position.copy(cat).add(off); camera.lookAt(cat);
    }
  };
}
