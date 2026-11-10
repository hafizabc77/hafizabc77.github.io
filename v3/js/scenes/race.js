/* Act VI, scene 14: AutoDeploy, part two: deploy and learn.
   It opens where Act V left the package, gliding along the rail. The package splits into three copies that fly into
   three real chips, built in 3D after the boards from Hafiz's thesis: an Intel Xeon Gold 6248, an NVIDIA Tesla V100 and a
   Xilinx Alveo U200. Then the race, replayed from his thesis tables: every surviving setup on every chip, bars as long as
   they are fast, the setups that miss your accuracy limit greyed out, and AutoDeploy's pick per chip. You choose how
   much accuracy you can give up and race again. The surprise (tuned FP16 beat INT8 on the V100) and the FPGA (72 µs at
   40 W) are told. Then step six, learn: the results stream back into the knowledge graph, and the whole thing in one
   picture: three weeks by hand against eight hours. It ends diving into the FPGA. */
import * as THREE from 'three';
import { additive, POINT_FRAG, col, rng, sstep, clamp, lerp, easeInOut, easeOut, pixelScale, glowTexture, textTexture } from '../core/util.js';
import { cells, slab, floor, motes } from '../core/glass.js';

/* His thesis tables: [setup, latency, accuracy %, watts, AutoDeploy's own tuned setup]. FPGA values are HLS estimates. */
export const CHIPS = [
  { k: 'cpu', name: 'Intel Xeon Gold 6248', unit: 'ms', base: 0, baseName: 'PyTorch on one thread', rows: [['PyTorch, one thread', 45.2, 94.0, 85], ['PyTorch, 20 threads', 12.8, 94.0, 150], ['ONNX Runtime, tuned', 8.6, 94.0, 145, 1]], fix: null },
  { k: 'gpu', name: 'NVIDIA Tesla V100', unit: 'ms', base: 0, baseName: 'the model as trained', rows: [['PyTorch, as trained', 3.8, 94.0, 220], ['TensorRT, FP16', .82, 93.7, 200], ['TensorRT, 8-bit', .51, 93.4, 190], ['AutoDeploy, tuned FP16', .45, 93.5, 180, 1]], fix: 'quantize step failed → rolled back → fixed' },
  { k: 'fpga', name: 'Xilinx Alveo U200', unit: 'µs', est: true, base: 3, baseName: 'my best hand-tuned design', rows: [['hls4ml, 16-bit fixed point', 92, 93.0, 42], ['hls4ml, 8-bit fixed point', 68, 91.6, 38], ['Vitis AI, 8-bit', 85, 92.3, 41], ['My best, tuned by hand', 78, 92.1, 42], ['AutoDeploy, tuned', 72, 93.0, 40, 1]], fix: 'out of FPGA resources → retried smaller → fixed' }
];
const ALLOW = [0, .5, 1, 2.5], BASE_ACC = 94.0;
const pickRow = (c, allow) => { let best = -1; c.rows.forEach((r, i) => { if (r[2] >= BASE_ACC - allow - 1e-6 && (best < 0 || r[1] < c.rows[best][1])) best = i; }); return best; };

