/* Forward Pass: the conductor. Boots the stage, the score and the scenes, maps scrolling onto one continuous
   timeline, hands pointer input to whichever scene is on screen, and runs the interface around the film. */
import * as THREE from 'three';
import { Stage } from './core/stage.js';
import { UI } from './core/ui.js';
import { Score } from './core/audio.js';
import { clamp, lerp } from './core/util.js';
import genesis from './scenes/genesis.js';
import neuron from './scenes/neuron.js';
import data from './scenes/data.js';
import tokenizer from './scenes/tokenizer.js';
import transformer from './scenes/transformer.js';
import forward from './scenes/forward.js';
import training from './scenes/training.js';
import tuning from './scenes/tuning.js';
import overfit from './scenes/overfit.js';
import compress from './scenes/compress.js';
import autodeploy from './scenes/autodeploy.js';
import race from './scenes/race.js';
import fpga from './scenes/fpga.js';
import silicon from './scenes/silicon.js';
import inference from './scenes/inference.js';
import globe from './scenes/globe.js';
import curiosity from './scenes/curiosity.js';
import create from './scenes/create.js';
import finale from './scenes/finale.js';

const root = document.documentElement;
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const params = new URLSearchParams(location.search);
const coarse = matchMedia('(pointer: coarse)').matches;
const small = coarse || Math.min(innerWidth, innerHeight) < 700;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- No WebGL: offer the summary and the classic site instead of a broken film ---------- */
const probe = document.createElement('canvas');
if (!probe.getContext('webgl2')) {
  root.classList.add('no-gl');
  $('#summary').showModal ? $('#summary').showModal() : $('#summary').setAttribute('open', '');
  throw new Error('WebGL2 unavailable');
}

