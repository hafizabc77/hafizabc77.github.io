/* Act IV, scene 10: tuning the settings training cannot learn.
   It opens on the last frame of overfitting: the loss chart with the best checkpoint flagged. Both curves roll up
   into that one number, the run's loss on unseen data, which becomes the first point on a new board: that loss
   against the learning rate. Bayesian
   optimisation then works live on that board: a Gaussian-process guess of the curve (line) with its uncertainty
   (band), the expected improvement below (gold), and the next try landing where it is highest. You can click to
   run tries yourself. Then the camera flies to where Hafiz used it: LHAASO-WCDA, 4,410 m up in Sichuan, its three
   pools of water Cherenkov cells flashing with cosmic-ray showers. GRB 221009A arrives, the tuning tries tick by
   and the search's significance climbs to the paper's 11.5σ; the paper itself then opens as a card. */
import * as THREE from 'three';
import { additive, POINT_FRAG, col, rng, sstep, clamp, lerp, easeInOut, easeOut, pixelScale, glowTexture, noise3 } from '../core/util.js';
import { cells, slab, motes } from '../core/glass.js';
import { fitData, LOSS_CHART } from './overfit.js';
import { NB, MODEL, blockY, MODEL_SHOT } from './compress.js';

/* The hidden truth for the demo: a run's loss on unseen data, against the learning rate on a log scale
   (x = 0 is 0.0001, x = 1 is 1). A valley near 0.008, a smaller dip at very low rates, and divergence at high ones. */
const sm = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const F = x => .2725 + 6 * (x - .47) * (x - .47) - .25 * Math.exp(-Math.pow((x - .18) / .06, 2)) + sm(.84, .97, x) + .04 * Math.sin(13 * x);
const LR = x => Math.pow(10, x * 4 - 4);
const fmtLR = x => { const v = LR(x); return v >= .995 ? '1' : v >= .01 ? v.toFixed(2) : v >= .001 ? v.toFixed(3) : v.toFixed(4); };
const YMAX = 2.2;

/* A Gaussian process with a squared-exponential kernel, and expected improvement (for a loss: lower is better). */
const ELL = .13, SF2 = .35, NOISE = 2e-4, N = 161, GRID = Array.from({ length: N }, (_, i) => i / (N - 1));
const erf = x => { const s = Math.sign(x); x = Math.abs(x); const t = 1 / (1 + .3275911 * x); return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - .284496736) * t + .254829592) * t * Math.exp(-x * x)); };
const phi = z => Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI), Phi = z => .5 * (1 + erf(z / Math.SQRT2));
function posterior(xs, ys) {
  const n = xs.length, m = ys.reduce((a, b) => a + b, 0) / n, k = (a, b) => SF2 * Math.exp(-(a - b) * (a - b) / (2 * ELL * ELL));
  const C = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let s = k(xs[i], xs[j]) + (i === j ? NOISE : 0);
    for (let q = 0; q < j; q++) s -= C[i][q] * C[j][q];
    C[i][j] = i === j ? Math.sqrt(Math.max(s, 1e-12)) : s / C[j][j];
  }
  const fwd = b => { const z = new Float64Array(n); for (let i = 0; i < n; i++) { let s = b[i]; for (let q = 0; q < i; q++) s -= C[i][q] * z[q]; z[i] = s / C[i][i]; } return z; };
  const back = z => { const x = new Float64Array(n); for (let i = n - 1; i >= 0; i--) { let s = z[i]; for (let q = i + 1; q < n; q++) s -= C[q][i] * x[q]; x[i] = s / C[i][i]; } return x; };
  const alpha = back(fwd(ys.map(y => y - m))), best = Math.min(...ys);
  const mu = new Float32Array(N), sd = new Float32Array(N), ei = new Float32Array(N);
  GRID.forEach((x, g) => {
    const ks = xs.map(xi => k(x, xi)); let mm = m; for (let i = 0; i < n; i++) mm += ks[i] * alpha[i];
    const v = fwd(ks); let vv = SF2; for (let i = 0; i < n; i++) vv -= v[i] * v[i];
    const s = Math.sqrt(Math.max(vv, 1e-8)), d = best - mm - .01, z = d / s;
    mu[g] = mm; sd[g] = s; ei[g] = Math.max(0, d * Phi(z) + s * phi(z));
  });
  let arg = 0; for (let g = 1; g < N; g++) if (ei[g] > ei[arg]) arg = g;
  return { mu, sd, ei, best, next: GRID[arg] };
}

/* LHAASO-WCDA, to scale (1 unit = 20 m): one 300 × 110 m pool of 60 × 22 cells above two 150 × 150 m pools of
   30 × 30 cells: 3,120 cells, each with its light sensor. */
const POOLS = [[-150, 22, 60, 22], [-151, -130, 30, 30], [1, -130, 30, 30]];
const SIGMA = [3.1, 6.2, 8.4, 9.9, 10.9, 11.5];   // the tries' significance: steps illustrative, the last is the paper's result

