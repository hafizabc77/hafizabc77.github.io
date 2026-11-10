/* Act IV, scene 10: overfitting and validation. A model learns a curve from gold training points and is checked on
   cyan points it never trains on. Too simple at first, then a good fit, then, if training goes on, it memorises:
   it threads every gold point and misses the cyan ones. Beside it, the training loss keeps falling while the loss
   on unseen data turns back up; early stopping keeps the checkpoint where that was lowest. Dropout, switched on,
   keeps the curve from memorising. It opens on training's loss-over-time board, which shrinks into the loss chart,
   and ends on that chart alone with the best checkpoint flagged: the one number tuning starts from. */
import * as THREE from 'three';
import { additive, POINT_FRAG, col, rng, gaussian, sstep, clamp, lerp, easeInOut, pixelScale } from '../core/util.js';
import { slab, floor, motes } from '../core/glass.js';

const f = x => .9 * Math.sin(1.6 * x) + .3 * x;                 // the pattern hidden in the data
const XR = 2.6;

/* The data and the model's losses, seeded so tuning can rebuild the same chart. */
let DATA = null;
export function fitData() {
  if (DATA) return DATA;
  const r = rng(2025);
  const TR = Array.from({ length: 12 }, (_, i) => { const x = -XR + .2 + i * (2 * XR - .4) / 11 + gaussian(r) * .06; return { x, y: f(x) + gaussian(r) * .32 }; });
  const VA = Array.from({ length: 8 }, (_, i) => { const x = -XR + .5 + i * (2 * XR - 1) / 7 + gaussian(r) * .05; return { x, y: f(x) + gaussian(r) * .2 }; });
  // The model's curve at "training progress" s: a flat guess, then a smooth fit, then a curve that threads every training point.
  const mean = TR.reduce((a, b) => a + b.y, 0) / TR.length;
  const K = (a, b) => Math.exp(-Math.pow((a - b) / .13, 2));
  const res = TR.map(p => p.y - f(p.x));
  const A = TR.map(a => TR.map(b => K(a.x, b.x) + (a === b ? 1e-6 : 0)));
  const wts = (() => { const n = res.length, M = A.map((row, i) => [...row, res[i]]); for (let c = 0; c < n; c++) { let p = c; for (let i = c + 1; i < n; i++) if (Math.abs(M[i][c]) > Math.abs(M[p][c])) p = i; [M[c], M[p]] = [M[p], M[c]]; for (let i = 0; i < n; i++) if (i !== c) { const k = M[i][c] / M[c][c]; for (let j = c; j <= n; j++) M[i][j] -= k * M[c][j]; } } return M.map((row, i) => row[n] / row[i]); })();
  const memo = x => TR.reduce((s, p, i) => s + wts[i] * K(x, p.x), 0) + .24 * Math.sin(9.5 * x);
  const model = (x, s, drop) => { const smooth = s < .45 ? lerp(mean, f(x) * .92, easeInOut(s / .45)) : f(x) * .92 + (s - .45) / .55 * .08 * f(x); const over = s > .5 ? easeInOut((s - .5) / .5) * (drop ? .28 : 1) : 0; return smooth + over * memo(x); };
  const mse = (pts, s, drop) => pts.reduce((a, p) => a + Math.pow(model(p.x, s, drop) - p.y, 2), 0) / pts.length;
  const CURVES = [false, true].map(drop => Array.from({ length: 160 }, (_, i) => { const s = i / 159; return { s, tr: mse(TR, s, drop), va: mse(VA, s, drop) }; }));
  const best = CURVES.map(c => c.reduce((b, o) => (o.va < b.va ? o : b), c[0]).s);
  DATA = { TR, VA, model, CURVES, best };
  return DATA;
}
// The loss chart's own size, shared with tuning's opening.
export const LOSS_CHART = { W: 4.6, H: 3.4, x: (c, s, W = 4.6) => c.x - W / 2 + .25 + s * (W - .5), y: (c, v, H = 3.4) => c.y - H / 2 + .25 + Math.min(1, v / .9) * (H - .5) };
// Training's last board (loss over time, three epochs), rebuilt so this scene can open on it.
const EP = [[3.22, 1.95], [1.95, 1.02], [1.02, .5]];
const lossAt = u => { const e = Math.min(2, Math.floor(u * 3)), g = u * 3 - e, [a, b] = EP[e]; return b + (a - b) * Math.exp(-g * 3.2) + .05 * Math.sin(u * 140) * Math.exp(-g * 1.5) * (1 - u * .5); };