/* ---------- The acts, their colour grades and the scenes in each ---------- */
const C = (r, g, b) => new THREE.Color(r, g, b);
const ACTS = [
  { name: 'Spark', look: { tint: C(1.0, .97, 1.04), shadow: C(.1, .05, .18), sat: 1.1, vig: .72, grain: .05, aberr: .12, bloom: .8, threshold: .74, exposure: 1 } },
  { name: 'Data', look: { tint: C(.88, 1.0, 1.18), shadow: C(.04, .16, .5), sat: 1.06, vig: .66, grain: .05, aberr: .22, bloom: .75, threshold: .76, exposure: 1.02 } },
  { name: 'Architecture', look: { tint: C(.92, 1.04, 1.0), shadow: C(.02, .16, .13), sat: 1.06, vig: .7, grain: .045, aberr: .14, bloom: .8, threshold: .72, exposure: 1.02 } }, { name: 'Training', look: { tint: C(1.04, .99, .95), shadow: C(.12, .06, .03), sat: 1.08, vig: .72, grain: .045, aberr: .14, bloom: .85, threshold: .72, exposure: 1.02 } }, { name: 'Optimise', look: { tint: C(.94, 1.0, 1.08), shadow: C(.02, .08, .15), sat: 1.04, vig: .7, grain: .045, aberr: .12, bloom: .8, threshold: .74, exposure: 1.02 } }, { name: 'Deploy', look: { tint: C(.97, .97, 1.08), shadow: C(.06, .03, .16), sat: 1.08, vig: .72, grain: .045, aberr: .14, bloom: .85, threshold: .72, exposure: 1.02 } }, { name: 'Inference', look: { tint: C(.98, 1.0, 1.07), shadow: C(.06, .03, .15), sat: 1.07, vig: .72, grain: .045, aberr: .14, bloom: .85, threshold: .72, exposure: 1.02 } }, { name: 'Generate', look: { tint: C(1.06, .98, .95), shadow: C(.14, .05, .08), sat: 1.1, vig: .7, grain: .045, aberr: .12, bloom: .85, threshold: .72, exposure: 1.02 } }
];
// Each entry: a scene, how many screens of scrolling it lasts, its act, and how it hands over to the next.
const PLAN = [
  { make: genesis, dur: 9, act: 0, trans: { type: 'dive', len: 1.1 } },
  { make: neuron, dur: 9, act: 0, trans: { type: 'pull', len: 1.3 } },
  { make: data, dur: 8.5, act: 1, trans: { type: 'fade', len: .7 } },   // a match cut: both scenes frame the same gate
  { make: tokenizer, dur: 12, act: 1, trans: { type: 'fade', len: 1.2 } },   // a match cut: the transformer opens in the same space of meaning
  { make: transformer, dur: 20, act: 2, trans: { type: 'pull', len: 1 } },
  { make: forward, dur: 12.5, act: 2, trans: { type: 'fade', len: 1.1 } },   // the model shrinks into the corner of the loss landscape
  { make: training, dur: 21, act: 3, trans: { type: 'fade', len: 1 } },   // a match cut: overfitting opens on the same board
  { make: overfit, dur: 14, act: 3, trans: { type: 'fade', len: 1 } },   // a match cut: tuning opens on the same loss chart
  { make: tuning, dur: 19.5, act: 3, trans: { type: 'fade', len: 1.1 } },   // a match cut: the model above the detector
  { make: compress, dur: 27, act: 4, trans: { type: 'fade', len: 1 } },   // a match cut: the recipes fold back into the model
  { make: autodeploy, dur: 25, act: 4, trans: { type: 'fade', len: 1 } },   // a match cut: the package glides on into the race
  { make: race, dur: 22, act: 5, trans: { type: 'dive', len: 1.1 } },   // into the FPGA
  { make: fpga, dur: 19, act: 5, trans: { type: 'dive', len: 1.1 } },   // into one cell
  { make: silicon, dur: 25, act: 5, trans: { type: 'fade', len: 1 } },   // a match cut: the cursor
  { make: inference, dur: 27, act: 6, trans: { type: 'fade', len: 1 } },   // a match cut: the point of light is Beijing
  { make: globe, dur: 16, act: 6, trans: { type: 'dive', len: 1.1 } },   // down into Beijing, to his desk
  { make: curiosity, dur: 25, act: 6, trans: { type: 'fade', len: 1 } },   // a match cut: the brain
  { make: create, dur: 30, act: 7, trans: { type: 'pull', len: 1.2 } },   // everything falls back into the whole film
  { make: finale, dur: 24, act: 7 }
];
let s0 = 0;
PLAN.forEach((p, i) => { p.start = s0; p.end = s0 + p.dur; s0 = p.end - (p.trans ? p.trans.len : 0); p.index = i; });
const TOTAL = PLAN[PLAN.length - 1].end;
const actRange = ACTS.map((a, i) => { const ps = PLAN.filter(p => p.act === i); return ps.length ? [ps[0].start, ps[ps.length - 1].end] : null; });

function timeline(s) {
  for (let i = 0; i < PLAN.length; i++) {
    const p = PLAN[i], n = PLAN[i + 1];
    if (n && s >= n.start && s < p.end) return { A: p, B: n, t: (s - n.start) / (p.end - n.start), type: p.trans.type };
    if (s < p.end || !n) return { A: p, B: null, t: 0, type: 'dissolve' };
  }
  return { A: PLAN[PLAN.length - 1], B: null, t: 0 };
}

/* ---------- Boot ---------- */
const stage = new Stage($('#gl'), { small });
const ui = new UI();
const score = new Score();
const pointer = { ndc: new THREE.Vector2(9, 9), x: -1, y: -1, down: false, inside: false, moved: 0 };
const ctx = { THREE, stage, renderer: stage.renderer, ui, score, small, coarse, reduced, pointer, intro: { state: 'loading', at: 0 }, time: 0, $, plan: PLAN };

