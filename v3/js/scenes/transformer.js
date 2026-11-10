/* Act III, scene 7: build a transformer, one part at a time, around a five-word sentence: "I make big models run".
   It opens in the space of meaning from Act II: the sentence's five words are arrows there, and an arrow is just a list
   of numbers. Each list flies out and stands up as a glass column (one cell per number). Then, in order: positional
   encoding (a wave wraps each column), self-attention (query, key and value peel off; beams of light reach back to the
   words that matter; the attention matrix fills in), the shortcut and normalisation, the feed-forward network (the
   neurons from Act I, back again), and the block stacks ×N. It ends on Hafiz's own models, drawn as their real
   architectures: the Particle Transformer, ParticleNet, and a 3-layer DFlash drafter. Every stage is playable. */
import * as THREE from 'three';
import { additive, POINT_FRAG, PAL, col, rng, gaussian, unitVector, sstep, clamp, lerp, easeInOut, easeOut, pixelScale, glowTexture } from '../core/util.js';
import { cells, slab, heat, floor, motes } from '../core/glass.js';

export const TOKENS = ['I', 'make', 'big', 'models', 'run'];
export const D = 10;            // numbers shown per token (real models use thousands)
const NT = TOKENS.length, H = 12, LEVELS = 12, INTRO = .14;
/* Three attention heads, causal (each word only looks back). Rows: the word asking; columns: the words it looks at. */
export const HEADS = [
  { name: 'The word before', m: [[1], [.75, .25], [.1, .7, .2], [.05, .1, .65, .2], [.05, .05, .1, .65, .15]] },
  { name: 'Who does what', m: [[1], [.8, .2], [.35, .45, .2], [.15, .45, .25, .15], [.22, .18, .05, .5, .05]] },
  { name: 'What describes what', m: [[1], [.5, .5], [.2, .2, .6], [.05, .1, .7, .15], [.1, .1, .35, .35, .1]] }
];
const VARIANTS = [
  { key: 'tf', name: 'Transformer', text: 'The block we just built, stacked. During my internship at <b>Zidong Taichu</b> I worked on serving a model built this way, Qwen3.5-4B, in vLLM: fixing model loading, hybrid attention and CUDA Graph issues, then measuring how much faster it could answer.' },
  { key: 'part', name: 'Particle Transformer', text: 'A jet from a collision is a set of particles with no order, so each particle becomes a token. Attention also gets a bias from how every <b>pair</b> relates: distance, momentum, mass. Eight such blocks, then a class token gathers the answer. I deploy it for CEPC and CMS: <b>10.4×</b> faster on a V100, <b>8.17 → 1.02 MB</b>, and its attention rebuilt on an FPGA.' },
  { key: 'pnet', name: 'ParticleNet', text: 'It treats the jet as a cloud of points. In each EdgeConv block every particle exchanges messages with its <b>k nearest neighbours</b>, and the neighbours are re-picked in the learned feature space. Then all particles are averaged and classified. I ran it <b>6.6×</b> faster with TensorRT, and moved its EdgeConv work, about 70% of the runtime, onto an FPGA.' },
  { key: 'dflash', name: 'DFlash drafter', text: 'A <b>3-layer</b> drafter proposes a whole <b>block</b> of tokens at once. The big model checks the block in a single pass, keeps the part it agrees with and fixes the first miss. I trained one at IHEP and measured how draft length trades speed against wasted work.' }
];
const CLASSES = ['top', 'W', 'Z', 'Higgs', 'QCD'], CLASS_P = [.71, .12, .07, .04, .06];

