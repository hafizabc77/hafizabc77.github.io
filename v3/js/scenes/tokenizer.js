/* Act II, scene 6: the tokenizer, then the space of meaning.
   One sentence at a time flies into the gate and shatters into numbered tokens (never overlapping). Type anything:
   your name, or a word in English, Amharic or Mandarin, and see it tokenized; dictionary words appear in all three languages.
   The tokens become vectors in a real 3D space with axes, the famous king − man + woman ≈ queen, and finally the
   many-dimensional cloud of meaning, where Hafiz's own interests sit close together. */
import * as THREE from 'three';
import { additive, POINT_FRAG, PAL, col, rng, unitVector, gaussian, sstep, clamp, lerp, easeInOut, easeOut, pixelScale, textTexture, glowSprite, FONTS, window4 } from '../core/util.js';
import { GATE_R } from './data.js';

/* A small trilingual dictionary. */
const DICT = [
  { en: 'hello', am: 'ሰላም', zh: '你好' }, { en: 'hi', am: 'ሰላም', zh: '嗨' }, { en: 'peace', am: 'ሰላም', zh: '和平' }, { en: 'thank you', am: 'አመሰግናለሁ', zh: '谢谢' },
  { en: 'love', am: 'ፍቅር', zh: '爱' }, { en: 'friend', am: 'ጓደኛ', zh: '朋友' }, { en: 'family', am: 'ቤተሰብ', zh: '家庭' }, { en: 'world', am: 'ዓለም', zh: '世界' },
  { en: 'Beijing', am: 'ቤጂንግ', zh: '北京' }, { en: 'China', am: 'ቻይና', zh: '中国' }, { en: 'learn', am: 'መማር', zh: '学习' }, { en: 'data', am: 'መረጃ', zh: '数据' },
  { en: 'model', am: 'ሞዴል', zh: '模型' }, { en: 'computer', am: 'ኮምፒዩተር', zh: '电脑' }, { en: 'physics', am: 'ፊዚክስ', zh: '物理' }, { en: 'light', am: 'ብርሃን', zh: '光' },
  { en: 'volleyball', am: 'ቮሊቦል', zh: '排球' }, { en: 'football', am: 'እግር ኳስ', zh: '足球' }, { en: 'music', am: 'ሙዚቃ', zh: '音乐' }, { en: 'one', am: 'አንድ', zh: '一' }
];
const LANES = [{ key: 'en', name: 'English', y: 1.2 }, { key: 'am', name: 'አማርኛ · Amharic', y: 0 }, { key: 'zh', name: '中文 · Mandarin', y: -1.2 }];
const DEMO = [{ text: 'Hi, I’m Hafiz.' }, { word: 'hello' }, { text: 'I make big models run fast.' }, { word: 'volleyball' }];

/* An illustrative tokenizer: words and punctuation; long English words split at common suffixes; Chinese and
   Amharic split by character, as byte-level tokenizers often do for less common scripts. */
const SUFFIX = ['ization', 'ation', 'izer', 'ence', 'ing', 'tion', 'ness', 'ment', 'able', 'ball', 'ive', 'ers', 'ed', 'er', 'ly'];
function tokenize(text) {
  const out = [];
  (text.match(/[\p{L}\p{M}\p{N}]+|[^\s\p{L}\p{M}\p{N}]/gu) || []).forEach((w, i) => {
    if (/[一-鿿]/.test(w) || /[ሀ-፿]/.test(w)) { [...w].forEach(ch => out.push(ch)); return; }
    const sp = i > 0 && /\p{L}/u.test(w) ? '·' : '';
    if (w.length > 6) { const s = SUFFIX.find(x => w.toLowerCase().endsWith(x) && w.length - x.length >= 3); if (s) { out.push(sp + w.slice(0, -s.length), w.slice(-s.length)); return; } if (w.length > 9) { out.push(sp + w.slice(0, 5), w.slice(5)); return; } }
    out.push(sp + w);
  });
  return out;
}
const tokenId = s => { let h = 2166136261; for (const ch of s) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return 1000 + ((h >>> 0) % 49000); };
const lookup = q => { const s = q.trim().toLowerCase(); return DICT.find(d => d.en.toLowerCase() === s || d.am === q.trim() || d.zh === q.trim()); };

