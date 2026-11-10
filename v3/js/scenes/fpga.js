/* Act VI, scene 15: inside the FPGA (Hafiz's "transformers on FPGAs" work).
   It opens diving in from the race: the Alveo U200's fabric, a sea of logic cells with columns of memory (BRAM) and
   multipliers (DSP). One attention block of the Particle Transformer is placed onto it stage by stage as an hls4ml
   pipeline (embed, Q/K/V, matmul, U bias, softmax from lookup tables, matmul, layer norm, feed-forward), data packets
   stream through it, and the chip's resources fill up (LUT 74% · FF 46% · BRAM 65% · DSP 85%). Hover a stage to read
   what it does. Then ParticleNet: 70% of its time moves into an FPGA kernel, 15 ms / 35 W → 3.13 ms / 9 W. A card for the
   work, and the camera dives into one cell. */
import * as THREE from 'three';
import { additive, POINT_FRAG, col, rng, sstep, clamp, lerp, easeInOut, pixelScale } from '../core/util.js';
import { cells, floor, motes } from '../core/glass.js';

const BLOCKS = [
  { id: 'embed', x: .03, y: .14, w: .17, h: .3, name: 'Embed', info: 'Linear layers project each particle into the embedding space.' },
  { id: 'qkv', x: .27, y: .14, w: .19, h: .3, name: 'Q, K, V', info: 'Three linear projections per head.' },
  { id: 'matmul', x: .53, y: .14, w: .19, h: .3, name: 'MatMul', info: 'Query × key. This is where the DSP slices go.' },
  { id: 'bias', x: .79, y: .14, w: .18, h: .3, name: 'U bias', info: 'Pairwise particle interactions added before the softmax: what makes ParT physics-aware.' },
  { id: 'softmax', x: .79, y: .6, w: .18, h: .3, name: 'Softmax', info: 'Built from exponential lookup tables, not floating-point division.' },
  { id: 'matmul2', x: .53, y: .6, w: .19, h: .3, name: 'MatMul', info: 'Attention × value: a second bank of multipliers.' },
  { id: 'norm', x: .27, y: .6, w: .19, h: .3, name: 'LayerNorm', info: 'Layer normalisation in fixed point.' },
  { id: 'ffn', x: .03, y: .6, w: .17, h: .3, name: 'FFN', info: 'Feed-forward layers close the block.' }
];
const PN = [{ name: 'EdgeConv kernel', sub: 'the convolution-like 70%', x: .2, y: .12, w: .58, h: .76 }, { name: 'KNN', sub: 'first block only', x: .03, y: .3, w: .13, h: .4 }, { name: 'Pool + classify', sub: '', x: .82, y: .3, w: .15, h: .4 }];
const RES = [['LUT', 74], ['FF', 46], ['BRAM', 65], ['DSP', 85]];