const loaderN = $('#loader-n');
let built = 0, shown = 0;
const FIRST = params.has('at') ? PLAN.length : 4;   // scenes needed before the title; the rest build in the background
const scenes = [];
async function build() {
  for (const p of PLAN) {
    const sc = p.make(ctx);
    p.sc = sc; scenes.push(sc);
    if (sc.init) await sc.init();
    if (sc.captions) ui.captions(sc.id, sc.captions);
    built++;
    await new Promise(r => setTimeout(r, built < FIRST ? 0 : 24));
  }
}
const ready = build();

let loaderLast = performance.now();
const tickLoader = () => {
  // Counts in real time (not per frame), so slow machines aren't left waiting on the counter.
  const now = performance.now(), dt = Math.min(.25, (now - loaderLast) / 1000); loaderLast = now;
  const target = (Math.min(built, FIRST) / FIRST) * 100;
  shown = reduced ? target : Math.min(target, shown + dt * 120);
  loaderN.textContent = String(Math.floor(shown)).padStart(3, '0');
  if (shown < 99.5) requestAnimationFrame(tickLoader);
  else { loaderN.textContent = '100'; showTitle(); }
};
requestAnimationFrame(tickLoader);

function showTitle() {
  ctx.intro.state = 'title'; ctx.intro.at = ctx.time;
  root.classList.add('titled');
  if (params.has('at')) setTimeout(() => enter(false), 50);
}

/* ---------- Enter ---------- */
let lenis = null, entered = false;
function enter(withSound) {
  if (entered || ctx.intro.state !== 'title') return; entered = true;
  if (withSound) { score.start(); score.sfx('enter'); }
  setSoundUI();
  ctx.intro.state = 'entering'; ctx.intro.at = ctx.time;
  root.classList.add('entered'); root.classList.remove('locked');
  $('#scroller').style.height = `${(TOTAL + 1) * innerHeight}px`;
  if (!reduced && !coarse && window.Lenis) lenis = new window.Lenis({ lerp: .085, smoothWheel: true, wheelMultiplier: .9 });
  const at = parseFloat(params.get('at'));
  if (!isNaN(at)) { scrollTo(0, at * innerHeight); if (lenis) lenis.scrollTo(at * innerHeight, { immediate: true }); ctx.intro.at = -99; }
  setTimeout(() => { $('#intro').setAttribute('hidden', ''); }, 1600);
  setAuto(!params.has('at'), 'start'); auto.seekUntil = ctx.time + 2.4;   // plays by itself once the title has gone; deep links start paused
  setTimeout(() => { if (auto.on) showTip('Playing · scroll anytime to take over', 5000); }, 1900);
}
$('#enter-sound').addEventListener('click', () => enter(true));
$('#enter-quiet').addEventListener('click', () => enter(false));