export default function overfit(ctx) {
  const { small, ui, score, pointer, renderer, coarse } = ctx;
  const scene = new THREE.Scene();
  scene.background = col('#04080a');
  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, .05, 200);
  const geoOf = attrs => { const g = new THREE.BufferGeometry(); Object.entries(attrs).forEach(([k, [arr, n]]) => g.setAttribute(k, new THREE.Float32BufferAttribute(arr, n))); return g; };
  scene.add(floor(-.4, '#3aa8b8'));
  const dust = motes(small ? 160 : 360, [40, 14, 30], '#8fe8ff'); scene.add(dust.pts);

  /* ---------- The data: training points (gold) and unseen points (cyan) ---------- */
  const { TR, VA, model, CURVES, best } = fitData();

  /* ---------- The fit: a glass plot ---------- */
  const FIT = new THREE.Vector3(-2.6, 3, 0), FW = 6.4, FH = 4.4, sx = x => FIT.x + x / XR * (FW / 2 - .3), sy = y => FIT.y + clamp(y, -2.1, 2.1) / 2.1 * (FH / 2 - .25);
  const fitPanel = slab(FW, FH, .05, '#8fe8ff'); fitPanel.position.copy(FIT); scene.add(fitPanel);
  const ptGeo = geoOf({ position: [[...TR.flatMap(p => [sx(p.x), sy(p.y), .06]), ...VA.flatMap(p => [sx(p.x), sy(p.y), .06])], 3], color: [[...TR.flatMap(() => [1, .8, .4]), ...VA.flatMap(() => [.4, .92, 1])], 3], aSeed: [[...TR.flatMap((_, i) => [i / 20, .16, 0, 0]), ...VA.flatMap((_, i) => [.6 + i / 20, .15, 1, 0])], 4] });
  const ptMat = additive({ uniforms: { uPx: { value: 1000 }, uTr: { value: 0 }, uVa: { value: 0 }, uHot: { value: -1 } },
    vertexShader: 'attribute vec3 color; attribute vec4 aSeed; uniform float uPx, uTr, uVa, uHot; varying vec3 vColor; varying float vAlpha; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; float hot = abs(float(gl_VertexID) - uHot) < .5 ? 1. : 0.; gl_PointSize = max(1., uPx * aSeed.y * (1. + hot * .6) / -mv.z); vColor = color * (1. + hot * .5); vAlpha = aSeed.z > .5 ? uVa : uTr; }',
    fragmentShader: POINT_FRAG });
  const pts = new THREE.Points(ptGeo, ptMat); pts.frustumCulled = false; scene.add(pts);
  const CN = 420, cP = new Float32Array(CN * 3);
  const cG = new THREE.BufferGeometry(); cG.setAttribute('position', new THREE.BufferAttribute(cP, 3)); cG.setAttribute('aU', new THREE.Float32BufferAttribute(Array.from({ length: CN }, (_, i) => i / (CN - 1)), 1));
  const cMat = additive({ uniforms: { uPx: { value: 1000 }, uO: { value: 0 } }, vertexShader: 'attribute float aU; uniform float uPx, uO; varying vec3 vColor; varying float vAlpha; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = max(1., uPx * .045 / -mv.z); vColor = vec3(1., .95, .85); vAlpha = uO; }', fragmentShader: POINT_FRAG });
  const curve = new THREE.Points(cG, cMat); curve.frustumCulled = false; scene.add(curve);
  const errG = new THREE.BufferGeometry(); errG.setAttribute('position', new THREE.BufferAttribute(new Float32Array(VA.length * 6), 3));
  const errs = new THREE.LineSegments(errG, new THREE.LineBasicMaterial({ color: 0x8fe8ff, transparent: true, opacity: 0 })); scene.add(errs);

  /* ---------- The losses: training (gold) keeps falling; unseen (cyan) turns back up ---------- */
  const CHC = new THREE.Vector3(4.6, 3, 0), CW = 4.6, CH2 = 3.4, cx = s => CHC.x - CW / 2 + .25 + s * (CW - .5), cy = v => CHC.y - CH2 / 2 + .25 + Math.min(1, v / .9) * (CH2 - .5);
  const chPanel = slab(CW, CH2, .05, '#ffd27a'); chPanel.position.copy(CHC); scene.add(chPanel);
  // The opening: training's board, which shrinks onto this chart.
  const OBW = 15, OBH = 7.4, open = new THREE.Group(); scene.add(open);
  const openBoard = slab(OBW, OBH, .05, '#8fe8ff'); open.add(openBoard);
  { const p = [], u = []; for (let k = 0; k < 900; k++) { const q = k / 899; p.push(-OBW / 2 + .5 + (OBW - 1) * q, -OBH / 2 + .45 + lossAt(q) / 3.4 * OBH * .56, .05); u.push(q); }
    const m = additive({ uniforms: { uPx: { value: 1000 }, uO: { value: 1 } }, vertexShader: 'attribute float aU; uniform float uPx, uO; varying vec3 vColor; varying float vAlpha; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = max(1., uPx * .045 / -mv.z); vColor = mix(vec3(1., .5, .3), vec3(.3, .75, .8), smoothstep(.1, .9, aU)); vAlpha = uO; }', fragmentShader: POINT_FRAG });
    const pp = new THREE.Points(geoOf({ position: [p, 3], aU: [u, 1] }), m); pp.frustumCulled = false; open.add(pp); open.userData.mat = m; }
  const lossLines = [false, true].map((drop, di) => {
    const p = [], c = [], s = []; CURVES[di].forEach(o => { p.push(cx(o.s), cy(o.tr), .06); c.push(1, .78, .4); s.push(o.s, .04, 0, 0); }); CURVES[di].forEach(o => { p.push(cx(o.s), cy(o.va), .06); c.push(.4, .92, 1); s.push(o.s, .045, 1, 0); });
    const m = additive({ uniforms: { uPx: { value: 1000 }, uO: { value: 0 }, uDraw: { value: 0 } }, vertexShader: 'attribute vec3 color; attribute vec4 aSeed; uniform float uPx, uO, uDraw; varying vec3 vColor; varying float vAlpha; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = max(1., uPx * aSeed.y / -mv.z); vColor = color; vAlpha = uO * step(aSeed.x, uDraw); }', fragmentShader: POINT_FRAG });
    const o = new THREE.Points(geoOf({ position: [p, 3], color: [c, 3], aSeed: [s, 4] }), m); o.frustumCulled = false; scene.add(o); return m;
  });
  const mkG = new THREE.BufferGeometry(); mkG.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const marker = new THREE.Line(mkG, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 })); scene.add(marker);
  const flag = new THREE.Mesh(new THREE.ConeGeometry(.09, .22, 3), new THREE.MeshBasicMaterial({ color: 0x7ff0c0, transparent: true, opacity: 0 })); scene.add(flag);

  /* ---------- Words and the dropout switch ---------- */
  const trLab = ui.label('fit', '<span class="tag val-loss">● training data</span>', 'plain-dot val-lab'), vaLab = ui.label('fit', '<span class="tag val-acc">● data it never sees</span>', 'plain-dot val-lab');
  const lTr = ui.label('fit', '<span class="tag val-loss">training loss</span>', 'plain-dot val-lab'), lVa = ui.label('fit', '<span class="tag val-acc">loss on unseen data</span>', 'plain-dot val-lab');
  const bestLab = ui.label('fit', '<span class="tag part-tag">best checkpoint, saved</span>', 'plain part-lab');
  const stageLab = ui.label('fit', '<span class="tag stage-big"></span>', 'plain stage-big-lab');
  const errLab = ui.label('fit', '<span class="tag part-tag">error on unseen data</span>', 'plain part-lab');
  const ctl = document.createElement('div'); ctl.className = 'tr-panel playing fit-panel';
  ctl.innerHTML = '<div class="tr-rates"><span>dropout</span><button type="button" data-d="0">Off</button><button type="button" data-d="1">On</button></div>';
  ctx.$('#scene-ui').append(ctl);
  let drop = false, userDrop = -99, hotPt = -1;
  const syncD = () => ctl.querySelectorAll('button').forEach(b => b.classList.toggle('on', (b.dataset.d === '1') === drop));
  ctl.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { drop = b.dataset.d === '1'; userDrop = ctx.time; syncD(); score.sfx('chime', { f: drop ? 660 : 440 }); }));
  syncD();

  /* ---------- Camera and layout ---------- */
  let tall = false;
  const cpos = new THREE.Vector3(), cat = new THREE.Vector3(), off = new THREE.Vector3(), turn = new THREE.Vector2();
  function layout(t2) {
    tall = t2;
    if (t2) { FIT.set(0, 4.6, 0); CHC.set(0, -.2, 0); } else { FIT.set(-2.6, 3, 0); CHC.set(4.6, 3, 0); }
    fitPanel.position.copy(FIT); chPanel.position.copy(CHC);
    const P = ptGeo.attributes.position.array; [...TR, ...VA].forEach((q, i) => { P[i * 3] = sx(q.x); P[i * 3 + 1] = sy(q.y); }); ptGeo.attributes.position.needsUpdate = true;
    rebuildLoss();
  }
  function rebuildLoss() { scene.children.filter(o => o.isPoints && lossLines.includes(o.material)).forEach((o, di) => { const a = o.geometry.attributes.position.array; CURVES[di].forEach((q, i) => { a[i * 3] = cx(q.s); a[i * 3 + 1] = cy(q.tr); }); CURVES[di].forEach((q, i) => { const k = CURVES[di].length + i; a[k * 3] = cx(q.s); a[k * 3 + 1] = cy(q.va); }); o.geometry.attributes.position.needsUpdate = true; }); }

  let localP = 0;
  const OPEN = () => tall ? [CHC.clone().add(new THREE.Vector3(0, -.4, 21.5 * Math.min(2.4, 1 / camera.aspect))), CHC.clone().add(new THREE.Vector3(0, -.4, 0))] : [CHC.clone().add(new THREE.Vector3(0, .45, 18.5)), CHC.clone().add(new THREE.Vector3(0, .45, 0))];
  const END = () => tall ? [CHC.clone().add(new THREE.Vector3(0, .1, 15.5)), CHC.clone().add(new THREE.Vector3(0, .1, 0))] : [CHC.clone().add(new THREE.Vector3(0, .1, 9)), CHC.clone().add(new THREE.Vector3(0, .1, 0))];
  return {
    id: 'fit', scene, camera, extra: {},
    captions: [
      { at: [0, .12], html: 'Low training loss isn’t enough. The real test is data the model has <b>never seen</b>.', x: 7, y: 14, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.12, .35], html: 'It learns from the gold points and is tested on the cyan ones. First too simple, then a good fit.', x: 7, y: 14, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.35, .5], html: 'Train on, and it <b>memorises</b>: it threads every gold point and misses the cyan. That is <b>overfitting</b>.', x: 7, y: 14, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.5, .62], html: 'In physics it matters twice: a model trained on simulation must hold up on real detector data.', x: 7, y: 14, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.62, .76], html: 'So we keep the checkpoint where it did best on unseen data, and stop there: <b>early stopping</b>.', x: 7, y: 14, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.76, .86], html: '<b>Dropout</b>, switching off random neurons in training, also stops it memorising. Switch it on and off.', x: 7, y: 14, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.13, .62], html: `<span class="hint-dot"></span>${coarse ? 'Tap' : 'Hover'} a cyan point to see its error`, x: 50, y: 84, cls: 'hint', align: 'center' },
      { at: [.86, 1.1], html: 'Its score on unseen data is the one number that says how good this run was.', x: 7, y: 14, cls: 'note', m: { x: 50, y: 11, align: 'center' } }
    ],
    resize(aspect) { camera.aspect = aspect; camera.updateProjectionMatrix(); layout(aspect < 1); },
    init() { this.resize(innerWidth / innerHeight); },
    show(on) { if (!on) { ctl.classList.remove('on'); document.body.style.cursor = ''; } },
    pointer(type) {
      if (localP < .12 || localP > .9) { hotPt = -1; return; }
      let b = -1, bd = 40; VA.forEach((q, i) => { const s = ui.screen(new THREE.Vector3(sx(q.x), sy(q.y), 0), camera); const d = Math.hypot(s.x - pointer.x, s.y - pointer.y); if (d < bd) { bd = d; b = i; } });
      if (b !== hotPt && b >= 0) score.sfx('hover');
      hotPt = b; document.body.style.cursor = b >= 0 ? 'help' : '';
    },
    update(p, info) {
      localP = p;
      const t = info.time, act = info.active, px = pixelScale(renderer, camera);
      [ptMat, cMat, ...lossLines].forEach(m => { m.uniforms.uPx.value = px; }); dust.mat.uniforms.uTime.value = t; dust.mat.uniforms.uPx.value = px;

      /* Training progress s, beat by beat (at the end, back to the saved checkpoint). */
      if (p >= .76 && p < .86 && t - userDrop > 6) { const want = Math.floor(t / 3) % 2 === 1; if (want !== drop) { drop = want; syncD(); } }   // it switches itself, until you do
      if ((p < .76 || p >= .86) && t - userDrop > 1) { if (drop) { drop = false; syncD(); } }
      const di = drop ? 1 : 0;
      let s = p < .12 ? 0 : p < .35 ? .45 * (p - .12) / .23 : p < .62 ? .45 + .55 * (p - .35) / .27 : p < .7 ? lerp(1, best[0], easeInOut((p - .62) / .08)) : p < .76 ? best[0] : p < .86 ? 1 : best[0];

      /* The fit. */
      const pOn = sstep(.06, .12, p) * (1 - sstep(.86, .9, p));
      fitPanel.userData.set(pOn * .55, 0); chPanel.userData.set(sstep(.1, .14, p) * .55, 0);
      ptMat.uniforms.uTr.value = sstep(.07, .11, p) * (1 - sstep(.86, .9, p)); ptMat.uniforms.uVa.value = sstep(.09, .13, p) * (1 - sstep(.86, .9, p));
      // Training's board shrinks onto the loss chart while the fit panel arrives.
      const m = easeInOut(clamp((p - .03) / .09));
      open.position.copy(CHC); open.scale.set(lerp(1, CW / OBW, m), lerp(1, CH2 / OBH, m), 1);
      openBoard.userData.set(.55 * (1 - sstep(.1, .14, p)), 0); open.userData.mat.uniforms.uO.value = 1 - sstep(.06, .11, p); open.userData.mat.uniforms.uPx.value = px; open.visible = p < .14;
      ptMat.uniforms.uHot.value = hotPt >= 0 ? TR.length + hotPt : -1;
      for (let i = 0; i < CN; i++) { const x = -XR + 2 * XR * i / (CN - 1); cP.set([sx(x), sy(model(x, s, drop)), .07], i * 3); }
      cG.attributes.position.needsUpdate = true; cMat.uniforms.uO.value = sstep(.1, .14, p) * (1 - sstep(.86, .9, p));
      const ea = errG.attributes.position.array; VA.forEach((q, i) => ea.set([sx(q.x), sy(q.y), .065, sx(q.x), sy(model(q.x, s, drop)), .065], i * 6)); errG.attributes.position.needsUpdate = true;
      errs.material.opacity = (p > .3 && p < .62 ? .55 : 0) + (hotPt >= 0 ? .25 : 0);

      /* The losses, drawn up to the current progress, with a marker and the best checkpoint. */
      lossLines.forEach((m, k) => { m.uniforms.uO.value = sstep(.12, .18, p) * (k === di ? 1 : 0); m.uniforms.uDraw.value = p < .62 ? s : 1; });
      const mk = mkG.attributes.position.array; mk.set([cx(s), CHC.y - CH2 / 2 + .2, .07, cx(s), CHC.y + CH2 / 2 - .2, .07]); mkG.attributes.position.needsUpdate = true; marker.material.opacity = sstep(.12, .18, p) * .6;
      const bs = best[di], bq = CURVES[di].find(o => o.s >= bs) || CURVES[di][0]; flag.position.set(cx(bs), cy(bq.va) + .28, .08); flag.rotation.z = Math.PI; flag.material.opacity = p > .5 ? 1 : 0;

      /* Words. */
      const show = (lab, pos, on) => ui.place(lab, pos, camera, act && on);
      show(trLab, new THREE.Vector3(FIT.x - FW / 2 + .5, FIT.y + FH / 2 + .3, 0), p > .1 && p < .86);
      show(vaLab, tall ? new THREE.Vector3(FIT.x - FW / 2 + .5, FIT.y + FH / 2 + .75, 0) : new THREE.Vector3(FIT.x - FW / 2 + 2.6, FIT.y + FH / 2 + .3, 0), p > .12 && p < .86);
      show(lTr, new THREE.Vector3(CHC.x - CW / 2 + .3, CHC.y + CH2 / 2 + .3, 0), p > .14);
      show(lVa, tall ? new THREE.Vector3(CHC.x - CW / 2 + .3, CHC.y + CH2 / 2 + .75, 0) : new THREE.Vector3(CHC.x - CW / 2 + 2.2, CHC.y + CH2 / 2 + .3, 0), p > .14);
      show(bestLab, flag.position.clone().add(new THREE.Vector3(0, .4, 0)), p > .62 && (p < .76 || p > .86));
      const stage = p < .12 ? '' : s < .2 ? 'too simple' : s < .62 ? 'a good fit' : drop && p >= .76 ? 'held back by dropout' : 'memorising';
      const st = stageLab.el.querySelector('.tag'); if (st.textContent !== stage) st.textContent = stage;
      show(stageLab, new THREE.Vector3(FIT.x, tall ? FIT.y - FH / 2 + .45 : FIT.y - FH / 2 - .4, .1), !!stage && p < .86);
      show(errLab, hotPt >= 0 ? new THREE.Vector3(sx(VA[hotPt].x), sy(VA[hotPt].y) + .45, .1) : new THREE.Vector3(), hotPt >= 0);
      ctl.classList.toggle('on', act && p > .76 && p < .86);

      /* Camera. */
      const pos = tall ? new THREE.Vector3(0, 2.4, 21) : new THREE.Vector3(1, 3.2, 12.6), at = tall ? new THREE.Vector3(0, 2.2, 0) : new THREE.Vector3(1, 2.9, 0);
      const [oA, oB] = OPEN(), [eA, eB] = END(), eo = easeInOut(clamp((p - .03) / .09)), ee = easeInOut(clamp((p - .86) / .06));
      cpos.lerpVectors(oA, pos, eo).lerp(eA, ee); cat.lerpVectors(oB, at, eo).lerp(eB, ee);
      const want = pointer.inside && !coarse ? pointer.ndc : null;
      turn.x += ((want ? want.x : 0) - turn.x) * Math.min(1, info.dt * 2); turn.y += ((want ? want.y : 0) - turn.y) * Math.min(1, info.dt * 2);
      off.subVectors(cpos, cat).applyAxisAngle(new THREE.Vector3(0, 1, 0), -turn.x * .05); off.y += turn.y * .3;
      camera.position.copy(cat).add(off); camera.lookAt(cat);
    }
  };
}