/* The 3D space of meaning: hand-placed so the geometry tells the truth about meaning. */
const O = new THREE.Vector3(15, 0, 0);
const VECS = [
  { w: 'hello', p: [2.4, 1.45, .7], g: 'hi' }, { w: 'ሰላም', p: [2.25, 1.6, .55], g: 'hi' }, { w: '你好', p: [2.5, 1.3, .9], g: 'hi' },
  { w: 'peace', p: [1.4, 2.3, .2], g: 'peace' }, { w: '和平', p: [1.3, 2.45, .35], g: 'peace' },
  { w: 'friend', p: [-.6, 1.8, 1.8], g: 'people' }, { w: 'love', p: [-.2, 2.2, 1.5], g: 'people' },
  { w: 'king', p: [2.1, -.6, -1.7], g: 'royal' }, { w: 'man', p: [.7, -1.5, -.6], g: 'royal' }, { w: 'woman', p: [.7, -.35, -1.55], g: 'royal' }, { w: 'queen', p: [2.1, .55, -2.65], g: 'royal' }
];
const GROUP_COL = { hi: PAL.goldHi, peace: PAL.mint, people: PAL.rose, royal: PAL.cyan };
/* The big cloud: clusters of meaning, and Hafiz's own corner of it. */
const CLOUD = [
  { name: 'greetings', col: PAL.goldHi, at: [3.2, 2, 1], words: ['hello', 'hi', 'ሰላም', '你好', 'good morning'] },
  { name: 'science', col: PAL.cyan, at: [-3.6, 2.4, -2], words: ['physics', 'particle', 'gamma ray', 'detector', '物理'] },
  { name: 'computing', col: PAL.violet, at: [-1.4, -3, 2.6], words: ['GPU', 'FPGA', 'compiler', 'kernel', 'tensor'] },
  { name: 'sport', col: PAL.amber, at: [4.6, -2.2, -2.4], words: ['volleyball', 'badminton', 'Spurs', 'swimming', '排球'] },
  { name: 'music', col: PAL.rose, at: [-4.4, -1, 3.6], words: ['song', 'melody', 'ሙዚቃ', '音乐', 'rhythm'] },
  { name: 'curiosity', col: PAL.mint, at: [.6, .4, -4.4], words: ['curiosity', 'intelligence', 'consciousness', 'the universe', 'why?'], mine: true }
];