export default function transformer(ctx) {
  const { small, ui, score, pointer, renderer, coarse } = ctx;
  const scene = new THREE.Scene();
  scene.background = col('#020908');
  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, .05, 400);
  const r = rng(303);
  let S = 2;                                             // spacing between token columns (smaller on phones)
  const X = i => (i - (NT - 1) / 2) * S, cy = k => .3 + k * .22;
  const geoOf = attrs => { const g = new THREE.BufferGeometry(); Object.entries(attrs).forEach(([k, [arr, n]]) => g.setAttribute(k, new THREE.Float32BufferAttribute(arr, n))); return g; };

  /* ---------- The numbers ---------- */
  const emb = TOKENS.map(() => Array.from({ length: D }, () => gaussian(r) * .5));
  const pe = TOKENS.map((_, i) => Array.from({ length: D }, (_, k) => (k % 2 ? Math.cos : Math.sin)(i / Math.pow(10000, (k - k % 2) / D)) * .5));
  const plus = (a, b, kb = 1) => a.map((row, i) => row.map((v, k) => v + b[i][k] * kb));
  const s1 = plus(emb, pe);
  const avgHead = s1.map((_, i) => s1.map((__, j) => j > i ? 0 : HEADS.reduce((s, h) => s + h.m[i][j], 0) / HEADS.length));
  const s2 = s1.map((x, i) => x.map((v, k) => .55 * v + .45 * s1.reduce((s, xj, j) => s + avgHead[i][j] * xj[(k + 3) % D], 0)));
  const s3 = s2.map(x => { const m = x.reduce((a, b) => a + b, 0) / D, sd = Math.sqrt(x.reduce((a, b) => a + (b - m) * (b - m), 0) / D) || 1; return x.map(v => (v - m) / sd * .55); });
  const W1 = Array.from({ length: H }, () => Array.from({ length: D }, () => gaussian(r) * .45)), W2 = Array.from({ length: D }, () => Array.from({ length: H }, () => gaussian(r) * .3));
  const hid = s3.map(x => W1.map(w => Math.max(0, w.reduce((s, wk, k) => s + wk * x[k], 0))));
  const s4 = s3.map((x, i) => x.map((v, k) => v + W2[k].reduce((s, w, h) => s + w * hid[i][h], 0) * .5));
  const STAGES = [emb, s1, s2, s3, s4];
  const valueAt = (i, k, st) => { const a = Math.floor(clamp(st, 0, 3.999)), f = clamp(st - a); return lerp(STAGES[a][i][k], STAGES[a + 1][i][k], easeInOut(f)); };
  const hidMax = Math.max(...hid.flat(), 1e-3);

  /* ---------- The room: a dark glass floor and drifting motes ---------- */
  const fl = floor(-.2); scene.add(fl);
  const dust = motes(small ? 220 : 520); scene.add(dust.pts);
  const haze = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: col('#0f5a50'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: .35 }));
  haze.position.set(0, 6, -40); haze.scale.setScalar(90); scene.add(haze);

  /* ---------- The opening: the space of meaning, where the sentence's words are arrows ---------- */
  const MC = new THREE.Vector3(0, 1.7, -1.2), AL = 2.6;
  const DIRS = [[-.75, .55, .35], [-.9, -.15, -.4], [.15, .95, -.25], [.85, .35, .4], [.6, -.6, .55]].map(d => new THREE.Vector3(...d).normalize());
  const mp = [], mc = [], ms = [];
  const CL = [[PAL.goldHi, [2.6, 1.6, .8]], [PAL.cyan, [-2.9, 1.9, -1.6]], [PAL.violet, [-1.1, -2.4, 2.1]], [PAL.amber, [3.7, -1.8, -1.9]], [PAL.rose, [-3.5, -.8, 2.9]], [PAL.mint, [.5, .3, -3.5]]];
  CL.forEach(([c, at]) => { for (let k = 0; k < (small ? 160 : 360); k++) { mp.push(MC.x + at[0] + gaussian(r) * .75, MC.y + at[1] + gaussian(r) * .65, MC.z + at[2] + gaussian(r) * .75); mc.push(c.r, c.g, c.b); ms.push(r(), .025 + r() * .03, 0, 0); } });
  for (let k = 0; k < (small ? 400 : 1000); k++) { const p = unitVector(r).multiplyScalar(1.6 + r() * 5).add(MC); mp.push(p.x, p.y, p.z); mc.push(.5, .5, .65); ms.push(r(), .018 + r() * .02, 0, 0); }
  DIRS.forEach((d, i) => { for (let k = 0; k < 90; k++) { const p = MC.clone().addScaledVector(d, AL * k / 89); mp.push(p.x, p.y, p.z); mc.push(1, .86, .5); ms.push(r(), .028, 1, k / 89 + i * .0); } });   // the five arrows
  [[1, 0, 0, PAL.cyan], [0, 1, 0, PAL.goldHi], [0, 0, 1, PAL.rose]].forEach(([x, y, z, c]) => { for (let k = 0; k < 160; k++) { const u = k / 159 * 2 - 1; mp.push(MC.x + x * u * 3.2, MC.y + y * u * 3.2, MC.z + z * u * 3.2); mc.push(c.r * .7, c.g * .7, c.b * .7); ms.push(r(), .016, 2, 0); } });
  const spaceMat = additive({ uniforms: { uTime: { value: 0 }, uPx: { value: 1000 }, uCloud: { value: 1 }, uArrow: { value: 0 }, uAxes: { value: 1 } },
    vertexShader: `attribute vec3 color; attribute vec4 aSeed; uniform float uTime, uPx, uCloud, uArrow, uAxes; varying vec3 vColor; varying float vAlpha;
      void main() {
        bool arrow = aSeed.z > .5 && aSeed.z < 1.5, axis = aSeed.z > 1.5;
        vec3 p = position + (arrow || axis ? vec3(0.) : .04 * vec3(sin(uTime * .5 + aSeed.x * 30.), cos(uTime * .4 + aSeed.x * 20.), 0.));
        vec4 mv = modelViewMatrix * vec4(p, 1.); gl_Position = projectionMatrix * mv;
        gl_PointSize = max(1., uPx * aSeed.y / -mv.z);
        vColor = color; vAlpha = arrow ? step(aSeed.w, uArrow) * min(1., uArrow * 1.2) * .9 : axis ? uAxes * .45 : uCloud * .55;
      }`, fragmentShader: POINT_FRAG });
  const spacePts = new THREE.Points(geoOf({ position: [mp, 3], color: [mc, 3], aSeed: [ms, 4] }), spaceMat); spacePts.frustumCulled = false; scene.add(spacePts);
  const tipGlow = DIRS.map(d => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: col('#ffe2a0'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 })); s.position.copy(MC).addScaledVector(d, AL); s.scale.setScalar(.6); scene.add(s); return s; });
  const fmt = v => (v < 0 ? '−' : '') + Math.abs(v).toFixed(2);
  const numLab = ui.label('arch', `<span class="tag nums-tag">models = [ ${emb[3].slice(0, 4).map(fmt).join(', ')}, … ]</span>`, 'plain nums-lab');

  /* ---------- Glass cells: 5 token columns, and their query / key / value copies ---------- */
  const C = cells(NT * D * 4); scene.add(C.mesh);

  /* ---------- Shader-driven lines and points (positions follow the spacing uniform, so phones can pack them closer) ---------- */
  const U = { uS: { value: S }, uTime: { value: 0 }, uPx: { value: 1000 } };
  const ptsMat = (vert, extra = {}) => additive({ uniforms: Object.assign({}, U, extra), vertexShader: vert, fragmentShader: POINT_FRAG });
  const X_GLSL = 'float tx(float t) { return (t - 2.) * uS; }';

  // Positional encoding: a wave wrapping each column.
  const wA = [], wTok = [];
  for (let i = 0; i < NT; i++) for (let k = 0; k < 160; k++) { wA.push(k / 159); wTok.push(i); }
  const waveMat = ptsMat(`
    attribute float aU, aTok; uniform float uS, uTime, uPx, uShow, uGrow; varying vec3 vColor; varying float vAlpha; ${X_GLSL}
    void main() {
      float ph = aU * 6.283 * 2.4 + aTok * 1.25 - uTime * 1.6;
      vec3 p = vec3(tx(aTok) + .36 * sin(ph), .22 + aU * 2.25, .36 * cos(ph));
      vec4 mv = modelViewMatrix * vec4(p, 1.); gl_Position = projectionMatrix * mv;
      gl_PointSize = max(1., uPx * .035 / -mv.z);
      vColor = mix(vec3(1., .82, .4), vec3(.3, 1., .85), .5 + .5 * sin(ph));
      vAlpha = uShow * step(aU, uGrow) * (.45 + .55 * cos(ph) * cos(ph));
    }`, { uShow: { value: 0 }, uGrow: { value: 0 } });
  scene.add(new THREE.Points(geoOf({ position: [new Array(wA.length * 3).fill(0), 3], aU: [wA, 1], aTok: [wTok, 1] }), waveMat));

  // Attention beams: arcs from each earlier word (key) to the word asking (query); light flows along them.
  const PAIRS = []; for (let i = 0; i < NT; i++) for (let j = 0; j < i; j++) PAIRS.push([i, j]);
  const bI = [], bJ = [], bU = [], bP = [], bS = [];
  PAIRS.forEach(([i, j], pi) => { for (let k = 0; k < 90; k++) { bI.push(i); bJ.push(j); bU.push(k / 89); bP.push(pi); bS.push(r()); } });
  const beamMat = ptsMat(`
    attribute float aI, aJ, aU, aP, aSeed; uniform float uS, uTime, uPx, uShow, uW[${PAIRS.length}]; varying vec3 vColor; varying float vAlpha; ${X_GLSL}
    void main() {
      float w = uW[int(aP + .5)];
      vec3 a = vec3(tx(aJ), 2.55, 0.), b = vec3(tx(aI), 2.55, 0.), m = (a + b) * .5 + vec3(0., .55 + .3 * abs(aI - aJ) * uS / 2., -.35);
      float u = aU; vec3 p = mix(mix(a, m, u), mix(m, b, u), u);
      vec4 mv = modelViewMatrix * vec4(p, 1.); gl_Position = projectionMatrix * mv;
      float pulse = pow(fract(u - uTime * .55 + aSeed * .15), 10.);
      gl_PointSize = max(1., uPx * (.03 + .05 * w) / -mv.z);
      vColor = mix(vec3(.25, .95, .8), vec3(1., .85, .45), pulse + w * .4);
      vAlpha = uShow * w * (.35 + 1.4 * pulse);
    }`, { uShow: { value: 0 }, uW: { value: new Array(PAIRS.length).fill(0) } });
  scene.add(new THREE.Points(geoOf({ position: [new Array(bI.length * 3).fill(0), 3], aI: [bI, 1], aJ: [bJ, 1], aU: [bU, 1], aP: [bP, 1], aSeed: [bS, 1] }), beamMat));

  // The shortcut: a loop beside each column, carrying the token around the attention.
  const rT = [], rU = [];
  for (let i = 0; i < NT; i++) for (let k = 0; k < 120; k++) { rT.push(i); rU.push(k / 119); }
  const resMat = ptsMat(`
    attribute float aTok, aU; uniform float uS, uTime, uPx, uShow; varying vec3 vColor; varying float vAlpha; ${X_GLSL}
    void main() {
      float o = sin(aU * 3.1416);
      vec3 p = vec3(tx(aTok) + .62 * o * min(1., uS / 2.), mix(.18, 2.5, aU), .3 + .75 * o);
      vec4 mv = modelViewMatrix * vec4(p, 1.); gl_Position = projectionMatrix * mv;
      float pulse = pow(fract(aU - uTime * .5), 8.);
      gl_PointSize = max(1., uPx * .03 / -mv.z);
      vColor = mix(vec3(.3, .95, .85), vec3(1., .88, .55), pulse); vAlpha = uShow * (.3 + 1.2 * pulse);
    }`, { uShow: { value: 0 } });
  scene.add(new THREE.Points(geoOf({ position: [new Array(rT.length * 3).fill(0), 3], aTok: [rT, 1], aU: [rU, 1] }), resMat));

  // Feed-forward: each column fans out into a wider layer of neurons, then folds back.
  const NODE = h => [(h / (H - 1) - .5) * 1.5, 1.25 + .55 * Math.sin(h * 2.3 + 1)];
  const lp = [], lT = [], lE = [], lK = [], lH = [], lW = [];
  for (let i = 0; i < NT; i++) for (let k = 0; k < D; k++) for (let h = 0; h < H; h++) for (const e of [0, 1]) { lp.push(0, 0, 0); lT.push(i); lE.push(e); lK.push(k); lH.push(h); lW.push(W1[h][k]); }
  const ffU = { uShow: { value: 0 }, uHotT: { value: -1 }, uHotH: { value: -1 }, uFire: { value: -9 } };
  const lineMat = new THREE.ShaderMaterial({
    uniforms: Object.assign({}, U, ffU),
    vertexShader: `
      attribute float aTok, aEnd, aK, aH, aW; uniform float uS, uTime, uShow, uHotT, uHotH, uFire; varying float vA; varying vec3 vC; ${X_GLSL}
      void main() {
        float nx = (aH / ${(H - 1).toFixed(1)} - .5) * 1.5 * min(1., uS / 2.), ny = 1.25 + .55 * sin(aH * 2.3 + 1.);
        vec3 p = mix(vec3(tx(aTok), .3 + aK * .22, .25), vec3(tx(aTok) + nx, ny, 1.55), aEnd);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
        float hot = (abs(aTok - uHotT) < .5 && abs(aH - uHotH) < .5) ? 1. : 0.;
        float fire = hot * exp(-(uTime - uFire) * 2.5);
        vA = uShow * (.05 + .1 * abs(aW) + hot * .35 + fire * .9); vC = mix(aW > 0. ? vec3(.3, 1., .75) : vec3(.25, .55, 1.), vec3(1., .88, .5), fire);
      }`,
    fragmentShader: 'varying float vA; varying vec3 vC; void main() { gl_FragColor = vec4(vC * vA, vA); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, premultipliedAlpha: true
  });
  scene.add(new THREE.LineSegments(geoOf({ position: [lp, 3], aTok: [lT, 1], aEnd: [lE, 1], aK: [lK, 1], aH: [lH, 1], aW: [lW, 1] }), lineMat));
  const nT = [], nH = [], nA = [];
  for (let i = 0; i < NT; i++) for (let h = 0; h < H; h++) { nT.push(i); nH.push(h); nA.push(hid[i][h] / hidMax); }
  const nodeMat = ptsMat(`
    attribute float aTok, aH, aAct; uniform float uS, uTime, uPx, uShow, uHotT, uHotH, uFire; varying vec3 vColor; varying float vAlpha; ${X_GLSL}
    void main() {
      float nx = (aH / ${(H - 1).toFixed(1)} - .5) * 1.5 * min(1., uS / 2.), ny = 1.25 + .55 * sin(aH * 2.3 + 1.);
      vec3 p = vec3(tx(aTok) + nx, ny, 1.55);
      vec4 mv = modelViewMatrix * vec4(p, 1.); gl_Position = projectionMatrix * mv;
      float hot = (abs(aTok - uHotT) < .5 && abs(aH - uHotH) < .5) ? 1. : 0., fire = hot * exp(-(uTime - uFire) * 2.5);
      float on = .25 + .75 * aAct;
      gl_PointSize = max(1., uPx * (.07 + .07 * aAct + hot * .06 + fire * .12) / -mv.z);
      vColor = mix(mix(vec3(.55, .4, 1.), vec3(1., .82, .4), aAct), vec3(1.), fire * .6);   // the violet and gold of Act I's neurons
      vAlpha = uShow * (on + fire);
    }`, ffU);
  scene.add(new THREE.Points(geoOf({ position: [new Array(nT.length * 3).fill(0), 3], aTok: [nT, 1], aH: [nH, 1], aAct: [nA, 1] }), nodeMat));

  // The residual stream through the stacked model: one rising line of light per token.
  const sT = [], sU = [];
  for (let i = 0; i < NT; i++) for (let k = 0; k < 260; k++) { sT.push(i); sU.push(k / 259); }
  const streamMat = ptsMat(`
    attribute float aTok, aU; uniform float uS, uTime, uPx, uShow, uTop; varying vec3 vColor; varying float vAlpha; ${X_GLSL}
    void main() {
      vec3 p = vec3(tx(aTok), .2 + aU * (uTop - .2), 0.);
      vec4 mv = modelViewMatrix * vec4(p, 1.); gl_Position = projectionMatrix * mv;
      float pulse = pow(fract(aU * 3. - uTime * .35 - aTok * .13), 12.);
      gl_PointSize = max(1., uPx * .035 / -mv.z);
      vColor = mix(vec3(.3, .95, .85), vec3(1., .88, .5), pulse); vAlpha = uShow * (.25 + 1.3 * pulse);
    }`, { uShow: { value: 0 }, uTop: { value: 1 } });
  scene.add(new THREE.Points(geoOf({ position: [new Array(sT.length * 3).fill(0), 3], aTok: [sT, 1], aU: [sU, 1] }), streamMat));

  /* ---------- The attention matrix, floating behind the row ---------- */
  const M = heat(NT, .42, .05); M.mesh.position.set(0, 5.35, -2.4); scene.add(M.mesh);
  const rowLabs = TOKENS.map(t => ui.label('arch', `<span class="tag mx-tag">${t}</span>`, 'plain mx-lab'));
  const colLabs = TOKENS.map(t => ui.label('arch', `<span class="tag mx-tag">${t}</span>`, 'plain mx-lab'));
  const mxTitle = ui.label('arch', '<span class="tag">attention · each row sums to 1</span>', 'plain axis-lab');

  /* ---------- The stack ---------- */
  const SLAB_W = 4 * 2 + 1.7, slabs = [];
  for (let j = 0; j < LEVELS; j++) { const s = slab(SLAB_W, 1.1, 3.2, j ? '#2fe0b4' : '#5ff0c8'); s.position.set(0, .9 + j * 1.45, 0); scene.add(s); slabs.push(s); }
  const stackLab = ui.label('arch', '<span class="tag stack-tag">×1</span>', 'plain-dot left stack-lab');

  /* ---------- Hafiz's models, drawn as their real architectures ---------- */
  const V = new THREE.Group(); V.position.set(0, .3, 1.6); scene.add(V);
  const edgeMat = tint => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uTint: { value: col(tint) } },
    vertexShader: 'attribute float aU, aW, aSeed; varying float vU, vW, vS; void main() { vU = aU; vW = aW; vS = aSeed; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: 'uniform float uTime, uOpacity; uniform vec3 uTint; varying float vU, vW, vS; void main() { float pulse = pow(fract(vU - uTime * .6 + vS), 10.); float a = uOpacity * vW * (.3 + 1.3 * pulse); gl_FragColor = vec4(mix(uTint, vec3(1., .9, .6), pulse) * a, a); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, premultipliedAlpha: true
  });
  const dotMat = () => additive({ uniforms: { uTime: { value: 0 }, uPx: { value: 1000 }, uOpacity: { value: 0 } },
    vertexShader: `attribute vec3 color; attribute vec4 aSeed; uniform float uTime, uPx, uOpacity; varying vec3 vColor; varying float vAlpha;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = max(1., uPx * aSeed.y / -mv.z);
        vColor = color * (.9 + .25 * sin(uTime * aSeed.z * 2. + aSeed.x * 9.)); vAlpha = uOpacity; }`, fragmentShader: POINT_FRAG });
  // One jet from a collision: particles in the (η, φ) plane. Charged (cyan), photons (amber), neutral hadrons (violet).
  const JN = 16, jet = Array.from({ length: JN }, (_, i) => ({ p: new THREE.Vector2(clamp(gaussian(r) * .34, -.95, .95), clamp(gaussian(r) * .27, -.62, .62)), kind: i % 5 < 3 ? 0 : i % 5 === 3 ? 1 : 2, pt: .4 + Math.pow(r(), 3) * 1.6 }));
  const KC = [PAL.cyan, PAL.amber, PAL.violet];
  const knnOf = (pts, k) => { const out = []; pts.forEach((a, i) => pts.map((b, j) => ({ j, d: a.distanceTo(b) })).filter(o => o.j !== i).sort((x, y) => x.d - y.d).slice(0, k).forEach(o => { if (!out.some(e => e[0] === o.j && e[1] === i)) out.push([i, o.j]); })); return out; };
  const feat = (pts, rot, pull, centres) => pts.map((p, i) => { const c = Math.cos(rot), s = Math.sin(rot), q = new THREE.Vector2(p.x * c - p.y * s, p.x * s + p.y * c).multiply(new THREE.Vector2(1.1, .85)); return q.lerp(centres[jet[i].kind], pull).add(new THREE.Vector2(gaussian(r) * .05, gaussian(r) * .05)).clampScalar(-.9, .9).setY(clamp(q.y, -.62, .62)); });
  const P0 = jet.map(o => o.p.clone());
  const P1 = feat(P0, .9, .35, [new THREE.Vector2(-.45, .25), new THREE.Vector2(.5, .2), new THREE.Vector2(0, -.4)]);
  const P2 = feat(P1, -.6, .45, [new THREE.Vector2(.4, -.2), new THREE.Vector2(-.5, -.25), new THREE.Vector2(.05, .4)]);
  const top8 = jet.map((o, i) => [o.pt, i]).sort((a, b) => b[0] - a[0]).slice(0, 8).map(x => x[1]);
  const Umat = top8.map(a => top8.map(b => a === b ? 1 : Math.exp(-jet[a].p.distanceTo(jet[b].p) / .3)));
  const PIPE = {};
  let pipeTall = null;
  function buildPipes(tall) {
    if (pipeTall === tall) return; pipeTall = tall;
    Object.values(PIPE).forEach(o => { V.remove(o.g); o.g.traverse(m => { if (m.geometry) m.geometry.dispose(); if (m.material && m.material.dispose) m.material.dispose(); }); });
    const SP = tall ? 2.35 : 2.75, centre = s => tall ? new THREE.Vector3(0, 2.2 + (2 - s) * SP, 0) : new THREE.Vector3((s - 2) * SP, 2.2, 0);
    const local = (s, x, y, z = .03) => centre(s).add(new THREE.Vector3(x, y, z));
    ['pnet', 'part'].forEach(kind => {
      const g = new THREE.Group(), tint = kind === 'pnet' ? '#a07bff' : '#3fe6c4', plates = [];
      for (let s = 0; s < 5; s++) { const pl = slab(2.15, 1.5, .05, tint); pl.position.copy(centre(s)); g.add(pl); plates.push(pl); }
      const dots = { p: [], c: [], s: [] }, E = { p: [], u: [], w: [], s: [] }, cellsList = [];
      const dot = (v, c, size) => { dots.p.push(v.x, v.y, v.z); dots.c.push(c.r, c.g, c.b); dots.s.push(r(), size, .5 + r(), r()); };
      const edge = (a, b, w, segs = 1, lift = 0) => { const sd = r(); for (let k = 0; k < segs; k++) { const u0 = k / segs, u1 = (k + 1) / segs; const pa = a.clone().lerp(b, u0), pb = a.clone().lerp(b, u1); pa.z += Math.sin(u0 * Math.PI) * lift; pb.z += Math.sin(u1 * Math.PI) * lift; pa.y += Math.sin(u0 * Math.PI) * lift * .6; pb.y += Math.sin(u1 * Math.PI) * lift * .6; E.p.push(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z); E.u.push(u0, u1); E.w.push(w, w); E.s.push(sd, sd); } };
      const jp = (s, P, i) => local(s, P[i].x, P[i].y);
      // Stage 0: the jet itself.
      jet.forEach((o, i) => dot(jp(0, P0, i), KC[o.kind], .05 + .05 * o.pt));
      if (kind === 'pnet') {
        // EdgeConv ×3: each particle talks to its k nearest neighbours; after each block the neighbours are re-picked in feature space.
        [P0, P1, P2].forEach((P, b) => {
          jet.forEach((o, i) => dot(jp(b + 1, P, i), KC[o.kind], .045 + .045 * o.pt));
          knnOf(P, 3).forEach(([a, c]) => edge(jp(b + 1, P, a), jp(b + 1, P, c), .85));
          const prev = b === 0 ? P0 : b === 1 ? P0 : P1, ps = b;
          jet.forEach((o, i) => edge(jp(ps, b === 0 ? P0 : prev, i), jp(b + 1, P, i), .12, 1));   // each particle carries on to the next block
        });
        // Pool: every particle is averaged into one vector, then a small network says which particle made the jet.
        const pc = local(4, -.62, 0);
        jet.forEach((o, i) => edge(jp(3, P2, i), pc, .25));
        for (let k = 0; k < 6; k++) cellsList.push({ x: pc.x, y: pc.y - .45 + k * .18, z: pc.z, w: .2, h: .14, v: Math.sin(k * 1.7) * .8 });
      } else {
        // Each particle becomes a token: no positional encoding, because a set has no order.
        top8.forEach((pi, t) => { const tc = local(1, -.79 + t * .225, -.05); edge(jp(0, P0, pi), local(1, -.79 + t * .225, -.45), .2); for (let k = 0; k < 5; k++) cellsList.push({ x: tc.x, y: tc.y - .36 + k * .17, z: tc.z, w: .14, h: .12, v: Math.sin(pi * 1.3 + k * 2.1) * .9 }); });
        // Particle attention ×8: every pair attends, with a bonus from the pairwise interaction matrix U.
        const tok2 = t => local(2, -.79 + t * .225, -.2);
        top8.forEach((_, t) => dot(tok2(t), PAL.mint, .07));
        for (let a = 0; a < 8; a++) for (let b = a + 1; b < 8; b++) edge(tok2(a), tok2(b), .15 + Umat[a][b] * .85, 8, .35 + Math.abs(a - b) * .06);
        for (let t = 0; t < 8; t++) edge(local(1, -.79 + t * .225, .38), tok2(t), .14);
        // Class attention ×2: one class token gathers the whole jet.
        const ct = local(3, 0, .45), tok3 = t => local(3, -.79 + t * .225, -.3);
        top8.forEach((_, t) => { dot(tok3(t), PAL.mint, .06); edge(tok3(t), ct, .55); edge(tok2(t), tok3(t), .1); });
        cellsList.push({ x: ct.x, y: ct.y, z: ct.z, w: .26, h: .26, v: 1.4, gold: true });
        edge(ct, local(4, -.55, .1), .5);
      }
      // Output: which particle made the jet?
      CLASSES.forEach((_, c) => { const h = .08 + CLASS_P[c] * 1.0, b = local(4, -.15 + c * .22, -.55 + h / 2); cellsList.push({ x: b.x, y: b.y, z: b.z, w: .15, h, v: c === 0 ? 1.4 : .35 }); });
      const dotsM = dotMat(), dotsP = new THREE.Points(geoOf({ position: [dots.p, 3], color: [dots.c, 3], aSeed: [dots.s, 4] }), dotsM); dotsP.frustumCulled = false; g.add(dotsP);
      const eM = edgeMat(tint), eL = new THREE.LineSegments(geoOf({ position: [E.p, 3], aU: [E.u, 1], aW: [E.w, 1], aSeed: [E.s, 1] }), eM); eL.frustumCulled = false; g.add(eL);
      const cs = cells(cellsList.length); cellsList.forEach((o, i) => cs.set(i, o.x, o.y, o.z, o.w, o.h, o.w, o.v, o.gold ? .8 : 0, 1)); cs.commit(); g.add(cs.mesh);
      let um = null;
      if (kind === 'part') { um = heat(8, .085, .012); um.mesh.position.copy(tall ? centre(1.5).add(new THREE.Vector3(1.55, 0, .1)) : centre(1.5).add(new THREE.Vector3(0, 1.3, .1))); for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) um.set(a, b, Umat[a][b] * .9, 0, 1); um.commit(); g.add(um.mesh); }
      V.add(g); PIPE[kind] = { g, plates, dotsM, eM, cs, um, centre };
    });
  }
  const STAGE_TXT = {
    pnet: ['a jet: particles in η–φ', 'EdgeConv 1 · k nearest neighbours', 'EdgeConv 2 · neighbours re-picked in feature space', 'EdgeConv 3', 'average all → which particle made the jet?'],
    part: ['a jet: a set of particles, no order', 'each particle becomes a token', 'attention + pairwise interactions · ×8', 'a class token gathers the jet · ×2', 'which particle made the jet?']
  };
  const stageLabs = { pnet: STAGE_TXT.pnet.map(t => ui.label('arch', `<span class="tag stage-tag">${t}</span>`, 'plain stage-lab')), part: STAGE_TXT.part.map(t => ui.label('arch', `<span class="tag stage-tag">${t}</span>`, 'plain stage-lab')) };
  const classLabs = CLASSES.map((c, i) => ui.label('arch', `<span class="tag class-tag">${c}${i === 0 ? ` <i>${Math.round(CLASS_P[0] * 100)}%</i>` : ''}</span>`, 'plain class-lab'));
  const uLab = ui.label('arch', '<span class="tag stage-tag u-tag">U: every pair’s distance, momentum and mass, added before the softmax</span>', 'plain stage-lab');
  // DFlash: a 3-layer drafter beside a tall model. It drafts a whole block at once; the big model checks the block in one pass.
  const big = [], draft = [];
  for (let j = 0; j < 10; j++) { const s = slab(1.9, .36, 1.3, '#2fe0b4'); s.position.set(2.1, .25 + j * .46, 0); V.add(s); big.push(s); }
  for (let j = 0; j < 3; j++) { const s = slab(1.15, .3, .9, '#ffd36e'); s.position.set(-2.2, .25 + j * .4, 0); V.add(s); draft.push(s); }
  const mini = []; for (let j = 0; j < 8; j++) { const s = slab(3.6, .34, 1.6, '#5ff0c8'); s.position.set(0, .3 + j * .46, 0); V.add(s); mini.push(s); }
  const DRAFTS = [['fast', true], ['on', true], ['real', true], ['chips', false]];
  const draftLabs = DRAFTS.map(([w]) => ui.label('arch', `<span class="tag draft-tag">${w}</span>`, 'plain draft-lab'));
  const fixLab = ui.label('arch', '<span class="tag draft-tag fix">hardware</span>', 'plain draft-lab');
  const bigLab = ui.label('arch', '<span class="tag">the big model</span>', 'plain axis-lab'), drLab = ui.label('arch', '<span class="tag">3-layer drafter</span>', 'plain axis-lab');

  /* ---------- Labels pinned to the parts ---------- */
  const tokLabs = TOKENS.map(t => ui.label('arch', `<span class="tag word-tag">${t}</span>`, 'plain word-lab'));
  const partLab = n => ui.label('arch', `<span class="tag part-tag">${n}</span>`, 'plain part-lab');
  const L = { pe: partLab('positional encoding'), q: partLab('Q · query'), k: partLab('K · key'), v: partLab('V · value'), res: partLab('shortcut + norm'), ff: partLab('feed-forward'), focus: ui.label('arch', '<span class="tag focus-tag"></span>', 'plain focus-lab') };

  /* ---------- Controls: attention heads, then Hafiz's models ---------- */
  const bar = document.createElement('div'); bar.className = 'arch-chips';
  const card = document.createElement('div'); card.className = 'arch-card';
  ctx.$('#scene-ui').append(bar, card);
  let mode = '', head = 1, variant = null, autoVariant = 'part';
  function chips(kind) {
    if (mode === kind) return; mode = kind; bar.innerHTML = '';
    const narrow = innerWidth < 760, SH = { tf: 'Transformer', part: 'ParT', pnet: 'ParticleNet', dflash: 'DFlash' }, HS = ['Word before', 'Who does what', 'Describes'];
    const list = kind === 'heads' ? HEADS.map((h, i) => [i, narrow ? HS[i] : h.name]) : kind === 'models' ? VARIANTS.map(v => [v.key, narrow ? SH[v.key] : v.name]) : [];
    if (list.length) bar.insertAdjacentHTML('beforeend', `<span>${kind === 'heads' ? 'Heads' : 'My models'}</span>`);
    list.forEach(([id, name]) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = name; b.dataset.id = id;
      b.addEventListener('click', () => { if (kind === 'heads') { head = id; score.sfx('chime', { f: 520 + id * 90 }); } else { variant = id; score.sfx('pop'); } syncChips(); });
      bar.append(b);
    });
    syncChips();
  }
  function syncChips() { [...bar.querySelectorAll('button')].forEach(b => b.classList.toggle('on', mode === 'heads' ? +b.dataset.id === head : b.dataset.id === (variant || autoVariant))); }

  /* ---------- Camera: a path of shots (in the build's own progress q), plus a small turn toward the mouse ---------- */
  const SHOTS = [
    [0, [0, 1.6, 12.5], [0, 1.3, 0]], [.08, [-2.8, 2.2, 8.8], [0, 1.25, 0]], [.2, [-2.8, 2.2, 8.8], [0, 1.25, 0]],
    [.25, [3.2, 4.7, 10.2], [0, 3, -1]], [.46, [3.2, 4.7, 10.2], [0, 3, -1]], [.5, [-6.2, 2.7, 7.6], [0, 1.5, .3]], [.56, [-6.2, 2.7, 7.6], [0, 1.5, .3]],
    [.6, [5.6, 2.8, 8.2], [0, 1.35, .8]], [.7, [5.6, 2.8, 8.2], [0, 1.35, .8]], [.82, [8, 12, 27], [-4.6, 8.4, 0]], [.86, [0, 2.9, 14], [0, 2.3, 0]], [1, [0, 2.9, 14], [0, 2.3, 0]]
  ].map(([p, a, b]) => ({ p, pos: new THREE.Vector3(...a), at: new THREE.Vector3(...b) }));
  const OPEN = { pos: MC.clone().add(new THREE.Vector3(4.6, 4.2, 13)), at: MC.clone().add(new THREE.Vector3(0, 0, -.8)) };   // matches the last shot of the space of meaning
  const cpos = new THREE.Vector3(), cat = new THREE.Vector3(), off = new THREE.Vector3(), turn = new THREE.Vector2();
  function shot(p, q) {
    if (p < INTRO) { const e = easeInOut(clamp((p - .05) / (INTRO - .05))); cpos.lerpVectors(OPEN.pos, SHOTS[0].pos, e); cat.lerpVectors(OPEN.at, SHOTS[0].at, e); }
    else { let i = 0; while (i < SHOTS.length - 2 && q > SHOTS[i + 1].p) i++; const A = SHOTS[i], B = SHOTS[i + 1], e = easeInOut(clamp((q - A.p) / Math.max(1e-4, B.p - A.p))); cpos.lerpVectors(A.pos, B.pos, e); cat.lerpVectors(A.at, B.at, e); }
    const k = camera.aspect < 1 ? Math.min(2.6, 1.02 / camera.aspect) : 1;         // phones step back
    off.subVectors(cpos, cat).multiplyScalar(k); cpos.copy(cat).add(off);
  }

  let localP = 0, localQ = 0, focus = -1, hotNode = [-1, -1], lastLevels = -1;
  const wp = new THREE.Vector3();
  function nearest(points, maxD) { let best = -1, bd = maxD; points.forEach((p, i) => { const s = ui.screen(p, camera); const d = Math.hypot(s.x - pointer.x, s.y - pointer.y); if (s.z < 1 && d < bd) { bd = d; best = i; } }); return best; }
  const Q = (a, b) => [INTRO + a * (1 - INTRO), INTRO + b * (1 - INTRO)];   // caption windows written in the build's own progress
  const NOTE = { x: 7, y: 14, cls: 'note', m: { x: 50, y: 11, align: 'center' } };

  return {
    id: 'arch', scene, camera, extra: {},
    captions: [
      { ...NOTE, at: [0, .07], html: 'Take one sentence: <i>I make big models run</i>. Each word is an arrow, really a <b>list of numbers</b>.' },
      { ...NOTE, at: [.065, INTRO], html: 'Stand each list up as a column, one glass cell per number. That is all a transformer ever sees.' },
      { ...NOTE, at: Q(0, .1), html: 'Now build the machine that reads them: a <b>transformer</b>, behind almost every large language model.' },
      { ...NOTE, at: Q(.1, .21), html: 'Order matters: <i>dog bites man</i> isn’t <i>man bites dog</i>. So each token is stamped with a wave, a <b>positional encoding</b>.' },
      { at: Q(.12, .21), html: 'PE(pos, i) = sin(pos / 10000<sup>i/d</sup>)', x: 93, y: 14, cls: 'math', align: 'right', m: { x: 50, y: 77, align: 'center' } },
      { ...NOTE, at: Q(.22, .3), html: 'For <b>self-attention</b>, each token makes a <b>query</b> (what I need), a <b>key</b> (what I offer) and a <b>value</b> (what I carry).' },
      { ...NOTE, at: Q(.3, .4), html: 'Each word looks back and decides which earlier words matter. Brighter beam, more attention.' },
      { at: Q(.29, .46), html: 'softmax(QK<sup>T</sup> / √d) · V', x: 93, y: 14, cls: 'math', align: 'right', m: { x: 50, y: 74, align: 'center' } },
      { at: Q(.3, .46), html: `<span class="hint-dot"></span>${coarse ? 'Tap' : 'Click'} a word to see what it attends to`, x: 50, y: 85, cls: 'hint', align: 'center', m: { y: 78 } },
      { ...NOTE, at: Q(.4, .47), html: 'Each <b>head</b> looks for something different. For my master’s, I rebuilt this block as an FPGA pipeline.' },
      { ...NOTE, at: Q(.48, .57), html: 'A <b>shortcut</b> carries each token around attention; <b>normalisation</b> keeps its numbers in range. Without them, deep models barely train.' },
      { ...NOTE, at: Q(.57, .7), html: 'Then each token passes through a small <b>feed-forward network</b>, the neurons from the film’s start. Most weights live here.' },
      { at: Q(.59, .7), html: `<span class="hint-dot"></span>${coarse ? 'Tap' : 'Hover'} a neuron to fire it`, x: 50, y: 84, cls: 'hint', align: 'center' },
      { at: Q(.71, .76), html: 'That is one block. Now stack it.', x: 7, y: 14, cls: 'big left-big', m: { x: 50, y: 11, align: 'center' } },
      { ...NOTE, at: Q(.76, .83), html: 'GPT-3 stacks <b>96</b> of these blocks, <b>175 billion</b> weights. At <b>Zidong Taichu</b> I worked on serving models like it in vLLM.' },
      { ...NOTE, cls: 'note desk', at: Q(.84, 1.05), html: 'At IHEP I work on transformers for physics, and tiny ones that speed up big ones. These are mine.' }
    ],
    resize(aspect) { camera.aspect = aspect; camera.updateProjectionMatrix(); S = aspect < 1 ? 1.02 : 2; U.uS.value = S; slabs.forEach(s => { s.scale.x = (4 * S + 1.7) / SLAB_W; }); buildPipes(aspect < 1); },
    init() { this.resize(innerWidth / innerHeight); },
    show(on) { if (!on) { bar.classList.remove('on'); card.classList.remove('on'); document.body.style.cursor = ''; } },
    pointer(type) {
      if (type !== 'move' && type !== 'down') return;
      const q = localQ;
      if (localP > INTRO && q > .28 && q < .47) {                                  // attention: focus a word
        const i = nearest(TOKENS.map((_, k) => new THREE.Vector3(X(k), 1.3, 0)), 70);
        if (type === 'down' || !coarse) { if (i !== focus && i >= 0) score.sfx('hover'); if (i >= 0 || type === 'move') focus = i; }
        document.body.style.cursor = i >= 0 ? 'pointer' : '';
      } else if (localP > INTRO && q > .58 && q < .7) {                             // feed-forward: fire a neuron
        const pts = [], ids = [];
        for (let i = 0; i < NT; i++) for (let h = 0; h < H; h++) { const [nx, ny] = NODE(h); pts.push(new THREE.Vector3(X(i) + nx * Math.min(1, S / 2), ny, 1.55)); ids.push([i, h]); }
        const b = nearest(pts, 22);
        if (b >= 0) { const [i, h] = ids[b]; if (i !== hotNode[0] || h !== hotNode[1]) { hotNode = [i, h]; ffU.uFire.value = U.uTime.value; score.sfx('fire', { pan: pointer.ndc.x * .6 }); } }
        document.body.style.cursor = b >= 0 ? 'pointer' : '';
      } else document.body.style.cursor = '';
    },
    update(p, info) {
      const q = clamp((p - INTRO) / (1 - INTRO));
      localP = p; localQ = q;
      const t = info.time, act = info.active, px = pixelScale(renderer, camera);
      U.uTime.value = t; U.uPx.value = px; dust.mat.uniforms.uTime.value = t; dust.mat.uniforms.uPx.value = px;
      spaceMat.uniforms.uTime.value = t; spaceMat.uniforms.uPx.value = px;

      /* The opening: arrows draw out of the origin, then their numbers fly out and stand up as columns. */
      const grow = clamp(p / .045), unroll = clamp((p - .06) / (INTRO - .06));
      spaceMat.uniforms.uArrow.value = grow * (1 - sstep(.08, .12, p));
      spaceMat.uniforms.uCloud.value = 1 - sstep(.07, INTRO + .02, p) * .9;
      spaceMat.uniforms.uAxes.value = 1 - sstep(.06, .11, p);
      spacePts.visible = p < INTRO + .08;
      tipGlow.forEach((s, i) => { s.material.opacity = clamp(grow * 1.4 - i * .08) * (1 - sstep(.07, .1, p)) * .9; });

      /* The phases of the build (in q). */
      const peShow = sstep(.09, .12, q) * (1 - sstep(.2, .23, q));
      const st = q < .1 ? 0 : q < .18 ? (q - .1) / .08 : q < .4 ? 1 : q < .46 ? 1 + (q - .4) / .06 : q < .5 ? 2 : q < .54 ? 2 + (q - .5) / .04 : q < .62 ? 3 : q < .68 ? 3 + (q - .62) / .06 : 4;
      const qkv = sstep(.21, .25, q) * (1 - sstep(.43, .47, q));
      const beams = sstep(.26, .3, q) * (1 - sstep(.45, .48, q)), mx = sstep(.28, .32, q) * (1 - sstep(.45, .48, q));
      const res = sstep(.48, .5, q) * (1 - sstep(.55, .57, q)), ffn = sstep(.57, .6, q) * (1 - sstep(.69, .71, q));
      const comp = sstep(.7, .73, q), vari = sstep(.82, .85, q);
      const levels = q < .7 ? 0 : 1 + Math.floor(clamp((q - .73) / .07) * (LEVELS - .001));
      if (levels !== lastLevels && levels > 0 && act) score.sfx('grow', { i: Math.min(levels, 8) });
      lastLevels = levels;

      /* Cells: along their arrows, then into columns; then values, Q K V, and the first slab. */
      const colFade = 1 - vari;
      for (let i = 0; i < NT; i++) for (let k = 0; k < D; k++) {
        const n = i * D + k, v = valueAt(i, k, st), seen = clamp(grow * 1.3 - (k / D) * .3);
        const stag = easeInOut(clamp(unroll * 1.5 - i * .1 - k * .012));
        const a = MC.clone().addScaledVector(DIRS[i], AL * (k + .5) / D);
        const ty = lerp(cy(k), .9 + (k - (D - 1) / 2) * .095, comp), h = lerp(.17, .075, comp);
        const x = lerp(a.x, X(i), stag), y = lerp(a.y, ty, stag), z = lerp(a.z, 0, stag), sz = lerp(.17, .46, stag);
        const glow = (focus === i && beams > .1 ? .6 : 0) + (st > 1.95 && st < 2.05 ? .4 : 0);
        C.set(n, x, y, z, sz, lerp(.17, h, stag), sz, v, glow, seen * colFade);
        for (let qq = 0; qq < 3; qq++) {
          const m = NT * D + (qq * NT + i) * D + k, e = easeOut(qkv), vq = valueAt(i, (k + qq * 3 + 1) % D, Math.min(st, 1)) * (qq === 2 ? 1 : .8);
          C.set(m, X(i) + .17 * (qq + 1) * e * Math.min(1, S / 2), cy(k), -.62 * (qq + 1) * e, .26, .13, .26, vq, qq === 0 && focus === i ? .5 : 0, qkv * .75);
        }
      }
      C.commit();

      /* Positional encoding, attention, shortcut, feed-forward. */
      waveMat.uniforms.uShow.value = peShow; waveMat.uniforms.uGrow.value = clamp((q - .09) / .06);
      const Hm = HEADS[head].m;
      PAIRS.forEach(([i, j], pi) => { beamMat.uniforms.uW.value[pi] = Hm[i][j] * (focus < 0 ? 1 : focus === i ? 1.6 : .12); });
      beamMat.uniforms.uShow.value = beams;
      M.mat.uniforms.uOpacity.value = mx;
      for (let i = 0; i < NT; i++) for (let j = 0; j < NT; j++) M.set(i, j, j > i ? 0 : Hm[i][j], focus === i ? .6 : 0, j > i ? .35 : 1);
      M.commit(); M.mesh.lookAt(camera.position);
      resMat.uniforms.uShow.value = res;
      ffU.uShow.value = ffn;
      if (ffn > .5 && !coarse && t - ffU.uFire.value > 2.2) { hotNode = [Math.floor(r() * NT), Math.floor(r() * H)]; ffU.uFire.value = t; }   // the network ticks over on its own too
      ffU.uHotT.value = hotNode[0]; ffU.uHotH.value = hotNode[1];

      /* The stack. */
      slabs.forEach((s, j) => { const on = j < levels ? 1 : 0; s.userData.set(on * comp * (1 - vari) * (j === 0 ? 1 : .85), j === 0 ? .3 * (1 - vari) : 0); });
      streamMat.uniforms.uShow.value = comp * (1 - vari); streamMat.uniforms.uTop.value = .9 + Math.max(1, levels) * 1.45;

      /* Hafiz's models. */
      const cur = variant || (q < .875 ? 'part' : q < .915 ? 'pnet' : 'dflash');
      if (!variant && cur !== autoVariant) { autoVariant = cur; syncChips(); }
      const vk = v => vari * (cur === v ? 1 : 0), sweep = (t * .55) % 5;
      ['pnet', 'part'].forEach(kind => {
        const P = PIPE[kind]; if (!P) return; const o = vk(kind);
        P.g.visible = o > .003;
        P.plates.forEach((pl, s) => pl.userData.set(o * .7, Math.max(0, 1 - Math.abs(sweep - s - .5) * 1.4) * .9));   // light sweeps through the stages
        P.dotsM.uniforms.uOpacity.value = o; P.dotsM.uniforms.uTime.value = t; P.dotsM.uniforms.uPx.value = px;
        P.eM.uniforms.uOpacity.value = o; P.eM.uniforms.uTime.value = t;
        P.cs.mat.uniforms.uOpacity.value = o; if (P.um) P.um.mat.uniforms.uOpacity.value = o;
      });
      mini.forEach((s, j) => s.userData.set(vk('tf') * .85, Math.exp(-Math.pow(((t * .9) % 1.6) * 6 - j, 2)) * .8));   // a pulse climbs the mini stack
      const dOn = vk('dflash'), cyc = (t % 5.5) / 5.5;
      big.forEach(s => s.userData.set(dOn, cyc > .5 && cyc < .68 ? .9 : 0));
      draft.forEach(s => s.userData.set(dOn, cyc < .15 ? .9 : 0));            // all three layers at once: one parallel pass drafts the whole block

      /* Words in the world. */
      const show = (lab, pos, on) => ui.place(lab, pos, camera, act && on);
      TOKENS.forEach((_, i) => {
        const tip = MC.clone().addScaledVector(DIRS[i], AL + .25);
        const col0 = new THREE.Vector3(X(i), -.02, .3), e = easeInOut(clamp(unroll * 1.5 - i * .1));
        show(tokLabs[i], p < INTRO ? tip.lerp(col0, e) : col0, (p < INTRO ? grow > .3 + i * .1 : true) && comp < .5);
      });
      show(numLab, MC.clone().addScaledVector(DIRS[3], AL * .55).add(new THREE.Vector3(0, -.45, 0)), p > .025 && p < .075);
      show(L.pe, new THREE.Vector3(X(NT - 1) + .55, 2.6, 0), peShow > .5 && innerWidth >= 760);
      show(L.q, new THREE.Vector3(X(NT - 1) + .17, 2.6, -.62), qkv > .6 && beams < .5);
      show(L.k, new THREE.Vector3(X(NT - 1) + .34, 2.95, -1.24), qkv > .6 && beams < .5);
      show(L.v, new THREE.Vector3(X(NT - 1) + .51, 3.3, -1.86), qkv > .6 && beams < .5);
      show(L.res, new THREE.Vector3(X(4) + .6, 1.4, 1.05), res > .5);
      show(L.ff, new THREE.Vector3(X(2), 2.25, 1.55), ffn > .5);
      const step = .47, o2 = (NT - 1) * step / 2;
      TOKENS.forEach((_, i) => {
        show(rowLabs[i], M.mesh.localToWorld(new THREE.Vector3(-o2 - .45, o2 - i * step, 0)), mx > .5);
        show(colLabs[i], M.mesh.localToWorld(new THREE.Vector3(i * step - o2, o2 + .38, 0)), mx > .5);
      });
      show(mxTitle, M.mesh.localToWorld(new THREE.Vector3(0, -o2 - .45, 0)), mx > .5);
      if (focus >= 0 && beams > .5) {
        const row = Hm[focus], tgt = focus === 0 ? 'only itself: nothing comes before it' : `most at ‘${TOKENS[row.indexOf(Math.max(...row.slice(0, focus)))]}’`;
        L.focus.el.querySelector('.tag').innerHTML = `‘${TOKENS[focus]}’ looks ${tgt}`;
      }
      show(L.focus, new THREE.Vector3(X(focus < 0 ? 0 : focus), 3.4, 0), focus >= 0 && beams > .5);
      stackLab.el.querySelector('.tag').textContent = q > .79 ? '×96 in GPT-3' : `×${Math.max(1, levels)}`;
      show(stackLab, new THREE.Vector3(-(4 * S + 1.7) / 2 - .5, .9 + (Math.max(1, levels) - 1) * 1.45, 0), comp > .5 && vari < .3);
      // The architectures' stage labels, U, and the answer.
      ['pnet', 'part'].forEach(kind => { const P = PIPE[kind]; if (!P) return; stageLabs[kind].forEach((lab, s) => show(lab, V.localToWorld(P.centre(s).add(new THREE.Vector3(0, -.95, 0))), vk(kind) > .5)); });
      const PP = PIPE[cur === 'pnet' ? 'pnet' : 'part'];
      CLASSES.forEach((_, c) => show(classLabs[c], V.localToWorld(PP.centre(4).add(new THREE.Vector3(-.15 + c * .22, -.68, .1))), (vk('pnet') > .5 || vk('part') > .5) && c === 0));
      if (PIPE.part) show(uLab, V.localToWorld(pipeTall ? PIPE.part.centre(1.5).add(new THREE.Vector3(1.55, -.6, .1)) : PIPE.part.centre(1.5).add(new THREE.Vector3(0, 2.2, .1))), vk('part') > .5);
      // DFlash: the drafted block flies over together, is checked in one pass, and the first miss is fixed.
      const fly = clamp((cyc - .15) / .3), land = cyc > .68;
      DRAFTS.forEach(([, ok], k) => {
        const a = V.localToWorld(new THREE.Vector3(-2.2 + (k - 1.5) * .62, 1.75, 0)), b = V.localToWorld(new THREE.Vector3(1.2 + k * .6, 4.95, 0));
        const pos = a.clone().lerp(b, easeInOut(fly)); pos.y += Math.sin(fly * Math.PI) * .7;
        draftLabs[k].el.classList.toggle('ok', land && ok); draftLabs[k].el.classList.toggle('no', land && !ok);
        show(draftLabs[k], pos, dOn > .5 && cyc > .15 && cyc < .97);
      });
      show(fixLab, V.localToWorld(new THREE.Vector3(1.2 + 3 * .6, 5.45, 0)), dOn > .5 && cyc > .76 && cyc < .97);
      show(bigLab, V.localToWorld(new THREE.Vector3(2.1, -.2, .7)), dOn > .5);
      show(drLab, V.localToWorld(new THREE.Vector3(-2.2, -.2, .5)), dOn > .5);

      /* Controls. */
      chips(p > INTRO && q > .28 && q < .47 ? 'heads' : q > .83 ? 'models' : '');
      bar.classList.toggle('on', act && mode !== '');
      const vv = VARIANTS.find(v => v.key === cur);
      if (card.dataset.k !== cur) { card.dataset.k = cur; card.innerHTML = `<b>${vv.name}</b><p>${vv.text}</p>`; }
      card.classList.toggle('on', act && q > .84);

      /* Camera. */
      shot(p, q);
      const want = pointer.inside && !coarse ? pointer.ndc : null;
      turn.x += ((want ? want.x : 0) - turn.x) * Math.min(1, info.dt * 2); turn.y += ((want ? want.y : 0) - turn.y) * Math.min(1, info.dt * 2);
      off.subVectors(cpos, cat).applyAxisAngle(new THREE.Vector3(0, 1, 0), -turn.x * .1); off.y += turn.y * .5;
      camera.position.copy(cat).add(off); camera.lookAt(cat);
    }
  };
}
