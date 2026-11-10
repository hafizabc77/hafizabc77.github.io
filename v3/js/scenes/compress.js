/* Act V, scene 12: making the model small and fast.
   It opens on the last frame of Act IV: the trained model, six glass blocks, hanging above the detector. Two numbers
   show the gap (3.80 ms per answer; a hardware trigger has 12.5 µs). Then three tricks, each told simply and then with
   Hafiz's own measurements on the Particle Transformer:
   pruning (the weights of one matrix as glass columns; the tiny ones fall away; drag to prune yourself; then five layer
   groups, cut the same or layer by layer, as his sensitivity scans did), quantization (fewer bits per weight: the columns
   snap onto fewer levels, the digits drop away; 32 → 8 → 4 → 2 bits), and compiling (small kernels fuse into big ones and
   the timeline of one answer shrinks, 3.80 → 0.82 ms). It ends on the real problem: which trick, tool and chip? The
   choices branch into thousands of recipes, which is where AutoDeploy begins. */
import * as THREE from 'three';
import { additive, POINT_FRAG, col, rng, gaussian, sstep, clamp, lerp, easeInOut, pixelScale, glowTexture, window4 } from '../core/util.js';
import { cells, slab, floor, motes } from '../core/glass.js';

/* The model as it hangs above the detector at the end of Act IV (shared with that scene). */
export const NB = 6;
export const MODEL = { y0: 4, gap: .56, w: 4.2, h: .42, d: 1.1 };
export const blockY = j => MODEL.y0 + (j - (NB - 1) / 2) * MODEL.gap;
export const MODEL_SHOT = { up: .6, back: 9.5 };   // camera offset from the model's centre in both scenes

/* The recipes: chip → precision → tool → settings, then a cloud of thousands. Seeded, shared with AutoDeploy's opening. */
let TREE = null;
export function recipeTree() {
  if (TREE) return TREE;
  const r = rng(777), top = blockY(NB - 1) + MODEL.h / 2 + .25;
  const fan = [4, 4, 3, 5], span = [8.5, 13.5, 17.5, 20.5], yl = [top, top + 1.5, top + 3, top + 4.4, top + 5.7];
  const nodes = [{ p: new THREE.Vector3(0, top, 0), l: 0, par: -1, k: 0 }];
  let prev = [0];
  for (let l = 1; l <= 4; l++) {
    const kids = []; prev.forEach(pi => { for (let k = 0; k < fan[l - 1]; k++) kids.push([pi, k]); });
    const ids = [];
    kids.forEach(([pi, k], idx) => { const x = (idx / (kids.length - 1) - .5) * span[l - 1]; ids.push(nodes.length); nodes.push({ p: new THREE.Vector3(x + (r() - .5) * .12 * l, yl[l] + (r() - .5) * .3 * (l - 1), (r() - .5) * .8 * l), l, par: pi, k }); });
    prev = ids;
  }
  const leaves = prev, cloud = [];
  for (let i = 0; i < 2600; i++) { const lf = nodes[leaves[Math.floor(r() * leaves.length)]].p; cloud.push(new THREE.Vector3(lf.x + gaussian(r) * .5, lf.y + .5 + Math.abs(gaussian(r)) * 1.1, lf.z + gaussian(r) * .9)); }
  TREE = { nodes, leaves, cloud, top };
  return TREE;
}

/* His measurements (Particle Transformer, thesis): quantization by bit width, pruning, compiling. */
const BITS = [32, 8, 4, 2], SIZE = [8.17, 2.04, 1.02, .51], ACC = [93.998, 93.986, 93.352, 64.687];
const LAYERS = [
  { name: 'Embedding', sub: 'input projection', cut: .15, tol: .1 },
  { name: 'Attention Q/K/V', sub: 'blocks 1–3', cut: .3, tol: .22 },
  { name: 'Attention out', sub: 'blocks 1–3', cut: .4, tol: .32 },
  { name: 'Feed-forward', sub: 'blocks 1–3', cut: .6, tol: .6 },
  { name: 'Feed-forward', sub: 'blocks 4–8, deep', cut: .75, tol: .78 }
];
const OPW = [.35, .9, .2, .35, .7, .22, .7, .2];   // one block's steps: norm, attention, add, norm, linear, activation, linear, add
const fmtT = ms => ms >= 1 ? `${ms.toFixed(2)} ms` : `${ms.toFixed(2)} ms`;

