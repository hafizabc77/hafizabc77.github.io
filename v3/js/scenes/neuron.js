/* Act I, scenes 2–4: one biological neuron you can make fire, which straightens into the perceptron
   (inputs, weights, a sum and an activation, with live maths), which then copies itself into a network. */
import * as THREE from 'three';
import { additive, POINT_FRAG, PAL, rng, unitVector, sstep, clamp, lerp, easeInOut, pixelScale, alongPolyline, glowSprite } from '../core/util.js';

const K = { MAIN: 1, SUB: 2, TIP: 3, SOMA: 4, AXON: 5, MYELIN: 6, TERM: 7, INPUT: 8, BOX: 9, CURVE: 10 };
const W = [.9, -.7, .5, .8, -.45, .6], BIAS = -.6;          // the perceptron's weights and bias
const sigmoid = z => 1 / (1 + Math.exp(-z));

export default function neuron(ctx) {
  const { small, ui, score, pointer, renderer, coarse } = ctx;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, .01, 120);
  const r = rng(4242);
  const D = small ? .45 : 1;   // particle density

  /* ---------- Layout of the perceptron ---------- */
  const INPUTS = W.map((w, i) => new THREE.Vector3(-3.3, (2.5 - i) * .62, 0));
  const OUT = new THREE.Vector3(3.3, 0, 0), BOXC = new THREE.Vector3(1.75, 0, 0), BOXH = .42;

  /* ---------- Build every particle: where it sits in the neuron, and where it goes in the perceptron ---------- */
  const rec = [];
  const add = (bio, art, kind, u, idx, size, colB, colA, fadeB = 1, fadeA = 1, u2 = u) => rec.push({ bio, art, kind, u, u2, idx, size, colB, colA, fadeB, fadeA });
  const tips = [];
  // Dendrites: six trees on the left side. Each main branch maps onto one input line.
  const dendDirs = [110, 145, 172, 198, 225, 252].map((a, i) => new THREE.Vector3(Math.cos(a * Math.PI / 180), Math.sin(a * Math.PI / 180), (r() - .5) * .5).normalize());
  dendDirs.forEach((dir0, i) => {
    const pts = [dir0.clone().multiplyScalar(.32)]; let p = pts[0].clone(), d = dir0.clone();
    const len = 1.75 + r() * .45;
    for (let s = 0; s < 8; s++) { d.add(unitVector(r).multiplyScalar(.32)).normalize(); d.lerp(dir0, .25).normalize(); p = p.clone().addScaledVector(d, len / 8); pts.push(p); }
    tips.push(p.clone());
    const main = []; alongPolyline(pts, Math.floor(1300 * D), main, .012, r);
    main.forEach(o => {
      const uIn = 1 - o.u;   // 0 at the tip, 1 at the cell body
      const cb = PAL.violet.clone().lerp(PAL.magenta, o.u * .7).multiplyScalar(1.05 - o.u * .3);
      const ca = (W[i] > 0 ? PAL.gold : PAL.rose).clone();
      const rad = (.05 * (1 - o.u) + .012) * .45;
      add(o.p.clone().add(unitVector(r).multiplyScalar(rad * r())), INPUTS[i], K.MAIN, uIn, i, .016 + (1 - o.u) * .012, cb, ca, 1, 1);
    });
    // Side branches and their twigs.
    for (let b = 0; b < 4; b++) {
      const at = 2 + b, base = pts[at], attachU = 1 - at / 8;
      const branch = (start, dir, L, depth, uStart) => {
        const bp = [start.clone()]; let q = start.clone(), dd = dir.clone();
        for (let s = 0; s < 5; s++) { dd.add(unitVector(r).multiplyScalar(.5)).normalize(); q = q.clone().addScaledVector(dd, L / 5); bp.push(q); }
        const o2 = []; alongPolyline(bp, Math.floor((depth ? 140 : 320) * D), o2, .01, r);
        o2.forEach(o => add(o.p, INPUTS[i], K.SUB, uStart - o.u * L * .35, i, (depth ? .008 : .011) * (1 - o.u * .5), PAL.violet.clone().lerp(PAL.magenta, .5).multiplyScalar(.8), PAL.gold, 1, 0, attachU));
        if (depth < 1) for (let k = 0; k < 2; k++) branch(bp[2 + Math.floor(r() * 3)], dd.clone().add(unitVector(r)).normalize(), L * .55, depth + 1, uStart - .2);
      };
      branch(base, d.clone().add(unitVector(r).multiplyScalar(1.1)).normalize(), .55 + r() * .4, 0, attachU);
    }
    // A glowing synapse at the tip: this is what you tap.
    for (let k = 0; k < Math.floor(120 * D); k++) add(p.clone().add(unitVector(r).multiplyScalar(.06 * Math.cbrt(r()))), INPUTS[i], K.TIP, 0, i, .014, PAL.goldHi, PAL.gold, 1, 0, 0);
  });
  // The cell body: a soft teardrop that fills with charge. In the perceptron it becomes the Σ ring.
  for (let k = 0; k < Math.floor(3200 * D); k++) {
    const d = unitVector(r), stretch = d.x > 0 ? 1 + d.x * .35 : 1;
    const bio = new THREE.Vector3(d.x * .36 * stretch, d.y * .34, d.z * .3).multiplyScalar(.85 + r() * .15);
    const a = r() * Math.PI * 2, ring = r() < .7;
    const art = ring ? new THREE.Vector3(Math.cos(a) * .32, Math.sin(a) * .32, (r() - .5) * .02) : new THREE.Vector3(Math.cos(a) * .3 * Math.sqrt(r()), Math.sin(a) * .3 * Math.sqrt(r()), 0);
    add(bio, art, K.SOMA, (d.y * .5 + .5), 0, .018, PAL.goldHi.clone().multiplyScalar(.9), PAL.goldHi, 1, ring ? 1 : .35);
  }
  // The axon, wrapped in myelin, ending in synaptic terminals. In the perceptron: the output line and the output node.
  const axonPts = []; { let p = new THREE.Vector3(.38, 0, 0), d = new THREE.Vector3(1, 0, 0); axonPts.push(p.clone()); for (let s = 0; s < 14; s++) { d.add(new THREE.Vector3(0, (r() - .5) * .25, (r() - .5) * .2)).normalize(); d.lerp(new THREE.Vector3(1, 0, 0), .3).normalize(); p = p.clone().addScaledVector(d, .36); axonPts.push(p); } }
  const axEnd = axonPts[axonPts.length - 1];
  const axon = []; alongPolyline(axonPts, Math.floor(2600 * D), axon, .008, r);
  axon.forEach(o => add(o.p, null, K.AXON, o.u, 0, .011, PAL.violet.clone().multiplyScalar(.9), PAL.cyan, 1, 1));
  for (let m = 0; m < 7; m++) {
    const u0 = .12 + m * .1, u1 = u0 + .075;
    const seg = axon.filter(o => o.u > u0 && o.u < u1);
    for (let k = 0; k < Math.floor(1100 * D) && seg.length; k++) {
      const o = seg[Math.floor(r() * seg.length)], a = r() * Math.PI * 2;
      const rad = .085 * Math.sin(Math.PI * (o.u - u0) / (u1 - u0)) ** .5;
      add(o.p.clone().add(new THREE.Vector3(0, Math.cos(a) * rad, Math.sin(a) * rad)), null, K.MYELIN, o.u, m, .012, PAL.cyan.clone().lerp(PAL.white, .3).multiplyScalar(.7), PAL.cyan, 1, 0);
    }
  }
  for (let t = 0; t < 7; t++) {
    const dir = new THREE.Vector3(1, (t - 3) * .32, (r() - .5) * .6).normalize(), tp = [axEnd.clone()]; let q = axEnd.clone();
    for (let s = 0; s < 4; s++) { q = q.clone().addScaledVector(dir.clone().add(unitVector(r).multiplyScalar(.3)).normalize(), .13); tp.push(q); }
    const o3 = []; alongPolyline(tp, Math.floor(180 * D), o3, .006, r);
    o3.forEach(o => { const a = r() * Math.PI * 2; add(o.p, new THREE.Vector3(Math.cos(a) * .2, Math.sin(a) * .2, 0), K.TERM, o.u, t, .01, PAL.violet, PAL.mint, 1, 1); });
    for (let k = 0; k < Math.floor(70 * D); k++) { const a = r() * Math.PI * 2; add(q.clone().add(unitVector(r).multiplyScalar(.045)), new THREE.Vector3(Math.cos(a) * .2, Math.sin(a) * .2, 0), K.TERM, 1, t, .013, PAL.goldHi, PAL.mint, 1, 1); }
  }
  // Perceptron-only pieces: the input nodes, the activation box and its sigmoid curve.
  INPUTS.forEach((c, i) => { for (let k = 0; k < Math.floor(220 * D); k++) { const a = r() * Math.PI * 2, ring = r() < .75, rr = ring ? .17 : .15 * Math.sqrt(r()); add(c.clone(), c.clone().add(new THREE.Vector3(Math.cos(a) * rr, Math.sin(a) * rr, 0)), K.INPUT, 0, i, .014, PAL.white, PAL.cream, 0, ring ? 1 : .3); } });
  for (let k = 0; k < Math.floor(900 * D); k++) {
    const e = r() * 4, s = e % 1, side = Math.floor(e);
    const off = [[-1 + 2 * s, -1], [1, -1 + 2 * s], [1 - 2 * s, 1], [-1, 1 - 2 * s]][side];
    add(BOXC.clone(), BOXC.clone().add(new THREE.Vector3(off[0] * BOXH, off[1] * BOXH, 0)), K.BOX, 0, 0, .012, PAL.cyan, PAL.cyan, 0, 1);
  }
  for (let k = 0; k < Math.floor(500 * D); k++) { const s = r(), z = (s - .5) * 12; add(BOXC.clone(), BOXC.clone().add(new THREE.Vector3((s - .5) * BOXH * 1.7, (sigmoid(z) - .5) * BOXH * 1.6, 0)), K.CURVE, s, 0, .011, PAL.goldHi, PAL.goldHi, 0, 1); }

  const n = rec.length;
  const A = { bio: new Float32Array(n * 3), art: new Float32Array(n * 3), colB: new Float32Array(n * 3), colA: new Float32Array(n * 3), info: new Float32Array(n * 4), info2: new Float32Array(n * 4) };
  rec.forEach((o, i) => {
    A.bio.set([o.bio.x, o.bio.y, o.bio.z], i * 3);
    const art = o.art || new THREE.Vector3();
    A.art.set([art.x, art.y, art.z], i * 3);
    A.colB.set([o.colB.r, o.colB.g, o.colB.b], i * 3); A.colA.set([o.colA.r, o.colA.g, o.colA.b], i * 3);
    A.info.set([o.kind, o.u, o.idx, o.size], i * 4);
    A.info2.set([o.u2, o.fadeB, o.fadeA, r()], i * 4);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(A.bio, 3));
  geo.setAttribute('aArt', new THREE.BufferAttribute(A.art, 3));
  geo.setAttribute('aColB', new THREE.BufferAttribute(A.colB, 3));
  geo.setAttribute('aColA', new THREE.BufferAttribute(A.colA, 3));
  geo.setAttribute('aInfo', new THREE.BufferAttribute(A.info, 4));
  geo.setAttribute('aInfo2', new THREE.BufferAttribute(A.info2, 4));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(1, 0, 0), 8);

  const U = {
    uTime: { value: 0 }, uPx: { value: 1000 }, uMorph: { value: 0 }, uFire: { value: -1 }, uCharge: { value: 0 }, uFlash: { value: 0 }, uTermFlash: { value: 0 },
    uDend: { value: [-1, -1, -1, -1, -1, -1] }, uX: { value: [1, .2, .7, .1, .9, .4] }, uY: { value: .5 }, uZ: { value: 0 }, uHotTip: { value: -1 }, uHotIn: { value: -1 },
    uSigma: { value: new THREE.Vector3() }, uOutPos: { value: OUT.clone() }, uNet: { value: 0 }, uOpacity: { value: 1 }
  };
  const mat = additive({
    uniforms: U,
    vertexShader: `
      attribute vec3 aArt, aColB, aColA; attribute vec4 aInfo, aInfo2;
      uniform float uTime, uPx, uMorph, uFire, uCharge, uFlash, uTermFlash, uY, uZ, uHotTip, uHotIn, uNet, uOpacity;
      uniform float uDend[6], uX[6]; uniform vec3 uSigma, uOutPos;
      varying vec3 vColor; varying float vAlpha;
      void main() {
        float kind = aInfo.x, u = aInfo.y, idx = aInfo.z, size = aInfo.w, u2 = aInfo2.x, rnd = aInfo2.w;
        int ii = int(idx + .5);
        // Where this point sits in the perceptron.
        vec3 art = aArt;
        if (kind < 3.5) art = mix(aArt, uSigma, kind < 1.5 ? u : u2);
        else if (kind < 4.5) art = uSigma + aArt;
        else if (kind < 6.5) art = mix(uSigma + vec3(.34, 0., 0.), uOutPos - vec3(.22, 0., 0.), u) + vec3(0., 0., 0.);
        else if (kind < 7.5) art = uOutPos + aArt;
        // A little life in the biological neuron.
        vec3 bio = position + .012 * vec3(sin(uTime * .9 + u * 7. + idx), cos(uTime * .8 + u * 6. + idx * 2.), 0.) * (1. - u);
        float m = clamp((uMorph - rnd * .25) / .75, 0., 1.); m = m * m * (3. - 2. * m);
        vec3 p = mix(bio, art, m) + sin(m * 3.14159) * vec3(0., 0., (rnd - .5) * .8);
        // Light: signals in the neuron, values in the perceptron.
        float gB = 0., gA = 0.;
        if (kind < 3.5) {
          float w = uDend[ii];
          if (w > -.5) gB += exp(-pow((u - w) * 12., 2.)) * 2.2;
          if (kind > 2.5) gB += (.45 + .45 * sin(uTime * 3. + idx * 1.7)) + (abs(uHotTip - idx) < .5 ? 1.6 : 0.);
          gA = uX[ii] * (.35 + 1.4 * pow(.5 + .5 * sin((u * 5. - uTime * 1.6) * 3.14159), 8.));
        } else if (kind < 4.5) {
          gB = uCharge * step(u, uCharge) * 1.1 + uFlash * 2.5;
          gA = .5 + clamp(abs(uZ) * .4, 0., 1.2);
        } else if (kind < 6.5) {
          if (uFire > -.5) gB += exp(-pow((u - uFire) * 11., 2.)) * (kind > 5.5 ? 3. : 2.4);
          gA = uY * (.3 + 1.6 * pow(.5 + .5 * sin((u * 4. - uTime * 1.8) * 3.14159), 8.));
        } else if (kind < 7.5) { gB = uTermFlash * 2.5; gA = .3 + uY * 1.6; }
        else if (kind < 8.5) { gA = .25 + uX[ii] * 1.3 + (abs(uHotIn - idx) < .5 ? 1. : 0.); }
        else gA = .7;
        float g = mix(gB, gA, m);
        vec3 col = mix(aColB, aColA, m);
        float fade = mix(aInfo2.y, aInfo2.z, m);
        // As the network forms, the perceptron's own output side steps aside.
        if (kind > 4.5 && kind < 7.5 || kind > 8.5) fade *= 1. - uNet;
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uPx * size * (1. + g * .35) / -mv.z;
        vColor = col * (.55 + g * .9);
        vAlpha = uOpacity * fade * .32 * (1. + g * .5);
      }`,
    fragmentShader: POINT_FRAG
  });
  const points = new THREE.Points(geo, mat); scene.add(points);
  const somaGlow = glowSprite(PAL.goldHi, 1.4, .25); scene.add(somaGlow);
  const markGlow = glowSprite(PAL.goldHi, .35, 0); scene.add(markGlow);   // the point riding the sigmoid curve

  /* ---------- The network it grows into ---------- */
  const LAYERS = [INPUTS.map(v => v.clone()), [...Array(7)].map((_, i) => new THREE.Vector3(-1.1, (3 - i) * .55, (r() - .5) * .5)), [...Array(7)].map((_, i) => new THREE.Vector3(1.05, (3 - i) * .55, (r() - .5) * .5)), [-1, 0, 1].map(k => new THREE.Vector3(3.3, k * .8, 0))];
  LAYERS[1][3].set(-1.1, 0, 0);   // the perceptron becomes this neuron
  const nodes = []; LAYERS.forEach((L, li) => L.forEach((v, k) => nodes.push({ pos: v, layer: li, order: li === 0 ? 0 : li === 1 && k === 3 ? 0 : (li - 1) * .34 + k * .03 + .1 })));
  const nPts = [], nInfo = [], nInfo2 = [], nCol = [];
  const nodeId = (li, k) => LAYERS.slice(0, li).reduce((s, L) => s + L.length, 0) + k;
  nodes.forEach((nd, id) => {
    if (nd.layer === 0 || (nd.layer === 1 && nd.order === 0)) return;   // inputs and the perceptron itself are already drawn
    const cnt = Math.floor(260 * D);
    for (let k = 0; k < cnt; k++) { const a = r() * Math.PI * 2, ring = k < cnt * .75, rr = ring ? .16 : .13 * Math.sqrt(r()); nPts.push(nd.pos.x, nd.pos.y, nd.pos.z); nInfo.push(Math.cos(a) * rr, Math.sin(a) * rr, nd.order, id); nInfo2.push(0, -1, 0, r()); const c = nd.layer === 3 ? PAL.mint : PAL.goldHi; nCol.push(c.r, c.g, c.b); }
  });
  const weights = [];
  for (let li = 0; li < 3; li++) LAYERS[li].forEach((a, i) => LAYERS[li + 1].forEach((b, j) => {
    const w = (r() * 2 - 1), ida = nodeId(li, i), idb = nodeId(li + 1, j), cnt = Math.floor(170 * D);
    weights.push(w);
    const oa = nodes[ida].order, ob = nodes[idb].order;
    for (let k = 0; k < cnt; k++) { const u = (k + r()) / cnt; nPts.push(a.x, a.y, a.z); nInfo.push(b.x, b.y, b.z, 0); nInfo2.push(u, li, w, r()); const c = w > 0 ? PAL.gold : PAL.violet; nCol.push(c.r, c.g, c.b); nInfo[nInfo.length - 1] = ida * 1000 + idb; }
  }));
  const netGeo = new THREE.BufferGeometry();
  netGeo.setAttribute('position', new THREE.Float32BufferAttribute(nPts, 3));
  netGeo.setAttribute('aInfo', new THREE.Float32BufferAttribute(nInfo, 4));
  netGeo.setAttribute('aInfo2', new THREE.Float32BufferAttribute(nInfo2, 4));
  netGeo.setAttribute('aCol', new THREE.Float32BufferAttribute(nCol, 3));
  netGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 8);
  const orders = new Float32Array(nodes.length); nodes.forEach((nd, i) => { orders[i] = nd.order; });
  const NU = { uTime: { value: 0 }, uPx: { value: 1000 }, uGrow: { value: 0 }, uSigma: U.uSigma, uWave: { value: -99 }, uHot: { value: -1 }, uOpacity: { value: 1 }, uNoise: { value: 1 } };
  const netMat = additive({
    uniforms: NU,
    vertexShader: `
      attribute vec4 aInfo, aInfo2; attribute vec3 aCol;
      uniform float uTime, uPx, uGrow, uWave, uHot, uOpacity, uNoise; uniform vec3 uSigma;
      varying vec3 vColor; varying float vAlpha;
      float grow(float order) { float e = clamp((uGrow - order) / .45, 0., 1.); return e * e * (3. - 2. * e); }
      void main() {
        vec3 p; float a = 0., g = 0., size;
        bool isNode = aInfo2.y < -.5;
        if (isNode) {
          float e = grow(aInfo.z);
          p = mix(uSigma, position, e) + vec3(aInfo.xy, 0.) * e;
          a = e * 1.6; size = .026;
          float wave = exp(-pow(((uTime - uWave) * 1.7 - (position.x + 3.3) / 2.2) * 2.5, 2.));
          g = (abs(aInfo.w - uHot) < .5 ? 1.4 : 0.) + wave * 1.5;
        } else {
          float ida = floor(aInfo.w / 1000.), idb = aInfo.w - ida * 1000.;
          float u = aInfo2.x, li = aInfo2.y, w = aInfo2.z;
          // Both ends fly out with their neurons; the wire draws itself from one to the other.
          p = mix(position, aInfo.xyz, u);
          float reveal = clamp((uGrow - .35 - li * .3) / .4, 0., 1.);
          a = step(u, reveal) * (.45 + 1.1 * abs(w));
          a *= mix(1., .45 + .55 * abs(sin(uTime * (1.3 + aInfo2.w * 2.) + aInfo2.w * 40.)), uNoise);   // untrained: the weights flicker
          size = .013 + abs(w) * .011;
          float wave = exp(-pow(((uTime - uWave) * 1.7 - (li + u)) * 4., 2.));
          g = wave * 2.2 + ((abs(ida - uHot) < .5 || abs(idb - uHot) < .5) ? 1.2 : 0.);
        }
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uPx * size * (1. + g * .4) / -mv.z;
        vColor = aCol * (.6 + g);
        vAlpha = uOpacity * a * .4 * (1. + g * .5);
      }`,
    fragmentShader: POINT_FRAG
  });
  const net = new THREE.Points(netGeo, netMat); scene.add(net);

  /* ---------- Words: labels on the neuron, live maths for the perceptron ---------- */
  const L = {
    dend: ui.label('neuron', '<span class="tag">Dendrites<small>collect incoming signals</small></span>', 'left'),
    soma: ui.label('neuron', '<span class="tag">Cell body<small>adds them up</small></span>'),
    axon: ui.label('neuron', '<span class="tag">Axon<small>carries the spike</small></span>'),
    myelin: ui.label('neuron', '<span class="tag">Myelin sheath<small>makes it fast</small></span>'),
    term: ui.label('neuron', '<span class="tag">Synapses<small>pass it to the next neuron</small></span>'),
    xs: INPUTS.map((_, i) => ui.label('neuron', `<span class="tag val">x<sub>${i + 1}</sub> <b>0.0</b></span>`, 'left plain-dot')),
    ws: INPUTS.map((_, i) => ui.label('neuron', `<span class="tag w ${W[i] > 0 ? 'pos' : 'neg'}">w<sub>${i + 1}</sub> = ${W[i].toFixed(2).replace('-', '−')}</span>`, 'plain')),
    sum: ui.label('neuron', '<span class="tag sym">Σ<small>weighted sum</small></span>', 'plain'),
    act: ui.label('neuron', '<span class="tag sym">σ<small>activation</small></span>', 'plain'),
    out: ui.label('neuron', '<span class="tag val">y <b>0.00</b></span>')
  };
  L.xs.forEach(o => { o.b = o.el.querySelector('b'); }); L.out.b = L.out.el.querySelector('b');
  const panel = document.createElement('div');
  panel.className = 'math-panel';
  panel.innerHTML = `<p class="mp-k">The perceptron · live</p>
    <p class="mp-row"><i>z</i> = Σ <i>w<sub>i</sub>x<sub>i</sub></i> + <i>b</i> = <b class="mp-z">0.00</b></p>
    <p class="mp-row"><i>y</i> = σ(<i>z</i>) = <b class="mp-y">0.00</b> <span class="mp-fire">fires</span></p>
    <p class="mp-row mp-net"><i>h</i> = σ(<i>W</i><i>x</i> + <i>b</i>)</p>`;
  ctx.$('#scene-ui').append(panel);
  const mpZ = panel.querySelector('.mp-z'), mpY = panel.querySelector('.mp-y');

  /* ---------- State and interaction ---------- */
  const dend = U.uDend.value, X = U.uX.value;
  let charge = 0, fire = -1, flash = 0, termFlash = 0, lastTouch = -99, autoNext = 0, phase = 'bio', localP = 0, drag = null, wave = -99, fires = 0;
  const screenOf = v => ui.screen(v, camera);
  const stimulate = i => { if (dend[i] > -.5) return; dend[i] = 0; score.sfx('stim', { i, pan: -.5 }); };
  const nearest = (list, px, py, max) => { let best = -1, bd = max; list.forEach((v, i) => { const s = screenOf(v); const d = Math.hypot(s.x - px, s.y - py); if (d < bd) { bd = d; best = i; } }); return best; };
  function compute() { let z = BIAS; for (let i = 0; i < 6; i++) z += W[i] * X[i]; const y = sigmoid(z * 1.4); return { z, y }; }

  /* ---------- Camera ---------- */
  const shots = [
    { p: 0, pos: [0, .05, 2.4], at: [0, 0, 0] },
    { p: .12, pos: [1.3, .35, 6.6], at: [1.35, 0, 0] },
    { p: .4, pos: [1.1, .2, 6.4], at: [1.25, 0, 0] },
    { p: .58, pos: [0, 0, 7.4], at: [0, 0, 0] },
    { p: .78, pos: [0, 0, 7.4], at: [0, 0, 0] },
    { p: .9, pos: [1.3, .7, 8.2], at: [0, 0, 0] },
    { p: 1, pos: [1.7, .9, 8] , at: [0, 0, 0] }
  ];
  const cpos = new THREE.Vector3(), cat = new THREE.Vector3();
  function shot(p) {
    let i = 0; while (i < shots.length - 2 && p > shots[i + 1].p) i++;
    const a = shots[i], b = shots[i + 1], t = easeInOut(clamp((p - a.p) / (b.p - a.p)));
    cpos.set(lerp(a.pos[0], b.pos[0], t), lerp(a.pos[1], b.pos[1], t), lerp(a.pos[2], b.pos[2], t));
    cat.set(lerp(a.at[0], b.at[0], t), lerp(a.at[1], b.at[1], t), lerp(a.at[2], b.at[2], t));
    // Phones: the camera rolls a quarter turn so the neuron and the perceptron run top to bottom, and steps back to fit.
    const portrait = camera.aspect < 1;
    camera.up.set(portrait ? -1 : 0, portrait ? 0 : 1, 0);
    const k = portrait ? 1.72 : 1;
    cpos.sub(cat).multiplyScalar(k).add(cat);
  }

  return {
    id: 'neuron', scene, camera, extra: {},
    captions: [
      { at: [.06, .2], html: 'A biological neuron collects signals through its <b>dendrites</b>.', x: 93, y: 17, cls: 'note', align: 'right' },
      { at: [.22, .38], html: 'Past a threshold, it <b>fires</b>: a spike races down the axon.', x: 93, y: 17, cls: 'note', align: 'right' },
      { at: [.1, .4], html: `<span class="hint-dot"></span>${coarse ? 'Tap' : 'Click'} the glowing endings to stimulate it`, x: 50, y: 84, cls: 'hint', align: 'center' },
      { at: [.42, .57], html: 'In 1958, Frank Rosenblatt turned this into maths: the <b>perceptron</b>.', x: 50, y: 14, cls: 'note center-note', align: 'center' },
      { at: [.6, .79], html: 'The <b>weights</b> decide which inputs matter. Learning means finding good ones.', x: 50, y: 12, cls: 'note center-note', align: 'center', m: { y: 31 } },
      { at: [.6, .8], html: `<span class="hint-dot"></span>${coarse ? 'Tap the inputs to change them' : 'Drag the inputs up or down'}`, x: 50, y: 84, cls: 'hint', align: 'center', m: { y: 58 } },
      { at: [.78, .86], html: 'Wire many together and you get a <b>neural network</b>.', x: 93, y: 17, cls: 'note', align: 'right' },
      { at: [.86, 1.1], html: 'But every weight starts random. It knows nothing yet.', x: 50, y: 13, cls: 'big wide', align: 'center', m: { y: 11, html: 'Every weight starts random. It knows nothing yet.' } },
      { at: [.86, 1.05], html: `<span class="hint-dot"></span>${coarse ? 'Tap' : 'Click'} the network to send a signal through it`, x: 50, y: 88, cls: 'hint', align: 'center', m: { y: 64 } }
    ],
    resize(aspect) { camera.aspect = aspect; camera.updateProjectionMatrix(); },
    show(on) { panel.classList.toggle('shown', on); if (!on) { panel.classList.remove('on'); ui.hideLabels('neuron'); document.body.style.cursor = ''; } },
    pointer(type, e) {
      const px = pointer.x, py = pointer.y;
      if (phase === 'bio') {
        const tipWorld = tips;
        const i = nearest(tipWorld, px, py, coarse ? 60 : 44);
        if (type === 'move') { if (i !== U.uHotTip.value && i >= 0) score.sfx('hover'); U.uHotTip.value = i; document.body.style.cursor = i >= 0 ? 'pointer' : ''; }
        if (type === 'down' && i >= 0) { lastTouch = ctx.time; stimulate(i); }
      } else if (phase === 'perc') {
        const i = nearest(INPUTS, px, py, coarse ? 56 : 40);
        if (type === 'move') { U.uHotIn.value = drag ? drag.i : i; document.body.style.cursor = i >= 0 || drag ? 'ns-resize' : ''; if (drag) { X[drag.i] = clamp(drag.x0 + (drag.y0 - py) / 160); } }
        if (type === 'down' && i >= 0) { drag = { i, y0: py, x0: X[i], t: ctx.time, moved: false }; lastTouch = ctx.time; }
        if (type === 'up' && drag) { if (Math.abs(py - drag.y0) < 6) { X[drag.i] = X[drag.i] > .75 ? 0 : X[drag.i] > .3 ? 1 : .5; } score.sfx('tick'); drag = null; }
      } else if (phase === 'net') {
        const id = nearest(nodes.map(nd => nd.pos), px, py, 34);
        if (type === 'move') { if (id !== NU.uHot.value && id >= 0) score.sfx('hover'); NU.uHot.value = id; document.body.style.cursor = 'pointer'; }
        if (type === 'down') { wave = NU.uTime.value; NU.uWave.value = wave; score.sfx('fire'); }
      }
    },
    update(p, info) {
      localP = p;
      const t = info.time, dt = info.dt;
      U.uTime.value = t; NU.uTime.value = t;
      const px = pixelScale(renderer, camera); U.uPx.value = px; NU.uPx.value = px;
      phase = p < .42 ? 'bio' : p < .8 ? 'perc' : 'net';
      if (!info.active) document.body.style.cursor = '';
      // Biology: signals travel in, charge builds and leaks, and past the threshold it fires.
      for (let i = 0; i < 6; i++) if (dend[i] > -.5) { dend[i] += dt / .85; if (dend[i] >= 1) { dend[i] = -1; charge += .36; if (charge >= .99 && fire < 0) { fire = 0; charge = 0; flash = 1; fires++; score.sfx('fire', { pan: .2 }); } } }
      charge = Math.max(0, charge - dt * .16);
      if (fire >= 0) { fire += dt / 1.15; if (fire >= 1) { fire = -1; termFlash = 1; score.sfx('pop', { pan: .6 }); } }
      flash *= Math.pow(.05, dt); termFlash *= Math.pow(.08, dt);
      if (phase === 'bio' && info.active && t - lastTouch > 2.6 && t > autoNext && p > .06) { autoNext = t + .55 + Math.random() * .5; stimulate(Math.floor(Math.random() * 6)); }
      U.uCharge.value = charge; U.uFire.value = fire; U.uFlash.value = flash; U.uTermFlash.value = termFlash;
      somaGlow.material.opacity = (.12 + charge * .35 + flash * .8) * (1 - sstep(.45, .6, p));
      // The morph into the perceptron, and its live maths.
      const morph = sstep(.42, .6, p); U.uMorph.value = morph;
      const { z, y } = compute(); U.uZ.value = z; U.uY.value = y;
      if (phase === 'perc' && info.active && t - lastTouch > 3.2 && !drag) { const k = Math.floor(t * .5) % 6; X[k] = lerp(X[k], .5 + .5 * Math.sin(t * .9 + k), .03); }
      mpZ.textContent = z.toFixed(2).replace('-', '−'); mpY.textContent = y.toFixed(2);
      panel.classList.toggle('firing', y > .5);
      panel.classList.toggle('on', info.active && p > .58 && p < .99);
      panel.classList.toggle('net', p > .8);
      // The network grows out of the perceptron.
      const grow = sstep(.8, .93, p); NU.uGrow.value = grow * 1.6;
      U.uNet.value = sstep(.8, .86, p);
      U.uSigma.value.set(lerp(0, -1.1, sstep(.8, .86, p)), 0, 0);
      markGlow.position.set(BOXC.x + clamp(z * 1.4 / 12, -.5, .5) * BOXH * 1.7, BOXC.y + (y - .5) * BOXH * 1.6, 0);
      markGlow.material.opacity = morph * (1 - U.uNet.value) * .9;
      if (phase === 'net' && info.active && t - wave > 3.5 && grow > .95) { wave = t; NU.uWave.value = t; }
      // Camera.
      shot(p);
      camera.position.copy(cpos);
      if (pointer.inside && !coarse) { camera.position.x += pointer.ndc.x * .25; camera.position.y += pointer.ndc.y * .15; }
      camera.lookAt(cat);
      // Labels.
      const act = info.active;
      const bioOn = act && p > .1 && p < .44, percOn = act && p > .57 && p < .82;
      ui.place(L.dend, tips[1], camera, bioOn);
      ui.place(L.soma, new THREE.Vector3(0, .38, 0), camera, bioOn);
      ui.place(L.axon, axonPts[3], camera, bioOn);
      ui.place(L.myelin, axonPts[7].clone().add(new THREE.Vector3(0, .1, 0)), camera, bioOn);
      ui.place(L.term, axEnd.clone().add(new THREE.Vector3(.3, .2, 0)), camera, bioOn);
      INPUTS.forEach((v, i) => {
        ui.place(L.xs[i], v.clone().add(new THREE.Vector3(-.25, 0, 0)), camera, percOn); L.xs[i].b.textContent = X[i].toFixed(1);
        ui.place(L.ws[i], v.clone().lerp(U.uSigma.value, .38).add(new THREE.Vector3(0, .12, 0)), camera, percOn && p < .8);
      });
      ui.place(L.sum, new THREE.Vector3(0, -.62, 0), camera, percOn && p < .8);
      ui.place(L.act, BOXC.clone().add(new THREE.Vector3(0, -.75, 0)), camera, percOn && p < .8);
      ui.place(L.out, OUT.clone().add(new THREE.Vector3(.32, 0, 0)), camera, percOn && p < .8); L.out.b.textContent = y.toFixed(2);
    }
  };
}
