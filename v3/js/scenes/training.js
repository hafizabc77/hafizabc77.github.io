/* Act IV, scene 9: training, explained one idea at a time.
   It opens on Act III's last frame (the model, its guess, "loss 3.22"). That loss value drops onto a plot of
   loss against ONE weight and becomes a point on the curve. The slope at the point is the gradient; each step
   moves the point downhill (gradient descent), and the model's guess for "fast" grows as the loss falls (the loss
   is exactly −log p(fast)). Small steps stop in a dip that is not the bottom (a local minimum), so you choose the
   learning rate and watch it get stuck, escape or explode. With two weights the curve grows into a landscape.
   Finally the loss over a whole training run, in epochs, drawn on a board where Hafiz's three epochs are his
   degrees and his milestones are checkpoints on the curve. */
import * as THREE from 'three';
import { additive, POINT_FRAG, col, sstep, clamp, lerp, easeInOut, pixelScale, glowTexture } from '../core/util.js';
import { cells, slab, floor, motes } from '../core/glass.js';

/* The loss as a function of one weight w ∈ [−1, 1]: a bowl with a dip on its left wall (a local minimum at
   w ≈ −0.43, behind a bump at −0.3) and the real bottom at w = 0.38. The loss is −log p(fast). */
const L = w => .45 + 2.3 * (w - .38) * (w - .38) - .7 * Math.exp(-Math.pow((w + .45) / .11, 2)) + .5 * Math.exp(-Math.pow((w + .3) / .08, 2));
const dL = w => (L(w + 1e-4) - L(w - 1e-4)) / 2e-4;
const W0 = -.718, W_LOCAL = -.43, W_BEST = .38, PW = 4.2, yOf = l => -2.6 + l * 1.25;          // plot units: x = w·PW, y = yOf(loss); L(W0) = 3.22
const H2 = (x, z) => yOf(L(x / PW)) + .16 * z * z + .25 * Math.sin(1.1 * x + .8 * z) * Math.pow(z / 4.5, 2);   // two weights; its z = 0 slice is the curve
// Plain gradient descent, w ← w − lr·dL(w). Too small stops in the dip, just right steps over the bump, too big leaps off the plot.
const RATES = [{ key: 'small', name: 'Too small', lr: .01 }, { key: 'right', name: 'Just right', lr: .04 }, { key: 'big', name: 'Too big', lr: .42 }];
const STEP_T = .42;   // seconds per step when you play with it
const VOCAB = ['fast', 'slowly', 'home', 'away', 'banana', 'models', 'the', 'well'], P0 = [.04, .12, .16, .13, .19, .11, .14, .11];
const LOGO = n => `../assets/showcase/${n}.webp`;
// Hafiz's own training run: three epochs (his degrees), with checkpoints where something came of it.
const EPOCHS = [
  { logos: ['yangzhou'], when: '2019 – 2023', title: 'B.Sc. Microelectronics Engineering', where: 'Yangzhou University' },
  { logos: ['cas', 'ihep'], when: '2023 – 2026', title: 'M.Eng. Computer Application Technology', where: 'UCAS · IHEP, Beijing' },
  { logos: ['cas', 'ihep'], when: '2026 –', title: 'PhD, Computer Application Technology', where: 'UCAS · IHEP, Beijing' }
];
const MILES = [
  { u: .1, html: '“Excellent Student” scholarship', y: '2021' },
  { u: .19, html: 'Web developer at <b>GeePower</b>', y: '2021–22', hi: 1 },
  { u: .28, html: 'Thesis became my first paper, first author', y: '2023' },
  { u: .35, html: 'Research fellow, <b>IHEP</b> Computing Center', y: '2023–' },
  { u: .42, html: 'ANSO Scholarship for Young Talents', y: '2023', hi: 1 },
  { u: .49, html: 'Particle Transformer <b>10.4×</b> faster on a GPU', y: '' },
  { u: .565, html: '<b>AutoDeploy</b>: deployment <b>~63×</b> faster', y: 'thesis', hi: 1 },
  { u: .635, html: 'IHEP Director’s Award', y: '2026' },
  { u: .72, html: 'Algorithm R&amp;D intern at <b>Zidong Taichu</b>', y: '2026' },
  { u: .8, html: 'LLM answers up to <b>3.03×</b> faster', y: 'speculative decoding', hi: 1 },
  { u: .9, html: 'CSC Chinese Government Scholarship', y: '2026' }
];
// Smooth motion through a list of positions: Catmull–Rom, so the point glides from step to step without stopping.
const glide = (a, f) => {
  const n = a.length - 1; if (n < 1) return a[0];
  f = clamp(f, 0, n); const k = Math.min(n - 1, Math.floor(f)), u = f - k;
  const p0 = a[Math.max(0, k - 1)], p1 = a[k], p2 = a[k + 1], p3 = a[Math.min(n, k + 2)];
  return .5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
};