/* The three boards, built after the photos (also used further down Act VI). */
export function makeChip(kind) {
  const g = new THREE.Group();
  const std = (c, m = .5, r = .45) => new THREE.MeshStandardMaterial({ color: col(c), metalness: Math.min(m, .42), roughness: Math.max(r, .32) });   // no environment map: keep metals readable
  const label = (text, sub, w, color, z) => { const { texture, aspect } = textTexture([text], { size: 80, weight: 700, color, sub, subColor: color, subSize: .5, pad: .25 }); const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / aspect), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })); m.position.z = z; return m; };
  if (kind === 'cpu') {
    g.add(new THREE.Mesh(new THREE.BoxGeometry(2.3, 2.3, .12), std('#1d5a3c', .2, .6)));
    for (let k = 0; k < 18; k++) { const pin = new THREE.Mesh(new THREE.BoxGeometry(.05, .14, .13), std('#d8b45a', .9, .3)); pin.position.set(-1 + k * .118, -1.08, .01); g.add(pin); }
    const ihs = new THREE.Mesh(new THREE.BoxGeometry(1.75, 1.75, .16), std('#c9ccd2', .9, .28)); ihs.position.z = .14; g.add(ihs);
    g.add(label('intel', 'XEON GOLD 6248', 1.25, '#24365e', .225));
  } else if (kind === 'gpu') {
    g.add(new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.25, .4), std('#16181d', .65, .35)));
    [-.6, .6].forEach(y => { const t = new THREE.Mesh(new THREE.BoxGeometry(4.6, .05, .42), std('#c9a24a', .9, .3)); t.position.y = y; g.add(t); });
    for (let k = 0; k < 14; k++) { const f = new THREE.Mesh(new THREE.BoxGeometry(.04, .9, .02), std('#2a2d33', .7, .4)); f.position.set(-2 + k * .16, 0, .21); g.add(f); }
    const br = new THREE.Mesh(new THREE.BoxGeometry(.08, 1.45, .46), std('#b8bcc4', .9, .3)); br.position.x = 2.34; g.add(br);
    const lab = label('NVIDIA', 'TESLA V100', 1.4, '#d8b45a', .215); lab.position.x = .9; g.add(lab);
  } else {
    g.add(new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.2, .4), std('#b9bdc5', .88, .28)));
    const band = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.22, .41), std('#c8102e', .4, .45)); band.position.x = -.85; g.add(band);
    const br = new THREE.Mesh(new THREE.BoxGeometry(.08, 1.4, .46), std('#9a9ea6', .9, .3)); br.position.x = 2.14; g.add(br);
    const lab = label('XILINX', 'ALVEO U200', 1.3, '#ffffff', .215); lab.position.x = -.85; g.add(lab);
  }
  return g;
}

