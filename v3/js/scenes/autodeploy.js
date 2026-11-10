/* Act V, scene 13: AutoDeploy, Hafiz's master's thesis, part one.
   It opens on the last frame of compression: thousands of recipes branching from the model. They fold back into the
   model, which becomes a small gold package on a glass rail and travels through four stations, each its own picture:
   READ (a scanning ring; the parser's 13 real stages light up; out comes the StateContract, a real excerpt),
   REMEMBER (his knowledge graph, with node names from his Neo4j database; drag the nodes; message passing finds the
   past runs most like this one; a screenshot of the real database), PLAN (four planners, Bayesian optimisation among
   them, spray recipes onto a latency-vs-accuracy board; rule-breakers drop out before costing anything; the measured
   points are labelled), RUN (about 320 sandboxed steps fill a board: first try, repaired, rolled back; one real failure
   and its rollback). It ends on the thesis card; the deployment race itself is Act VI. */
import * as THREE from 'three';
import { additive, POINT_FRAG, col, rng, gaussian, sstep, clamp, lerp, easeInOut, easeOut, pixelScale, glowTexture } from '../core/util.js';
import { cells, slab, floor, motes } from '../core/glass.js';
import { NB, MODEL, blockY, recipeTree } from './compress.js';

const STAGES = ['model_fingerprint', 'hardware_environment', 'baseline_profiling', 'objectives', 'patterns', 'compatibility', 'workload', 'security_policy', 'kg_signals', 'rl_features', 'request', 'sustainability', 'adversarial'];
const REQUIRED = new Set(['model_fingerprint', 'hardware_environment', 'objectives', 'compatibility', 'request']);
// The knowledge graph (names from his Neo4j database): [label, x, y, kind]; kinds: 0 tool, 1 model, 2 hardware, 4 technique, 5 failure.
const NODES = [['ParT', .5, .46, 1], ['ParticleNet', .16, .18, 1], ['ResNet50', .86, .14, 1], ['TensorRT', .32, .3, 0], ['OpenVINO', .7, .28, 0], ['hls4ml', .13, .58, 0], ['Vitis AI', .4, .86, 0], ['CANN', .7, .86, 0], ['Static PTQ', .6, .64, 4], ['Magnitude pruning', .52, .12, 4], ['Tesla V100', .3, .62, 2], ['Alveo U200', .13, .9, 2], ['Xeon Platinum', .9, .46, 2], ['Ascend NPU', .9, .78, 2], ['Failure', .55, .97, 5]];
const EDGES = [[0, 3], [0, 10], [0, 8], [0, 7], [0, 9], [1, 5], [1, 3], [1, 11], [2, 9], [2, 4], [2, 12], [3, 8], [3, 10], [4, 12], [5, 11], [6, 11], [6, 8], [7, 13], [7, 14], [0, 13], [4, 8]];
const KIND_COL = { 0: '#f3efdc', 1: '#ffd27a', 2: '#ff9a62', 4: '#84e0a8', 5: '#ff6f7f' };
const KIND_NAME = { 0: 'tool', 1: 'model', 2: 'hardware', 4: 'technique', 5: 'failure' };
// Measured on the V100 (thesis tables): latency in ms, accuracy in %.
const MEASURED = [['PyTorch FP32', 3.8, 94], ['TensorRT FP16', .82, 93.7], ['TensorRT INT8 (PTQ)', .51, 93.4], ['AutoDeploy, tuned FP16', .45, 93.5, true]];
const PLANNERS = ['retrieval templates', 'Rainbow DQN', 'GFlowNet', 'Bayesian optimisation'];
const XS = { read: 0, mem: 16, plan: 32, run: 48 };