export default function compress(ctx) {
  const { small, ui, score, pointer, renderer, coarse } = ctx;
  const scene = new THREE.Scene();
  scene.background = col('#04070c');
  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, .05, 400);
  const r = rng(5101);
  let tall = false;
  const geoOf = attrs => { const g = new THREE.BufferGeometry(); Object.entries(attrs).forEach(([k, [arr, n]]) => g.setAttribute(k, new THREE.Float32BufferAttribute(arr, n))); return g; };
  scene.add(floor(-.06, '#4fb6d8'));
  const dust = motes(small ? 160 : 380, [50, 16, 40], '#9fdcff'); scene.add(dust.pts);

  /* ---------- The model: six glass blocks ---------- */
  const MC = new THREE.Vector3(0, MODEL.y0, 0);
  const blocks = Array.from({ length: NB }, (_, j) => { const s = slab(MODEL.w, MODEL.h, MODEL.d); s.position.set(0, blockY(j), 0); scene.add(s); return s; });

  /* ---------- One weight matrix: a glass column per number ---------- */
  const MN = 24, MS = .32, NM = MN * MN, mat = cells(NM); scene.add(mat.mesh);
  const Wt = Array.from({ length: NM }, () => { let w = gaussian(r) * .3; if (r() < .05) w *= 2.6; return clamp(w, -1, 1); });
  const FOLLOW = [[5, 7, .71834016], [14, 4, -.0427165], [9, 17, .3359812]].map(([c, rr, v]) => { const i = rr * MN + c; Wt[i] = v; return i; });
  const absW = Wt.map(Math.abs), sorted = [...absW].sort((a, b) => a - b), THR = sorted[Math.floor(.515 * NM)];
  const MX = i => (i % MN - (MN - 1) / 2) * MS, MZ = i => (Math.floor(i / MN) - (MN - 1) / 2) * MS;
  const hNow = new Float32Array(NM), alive = new Float32Array(NM).fill(1), brushed = new Uint8Array(NM), resist = new Float32Array(NM);

  /* ---------- Five layer groups, for pruning layer by layer ---------- */
  const LN = 12, LS = .22, lay = cells(LAYERS.length * LN * LN); scene.add(lay.mesh);
  const LW = LAYERS.map(() => Array.from({ length: LN * LN }, () => clamp(gaussian(r) * .32, -1, 1)));
  const LTH = LW.map(ws => { const s = ws.map(Math.abs).sort((a, b) => a - b); return f => s[Math.min(s.length - 1, Math.floor(f * s.length))]; });
  const layAlive = LAYERS.map(() => new Float32Array(LN * LN).fill(1));
  const LC = k => tall ? new THREE.Vector3((k === 4 ? 0 : (k % 2) - .5) * 3.5, 0, (Math.floor(k / 2) - 1) * 3.4) : new THREE.Vector3((k - 2) * 3.65, 0, 0);

  /* ---------- Compiling: one block's steps, and the timeline of one answer ---------- */
  const OPS = OPW.length, ops = cells(NB * OPS), ticks = cells(NB * OPS); scene.add(ops.mesh, ticks.mesh);
  const TLY = blockY(0) - 1.05, TLW = 9;
  function layoutFor(fused) {
    // Each step is a launch with some overhead between launches; fused, the eight steps become two kernels, faster ones.
    const items = []; let x = 0;
    for (let j = 0; j < NB; j++) {
      if (!fused) OPW.forEach((w, k) => { items.push([x + w / 2, w, j, k]); x += w + .28; });
      else [[0, 4], [4, 8]].forEach(([a, b]) => { const w = OPW.slice(a, b).reduce((s, v) => s + v, 0) * .42; for (let k = a; k < b; k++) items.push(k === a ? [x + w / 2, w, j, k] : [x + w / 2, 0, j, k]); x += w + .1; });
    }
    return { items, total: x };
  }
  const UNF = layoutFor(false), FUS = layoutFor(true), TSCALE = TLW / UNF.total;   // the unfused timeline is 3.80 ms long; the fused one is to scale
  const tlBar = slab(TLW + .4, .05, .5, '#8fe8ff'); tlBar.position.set(0, TLY - .2, 0); scene.add(tlBar);
  const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: col('#ffe6a8'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 })); head.scale.setScalar(.6); scene.add(head);

  /* ---------- The recipes ---------- */
  const T = recipeTree();
  const tp = [], tl = [], ep = [], el = [];
  T.nodes.forEach(n => { tp.push(n.p.x, n.p.y, n.p.z); tl.push(n.l + n.p.x * .01); if (n.par >= 0) { const a = T.nodes[n.par].p; ep.push(a.x, a.y, a.z, n.p.x, n.p.y, n.p.z); el.push(n.l - .6, n.l); } });
  const cp = [], cl = []; T.cloud.forEach(v => { cp.push(v.x, v.y, v.z); cl.push(4.4 + r() * .5); });
  const treeMat = additive({ uniforms: { uPx: { value: 1000 }, uGrow: { value: 0 }, uO: { value: 0 } },
    vertexShader: 'attribute float aL; uniform float uPx, uGrow, uO; varying vec3 vColor; varying float vAlpha; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; float on = smoothstep(aL, aL + .5, uGrow * 5.4); gl_PointSize = max(1., uPx * (aL < 4.3 ? .09 - aL * .012 : .03) / -mv.z); vColor = aL < 4.3 ? mix(vec3(1., .86, .5), vec3(.55, .9, 1.), aL / 4.) : vec3(.5, .85, 1.); vAlpha = uO * on * (aL < 4.3 ? 1. : .45); }', fragmentShader: POINT_FRAG });
  const treePts = new THREE.Points(geoOf({ position: [[...tp, ...cp], 3], aL: [[...tl, ...cl], 1] }), treeMat); treePts.frustumCulled = false; scene.add(treePts);
  const edgeMat = new THREE.ShaderMaterial({ uniforms: { uGrow: { value: 0 }, uO: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'attribute float aL; varying float vL; void main() { vL = aL; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: 'uniform float uGrow, uO; varying float vL; void main() { float on = smoothstep(vL, vL + .4, uGrow * 5.4); gl_FragColor = vec4(vec3(.5, .8, 1.) * .5 * on * uO, 1.); }' });
  const treeEdges = new THREE.LineSegments(geoOf({ position: [ep, 3], aL: [el, 1] }), edgeMat); treeEdges.frustumCulled = false; scene.add(treeEdges);

  /* ---------- Words: labels, the readout, the controls, the thesis figure ---------- */
  const L = (html, cls) => ui.label('comp', html, cls);
  const followLabs = FOLLOW.map(() => L('<span class="tag"><b></b><span class="bitbar"></span></span>', 'plain digit-lab'));
  const layLabs = LAYERS.map(o => L(`<span class="tag"><b>${o.name}</b><small>${o.sub}</small><i></i></span>`, 'plain layer-lab'));
  const blockLab = L('<span class="tag">one block</span>', 'plain axis-lab');
  const tlLab = L('<span class="tag">one answer, step by step →</span>', 'plain axis-lab');
  const levelLabs = ['chip', 'precision', 'tool', 'settings'].map(n => L(`<span class="tag">${n}</span>`, 'plain level-lab'));
  const chipLabs = ['CPU', 'GPU', 'FPGA', 'NPU'].map(n => L(`<span class="tag">${n}</span>`, 'plain tree-lab'));
  const precLabs = ['FP32', 'FP16', 'INT8', 'INT4'].map(n => L(`<span class="tag">${n}</span>`, 'plain tree-lab small'));
  const countLab = L('<span class="tag"><b>thousands</b> of recipes</span>', 'plain count-lab');
  const resistLab = L('<span class="tag">too important to cut</span>', 'plain resist-lab');
  const hud = document.createElement('div'); hud.className = 'cmp-hud';
  hud.innerHTML = `<div class="ch-row" data-r="kept"><span>weights kept</span><b>100%</b></div>
    <div class="ch-row" data-r="size"><span>size</span><b>8.17 MB</b></div>
    <div class="ch-row" data-r="acc"><span>accuracy</span><b>94.00%</b></div>
    <div class="ch-row ch-time" data-r="time"><span>time per answer</span><b>3.80 ms</b><div class="ch-bar"><i class="ch-need"></i><i class="ch-now"></i><em>1 µs</em><em>10 ms</em></div><small>a hardware trigger has 12.5 µs</small></div>
    <div class="ch-ctl" data-c="mode"><button type="button" data-m="eq">Same cut everywhere</button><button type="button" data-m="lw">Layer by layer</button></div>
    <div class="ch-ctl" data-c="bits">${BITS.map(b => `<button type="button" data-b="${b}">${b}-bit</button>`).join('')}</div>`;
  const fig = document.createElement('figure'); fig.className = 'fig-card';
  fig.innerHTML = '<img src="../assets/showcase/fpga-sensitivity.webp" alt="Chart from my thesis: accuracy as each layer group of the Particle Transformer is pruned" loading="lazy"><figcaption><small>From my thesis</small>How far each layer group of the Particle Transformer can be pruned before accuracy breaks. The embedding is the most fragile; the deep feed-forward layers lose the most and barely notice. <a href="../index.html#projects" target="_blank" rel="noopener">Case study ↗</a></figcaption>';
  ctx.$('#scene-ui').append(hud, fig);
  const row = k => hud.querySelector(`[data-r="${k}"]`), setRow = (k, txt, on, cls) => { const el = row(k); el.classList.toggle('on', on); if (on) { const b = el.querySelector('b'); if (b.textContent !== txt) b.textContent = txt; el.classList.toggle('bad', cls === 'bad'); el.classList.toggle('good', cls === 'good'); } };
  let mode = 'lw', modeUser = -99, bitsUser = 0, bitsUserAt = -99;
  hud.querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', () => { mode = b.dataset.m; modeUser = ctx.time; score.sfx('chime', { f: mode === 'lw' ? 660 : 330 }); }));
  hud.querySelectorAll('[data-b]').forEach(b => b.addEventListener('click', () => { bitsUser = +b.dataset.b; bitsUserAt = ctx.time; score.sfx('chime', { f: 200 + bitsUser * 18 }); }));

  /* ---------- Camera ---------- */
  const cpos = new THREE.Vector3(), cat = new THREE.Vector3(), off = new THREE.Vector3(), turn = new THREE.Vector2(), tmp = new THREE.Vector3();
  const S = (a, b) => [new THREE.Vector3(...a), new THREE.Vector3(...b)];
  function shot(p) {
    const MODEL_V = S([0, MODEL.y0 + MODEL_SHOT.up, MODEL_SHOT.back], [0, MODEL.y0, 0]);
    const MATRIX = S([0, 7.4, 9.4], [0, .2, .3]), LAYERS_V = tall ? S([0, 9.5, 9.5], [0, 0, .2]) : S([0, 7.5, 12.5], [0, 0, 0]);
    const QUANT = S([1.6, 5.2, 7.6], [-.2, .3, .4]), COMPILE = S([0, MODEL.y0 - .2, 11.5], [0, MODEL.y0 - .9, 0]);
    const TREE_V = S([0, T.top + 2.4, 19], [0, T.top + 2.6, 0]);
    const seq = [[0, MODEL_V], [.07, MODEL_V], [.15, MATRIX], [.28, MATRIX], [.33, LAYERS_V], [.42, LAYERS_V], [.47, QUANT], [.68, QUANT], [.73, COMPILE], [.84, COMPILE], [.9, TREE_V], [1, TREE_V]];
    let i = 0; while (i < seq.length - 2 && p > seq[i + 1][0]) i++;
    const [pa, A] = seq[i], [pb, B] = seq[i + 1], e = easeInOut(clamp((p - pa) / Math.max(1e-4, pb - pa)));
    cpos.lerpVectors(A[0], B[0], e); cat.lerpVectors(A[1], B[1], e);
    const K = tall ? Math.min(2.4, 1 / camera.aspect) * (i >= 2 && i <= 5 ? .9 : i >= 7 && i <= 9 ? 1.15 : 1) : 1;
    off.subVectors(cpos, cat).multiplyScalar(K); cpos.copy(cat).add(off);
  }

  let localP = 0, brushing = false, lastBrushSfx = 0, resistAt = null;
  const ray = new THREE.Raycaster(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hp = new THREE.Vector3();
  const bitsAt = p => p < .49 ? 32 : p < .55 ? 8 : p < .6 ? 4 : p < .645 ? 2 : 4;
  const quantise = (w, b) => { if (b >= 32) return w; const lv = Math.pow(2, b - 1) - 1; return Math.round(w * lv) / lv; };
  const digits = (w, b) => b >= 32 ? w.toFixed(8) : b === 8 ? w.toFixed(4) : b === 4 ? w.toFixed(3) : w.toFixed(0);
  const accPruned = q => q <= .515 ? 93.998 - .062 * Math.pow(q / .515, 2) : 93.936 - 40 * Math.pow(q - .515, 2.2);

  return {
    id: 'comp', scene, camera, extra: {},
    captions: [
      { at: [0, .055], html: 'Our model, trained and tuned: <b>2.1 million</b> weights, <b>8.17 MB</b>, <b>3.80 ms</b> per answer on a V100 GPU.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.055, .1], html: 'A collider’s hardware trigger has <b>12.5 µs</b> to decide, 750,000 times a second. We are 300 times too slow.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.1, .17], html: 'Each block holds matrices of weights, one glass column per number: 576 here, 2.1 million in all. Many are tiny.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.17, .29], html: '<b>Pruning</b> cuts the tiny ones. In my Particle Transformer, <b>51.5%</b> went (8.17 → 3.96 MB), and after brief fine-tuning it still scored <b>93.9%</b>.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.18, .29], html: `<span class="hint-dot"></span>${coarse ? 'Swipe' : 'Drag'} across the weights to prune them yourself`, x: 50, y: 90, cls: 'hint', align: 'center', m: { x: 50, y: 69 } },
      { at: [.3, .36], html: 'But layers aren’t equal. Cut them all alike and the sensitive ones break, the embedding and attention most.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.36, .42], html: 'So I pruned layer by layer, guided by sensitivity scans: deep feed-forward layers lose most, the embedding least.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.43, .49], html: 'Each weight is a 32-bit number, with digits it doesn’t need. <b>Quantization</b> keeps fewer bits.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.49, .55], html: '<b>8 bits</b>: four times smaller (2.04 MB), accuracy 93.99%. Almost free.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.55, .6], html: '<b>4 bits</b>: eight times smaller (1.02 MB), still 93.35%.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.6, .645], html: '<b>2 bits</b>: most weights round to zero and the model falls apart (64.7%).', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.645, .69], html: '4 bits is the sweet spot. Every number here is my own measurement.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.44, .68], html: '<span class="hint-dot"></span>Pick a bit width below', x: 50, y: 90, cls: 'hint desk', align: 'center' },
      { at: [.7, .77], html: 'On a GPU, a compiler like <b>TensorRT</b> fuses small steps into a few big kernels, in half precision (FP16).', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.77, .845], html: 'Fewer launches, less waiting: <b>3.80 → 0.82 ms</b> per answer, at 93.7% accuracy.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.85, .93], html: 'But which trick, tool and chip? FP16 or INT8, TensorRT or hls4ml, GPU or FPGA? The choices multiply: <b>thousands</b> of recipes.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.93, 1.05], html: 'By hand, one deployment across three chips took about <b>80 hours</b> of expert work over 21 days.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } }
    ],
    resize(aspect) { camera.aspect = aspect; camera.updateProjectionMatrix(); tall = aspect < 1; },
    init() { this.resize(innerWidth / innerHeight); },
    show(on) { if (!on) { hud.classList.remove('on'); fig.classList.remove('on'); document.body.style.cursor = ''; brushing = false; } },
    pointer(type) {
      const canBrush = localP > .16 && localP < .3;
      if (!canBrush) { if (brushing) brushing = false; document.body.style.cursor = ''; return; }
      if (type === 'down') brushing = true;
      if (type === 'up') brushing = false;
      ray.setFromCamera(pointer.ndc, camera); const hit = ray.ray.intersectPlane(ground, hp);
      const over = hit && Math.abs(hp.x) < MN * MS / 2 && Math.abs(hp.z) < MN * MS / 2;
      document.body.style.cursor = over ? 'crosshair' : '';
      if (!(brushing || (coarse && type !== 'up')) || !over) return;
      let cut = 0;
      for (let i = 0; i < NM; i++) {
        if (brushed[i] || Math.hypot(MX(i) - hp.x, MZ(i) - hp.z) > .5) continue;
        if (absW[i] < .45) { brushed[i] = 1; cut++; } else { resist[i] = 1; resistAt = { i, t: ctx.time }; }
      }
      if (cut && ctx.time - lastBrushSfx > .12) { lastBrushSfx = ctx.time; score.sfx('clean'); }
    },
    update(p, info) {
      localP = p;
      const t = info.time, act = info.active, dt = info.dt, px = pixelScale(renderer, camera);
      treeMat.uniforms.uPx.value = px; dust.mat.uniforms.uTime.value = t; dust.mat.uniforms.uPx.value = px;
      if (p < .14 || p > .45) brushed.fill(0);

      /* The model: whole at the start, opened up for pruning and quantization, back for compiling and the recipes. */
      const modelO = (1 - sstep(.1, .15, p)) + sstep(.68, .73, p);
      const fz = easeInOut(clamp((p - .73) / .07)), opsOn = sstep(.69, .73, p) * (1 - sstep(.86, .9, p));
      blocks.forEach((b, j) => { b.userData.set(.5 * modelO * (1 - opsOn * .45), j === 2 ? window4(p, .06, .09, .12, .15) * .8 : 0); });

      /* The matrix: pruning (scroll and brush), then quantization. */
      const matO = sstep(.1, .15, p) * (1 - sstep(.28, .32, p)) + sstep(.42, .47, p) * (1 - sstep(.68, .71, p));
      const pruneF = clamp((p - .19) / .07) * .515, quantPhase = p > .4, bits = quantPhase ? (bitsUser && t - bitsUserAt < 8 ? bitsUser : bitsAt(p)) : 32;
      if (!quantPhase && t - bitsUserAt > 8) bitsUser = 0;
      const thr = quantPhase ? -1 : pruneF > 0 ? sorted[Math.floor(pruneF * NM)] : -1;
      let killed = 0;
      if (matO > .001) for (let i = 0; i < NM; i++) {
        const dead = !quantPhase && (absW[i] < thr || brushed[i]);
        alive[i] += ((dead ? 0 : 1) - alive[i]) * Math.min(1, dt * 7); if (dead) killed++;
        const v = quantise(Wt[i], bits), want = (.04 + Math.abs(v) * 1.15) * alive[i];
        hNow[i] += (want - hNow[i]) * Math.min(1, dt * 9);
        resist[i] = Math.max(0, resist[i] - dt * 1.6);
        const grow = sstep(.1, .16, p), h = Math.max(.002, hNow[i] * grow), fall = (1 - alive[i]) * .5;
        const broken = bits === 2 && Math.abs(v) < .5 ? .6 : 0;
        mat.set(i, MX(i), h / 2 - fall, MZ(i), MS * .62, h, MS * .62, broken ? -.9 : v, Math.min(1, resist[i] * .8 + (FOLLOW.includes(i) && quantPhase ? .45 : 0)), matO * (.1 + .32 * alive[i]) * (1 - broken * .5));
      }
      mat.commit();
      const prunedFrac = killed / NM;

      /* Five layer groups: the same cut everywhere, or layer by layer. */
      const layO = sstep(.29, .33, p) * (1 - sstep(.42, .45, p));
      if (p > .3 && p < .42 && t - modeUser > 6) { const want = Math.floor(t / 3.2) % 2 === 0 ? 'eq' : 'lw'; if (want !== mode) mode = want; }
      let damage = 0;
      if (layO > .001) LAYERS.forEach((o, k) => {
        const cut = layO > 0 ? (mode === 'eq' ? .515 : o.cut) * sstep(.31, .35, p) : 0, th = LTH[k](cut), c0 = LC(k), hurt = Math.max(0, cut - o.tol) * 4;
        damage += Math.max(0, cut - o.tol);
        for (let i = 0; i < LN * LN; i++) {
          const w = LW[k][i], dead = Math.abs(w) < th, a = layAlive[k];
          a[i] += ((dead ? 0 : 1) - a[i]) * Math.min(1, dt * 6);
          const h = Math.max(.002, (.04 + Math.abs(w) * .9) * a[i] * layO);
          lay.set(k * LN * LN + i, c0.x + (i % LN - (LN - 1) / 2) * LS, h / 2, c0.z + (Math.floor(i / LN) - (LN - 1) / 2) * LS, LS * .64, h, LS * .64, hurt > .05 ? -.9 : w, Math.min(.3, hurt * .3), layO * (.12 + .36 * a[i]));
        }
        const el = layLabs[k].el.querySelector('i'), tx = `cut ${Math.round(cut * 100)}%`; if (el.textContent !== tx) el.textContent = tx;
        layLabs[k].el.classList.toggle('hurt', hurt > .05);
      });
      lay.commit();

      /* Compiling: eight steps per block fuse into two kernels; the timeline of one answer shrinks to scale. */
      const unf = UNF.items, fus = FUS.items, tlOn = opsOn;
      const totalNow = lerp(UNF.total, FUS.total, fz) * TSCALE, x0 = -TLW / 2;
      const hx = x0 + ((t * 2.6) % (totalNow + 1.2)) - .6;
      if (tlOn > .001) for (let n = 0; n < unf.length; n++) {
        const [ua, uw] = unf[n], [fa, fw] = fus[n], j = unf[n][2];
        const cx = x0 + lerp(ua, fa, fz) * TSCALE, w = lerp(uw, fw, fz) * TSCALE, lit = Math.abs(hx - cx) < w / 2 + .05 ? 1 : 0;
        ticks.set(n, cx, TLY, 0, Math.max(.001, w * .92), .22, .3, .55, lit * .9, tlOn * (w > .01 ? 1 : 0));
        // the same steps inside each block
        const bx = (lerp(ua, fa, fz) - (lerp(UNF.total, FUS.total, fz) / NB) * j) / (lerp(UNF.total, FUS.total, fz) / NB) * MODEL.w * .9 - MODEL.w * .45, bw = lerp(uw, fw, fz) / (lerp(UNF.total, FUS.total, fz) / NB) * MODEL.w * .9;
        ops.set(n, bx, blockY(j), 0, Math.max(.001, bw * .9), MODEL.h * .7, MODEL.d * .7, .55, lit * .9, tlOn * (bw > .01 ? .9 : 0));
      }
      ticks.commit(); ops.commit();
      tlBar.userData.set(.5 * tlOn, 0); head.position.set(hx, TLY + .25, .2); head.material.opacity = tlOn * (hx > x0 && hx < x0 + totalNow ? .9 : .2);

      /* The recipes. */
      const grow = clamp((p - .845) / .08), treeO = sstep(.84, .87, p);
      treeMat.uniforms.uGrow.value = grow; treeMat.uniforms.uO.value = treeO; edgeMat.uniforms.uGrow.value = grow; edgeMat.uniforms.uO.value = treeO;

      /* The readout. */
      const hudOn = act && p > .02 && p < .86;
      hud.classList.toggle('on', hudOn);
      hud.querySelector('[data-c="mode"]').classList.toggle('on', p > .3 && p < .42);
      hud.querySelector('[data-c="bits"]').classList.toggle('on', p > .43 && p < .68);
      hud.querySelectorAll('[data-m]').forEach(b => b.classList.toggle('sel', b.dataset.m === mode));
      hud.querySelectorAll('[data-b]').forEach(b => b.classList.toggle('sel', +b.dataset.b === bits));
      const bi = BITS.indexOf(bits);
      if (p < .17) { setRow('kept', '100%', false); setRow('size', '8.17 MB', true); setRow('acc', '94.00%', true); }
      else if (p < .3) { const q = prunedFrac; setRow('kept', `${(100 - q * 100).toFixed(1)}%`, true); setRow('size', `${(8.17 - (8.17 - 3.96) * Math.min(1, q / .515) - Math.max(0, q - .515) * 8).toFixed(2)} MB`, true); setRow('acc', `${accPruned(q).toFixed(2)}%`, true, q > .6 ? 'bad' : ''); }
      else if (p < .42) { setRow('kept', '48.5%', true); setRow('size', '3.96 MB', true); setRow('acc', mode === 'eq' && damage > .05 ? 'falls below the floor' : '93.94%', true, mode === 'eq' && damage > .05 ? 'bad' : 'good'); }
      else if (p < .69) { setRow('kept', '', false); setRow('size', `${SIZE[bi].toFixed(2)} MB`, true, bits === 4 ? 'good' : ''); setRow('acc', `${ACC[bi].toFixed(bits === 2 ? 1 : 2)}%`, true, bits === 2 ? 'bad' : bits === 4 ? 'good' : ''); }
      else { setRow('kept', '', false); setRow('size', '', false); setRow('acc', '93.7%', true); }
      const ms = p < .7 ? 3.8 : lerp(3.8, .82, fz);
      setRow('time', fmtT(ms), true, p > .76 ? 'good' : '');
      const lg = v => clamp((Math.log10(v) + 0) / 4);   // 1 µs … 10 ms, in µs
      row('time').querySelector('.ch-now').style.left = `${(lg(ms * 1000) * 100).toFixed(1)}%`;
      row('time').querySelector('.ch-need').style.left = `${(lg(12.5) * 100).toFixed(1)}%`;
      fig.classList.toggle('on', act && p > .355 && p < .425);

      /* Words in the world. */
      const show = (lab, pos, on) => ui.place(lab, pos, camera, act && on);
      FOLLOW.forEach((i, k) => {
        const v = quantise(Wt[i], bits), el = followLabs[k].el, b = el.querySelector('b'), tx = digits(v, bits);
        if (b.textContent !== tx) { b.textContent = tx; el.querySelector('.bitbar').innerHTML = '<i></i>'.repeat(bits); }
        el.classList.toggle('zero', bits === 2 && Math.abs(v) < .5);
        show(followLabs[k], new THREE.Vector3(MX(i), hNow[i] + .25, MZ(i)), p > .45 && p < .68 && (!tall || k === 0));
      });
      LAYERS.forEach((o, k) => show(layLabs[k], LC(k).add(tmp.set(0, 0, LN * LS / 2 + .35)), layO > .5));
      show(blockLab, new THREE.Vector3(MODEL.w / 2 + .3, blockY(2), 0), p > .05 && p < .12);
      show(tlLab, new THREE.Vector3(-TLW / 2 + 1.6, TLY - .6, 0), tlOn > .5);
      show(resistLab, resistAt ? new THREE.Vector3(MX(resistAt.i), 1.9, MZ(resistAt.i)) : MC, !!resistAt && t - resistAt.t < 1.2 && p > .16 && p < .3);
      const lvlY = [1, 2, 3, 4].map(l => T.nodes.find(n => n.l === l).p.y);
      levelLabs.forEach((lab, l) => show(lab, new THREE.Vector3(tall ? -4.6 : -11.6, lvlY[l], 0), grow * 5.4 > l + 1.4 && treeO > .5 && !tall));
      const lv1 = T.nodes.filter(n => n.l === 1), gpu = T.nodes.indexOf(lv1[1]), lv2 = T.nodes.filter(n => n.l === 2 && n.par === gpu);
      chipLabs.forEach((lab, k) => show(lab, lv1[k].p.clone().add(tmp.set(0, -.45, 0)), grow * 5.4 > 1.6 && treeO > .5));
      precLabs.forEach((lab, k) => show(lab, lv2[k].p.clone().add(tmp.set(0, -.4, 0)), grow * 5.4 > 2.6 && treeO > .5 && !tall));
      show(countLab, new THREE.Vector3(0, T.top + 7.6, 0), grow > .95 && treeO > .5);

      /* Camera. */
      shot(p);
      const want = pointer.inside && !coarse && !brushing ? pointer.ndc : null;
      turn.x += ((want ? want.x : 0) - turn.x) * Math.min(1, dt * 2); turn.y += ((want ? want.y : 0) - turn.y) * Math.min(1, dt * 2);
      off.subVectors(cpos, cat).applyAxisAngle(new THREE.Vector3(0, 1, 0), -turn.x * .05); off.y += turn.y * .3;
      camera.position.copy(cat).add(off); camera.lookAt(cat);
    }
  };
}