/* ---------- Interface around the film ---------- */
const sndBtn = $('#snd');
function setSoundUI() { const on = score.on && !score.muted; sndBtn.classList.toggle('on', on); sndBtn.setAttribute('aria-pressed', String(on)); sndBtn.setAttribute('aria-label', on ? 'Sound on. Click to mute' : 'Sound off. Click to turn on'); }
sndBtn.addEventListener('click', () => {
  if (!score.ctx) score.start(); else score.setMuted(!score.muted);
  try { localStorage.setItem('fp-sound', score.muted ? '0' : '1'); } catch (e) { /* private mode */ }
  setSoundUI();
});
const summary = $('#summary');
$('#skip').addEventListener('click', () => { takeOver(); summary.showModal(); root.classList.add('dialog-open'); });
// The roles he fits, each with proof inside the film: a jump to the scene, or a note where that act is still being built.
const ROLES = [
  { k: 'llm', name: 'LLM inference', pitch: 'At Zidong Taichu I built a DSpark-capable vLLM runtime and fixed model-loading, hybrid-attention and CUDA Graph issues. Speculative decoding made answers up to <b>3.03×</b> faster.',
    proofs: [['infer', .2, 'Act VII', 'One token per forward pass'], ['infer', .42, 'Act VII', 'Speculative decoding, raced'], ['infer', .64, 'Act VII', 'How far to draft: my paper’s question'], ['infer', .77, 'Act VII', 'My internship at Zidong Taichu'], ['arch', .93, 'Act III', 'My 3-layer DFlash drafter, drawn as built'], ['cur', .22, 'Act VII', 'Curiosity: my local LLM stack']],
    soon: [], more: ['../index.html#projects', 'Speculative decoding case study'] },
  { k: 'opt', name: 'Model optimisation', pitch: 'Quantization, pruning, TensorRT, ONNX and hls4ml. Particle Transformer <b>10.4×</b> faster on a GPU, and <b>8.17 → 1.02 MB</b> for under 0.7 points of accuracy.',
    proofs: [['comp', .22, 'Act V', 'Pruning: half the weights gone, 93.9% kept'], ['comp', .37, 'Act V', 'Pruning layer by layer, from my sensitivity scans'], ['comp', .56, 'Act V', 'Quantization: 8.17 → 1.02 MB at 4 bits'], ['comp', .79, 'Act V', 'Compiling with TensorRT: 3.80 → 0.82 ms'], ['fpga', .3, 'Act VI', 'Inside the FPGA: attention as a circuit'], ['fpga', .74, 'Act VI', 'ParticleNet: 5× faster, a quarter of the power'], ['race', .55, 'Act VI', 'Why FP16 beat 8-bit on the V100']],
    soon: [], more: ['../index.html#projects', 'Transformers on FPGAs case study'] },
  { k: 'infra', name: 'AI infrastructure', pitch: 'I built AutoDeploy, about 200k lines of Python: a parser, a Neo4j knowledge graph, a recommendation engine and a sandboxed orchestrator that take one model across CPUs, GPUs and FPGAs, about <b>63×</b> faster.',
    proofs: [['auto', .05, 'Act V', 'AutoDeploy, my master’s thesis'], ['auto', .2, 'Act V', 'Reading the model: 13 checks, one contract'], ['auto', .4, 'Act V', 'Its knowledge graph, from my Neo4j database'], ['auto', .63, 'Act V', 'Planning: four planners, one board'], ['auto', .84, 'Act V', 'Running, checking, repairing'], ['race', .3, 'Act VI', 'The race on three real chips'], ['race', .86, 'Act VI', 'Three weeks by hand → eight hours'], ['chip', .88, 'Act VI', 'MCG: storage across data centres']],
    soon: [], more: ['../index.html#autodeploy', 'AutoDeploy case study'] },
  { k: 'res', name: 'ML research', pitch: 'Six papers, three as first author. Bayesian optimisation of triggerless GRB detection for LHAASO-WCDA reached <b>11.5σ</b> on GRB 221009A. Also graph learning (HGT, TGN) and RL.',
    proofs: [['tune', .3, 'Act IV', 'Bayesian optimisation, live'], ['tune', .7, 'Act IV', 'LHAASO-WCDA and GRB 221009A'], ['tune', .9, 'Act IV', 'The paper'], ['auto', .4, 'Act V', 'Graph learning in AutoDeploy (HGT, TGN)'], ['infer', .85, 'Act VII', 'The draft-budget paper'], ['cur', .64, 'Act VII', 'Curiosity: memory and world models'], ['globe', .45, 'Act VII', 'Where I have presented']],
    soon: [], more: ['../index.html#publications', 'All papers and talks'] }
];
const rolesEl = $('#roles'), chipsEl = rolesEl.querySelector('.roles-chips'), panelEl = rolesEl.querySelector('.roles-panel');
chipsEl.innerHTML = ROLES.map((r, i) => `<button type="button" role="tab" data-r="${r.k}" aria-selected="${i === 0}">${r.name}</button>`).join('');
function showRole(k) {
  const r = ROLES.find(x => x.k === k);
  chipsEl.querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.r === k)));
  panelEl.innerHTML = `<p class="rp-pitch">${r.pitch}</p><p class="rp-k">See it in the film</p><ul class="rp-proofs">${
    r.proofs.map(([id, p, act, t]) => `<li><button type="button" data-go="${id}:${p}"><span>${act}</span>${t}<i aria-hidden="true">→</i></button></li>`).join('')}${
    r.soon.map(([act, t]) => `<li class="soon"><div><span>${act}</span>${t}<em>being built</em></div></li>`).join('')}</ul><a class="rp-more" href="${r.more[0]}" target="_blank" rel="noopener">${r.more[1]} ↗</a>`;
}
chipsEl.addEventListener('click', e => { const b = e.target.closest('button'); if (b) { showRole(b.dataset.r); score.sfx('hover'); } });
panelEl.addEventListener('click', e => {
  const b = e.target.closest('[data-go]'); if (!b) return;
  const [id, p] = b.dataset.go.split(':'), P = PLAN.find(x => x.sc && x.sc.id === id); if (!P) return;
  summary.close();
  const jump = () => go(P.start + P.dur * parseFloat(p));
  if (!entered) { enter(false); setTimeout(jump, 400); } else jump();
});
showRole(ROLES[0].k);
ctx.roles = ROLES;
ctx.jump = (id, p) => { const P = PLAN.find(x => x.sc && x.sc.id === id); if (P) go(P.start + P.dur * p); };
summary.addEventListener('close', () => root.classList.remove('dialog-open'));
summary.addEventListener('click', e => { if (e.target === summary) summary.close(); });
$$('[data-close]').forEach(b => b.addEventListener('click', () => summary.close()));