export default function autodeploy(ctx) {
  const { small, ui, score, pointer, renderer, coarse } = ctx;
  const scene = new THREE.Scene();
  scene.background = col('#04070c');
  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, .05, 400);
  const r = rng(6202);
  let tall = false;
  const geoOf = attrs => { const g = new THREE.BufferGeometry(); Object.entries(attrs).forEach(([k, [arr, n]]) => g.setAttribute(k, new THREE.Float32BufferAttribute(arr, n))); return g; };
  const ptsMat = (extra = {}) => additive(Object.assign({ uniforms: { uPx: { value: 1000 }, uO: { value: 0 } },
    vertexShader: 'attribute vec3 color; attribute float aS; uniform float uPx, uO; varying vec3 vColor; varying float vAlpha; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = max(1., uPx * aS / -mv.z); vColor = color; vAlpha = uO; }', fragmentShader: POINT_FRAG }, extra));
  scene.add(floor(-.06, '#4fb6d8'));
  const dust = motes(small ? 200 : 460, [120, 16, 40], '#9fdcff'); dust.pts.position.x = 24; scene.add(dust.pts);

  /* ---------- The opening: compression's last frame, folding back into the model ---------- */
  const T = recipeTree();
  const tp = [], tl = [];
  T.nodes.forEach(n => { tp.push(n.p.x, n.p.y, n.p.z); tl.push(n.l); }); T.cloud.forEach(v => { tp.push(v.x, v.y, v.z); tl.push(4.6); });
  const ROOT = new THREE.Vector3(0, T.top, 0);
  const foldMat = additive({ uniforms: { uPx: { value: 1000 }, uC: { value: 0 }, uO: { value: 1 }, uRoot: { value: ROOT } },
    vertexShader: 'attribute float aL; uniform float uPx, uC, uO; uniform vec3 uRoot; varying vec3 vColor; varying float vAlpha; void main() { float c = smoothstep(0., 1., clamp(uC * 1.6 - (4.6 - aL) * .12, 0., 1.)); vec3 p = mix(position, uRoot, c); vec4 mv = modelViewMatrix * vec4(p, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = max(1., uPx * (aL < 4.3 ? .09 - aL * .012 : .03) / -mv.z); vColor = aL < 4.3 ? mix(vec3(1., .86, .5), vec3(.55, .9, 1.), aL / 4.) : vec3(.5, .85, 1.); vAlpha = uO * (aL < 4.3 ? 1. : .45) * (1. - c * .6); }', fragmentShader: POINT_FRAG });
  const fold = new THREE.Points(geoOf({ position: [tp, 3], aL: [tl, 1] }), foldMat); fold.frustumCulled = false; scene.add(fold);
  const blocks = Array.from({ length: NB }, (_, j) => { const s = slab(MODEL.w, MODEL.h, MODEL.d); s.position.set(0, blockY(j), 0); scene.add(s); return s; });

  /* ---------- The rail and the package ---------- */
  const RAIL_Y = 1;
  const rail = slab(66, .06, .5, '#8fe8ff'); rail.position.set(24, RAIL_Y, 0); scene.add(rail);
  const pkg = slab(.85, .85, .85, '#ffd27a'); scene.add(pkg);
  const pkgGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: col('#ffc27a'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 })); pkgGlow.scale.setScalar(2.4); scene.add(pkgGlow);

  /* ---------- READ: a scanning ring, the 13 stages, the StateContract ---------- */
  const RN = small ? 1400 : 2800, rp = [], rc = [], rs = [];
  for (let i = 0; i < RN; i++) { const a = r() * Math.PI * 2, rr = 1.45 + (r() - .5) * (i % 5 ? .06 : .25); rp.push((r() - .5) * .08, RAIL_Y + .35 + Math.cos(a) * rr, Math.sin(a) * rr); rc.push(.4, .75, .9); rs.push(.018 + r() * .014); }
  const ringMat = additive({ uniforms: { uPx: { value: 1000 }, uO: { value: 0 }, uT: { value: 0 }, uScan: { value: 0 } },
    vertexShader: `attribute vec3 color; attribute float aS; uniform float uPx, uO, uT, uScan; varying vec3 vColor; varying float vAlpha;
      void main() { float a = atan(position.z, position.y - ${(RAIL_Y + .35).toFixed(2)}) + uT * .6, R = length(position.yz - vec2(${(RAIL_Y + .35).toFixed(2)}, 0.));
        vec3 p = vec3(position.x, ${(RAIL_Y + .35).toFixed(2)} + cos(a) * R, sin(a) * R); vec4 mv = modelViewMatrix * vec4(p, 1.); gl_Position = projectionMatrix * mv;
        float sweep = pow(.5 + .5 * sin(a * 2. - uT * 4.), 8.) * (.4 + uScan);
        gl_PointSize = max(1., uPx * aS * (1. + sweep) / -mv.z); vColor = color * (.45 + sweep * 1.3); vAlpha = uO * .7; }`, fragmentShader: POINT_FRAG });
  const ring = new THREE.Points(geoOf({ position: [rp, 3], color: [rc, 3], aS: [rs, 1] }), ringMat); ring.position.x = XS.read; ring.frustumCulled = false; scene.add(ring);
  const stagePos = i => tall ? new THREE.Vector3(XS.read + 1.4 + (i % 2 ? 1.7 : -1.7), RAIL_Y - 1 - Math.floor(i / 2) * .48, .6) : new THREE.Vector3(XS.read + 3.4 + Math.floor(i / 7) * 3.1, 5.2 - (i % 7) * .46, 0);

  /* ---------- REMEMBER: the knowledge graph ---------- */
  const G0 = new THREE.Vector3(XS.mem, 4.3, 0);
  const rest = NODES.map(n => new THREE.Vector3(G0.x + (n[1] - .5) * 11, G0.y + (.5 - n[2]) * 6.2, (r() - .5) * 3));
  const gpos = rest.map(v => v.clone()), gvel = rest.map(() => new THREE.Vector3());
  const nodeGeo = new THREE.BufferGeometry(), nP = new Float32Array(NODES.length * 3), nC = [], nS = [];
  NODES.forEach(n => { const c = col(KIND_COL[n[3]]); nC.push(c.r, c.g, c.b); nS.push(n[0] === 'ParT' ? .55 : .36); });
  nodeGeo.setAttribute('position', new THREE.BufferAttribute(nP, 3)); nodeGeo.setAttribute('color', new THREE.Float32BufferAttribute(nC, 3)); nodeGeo.setAttribute('aS', new THREE.Float32BufferAttribute(nS, 1));
  const nodeMat = ptsMat(); const nodePts = new THREE.Points(nodeGeo, nodeMat); nodePts.frustumCulled = false; scene.add(nodePts);
  const edgeGeo = new THREE.BufferGeometry(), eP = new Float32Array(EDGES.length * 6), eA = new Float32Array(EDGES.length * 2);
  edgeGeo.setAttribute('position', new THREE.BufferAttribute(eP, 3)); edgeGeo.setAttribute('aA', new THREE.BufferAttribute(eA, 1));
  const edgeMat = new THREE.ShaderMaterial({ uniforms: { uO: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'attribute float aA; varying float vA; void main() { vA = aA; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: 'uniform float uO; varying float vA; void main() { gl_FragColor = vec4(mix(vec3(.45, .7, .8), vec3(1., .85, .5), clamp(vA - .3, 0., 1.)) * vA * uO, 1.); }' });
  const edges = new THREE.LineSegments(edgeGeo, edgeMat); edges.frustumCulled = false; scene.add(edges);
  // Message passing: pulses run out from this model along its edges, then one hop further.
  const PULSES = 60, puP = new Float32Array(PULSES * 3), puA = new Float32Array(PULSES), puC = [], puS = [];
  for (let i = 0; i < PULSES; i++) { puC.push(1, .85, .5); puS.push(.14); }
  const puGeo = new THREE.BufferGeometry(); puGeo.setAttribute('position', new THREE.BufferAttribute(puP, 3)); puGeo.setAttribute('color', new THREE.Float32BufferAttribute(puC, 3)); puGeo.setAttribute('aS', new THREE.Float32BufferAttribute(puS, 1));
  const puMat = additive({ uniforms: { uPx: { value: 1000 }, uO: { value: 0 } }, vertexShader: 'attribute vec3 color; attribute float aS; uniform float uPx, uO; varying vec3 vColor; varying float vAlpha; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = max(1., uPx * aS / -mv.z); vColor = color; vAlpha = uO; }', fragmentShader: POINT_FRAG });
  puGeo.setAttribute('aS', new THREE.Float32BufferAttribute(puS, 1));
  const pulses = new THREE.Points(puGeo, puMat); pulses.frustumCulled = false; scene.add(pulses);
  const hop1 = EDGES.map((e, k) => (e[0] === 0 || e[1] === 0) ? k : -1).filter(k => k >= 0);
  const firstHop = new Set(hop1.map(k => EDGES[k][0] === 0 ? EDGES[k][1] : EDGES[k][0]));
  const hop2 = EDGES.map((e, k) => (!hop1.includes(k) && (firstHop.has(e[0]) || firstHop.has(e[1]))) ? k : -1).filter(k => k >= 0);
  // A photo of the real database.
  const shot = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.72), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  new THREE.TextureLoader().load('../assets/showcase/deploy-neo4j.webp', tx => { tx.colorSpace = THREE.SRGBColorSpace; shot.material.map = tx; shot.material.needsUpdate = true; });
  shot.position.set(G0.x + 7.9, G0.y + .2, -1.6); shot.rotation.y = -.35; scene.add(shot);

  /* ---------- PLAN: four planners and the recipe board ---------- */
  const B0 = new THREE.Vector3(XS.plan, 4, 0), BW = 9.4, BH = 5.6;
  const board = slab(BW, BH, .05, '#8fe8ff'); board.position.copy(B0); scene.add(board);
  const lx = ms => B0.x - BW / 2 + .4 + (Math.log10(ms) - Math.log10(.3)) / (Math.log10(5.5) - Math.log10(.3)) * (BW - .8);
  const ly = a => B0.y - BH / 2 + .4 + (a - 92.9) / 1.4 * (BH - .8);
  const frontier = l => (l < .45 ? 93.5 : l < .82 ? 93.5 + (l - .45) / .37 * .2 : l < 3.8 ? 93.7 + (l - .82) / 2.98 * .3 : 94);
  const EM = PLANNERS.map((_, k) => new THREE.Vector3(B0.x - BW / 2 - 1.5, B0.y + 1.15 - k * 1.15, .2));
  const RC = small ? 260 : 420, rec = [];
  for (let i = 0; i < RC; i++) {
    const kind = r(), k = Math.floor(r() * 4);
    let lat, acc, masked = false;
    if (kind < .14) { masked = true; lat = Math.pow(10, Math.log10(.35) + r() * 1.15); acc = 93 + r() * 1.2; }
    else if (kind < .28) { lat = Math.pow(10, Math.log10(.45) + r() * (Math.log10(3.8) - Math.log10(.45))); acc = frontier(lat) + (r() - .5) * .02; }
    else { lat = Math.pow(10, Math.log10(.5) + r() * (Math.log10(5) - Math.log10(.5))); const room = frontier(lat) - .05 - 92.95; acc = frontier(lat) - .05 - Math.pow(r(), 1.15) * room; }
    const tool = lat < .7 ? 'TensorRT' : lat < 2 ? ['TensorRT', 'ONNX Runtime'][Math.floor(r() * 2)] : ['ONNX Runtime', 'PyTorch'][Math.floor(r() * 2)];
    const prec = acc > 93.85 ? 'FP32' : lat < .55 ? ['INT8', 'FP16'][Math.floor(r() * 2)] : 'FP16';
    rec.push({ k, lat, acc, masked, front: kind >= .14 && kind < .28, at: i / RC, tool, prec, batch: [1, 1, 1, 2, 4][Math.floor(r() * 5)], ws: [1, 2, 4][Math.floor(r() * 3)], why: ['INT8 on an op the chip cannot run', 'needs more memory than allowed', 'misses the accuracy floor', 'tool and chip incompatible'][Math.floor(r() * 4)] });
  }
  const recGeo = new THREE.BufferGeometry(), recP = new Float32Array(RC * 3), recC = new Float32Array(RC * 3), recS = new Float32Array(RC);
  recGeo.setAttribute('position', new THREE.BufferAttribute(recP, 3)); recGeo.setAttribute('color', new THREE.BufferAttribute(recC, 3)); recGeo.setAttribute('aS', new THREE.BufferAttribute(recS, 1));
  const recMat = ptsMat(); const recPts = new THREE.Points(recGeo, recMat); recPts.frustumCulled = false; scene.add(recPts);
  const emGlow = EM.map((p, k) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: col(['#9fe6ff', '#c59bff', '#84e0a8', '#ffd27a'][k]), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 })); s.position.copy(p); s.scale.setScalar(.9); scene.add(s); return s; });
  const axesG = geoOf({ position: [[B0.x - BW / 2 + .4, B0.y - BH / 2 + .4, .05, B0.x + BW / 2 - .4, B0.y - BH / 2 + .4, .05, B0.x - BW / 2 + .4, B0.y - BH / 2 + .4, .05, B0.x - BW / 2 + .4, B0.y + BH / 2 - .4, .05], 3] });
  const axes = new THREE.LineSegments(axesG, new THREE.LineBasicMaterial({ color: 0xcfefff, transparent: true, opacity: 0 })); scene.add(axes);

  /* ---------- RUN: about 320 sandboxed steps ---------- */
  const R0 = new THREE.Vector3(XS.run, 4.1, 0), COLS = 32, ROWS = 10, CS = .27, STEPS = COLS * ROWS;
  const stat = new Uint8Array(STEPS); { const pr = rng(5); const place = (count, value, power) => { let left = count, g = 0; while (left > 0 && g++ < 9000) { const k = Math.floor(Math.pow(pr(), power) * STEPS); if (!stat[k]) { stat[k] = value; left--; } } }; place(38, 2, 1.9); place(77, 1, 1.25); }
  const FAIL = (() => { for (let k = 120; k < STEPS; k++) if (stat[k] === 2) return k; return 130; })();
  const runBoard = slab(COLS * CS + .6, ROWS * CS + .6, .05, '#8fe8ff'); runBoard.position.copy(R0); scene.add(runBoard);
  const steps = cells(STEPS); scene.add(steps.mesh);
  const SX = k => R0.x + (k % COLS - (COLS - 1) / 2) * CS, SY = k => R0.y + ((ROWS - 1) / 2 - Math.floor(k / COLS)) * CS;

  /* ---------- Words ---------- */
  const L = (html, cls) => ui.label('auto', html, cls);
  const stageLabs = STAGES.map(s => L(`<span class="tag">${s}</span>`, `plain stage-chip${REQUIRED.has(s) ? ' req' : ''}`));
  const contract = L(`<span class="tag"><small>StateContract · real excerpt</small><pre>{
  "_type": "StateContract",
  "model": {
    "urn": "model:particle_transformer:hep:jet_tagging:v1",
    "family": "transformer",
    "framework": "pytorch",
    "parameter_count": 2100000,
    "layer_count": 24,
    "total_flops": 856000000
  }
}</pre></span>`, 'plain json-lab');
  const readStat = L('<span class="tag"><b>13</b> checks · <b>10.58 s</b> · once per model<small>gold = required stage</small></span>', 'plain stat-lab');
  const nodeLabs = NODES.map(n => L(`<span class="tag">${n[0]}${n[0] === 'ParT' ? '<small>this model</small>' : `<small>${KIND_NAME[n[3]]}</small>`}</span>`, `plain node-lab k${n[3]}`));
  const memStat = L('<span class="tag">right picks in the top 5: <b>0.58 → 0.76</b><small>bad suggestions 14% → 8%</small></span>', 'plain stat-lab');
  const shotLab = L('<span class="tag">my real Neo4j database</span>', 'plain axis-lab');
  const plannerLabs = PLANNERS.map((n, k) => L(`<span class="tag">${n}</span>`, `plain planner-lab${k === 3 ? ' bo' : ''}`));
  const measLabs = MEASURED.map((m, k) => L(`<span class="tag"><b>${m[0]}</b><small>${m[1]} ms · ${m[2]}%</small></span>`, `plain meas-lab${m[3] ? ' win' : ''}${k === 2 ? ' below' : ''}`));
  const axX = L('<span class="tag">faster ←  latency (ms, log)</span>', 'plain axis-lab'), axY = L('<span class="tag">accuracy ↑</span>', 'plain axis-lab');
  const maskLab = L('<span class="tag">dropped before any compute is spent</span>', 'plain mask-lab');
  const planStat = L('<span class="tag">found in <b>40 min</b>, not 95 (random search)<small>best 0.45 ms, not 0.68 ms</small></span>', 'plain stat-lab');
  const recTip = L('<span class="tag"></span>', 'plain rec-tip');
  const failLab = L(`<span class="tag"><pre><b class="bad">s2_quant  FAILED  calibration_overflow</b>
→ ROLLBACK to ckpt_run01#0
→ retry with a safer calibration preset  <b class="ok">ok</b></pre></span>`, 'plain json-lab fail-lab');
  const runStat = L('<span class="tag"><b>~320</b> steps · <b>88%</b> finished<small><i class="sq g"></i>first try 64% <i class="sq a"></i>repaired 24% <i class="sq r"></i>rolled back, plan replaced 12%</small></span>', 'plain stat-lab');
  const card = document.createElement('aside'); card.className = 'paper-card ad-card';
  card.innerHTML = `<div class="pc-img"><img src="../assets/showcase/fig-timeline.webp" alt="Figure from my thesis: about three weeks of manual deployment work against about eight hours with AutoDeploy" loading="lazy"></div>
    <div class="pc-body"><small>My master’s thesis · UCAS / IHEP · 2026</small>
    <h3>AutoDeploy</h3>
    <p>One model and one config file in; a planned, tested deployment out, on CPU, GPU or FPGA, remembered for next time. Paper: <i>A knowledge-driven framework for HEP model deployment on heterogeneous hardware</i>, Radiation Detection Technology and Methods, 2026, first author.</p>
    <ul><li><b>~63×</b> faster end to end</li><li><b>~40×</b> less expert time</li><li>IHEP Director’s Award, Best Graduation Project</li><li>Talk at the FCPPN/L workshop, Lyon, 2026</li></ul>
    <div class="pc-btns"><a class="pc-btn" href="https://doi.org/10.1007/s41605-026-00734-w" target="_blank" rel="noopener">Read the paper <span aria-hidden="true">↗</span></a><a class="pc-btn ghost" href="../assets/Thesis-Defense-Mustofa-Ahmed.pdf" target="_blank" rel="noopener">Defense slides</a><a class="pc-btn ghost" href="../index.html#autodeploy" target="_blank" rel="noopener">Case study</a></div></div>`;
  ctx.$('#scene-ui').append(card);

  /* ---------- Camera ---------- */
  const cpos = new THREE.Vector3(), cat = new THREE.Vector3(), off = new THREE.Vector3(), turn = new THREE.Vector2(), tmp = new THREE.Vector3();
  const S = (a, b) => [new THREE.Vector3(...a), new THREE.Vector3(...b)];
  function shotAt(p) {
    const OPEN = S([0, T.top + 2.4, 19], [0, T.top + 2.6, 0]);
    const READ = S([XS.read - 4.6, 3.9, 9.6], [XS.read + 1.9, 2.5, 0]), MEM = S([XS.mem + 1.2, 4.7, 14], [XS.mem + 1.2, 4.1, 0]);
    const PLAN = tall ? S([XS.plan, 7.1, 13.2], [XS.plan, 6.6, 0]) : S([XS.plan - 1.7, 4.3, 13.2], [XS.plan - 1.7, 3.8, 0]), RUN = S([XS.run, 4.4, 11.5], [XS.run, 3.8, 0]), CARD = S([XS.run + 2.8, 4.6, 13], [XS.run + 2.8, 4, 0]);
    const FOLLOW = S([XS.run + 12, 3.2, 9], [XS.run + 14, 2, 0]);   // the first frame of Act VI
    const seq = [[0, OPEN], [.04, OPEN], [.1, READ], [.26, READ], [.31, MEM], [.48, MEM], [.53, PLAN], [.7, PLAN], [.75, RUN], [.88, RUN], [.9, tall ? RUN : CARD], [.92, tall ? RUN : CARD], [.945, FOLLOW], [1, FOLLOW]];
    let i = 0; while (i < seq.length - 2 && p > seq[i + 1][0]) i++;
    const [pa, A] = seq[i], [pb, B] = seq[i + 1], e = easeInOut(clamp((p - pa) / Math.max(1e-4, pb - pa)));
    cpos.lerpVectors(A[0], B[0], e); cat.lerpVectors(A[1], B[1], e);
    const Ka = Math.min(2.4, 1 / camera.aspect), Kb = Math.min(2.7, 1.2 / camera.aspect), K = tall ? (i === 0 ? lerp(Ka, Kb, e) : Kb) : 1;   // (the follow shot matches Act VI's opening, scaled the same way)   // the opening matches compression's framing
    off.subVectors(cpos, cat).multiplyScalar(K); cpos.copy(cat).add(off);
  }
  const pkgX = p => p < .1 ? -5 : p < .24 ? lerp(-5, XS.read + 3.2, easeInOut((p - .1) / .14)) : p < .3 ? lerp(XS.read + 3.2, XS.mem - 6.5, easeInOut((p - .24) / .06)) : p < .5 ? XS.mem - 6.5 : p < .55 ? lerp(XS.mem - 6.5, XS.plan - 2.6, easeInOut((p - .5) / .05)) : p < .72 ? XS.plan - 2.6 : p < .77 ? lerp(XS.plan - 2.6, XS.run - 5.6, easeInOut((p - .72) / .05)) : p < .92 ? XS.run - 5.6 : lerp(XS.run - 5.6, XS.run + 12, easeInOut((p - .92) / .025));

  let localP = 0, drag = -1, hotNode = -1, hotRec = -1;
  const ray = new THREE.Raycaster(), dragPlane = new THREE.Plane(), hp = new THREE.Vector3();

  return {
    id: 'auto', scene, camera, extra: {},
    captions: [
      { at: [0, .09], html: 'So I built <b>AutoDeploy</b>, my master’s thesis. One model and one config file in; it plans, runs, checks and remembers every try.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.1, .27], html: 'First it <b>reads</b> the model and the machine: 13 checks, written into one trusted report, the <b>StateContract</b>. About ten seconds.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.3, .49], html: 'Then it <b>remembers</b>: every past attempt lives in a knowledge graph (my real Neo4j data), where graph neural networks find similar runs.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.32, .49], html: `<span class="hint-dot"></span>${coarse ? 'Drag a node' : 'Drag a node · hover to see what it touches'}`, x: 50, y: 90, cls: 'hint', align: 'center', m: { x: 50, y: 86 } },
      { at: [.52, .71], html: 'It <b>plans</b>: four planners, Bayesian optimisation among them, propose recipes. Each dot is one: left is faster, higher more accurate.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.55, .71], html: '<span class="hint-dot"></span>Hover a recipe', x: 50, y: 90, cls: 'hint desk', align: 'center' },
      { at: [.74, .89], html: 'It <b>runs</b> each recipe in a sandbox, checking every step and repairing or rolling back failures: 88% of about 320 steps finished.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.9, 1.05], html: 'Next it deploys the winners onto real chips and races them.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } }
    ],
    resize(aspect) { camera.aspect = aspect; camera.updateProjectionMatrix(); tall = aspect < 1; },
    init() { this.resize(innerWidth / innerHeight); },
    show(on) { if (!on) { card.classList.remove('on'); document.body.style.cursor = ''; drag = -1; } },
    pointer(type) {
      ray.setFromCamera(pointer.ndc, camera);
      if (localP > .3 && localP < .5) {
        let best = -1, bd = coarse ? 34 : 24;
        gpos.forEach((v, i) => { const s = ui.screen(v, camera), d = Math.hypot(s.x - pointer.x, s.y - pointer.y); if (d < bd) { bd = d; best = i; } });
        if (type === 'down' && best >= 0) { drag = best; dragPlane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(tmp).negate(), gpos[best]); score.sfx('pop'); }
        if (type === 'up') drag = -1;
        if (drag >= 0 && ray.ray.intersectPlane(dragPlane, hp)) gpos[drag].copy(hp);
        if (best !== hotNode && best >= 0) score.sfx('hover');
        hotNode = drag >= 0 ? drag : best; document.body.style.cursor = drag >= 0 ? 'grabbing' : best >= 0 ? 'grab' : '';
      } else if (localP > .53 && localP < .71) {
        let best = -1, bd = 16;
        for (let i = 0; i < RC; i++) { if (recS[i] < .01) continue; const s = ui.screen(tmp.fromArray(recP, i * 3), camera), d = Math.hypot(s.x - pointer.x, s.y - pointer.y); if (d < bd) { bd = d; best = i; } }
        if (best !== hotRec && best >= 0) score.sfx('hover');
        hotRec = best; document.body.style.cursor = best >= 0 ? 'help' : ''; drag = -1;
      } else { drag = -1; hotNode = -1; hotRec = -1; document.body.style.cursor = ''; }
    },
    update(p, info) {
      localP = p;
      const t = info.time, act = info.active, dt = Math.min(info.dt, .05), px = pixelScale(renderer, camera);
      [foldMat, ringMat, nodeMat, puMat, recMat].forEach(m => { m.uniforms.uPx.value = px; }); dust.mat.uniforms.uTime.value = t; dust.mat.uniforms.uPx.value = px;

      /* The opening: the recipes fold back into the model, which becomes the package on the rail. */
      const c = easeInOut(clamp((p - .015) / .05)), m2p = easeInOut(clamp((p - .05) / .05));
      foldMat.uniforms.uC.value = c; foldMat.uniforms.uO.value = 1 - sstep(.05, .07, p); fold.visible = p < .075;
      blocks.forEach((b, j) => { b.userData.set(.5 * (1 - m2p), 0); b.scale.setScalar(1 - m2p * .8); b.position.set(lerp(0, -5, m2p), lerp(blockY(j), RAIL_Y + .45 + (j - 2.5) * .03, m2p), 0); });
      const px0 = pkgX(p), bob = p > .1 ? Math.sin(t * 2) * .03 : 0;
      pkg.position.set(m2p < 1 ? lerp(0, -5, m2p) : px0, m2p < 1 ? lerp(MODEL.y0, RAIL_Y + .45, m2p) : RAIL_Y + .45 + bob, 0);
      pkg.scale.setScalar(lerp(.3, 1, m2p)); pkg.userData.set(.6 * sstep(.05, .08, p), p > .14 && p < .22 ? .8 : .2);
      pkg.rotation.y = t * .4; pkgGlow.position.copy(pkg.position); pkgGlow.material.opacity = .35 * sstep(.06, .1, p);
      rail.userData.set(.45 * sstep(.05, .1, p), 0);

      /* READ. */
      const readO = sstep(.07, .12, p) * (1 - sstep(.27, .31, p)), scan = clamp((p - .12) / .075);
      ringMat.uniforms.uO.value = readO; ringMat.uniforms.uT.value = t; ringMat.uniforms.uScan.value = p > .13 && p < .24 ? 1 : 0;

      /* REMEMBER: springs pull the graph back into shape after you drag it. */
      const memO = sstep(.27, .32, p) * (1 - sstep(.49, .53, p));
      if (memO > .001) for (let i = 0; i < NODES.length; i++) {
        if (i === drag) { gvel[i].set(0, 0, 0); continue; }
        const f = tmp.subVectors(rest[i], gpos[i]).multiplyScalar(3);
        EDGES.forEach(([a, b]) => { if (a !== i && b !== i) return; const o = a === i ? b : a; f.add(new THREE.Vector3().subVectors(gpos[o], gpos[i]).sub(new THREE.Vector3().subVectors(rest[o], rest[i])).multiplyScalar(4)); });
        gvel[i].add(f.multiplyScalar(dt)).multiplyScalar(Math.pow(.02, dt)); gpos[i].addScaledVector(gvel[i], dt);
      }
      const near = new Set(); if (hotNode >= 0) EDGES.forEach(([a, b]) => { if (a === hotNode) near.add(b); if (b === hotNode) near.add(a); });
      gpos.forEach((v, i) => nP.set([v.x, v.y, v.z], i * 3)); nodeGeo.attributes.position.needsUpdate = true;
      nodeGeo.attributes.aS.array.forEach((_, i) => { nodeGeo.attributes.aS.array[i] = (NODES[i][0] === 'ParT' ? .55 + Math.sin(t * 3) * .06 : .36) * (i === hotNode ? 1.5 : near.has(i) ? 1.2 : 1); }); nodeGeo.attributes.aS.needsUpdate = true;
      EDGES.forEach(([a, b], k) => { eP.set([gpos[a].x, gpos[a].y, gpos[a].z, gpos[b].x, gpos[b].y, gpos[b].z], k * 6); const hot = hotNode >= 0 && (a === hotNode || b === hotNode); const msg = hop1.includes(k) ? 1 : hop2.includes(k) ? .7 : .45; eA[k * 2] = eA[k * 2 + 1] = hot ? 1.4 : msg; });
      edgeGeo.attributes.position.needsUpdate = true; edgeGeo.attributes.aA.needsUpdate = true;
      nodeMat.uniforms.uO.value = memO; edgeMat.uniforms.uO.value = memO * .8;
      if (memO > .001) for (let i = 0; i < PULSES; i++) {
        const second = i % 3 === 0, list = second ? hop2 : hop1, k = list[i % list.length], [a, b] = EDGES[k];
        const ph = ((t * .45 + i * .137) % 1), from = second ? (firstHop.has(a) ? a : b) : 0, to = from === a ? b : a, f = second ? ph : ph;
        const v = tmp.lerpVectors(gpos[from], gpos[to], f); puP.set([v.x, v.y, v.z], i * 3);
      }
      puGeo.attributes.position.needsUpdate = true; puMat.uniforms.uO.value = memO * sstep(.33, .37, p);
      shot.material.opacity = sstep(.38, .42, p) * (1 - sstep(.48, .52, p)) * .92;

      /* PLAN: recipes fly from their planner to the board; rule-breakers drop out. */
      const planO = sstep(.49, .54, p) * (1 - sstep(.71, .75, p)), fill = clamp((p - .54) / .12);
      board.userData.set(.5 * planO, 0); axes.material.opacity = planO * .45;
      emGlow.forEach(s => { s.material.opacity = planO * (.5 + .3 * Math.sin(t * 4 + s.position.y)); });
      const front = col('#ffd27a'), dom = col('#cfe6ee'), bad = col('#ff6f7f');
      if (planO > .001) rec.forEach((o, i) => {
        const age = clamp((fill - o.at * .85) / .15), e = easeOut(age), tx = lx(o.lat), ty = ly(o.acc), em = EM[o.k];
        let x = lerp(em.x, tx, e), y = lerp(em.y, ty, e) + Math.sin(e * Math.PI) * .8, z = .1;
        let cc = o.masked ? bad : o.front ? front : dom, a = age > 0 ? 1 : 0, size = o.front ? .11 : .075;
        if (o.masked && age >= 1) { const d = clamp((fill - o.at * .85 - .15) / .1); y = ty - easeOut(d) * 3.2; a = 1 - d; }
        if (i === hotRec) size *= 2.2;
        recP.set([x, y, z], i * 3); recC.set([cc.r, cc.g, cc.b], i * 3); recS[i] = a * size * planO;
      });
      recGeo.attributes.position.needsUpdate = true; recGeo.attributes.color.needsUpdate = true; recGeo.attributes.aS.needsUpdate = true; recMat.uniforms.uO.value = 1;

      /* RUN: the steps fill in, in order; one real failure is shown with its rollback. */
      const runO = sstep(.71, .76, p), done = clamp((p - .76) / .12) * STEPS;
      runBoard.userData.set(.5 * runO, 0);
      if (runO > .001) for (let k = 0; k < STEPS; k++) {
        const on = clamp(done - k), s = stat[k], fresh = Math.max(0, 1 - (done - k) / 12);
        steps.set(k, SX(k), SY(k), 0, CS * .8, CS * .8, .12 * (.3 + on * .7), s === 2 ? -.95 : s === 1 ? 1.15 : .55, fresh * on * .9 + (k === FAIL && done > FAIL ? .5 + .5 * Math.sin(t * 5) : 0), runO * (.15 + on * .85));
      }
      steps.commit();

      /* Words in the world. */
      const show = (lab, pos, on) => ui.place(lab, pos, camera, act && on);
      STAGES.forEach((s, i) => { const lit = scan * STAGES.length > i + .3; stageLabs[i].el.classList.toggle('lit', lit); show(stageLabs[i], stagePos(i), readO > .5 && p > .11 && p < .205); });
      show(contract, new THREE.Vector3(XS.read + (tall ? 1.4 : 3.3), tall ? RAIL_Y - .9 : 3.9, tall ? .6 : 0), p > .205 && p < .28);
      show(readStat, new THREE.Vector3(XS.read, RAIL_Y - .55, .4), p > .13 && p < .27 && !tall);
      NODES.forEach((n, i) => { nodeLabs[i].el.classList.toggle('hot', i === hotNode || near.has(i)); show(nodeLabs[i], gpos[i].clone().add(tmp.set(0, -.42, 0)), memO > .5 && (!tall || i === 0 || i === hotNode || near.has(i) || firstHop.has(i))); });
      show(memStat, new THREE.Vector3(G0.x, G0.y - 3.9, 0), p > .36 && p < .49);
      show(shotLab, shot.position.clone().add(tmp.set(0, -1.6, .3)), shot.material.opacity > .5 && !tall);
      PLANNERS.forEach((n, k) => show(plannerLabs[k], EM[k].clone().add(tmp.set(-.6, 0, 0)), planO > .5 && !tall));
      MEASURED.forEach((m, k) => show(measLabs[k], new THREE.Vector3(lx(m[1]), ly(m[2]) + (k === 2 ? -.22 : .25), .2), planO > .5 && fill > .6 + k * .08));
      show(axX, new THREE.Vector3(B0.x + BW / 2 - 2, B0.y - BH / 2 - .1, .1), planO > .5);
      show(axY, new THREE.Vector3(B0.x - BW / 2 + .6, B0.y + BH / 2 - .1, .1), planO > .5);
      show(maskLab, new THREE.Vector3(B0.x + .8, B0.y - BH / 2 - .9, .1), planO > .5 && fill > .3 && !tall);
      show(planStat, new THREE.Vector3(B0.x, B0.y + BH / 2 + .55, .1), planO > .5 && fill > .9);
      if (hotRec >= 0) { const o = rec[hotRec], el = recTip.el.querySelector('.tag'), tx = o.masked ? `<b>dropped</b> · ${o.why}` : `<b>${o.tool} · ${o.prec}</b> · batch ${o.batch} · workspace ${o.ws} GB<small>${o.lat.toFixed(2)} ms · ${o.acc.toFixed(2)}% · ${PLANNERS[o.k]}</small>`; if (el.innerHTML !== tx) el.innerHTML = tx; }
      show(recTip, hotRec >= 0 ? tmp.fromArray(recP, hotRec * 3).clone().add(new THREE.Vector3(0, .35, 0)) : B0, hotRec >= 0 && planO > .5);
      show(failLab, new THREE.Vector3(tall ? XS.run : R0.x + COLS * CS / 2 - 2.4, R0.y + ROWS * CS / 2 + (tall ? 1.3 : 1.25), .2), done > FAIL + 2 && p < .91);
      show(runStat, new THREE.Vector3(R0.x, R0.y - ROWS * CS / 2 - .7, .1), runO > .5 && done > 60);
      card.classList.toggle('on', act && p > .88 && p < .92);

      /* Camera. */
      shotAt(p);
      const want = pointer.inside && !coarse && drag < 0 ? pointer.ndc : null;
      turn.x += ((want ? want.x : 0) - turn.x) * Math.min(1, dt * 2); turn.y += ((want ? want.y : 0) - turn.y) * Math.min(1, dt * 2);
      off.subVectors(cpos, cat).applyAxisAngle(new THREE.Vector3(0, 1, 0), -turn.x * .05); off.y += turn.y * .3;
      camera.position.copy(cat).add(off); camera.lookAt(cat);
    }
  };
}
