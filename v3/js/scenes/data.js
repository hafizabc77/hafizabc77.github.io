/* Act II, scene 5: data. One clear picture: the network on the right, and on the left the sources it learns from,
   appearing one at a time, each sending its own coloured stream of light into the network's inputs.
   Hover a source to see what it sends; click to send a burst. One of the web pages is one Hafiz built (GeePower); then his own
   data: particle detectors, at IHEP where he works, and the science images his co-authored paper compresses. Every stream passes
   through a gate just before the network; the camera ends on it, framed as the tokenizer scene opens. */
import * as THREE from 'three';
import { additive, POINT_FRAG, PAL, col, rng, sstep, clamp, lerp, easeInOut, pixelScale, loadImage, glowSprite, FONTS, window4 } from '../core/util.js';

const NET = new THREE.Vector3(1.6, 0, 0), NS = 1.15;          // where the network sits, and its scale
export const GATE = new THREE.Vector3(-4.5, 0, 0);            // the gate everything passes through, just before the network
export const GATE_R = 1.75;

export default function data(ctx) {
  const { small, ui, score, pointer, renderer, coarse } = ctx;
  const scene = new THREE.Scene();
  scene.background = col('#03040c');
  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, .05, 400);
  const r = rng(909);

  /* ---------- The network, clearly visible, its input neurons lighting up as data arrives ---------- */
  const LAYERS = [[...Array(6)].map((_, i) => new THREE.Vector3(-3.3, (2.5 - i) * .62, 0)), [...Array(7)].map((_, i) => new THREE.Vector3(-1.1, (3 - i) * .55, (r() - .5) * .5)), [...Array(7)].map((_, i) => new THREE.Vector3(1.05, (3 - i) * .55, (r() - .5) * .5)), [-1, 0, 1].map(k => new THREE.Vector3(3.3, k * .8, 0))];
  const W = v => v.clone().multiplyScalar(NS).add(NET);
  const INPUTS = LAYERS[0].map(W);
  const nPts = [], nCol = [], nInfo = [];
  LAYERS.forEach((L, li) => L.forEach((v0, k) => { const v = W(v0); for (let j = 0; j < 220; j++) { const a = r() * Math.PI * 2, rr = (j < 160 ? .17 : .13 * Math.sqrt(r())) * NS; nPts.push(v.x + Math.cos(a) * rr, v.y + Math.sin(a) * rr, v.z); const c = li === 3 ? PAL.mint : PAL.goldHi; nCol.push(c.r, c.g, c.b); nInfo.push(li === 0 ? k : -1, .024, 0, r()); } }));
  for (let li = 0; li < 3; li++) LAYERS[li].forEach(a0 => LAYERS[li + 1].forEach(b0 => { const a = W(a0), b = W(b0), w = r() * 2 - 1, c = w > 0 ? PAL.gold : PAL.violet; for (let j = 0; j < 90; j++) { const u = r(); nPts.push(lerp(a.x, b.x, u), lerp(a.y, b.y, u), lerp(a.z, b.z, u)); nCol.push(c.r, c.g, c.b); nInfo.push(-2 - li, .011 + Math.abs(w) * .009, u, r()); } }));
  const netGeo = new THREE.BufferGeometry();
  netGeo.setAttribute('position', new THREE.Float32BufferAttribute(nPts, 3)); netGeo.setAttribute('color', new THREE.Float32BufferAttribute(nCol, 3)); netGeo.setAttribute('aInfo', new THREE.Float32BufferAttribute(nInfo, 4));
  const feed = [0, 0, 0, 0, 0, 0];
  const netMat = additive({
    uniforms: { uTime: { value: 0 }, uPx: { value: 1000 }, uFeed: { value: feed }, uOpacity: { value: 1 }, uFlow: { value: 0 } },
    vertexShader: `
      attribute vec3 color; attribute vec4 aInfo; uniform float uTime, uPx, uFeed[6], uOpacity, uFlow;
      varying vec3 vColor; varying float vAlpha;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv;
        float g = 0.;
        if (aInfo.x > -.5) g = uFeed[int(aInfo.x + .5)] * 2.;                       // an input neuron receiving data
        else if (aInfo.x < -1.5) {                                                   // a weight: signals ripple forward while data flows
          float li = -aInfo.x - 2.; g = uFlow * pow(.5 + .5 * sin((li + aInfo.z) * 3. - uTime * 3.), 10.) * 1.4;
        }
        float fl = aInfo.x < -1.5 ? .5 + .5 * abs(sin(uTime * (1.2 + aInfo.w * 2.) + aInfo.w * 40.)) : 1.;
        gl_PointSize = uPx * aInfo.y * (1. + g * .4) / -mv.z;
        vColor = color * (.75 + g); vAlpha = uOpacity * .5 * fl * (1. + g * .4);
      }`,
    fragmentShader: POINT_FRAG
  });
  scene.add(new THREE.Points(netGeo, netMat));
  const netGlow = glowSprite(PAL.violet, 9, .08); netGlow.position.copy(NET); scene.add(netGlow);

  /* ---------- The sources ---------- */
  const SRC = [
    { name: 'Web pages', sub: 'billions of them', cat: 'web', col: PAL.cyan, text: true },
    { name: 'Books', sub: 'centuries of writing', cat: 'book', col: PAL.amber, text: true },
    { name: 'Code', sub: 'open-source projects', cat: 'code', col: PAL.violet, text: true },
    { name: 'Images', sub: 'photos and drawings', cat: 'image', col: PAL.rose },
    { name: 'Video', sub: 'frames over time', cat: 'video', col: PAL.magenta },
    { name: 'Audio', sub: 'speech and music', cat: 'audio', col: PAL.mint },
    { name: 'Maths', sub: 'proofs and formulas', cat: 'math', col: PAL.cream, text: true },
    { name: 'Particle detectors', sub: 'my world · LHAASO, CMS, CEPC', cat: 'detector', col: PAL.goldHi, mine: true }
  ];
  // Arranged on a gentle arc on the left, each with a moment to appear.
  SRC.forEach((s, i) => {
    // A wide half-ring on the left: top to bottom, bulging away from the network.
    const a = Math.PI * (.62 + i / (SRC.length - 1) * .76);
    s.pos = new THREE.Vector3(-6.8 + Math.cos(a) * 5.6, Math.sin(a) * 5.0, (i % 2 ? .5 : -.5));
    s.at = .07 + i * .042;
    // Every stream lands on one input neuron, lining up with it before the gate so the last stretch runs straight in.
    const end = INPUTS[i % 6];
    const c1 = s.pos.clone().lerp(GATE, .45).add(new THREE.Vector3(0, (r() - .5) * .8, (r() - .5) * .8));
    const c2 = new THREE.Vector3(GATE.x - 1.6, end.y * .9, end.z);
    s.curve = [s.pos.clone(), c1, c2, end];
  });
  const STREAMS = SRC;

  /* ---------- Streams of light: every particle rides one source's curve ---------- */
  const per = small ? 160 : 380, NSTR = STREAMS.length, NP = per * NSTR;
  const sPos = new Float32Array(NP * 3), sInfo = new Float32Array(NP * 4);
  for (let i = 0; i < NP; i++) { const s = Math.floor(i / per); sInfo.set([s, r(), .05 + r() * .05, r()], i * 4); sPos.set([(r() - .5), (r() - .5), (r() - .5)], i * 3); }
  const sGeo = new THREE.BufferGeometry(); sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3)); sGeo.setAttribute('aInfo', new THREE.BufferAttribute(sInfo, 4));
  sGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 50);
  const flat = k => { const a = []; STREAMS.forEach(s => a.push(s.curve[k])); return a; };
  const SU = { uTime: { value: 0 }, uPx: { value: 1000 }, uP0: { value: flat(0) }, uP1: { value: flat(1) }, uP2: { value: flat(2) }, uP3: { value: flat(3) }, uCol: { value: STREAMS.map(s => s.col) }, uOn: { value: new Array(NSTR).fill(0) }, uBoost: { value: new Array(NSTR).fill(0) }, uOpacity: { value: 1 } };
  const sMat = additive({
    uniforms: SU,
    vertexShader: `
      #define NS ${NSTR}
      attribute vec4 aInfo; uniform float uTime, uPx, uOn[NS], uBoost[NS], uOpacity; uniform vec3 uP0[NS], uP1[NS], uP2[NS], uP3[NS], uCol[NS];
      varying vec3 vColor; varying float vAlpha;
      void main() {
        int s = int(aInfo.x + .5);
        float t = fract(aInfo.y + uTime * aInfo.z * (1. + uBoost[s] * 3.));
        float it = 1. - t;
        vec3 p = it * it * it * uP0[s] + 3. * it * it * t * uP1[s] + 3. * it * t * t * uP2[s] + t * t * t * uP3[s];
        p += position * .38 * sin(t * 3.14159) * pow(1. - t, 1.4);   // a loose stream that pulls tight as it arrives
        vec4 mv = modelViewMatrix * vec4(p, 1.); gl_Position = projectionMatrix * mv;
        float on = uOn[s] * smoothstep(0., .05, t) * (1. - smoothstep(.975, 1., t));
        float head = pow(fract(aInfo.w * 5. + uTime * .3), 30.);
        gl_PointSize = uPx * (.03 + aInfo.w * .03) * (1. + uBoost[s] + head) / -mv.z;
        vColor = uCol[s] * (.9 + uBoost[s] * 1.5 + head * 2.); vAlpha = uOpacity * on * .55;
      }`,
    fragmentShader: POINT_FRAG
  });
  scene.add(new THREE.Points(sGeo, sMat));

  /* ---------- Sample cards: one per source, flipping through what that source sends ---------- */
  const T = small ? 128 : 256, G = 8, atlas = document.createElement('canvas'); atlas.width = atlas.height = T * G;
  const ax = atlas.getContext('2d'), tiles = [], byCat = {};
  const tex = new THREE.CanvasTexture(atlas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  function slot(cat, desc, draw) {
    const i = tiles.length; if (i >= G * G) return;
    tiles.push({ cat, desc }); (byCat[cat] = byCat[cat] || []).push(i);
    ax.save(); ax.translate((i % G) * T, Math.floor(i / G) * T); ax.beginPath(); ax.roundRect(T * .03, T * .03, T * .94, T * .94, T * .07); ax.clip(); draw(ax, T); ax.restore();
  }
  const panel = (g, s, bg) => { g.fillStyle = bg; g.fillRect(0, 0, s, s); };
  const lines = (g, s, y0, n, color, w = .78, h = .035, gap = .068) => { g.fillStyle = color; for (let k = 0; k < n; k++) g.fillRect(s * .1, s * (y0 + k * gap), s * w * (k === n - 1 ? .55 : .8 + r() * .2), s * h); };
  const cover = (g, s, img) => { if (!img) { panel(g, s, '#1a1530'); return; } const k = Math.max(s / img.width, s / img.height), w = img.width * k, h = img.height * k; g.drawImage(img, (s - w) / 2, (s - h) / 2, w, h); };
  async function buildAtlas() {
    const names = ['place-lhaaso', 'lhaaso-aerial', 'lhaaso-shower', 'place-cms', 'unreal-arena', 'unreal-canyon', 'environment', 'metahuman-portrait', 'yangzhou', 'cas', 'geepower-site', 'place-ihep'];
    const imgs = {}; (await Promise.all(names.map(n => loadImage(`../assets/showcase/${n}.webp`)))).forEach((im, i) => { imgs[names[i]] = im; });
    const mh = await Promise.all(['000', '045'].map(f => loadImage(`../assets/metahuman/${f}.webp`)));
    slot('web', 'A web page I built: GeePower Energy Technology, 2021–22', (g, s) => { const im = imgs['geepower-site']; if (!im) { panel(g, s, '#141a2e'); return; } const k = s / im.width; g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, s, s); g.filter = 'brightness(.62) contrast(1.05)'; g.drawImage(im, 0, 0, s, im.height * k); g.filter = 'none'; });
    ['How rivers shape valleys', 'Learning Mandarin tones', 'Why is the sky blue?'].forEach((h, k) => slot('web', 'A web page: one of billions', (g, s) => {
      panel(g, s, '#141a2e'); g.fillStyle = '#1f2742'; g.fillRect(0, 0, s, s * .1);
      g.font = `700 ${s * .085}px ${FONTS.sans}`; g.fillStyle = '#e9e4d6'; const words = h.split(' '); let line = '', y = .24; words.forEach(w => { if (g.measureText(line + w).width > s * .82) { g.fillText(line, s * .09, s * y); line = ''; y += .1; } line += w + ' '; }); g.fillText(line, s * .09, s * y);
      lines(g, s, y + .08, 6, '#4a5578'); }));
    ['Chapter 3', 'Chapter 12'].forEach(h => slot('book', 'A page from a book', (g, s) => { panel(g, s, '#2a2216'); g.font = `400 ${s * .07}px ${FONTS.serif}`; g.fillStyle = '#e3bd6a'; g.fillText(h, s * .1, s * .16); g.font = `400 ${s * .2}px ${FONTS.serif}`; g.fillStyle = '#ffb380'; g.fillText('T', s * .1, s * .42); lines(g, s, .27, 2, '#6d5c40', .55, .03, .06); lines(g, s, .46, 6, '#6d5c40', .8, .03, .07); }));
    [['def forward(x):', '    h = relu(W1 @ x + b1)', '    return softmax(W2 @ h)'], ['for epoch in range(100):', '    loss = lossfn(model(x), y)', '    loss.backward()', '    opt.step()'], ['attn = softmax(q @ k.T / d**.5)', 'out = attn @ v']].forEach(cl => slot('code', 'Code from an open-source project', (g, s) => {
      panel(g, s, '#11131f'); cl.forEach((l, k) => { g.font = `400 ${s * .058}px ${FONTS.mono}`; g.fillStyle = /^(def|for|return)/.test(l.trim()) ? '#c792ea' : '#e6e1cf'; g.fillText(l, s * .07, s * (.22 + k * .1)); }); }));
    [['unreal-canyon', 'An image: a canyon I built in Unreal Engine'], ['environment', 'An image: an Unreal Engine environment'], ['metahuman-portrait', 'An image: a digital human I designed']].forEach(([n, d]) => slot('image', d, (g, s) => cover(g, s, imgs[n])));
    [mh[0], imgs['unreal-arena'], mh[1]].forEach(im => slot('video', 'Video: one frame of many', (g, s) => {
      cover(g, s, im); g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, 0, s, s * .1); g.fillRect(0, s * .9, s, s * .1); g.fillStyle = '#ddd'; for (let x = 0; x < 8; x++) { g.fillRect(s * (.04 + x * .125), s * .03, s * .06, s * .04); g.fillRect(s * (.04 + x * .125), s * .93, s * .06, s * .04); }
      g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.moveTo(s * .44, s * .4); g.lineTo(s * .6, s * .5); g.lineTo(s * .44, s * .6); g.fill(); }));
    for (let k = 0; k < 2; k++) slot('audio', k ? 'Audio: a spectrogram of speech' : 'Audio: a waveform', (g, s) => {
      panel(g, s, '#0f0c1c');
      if (k) { for (let x = 0; x < 48; x++) for (let y = 0; y < 32; y++) { const v = Math.max(0, Math.sin(x * .3 + y * .2) * Math.exp(-y / 14) + r() * .4 - .2); g.fillStyle = `hsla(${280 - v * 200},90%,${20 + v * 50}%,1)`; g.fillRect(x * s / 48, s - (y + 1) * s / 32, s / 48 + 1, s / 32 + 1); } }
      else { g.strokeStyle = '#62f5b0'; g.lineWidth = s * .012; g.beginPath(); for (let x = 0; x <= 120; x++) { const a = Math.sin(x * .25) * Math.sin(x * .031) * (.3 + .7 * r()); g.lineTo(x * s / 120, s * (.5 + a * .32)); } g.stroke(); }
    });
    ['∇θ L = ∂L/∂θ', 'σ(z) = 1 / (1 + e⁻ᶻ)', 'softmax(QKᵀ/√d)V'].forEach(f => slot('math', 'Maths: the language models are written in', (g, s) => {
      panel(g, s, '#0b1020'); g.font = `400 italic ${s * .1}px ${FONTS.serif}`; g.fillStyle = '#f4efe0'; const w = g.measureText(f).width; g.fillText(f, Math.max(s * .05, (s - w) / 2), s * .54); }));
    slot('detector', 'IHEP, Chinese Academy of Sciences, Beijing: where I work', (g, s) => cover(g, s, imgs['place-ihep']));
    slot('detector', 'LHAASO-WCDA: hits across the water pools (illustration)', (g, s) => {
      panel(g, s, '#060b14'); const R = s / 26;
      for (let y = 0; y < 15; y++) for (let x = 0; x < 13; x++) { const cx = s * .08 + x * R * 1.75 + (y % 2) * R * .87, cy = s * .08 + y * R * 1.5; const d = Math.hypot(cx - s * .58, cy - s * .45); const v = Math.exp(-d * d / (s * s * .02)) + (r() < .06 ? .5 : 0); g.fillStyle = v > .08 ? `hsla(${45 - v * 30},100%,${30 + v * 40}%,1)` : '#16233a'; g.beginPath(); g.arc(cx, cy, R * .6, 0, 7); g.fill(); }
    });
    slot('detector', 'An air shower reaching the LHAASO detector', (g, s) => cover(g, s, imgs['lhaaso-shower']));
    slot('detector', 'The LHAASO observatory', (g, s) => cover(g, s, imgs['place-lhaaso']));
    slot('detector', 'The CMS detector at CERN', (g, s) => cover(g, s, imgs['place-cms']));
    tex.needsUpdate = true;
  }
  const cards = SRC.map((s, i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 1.45), new THREE.ShaderMaterial({
      uniforms: { uAtlas: { value: tex }, uTile: { value: 0 }, uTile2: { value: 0 }, uMix: { value: 0 }, uOpacity: { value: 0 }, uHot: { value: 0 }, uCol: { value: s.col }, uG: { value: G } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: `
        uniform sampler2D uAtlas; uniform float uTile, uTile2, uMix, uOpacity, uHot, uG; uniform vec3 uCol; varying vec2 vUv;
        vec2 cell(float t) { return vec2(mod(t, uG), floor(t / uG)); }
        vec4 tile(float t) { vec2 c = cell(t); return texture2D(uAtlas, vec2((c.x + vUv.x) / uG, 1. - (c.y + 1. - vUv.y) / uG)); }
        void main() {
          vec4 a = mix(tile(uTile), tile(uTile2), uMix);
          vec2 q = abs(vUv - .5) * 2.; float edge = smoothstep(.9, .985, max(q.x, q.y));
          vec3 c = a.rgb * (.8 + uHot * .25) + uCol * edge * (.6 + uHot * 1.2);
          float al = a.a * uOpacity;
          gl_FragColor = vec4(c * al, al);
        }`,
      transparent: true, depthWrite: false, premultipliedAlpha: true
    }));
    m.position.copy(s.pos); scene.add(m);
    return { m, s, i, k: 0, hot: 0, next: 1 + i * .37 };
  });
  const srcLabels = SRC.map(s => ui.label('data', `<span class="tag">${s.name}<small>${s.sub}</small></span>`, (s.mine ? 'mint-lab ' : '') + 'src-lab left'));
  const tip = ui.label('data', '<span class="tag card-tip"></span>', 'plain tip-lab');
  // Hafiz in the streams: photo tags pinned beside the source they belong to.
  const story = (img, title, sub, href) => ui.label('data', `<span class="tag"><img src="../assets/showcase/${img}.webp" alt="">${href ? `<a href="${href}" target="_blank" rel="noopener">` : '<span>'}<b>${title}</b><small>${sub}</small>${href ? '<em>Read the paper ↗</em></a>' : '</span>'}</span>`, 'plain story-lab');
  const STORY = [
    { lab: story('geepower-site', 'GeePower Energy Technology', 'I built its website, database and all · 2021–22'), src: 0, at: [.28, .37], tile: 0 },
    { lab: story('place-ihep', 'IHEP Computing Center, CAS', 'where I work · research fellow since 2023'), src: 7, at: [.37, .46], tile: 0 },
    { lab: story('paper-compression', 'Lossless image compression for a synchrotron, with deep learning', 'co-author · Radiation Detection Technology and Methods, 2024', 'https://doi.org/10.1007/s41605-024-00490-9'), src: 7, at: [.46, .58], tile: 1 }
  ];
  const tipTxt = tip.el.querySelector('.card-tip');

  /* ---------- The gate: the tokenizer, framed exactly as the next scene opens ---------- */
  const gPts = [], gCol = [], gSeed = [];
  for (let k = 0; k < (small ? 2000 : 5000); k++) { const a = r() * Math.PI * 2, rr = GATE_R + (r() - .5) * (k % 4 ? .05 : .3); gPts.push(GATE.x + (r() - .5) * .06, Math.cos(a) * rr, Math.sin(a) * rr); const c = k % 6 ? PAL.cyan : PAL.white; gCol.push(c.r, c.g, c.b); gSeed.push(a, .022, 0, 1); }
  const gGeo = new THREE.BufferGeometry(); gGeo.setAttribute('position', new THREE.Float32BufferAttribute(gPts, 3)); gGeo.setAttribute('color', new THREE.Float32BufferAttribute(gCol, 3)); gGeo.setAttribute('aSeed', new THREE.Float32BufferAttribute(gSeed, 4));
  const gMat = additive({
    uniforms: { uTime: { value: 0 }, uPx: { value: 1000 }, uOpacity: { value: 0 } },
    vertexShader: `
      attribute vec3 color; attribute vec4 aSeed; uniform float uTime, uPx, uOpacity; varying vec3 vColor; varying float vAlpha;
      void main() { float a = aSeed.x + uTime * .35, R = length(position.yz); vec3 p = vec3(position.x, cos(a) * R, sin(a) * R);
        vec4 mv = modelViewMatrix * vec4(p, 1.); gl_Position = projectionMatrix * mv;
        float sweep = pow(.5 + .5 * sin(aSeed.x * 3. - uTime * 2.2), 14.);
        gl_PointSize = uPx * aSeed.y * (1. + sweep) / -mv.z; vColor = color * (.55 + sweep * 1.8); vAlpha = .5 * uOpacity; }`,
    fragmentShader: POINT_FRAG
  });
  scene.add(new THREE.Points(gGeo, gMat));
  const gateLab = ui.label('data', '<span class="tag">Tokenizer<small>where text becomes numbers</small></span>');

  /* ---------- Camera ---------- */
  const cpos = new THREE.Vector3(), cat = new THREE.Vector3();
  const START = { pos: W(new THREE.Vector3(1.7, .9, 8)), at: NET.clone() };
  const WIDE = { pos: new THREE.Vector3(-2.6, 1.6, 16.5), at: new THREE.Vector3(-4.2, .4, 0) };
  const END = { pos: GATE.clone().add(new THREE.Vector3(-1.2, .25, 3.4)), at: GATE.clone() };   // identical to the tokenizer's first frame
  function shot(p, t) {
    const portrait = camera.aspect < 1, k = portrait ? 1.25 : 1;
    const mixShot = (A, B, e) => { cpos.lerpVectors(A.pos, B.pos, e); cat.lerpVectors(A.at, B.at, e); };
    if (p < .12) mixShot(START, WIDE, easeInOut(p / .12));
    else if (p < .74) { mixShot(WIDE, WIDE, 0); cpos.x += Math.sin(t * .1) * .3; }
    else mixShot(WIDE, END, easeInOut((p - .74) / .24));
    if (p < .74 && portrait) cpos.sub(cat).multiplyScalar(k).add(cat);
    // Phones: roll a quarter turn so the sources sit on top and the network below; unroll for the gate.
    const roll = portrait ? 1 - sstep(.8, .96, p) : 0;
    camera.up.set(-roll, 1 - roll, 0).normalize();
  }

  let localP = 0, hot = -1;
  const bursts = new Array(NSTR).fill(0);

  return {
    id: 'data', scene, camera, extra: {},
    captions: [
      { at: [.03, .15], html: 'A network learns only from what it is shown.', x: 50, y: 13, cls: 'big wide', align: 'center' },
      { at: [.15, .28], html: 'Large models learn from a huge slice of the internet: <b>text, code, pictures, sound and video</b>.', x: 93, y: 16, cls: 'note', align: 'right' },
      { at: [.16, .28], html: `<span class="hint-dot"></span>${coarse ? 'Tap a source to see what it sends' : 'Hover a source to see what it sends · click to send more'}`, x: 50, y: 88, cls: 'hint', align: 'center' },
      { at: [.28, .37], html: 'One of those pages is mine: the <b>GeePower</b> website I built in 2021–22, database and all.', x: 93, y: 16, cls: 'note', align: 'right' },
      { at: [.37, .46], html: 'My own data comes from <b>particle detectors</b>: I build ML for LHAASO, CMS and CEPC at <b>IHEP</b> in Beijing.', x: 93, y: 16, cls: 'note', align: 'right' },
      { at: [.46, .58], html: 'LHAASO-WCDA alone has <b>3,120</b> sensors, each firing about <b>35,000</b> times a second. I also co-wrote a paper on compressing synchrotron images losslessly with deep learning.', x: 93, y: 16, cls: 'note', align: 'right' },
      { at: [.59, .73], html: 'Before it goes in, everything becomes <b>numbers</b>: pixels, sound and words alike.', x: 93, y: 16, cls: 'note', align: 'right' },
      { at: [.75, .9], html: 'Words are the trickiest. They pass through a <b>tokenizer</b>.', x: 50, y: 13, cls: 'big wide', align: 'center' }
    ],
    async init() {
      await buildAtlas();
      cards.forEach(c => { const list = byCat[c.s.cat] || [0]; c.list = list; c.m.material.uniforms.uTile.value = list[0]; c.m.material.uniforms.uTile2.value = list[1 % list.length]; });
    },
    resize(aspect) { camera.aspect = aspect; camera.updateProjectionMatrix(); },
    show(on) { if (!on) document.body.style.cursor = ''; },
    pointer(type) {
      if (localP > .74) return;
      let best = -1, bd = coarse ? 80 : 70;
      cards.forEach((c, i) => { if (c.m.material.uniforms.uOpacity.value < .3) return; const s = ui.screen(c.m.position, camera); const d = Math.hypot(s.x - pointer.x, s.y - pointer.y); if (d < bd) { bd = d; best = i; } });
      if (type === 'move') { if (best !== hot && best >= 0) score.sfx('hover', { pan: pointer.ndc.x * .5 }); hot = best; document.body.style.cursor = best >= 0 ? 'pointer' : ''; }
      if (type === 'down' && best >= 0) { hot = best; bursts[best] = 1; cards[best].next = 0; score.sfx('grow', { i: best, pan: -.4 }); }
    },
    update(p, info) {
      localP = p;
      const t = info.time, dt = info.dt, px = pixelScale(renderer, camera);
      [netMat, sMat, gMat].forEach(m => { m.uniforms.uTime.value = t; m.uniforms.uPx.value = px; });
      const outro = 1 - sstep(.84, .97, p);   // everything but the gate fades for the match cut
      // Sources appear one by one; their streams start; the matching input neurons light up.
      let flowing = 0;
      const webHi = window4(p, .3, .32, .35, .37);
      SRC.forEach((s, i) => {
        const on = sstep(s.at, s.at + .05, p) * outro, hi = s.mine ? window4(p, .38, .42, .52, .56) : i === 0 ? webHi : 0;
        SU.uOn.value[i] = on * (1 + hi * .8);
        bursts[i] = Math.max(0, bursts[i] - dt * .9); SU.uBoost.value[i] = bursts[i] + hi * .6;
        flowing += on;
        const c = cards[i], u = c.m.material.uniforms;
        c.hot = lerp(c.hot, hot === i ? 1 : 0, .15);
        u.uOpacity.value = on; u.uHot.value = c.hot + hi;
        c.m.scale.setScalar(1 + c.hot * .35 + hi * .2);
        // While a story is told, its card holds the picture that goes with it.
        const st = STORY.find(o => o.src === i && p > o.at[0] && p < o.at[1]);
        if (st && c.list) { const want = c.list[st.tile]; if (u.uTile2.value !== want) { c.k = st.tile; u.uTile.value = u.uTile2.value; u.uTile2.value = want; u.uMix.value = 0; } c.next = 1; }
        c.m.up.copy(camera.up); c.m.lookAt(camera.position);
        // Flip through samples: faster while hovered.
        c.next -= dt * (hot === i ? 2.2 : .45);
        if (c.next <= 0 && c.list) { c.next = 1; c.k = (c.k + 1) % c.list.length; u.uTile.value = u.uTile2.value; u.uTile2.value = c.list[c.k]; u.uMix.value = 0; }
        u.uMix.value = Math.min(1, u.uMix.value + dt * 2.5);
        if (u.uMix.value >= 1) u.uTile.value = u.uTile2.value;
      });
      for (let i = 0; i < 6; i++) feed[i] = Math.min(1.5, flowing * .12 + .25 * Math.max(0, Math.sin(t * 3 + i * 1.3)) * Math.min(1, flowing) + (bursts.reduce((a, b) => a + b, 0) > .1 ? .6 : 0));
      netMat.uniforms.uFlow.value = Math.min(1, flowing / 4);
      netMat.uniforms.uOpacity.value = outro; netGlow.material.opacity = .08 * outro;
      gMat.uniforms.uOpacity.value = sstep(.5, .64, p);
      // Camera.
      shot(p, t);
      camera.position.copy(cpos);
      if (pointer.inside && !coarse && p < .74) { camera.position.x += pointer.ndc.x * .6; camera.position.y += pointer.ndc.y * .4; }
      camera.lookAt(cat);
      // Labels.
      const act = info.active;
      SRC.forEach((s, i) => ui.place(srcLabels[i], s.pos.clone().add(new THREE.Vector3(-.95, 0, 0)), camera, act && p > s.at + .02 && p < .74));
      if (hot >= 0) tipTxt.textContent = tiles[cards[hot].list ? cards[hot].list[cards[hot].k] : 0].desc;
      ui.place(tip, hot >= 0 ? cards[hot].m.position.clone().add(new THREE.Vector3(0, 1.3, 0)) : GATE, camera, act && hot >= 0 && p < .74);
      ui.place(gateLab, GATE.clone().add(new THREE.Vector3(0, GATE_R + .45, 0)), camera, act && p > .58 && p < .86);
      const portrait = camera.aspect < 1;
      STORY.forEach(o => { const c = cards[o.src]; ui.place(o.lab, portrait ? new THREE.Vector3(0, .1, GATE.clone().project(camera).z).unproject(camera) : c.m.position.clone().add(new THREE.Vector3(1.05, o.src === 7 ? .45 : 0, 0)), camera, act && p > o.at[0] && p < o.at[1]); o.lab.el.classList.toggle('below', portrait); });
    }
  };
}