export default function tokenizer(ctx) {
  const { small, ui, score, pointer, renderer, coarse } = ctx;
  const scene = new THREE.Scene();
  scene.background = col('#03040c');
  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, .05, 300);
  const r = rng(321);
  const phone = () => camera.aspect < 1;

  /* ---------- The gate ---------- */
  const gPts = [], gSeed = [], gCol = [];
  for (let k = 0; k < (small ? 2000 : 5000); k++) { const a = r() * Math.PI * 2, rr = GATE_R + (r() - .5) * (k % 4 ? .05 : .3); gPts.push((r() - .5) * .06, Math.cos(a) * rr, Math.sin(a) * rr); gSeed.push(a, .022, 0, 1); const c = k % 6 ? PAL.cyan : PAL.white; gCol.push(c.r, c.g, c.b); }
  const gGeo = new THREE.BufferGeometry(); gGeo.setAttribute('position', new THREE.Float32BufferAttribute(gPts, 3)); gGeo.setAttribute('aSeed', new THREE.Float32BufferAttribute(gSeed, 4)); gGeo.setAttribute('color', new THREE.Float32BufferAttribute(gCol, 3));
  const gMat = additive({
    uniforms: { uTime: { value: 0 }, uPx: { value: 1000 }, uHit: { value: 0 }, uOpacity: { value: 1 } },
    vertexShader: `
      attribute vec3 color; attribute vec4 aSeed; uniform float uTime, uPx, uHit, uOpacity; varying vec3 vColor; varying float vAlpha;
      void main() { float a = aSeed.x + uTime * .35, R = length(position.yz); vec3 p = vec3(position.x, cos(a) * R, sin(a) * R);
        vec4 mv = modelViewMatrix * vec4(p, 1.); gl_Position = projectionMatrix * mv;
        float sweep = pow(.5 + .5 * sin(aSeed.x * 3. - uTime * 2.2), 14.) + uHit;
        gl_PointSize = uPx * aSeed.y * (1. + sweep) / -mv.z; vColor = color * (.55 + sweep * 1.8); vAlpha = .5 * uOpacity; }`,
    fragmentShader: POINT_FRAG
  });
  scene.add(new THREE.Points(gGeo, gMat));

  /* ---------- The stage: one utterance at a time ---------- */
  const items = [];
  const plane = new THREE.PlaneGeometry(1, 1);
  const mesh = (tt, h) => { const m = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: tt.texture, transparent: true, depthWrite: false, opacity: 0 })); m.scale.set(h * tt.aspect, h, 1); m.userData.tex = tt.texture; scene.add(m); return m; };
  const drop = it => { scene.remove(it.m); it.m.material.dispose(); if (it.m.userData.tex) it.m.userData.tex.dispose(); };
  const laneTitles = LANES.map(L => ui.label('tok', `<span class="tag">${L.name}<small class="tc"></small></span>`, 'left lane-lab'));
  const freeNote = ui.label('tok', '<span class="tag free-note"></span>', 'plain');
  let stage = null, stageAt = -99, lastUser = -99, demoIdx = 0;

  function clearStage() { items.forEach(it => { it.leave = ctx.time; }); stage = null; }
  function vecTexture() {   // a tiny barcode: a token's vector, in eight coloured cells
    const c = document.createElement('canvas'); c.width = 160; c.height = 20; const g = c.getContext('2d');
    for (let i = 0; i < 8; i++) { const v = r(); g.fillStyle = `hsl(${180 + v * 160},85%,${35 + v * 35}%)`; g.fillRect(i * 20 + 1, 2, 18, 16); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function sendLine(text, lane, y, delay, dict) {
    const tt = textTexture(text, { size: 84, font: lane === 1 ? FONTS.sans : FONTS.serif, weight: 400, color: '#f4efe0' });
    const m = mesh(tt, phone() ? .36 : .44);
    items.push({ kind: 'strip', m, text, lane, y, t0: ctx.time + delay, dur: 1.3, dict });
  }
  function shatter(it) {
    const toks = tokenize(it.text), maxW = phone() ? 4.2 : 5.6, h = it.lane >= 0 && it.dict ? .58 : .54, x0 = phone() ? .5 : 1.05;
    let x = x0, y = it.y;
    toks.forEach((tk, k) => {
      const tt = textTexture(tk.replace('·', ' '), { size: 64, font: FONTS.mono, weight: 400, color: '#fff', bg: 'rgba(16,22,46,.94)', border: it.dict ? 'rgba(255,214,140,.9)' : 'rgba(110,200,255,.8)', sub: `#${tokenId(tk)}`, subColor: 'rgba(160,200,255,.85)', pad: .32 });
      const m = mesh(tt, h), w = h * tt.aspect;
      if (x + w > x0 + maxW) { x = x0; y -= h + .32; }
      const slot = new THREE.Vector3(x + w / 2, y, 0); x += w + .12;
      const bar = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: vecTexture(), transparent: true, depthWrite: false, opacity: 0 }));
      bar.scale.set(Math.min(w * .82, .9), .1, 1); scene.add(bar);
      items.push({ kind: 'chip', m, bar, slot, t0: ctx.time + k * .07, y: it.y, spin: (r() - .5) * 2 });
    });
    if (it.lane >= 0 && it.dict) laneTitles[it.lane].el.querySelector('.tc').textContent = `${toks.length} token${toks.length > 1 ? 's' : ''}`;
    if (!it.dict) { freeNote.el.querySelector('.free-note').textContent = `That’s ${toks.length} token${toks.length > 1 ? 's' : ''} to a model.`; freeNote.pos = new THREE.Vector3(x0 + 1.4, y - .75, 0); freeNote.until = ctx.time + 5; }
    gMat.uniforms.uHit.value = 1; toks.forEach((_, k) => setTimeout(() => score.sfx('tick', { pan: .3 }), k * 70));
  }
  function present(q, byUser) {
    q = (q || '').trim().slice(0, 40); if (!q) return;
    clearStage();
    const d = lookup(q);
    stage = { d, text: q, at: ctx.time };
    stageAt = ctx.time;
    if (d) LANES.forEach((L, k) => sendLine(d[L.key], k, L.y, .25 + k * .35, true));
    else sendLine(q, 0, 0, .25, false);
    if (byUser) lastUser = ctx.time;
  }

  /* ---------- The prompt ---------- */
  const form = document.createElement('form');
  form.className = 'tok-form'; form.autocomplete = 'off';
  form.innerHTML = `<div class="tok-head"><span class="tok-dot"></span><b>Your turn.</b> Type a word, a sentence, or your name.</div>
    <div class="tok-row"><span class="tok-caret">›</span><input id="tok-in" maxlength="40" spellcheck="false" aria-label="Text to tokenize"><span class="tok-ph" aria-hidden="true"></span><button type="submit" class="tok-go">Tokenize <kbd>↵</kbd></button></div>
    <div class="tok-chips"><span>Try</span>${['hello', 'peace', 'ሰላም', '你好', 'volleyball', 'thank you'].map(w => `<button type="button">${w}</button>`).join('')}</div>
    <p class="tok-note">English, አማርኛ and 中文 · token IDs here are illustrative</p>`;
  ctx.$('#scene-ui').append(form);
  const input = form.querySelector('input'), ph = form.querySelector('.tok-ph');
  form.addEventListener('submit', e => { e.preventDefault(); present(input.value, true); input.value = ''; ph.style.opacity = 1; score.sfx('pop'); });
  form.querySelectorAll('.tok-chips button').forEach(b => b.addEventListener('click', () => { present(b.textContent, true); score.sfx('pop'); }));
  input.addEventListener('input', () => { ph.style.opacity = input.value ? 0 : 1; if (input.value) score.sfx('tick'); });
  input.addEventListener('focus', () => form.classList.add('focus')); input.addEventListener('blur', () => form.classList.remove('focus'));
  const PH = ['your name', 'hello', 'ሰላም', '你好', 'I love volleyball', 'peace'];
  let phI = 0, phC = 0, phDir = 1, phNext = 0;
  const tickPlaceholder = t => { if (t < phNext) return; const w = PH[phI]; phC += phDir; if (phC > w.length + 6) phDir = -1; if (phC < 0) { phC = 0; phDir = 1; phI = (phI + 1) % PH.length; } ph.textContent = [...w].slice(0, Math.min(phC, w.length)).join('') + '▏'; phNext = t + (phDir > 0 ? .09 : .04); };

  /* ---------- The space of meaning ---------- */
  const space = new THREE.Group(); space.position.copy(O); scene.add(space);
  const vPts = [], vCol = [], vInfo = [];   // info: phase, u, size, rnd
  const line = (a, b, n, c, phase, size = .018) => { for (let k = 0; k < n; k++) { const u = (k + r() * .9) / n; vPts.push(lerp(a.x, b.x, u), lerp(a.y, b.y, u), lerp(a.z, b.z, u)); vCol.push(c.r, c.g, c.b); vInfo.push(phase, u, size, r()); } };
  // Axes with ticks, and a faint floor grid.
  const AX = [[new THREE.Vector3(1, 0, 0), PAL.cyan, 'dimension 1'], [new THREE.Vector3(0, 1, 0), PAL.goldHi, 'dimension 2'], [new THREE.Vector3(0, 0, 1), PAL.rose, 'dimension 3']];
  AX.forEach(([d, c]) => { line(d.clone().multiplyScalar(-3.4), d.clone().multiplyScalar(3.4), 520, c, 0, .02); for (let t = -3; t <= 3; t++) if (t) { const o = d.clone().multiplyScalar(t), s = (d.x ? new THREE.Vector3(0, .09, 0) : new THREE.Vector3(.09, 0, 0)); line(o.clone().sub(s), o.clone().add(s), 10, c, 0, .016); } });
  for (let g = -3; g <= 3; g++) { line(new THREE.Vector3(-3.4, -3.4 * 0 - 0, g).setY(-.002), new THREE.Vector3(3.4, 0, g), 90, PAL.blue.clone().multiplyScalar(.5), 1, .01); line(new THREE.Vector3(g, 0, -3.4), new THREE.Vector3(g, 0, 3.4), 90, PAL.blue.clone().multiplyScalar(.5), 1, .01); }
  // Word vectors as arrows from the origin.
  VECS.forEach(v => { v.pos = new THREE.Vector3(...v.p); line(new THREE.Vector3(), v.pos, 160, GROUP_COL[v.g], v.g === 'royal' ? 3 : 2, .022); });
  // The analogy path: king → (king − man) → + woman = queen.
  const king = VECS.find(v => v.w === 'king').pos, man = VECS.find(v => v.w === 'man').pos, woman = VECS.find(v => v.w === 'woman').pos;
  const kMinus = king.clone().sub(man);
  line(king, kMinus, 120, PAL.white, 4, .02); line(kMinus, kMinus.clone().add(woman), 120, PAL.white, 5, .02);
  // Many more dimensions, then the cloud.
  for (let k = 0; k < 22; k++) { const d = unitVector(r); line(d.clone().multiplyScalar(-4.5), d.clone().multiplyScalar(4.5), 260, PAL.violet.clone().lerp(PAL.cyan, r()).multiplyScalar(.6), 6 + k / 22 * .5, .014); }
  CLOUD.forEach(cl => { const c0 = new THREE.Vector3(...cl.at); for (let k = 0; k < (small ? 220 : 480); k++) { const p = c0.clone().add(new THREE.Vector3(gaussian(r) * .9, gaussian(r) * .8, gaussian(r) * .9)); vPts.push(p.x, p.y, p.z); const c = cl.col; vCol.push(c.r, c.g, c.b); vInfo.push(7 + r() * .4, 0, .03 + r() * .03, r()); } });
  for (let k = 0; k < (small ? 500 : 1400); k++) { const p = unitVector(r).multiplyScalar(2 + r() * 6); vPts.push(p.x, p.y, p.z); vCol.push(.5, .5, .65); vInfo.push(7.2 + r() * .4, 0, .02 + r() * .02, r()); }
  const vGeo = new THREE.BufferGeometry();
  vGeo.setAttribute('position', new THREE.Float32BufferAttribute(vPts, 3)); vGeo.setAttribute('color', new THREE.Float32BufferAttribute(vCol, 3)); vGeo.setAttribute('aInfo', new THREE.Float32BufferAttribute(vInfo, 4));
  vGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 20);
  const VU = { uTime: { value: 0 }, uPx: { value: 1000 }, uStage: { value: 0 }, uHi: { value: -1 } };
  const vMat = additive({
    uniforms: VU,
    vertexShader: `
      attribute vec3 color; attribute vec4 aInfo; uniform float uTime, uPx, uStage, uHi;
      varying vec3 vColor; varying float vAlpha;
      void main() {
        float ph = aInfo.x, u = aInfo.y;
        // Each element draws itself when the space reaches its phase: lines grow from one end to the other.
        float show = clamp((uStage - ph) * 1.6, 0., 1.);
        float grow = step(u, clamp((uStage - ph) * 1.4, 0., 1.)) * (ph < 6.95 && ph > .5 ? 1. : 1.);
        float a = (ph >= 7. ? show : grow * show);
        if (ph > 3.5 && ph < 5.5) a *= 1. - smoothstep(6.2, 7., uStage) * .7;        // the analogy fades once more dimensions arrive
        if (ph < 1.5) a *= 1. - smoothstep(6.5, 7.6, uStage) * .65;                  // and so do the 3 axes
        vec3 p = position + (ph >= 7. ? .04 * vec3(sin(uTime * .5 + aInfo.w * 30.), cos(uTime * .4 + aInfo.w * 20.), 0.) : vec3(0.));
        vec4 mv = modelViewMatrix * vec4(p, 1.); gl_Position = projectionMatrix * mv;
        float tw = ph >= 7. ? pow(fract(aInfo.w * 7.3 + uTime * .2), 30.) * 1.4 : 0.;
        gl_PointSize = uPx * aInfo.z * (1. + tw) / -mv.z;
        vColor = color * (.8 + tw); vAlpha = a * .6;
      }`,
    fragmentShader: POINT_FRAG
  });
  space.add(new THREE.Points(vGeo, vMat));
  // Tips, labels and the travelling point for the analogy.
  const tipGlows = VECS.map(v => { const g = glowSprite(GROUP_COL[v.g], .35, 0); g.position.copy(v.pos); space.add(g); return g; });
  const runner = glowSprite(PAL.white, .5, 0); space.add(runner);
  const axisLabels = AX.map(([, , n]) => ui.label('tok', `<span class="tag">${n}</span>`, 'plain axis-lab'));
  const vecLabels = VECS.map(v => ui.label('tok', `<span class="tag word-tag g-${v.g}">${v.w}</span>`, 'plain word-lab'));
  const opLabel = ui.label('tok', '<span class="tag op-tag">king − man + woman ≈ queen</span>', 'plain');
  const cloudWords = [];
  // Each cluster's words sit on a small ring around its centre, so their labels never pile up.
  CLOUD.forEach(cl => cl.words.forEach((w, i) => { const a = i / cl.words.length * Math.PI * 2 + .4, R = cl.mine ? 1.45 : 1.05; const p = new THREE.Vector3(...cl.at).add(new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R * .8, Math.sin(a * 2) * .35)); cloudWords.push({ w, p, cl, lab: ui.label('tok', `<span class="tag cloud-tag${cl.mine ? ' mine' : ''}">${w}</span>`, 'plain word-lab') }); }));
  const clusterLabels = CLOUD.map(cl => ui.label('tok', `<span class="tag">${cl.name}</span>`, 'plain cluster-lab'));
  const linkGeo = new THREE.BufferGeometry(); linkGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6 * 8), 3)); linkGeo.setDrawRange(0, 0);
  const links = new THREE.LineSegments(linkGeo, new THREE.LineBasicMaterial({ color: PAL.mint, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false })); space.add(links);
  let hotWord = -1, dragX = null, rotY = 0, rotV = 0;

  /* ---------- Camera ---------- */
  const cpos = new THREE.Vector3(), cat = new THREE.Vector3();
  function shot(p, t) {
    const ph = phone(), k = ph ? Math.min(2.4, 1.05 / camera.aspect) : 1;
    const A = { pos: new THREE.Vector3(-1.2, .25, 3.4), at: new THREE.Vector3(0, 0, 0) };
    const B = ph ? { pos: new THREE.Vector3(2.5, .2, 14.5), at: new THREE.Vector3(2.4, -.3, 0) } : { pos: new THREE.Vector3(-1.9, .8, 8), at: new THREE.Vector3(1.6, -.2, 0) };
    const V1 = { pos: O.clone().add(new THREE.Vector3(4.2, 3.4, 9.5).multiplyScalar(k)), at: O.clone().add(new THREE.Vector3(.9, .5, -.4)) };
    const V2 = { pos: O.clone().add(new THREE.Vector3(4.6, 4.2, 13).multiplyScalar(k)), at: O.clone().add(new THREE.Vector3(0, 0, -.8)) };
    const lerpShot = (X, Y, e) => { cpos.lerpVectors(X.pos, Y.pos, e); cat.lerpVectors(X.at, Y.at, e); };
    if (p < .07) lerpShot(A, B, easeInOut(p / .07));
    else if (p < .42) { lerpShot(B, B, 0); cpos.x += Math.sin(t * .2) * .12; }
    else if (p < .52) lerpShot(B, V1, easeInOut((p - .42) / .1));
    else if (p < .8) lerpShot(V1, V1, 0);
    else if (p < .88) lerpShot(V1, V2, easeInOut((p - .8) / .08));
    else lerpShot(V2, V2, 0);
  }

  let localP = 0;

  return {
    id: 'tok', scene, camera, extra: {},
    captions: [
      { at: [.06, .17], html: 'A <b>tokenizer</b> cuts text into pieces, tokens, and numbers each one.', x: 93, y: 15, cls: 'term', align: 'right' },
      { at: [.18, .3], html: 'I speak <b>English</b>, <b>Amharic</b> and <b>Mandarin</b> <i>(still learning)</i>. So this tokenizer does too.', x: 93, y: 15, cls: 'term', align: 'right' },
      { at: [.31, .42], html: 'Models write one token at a time. Making that <b>faster</b> is much of my work: up to <b>3.03×</b>.', x: 93, y: 15, cls: 'term', align: 'right' },
      { at: [.44, .6], html: 'Each token becomes a <b>vector</b>: an arrow in a space of meaning. Similar meanings point the same way.', x: 7, y: 15, cls: 'note' },
      { at: [.53, .66], html: `<span class="hint-dot"></span>${coarse ? 'Swipe to turn the space' : 'Drag to turn the space · hover a word'}`, x: 50, y: 88, cls: 'hint', align: 'center' },
      { at: [.63, .79], html: 'In 2013, <b>word2vec</b> showed meaning has direction: <i>king − man + woman</i> lands next to <i>queen</i>.', x: 7, y: 15, cls: 'note' },
      { at: [.79, .86], html: 'Real models use hundreds or thousands of dimensions.', x: 50, y: 12, cls: 'big wide', align: 'center' },
      { at: [.86, .93], html: 'For me, a few words have always sat close together: <b>curiosity, intelligence, the universe</b>.', x: 7, y: 15, cls: 'note' },
      { at: [.91, 1.05], html: 'Next: the machine that reads these vectors.', x: 50, y: 82, cls: 'note center-note', align: 'center' }
    ],
    resize(aspect) { camera.aspect = aspect; camera.updateProjectionMatrix(); },
    show(on) { if (!on) { form.classList.remove('on'); document.body.style.cursor = ''; } },
    pointer(type, e) {
      if (localP < .5) return;
      if (type === 'down') dragX = pointer.x;
      if (type === 'up') dragX = null;
      if (type === 'move') {
        if (dragX !== null && pointer.down) { rotV = (pointer.x - dragX) * .004; dragX = pointer.x; }
        // Hover a word: its nearest neighbours light up.
        let best = -1, bd = 34;
        const list = localP > .82 ? cloudWords.map(c => c.p) : VECS.map(v => v.pos);
        list.forEach((p, i) => { const s = ui.screen(space.localToWorld(p.clone()), camera); const d = Math.hypot(s.x - pointer.x, s.y - pointer.y); if (d < bd) { bd = d; best = i; } });
        if (best !== hotWord && best >= 0) score.sfx('hover');
        hotWord = best;
        document.body.style.cursor = dragX !== null ? 'grabbing' : best >= 0 ? 'pointer' : 'grab';
      }
    },
    update(p, info) {
      localP = p;
      const t = info.time, px = pixelScale(renderer, camera);
      gMat.uniforms.uTime.value = t; gMat.uniforms.uPx.value = px; vMat.uniforms.uTime.value = t; vMat.uniforms.uPx.value = px;
      gMat.uniforms.uHit.value *= Math.pow(.05, info.dt);
      tickPlaceholder(t);
      // The film runs its own examples when the visitor isn't typing; one at a time.
      const idle = t - stageAt > (stage && stage.d ? 6.5 : 5) && t - lastUser > 9;
      if (info.active && p > .05 && p < .42 && idle) { const d = DEMO[demoIdx++ % DEMO.length]; present(d.word || d.text, false); }
      // Animate the stage.
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i], age = t - it.t0;
        if (it.leave) { const f = clamp((t - it.leave) / .35); it.m.material.opacity *= 1 - f; if (it.bar) it.bar.material.opacity *= 1 - f; it.m.position.z -= info.dt * 2; if (f >= 1) { drop(it); if (it.bar) { scene.remove(it.bar); it.bar.material.map.dispose(); it.bar.material.dispose(); } items.splice(i, 1); } continue; }
        if (it.kind === 'strip') {
          if (age < 0) { it.m.material.opacity = 0; continue; }
          const e = clamp(age / it.dur);
          it.m.position.set(lerp(-8.5, -it.m.scale.x / 2 - .15, easeOut(e)), it.y, 0);
          it.m.material.opacity = sstep(0, .15, e);
          if (e >= 1) { shatter(it); drop(it); items.splice(i, 1); }
        } else if (it.kind === 'chip') {
          if (age < 0) { it.m.material.opacity = 0; it.m.position.set(0, it.y, 0); continue; }
          const e = easeOut(clamp(age / .7));
          it.m.position.set(lerp(0, it.slot.x, e), lerp(it.y, it.slot.y, e) + Math.sin(e * Math.PI) * .22 * it.spin, Math.sin(e * Math.PI) * .6);
          it.m.rotation.y = (1 - e) * it.spin * 1.4;
          it.m.material.opacity = sstep(0, .15, age);
          it.bar.position.set(it.m.position.x, it.m.position.y - it.m.scale.y * .62, it.m.position.z);
          it.bar.material.opacity = sstep(.5, .9, age) * .9;
          // Moving on to the vectors: chips flatten into their barcodes and fly off to the space.
          const go = sstep(.42, .5, p);
          if (go > 0) { it.m.material.opacity *= 1 - go; it.bar.position.lerp(O, go * .08); it.bar.scale.y = .1 + go * .1; it.bar.material.opacity *= 1 - sstep(.47, .53, p); }
        }
      }
      gMat.uniforms.uOpacity.value = 1 - sstep(.45, .55, p);
      // The space of meaning builds itself in stages.
      const st = p < .44 ? 0 : p < .5 ? (p - .44) / .06 * 1.2 : p < .56 ? 1.2 + (p - .5) / .06 * 1.8 : p < .63 ? 3 : p < .75 ? 3 + (p - .63) / .12 * 2.6 : p < .8 ? 5.6 : p < .9 ? 5.6 + (p - .8) / .1 * 2 : 7.6 + (p - .9) * 4;
      VU.uStage.value = st;
      rotV *= Math.pow(.15, info.dt); rotY += rotV + (dragX === null ? info.dt * .05 * (p > .5 ? 1 : 0) : 0);
      space.rotation.y = rotY;
      VECS.forEach((v, i) => { tipGlows[i].material.opacity = clamp((st - (v.g === 'royal' ? 3 : 2)) * 1.4) * (1 - sstep(6.2, 7, st) * .8) * (hotWord === i && p < .82 ? 1.6 : .8); });
      // The analogy: a point travels king → king − man → + woman, arriving at queen.
      const an = clamp((st - 4) / 1.6);
      runner.material.opacity = an > 0 && an < 1 ? 1 : 0;
      if (an > 0) runner.position.copy(an < .5 ? king.clone().lerp(kMinus, an * 2) : kMinus.clone().lerp(kMinus.clone().add(woman), (an - .5) * 2));
      // Neighbours of the hovered word.
      const la = linkGeo.attributes.position.array; let nl = 0;
      if (hotWord >= 0) {
        const src = p > .82 ? cloudWords : VECS.map(v => ({ p: v.pos }));
        const me = src[hotWord].p, near = src.map((o, i) => ({ i, d: o.p.distanceTo(me) })).filter(o => o.i !== hotWord).sort((a, b) => a.d - b.d).slice(0, 3);
        near.forEach(o => { la.set([me.x, me.y, me.z, src[o.i].p.x, src[o.i].p.y, src[o.i].p.z], nl * 6); nl++; });
      }
      linkGeo.attributes.position.needsUpdate = true; linkGeo.setDrawRange(0, nl * 2);
      // Camera.
      shot(p, t);
      camera.position.copy(cpos);
      if (pointer.inside && !coarse && p < .44) { camera.position.x += pointer.ndc.x * .3; camera.position.y += pointer.ndc.y * .2; }
      camera.lookAt(cat);
      // Words.
      const act = info.active;
      form.classList.toggle('on', act && p > .07 && p < .43);
      const lanesOn = act && stage && stage.d && t - stage.at > .3 && p < .44;
      LANES.forEach((L, k) => ui.place(laneTitles[k], new THREE.Vector3(-GATE_R - .3, L.y, 0), camera, lanesOn));
      ui.place(freeNote, freeNote.pos || new THREE.Vector3(), camera, act && freeNote.until > t && p < .44);
      AX.forEach(([d], i) => ui.place(axisLabels[i], space.localToWorld(d.clone().multiplyScalar(3.7)), camera, act && st > .9 && st < 7));
      VECS.forEach((v, i) => ui.place(vecLabels[i], space.localToWorld(v.pos.clone().add(new THREE.Vector3(0, .22, 0))), camera, act && st > (v.g === 'royal' ? 3.3 : 2.3) && st < 6.6));
      ui.place(opLabel, space.localToWorld(kMinus.clone().add(woman).add(new THREE.Vector3(0, -.5, 0))), camera, act && st > 5.2 && st < 6.4);
      cloudWords.forEach((c, i) => ui.place(c.lab, space.localToWorld(c.p.clone()), camera, act && st > 7.4 && (c.cl.mine || p < .88 || hotWord === i)));
      CLOUD.forEach((cl, i) => ui.place(clusterLabels[i], space.localToWorld(new THREE.Vector3(...cl.at).add(new THREE.Vector3(0, 1.5, 0))), camera, act && st > 7.6));
    }
  };
}