// Progress line: one mark per act. Acts not built yet are shown dim.
const actsNav = $('#acts');
ACTS.forEach((a, i) => {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'act' + (actRange[i] ? '' : ' soon');
  b.innerHTML = `<i></i><span>${['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'][i]} · ${a.name}${actRange[i] ? '' : ' · soon'}</span>`;
  if (actRange[i]) b.addEventListener('click', () => go(actRange[i][0] + (i === 0 ? 0 : .6)));
  else b.disabled = true;
  actsNav.append(b);
});
const actEls = [...actsNav.children];

/* ---------- The player: the film plays itself, paced by its words; any real scroll hands control back ---------- */
actsNav.setAttribute('aria-label', 'Film player: play, next scene and the eight acts');
const player = document.createElement('div'); player.className = 'player';
player.innerHTML = `<button type="button" class="pl-play" aria-label="Play the film" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="i-play" d="M8 5.5v13l11-6.5z"/><g class="i-pause"><rect x="6.5" y="5.5" width="4" height="13" rx="1"/><rect x="13.5" y="5.5" width="4" height="13" rx="1"/></g></svg></button><button type="button" class="pl-next" aria-label="Next scene" title="Next scene (→)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 6v12l8.5-6z"/><rect x="15.5" y="6" width="2.6" height="12" rx="1"/></svg></button><span class="pl-time" aria-hidden="true"></span><span class="pl-tip" role="status"></span>`;
actsNav.prepend(player);
const playBtn = player.querySelector('.pl-play'), nextBtn = player.querySelector('.pl-next'), timeEl = player.querySelector('.pl-time'), tip = player.querySelector('.pl-tip');
const auto = { on: false, y: 0, set: 0, v: 0, seekUntil: 0 };
const FIN = PLAN[PLAN.length - 1], END_AT = FIN.start + FIN.dur * .9;   // it stops by itself on the finale's last prompt
const PHONE = innerWidth < 760;
// Pacing. Every caption on screen gets time to be read (1.3 s plus 0.3 s a word); camera moves with no words go quicker.
const countWords = html => html.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
const readTime = c => Math.min(10, 1.3 + .3 * countWords(c.html));
const V_MOVE = .9, V_TRANS = 1.05, V_MIN = .1;   // screens per second: camera moves, hand-overs, the slowest reading pace
const SPEED = 1.6;   // overall pace: 1 is the subtitle reading rate; raise it to play faster
// Cards and rolls that are not captions, with the seconds they need: [from, to, seconds] in the scene's progress.
const READ = new Map([
  [tuning, [[.87, .92, 8]]], [compress, [[.355, .425, 5]]], [autodeploy, [[.88, .92, 8]]], [fpga, [[.81, .94, 6]]],
  [silicon, [[.47, .57, 5], [.86, .915, 5]]], [inference, [[.74, .81, 5], [.81, .885, 6]]], [curiosity, [[.26, .35, 5]]],
  [finale, [[.14, .46, 14], [.46, .87, 32]]]
]);
function wordPace(s, live) {
  const tl = timeline(s), P = tl.B && tl.t > .5 ? tl.B : tl.A; if (!P.sc) return V_MOVE;
  const prev = PLAN[P.index - 1], local = (s - P.start) / P.dur;
  // The words of a scene show only while it is the main one: from halfway into its hand-in to halfway into its hand-out.
  const lo = prev ? prev.trans.len / 2 / P.dur : 0, hi = P.trans ? 1 - P.trans.len / 2 / P.dur : 1;
  let v = tl.B ? V_TRANS : V_MOVE;
  const limit = (a, b, sec) => { if (local < a || local > b) return; const span = Math.max(.2, (Math.min(b, hi) - Math.max(a, lo)) * P.dur); v = Math.min(v, span / sec); };
  (ui.sets.get(P.sc.id) || []).forEach(o => {
    const c = o.c, cls = c.cls || '';
    if (/\bhint\b/.test(cls) || (PHONE && /\bdesk\b/.test(cls)) || (live && c.when && !c.when())) return;
    limit(c.at[0], c.at[1], readTime(c));
  });
  (READ.get(P.make) || []).forEach(r => limit(r[0], r[1], r[2]));
  return Math.max(V_MIN, v);
}
const paceAt = (s, live = true) => SPEED * Math.min(wordPace(s, live), wordPace(s + .35, live));   // brake before the words arrive
// Timecode: how long the film takes when it plays itself, from the start to here.
let TT = null; const TSTEP = .05;
ready.then(() => { const n = Math.ceil(END_AT / TSTEP) + 1; TT = new Float32Array(n); for (let i = 1; i < n; i++) TT[i] = TT[i - 1] + TSTEP / paceAt((i - .5) * TSTEP, false); });
const timeAt = s => TT ? TT[Math.min(TT.length - 1, Math.max(0, Math.round(s / TSTEP)))] : 0;
const clock = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
let tipTimer = 0;
function showTip(text, ms = 3600) { tip.textContent = text; player.classList.add('tip'); clearTimeout(tipTimer); tipTimer = setTimeout(() => player.classList.remove('tip'), ms); }
function setAuto(on, why) {
  if (on && why === 'start' && reduced) on = false;
  auto.on = on; auto.y = auto.set = scrollY; if (on) auto.v = 0;
  root.classList.toggle('autoplay', on);
  playBtn.setAttribute('aria-pressed', String(on)); playBtn.setAttribute('aria-label', on ? 'Pause the film' : 'Play the film'); playBtn.title = on ? 'Pause (Space)' : 'Play (Space)';
  if (why === 'user') showTip('Paused · press play to continue');
  else if (why === 'end') showTip('The end · press play to watch again');
}
function takeOver() { if (auto.on) setAuto(false, 'user'); }
function togglePlay() {
  if (!entered) return;
  if (!auto.on && scrollY / innerHeight >= END_AT - .05) go(0);   // at the end, play starts the film again
  setAuto(!auto.on, 'button'); score.sfx(auto.on ? 'chime' : 'hover', { f: 520 });
}
playBtn.addEventListener('click', togglePlay);
// Previous / next scene: to the moment a scene has fully arrived (just past its hand-over).
const settled = i => (i > 0 ? PLAN[i - 1].end + .05 : 0);
function stepScene(dir) {
  if (!entered) return;
  const s = scrollY / innerHeight, tl = timeline(s), i = (tl.B && tl.t > .5 ? tl.B : tl.A).index;
  const target = dir > 0 ? (PLAN[i + 1] ? settled(i + 1) : END_AT) : (s - settled(i) > .6 ? settled(i) : settled(Math.max(0, i - 1)));
  go(target); score.sfx('whoosh', { up: dir > 0, dur: .7 });
}
nextBtn.addEventListener('click', () => stepScene(1));
// Strict about who is in control: a wheel, a touch, a click in the film, the keyboard's scroll keys, the Hiring? card,
// a scrollbar drag or a hidden tab all pause it. Only the play button or Space starts it again.
addEventListener('wheel', takeOver, { passive: true });
addEventListener('touchmove', takeOver, { passive: true });
addEventListener('pointerdown', e => { if (e.target.closest && e.target.closest('.acts, .hud, #intro, dialog')) return; takeOver(); }, true);
document.addEventListener('visibilitychange', () => { if (document.hidden) takeOver(); });
addEventListener('keydown', e => {
  if (!entered || summary.open || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;
  if (e.code === 'Space') {
    if (e.target === playBtn) return;   // the button's own click handles it
    e.preventDefault(); if (e.target.blur) e.target.blur(); togglePlay(); return;
  }
  if (e.key === 'ArrowRight') { e.preventDefault(); stepScene(1); return; }
  if (e.key === 'ArrowLeft') { e.preventDefault(); stepScene(-1); return; }
  if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key)) takeOver();
});
addEventListener('resize', () => { auto.y = auto.set = scrollY; });
// Called every frame: move the film forward at the pace of its words.
function autoplay(dt) {
  if (!auto.on || !entered || summary.open) return;
  if (ctx.time < auto.seekUntil) { auto.y = auto.set = scrollY; return; }   // a jump is still landing
  if (Math.abs(scrollY - auto.set) > 48) { takeOver(); return; }   // something else moved the page
  const s0 = auto.y / innerHeight;
  if (s0 >= END_AT) { setAuto(false, 'end'); return; }
  const want = paceAt(s0);
  auto.v += (want - auto.v) * (1 - Math.exp(-dt * (want < auto.v ? 5 : 1.6)));   // brake quickly, set off gently
  auto.y += auto.v * dt * innerHeight;
  const y = Math.round(auto.y); auto.set = y;
  if (lenis) lenis.scrollTo(y, { immediate: true, force: true }); else scrollTo(0, y);
}
let timeShown = '';
function go(units) {
  const y = units * innerHeight;
  auto.seekUntil = ctx.time + 2.4;   // a jump keeps the play state; autoplay carries on from where it lands
  if (lenis) lenis.scrollTo(y, { duration: 2.2 }); else scrollTo({ top: y, behavior: reduced ? 'auto' : 'smooth' });
}
ctx.go = go;