export default function fpga(ctx) {
  const { small, ui, score, pointer, renderer, coarse } = ctx;
  const scene = new THREE.Scene();
  scene.background = col('#03060a');
  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, .05, 300);
  let tall = false;
  scene.add(floor(-1.2, '#7a6cff'));
  const dust = motes(small ? 140 : 320, [40, 14, 30], '#c9b8ff'); scene.add(dust.pts);

  /* ---------- The fabric ---------- */
  const F0 = new THREE.Vector3(0, 4, 0);
  let C = 64, R = 36, TS = .24;
  const MAXT = 64 * 36, fab = cells(MAXT); scene.add(fab.mesh);
  const kindOf = (c) => c % 9 === 4 ? 'bram' : c % 9 === 8 ? 'dsp' : 'clb';
  // Grid coordinates <-> world; on a phone the fabric (and the pipeline) stands upright.
  const tileXY = (c, rr) => tall ? new THREE.Vector3(F0.x + (c - (C - 1) / 2) * TS, F0.y + ((R - 1) / 2 - rr) * TS, 0) : new THREE.Vector3(F0.x + (c - (C - 1) / 2) * TS, F0.y + ((R - 1) / 2 - rr) * TS, 0);
  const rect = b => tall ? { c0: Math.round(b.y * C), c1: Math.round((b.y + b.h) * C), r0: Math.round(b.x * R), r1: Math.round((b.x + b.w) * R) } : { c0: Math.round(b.x * C), c1: Math.round((b.x + b.w) * C), r0: Math.round(b.y * R), r1: Math.round((b.y + b.h) * R) };
  const centre = b => { const q = rect(b); return tileXY((q.c0 + q.c1 - 1) / 2, (q.r0 + q.r1 - 1) / 2); };
  const inRect = (q, c, rr) => c >= q.c0 && c < q.c1 && rr >= q.r0 && rr < q.r1;

  /* ---------- Packets streaming through the pipeline ---------- */
  let route = [], routeLen = 1;
  function buildRoute() {
    const pts = [], m = BLOCKS.map(centre), edge = (v) => tall ? new THREE.Vector3(v.x, F0.y + (R / 2 + 1) * TS, 0) : new THREE.Vector3(F0.x - (C / 2 + 1) * TS, v.y, 0);
    pts.push(edge(m[0])); for (let i = 0; i < 8; i++) pts.push(m[i]); pts.push(edge(m[7]));
    route = pts; routeLen = 0; for (let i = 1; i < pts.length; i++) routeLen += pts[i].distanceTo(pts[i - 1]);
  }
  const along = (d, out) => { let left = d * routeLen; for (let i = 1; i < route.length; i++) { const s = route[i].distanceTo(route[i - 1]); if (left <= s) return out.lerpVectors(route[i - 1], route[i], left / s); left -= s; } return out.copy(route[route.length - 1]); };
  const PK = small ? 50 : 90, pkP = new Float32Array(PK * 3), pkGeo = new THREE.BufferGeometry(); pkGeo.setAttribute('position', new THREE.BufferAttribute(pkP, 3));
  const pkMat = additive({ uniforms: { uPx: { value: 1000 }, uO: { value: 0 } }, vertexShader: 'uniform float uPx, uO; varying vec3 vColor; varying float vAlpha; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = max(1., uPx * .13 / -mv.z); vColor = vec3(1., .86, .5); vAlpha = uO; }', fragmentShader: POINT_FRAG });
  const packets = new THREE.Points(pkGeo, pkMat); packets.frustumCulled = false; scene.add(packets);
  const routeLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffd38a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); scene.add(routeLine);

  /* ---------- Words, the resource readout, the card ---------- */
  const L = (html, cls) => ui.label('fpga', html, cls);
  const blockLabs = BLOCKS.map(b => L(`<span class="tag">${b.name}</span>`, 'plain fblock-lab'));
  const infoLab = L('<span class="tag"></span>', 'plain rec-tip');
  const legend = L('<span class="tag"><i class="sq t"></i>logic (LUT, FF) <i class="sq v"></i>memory (BRAM) <i class="sq a"></i>multipliers (DSP)</span>', 'plain legend-lab');
  const pnLabs = PN.map(b => L(`<span class="tag"><b>${b.name}</b>${b.sub ? `<small>${b.sub}</small>` : ''}</span>`, 'plain fblock-lab pn'));
  const pnStat = L('<span class="tag"><b>15 ms · 35 W</b> → <b class="g">3.13 ms · 9 W</b><small>ParticleNet → Static ParticleNet on the U200 · 5× faster</small></span>', 'plain big-stat');
  const res = document.createElement('div'); res.className = 'cmp-hud fpga-res';
  res.innerHTML = `${RES.map(([k, v]) => `<div class="fr-row"><span>${k}</span><div class="fr-bar"><i data-k="${k}"></i></div><b>${v}%</b></div>`).join('')}<small>post-synthesis on the Alveo U200, the design AutoDeploy chose · ≈ 72 µs per answer (HLS estimate)</small>`;
  const card = document.createElement('aside'); card.className = 'paper-card mini-card';
  card.innerHTML = `<div class="pc-img"><img src="../assets/showcase/fpga-ptq.webp" alt="Chart from my thesis: model size against accuracy for each precision" loading="lazy"></div>
    <div class="pc-body"><small>My research at IHEP · master’s thesis</small><h3>Transformers on FPGAs</h3>
    <p>Pruned and quantized the Particle Transformer (8× smaller at 4 bits, 0.65 points lost), then built its attention, softmax and normalisation as hardware with hls4ml. ParticleNet: 5× faster on a quarter of the power.</p>
    <div class="pc-btns"><a class="pc-btn" href="../index.html#projects" target="_blank" rel="noopener">Case study <span aria-hidden="true">↗</span></a></div></div>`;
  ctx.$('#scene-ui').append(res, card);

  /* ---------- Camera ---------- */
  const cpos = new THREE.Vector3(), cat = new THREE.Vector3(), off = new THREE.Vector3(), turn = new THREE.Vector2(), tmp = new THREE.Vector3();
  const S = (a, b) => [new THREE.Vector3(...a), new THREE.Vector3(...b)];
  let target = null;
  function shot(p) {
    const fit = tall ? (C * TS + 1) / camera.aspect / (2 * Math.tan(THREE.MathUtils.degToRad(21))) : (C * TS + 2.4) / camera.aspect / (2 * Math.tan(THREE.MathUtils.degToRad(21)));
    const OPEN = S([F0.x, F0.y, 3], [F0.x, F0.y, 0]), WIDE = S([F0.x, F0.y - (tall ? .8 : .4), Math.max(fit, tall ? 0 : 11)], [F0.x, F0.y - (tall ? .5 : .3), 0]);
    const tg = target, DIVE = S([tg.x, tg.y, .9], [tg.x, tg.y, 0]);
    const seq = [[0, OPEN], [.02, OPEN], [.1, WIDE], [.93, WIDE], [1, DIVE]];
    let i = 0; while (i < seq.length - 2 && p > seq[i + 1][0]) i++;
    const [pa, A] = seq[i], [pb, B] = seq[i + 1], e = easeInOut(clamp((p - pa) / Math.max(1e-4, pb - pa)));
    cpos.lerpVectors(A[0], B[0], e); cat.lerpVectors(A[1], B[1], e);
  }
  function layout() {
    if (tall) { C = 36; R = 64; TS = .2; } else { C = 64; R = 36; TS = .24; }
    buildRoute();
    routeLine.geometry.setFromPoints(route);
    target = tileXY(Math.floor(C / 2) + 1, Math.floor(R / 2));
  }

  let localP = 0, hot = -1;
  return {
    id: 'fpga', scene, camera, extra: {},
    captions: [
      { at: [0, .1], html: 'An FPGA has no fixed processor: just a sea of logic cells, memory and multipliers you wire into any circuit you need.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.1, .2], html: 'So instead of running code, the model <b>becomes a circuit</b>.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.2, .35], html: 'Here is one attention block of my Particle Transformer, laid out with <b>hls4ml</b>: every stage its own hardware, all working at once.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.35, .48], html: 'Two stages were rebuilt for hardware: the <b>softmax</b>, as lookup tables, and the <b>U bias</b>, the particle interactions that make ParT physics-aware.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.36, .56], html: '<span class="hint-dot"></span>Hover a stage to see what it does', x: 50, y: 90, cls: 'hint desk', align: 'center' },
      { at: [.48, .57], html: 'It fills most of the chip: 85% of the multipliers, 74% of the logic, for an estimated <b>72 µs</b> per answer.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.58, .7], html: '<b>ParticleNet</b> too: its convolution-like work, 70% of its time, moved into an FPGA kernel, and its neighbour graph is built once.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.7, .8], html: '15 ms at 35 watts became <b>3.13 ms at 9 watts</b>: five times faster, on a quarter of the power.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.93, 1.05], html: 'Every cell, like every chip, is made of the same thing. Let’s go all the way down.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } }
    ],
    resize(aspect) { camera.aspect = aspect; camera.updateProjectionMatrix(); tall = aspect < 1; layout(); },
    init() { this.resize(innerWidth / innerHeight); },
    show(on) { if (!on) { res.classList.remove('on'); card.classList.remove('on'); document.body.style.cursor = ''; } },
    pointer() {
      if (localP < .3 || localP > .57) { hot = -1; document.body.style.cursor = ''; return; }
      let best = -1, bd = 1e9;
      BLOCKS.forEach((b, i) => { const q = rect(b), a = ui.screen(tileXY(q.c0, q.r0), camera), z = ui.screen(tileXY(q.c1 - 1, q.r1 - 1), camera); if (pointer.x > Math.min(a.x, z.x) - 6 && pointer.x < Math.max(a.x, z.x) + 6 && pointer.y > Math.min(a.y, z.y) - 6 && pointer.y < Math.max(a.y, z.y) + 6) { best = i; bd = 0; } });
      if (best !== hot && best >= 0) score.sfx('hover');
      hot = best; document.body.style.cursor = best >= 0 ? 'help' : '';
    },
    update(p, info) {
      localP = p;
      const t = info.time, act = info.active, dt = info.dt, px = pixelScale(renderer, camera);
      pkMat.uniforms.uPx.value = px; dust.mat.uniforms.uTime.value = t; dust.mat.uniforms.uPx.value = px;
      const placed = clamp((p - .2) / .13) * BLOCKS.length, attnO = 1 - sstep(.57, .61, p), pnO = sstep(.6, .64, p) * (1 - sstep(.93, .97, p));
      const flowOn = p > .33 && p < .58, head = (t * .16) % 1;
      // Which stage the packets are passing, to light it.
      const lit = new Float32Array(BLOCKS.length);
      if (flowOn) for (let k = 0; k < PK; k++) { const d = (head + k / PK) % 1, seg = Math.floor(d * 10) - 1; if (seg >= 0 && seg < 8) lit[seg] = Math.min(1, lit[seg] + .08); }
      const qs = BLOCKS.map(rect), pq = PN.map(rect);
      let n = 0;
      for (let rr = 0; rr < R; rr++) for (let c = 0; c < C; c++) {
        const k = kindOf(c), v0 = k === 'bram' ? -.7 : k === 'dsp' ? 1.15 : .12, pos = tileXY(c, rr);
        let v = v0, glow = 0, a = .32, h = .05;
        BLOCKS.forEach((b, i) => { if (i < placed && attnO > .01 && inRect(qs[i], c, rr)) { const on = clamp(placed - i); v = k === 'clb' ? .55 : v0; glow = .05 + lit[i] * .22 + (i === hot ? .3 : 0); a = lerp(a, .55, on * attnO); h = .05 + .1 * on * attnO; } });
        PN.forEach((b, i) => { if (pnO > .01 && inRect(pq[i], c, rr)) { v = i === 0 ? 1.15 : .55; glow = .04 + .12 * (.5 + .5 * Math.sin(t * 3 + c * .3)); a = lerp(a, i === 0 ? .42 : .55, pnO); h = .05 + .08 * pnO; } });
        const intro = sstep(.0, .08, p);
        fab.set(n++, pos.x, pos.y, h / 2, TS * .8, TS * .8, h, v, glow, a * intro * (1 - sstep(.97, 1, p) * .6));
      }
      for (; n < MAXT; n++) fab.set(n, 0, 0, 0, .001, .001, .001, 0, 0, 0);
      fab.commit();
      for (let k = 0; k < PK; k++) { along((head + k / PK) % 1, tmp); pkP.set([tmp.x, tmp.y, .2], k * 3); }
      pkGeo.attributes.position.needsUpdate = true; pkMat.uniforms.uO.value = flowOn ? .75 * attnO : 0; routeLine.material.opacity = flowOn ? .25 * attnO : 0;

      /* Words. */
      const show = (lab, pos, on) => ui.place(lab, pos, camera, act && on);
      BLOCKS.forEach((b, i) => { blockLabs[i].el.classList.toggle('hot', i === hot); show(blockLabs[i], centre(b).add(tmp.set(0, 0, .3)), placed > i + .5 && attnO > .5 && p > .2); });
      if (hot >= 0) { const el = infoLab.el.querySelector('.tag'), tx = `<b>${BLOCKS[hot].name}</b><small>${BLOCKS[hot].info}</small>`; if (el.innerHTML !== tx) el.innerHTML = tx; }
      const hq = hot >= 0 ? qs[hot] : null;
      show(infoLab, hq ? tileXY((hq.c0 + hq.c1) / 2, hq.r0 - 1.5).add(tmp.set(0, 0, .3)) : F0, hot >= 0);
      show(legend, new THREE.Vector3(F0.x, F0.y - (R / 2 + 1.6) * TS, .2), p > .04 && p < .22);
      PN.forEach((b, i) => show(pnLabs[i], centre(b).add(tmp.set(0, 0, .3)), pnO > .5 && p < .93));
      show(pnStat, new THREE.Vector3(F0.x, F0.y + (R / 2 + 1.2) * TS, .3), p > .7 && p < .8);
      res.classList.toggle('on', act && p > .24 && p < .58);
      res.querySelectorAll('[data-k]').forEach((el, i) => { el.style.width = `${(RES[i][1] * clamp((placed - 1) / 7)).toFixed(1)}%`; });
      card.classList.toggle('on', act && p > .81 && p < .94);

      /* Camera. */
      shot(p);
      const want = pointer.inside && !coarse ? pointer.ndc : null, damp = 1 - sstep(.9, .97, p);
      turn.x += ((want ? want.x : 0) - turn.x) * Math.min(1, dt * 2); turn.y += ((want ? want.y : 0) - turn.y) * Math.min(1, dt * 2);
      off.subVectors(cpos, cat).applyAxisAngle(new THREE.Vector3(0, 1, 0), -turn.x * .05 * damp); off.y += turn.y * .3 * damp;
      camera.position.copy(cat).add(off); camera.lookAt(cat);
    }
  };
}