export default function race(ctx) {
  const { small, ui, score, pointer, renderer, coarse } = ctx;
  const scene = new THREE.Scene();
  scene.background = col('#05050c');
  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, .05, 400);
  const r = rng(7303);
  let tall = false;
  scene.add(new THREE.HemisphereLight(col('#bcd2ff'), col('#1a0f24'), 1.1));
  const key = new THREE.DirectionalLight(col('#ffffff'), 1.6); key.position.set(4, 9, 12); scene.add(key);
  const rimV = new THREE.PointLight(col('#9a7bff'), 30, 18); rimV.position.set(-6, 7, -6); scene.add(rimV);
  const rimG = new THREE.PointLight(col('#ffcf7a'), 24, 18); rimG.position.set(7, 6, -5); scene.add(rimG);
  scene.add(floor(-.06, '#7a6cff'));
  const dust = motes(small ? 180 : 420, [50, 16, 30], '#c9b8ff'); scene.add(dust.pts);

  /* ---------- The rail and the package, as Act V left them ---------- */
  const RAIL_Y = 1;
  const rail = slab(40, .06, .5, '#8fe8ff'); rail.position.set(-10, RAIL_Y, 0); scene.add(rail);
  const pkgs = [0, 1, 2].map(() => { const s = slab(.85, .85, .85, '#ffd27a'); scene.add(s); return s; });
  const pkgGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: col('#ffc27a'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: .35 })); pkgGlow.scale.setScalar(2.4); scene.add(pkgGlow);

  /* ---------- Three chips on glass stands ---------- */
  const chips = CHIPS.map(c => { const g = makeChip(c.k); scene.add(g); const stand = slab(c.k === 'cpu' ? 2.8 : 5, .18, 1.4, '#b49bff'); scene.add(stand); const spot = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: col(c.k === 'cpu' ? '#9fe6ff' : c.k === 'gpu' ? '#ffd27a' : '#ff8a8a'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 })); spot.scale.setScalar(6); scene.add(spot); return { g, stand, spot }; });
  const ROWS = CHIPS.reduce((n, c) => n + c.rows.length, 0), lanes = cells(ROWS * 2); scene.add(lanes.mesh);
  const LT = 4.2;
  let P = null, gnPts = null, geLines = null;   // layout: chip centres and lane origins
  function layout() {
    P = CHIPS.map((c, k) => tall
      ? { chip: new THREE.Vector3(0, 13.4 - k * 5, -1.5), scale: .72, lane: new THREE.Vector3(0, 12.15 - k * 5, -1), row: .38, lt: 4.2 }
      : { chip: new THREE.Vector3((k - 1) * 6.6, 4.7, -2.6), scale: c.k === 'cpu' ? 1 : .95, lane: new THREE.Vector3((k - 1) * 6.6, 3.15, -1), row: .42, lt: LT });
    gnodes.forEach((v, i) => { v.copy(gnBase[i]); if (tall) { v.x *= .38; v.y += 9.2; } }); if (gnPts) { const a = gnPts.geometry.attributes.position; gnodes.forEach((v, i) => a.setXYZ(i, v.x, v.y, v.z)); a.needsUpdate = true; const e = geLines.geometry.attributes.position; for (let k = 0; k < gedges.length; k += 2) { const p0 = gnodes[gedges[k]], p1 = gnodes[gedges[k + 1]]; e.setXYZ(k, p0.x, p0.y, p0.z); e.setXYZ(k + 1, p1.x, p1.y, p1.z); } e.needsUpdate = true; }
    chips.forEach((o, k) => { o.g.position.copy(P[k].chip); o.g.scale.setScalar(P[k].scale); o.stand.position.copy(P[k].chip).add(new THREE.Vector3(0, -.95 * P[k].scale, 0)); o.stand.scale.setScalar(P[k].scale); o.spot.position.copy(P[k].chip).add(new THREE.Vector3(0, 0, -.8)); o.spot.scale.setScalar(7 * P[k].scale); });
  }

  /* ---------- Learn: results stream back into the knowledge graph ---------- */
  const GN = 18, gnodes = Array.from({ length: GN }, () => new THREE.Vector3((r() - .5) * 13, 8.4 + r() * 2.4, -3 - r() * 2)), gnBase = gnodes.map(v => v.clone());
  const gedges = []; gnodes.forEach((a, i) => { const near = gnodes.map((b, j) => [j, a.distanceTo(b)]).filter(([j]) => j !== i).sort((x, y) => x[1] - y[1]).slice(0, 2); near.forEach(([j]) => { if (i < j) gedges.push(i, j); }); });
  const gnP = [], gnC = [], gnS = []; gnodes.forEach((v, i) => { gnP.push(v.x, v.y, v.z); const c = col(['#ffd27a', '#f3efdc', '#ff9a62', '#84e0a8'][i % 4]); gnC.push(c.r, c.g, c.b); gnS.push(.32); });
  const ptsMat = () => additive({ uniforms: { uPx: { value: 1000 }, uO: { value: 0 } }, vertexShader: 'attribute vec3 color; attribute float aS; uniform float uPx, uO; varying vec3 vColor; varying float vAlpha; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = max(1., uPx * aS / -mv.z); vColor = color; vAlpha = uO; }', fragmentShader: POINT_FRAG });
  const geoOf = attrs => { const g = new THREE.BufferGeometry(); Object.entries(attrs).forEach(([k, [arr, n]]) => g.setAttribute(k, new THREE.Float32BufferAttribute(arr, n))); return g; };
  const gnMat = ptsMat(); gnPts = new THREE.Points(geoOf({ position: [gnP, 3], color: [gnC, 3], aS: [gnS, 1] }), gnMat); gnPts.frustumCulled = false; scene.add(gnPts);
  const geP = []; for (let k = 0; k < gedges.length; k += 2) { const a = gnodes[gedges[k]], b = gnodes[gedges[k + 1]]; geP.push(a.x, a.y, a.z, b.x, b.y, b.z); }
  geLines = new THREE.LineSegments(geoOf({ position: [geP, 3] }), new THREE.LineBasicMaterial({ color: 0x8fb8d8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); scene.add(geLines);
  const SN = small ? 180 : 360, stP = new Float32Array(SN * 3), stC = [], stS = [], stInfo = [];
  for (let i = 0; i < SN; i++) { const k = i % 3, c = col(['#9fe6ff', '#ffd27a', '#ff8a8a'][k]); stC.push(c.r, c.g, c.b); stS.push(.06 + r() * .05); stInfo.push([k, Math.floor(r() * GN), r(), .25 + r() * .35]); }
  const stGeo = new THREE.BufferGeometry(); stGeo.setAttribute('position', new THREE.BufferAttribute(stP, 3)); stGeo.setAttribute('color', new THREE.Float32BufferAttribute(stC, 3)); stGeo.setAttribute('aS', new THREE.Float32BufferAttribute(stS, 1));
  const stMat = ptsMat(), streams = new THREE.Points(stGeo, stMat); streams.frustumCulled = false; scene.add(streams);
  // Three weeks against eight hours, to scale.
  const handBar = slab(12, .26, .2, '#b49bff'), autoBar = slab(12 * 8 / 504, .26, .2, '#ffd27a'); scene.add(handBar, autoBar);

  /* ---------- Words and the race controls ---------- */
  const L = (html, cls) => ui.label('race', html, cls);
  const chipLabs = CHIPS.map(c => L(`<span class="tag"><b>${c.name}</b><small>${c.k.toUpperCase()}${c.est ? ' · HLS estimates' : ''}</small></span>`, 'plain chipname-lab'));
  const rowLabs = [], valLabs = [];
  CHIPS.forEach(c => c.rows.forEach(rw => { rowLabs.push(L(`<span class="tag">${rw[0]}</span>`, 'plain row-lab')); valLabs.push(L(`<span class="tag"></span>`, 'plain val-lab2')); }));
  const pickLabs = CHIPS.map(() => L('<span class="tag"></span>', 'plain pick-lab'));
  const fixLabs = CHIPS.map(c => L(`<span class="tag">${c.fix || ''}</span>`, 'plain fix-lab'));
  const surpriseLab = L('<span class="tag">FP16 on the tensor cores: <b>0.45 ms</b><small>8-bit: 0.51 ms and less accurate</small></span>', 'plain stat-lab');
  const fpgaLab = L('<span class="tag"><b>72 µs</b> at <b>40 W</b><small>the V100’s best: 450 µs at 180 W</small></span>', 'plain stat-lab');
  const learnLabs = [['tries before the first working setup', '8 → 2'], ['setups that fail', '35% → 8%'], ['best latency found', '0.52 → 0.45 ms']].map(([a, b]) => L(`<span class="tag"><b>${b}</b><small>${a}</small></span>`, 'plain learn-lab'));
  const handLab = L('<span class="tag"><b>By hand</b> · 21 days, ~80 expert hours, 5–10 setups</span>', 'plain bar-cap'), autoLab = L('<span class="tag"><b>AutoDeploy</b> · 8 hours, ~2 expert hours, 50–100 setups</span>', 'plain bar-cap gold');
  const ctl = document.createElement('div'); ctl.className = 'race-ctl';
  ctl.innerHTML = `<span>How much accuracy can you give up?</span><div class="rc-row">${ALLOW.map(a => `<button type="button" data-a="${a}">${a ? `${a} pt` : 'None'}</button>`).join('')}<button type="button" class="rc-go">▶ Race again</button></div><small>The model starts at 94.0%. FPGA numbers are HLS synthesis estimates.</small>`;
  ctx.$('#scene-ui').append(ctl);
  let allow = 1, raceT0 = -1, userAllow = false;
  const startRace = () => { raceT0 = ctx.time; score.sfx('whoosh', { up: true, dur: .8 }); };
  ctl.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => { allow = +b.dataset.a; userAllow = true; startRace(); score.sfx('chime', { f: 300 + allow * 120 }); }));
  ctl.querySelector('.rc-go').addEventListener('click', startRace);

  /* ---------- Camera ---------- */
  const cpos = new THREE.Vector3(), cat = new THREE.Vector3(), off = new THREE.Vector3(), turn = new THREE.Vector2(), tmp = new THREE.Vector3();
  const S = (a, b) => [new THREE.Vector3(...a), new THREE.Vector3(...b)];
  function shot(p) {
    const OPEN = S([-6, 3.2, 9], [-4, 2, 0]);
    const G = k => { const y = P[k].chip.y + .25, d = 5.4 / camera.aspect / (2 * Math.tan(THREE.MathUtils.degToRad(21))) / Math.min(2.4, 1.05 / camera.aspect); return S([0, y + .4, d], [0, y, -1.2]); };   // one chip and its lanes, filling a phone
    const WIDE = tall ? G(0) : S([0, 4.4, 15.5], [0, 3.5, -1.6]);
    const GPU = tall ? G(1) : S([.4, 4.1, 10.2], [.4, 3.3, -1.6]), FPGA = tall ? G(2) : S([6.4, 4.1, 10.2], [6.4, 3.3, -1.6]);
    const LEARN = tall ? S([0, 17.8, 13], [0, 17.2, -2]) : S([0, 7.6, 16.5], [0, 6.9, -2.5]);
    const fp = P[2].chip, DIVE = S([fp.x, fp.y + .1, fp.z + 1.4], [fp.x, fp.y, fp.z - 2]);
    const seq = tall ? [[0, OPEN], [.04, OPEN], [.12, WIDE], [.24, WIDE], [.27, GPU], [.36, GPU], [.39, FPGA], [.5, FPGA], [.53, GPU], [.6, GPU], [.64, FPGA], [.7, FPGA], [.75, LEARN], [.9, LEARN], [.99, DIVE], [1, DIVE]]
      : [[0, OPEN], [.04, OPEN], [.12, WIDE], [.5, WIDE], [.54, GPU], [.6, GPU], [.64, FPGA], [.7, FPGA], [.75, LEARN], [.9, LEARN], [.99, DIVE], [1, DIVE]];
    let i = 0; while (i < seq.length - 2 && p > seq[i + 1][0]) i++;
    const [pa, A] = seq[i], [pb, B] = seq[i + 1], e = easeInOut(clamp((p - pa) / Math.max(1e-4, pb - pa)));
    cpos.lerpVectors(A[0], B[0], e); cat.lerpVectors(A[1], B[1], e);
    const Ka = Math.min(2.7, 1.2 / camera.aspect), Kb = Math.min(2.4, 1.05 / camera.aspect);
    const last = seq.length - 2, K = !tall ? 1 : i === 0 ? Ka : i === 1 ? lerp(Ka, Kb, e) : i === last - 1 ? lerp(Kb, 1, e) : i >= last ? 1 : Kb;   // the opening matches Act V's framing; the dive ends at the card's face
    off.subVectors(cpos, cat).multiplyScalar(K); cpos.copy(cat).add(off);
  }

  let localP = 0, started = false;
  const focusK = p => p < .255 ? 0 : p < .375 ? 1 : p < .515 ? 2 : p < .62 ? 1 : 2;   // on a phone, the chip in view
  const fmt = (c, v) => c.unit === 'µs' ? `${v} µs` : `${v < 1 ? v.toFixed(2) : v.toFixed(1)} ms`;

  return {
    id: 'race', scene, camera, extra: {},
    captions: [
      { at: [0, .1], html: 'Step five, <b>deploy</b>: the same model and config go to a CPU, a GPU and an FPGA. No hand-written code for any.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.12, .3], html: 'On each chip it races every surviving setup and keeps the fastest within your accuracy limit. Longer bars are faster.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.3, .5], html: 'Things break, as in my runs: a GPU quantize step overflowed, the FPGA ran out of room. Each time it rolled back or retried.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.14, .5], html: '<span class="hint-dot"></span>Choose how much accuracy you can give up, then race again', x: 50, y: 74, cls: 'hint desk', align: 'center' },
      { at: [.52, .61], html: 'The surprise: on the V100, tuned <b>FP16</b> beat 8-bit. Its tensor cores speed up FP16, not INT8. A fixed recipe would have missed it.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.62, .71], html: 'On the FPGA: <b>72 µs</b> at 40 watts, six times the best GPU’s speed on a quarter of the power. Still over the 12.5 µs budget.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.73, .82], html: 'Step six, <b>learn</b>: every result flows back into the knowledge graph, so the next deployment starts smarter.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.82, .92], html: 'Three chips: about three weeks by hand, eight hours with AutoDeploy. <b>~63×</b> faster, <b>~40×</b> less expert time, <b>~10×</b> more setups tried.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.93, 1.05], html: 'Now let’s look inside that FPGA.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } }
    ],
    resize(aspect) { camera.aspect = aspect; camera.updateProjectionMatrix(); tall = aspect < 1; layout(); },
    init() { this.resize(innerWidth / innerHeight); },
    show(on) { if (!on) { ctl.classList.remove('on'); } },
    pointer() {},
    update(p, info) {
      localP = p;
      const t = info.time, act = info.active, dt = info.dt, px = pixelScale(renderer, camera);
      [gnMat, stMat].forEach(m => { m.uniforms.uPx.value = px; }); dust.mat.uniforms.uTime.value = t; dust.mat.uniforms.uPx.value = px;
      if (p > .17 && !started && act) { started = true; startRace(); }
      if (p < .1) started = false;
      if (!userAllow && p < .12) allow = 1;

      /* The package splits into three and each copy flies into its chip. */
      const split = easeInOut(clamp((p - .07) / .06));
      pkgs.forEach((s, k) => {
        const from = new THREE.Vector3(lerp(-6, -2, clamp((p - .045) / .03)), RAIL_Y + .45, 0), to = P[k].chip;
        const e = split, v = from.clone().lerp(to, e); v.y += Math.sin(e * Math.PI) * 2.2;
        s.position.copy(v); s.scale.setScalar(lerp(1, .2, e) * (k === 0 || split > 0 ? 1 : 0)); s.userData.set(.6 * (1 - sstep(.09, .11, p)) * (k === 0 || split > .01 ? 1 : 0), .5); s.rotation.y = t * .5;
      });
      pkgGlow.position.copy(pkgs[0].position); pkgGlow.material.opacity = .35 * (1 - sstep(.08, .11, p));
      rail.userData.set(.45 * (1 - sstep(.08, .14, p)), 0);
      const chipO = sstep(.03, .1, p);
      chips.forEach((o, k) => { o.g.visible = chipO > .01; o.g.rotation.y = Math.sin(t * .3 + k) * .08; o.stand.userData.set(.5 * chipO, 0); o.spot.material.opacity = chipO * .22 * (1 + (split > .9 && p < .14 ? 1 : 0)); });

      /* The race. */
      const rt = raceT0 < 0 ? -1 : t - raceT0, lanesO = sstep(.11, .15, p) * (1 - sstep(.72, .76, p));
      let n = 0;
      CHIPS.forEach((c, k) => {
        const best = Math.min(...c.rows.map(rw => rw[1])), win = pickRow(c, allow), L0 = P[k].lane, lt = P[k].lt;
        c.rows.forEach((rw, i) => {
          const over = rw[2] < BASE_ACC - allow - 1e-6, grow = rt < 0 ? 0 : easeOut(clamp((rt - .2 - i * .14) / 1.3)), len = Math.max(.001, lt * best / rw[1] * grow);
          const y = L0.y - i * P[k].row, left = L0.x - lt / 2, isWin = i === win && rt > 2;
          const fixing = c.fix && rw[4] && rt > .6 && rt < 2.1;
          lanes.set(n * 2, L0.x, y, L0.z, lt, .16, .1, -.2, 0, lanesO * .18);
          lanes.set(n * 2 + 1, left + len / 2, y, L0.z + .02, len, .17, .12, fixing ? -.95 : isWin ? 1.15 : over ? -.1 : .5, isWin ? .3 : fixing ? .3 : 0, lanesO * (over ? .18 : isWin ? .62 : .42));
          const vl = valLabs[n].el.querySelector('.tag'), tx = `${fmt(c, rw[1])} · ${rw[2].toFixed(1)}%${over ? ' · over your limit' : ''}`; if (vl.textContent !== tx) vl.textContent = tx;
          valLabs[n].el.classList.toggle('over', over); valLabs[n].el.classList.toggle('win', isWin); rowLabs[n].el.classList.toggle('over', over); rowLabs[n].el.classList.toggle('win', isWin);
          const showRows = lanesO > .5 && (!tall || true);
          ui.place(rowLabs[n], new THREE.Vector3(left, y + .2, L0.z), camera, act && showRows);
          ui.place(valLabs[n], new THREE.Vector3(left + lt, y + .2, L0.z), camera, act && showRows && grow > .9);
          n++;
        });
        const pl = pickLabs[k].el.querySelector('.tag');
        const txt = win < 0 ? '<b>Nothing here keeps that much accuracy</b><small>it says so, rather than ship a worse model</small>' : `<b>AutoDeploy’s pick: ${c.rows[win][0]}</b><small>${fmt(c, c.rows[win][1])} · ${(c.rows[c.base][1] / c.rows[win][1]).toFixed(1)}× faster than ${c.baseName} · ${c.rows[win][2].toFixed(1)}%</small>`;
        if (pl.innerHTML !== txt) pl.innerHTML = txt;
        pickLabs[k].el.classList.toggle('none', win < 0);
        ui.place(pickLabs[k], P[k].chip.clone().add(tmp.set(0, 1.05 * P[k].scale + .2, 0)), camera, act && lanesO > .5 && rt > 2.2 && ((!tall && (p < .515 || p > .72)) || k === focusK(p)));
        ui.place(chipLabs[k], P[k].chip.clone().add(tmp.set(0, 1.05 * P[k].scale + .2, 0)), camera, act && chipO > .5 && (rt < 2.2 || lanesO < .5) && p < .75);
        ui.place(fixLabs[k], new THREE.Vector3(L0.x, L0.y - c.rows.length * P[k].row - .05, L0.z), camera, act && !!c.fix && rt > .6 && rt < 3.2 && lanesO > .5);
      });
      lanes.commit();
      ui.place(surpriseLab, P[1].chip.clone().add(tmp.set(0, -1.55, .6)), camera, act && p > .53 && p < .62 && !tall);
      ui.place(fpgaLab, P[2].chip.clone().add(tmp.set(0, -1.55, .6)), camera, act && p > .63 && p < .72 && !tall);
      ctl.classList.toggle('on', act && p > .13 && p < .5);
      ctl.querySelectorAll('[data-a]').forEach(b => b.classList.toggle('sel', +b.dataset.a === allow));

      /* Learn. */
      const learnO = sstep(.72, .77, p) * (1 - sstep(.95, .99, p));
      gnMat.uniforms.uO.value = learnO; geLines.material.opacity = learnO * .35;
      const gS = gnPts.geometry.attributes.aS; for (let i = 0; i < GN; i++) gS.array[i] = .3 + .12 * sstep(.74, .86, p) * (.5 + .5 * Math.sin(t * 2 + i)); gS.needsUpdate = true;
      for (let i = 0; i < SN; i++) {
        const [k, gi, ph, sp] = stInfo[i], f = (t * sp + ph) % 1, a = P[k].chip, b = gnodes[gi];
        tmp.lerpVectors(a, b, f); tmp.y += Math.sin(f * Math.PI) * 1.2; stP.set([tmp.x, tmp.y, tmp.z], i * 3);
      }
      stGeo.attributes.position.needsUpdate = true; stMat.uniforms.uO.value = learnO * sstep(.74, .78, p) * (1 - sstep(.84, .88, p));
      const barsO = sstep(.82, .85, p) * (1 - sstep(.95, .99, p)), BY = tall ? 15.2 : 6.8;
      handBar.position.set(0, BY, -1); handBar.userData.set(.6 * barsO, 0); handBar.scale.x = tall ? .55 : 1;
      autoBar.position.set(-6 * (tall ? .55 : 1) + (12 * 8 / 504) / 2, BY - .7, -1); autoBar.userData.set(.8 * barsO, .8);
      learnLabs.forEach((lab, k) => ui.place(lab, tall ? new THREE.Vector3(0, 16.6 - k * 1.05, -1) : new THREE.Vector3((k - 1) * 5.2, 11.6, -3), camera, act && learnO > .5 && p > .76 + k * .02 && p < .84));
      ui.place(handLab, new THREE.Vector3(-6 * (tall ? .55 : 1), BY + .35, -1), camera, act && barsO > .5);
      ui.place(autoLab, new THREE.Vector3(-6 * (tall ? .55 : 1), BY - .35, -1), camera, act && barsO > .5);

      /* Camera. */
      shot(p);
      const want = pointer.inside && !coarse ? pointer.ndc : null;
      turn.x += ((want ? want.x : 0) - turn.x) * Math.min(1, dt * 2); turn.y += ((want ? want.y : 0) - turn.y) * Math.min(1, dt * 2);
      off.subVectors(cpos, cat).applyAxisAngle(new THREE.Vector3(0, 1, 0), -turn.x * .05 * (1 - sstep(.9, .97, p))); off.y += turn.y * .3 * (1 - sstep(.9, .97, p));
      camera.position.copy(cat).add(off); camera.lookAt(cat);
    }
  };
}