/* ---------- Pointer: always delivered to the scene that fills the screen ---------- */
let primary = null;
const toNdc = e => { pointer.x = e.clientX; pointer.y = e.clientY; pointer.ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); };
const blocked = e => e.target.closest && e.target.closest('button, a, input, dialog, .hud, .acts, .scene-ui *');
addEventListener('pointermove', e => { toNdc(e); pointer.inside = true; pointer.moved = ctx.time; if (primary && primary.pointer && entered) primary.pointer('move', e); }, { passive: true });
addEventListener('pointerdown', e => { if (blocked(e)) return; toNdc(e); pointer.down = true; if (primary && primary.pointer && entered) primary.pointer('down', e); });
addEventListener('pointerup', e => { pointer.down = false; if (primary && primary.pointer && entered) primary.pointer('up', e); });
document.addEventListener('pointerleave', () => { pointer.inside = false; pointer.ndc.set(9, 9); });

addEventListener('resize', () => {
  stage.resize(); scenes.forEach(sc => sc.resize && sc.resize(stage.aspect));
  if (entered) $('#scroller').style.height = `${(TOTAL + 1) * innerHeight}px`;
});

/* ---------- The loop ---------- */
let last = performance.now(), sSmooth = 0, lastS = 0, speed = 0, lastAct = -1, shownA = null, shownB = null, whooshedAt = -1;
let fpsN = 0, fpsT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  fpsN++; fpsT += dt; if (fpsT > 1) { window.__fps = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0; }
  ctx.time += dt; ctx.dt = dt;
  if (lenis) lenis.raf(now);
  if (!built) return;
  autoplay(dt);
  const s = entered ? clamp(scrollY / innerHeight, 0, TOTAL) : 0;
  sSmooth = s;
  speed = lerp(speed, (s - lastS) / Math.max(dt, 1e-3), .12); lastS = s;
  ctx.s = s; ctx.speed = speed;
  const tl = timeline(s);
  const A = tl.A, B = tl.B;
  primary = (B && tl.t > .5 ? B : A).sc || null;
  // Update the scenes that are on screen, and hide the words of those that are not.
  for (const p of PLAN) {
    if (!p.sc) continue;
    const on = p === A || p === B;
    if (on) {
      const local = (s - p.start) / p.dur;
      p.sc.update(local, { active: p.sc === primary, weight: p === A ? 1 - tl.t : tl.t, dt, time: ctx.time });
      ui.syncCaptions(p.sc.id, local, p.sc === primary && entered);
    } else { ui.syncCaptions(p.sc.id, -1, false); ui.hideLabels(p.sc.id); }
    if (p.sc.visible !== on && p.sc.show) { p.sc.visible = on; p.sc.show(on); }
  }
  // Colour grade and score follow the act.
  const act = (B && tl.t > .5 ? B : A).act;
  stage.setLook(ACTS[act].look, 1 - Math.pow(.04, dt));
  if (act !== lastAct) { lastAct = act; score.setAct(act); }
  score.update(ctx.time, speed);
  if (B && tl.t > .05 && tl.t < .5 && whooshedAt !== A.index) { whooshedAt = A.index; score.sfx('whoosh', { up: speed >= 0, dur: 1.1 }); }
  if (!B) whooshedAt = -1;
  // Progress line.
  actEls.forEach((el, i) => {
    const r = actRange[i]; if (!r) return;
    const f = clamp((s - r[0]) / (r[1] - r[0]));
    el.style.setProperty('--f', f.toFixed(3));
    el.classList.toggle('on', s >= r[0] && s < r[1]); el.classList.toggle('done', s >= r[1]);
  });
  root.style.setProperty('--hint', entered ? String(clamp(1 - s * 3)) : '0');
  if (TT) { const tc = `${clock(timeAt(Math.min(s, END_AT)))} / ${clock(timeAt(END_AT))}`; if (tc !== timeShown) { timeShown = tc; timeEl.textContent = tc; } }
  const sa = A.sc, sb = B && B.sc ? B.sc : null;
  if (!sa) return;   // still building this far ahead
  stage.render({ scene: sa.scene, camera: sa.camera }, sb ? { scene: sb.scene, camera: sb.camera } : null, tl.t, tl.type, ctx.time,
    { aberr: Math.min(1.2, Math.abs(speed) * .5) + (sa.extra ? sa.extra.aberr || 0 : 0), bloom: (sa.extra ? sa.extra.bloom || 0 : 0), bars: sa.extra ? sa.extra.bars || 0 : 0, fade: sa.extra ? sa.extra.fade || 0 : 0 });
  shownA = A; shownB = B;
}
requestAnimationFrame(frame);
try { if (localStorage.getItem('fp-sound') === '1') $('#enter-sound').classList.add('pref'); } catch (e) { /* ignore */ }
window.__fp = { ctx, PLAN, TOTAL, timeline, go, paceAt, auto, setAuto, togglePlay, stepScene, END_AT, timeAt };