export default function tuning(ctx) {
  const { small, ui, score, pointer, renderer, coarse } = ctx;
  const scene = new THREE.Scene();
  scene.background = col('#05070a');
  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, .05, 600);
  const r = rng(1221);
  let tall = false;
  const geoOf = attrs => { const g = new THREE.BufferGeometry(); Object.entries(attrs).forEach(([k, [arr, n]]) => g.setAttribute(k, new THREE.Float32BufferAttribute(arr, n))); return g; };
  const heatGLSL = `vec3 heat(float t) { vec3 c0 = vec3(.15, .8, .9), c1 = vec3(.2, .6, .58), c2 = vec3(1., .64, .26), c3 = vec3(1., .3, .2); return t < .33 ? mix(c0, c1, t / .33) : t < .66 ? mix(c1, c2, (t - .33) / .33) : mix(c2, c3, (t - .66) / .34); }`;
  const ptsMat = (size, color, extra = '') => additive({ uniforms: { uPx: { value: 1000 }, uOpacity: { value: 0 } },
    vertexShader: `attribute float aU; uniform float uPx, uOpacity; varying vec3 vColor; varying float vAlpha;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = max(1., uPx * ${size.toFixed(3)} / -mv.z);
        vColor = vec3(${color.map(c => c.toFixed(3)).join(',')}); vAlpha = uOpacity ${extra}; }`, fragmentShader: POINT_FRAG });
  const dyn = n => { const g = new THREE.BufferGeometry(), p = new Float32Array(n * 3), u = new Float32Array(n); for (let i = 0; i < n; i++) u[i] = i / (n - 1); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('aU', new THREE.BufferAttribute(u, 1)); return { g, p }; };

  const dust = motes(small ? 160 : 360, [60, 18, 36], '#9fdcff'); scene.add(dust.pts);

  /* ---------- The board: first training's loss-over-time chart, then the tuning board ---------- */
  const PLC = new THREE.Vector3(-16, 5.2, 0), CW = 15, CHH = 7.4;
  const board = slab(CW, CHH, .05, '#8fe8ff'); board.position.copy(PLC); scene.add(board);
  // Overfitting's last frame, rebuilt: its loss chart with both curves and the best checkpoint flagged.
  const { CURVES, best } = fitData(), LCK = LOSS_CHART, bestQ = CURVES[0].find(o => o.s >= best[0]) || CURVES[0][0];
  const RUN_END = new THREE.Vector3(LCK.x(PLC, best[0]), LCK.y(PLC, bestQ.va), PLC.z + .06);
  const lp = [], lc = [], lu = [];
  CURVES[0].forEach(o => { lp.push(LCK.x(PLC, o.s), LCK.y(PLC, o.tr), .06); lc.push(1, .78, .4); lu.push(o.s); });
  CURVES[0].forEach(o => { lp.push(LCK.x(PLC, o.s), LCK.y(PLC, o.va), .06); lc.push(.4, .92, 1); lu.push(o.s); });
  const runMat = additive({ uniforms: { uPx: { value: 1000 }, uOpacity: { value: 1 }, uC: { value: 0 }, uEnd: { value: RUN_END.clone() } },
    vertexShader: `attribute vec3 color; attribute float aU; uniform float uPx, uOpacity, uC; uniform vec3 uEnd; varying vec3 vColor; varying float vAlpha;
      void main() { float c = smoothstep(0., 1., clamp(uC * 1.5 - abs(aU - ${best[0].toFixed(3)}) * .6, 0., 1.)); vec3 p = mix(position, uEnd, c);
        vec4 mv = modelViewMatrix * vec4(p, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = max(1., uPx * .045 / -mv.z);
        vColor = color; vAlpha = uOpacity * (1. - c * .7); }`, fragmentShader: POINT_FRAG });
  const run = new THREE.Points(geoOf({ position: [lp, 3], color: [lc, 3], aU: [lu, 1] }), runMat); run.frustumCulled = false; scene.add(run);
  const flagRep = new THREE.Mesh(new THREE.ConeGeometry(.09, .22, 3), new THREE.MeshBasicMaterial({ color: 0x7ff0c0, transparent: true, opacity: 1 }));
  flagRep.position.copy(RUN_END).add(new THREE.Vector3(0, .28, .02)); flagRep.rotation.z = Math.PI; scene.add(flagRep);
  const GOLD_T = col('#ffd27a'), CYAN_T = col('#8fe8ff'), tintNow = new THREE.Color();

  // The tuning board's layout (wider on a desk, taller on a phone).
  let BW = CW, BH = CHH, BX0, BXW, BY0, BYH, EY0, EYH;
  const layout = () => { BW = tall ? 9.6 : CW; BH = tall ? 10.4 : CHH; BX0 = PLC.x - BW / 2 + .9; BXW = BW - 1.6; BY0 = PLC.y - BH / 2 + (tall ? 2.3 : 1.85); BYH = PLC.y + BH / 2 - .55 - BY0; EY0 = PLC.y - BH / 2 + .3; EYH = tall ? 1.5 : 1.15; };
  layout();
  const bx = x => BX0 + clamp(x, 0, 1) * BXW, by = y => BY0 + clamp(y, -.05, YMAX + .15) / YMAX * BYH;
  const M = 480;
  const meanL = dyn(M), meanPts = new THREE.Points(meanL.g, ptsMat(.05, [.33, .85, 1])); meanPts.frustumCulled = false; scene.add(meanPts);
  const trueL = dyn(M), truePts = new THREE.Points(trueL.g, ptsMat(.035, [1, .95, .85], '* step(.45, fract(aU * 70.))')); truePts.frustumCulled = false; scene.add(truePts);
  const eiL = dyn(M), eiPts = new THREE.Points(eiL.g, ptsMat(.045, [1, .77, .4])); eiPts.frustumCulled = false; scene.add(eiPts);
  const strip = color => { const g = new THREE.BufferGeometry(), p = new Float32Array(N * 2 * 3), idx = []; for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setIndex(idx); const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: col(color), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); m.frustumCulled = false; scene.add(m); return { m, p, g }; };
  const band = strip('#53d8ff'), eiFill = strip('#ffb34d');
  const axesG = new THREE.BufferGeometry(); axesG.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18), 3));
  const axes = new THREE.LineSegments(axesG, new THREE.LineBasicMaterial({ color: 0xcfefff, transparent: true, opacity: 0 })); scene.add(axes);
  const markG = new THREE.BufferGeometry(); markG.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
  const marks = new THREE.LineSegments(markG, new THREE.LineBasicMaterial({ color: 0xffd38a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending })); scene.add(marks);
  // Every try is a gold ball, like the one that rolled down the loss curve. The first is that run.
  const DOTS = 24, dotO = new Float32Array(DOTS);
  const dotGeo = new THREE.SphereGeometry(1, 24, 16); dotGeo.setAttribute('aO', new THREE.InstancedBufferAttribute(dotO, 1));
  const dots = new THREE.InstancedMesh(dotGeo, new THREE.ShaderMaterial({ transparent: true, depthWrite: false,
    vertexShader: 'attribute float aO; varying vec3 vN, vV; varying float vO; void main() { vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.); vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal); vV = normalize(cameraPosition - w.xyz); vO = aO; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: 'varying vec3 vN, vV; varying float vO; void main() { float mu = max(dot(normalize(vN), normalize(vV)), 0.); gl_FragColor = vec4(mix(vec3(.85, .55, .2), vec3(1., .9, .7), pow(mu, 2.)) * (.55 + .4 * mu) * vO, vO); }' }), DOTS);
  dots.frustumCulled = false; dots.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(dots);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: col('#ffc27a'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: .3 })); glow.scale.setScalar(.75); scene.add(glow);
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), s4 = new THREE.Vector3(), v4 = new THREE.Vector3();

  // The tries: the run we watched, a second guess, then Bayesian optimisation's picks, then yours.
  const auto = [{ x: .65, born: -99 }], mine = [];
  let post = null, postKey = '';
  const muD = new Float32Array(N), sdD = new Float32Array(N), eiD = new Float32Array(N); let eiMax = .01, gpReady = false;
  const allTries = () => auto.concat(mine);
  function refit() {
    const tr = allTries(), key = tr.map(o => o.x.toFixed(4)).join(',');
    if (key === postKey) return; postKey = key;
    post = posterior(tr.map(o => o.x), tr.map(o => F(o.x)));
    if (!gpReady) { muD.set(post.mu); sdD.set(post.sd); eiD.set(post.ei); gpReady = true; }
  }

  /* ---------- LHAASO: the mountain, the sky, the array ---------- */
  const WC = new THREE.Vector3(-16, -4, -34);
  const wcda = new THREE.Group(); wcda.position.copy(WC); scene.add(wcda);
  const cx = [], cz = [];
  POOLS.forEach(([x0, y0, nc, nr]) => { for (let rr = 0; rr < nr; rr++) for (let c = 0; c < nc; c++) { cx.push((x0 + (c + .5) * 5) / 20); cz.push(-(y0 + (rr + .5) * 5) / 20); } });
  const CN = cx.length, tank = cells(CN), bgE = new Float32Array(CN), sgE = new Float32Array(CN);
  wcda.add(tank.mesh);
  const poolLines = []; POOLS.forEach(([x0, y0, nc, nr]) => { const a = x0 / 20, b = (x0 + nc * 5) / 20, z0 = -y0 / 20, z1 = -(y0 + nr * 5) / 20; poolLines.push(a, 0, z0, b, 0, z0, b, 0, z0, b, 0, z1, b, 0, z1, a, 0, z1, a, 0, z1, a, 0, z0); });
  const poolEdges = new THREE.LineSegments(geoOf({ position: [poolLines, 3] }), new THREE.LineBasicMaterial({ color: 0x7fdcff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); wcda.add(poolEdges);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), new THREE.ShaderMaterial({ uniforms: { uO: { value: 0 } }, transparent: true, depthWrite: false,
    vertexShader: 'varying vec3 vL; void main() { vL = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: 'uniform float uO; varying vec3 vL; void main() { float d = length(vL.xy); float k = exp(-d * .035); gl_FragColor = vec4(vec3(.012, .02, .028) * k * uO + vec3(.01, .025, .035) * exp(-d * .15) * uO, uO); }' }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -.06; ground.renderOrder = -3; wcda.add(ground);
  // Two ridges of mountains, moonlit on their edges, and the high-altitude sky above them.
  const nz = noise3(77), ridges = new THREE.Group(); wcda.add(ridges);
  [[-70, .85, '#020307', 0], [-48, .6, '#03050a', 0]].forEach(([z, amp, c, rim]) => {
    const n = 220, pos = [], idx = [], top = [];
    for (let i = 0; i < n; i++) {
      const x = -150 + 300 * i / (n - 1), h = (6 + 9 * (nz(x * .018, z, 1) * .5 + .5) + 4 * Math.abs(nz(x * .06, z * 2, 3))) * amp + (Math.abs(x) < 25 ? -2 : 0);
      pos.push(x, -1, z, x, h, z); top.push(x, h + .05, z);
      if (i < n - 1) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: col(c), transparent: true, opacity: 0 })); ridges.add(mesh);
    const tl = new THREE.Line(geoOf({ position: [top, 3] }), new THREE.LineBasicMaterial({ color: 0x7fa8d8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending })); tl.userData.rim = rim; ridges.add(tl);
  });
  const horizon = new THREE.Mesh(new THREE.PlaneGeometry(420, 70), new THREE.ShaderMaterial({ uniforms: { uO: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec2 vU; void main() { vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: 'uniform float uO; varying vec2 vU; void main() { float g = exp(-vU.y * 5.) * smoothstep(0., .25, vU.x) * smoothstep(1., .75, vU.x); gl_FragColor = vec4(vec3(.05, .09, .16) * g * uO, 1.); }' }));
  horizon.position.set(0, 26, -96); horizon.renderOrder = -4; ridges.add(horizon);
  const SN = small ? 900 : 2200, sp = [], sa = [];
  for (let i = 0; i < SN; i++) { const a = r() * Math.PI * 2, e = Math.pow(r(), .7) * 1.35 + .03, R = 220; sp.push(Math.cos(a) * Math.cos(e) * R, Math.sin(e) * R - 10, Math.sin(a) * Math.cos(e) * R - 40); sa.push(.25 + Math.pow(r(), 3) * .75); }
  const starMat = additive({ uniforms: { uPx: { value: 1000 }, uOpacity: { value: 0 } },
    vertexShader: 'attribute float aU; uniform float uPx, uOpacity; varying vec3 vColor; varying float vAlpha; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = max(1., uPx * (.18 + aU * .5) / -mv.z); vColor = mix(vec3(.7, .8, 1.), vec3(1., .95, .85), aU); vAlpha = uOpacity * aU; }', fragmentShader: POINT_FRAG });
  const stars = new THREE.Points(geoOf({ position: [sp, 3], aU: [sa, 1] }), starMat); stars.frustumCulled = false; wcda.add(stars);
  // GRB 221009A: a point of light in the sky, and its gamma rays raining onto the array.
  const SRC = new THREE.Vector3(-8, 12, -26);
  const grb = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: col('#ffe2a0'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 })); grb.position.copy(SRC); wcda.add(grb);
  const RAIN = small ? 160 : 320, rainP = new Float32Array(RAIN * 3), rainT = [], rainS = [];
  for (let i = 0; i < RAIN; i++) { const k = Math.floor(r() * CN); rainT.push(new THREE.Vector3(cx[k], 0, cz[k])); rainS.push(r()); }
  const rainG = new THREE.BufferGeometry(); rainG.setAttribute('position', new THREE.BufferAttribute(rainP, 3)); rainG.setAttribute('aU', new THREE.Float32BufferAttribute(rainS, 1));
  const rainMat = ptsMat(.06, [1, .85, .5]); const rain = new THREE.Points(rainG, rainMat); rain.frustumCulled = false; wcda.add(rain);
  const GDIR = new THREE.Vector2(-SRC.x, -SRC.z).normalize();   // the showers' fronts sweep across in the burst's direction
  // The search's light curve: gamma rays per time bin, floating behind the array.
  const BINS = 48, LCW = 12, LCH = 3.1, LC = new THREE.Vector3(0, 4.7, -7.8);
  const lcPanel = slab(LCW + .6, LCH + .9, .05, '#ffd38a'); lcPanel.position.copy(LC); wcda.add(lcPanel);
  const lcBars = cells(BINS); wcda.add(lcBars.mesh);
  const lcNoise = Array.from({ length: BINS }, () => .5 + r() * .35);
  const spike = i => i < 24 ? 0 : 2.3 * Math.exp(-(i - 24) / 5.5) * (1 - Math.exp(-(i - 23) * 1.1));
  // The model that has to keep up, descending above the array at the very end (Act V opens on it).
  const MDL = new THREE.Vector3(0, 2.9, 1.2), mdl = new THREE.Group(); wcda.add(mdl);
  const mdlBlocks = Array.from({ length: NB }, (_, j) => { const b = slab(MODEL.w, MODEL.h, MODEL.d); b.position.set(0, blockY(j) - MODEL.y0, 0); mdl.add(b); return b; });
  const showers = [];
  function shower(x, z, sig, E = 1) { showers.push({ x, z, t0: ctx.time, dur: sig ? .32 : .5, R: sig ? 1.8 : 3.2, r0: sig ? .45 : 1.1, E, sig, dx: sig ? GDIR.x : Math.cos(r() * 6.283), dz: sig ? GDIR.y : Math.sin(r() * 6.283) }); }

  /* ---------- Labels, the tuning readout, the paper ---------- */
  const L = (html, cls) => ui.label('tune', html, cls);
  const runTag = L('<span class="tag loss-tag">loss 0.50</span>', 'plain loss-lab');
  const axXl = L('<span class="tag">learning rate →</span>', 'plain axis-lab'), axYl = L('<span class="tag">loss on unseen data<small>lower is better</small></span>', 'plain axis-lab');
  const ticks = [0, .5, 1].map(x => [x, L(`<span class="tag">${fmtLR(x)}</span>`, 'plain tick-lab')]);
  const meanLab = L('<span class="tag">best guess</span>', 'plain gp-lab mean'), bandLab = L('<span class="tag">how unsure</span>', 'plain gp-lab band');
  const eiLab = L('<span class="tag">where a better result is likely</span>', 'plain gp-lab ei'), nextLab = L('<span class="tag">next try</span>', 'plain gp-lab next');
  const tryLab = L('<span class="tag"></span>', 'plain try-lab'), bestLab = L('<span class="tag"></span>', 'plain try-lab best');
  const trueLab = L('<span class="tag">the true curve<small>never seen in practice</small></span>', 'plain gp-lab true');
  const hoverLab = L('<span class="tag"></span>', 'plain gp-lab hover');
  const placeLab = L('<span class="tag">LHAASO<small>4,410 m · Haizi Mountain, Sichuan</small></span>', 'plain place-lab');
  const poolLabs = [L('<span class="tag">1,320 cells<small>300 × 110 m</small></span>', 'plain pool-lab'), L('<span class="tag">900 cells<small>150 × 150 m</small></span>', 'plain pool-lab'), L('<span class="tag">900 cells<small>150 × 150 m</small></span>', 'plain pool-lab')];
  const showerLab = L('<span class="tag">a cosmic-ray shower</span>', 'plain pool-lab');
  const grbLab = L('<span class="tag">GRB 221009A<small>9 October 2022</small></span>', 'plain grb-lab');
  const sigLab = L('<span class="tag"><b>3.1σ</b></span>', 'plain sig-lab'), lcLab = L('<span class="tag">gamma rays found · time →</span>', 'plain axis-lab');
  const hud = document.createElement('div'); hud.className = 'bo-hud';
  hud.innerHTML = `<small>Bayesian optimisation · tuning the search</small><div class="bo-tries">${SIGMA.map(() => '<i></i>').join('')}<span>try <b>1</b> of ${SIGMA.length}</span></div><div class="bo-sig"><b>3.1σ</b><span>on GRB 221009A</span></div><em>steps illustrative · final value from the paper</em>`;
  const card = document.createElement('aside'); card.className = 'paper-card';
  card.innerHTML = `<div class="pc-img"><img src="../assets/showcase/paper-grb.webp" alt="The first page of the paper: title, authors and affiliations" loading="lazy"></div>
    <div class="pc-body"><small>My paper · CHEP 2024 · first author</small>
    <h3>Enhancing GRB Detection: Bayesian Optimization of Triggerless Data Analysis for LHAASO-WCDA</h3>
    <p>Mustofa, Cheng, Yao · <i>EPJ Web of Conferences</i> 337, 01330 (2025)</p>
    <ul><li><b>11.5σ</b> on GRB 221009A</li><li>gamma rays below <b>100 GeV</b> that trigger methods missed</li></ul>
    <a class="pc-btn" href="https://doi.org/10.1051/epjconf/202533701330" target="_blank" rel="noopener">Read the paper <span aria-hidden="true">↗</span></a></div>`;
  ctx.$('#scene-ui').append(hud, card);

  /* ---------- Camera ---------- */
  const cpos = new THREE.Vector3(), cat = new THREE.Vector3(), off = new THREE.Vector3(), turn = new THREE.Vector2(), tmp = new THREE.Vector3();
  const k = () => camera.aspect < 1 ? Math.min(2.4, 1 / camera.aspect) : 1;
  const fitBoard = () => { const d = (BW + 1.1) / camera.aspect / (2 * Math.tan(THREE.MathUtils.degToRad(21))); return [PLC.clone().add(new THREE.Vector3(0, .3, d)), PLC.clone().add(new THREE.Vector3(0, .3, 0))]; };
  const scaled = (A, kk) => [A[1].clone().add(A[0].clone().sub(A[1]).multiplyScalar(kk)), A[1]];
  function shot(p) {
    const K = k();
    const OPEN = tall ? [PLC.clone().add(new THREE.Vector3(0, .1, 15.5)), PLC.clone().add(new THREE.Vector3(0, .1, 0))] : [PLC.clone().add(new THREE.Vector3(0, .1, 9)), PLC.clone().add(new THREE.Vector3(0, .1, 0))];   // overfitting's last shot
    const BO = tall ? fitBoard() : [PLC.clone().add(new THREE.Vector3(0, .45, 18.5)), PLC.clone().add(new THREE.Vector3(0, .45, 0))];
    const W = (a, b) => scaled([WC.clone().add(a), WC.clone().add(b)], K);
    const AIR = W(new THREE.Vector3(0, 10.5, 15.5), new THREE.Vector3(0, 0, -.5));
    const ARR = W(new THREE.Vector3(3, 7.2, 12.5), new THREE.Vector3(0, .4, -1));
    const BURST = tall ? W(new THREE.Vector3(0, 6.5, 17.5), new THREE.Vector3(-.4, 3.6, -4)) : W(new THREE.Vector3(5, 6, 15), new THREE.Vector3(-1, 3, -4));
    const CARD = tall ? W(new THREE.Vector3(2.5, 7.5, 15), new THREE.Vector3(-1, 1.2, -4)) : W(new THREE.Vector3(8, 5.6, 16.5), new THREE.Vector3(3.6, 2.8, -4));
    const MEND = W(MDL.clone().add(new THREE.Vector3(0, MODEL_SHOT.up, MODEL_SHOT.back)), MDL);   // the first frame of Act V
    const seq = [[0, OPEN], [.05, OPEN], [.13, BO], [.46, BO], [.56, AIR], [.6, ARR], [.7, ARR], [.76, BURST], [.86, BURST], [.9, CARD], [.92, CARD], [.945, MEND], [1, MEND]];
    let i = 0; while (i < seq.length - 2 && p > seq[i + 1][0]) i++;
    const [pa, A] = seq[i], [pb, B] = seq[i + 1], e = easeInOut(clamp((p - pa) / Math.max(1e-4, pb - pa)));
    cpos.lerpVectors(A[0], B[0], e); cat.lerpVectors(A[1], B[1], e);
  }

  let localP = 0, hoverX = -1, sigShow = SIGMA[0], lastTries = 0, nextBg = 0, firstShower = null;
  const ray = new THREE.Raycaster(), boardPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -WC.y), hp = new THREE.Vector3();
  const boardX = () => { ray.setFromCamera(pointer.ndc, camera); if (!ray.ray.intersectPlane(boardPlane, hp)) return -1; const x = (hp.x - BX0) / BXW; return x >= 0 && x <= 1 && hp.y > EY0 - .2 && hp.y < BY0 + BYH + .3 ? x : -1; };
  const groundAt = () => { ray.setFromCamera(pointer.ndc, camera); if (!ray.ray.intersectPlane(groundPlane, hp)) return null; const x = hp.x - WC.x, z = hp.z - WC.z; return x > -7.8 && x < 7.8 && z > -6.9 && z < 6.8 ? [x, z] : null; };
  const boInteractive = () => localP > .17 && localP < .46, wcInteractive = () => localP > .56 && localP < 1;

  return {
    id: 'tune', scene, camera, extra: {},
    captions: [
      { at: [0, .1], html: 'This run used a learning rate of <b>0.04</b> and scored <b>0.50</b> on unseen data. But the rate was a guess.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.1, .17], html: 'Each try is a whole training run, so we can’t try them all.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.17, .24], html: '<b>Bayesian optimisation</b> guesses the rest: a best-guess curve from the tries so far, and a band for how unsure it is.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.24, .3], html: 'It tries next where a better result is likeliest: where the guess is low or the doubt wide (the gold curve).', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.3, .46], html: 'Each result sharpens the guess. In a handful of runs it finds the best rate.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.19, .46], html: `<span class="hint-dot"></span>${coarse ? 'Tap' : 'Click'} the board to run a try yourself`, x: 50, y: 92, cls: 'hint', align: 'center', m: { x: 50, y: 86 } },
      { at: [.47, .56], html: 'I used it at <b>LHAASO</b>, an observatory 4,410 m up in Sichuan, to hunt gamma-ray bursts.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.56, .64], html: 'Its water Cherenkov array, <b>WCDA</b>, has 3,120 sensors in three pools. Cosmic-ray showers light them up constantly.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.64, .72], html: 'A trigger throws faint showers away. A <b>triggerless</b> search keeps everything to find bursts in the noise, but has settings to tune.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.58, .72], html: `<span class="hint-dot"></span>${coarse ? 'Tap' : 'Click'} the array to drop a shower`, x: 50, y: 92, cls: 'hint', align: 'center', m: { x: 50, y: 86 } },
      { at: [.72, .86], html: 'I tuned them with Bayesian optimisation. On <b>GRB 221009A</b>, the brightest burst ever recorded, it reached <b>11.5σ</b>.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center', html: 'I tuned them with Bayesian optimisation. On <b>GRB 221009A</b>, the brightest burst ever recorded, it reached <b>11.5σ</b>.' } },
      { at: [.86, .92], html: 'It also caught gamma rays below 100 GeV that trigger methods missed. I presented it at CHEP 2024 in Kraków.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.92, 1.1], html: 'Here a model must keep up with 3,120 sensors, on chips by the detector. Making models small and fast is most of my work.', x: 50, y: 14, cls: 'note center-note', align: 'center' }
    ],
    resize(aspect) { camera.aspect = aspect; camera.updateProjectionMatrix(); tall = aspect < 1; layout(); SRC.y = tall ? 8 : 12; grb.position.copy(SRC); },
    init() { this.resize(innerWidth / innerHeight); },
    show(on) { if (!on) { hud.classList.remove('on'); card.classList.remove('on'); document.body.style.cursor = ''; } },
    pointer(type) {
      if (boInteractive()) {
        hoverX = boardX();
        if (type === 'down' && hoverX >= 0 && mine.length < 12 && !allTries().some(o => Math.abs(o.x - hoverX) < .015)) { mine.push({ x: hoverX, born: ctx.time, mine: true }); score.sfx('pop'); }
        document.body.style.cursor = hoverX >= 0 ? 'crosshair' : '';
      } else if (wcInteractive()) {
        const g = groundAt(); hoverX = -1;
        if (type === 'down' && g) { shower(g[0], g[1], false, 1.2); score.sfx('spark'); if (!firstShower) firstShower = { x: g[0], z: g[1], t: ctx.time }; }
        document.body.style.cursor = g ? 'pointer' : '';
      } else { hoverX = -1; document.body.style.cursor = ''; }
    },
    update(p, info) {
      localP = p;
      const t = info.time, act = info.active, dt = info.dt, px = pixelScale(renderer, camera);
      [runMat, meanPts.material, truePts.material, eiPts.material, starMat, rainMat].forEach(m => { m.uniforms.uPx.value = px; });
      dust.mat.uniforms.uTime.value = t; dust.mat.uniforms.uPx.value = px;
      const boardOn = 1 - sstep(.46, .53, p), wOn = sstep(.45, .54, p);

      /* The opening: both curves roll up into the saved checkpoint's loss; the small chart grows into the tuning board. */
      const cRoll = easeInOut(clamp((p - .05) / .06)), morph = easeInOut(clamp((p - .06) / .07));
      runMat.uniforms.uC.value = cRoll; runMat.uniforms.uOpacity.value = 1 - sstep(.1, .125, p); run.visible = p < .125;
      flagRep.material.opacity = 1 - sstep(.05, .08, p); flagRep.visible = p < .08;
      board.scale.set(lerp(LCK.W / CW, BW / CW, morph), lerp(LCK.H / CHH, BH / CHH, morph), 1); board.userData.set(.55 * boardOn, 0);
      board.userData.tint(tintNow.copy(GOLD_T).lerp(CYAN_T, morph));

      /* The tries: how many there should be at this point of the scroll. */
      const wantN = p < .14 ? 1 : p < .3 ? 2 : 2 + Math.min(4, Math.floor((p - .3) / .028) + 1);
      while (auto.length > wantN) auto.pop();
      while (auto.length < wantN) { if (auto.length === 1) auto.push({ x: .12, born: t }); else { refit(); auto.push({ x: post.next, born: t }); } score.sfx('pop'); }
      refit();
      const ease = 1 - Math.exp(-dt * 5);
      for (let g = 0; g < N; g++) { muD[g] += (post.mu[g] - muD[g]) * ease; sdD[g] += (post.sd[g] - sdD[g]) * ease; eiD[g] += (post.ei[g] - eiD[g]) * ease; }
      let em = 1e-4; for (let g = 0; g < N; g++) em = Math.max(em, eiD[g]); eiMax += (em - eiMax) * ease;
      const gpOn = sstep(.16, .2, p) * boardOn, eiOn = sstep(.24, .27, p) * boardOn, axOn = sstep(.08, .13, p) * boardOn;
      const at = (arr, x) => { const f = clamp(x) * (N - 1), i = Math.min(N - 2, Math.floor(f)), u = f - i; return lerp(arr[i], arr[i + 1], u); };
      for (let j = 0; j < M; j++) {
        const x = j / (M - 1);
        meanL.p.set([bx(x), by(at(muD, x)), .08], j * 3);
        trueL.p.set([bx(x), by(F(x)), .07], j * 3);
        eiL.p.set([bx(x), EY0 + at(eiD, x) / eiMax * EYH, .08], j * 3);
      }
      [meanL, trueL, eiL].forEach(o => { o.g.attributes.position.needsUpdate = true; });
      for (let g = 0; g < N; g++) {
        const x = GRID[g];
        band.p.set([bx(x), by(muD[g] + 2 * sdD[g]), .06, bx(x), by(muD[g] - 2 * sdD[g]), .06], g * 6);
        eiFill.p.set([bx(x), EY0 + eiD[g] / eiMax * EYH, .06, bx(x), EY0, .06], g * 6);
      }
      band.g.attributes.position.needsUpdate = true; eiFill.g.attributes.position.needsUpdate = true;
      meanPts.material.uniforms.uOpacity.value = gpOn; band.m.material.opacity = .045 * gpOn;
      eiPts.material.uniforms.uOpacity.value = eiOn; eiFill.m.material.opacity = .08 * eiOn;
      const trueOn = sstep(.42, .45, p) * boardOn; truePts.material.uniforms.uOpacity.value = trueOn * .9;
      axesG.attributes.position.array.set([BX0, BY0, .05, BX0 + BXW, BY0, .05, BX0, BY0, .05, BX0, BY0 + BYH, .05, BX0, EY0, .05, BX0 + BXW, EY0, .05]); axesG.attributes.position.needsUpdate = true;
      axes.material.opacity = axOn * .45;
      // The next try (the top of the gold curve) and, while you hover, the try you would run.
      const nx = post.next, showNext = eiOn > .5 && p < .44;
      markG.attributes.position.array.set([bx(nx), EY0, .09, bx(nx), BY0 + BYH, .09, bx(Math.max(0, hoverX)), EY0, .09, bx(Math.max(0, hoverX)), BY0 + BYH, .09]); markG.attributes.position.needsUpdate = true;
      marks.material.opacity = (showNext ? .35 + .25 * Math.sin(t * 5) : 0);
      markG.setDrawRange(0, hoverX >= 0 && boInteractive() ? 4 : 2);

      // The balls: the run's final loss flies from the end of the old curve to its place on the new board.
      const tries = allTries(), R0 = tall ? .24 : .16, top = by(YMAX + .1);
      let latest = null, best = null;
      for (let i = 0; i < DOTS; i++) {
        const o = tries[i];
        if (!o) { dotO[i] = 0; m4.makeScale(1e-4, 1e-4, 1e-4); dots.setMatrixAt(i, m4); continue; }
        const y = F(o.x), land = easeOut((t - o.born) / .65);
        if (i === 0) { const e = easeInOut(clamp((p - .08) / .06)); v4.lerpVectors(RUN_END, tmp.set(bx(o.x), by(y), .12), e); v4.y += Math.sin(e * Math.PI) * .8; v4.z = .12; }
        else v4.set(bx(o.x), lerp(top, by(y), land), .12);
        o.pos = (o.pos || new THREE.Vector3()).copy(v4);
        dotO[i] = (i === 0 ? 1 : clamp((t - o.born) * 4)) * boardOn;
        m4.compose(v4, q4, s4.setScalar(R0 * (o.mine ? .85 : 1))); dots.setMatrixAt(i, m4);
        if (!latest || o.born > latest.born) latest = o;
        if (!best || y < F(best.x)) best = o;
      }
      dots.instanceMatrix.needsUpdate = true; dotGeo.attributes.aO.needsUpdate = true;
      const head = tries[0].pos; glow.position.copy(latest && latest.born > 0 ? latest.pos : head); glow.material.opacity = .3 * boardOn;

      /* ---------- LHAASO ---------- */
      tank.mat.uniforms.uOpacity.value = wOn; poolEdges.material.opacity = wOn * .35; ground.material.uniforms.uO.value = wOn;
      ridges.children.forEach(o => { if (o === horizon) o.material.uniforms.uO.value = wOn; else if (o.isMesh) o.material.opacity = wOn; else o.visible = false; });
      ridges.visible = stars.visible = tank.mesh.visible = wOn > .002;
      starMat.uniforms.uOpacity.value = wOn;
      const live = wOn > .01;
      // Tuning tries tick by during the burst; each one tightens the search and the burst stands out more.
      const nTry = p < .74 ? 1 : 1 + Math.min(SIGMA.length - 1, Math.floor((p - .74) / .02));
      if (nTry !== lastTries) { if (nTry > lastTries && lastTries && act) score.sfx('chime', { f: 300 + nTry * 70 }); lastTries = nTry; }
      const tuneF = (nTry - 1) / (SIGMA.length - 1);
      sigShow += (SIGMA[nTry - 1] - sigShow) * (1 - Math.exp(-dt * 3));
      const burst = sstep(.71, .74, p) * (1 - sstep(.9, .96, p));
      if (live) {
        // Showers: cosmic rays all the time (fainter as the search learns to reject them), gamma rays during the burst.
        const decay = Math.exp(-dt * 4.2);
        for (let i = 0; i < CN; i++) { bgE[i] *= decay; sgE[i] *= decay; }
        if (t > nextBg) { nextBg = t + .35 + r() * .7; shower((r() - .5) * 15, (r() - .5) * 13, false, .7 + r() * .8); }
        if (burst > .05 && r() < dt * 9 * burst) shower((r() - .5) * 15, (r() - .5) * 13, true, .8 + r() * .5);
        for (let k2 = 0, nk = Math.ceil(dt * 900); k2 < nk; k2++) bgE[Math.floor(r() * CN)] += .12;   // dark noise: every sensor fires on its own all the time
        for (let s = showers.length - 1; s >= 0; s--) {
          const o = showers[s], ph = (t - o.t0) / o.dur;
          if (ph > 1) { showers.splice(s, 1); continue; }
          const fs = -o.R + ph * 2 * o.R, gain = o.sig ? 1 : 1 - .7 * tuneF * sstep(.72, .76, p);
          for (let i = 0; i < CN; i++) {
            const dx = cx[i] - o.x, dz = cz[i] - o.z; if (dx > o.R || dx < -o.R || dz > o.R || dz < -o.R) continue;
            const rr = Math.hypot(dx, dz); if (rr > o.R || Math.abs(dx * o.dx + dz * o.dz - fs) > .32) continue;
            const amp = o.E * Math.exp(-rr / o.r0) * dt * 16 * gain;
            if (o.sig) sgE[i] += amp; else bgE[i] += amp;
          }
        }
        for (let i = 0; i < CN; i++) {
          const b = Math.min(1.6, bgE[i]), g = Math.min(1.6, sgE[i]), e = b + g, gold = g > b;
          const v = gold ? .45 + g * .7 : -Math.min(1, b * 1.2), h = .05 + Math.min(1.1, b * .25 + g * .6);
          tank.set(i, cx[i], h / 2, cz[i], .21, h, .21, v, Math.min(1, e * .8), .22 + .78 * Math.min(1, e));
        }
        tank.commit();
        // The rain of gamma rays from the burst.
        for (let i = 0; i < RAIN; i++) { const f = (t * .55 + rainS[i]) % 1; tmp.lerpVectors(SRC, rainT[i], f); rainP.set([tmp.x, tmp.y, tmp.z], i * 3); }
        rainG.attributes.position.needsUpdate = true;
      }
      const md = 1 - easeOut(clamp((p - .92) / .025)); mdl.position.set(MDL.x, MDL.y + md * 8, MDL.z); mdlBlocks.forEach(b => b.userData.set(.5 * sstep(.915, .93, p), 0)); mdl.visible = p > .91;
      rainMat.uniforms.uOpacity.value = burst * wOn * .7; grb.material.opacity = burst * wOn; grb.scale.setScalar(1.4 + 1.4 * burst + Math.sin(t * 7) * .15);
      // The light curve: drawn in as the search runs, the noise shrinking with every try.
      const endO = 1 - sstep(.92, .94, p), lcOn = sstep(.7, .74, p) * wOn * endO, cursor = clamp((p - .72) / .1) * BINS;
      lcPanel.userData.set(.4 * lcOn, 0);
      for (let i = 0; i < BINS; i++) {
        const shown = clamp(cursor - i), bgH = lcNoise[i] * (1 - .78 * tuneF) * (.85 + .15 * Math.sin(t * 3 + i)), sp2 = spike(i), hgt = Math.max(.001, (bgH + sp2) * .55 * shown);
        lcBars.set(i, LC.x - LCW / 2 + (i + .5) * LCW / BINS, LC.y - LCH / 2 + hgt / 2, LC.z + .05, LCW / BINS * .7, hgt, .12, sp2 > bgH ? 1.1 : -.6, sp2 > bgH ? .4 : 0, lcOn * (shown > 0 ? 1 : 0));
      }
      lcBars.commit();

      /* Words in the world. */
      const show = (lab, pos, on) => ui.place(lab, pos, camera, act && on);
      const inX = v => { if (tall) v.x = clamp(v.x, BX0 + 2.3, BX0 + BXW - 2.3); return v; };   // on a phone, keep tags on the board
      const tagEl = runTag.el.querySelector('.tag'), tagTxt = p < .14 ? 'best checkpoint · loss 0.50' : `run 1 · lr 0.04 · loss ${F(.65).toFixed(2)}`;
      if (tagEl.textContent !== tagTxt) tagEl.textContent = tagTxt;
      show(runTag, inX(head.clone().add(tmp.set(0, .5, 0))), boardOn > .5 && p < .2);
      show(axXl, new THREE.Vector3(BX0 + BXW - 1, BY0 - .55, .1), axOn > .5);
      show(axYl, new THREE.Vector3(BX0 + (tall ? 1.1 : .9), BY0 + BYH - .05, .1), axOn > .5);
      ticks.forEach(([x, lab]) => show(lab, new THREE.Vector3(bx(x), BY0 - .2, .1), axOn > .5 && !(tall && x === 1)));
      const gx = tall ? .82 : .9;
      show(meanLab, new THREE.Vector3(bx(gx), by(at(muD, gx)) + .35, .1), gpOn > .5 && p < .3);
      show(bandLab, new THREE.Vector3(bx(tall ? .25 : .32), by(at(muD, tall ? .25 : .32) + 2 * at(sdD, tall ? .25 : .32)) + .3, .1), gpOn > .5 && p < .3);
      show(eiLab, new THREE.Vector3(bx(.5), EY0 + EYH + .2, .1), eiOn > .5 && p < .32);
      show(nextLab, new THREE.Vector3(bx(nx), BY0 + BYH + .25, .1), showNext);
      if (latest && latest.born > 0) {
        const el = tryLab.el.querySelector('.tag'), tx = `${latest.mine ? 'your try' : `try ${tries.indexOf(latest) + 1}`} · lr ${fmtLR(latest.x)} · loss ${F(latest.x).toFixed(2)}`;
        if (el.textContent !== tx) el.textContent = tx;
      }
      show(tryLab, latest && latest.pos ? inX(latest.pos.clone().add(tmp.set(0, .45, 0))) : PLC, gpOn > .5 && latest && latest.born > 0 && latest !== best);
      if (best) { const el = bestLab.el.querySelector('.tag'), tx = `best so far · lr ${fmtLR(best.x)} · loss ${F(best.x).toFixed(2)}`; if (el.textContent !== tx) el.textContent = tx; }
      show(bestLab, best && best.pos ? inX(best.pos.clone().add(tmp.set(0, -.55, 0))) : PLC, gpOn > .5 && auto.length > 2);
      show(trueLab, inX(new THREE.Vector3(bx(.86), by(F(.86)) + .45, .1)), trueOn > .5);
      if (hoverX >= 0 && boInteractive()) { const el = hoverLab.el.querySelector('.tag'), tx = `try lr ${fmtLR(hoverX)}`; if (el.textContent !== tx) el.textContent = tx; }
      show(hoverLab, new THREE.Vector3(bx(Math.max(0, hoverX)), BY0 + BYH + .25, .1), hoverX >= 0 && boInteractive() && !coarse);
      const W3 = (x, y, z) => WC.clone().add(tmp.set(x, y, z));
      show(placeLab, W3(0, .3, -7.2), p > .48 && p < .62);
      [[0, -3.85], [-3.8, 3.4], [3.8, 3.4]].forEach(([x, z], i) => show(poolLabs[i], W3(x, .35, z), p > .57 && p < .7 && (!tall || i === 0)));
      show(showerLab, firstShower ? W3(firstShower.x, .8, firstShower.z) : WC, !!firstShower && t - firstShower.t < 2.2 && wcInteractive());
      grbLab.el.classList.toggle('down', tall); show(grbLab, W3(SRC.x, SRC.y + (tall ? -1.4 : 1.6), SRC.z), burst > .5);
      const sEl = sigLab.el.querySelector('b'), sTx = `${sigShow.toFixed(1)}σ`; if (sEl.textContent !== sTx) sEl.textContent = sTx;
      show(sigLab, W3(LC.x - LCW / 2 + 28 * LCW / BINS, LC.y + LCH / 2 + .35, LC.z), lcOn > .5 && cursor > 27);
      show(lcLab, W3(LC.x + LCW / 2 - 2.2, LC.y - LCH / 2 - .75, LC.z), lcOn > .5);
      hud.querySelectorAll('.bo-tries i').forEach((el, i) => el.classList.toggle('on', i < nTry));
      hud.querySelector('.bo-tries b').textContent = nTry; hud.querySelector('.bo-sig b').textContent = sTx;
      hud.classList.toggle('on', act && p > .73 && p < .87);
      card.classList.toggle('on', act && p > .87 && p < .92);

      /* Camera. */
      shot(p);
      const want = pointer.inside && !coarse ? pointer.ndc : null;
      turn.x += ((want ? want.x : 0) - turn.x) * Math.min(1, dt * 2); turn.y += ((want ? want.y : 0) - turn.y) * Math.min(1, dt * 2);
      off.subVectors(cpos, cat).applyAxisAngle(new THREE.Vector3(0, 1, 0), -turn.x * .06); off.y += turn.y * .4;
      camera.position.copy(cat).add(off); camera.lookAt(cat);
    }
  };
}