export default function training(ctx) {
  const { small, ui, score, pointer, renderer, coarse } = ctx;
  const scene = new THREE.Scene();
  scene.background = col('#070504');
  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, .05, 300);
  let S = 2, tall = false;
  const GX = i => tall ? PLC.x - 1 + i * .7 : PLC.x + 6.4 + i * .66, GY = () => tall ? PLC.y - 6.2 : PLC.y - 2.6;
  const geoOf = attrs => { const g = new THREE.BufferGeometry(); Object.entries(attrs).forEach(([k, [arr, n]]) => g.setAttribute(k, new THREE.Float32BufferAttribute(arr, n))); return g; };
  const heatGLSL = `vec3 heat(float t) { vec3 c0 = vec3(.15, .8, .9), c1 = vec3(.2, .6, .58), c2 = vec3(1., .64, .26), c3 = vec3(1., .3, .2); return t < .33 ? mix(c0, c1, t / .33) : t < .66 ? mix(c1, c2, (t - .33) / .33) : mix(c2, c3, (t - .66) / .34); }`;

  scene.add(floor(-1.25, '#a8774f'));
  const dust = motes(small ? 180 : 420, [60, 18, 36], '#ffb27a'); scene.add(dust.pts);

  /* ---------- The opening: Act III's model, its guess and its loss, exactly where Act III left them ---------- */
  const BY = j => .85 + j * 1.3, TOP = BY(5) + .7, BAR_Y = TOP + 1.25;
  const BX = w => (w - (VOCAB.length - 1) / 2) * 1.12 * Math.min(1, S / 2 + .2);
  const blocks = Array.from({ length: 6 }, (_, j) => { const s = slab(9.7, .95, 2.6); s.position.set(0, BY(j), 0); scene.add(s); return s; });
  const bars = cells(VOCAB.length + 4); scene.add(bars.mesh);   // the big model's 8 bars, then the plot's 4

  /* ---------- One weight: the loss curve, the point, its slope ---------- */
  const PLC = new THREE.Vector3(-16, 5.2, 0);
  const panel = slab(9.8, 6.8, .05, '#ffb27a'); panel.position.copy(PLC); scene.add(panel);
  const cp = [], ch = [];
  for (let k = 0; k < 800; k++) { const w = -1 + 2 * k / 799; cp.push(PLC.x + w * PW, PLC.y + yOf(L(w)), PLC.z + .04); ch.push(k / 799); }
  const curveMat = additive({ uniforms: { uPx: { value: 1000 }, uOpacity: { value: 0 } },
    vertexShader: `${heatGLSL} attribute float aU; uniform float uPx, uOpacity; varying vec3 vColor; varying float vAlpha;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = max(1., uPx * .05 / -mv.z);
        vColor = heat(clamp((position.y - ${(PLC.y + yOf(.45)).toFixed(2)}) / 4.6, 0., 1.)); vAlpha = uOpacity; }`, fragmentShader: POINT_FRAG });
  const curve = new THREE.Points(geoOf({ position: [cp, 3], aU: [ch, 1] }), curveMat); curve.frustumCulled = false; scene.add(curve);
  const axes = new THREE.LineSegments(geoOf({ position: [[PLC.x - PW - .2, PLC.y - 3, .04, PLC.x + PW + .2, PLC.y - 3, .04, PLC.x - PW - .2, PLC.y - 3, .04, PLC.x - PW - .2, PLC.y + 3, .04], 3] }), new THREE.LineBasicMaterial({ color: 0xffd9b0, transparent: true, opacity: 0 }));
  scene.add(axes);
  const ballMat = new THREE.ShaderMaterial({ uniforms: { uO: { value: 1 } }, transparent: true,
    vertexShader: 'varying vec3 vN, vV; void main() { vec4 w = modelMatrix * vec4(position, 1.); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: 'uniform float uO; varying vec3 vN, vV; void main() { float mu = max(dot(normalize(vN), normalize(vV)), 0.); gl_FragColor = vec4(mix(vec3(.85, .55, .2), vec3(1., .9, .7), pow(mu, 2.)) * (.55 + .4 * mu) * uO, uO); }' });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(.16, 28, 18), ballMat); scene.add(ball);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: col('#ffc27a'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: .3 })); glow.scale.setScalar(.75); scene.add(glow);
  const tanG = new THREE.BufferGeometry(); tanG.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const tangent = new THREE.Line(tanG, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 })); scene.add(tangent);
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(.1, .3, 16), new THREE.MeshBasicMaterial({ color: 0x9ff7ff, transparent: true, opacity: 0 })); scene.add(arrow);
  // Footprints: where each step landed, so the size of a step stays visible after the point has moved on.
  const FP = 40, fpP = new Float32Array(FP * 3), fpA = new Float32Array(FP);
  const fpG = new THREE.BufferGeometry(); fpG.setAttribute('position', new THREE.BufferAttribute(fpP, 3)); fpG.setAttribute('aA', new THREE.BufferAttribute(fpA, 1));
  const fpMat = additive({ uniforms: { uPx: { value: 1000 } }, vertexShader: 'attribute float aA; uniform float uPx; varying vec3 vColor; varying float vAlpha; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = max(1., uPx * .07 / -mv.z); vColor = vec3(1., .82, .5); vAlpha = aA * .7; }', fragmentShader: POINT_FRAG });
  const footprints = new THREE.Points(fpG, fpMat); footprints.frustumCulled = false; scene.add(footprints);
  const foot = (j, w, a) => { fpP.set([PLC.x + clamp(w, -1, 1) * PW, PLC.y + yOf(L(clamp(w, -1, 1))) + .02, .08], (j % FP) * 3); fpA[j % FP] = a; };
  // The scripted descent: small steps that roll into the dip and stop there.
  const STEPS = [W0]; { let w = W0; for (let k = 0; k < 9; k++) { w -= RATES[0].lr * dL(w); STEPS.push(w); } }

  /* ---------- Two weights: the curve grows into a landscape ---------- */
  const tg = new THREE.PlaneGeometry(PW * 2 + .6, 9, small ? 120 : 200, small ? 110 : 180); tg.rotateX(-Math.PI / 2);
  const tp = tg.attributes.position; for (let i = 0; i < tp.count; i++) tp.setY(i, H2(tp.getX(i), tp.getZ(i)));
  tg.computeVertexNormals();
  const TU = { uReveal: { value: 0 }, uOpacity: { value: 0 }, uBall: { value: new THREE.Vector3() } };
  const terrain = new THREE.Mesh(tg, new THREE.ShaderMaterial({ uniforms: TU, transparent: true, depthWrite: false,
    vertexShader: 'varying vec3 vL, vN; void main() { vL = position; vN = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `${heatGLSL} uniform float uReveal, uOpacity; uniform vec3 uBall; varying vec3 vL, vN;
      void main() {
        float t = clamp((vL.y - ${yOf(.45).toFixed(2)}) / 4.6, 0., 1.); vec3 c = heat(t);
        float k = vL.y * 2.6, ln = 1. - min(abs(fract(k) - .5) / fwidth(k), 1.);
        float lam = max(dot(normalize(vN), normalize(vec3(-.4, .8, .45))), 0.);
        float show = smoothstep(uReveal * 4.6 + .05, uReveal * 4.6 - .35, abs(vL.z)) * smoothstep(${(PW + .3).toFixed(2)}, ${(PW - .5).toFixed(2)}, abs(vL.x));
        float near = exp(-pow(length(vL.xz - uBall.xz) / 1.2, 2.));
        vec3 col = c * (.07 + .2 * lam) + c * ln * .8 + vec3(1., .85, .55) * near * .25;
        float a = uOpacity * show;
        gl_FragColor = vec4(col * a, a);
      }`, blending: THREE.AdditiveBlending, premultipliedAlpha: true, side: THREE.DoubleSide }));
  terrain.position.copy(PLC); scene.add(terrain);
  // Rolling down the landscape from the far side; this start clears the dip and reaches the real bottom.
  const PATH2 = []; { let x = -3.4, z = -3, vx = 0, vz = 0; PATH2.push([x, z]); for (let s = 0; s < 400; s++) { const e = 1e-3, gx = (H2(x + e, z) - H2(x - e, z)) / (2 * e), gz = (H2(x, z + e) - H2(x, z - e)) / (2 * e); vx = .8 * vx - .05 * gx; vz = .8 * vz - .05 * gz; x += vx; z += vz; PATH2.push([x, z]); if (s > 50 && Math.hypot(vx, vz) < .001) break; } }

  /* ---------- A whole training run: loss over time, three epochs on one board ---------- */
  const CW = 15, CHH = 7.4, chart = slab(CW, CHH, .05, '#8fe8ff'); chart.position.copy(PLC); scene.add(chart);
  const EP = [[3.22, 1.95], [1.95, 1.02], [1.02, .5]];
  const lossAt = u => { const e = Math.min(2, Math.floor(u * 3)), f = u * 3 - e, [a, b] = EP[e]; return b + (a - b) * Math.exp(-f * 3.2) + .05 * Math.sin(u * 140) * Math.exp(-f * 1.5) * (1 - u * .5); };
  const CX0 = PLC.x - CW / 2 + .5, CXW = CW - 1, CY0 = PLC.y - CHH / 2 + .45, CYH = CHH * .56;   // the curve lives in the lower part, the epoch headers above it
  const chartXY = u => new THREE.Vector3(CX0 + CXW * u, CY0 + (lossAt(u) / 3.4) * CYH, PLC.z + .05);
  const lp = [], lu = []; for (let k = 0; k < 1200; k++) { const u = k / 1199, v = chartXY(u); lp.push(v.x, v.y, v.z); lu.push(u); }
  const runMat = additive({ uniforms: { uPx: { value: 1000 }, uDraw: { value: 0 }, uOpacity: { value: 0 } },
    vertexShader: `${heatGLSL} attribute float aU; uniform float uPx, uDraw, uOpacity; varying vec3 vColor; varying float vAlpha;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = max(1., uPx * .045 / -mv.z);
        vColor = heat(clamp((position.y - ${CY0.toFixed(2)}) / ${CYH.toFixed(2)}, 0., 1.)); vAlpha = uOpacity * step(aU, uDraw); }`, fragmentShader: POINT_FRAG });
  const run = new THREE.Points(geoOf({ position: [lp, 3], aU: [lu, 1] }), runMat); run.frustumCulled = false; scene.add(run);
  const sep = []; [1, 2].forEach(e => { const x = CX0 + CXW * e / 3; sep.push(x, PLC.y - CHH / 2 + .2, .05, x, PLC.y + CHH / 2 - .2, .05); });
  const seps = new THREE.LineSegments(geoOf({ position: [sep, 3] }), new THREE.LineBasicMaterial({ color: 0x8fe8ff, transparent: true, opacity: 0 })); scene.add(seps);
  // Each epoch's band lights up while the run is inside it.
  const bands = [0, 1, 2].map(e => { const m = new THREE.Mesh(new THREE.PlaneGeometry(CXW / 3 - .08, CHH - .3), new THREE.MeshBasicMaterial({ color: col('#8fe8ff'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); m.position.set(CX0 + CXW * (e + .5) / 3, PLC.y, PLC.z + .03); scene.add(m); return m; });
  // Checkpoints: a dot on the curve for each milestone, lit when the run passes it.
  const msP = new Float32Array(MILES.length * 3), msA = new Float32Array(MILES.length);
  MILES.forEach((m, i) => { const v = chartXY(m.u); msP.set([v.x, v.y, v.z + .03], i * 3); });
  const msG = new THREE.BufferGeometry(); msG.setAttribute('position', new THREE.BufferAttribute(msP, 3)); msG.setAttribute('aA', new THREE.BufferAttribute(msA, 1));
  const msMat = additive({ uniforms: { uPx: { value: 1000 } }, vertexShader: 'attribute float aA; uniform float uPx; varying vec3 vColor; varying float vAlpha; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = max(1., uPx * .16 / -mv.z); vColor = vec3(1., .86, .55); vAlpha = aA; }', fragmentShader: POINT_FRAG });
  const msPts = new THREE.Points(msG, msMat); msPts.frustumCulled = false; scene.add(msPts);

  /* ---------- Labels and the learning-rate panel ---------- */
  const lossTag = ui.label('train', '<span class="tag loss-tag">loss 3.22</span>', 'plain loss-lab');
  const axY = ui.label('train', '<span class="tag">loss</span>', 'plain axis-lab'), axX = ui.label('train', '<span class="tag">one weight →</span>', 'plain axis-lab');
  const gradLab = ui.label('train', '<span class="tag part-tag">gradient: downhill is this way</span>', 'plain part-lab');
  const guessLab = ui.label('train', '<span class="tag">the model’s guess</span>', 'plain axis-lab');
  const barLabs = [0, 1, 2, 4].map(i => ui.label('train', `<span class="tag bar-tag"><b>${VOCAB[i]}</b><i></i></span>`, 'plain bar-lab'));
  const boomLab = ui.label('train', '<span class="tag loss-tag">overshot: the loss exploded</span>', 'plain loss-lab');
  const stuckLab = ui.label('train', '<span class="tag"><b>stuck</b> in a local minimum<small>a dip, not the bottom</small></span>', 'plain min-lab stuck');
  const bestLab = ui.label('train', '<span class="tag"><b>the real bottom</b><small>lowest loss</small></span>', 'plain min-lab best');
  const twoLab = ui.label('train', '<span class="tag">two weights →</span>', 'plain axis-lab');
  const timeLab = ui.label('train', '<span class="tag">training time →</span>', 'plain axis-lab');
  const chY = ui.label('train', '<span class="tag">loss</span>', 'plain axis-lab');
  const bandLabs = EPOCHS.map((e, i) => ui.label('train', `<span class="tag"><span class="logos">${e.logos.map(n => `<img src="${LOGO(n)}" alt="">`).join('')}</span><small>Epoch ${i + 1} · ${e.when}</small><b>${e.title}</b><em>${e.where}</em></span>`, 'plain band-lab'));
  const msLabs = MILES.map(m => ui.label('train', `<span class="tag"><i></i>${m.html}${m.y ? `<small>${m.y}</small>` : ''}</span>`, 'plain ms-lab'));
  const ctl = document.createElement('div'); ctl.className = 'tr-panel playing';
  ctl.innerHTML = `<div class="tr-read"><span>loss <b class="tr-loss">3.22</b></span></div><div class="tr-rates"><span>learning rate</span>${RATES.map(x => `<button type="button" data-k="${x.key}">${x.name}</button>`).join('')}</div>`;
  ctx.$('#scene-ui').append(ctl);

  /* ---------- Playing with the learning rate ---------- */
  // A run is the list of weights gradient descent visits, one per step; the point glides through them in time.
  let rate = 'right', live = null, drag = false, dragW = 0, touched = false;
  const sync = () => ctl.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.k === rate));
  ctl.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { touched = true; rate = b.dataset.k; sync(); score.sfx('chime', { f: rate === 'small' ? 330 : rate === 'right' ? 520 : 780 }); restart(live ? live.from : W0); }));
  sync();
  function restart(w) { live = { seq: [w], from: w, t0: ctx.time + .55, seen: 0, end: -1, dead: 0, done: 0 }; fpA.fill(0); }
  function extend(n) {
    const lr = RATES.find(x => x.key === rate).lr, s = live.seq;
    while (s.length < n && live.end < 0) { const w = s[s.length - 1], nw = w - lr * dL(clamp(w, -1, 1)); s.push(nw); if (Math.abs(nw) > 1.15) live.end = s.length - 1; }
    while (s.length < n) s.push(s[s.length - 1]);
  }
  const AUTO = { right: 'big', big: 'small', small: 'right' };   // until you choose, it shows all three in turn

  /* ---------- Camera ---------- */
  const cpos = new THREE.Vector3(), cat = new THREE.Vector3(), off = new THREE.Vector3(), turn = new THREE.Vector2();
  const OPEN = [new THREE.Vector3(7.5, 8.8, 21.5), new THREE.Vector3(-2.6, 6.1, 0)];          // Act III's last shot
  const PLOT = [PLC.clone().add(new THREE.Vector3(3.4, .5, 13.2)), PLC.clone().add(new THREE.Vector3(3.4, -.2, 0))];
  const LAND = [PLC.clone().add(new THREE.Vector3(5.5, 6.8, 9.5)), PLC.clone().add(new THREE.Vector3(0, -1.6, 0))];
  const CHART = [PLC.clone().add(new THREE.Vector3(0, .45, 18.5)), PLC.clone().add(new THREE.Vector3(0, .45, 0))];   // the whole board, sitting low enough to clear the caption
  function shot(p) {
    const PL = tall ? [PLC.clone().add(new THREE.Vector3(0, -1.2, 14.6)), PLC.clone().add(new THREE.Vector3(0, -1.6, 0))] : PLOT, CHT = tall ? [PLC.clone().add(new THREE.Vector3(0, -.4, 21.5)), PLC.clone().add(new THREE.Vector3(0, -.4, 0))] : CHART;
    const seq = [[0, OPEN], [.03, OPEN], [.11, PL], [.46, PL], [.53, LAND], [.6, LAND], [.66, CHT], [1, CHT]];
    let i = 0; while (i < seq.length - 2 && p > seq[i + 1][0]) i++;
    const [pa, A] = seq[i], [pb, B] = seq[i + 1], e = easeInOut(clamp((p - pa) / Math.max(1e-4, pb - pa)));
    cpos.lerpVectors(A[0], B[0], e); cat.lerpVectors(A[1], B[1], e);
    const k = camera.aspect < 1 ? Math.min(2.4, 1 / camera.aspect) : 1;
    off.subVectors(cpos, cat).multiplyScalar(k); cpos.copy(cat).add(off);
  }

  let localP = 0, wShow = W0, wVel = 0, wasPlot = false, hotMs = -1;
  const ballAt = new THREE.Vector3(), tmp = new THREE.Vector3();
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hp = new THREE.Vector3();
  const plotPoint = w => new THREE.Vector3(PLC.x + w * PW, PLC.y + yOf(L(w)) + .16, PLC.z + .1);

  return {
    id: 'train', scene, camera, extra: {},
    captions: [
      { at: [0, .11], html: 'That step lowered the loss a little. To see how, imagine a model with just <b>one weight</b>.', x: 7, y: 14, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.11, .19], html: 'Now the loss is a curve, and the model a point on it. The slope there is the <b>gradient</b>.', x: 7, y: 14, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.19, .26], html: 'Each step moves the weight a little downhill: <b>gradient descent</b>. As the loss falls, <i>fast</i> gets likelier.', x: 7, y: 14, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.26, .31], html: 'But it stopped short, in a <b>local minimum</b>: every way out goes uphill. The real bottom is further on.', x: 7, y: 14, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.31, .46], html: 'The step size, the <b>learning rate</b>, decides. Just right, it hops the bump; too small, it’s stuck; too big, the loss explodes.', x: 7, y: 14, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.32, .46], html: `<span class="hint-dot"></span>Pick a learning rate · ${coarse ? 'drag' : 'drag'} the point to start somewhere else`, x: 50, y: 74, cls: 'hint', align: 'center' },
      { at: [.47, .6], html: 'With two weights, the curve becomes a landscape. Real models walk one in billions of dimensions, the same way.', x: 7, y: 14, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.62, .72], html: 'Training repeats this over all the data. Each full pass is an <b>epoch</b>; the loss falls further each time.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.72, .88], html: 'My own training has run in three epochs so far. Each one brought the loss down.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.88, 1.05], html: 'The third is running now. The loss is still going down.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } }
    ],
    resize(aspect) { camera.aspect = aspect; camera.updateProjectionMatrix(); tall = aspect < 1; S = aspect < 1 ? 1.02 : 2; blocks.forEach(b => { b.scale.x = (4 * S + 1.7) / 9.7; }); },
    init() { this.resize(innerWidth / innerHeight); },
    show(on) { if (!on) { ctl.classList.remove('on'); document.body.style.cursor = ''; } },
    pointer(type) {
      if (localP > .64) {
        hotMs = -1; let bestD = 26;
        MILES.forEach((m, i) => { if (msA[i] < .5) return; const s = ui.screen(chartXY(m.u), camera), d = Math.hypot(s.x - pointer.x, s.y - pointer.y); if (d < bestD) { bestD = d; hotMs = i; } });
        document.body.style.cursor = hotMs >= 0 ? 'help' : ''; return;
      }
      if (localP < .31 || localP > .46) { document.body.style.cursor = ''; return; }
      ray.setFromCamera(pointer.ndc, camera); const hit = ray.ray.intersectPlane(plane, hp);
      const s = ui.screen(ball.position, camera), near = Math.hypot(s.x - pointer.x, s.y - pointer.y) < 46;
      if (type === 'down' && (near || coarse) && hit) { drag = true; touched = true; }
      if (type === 'up' && drag) { drag = false; restart(dragW); score.sfx('pop'); }
      if (drag && hit) dragW = clamp((hp.x - PLC.x) / PW, -.98, .98);
      document.body.style.cursor = drag ? 'grabbing' : near ? 'grab' : '';
    },
    update(p, info) {
      localP = p;
      const t = info.time, act = info.active, dt = info.dt, px = pixelScale(renderer, camera);
      [curveMat, fpMat, runMat, msMat].forEach(m => { m.uniforms.uPx.value = px; }); dust.mat.uniforms.uTime.value = t; dust.mat.uniforms.uPx.value = px;

      /* Where the point should be, beat by beat. */
      let w = W0, stuck = false;
      const scripted = p >= .19 && p < .31, playing = p >= .31 && p < .46;
      for (let i = 0; i < FP; i++) fpA[i] *= Math.pow(.4, dt);
      if (scripted) {
        // Scrolling walks the small steps; the point glides through them and settles in the dip.
        const f = clamp((p - .19) / .065) * (STEPS.length - 1);
        w = glide(STEPS, f);
        for (let j = 0; j <= Math.floor(f); j++) foot(j, STEPS[j], .8);
        stuck = p > .25;
      } else if (playing) {
        if (!live) restart(W0);
        if (drag) { w = dragW; live.t0 = t + 99; }
        else {
          const f = Math.max(0, (t - live.t0) / STEP_T); extend(Math.ceil(f) + 3);
          const reach = live.end >= 0 ? Math.min(f, live.end) : f;
          w = glide(live.seq, reach);
          for (let j = live.seen; j <= Math.floor(reach); j++) { foot(j, live.seq[j], 1); if (j > 0) score.sfx('tick'); }
          live.seen = Math.max(live.seen, Math.floor(reach) + 1);
          if (live.end >= 0 && f >= live.end && !live.dead) { live.dead = t; score.sfx('wave'); }
          const settled = live.seq.length > 3 && Math.floor(f) > 8 && Math.abs(live.seq[Math.floor(f)] - live.seq[Math.floor(f) - 1]) < .01;
          stuck = rate === 'small' && Math.floor(f) >= 5;
          if (settled && !live.done) live.done = t;
          const over = live.dead ? t - live.dead > 1.8 : live.done ? t - live.done > (rate === 'small' ? 2.2 : 1.6) : false;
          if (over) { if (!touched) { rate = AUTO[rate]; sync(); } restart(live.from); }
        }
      } else if (p >= .31) w = W_BEST;
      if (!playing) live = null;
      // The point never jumps: it slides along the curve to where it should be.
      const onPlot = p >= .11 && p < .47;
      // A critically damped spring: it follows closely, and long slides (a restart) start and end gently.
      if (!wasPlot || drag) { wShow = w; wVel = 0; }
      else { const om = Math.abs(w - wShow) > .15 ? 6 : 16; for (let left = dt; left > 1e-6; left -= 1 / 120) { const h = Math.min(left, 1 / 120); wVel += (om * om * (w - wShow) - 2 * om * wVel) * h; wShow += wVel * h; } }
      wasPlot = onPlot;
      const wv = clamp(wShow, -1.05, 1.05);
      let loss = L(clamp(wv, -1, 1));
      fpG.attributes.position.needsUpdate = true; fpG.attributes.aA.needsUpdate = true;

      /* The opening: Act III's model and bars, then they step back as the plot takes over. */
      const openO = 1 - sstep(.05, .13, p);
      blocks.forEach(b => b.userData.set(.5 * openO * (1 - sstep(.5, .6, p)), 0));
      const pf = Math.exp(-loss), rest = (1 - pf);
      const plotProbs = [pf, rest * .3, rest * .3, rest * .4];
      VOCAB.forEach((_, i) => { const hgt = (.12 + P0[i] * 6.5) * openO; bars.set(i, BX(i), BAR_Y + hgt / 2, 0, .72, Math.max(.001, hgt), .72, i === 0 ? .95 : .25 + P0[i] * 2, i === 0 ? .3 : 0, openO * (1 - sstep(.5, .6, p))); });
      const plotOn = sstep(.07, .13, p) * (1 - sstep(.46, .52, p));
      plotProbs.forEach((q, i) => { const hgt = .1 + q * (tall ? 2.4 : 3.4); bars.set(VOCAB.length + i, GX(i), GY() + hgt / 2, 0, .46, hgt, .46, i === 0 ? .95 : .3 + q * 1.5, i === 0 ? .25 : 0, plotOn); });
      bars.commit();

      /* The plot, the point, its slope. */
      panel.userData.set(plotOn * .55, 0); curveMat.uniforms.uOpacity.value = Math.max(plotOn, sstep(.46, .5, p) * (1 - sstep(.58, .62, p))); axes.material.opacity = plotOn * .5;
      const onLand = p >= .52 && p < .62;
      let target;
      if (p < .11) { const from = new THREE.Vector3(BX(0), BAR_Y + .12 + P0[0] * 6.5 + .4, 0), to = plotPoint(W0), e = sstep(.04, .11, p); target = from.lerp(to, e); target.y += Math.sin(e * Math.PI) * 1.6; }
      else if (onLand) { const f = clamp((p - .52) / .075) * (PATH2.length - 1), x = glide(PATH2.map(q => q[0]), f), z = glide(PATH2.map(q => q[1]), f); target = PLC.clone().add(tmp.set(x, H2(x, z) + .16, z)); loss = L(clamp(x / PW, -1, 1)) + .16 * z * z / 1.25; TU.uBall.value.set(x, 0, z); }
      else if (p >= .62) { const u = clamp((p - .64) / .29); target = chartXY(Math.max(.001, u)); target.z += .1; loss = lossAt(Math.max(.001, u)); }
      else target = plotPoint(wv);
      // Between beats (and on the flight in) the ball eases through space instead of snapping.
      if (onPlot || info.weight < .02 || ballAt.lengthSq() === 0) ballAt.copy(target); else ballAt.lerp(target, 1 - Math.exp(-dt * 9));
      ball.position.copy(ballAt); glow.position.copy(ballAt);
      const ballO = p < .04 ? sstep(.02, .04, p) : Math.abs(wShow) > 1.04 ? .35 : 1; ballMat.uniforms.uO.value = ballO; glow.material.opacity = .3 * ballO;
      // The slope: a tangent line through the point, and an arrow pointing downhill.
      const g = dL(clamp(wv, -1, 1)) * 1.25 / PW, tanOn = (p > .12 && p < .46 ? 1 : 0) * plotOn, len = .9, dx = len / Math.hypot(1, g);
      const c0 = plotPoint(clamp(wv, -1, 1)).setZ(.12);
      tanG.attributes.position.array.set([c0.x - dx, c0.y - g * dx, c0.z, c0.x + dx, c0.y + g * dx, c0.z]); tanG.attributes.position.needsUpdate = true; tangent.material.opacity = tanOn * .85;
      const down = g > 0 ? -1 : 1; arrow.position.set(c0.x + down * (dx + .2), c0.y + g * down * (dx + .2), c0.z); arrow.rotation.z = Math.atan2(g * down, down) - Math.PI / 2; arrow.material.opacity = tanOn * (Math.abs(g) > .05 && !stuck ? .9 : 0);

      /* The landscape and the run. */
      TU.uReveal.value = easeInOut(clamp((p - .47) / .06)); TU.uOpacity.value = sstep(.46, .5, p) * (1 - sstep(.6, .64, p));
      const chOn = sstep(.61, .66, p), uRun = clamp((p - .64) / .29), epNow = Math.min(2, Math.floor(uRun * 3 - 1e-3));
      chart.userData.set(chOn * .55, 0); runMat.uniforms.uOpacity.value = chOn; runMat.uniforms.uDraw.value = uRun; seps.material.opacity = chOn * .35;
      bands.forEach((b, e) => { const want = chOn * (p > .64 && e === epNow ? .022 : uRun * 3 > e ? .006 : 0); b.material.opacity += (want - b.material.opacity) * Math.min(1, dt * 4); });
      MILES.forEach((m, i) => { const on = chOn > .5 && uRun > m.u ? 1 : 0; msA[i] += (on * .95 - msA[i]) * Math.min(1, dt * 5); });
      msG.attributes.aA.needsUpdate = true;

      /* Words in the world. */
      const show = (lab, pos, on) => ui.place(lab, pos, camera, act && on);
      const end = p >= .62 && uRun > .985;
      const lt = lossTag.el.querySelector('.tag'), txt = end ? `loss ${loss.toFixed(2)} · still training…` : `loss ${loss.toFixed(2)}`; if (lt.textContent !== txt) lt.textContent = txt;
      lossTag.el.classList.toggle('live', end);
      const lpos = ballAt.clone().add(tmp.set(0, .5, 0)); if (tall && p > .62) lpos.x = Math.min(lpos.x, PLC.x + CW / 2 - 5);
      show(lossTag, lpos, (p > .01 && p < .46) || onLand || p > .64);
      show(axY, new THREE.Vector3(PLC.x - PW - .4, PLC.y + 2.7, 0), plotOn > .5);
      show(axX, new THREE.Vector3(PLC.x + PW - .6, PLC.y - 3.35, 0), plotOn > .5);
      show(gradLab, arrow.position.clone().add(tmp.set(tall ? 2.2 : 0, .45, 0)), p > .12 && p < .2);
      show(guessLab, tall ? new THREE.Vector3(PLC.x + 2.2, GY() + 1.4, 0) : new THREE.Vector3(PLC.x + 7.4, PLC.y + 1.4, 0), plotOn > .5);
      [0, 1, 2, 3].forEach(i => { const q = plotProbs[i], el = barLabs[i].el.querySelector('i'), tx = `${Math.round(q * 100)}%`; if (el.textContent !== tx) el.textContent = tx; barLabs[i].el.classList.toggle('truth', i === 0); show(barLabs[i], new THREE.Vector3(GX(i), GY() - .4, .3), plotOn > .5 && (!tall || i === 0)); });
      show(boomLab, plotPoint(clamp(wv, -.55, .55)).add(tmp.set(0, 1.1, 0)), !!(live && live.dead));
      show(stuckLab, plotPoint(W_LOCAL).add(tmp.set(0, -.55, 0)), stuck && plotOn > .5);
      show(bestLab, plotPoint(W_BEST).add(tmp.set(0, -.55, 0)), stuck && plotOn > .5);
      show(twoLab, PLC.clone().add(tmp.set(0, -2.4, 4.4)), onLand);
      show(timeLab, new THREE.Vector3(PLC.x + CW / 2 - 1.4, CY0 - .25, .1), chOn > .5);
      show(chY, new THREE.Vector3(CX0 + .2, CY0 + CYH + .1, .1), chOn > .5 && !tall);
      // The epochs are written on the board, above their part of the curve; the checkpoints sit on the curve itself.
      EPOCHS.forEach((e, i) => {
        const reached = p > .64 && uRun * 3 > i - .02, cur = i === epNow;
        bandLabs[i].el.classList.toggle('cur', cur); bandLabs[i].el.classList.toggle('up', tall);
        show(bandLabs[i], tall ? new THREE.Vector3(PLC.x, PLC.y + CHH / 2 + .35, .1) : new THREE.Vector3(CX0 + CXW * (i + .5) / 3, PLC.y + CHH / 2 - .3, .1), chOn > .5 && reached && (!tall || cur));
      });
      let latest = -1; MILES.forEach((m, i) => { if (uRun > m.u) latest = i; });
      MILES.forEach((m, i) => {
        const v = chartXY(m.u);
        msLabs[i].el.classList.toggle('below', tall); msLabs[i].el.classList.toggle('hi', !tall && i === latest - 1 && i !== hotMs);
        // The newest checkpoint's label sits low; when the next arrives, it rises and the one before it fades. Hover any lit dot to read it again.
        show(msLabs[i], tall ? new THREE.Vector3(PLC.x, PLC.y - CHH / 2 - .3, .1) : v.add(tmp.set(0, .12, .1)), chOn > .5 && uRun > m.u && (tall ? i === latest : i === latest || i === latest - 1 || i === hotMs));
      });
      ctl.querySelector('.tr-loss').textContent = loss.toFixed(2);
      ctl.classList.toggle('on', act && playing);

      /* Camera. */
      shot(p);
      const want = pointer.inside && !coarse && !drag ? pointer.ndc : null;
      turn.x += ((want ? want.x : 0) - turn.x) * Math.min(1, dt * 2); turn.y += ((want ? want.y : 0) - turn.y) * Math.min(1, dt * 2);
      off.subVectors(cpos, cat).applyAxisAngle(new THREE.Vector3(0, 1, 0), -turn.x * .06); off.y += turn.y * .4;
      camera.position.copy(cat).add(off); camera.lookAt(cat);
    }
  };
}
