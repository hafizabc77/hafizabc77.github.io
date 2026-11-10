/* Act III, scene 8: run it. The sentence "I make big models run" flows up through six glass blocks (a forward pass);
   each block shows what its attention is doing. At the top the last token becomes a probability for every word the
   model knows. Untrained, it guesses badly: the right word, "fast", gets 4%. The loss measures the surprise, and
   backpropagation sends red light back down through every block. Then you train it, one step at a time, and watch
   "fast" win. */
import * as THREE from 'three';
import { additive, POINT_FRAG, col, rng, gaussian, sstep, clamp, lerp, easeInOut, pixelScale, glowTexture } from '../core/util.js';
import { cells, slab, heat, floor, motes } from '../core/glass.js';
import { TOKENS, D } from './transformer.js';

const NL = 6, NT = TOKENS.length;
const VOCAB = ['fast', 'slowly', 'home', 'away', 'banana', 'models', 'the', 'well'];
const P0 = [.04, .12, .16, .13, .19, .11, .14, .11];            // the untrained guess (sums to 1); "fast" is the truth
const LAYER_NOTES = ['mostly the word right before', 'small grammar patterns', 'which words belong together', 'who is doing what', 'what the sentence is about', 'what could come next'];
const TEAL = col('#2fe0b4'), RED = col('#ff4a5a');

export default function forward(ctx) {
  const { small, ui, score, pointer, renderer, coarse } = ctx;
  const scene = new THREE.Scene();
  scene.background = col('#020908');
  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, .05, 400);
  const r = rng(808);
  let S = 2;
  const X = i => (i - (NT - 1) / 2) * S, BY = j => .85 + j * 1.3, TOP = BY(NL - 1) + .7, BAR_Y = TOP + 1.25, BOT = -1;
  const BX = w => (w - (VOCAB.length - 1) / 2) * 1.12 * Math.min(1, S / 2 + .2);

  /* ---------- The room ---------- */
  scene.add(floor(-1.25));
  const dust = motes(small ? 220 : 520); scene.add(dust.pts);
  const haze = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: col('#0f5a50'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: .35 }));
  haze.position.set(0, 7, -40); haze.scale.setScalar(90); scene.add(haze);

  /* ---------- The model: six blocks, the input vectors below, the word bars above ---------- */
  const blocks = Array.from({ length: NL }, (_, j) => { const s = slab(9.7, .95, 2.6); s.position.set(0, BY(j), 0); scene.add(s); return s; });
  const emb = TOKENS.map(() => Array.from({ length: D }, () => gaussian(r) * .5));
  const C = cells(NT * D + VOCAB.length); scene.add(C.mesh);
  // Each block's attention: lower layers look at neighbours, higher ones spread out.
  const PAT = Array.from({ length: NL }, (_, l) => TOKENS.map((_, i) => { const w = TOKENS.map((__, j) => j > i ? 0 : Math.exp(-Math.abs(i - 1 - j) * (2.2 - l * .35)) + r() * .15 * (l + 1)); const s = w.reduce((a, b) => a + b, 0); return w.map(x => x / s); }));
  const maps = PAT.map(() => { const m = heat(NT, .2, .03); scene.add(m.mesh); return m; });

  // Light rising through the model: one stream per token.
  const sT = [], sU = [];
  for (let i = 0; i < NT; i++) for (let k = 0; k < 240; k++) { sT.push(i); sU.push(k / 239); }
  const SU = { uS: { value: S }, uTime: { value: 0 }, uPx: { value: 1000 }, uWave: { value: -9 }, uBack: { value: 99 }, uOn: { value: 1 } };
  const streamMat = additive({ uniforms: SU,
    vertexShader: `attribute float aTok, aU; uniform float uS, uTime, uPx, uWave, uBack, uOn; varying vec3 vColor; varying float vAlpha;
      void main() {
        vec3 p = vec3((aTok - 2.) * uS, ${BOT.toFixed(1)} + aU * ${(TOP - BOT).toFixed(2)}, 0.);
        vec4 mv = modelViewMatrix * vec4(p, 1.); gl_Position = projectionMatrix * mv;
        float lit = smoothstep(uWave + .1, uWave - .4, p.y), red = smoothstep(uBack - .1, uBack + .4, p.y) * step(uBack, 50.);
        float pulse = pow(fract(aU * 4. - uTime * .4 - aTok * .17), 12.);
        gl_PointSize = max(1., uPx * .034 / -mv.z);
        vColor = mix(mix(vec3(.2, .6, .55), vec3(1., .88, .5), pulse * lit), vec3(1., .3, .35), red);
        vAlpha = uOn * (.12 + .5 * lit + pulse * lit + red * .8);
      }`, fragmentShader: POINT_FRAG });
  scene.add(new THREE.Points((() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(new Array(sT.length * 3).fill(0), 3)); g.setAttribute('aTok', new THREE.Float32BufferAttribute(sT, 1)); g.setAttribute('aU', new THREE.Float32BufferAttribute(sU, 1)); return g; })(), streamMat));

  // The two waves: gold going up (forward), red coming down (backward).
  const band = c => { const m = new THREE.Mesh(new THREE.PlaneGeometry(11, 3.2), new THREE.ShaderMaterial({ uniforms: { uOpacity: { value: 0 }, uC: { value: c } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: 'uniform float uOpacity; uniform vec3 uC; varying vec2 vUv; void main() { vec2 q = abs(vUv - .5) * 2.; float a = uOpacity * (1. - smoothstep(.55, 1., q.x)) * (1. - smoothstep(.5, 1., q.y)) * .35; gl_FragColor = vec4(uC * a, a); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, premultipliedAlpha: true, side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; scene.add(m); return m; };
  const upBand = band(col('#ffd88a')), downBand = band(RED);

  // From the last token to every word in the vocabulary.
  const fp = [], fw = [], fu = [];
  VOCAB.forEach((_, w) => { fp.push(0, 0, 0, 0, 0, 0); fw.push(w, w); fu.push(0, 1); });
  const fanMat = new THREE.ShaderMaterial({ uniforms: { uS: { value: S }, uOn: { value: 0 }, uP: { value: P0.slice() }, uTime: { value: 0 }, uBX: { value: VOCAB.map((_, w) => BX(w)) } },
    vertexShader: `attribute float aW, aU; uniform float uS, uOn, uTime, uP[${VOCAB.length}], uBX[${VOCAB.length}]; varying float vA, vU;
      void main() { int w = int(aW + .5); vec3 a = vec3(2. * uS, ${TOP.toFixed(2)}, 0.), b = vec3(uBX[w], ${BAR_Y.toFixed(2)}, 0.); vec3 p = mix(a, b, aU); vU = aU;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.); vA = uOn * (.15 + uP[w] * 2.2); }`,
    fragmentShader: 'uniform float uTime; varying float vA, vU; void main() { float pulse = pow(fract(vU - uTime * .8), 8.); float a = vA * (.4 + pulse); gl_FragColor = vec4(mix(vec3(.3, .95, .8), vec3(1., .88, .5), pulse) * a, a); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, premultipliedAlpha: true });
  scene.add(new THREE.LineSegments((() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3)); g.setAttribute('aW', new THREE.Float32BufferAttribute(fw, 1)); g.setAttribute('aU', new THREE.Float32BufferAttribute(fu, 1)); return g; })(), fanMat));

  /* ---------- Labels ---------- */
  const tokLabs = TOKENS.map(t => ui.label('fwd', `<span class="tag word-tag">${t}</span>`, 'plain word-lab'));
  const barLabs = VOCAB.map(w => ui.label('fwd', `<span class="tag bar-tag"><b>${w}</b><i>0%</i></span>`, 'plain bar-lab'));
  const lossLab = ui.label('fwd', '<span class="tag loss-tag">loss 3.22</span>', 'plain loss-lab');
  const layerLab = ui.label('fwd', '<span class="tag part-tag"></span>', 'plain part-lab');
  const truthLab = ui.label('fwd', '<span class="tag truth-tag">the truth</span>', 'plain truth-lab');

  /* ---------- Training, one step at a time ---------- */
  const panel = document.createElement('div'); panel.className = 'fw-panel';
  panel.innerHTML = '<button type="button" class="fw-train">Train one step</button><div class="fw-read"><span>step <b class="fw-step">0</b></span><span>loss <b class="fw-loss">3.22</b></span></div><svg class="fw-spark" viewBox="0 0 120 40" aria-hidden="true"><polyline points=""/></svg><button type="button" class="fw-reset" aria-label="Start again">↺</button>';
  ctx.$('#scene-ui').append(panel);
  const logits0 = P0.map(Math.log);
  const probsAt = n => { const l = logits0.map((v, i) => v + (i === 0 ? .55 * n : -.05 * n * (1 + (i % 3)) / 2)); const e = l.map(Math.exp), s = e.reduce((a, b) => a + b, 0); return e.map(x => x / s); };
  let steps = 0, anim = null, lastUser = -99, lastAuto = -99, hist = [-Math.log(P0[0])], shown = P0.slice(), target = P0.slice();
  const loss = () => -Math.log(probsAt(steps)[0]);
  function drawPanel() {
    panel.querySelector('.fw-step').textContent = steps; panel.querySelector('.fw-loss').textContent = loss().toFixed(2);
    const mx = Math.max(...hist), pts = hist.map((v, i) => `${(i / Math.max(9, hist.length - 1)) * 116 + 2},${38 - v / mx * 34}`).join(' ');
    panel.querySelector('polyline').setAttribute('points', pts);
  }
  function trainStep(user) {
    if (anim) return; if (user) lastUser = ctx.time;
    anim = { t0: ctx.time }; score.sfx('whoosh', { up: false, dur: .8, gain: .08 });
  }
  panel.querySelector('.fw-train').addEventListener('click', () => trainStep(true));
  panel.querySelector('.fw-reset').addEventListener('click', () => { steps = 0; hist = [-Math.log(P0[0])]; target = P0.slice(); anim = null; lastUser = ctx.time; drawPanel(); score.sfx('pop'); });
  drawPanel();

  /* ---------- Camera ---------- */
  const cpos = new THREE.Vector3(), cat = new THREE.Vector3(), off = new THREE.Vector3(), turn = new THREE.Vector2();
  const wide = () => [new THREE.Vector3(7.5, 8.8, 21.5), new THREE.Vector3(-2.6, 6.1, 0)];   // the model sits right of centre, leaving room for words
  function shot(p, yUp, yDown) {
    let pos, at;
    const follow = y => [new THREE.Vector3(8.4, y + 1.8, 14), new THREE.Vector3(-1.8, y, 0)];
    const top = [new THREE.Vector3(3.2, BAR_Y + 2.2, 13.5), new THREE.Vector3(-1.4, BAR_Y - .2, 0)];
    if (p < .08) { const [a, b] = wide(), [c, d] = follow(BOT + .5), e = easeInOut(p / .08); pos = a.lerp(c, e); at = b.lerp(d, e); }
    else if (p < .38) [pos, at] = follow(clamp(yUp, BOT + .5, TOP));
    else if (p < .44) { const [a, b] = follow(TOP), e = easeInOut((p - .38) / .06); pos = a.lerp(top[0], e); at = b.lerp(top[1], e); }
    else if (p < .66) [pos, at] = top;
    else if (p < .8) { const [a, b] = follow(clamp(yDown, BOT + .5, TOP)), e = easeInOut(clamp((p - .66) / .03)); pos = top[0].clone().lerp(a, e); at = top[1].clone().lerp(b, e); }
    else { const [a, b] = wide(), [c, d] = follow(BOT + .5), e = easeInOut(clamp((p - .8) / .05)); pos = c.lerp(a, e); at = d.lerp(b, e); }
    const k = camera.aspect < 1 ? Math.min(2.6, 1.02 / camera.aspect) : 1;
    off.subVectors(pos, at).multiplyScalar(k); cpos.copy(at).add(off); cat.copy(at);
  }

  let localP = 0, hotBlock = -1, hotBar = -1;
  const v3 = new THREE.Vector3();
  function nearest(points, maxD) { let best = -1, bd = maxD; points.forEach((p, i) => { const s = ui.screen(p, camera); const d = Math.hypot(s.x - pointer.x, s.y - pointer.y); if (s.z < 1 && d < bd) { bd = d; best = i; } }); return best; }

  return {
    id: 'fwd', scene, camera, extra: {},
    captions: [
      { at: [0, .1], html: 'Now run it. In a <b>forward pass</b>, the sentence flows up through every block.', x: 7, y: 14, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.08, .38], html: `<span class="hint-dot"></span>${coarse ? 'Tap' : 'Hover'} a block to see what its attention is doing`, x: 50, y: 84, cls: 'hint', align: 'center' },
      { at: [.14, .26], html: 'Lower layers notice nearby words and grammar; higher layers build meaning.', x: 7, y: 14, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.26, .37], html: 'After training, a model only runs forward passes. Mine must be fast: the Particle Transformer takes <b>0.97 ms</b> on a GPU.', x: 7, y: 14, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.38, .48], html: 'At the top, the last vector becomes a <b>probability</b> for every word it knows.', x: 7, y: 14, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.47, .57], html: 'It hasn’t learned yet, so the guess is near random. The right word, <b>fast</b>, gets just 4%.', x: 7, y: 14, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.56, .67], html: 'The <b>loss</b> measures how surprised the model is by the truth: the less likely <i>fast</i> seemed, the bigger it is.', x: 7, y: 14, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.56, .67], html: 'L = −log p(fast) = −log 0.04 ≈ 3.2', x: 93, y: 14, cls: 'math desk', align: 'right' },
      { at: [.67, .8], html: '<b>Backpropagation</b> sends the blame back through every layer, and each weight takes a tiny step that would have helped.', x: 7, y: 14, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.67, .8], html: 'w ← w − η · ∂L/∂w', x: 93, y: 14, cls: 'math desk', align: 'right' },
      { at: [.8, .85], html: 'One step changes very little. Press <b>Train</b> and keep going: the right word slowly wins.', x: 7, y: 14, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.85, .905], html: 'I train models too, like my 3-layer drafter. But most of my work comes after: making them small and fast.', x: 7, y: 14, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.905, 1.1], html: 'Billions of steps over trillions of words, and it starts to understand. That is <b>training</b>.', x: 50, y: 14, cls: 'note center-note', align: 'center' }
    ],
    resize(aspect) { camera.aspect = aspect; camera.updateProjectionMatrix(); S = aspect < 1 ? 1.02 : 2; SU.uS.value = S; fanMat.uniforms.uS.value = S; fanMat.uniforms.uBX.value = VOCAB.map((_, w) => BX(w)); blocks.forEach(b => { b.scale.x = (4 * S + 1.7) / 9.7; }); },
    init() { this.resize(innerWidth / innerHeight); },
    show(on) { if (!on) { panel.classList.remove('on'); document.body.style.cursor = ''; } },
    pointer(type) {
      if (type !== 'move' && type !== 'down') return;
      const blk = nearest(blocks.map((_, j) => new THREE.Vector3((4 * S + 1.7) / 2 + 1, BY(j), 0)), 60);
      const blk2 = blk >= 0 ? blk : nearest(blocks.map((_, j) => new THREE.Vector3(0, BY(j), 0)), 90);
      if (blk2 !== hotBlock && blk2 >= 0) score.sfx('hover');
      hotBlock = blk2;
      hotBar = nearest(VOCAB.map((_, w) => new THREE.Vector3(BX(w), BAR_Y + .4, 0)), 40);
      document.body.style.cursor = hotBlock >= 0 || hotBar >= 0 ? 'pointer' : '';
    },
    update(p, info) {
      localP = p;
      const t = info.time, act = info.active, px = pixelScale(renderer, camera);
      SU.uTime.value = t; SU.uPx.value = px; fanMat.uniforms.uTime.value = t; dust.mat.uniforms.uTime.value = t; dust.mat.uniforms.uPx.value = px;

      /* The waves: scripted by the scroll, then driven by training steps. */
      let yUp = BOT + (TOP - BOT) * easeInOut(clamp((p - .08) / .3)), yDown = 99;
      if (p >= .66 && p < .8) yDown = TOP - (TOP - BOT) * easeInOut(clamp((p - .67) / .12));
      const training = p >= .8;
      if (training && act && !anim && t - lastUser > 6 && t - lastAuto > 2.8 && steps < 9) { lastAuto = t; trainStep(false); }
      if (anim) {
        const e = t - anim.t0;
        if (e < .9) { yDown = TOP - (TOP - BOT) * (e / .9); yUp = BOT - 1; }
        else if (e < 1.8) { if (!anim.stepped) { anim.stepped = true; steps++; target = probsAt(steps); } yUp = BOT + (TOP - BOT) * ((e - .9) / .9); }
        else { hist.push(loss()); drawPanel(); score.sfx('chime', { f: 440 + Math.min(steps, 9) * 40 }); anim = null; }
        if (!training) anim = null;
      } else if (training) yUp = TOP + 1;
      SU.uWave.value = yUp; SU.uBack.value = yDown;
      upBand.position.y = yUp; upBand.material.uniforms.uOpacity.value = yUp > BOT - .5 && yUp < TOP + .3 ? 1 : 0;
      downBand.position.y = yDown; downBand.material.uniforms.uOpacity.value = yDown < TOP + .3 && yDown > BOT - .5 ? 1 : 0;

      /* Blocks glow as the light passes; red while the blame flows back. Each shows its attention once it has run. */
      blocks.forEach((b, j) => {
        const gUp = Math.exp(-Math.pow((yUp - BY(j)) / .55, 2)), gDn = Math.exp(-Math.pow((yDown - BY(j)) / .55, 2));
        b.userData.tint(TEAL.clone().lerp(RED, gDn)); b.userData.set(.5, gUp * .8 + gDn * 1.1 + (hotBlock === j ? .45 : 0));
        const m = maps[j], ran = training || yUp > BY(j) || p > .38, k = hotBlock === j ? 2 : 1;
        m.mesh.position.set((4 * S + 1.7) / 2 + .55 + .45 * k, BY(j), 0); m.mesh.scale.setScalar(lerp(m.mesh.scale.x || 1, k, .15)); m.mesh.lookAt(camera.position);
        m.mat.uniforms.uOpacity.value = ran ? (hotBlock < 0 || hotBlock === j ? 1 : .35) : 0;
        for (let a = 0; a < NT; a++) for (let c = 0; c < NT; c++) m.set(a, c, c > a ? 0 : PAT[j][a][c], 0, c > a ? .3 : 1);
        m.commit();
      });

      /* The input vectors, and the bars of the guess. */
      for (let i = 0; i < NT; i++) for (let k = 0; k < D; k++) C.set(i * D + k, X(i), BOT + .05 + k * .085, 0, .44, .065, .44, emb[i][k], yUp > BOT + .3 && yUp < BOT + 1.2 ? .5 : 0, 1);
      const reveal = training ? 1 : sstep(.4, .46, p);
      const tgt = training ? target : P0;
      shown = shown.map((v, w) => lerp(v, tgt[w], Math.min(1, info.dt * 3)));
      const truth = training || p > .5;
      VOCAB.forEach((_, w) => {
        const h = (.12 + shown[w] * 6.5) * reveal, isT = w === 0;
        C.set(NT * D + w, BX(w), BAR_Y + h / 2, 0, .72, Math.max(.001, h), .72, isT && truth ? .95 : .25 + shown[w] * 2, isT && truth ? .45 + .25 * Math.sin(t * 3) : (hotBar === w ? .5 : 0), reveal);
      });
      C.commit();
      fanMat.uniforms.uOn.value = reveal; fanMat.uniforms.uP.value = shown.slice();

      /* Words. */
      const show = (lab, pos, on) => ui.place(lab, pos, camera, act && on);
      TOKENS.forEach((_, i) => show(tokLabs[i], v3.set(X(i), BOT - .25, .4).clone(), true));
      VOCAB.forEach((w, i) => {
        const el = barLabs[i].el.querySelector('i'), txt = `${Math.round(shown[i] * 100)}%`;
        if (el.textContent !== txt) el.textContent = txt;
        barLabs[i].el.classList.toggle('truth', i === 0 && truth);
        const top2 = shown.map((v, j) => [v, j]).sort((a, b) => b[0] - a[0]).slice(0, 1).map(x => x[1]);
        show(barLabs[i], new THREE.Vector3(BX(i), BAR_Y - .3, .4), reveal > .5 && (innerWidth >= 760 || i === 0 || top2.includes(i) || hotBar === i));
      });
      const L = (training ? loss() : -Math.log(P0[0])).toFixed(2);
      const lt = lossLab.el.querySelector('.tag'); if (lt.textContent !== `loss ${L}`) lt.textContent = `loss ${L}`;
      show(lossLab, new THREE.Vector3(BX(0) - .2, BAR_Y + (.12 + shown[0] * 6.5) + .55, 0), (p > .56 && p < .8) || training);
      show(truthLab, new THREE.Vector3(BX(0), BAR_Y + (.12 + shown[0] * 6.5) + 1.05, 0), p > .5 && p < .56);
      if (hotBlock >= 0) layerLab.el.querySelector('.tag').innerHTML = `layer ${hotBlock + 1} · ${LAYER_NOTES[hotBlock]}`;
      show(layerLab, new THREE.Vector3(-(4 * S + 1.7) / 2 - .3, BY(Math.max(0, hotBlock)), 0), hotBlock >= 0 && (training || yUp > BY(hotBlock) || p > .38));
      panel.classList.toggle('on', act && training);

      /* Camera, with a small turn toward the mouse. */
      shot(p, yUp, yDown);
      const want = pointer.inside && !coarse ? pointer.ndc : null;
      turn.x += ((want ? want.x : 0) - turn.x) * Math.min(1, info.dt * 2); turn.y += ((want ? want.y : 0) - turn.y) * Math.min(1, info.dt * 2);
      off.subVectors(cpos, cat).applyAxisAngle(new THREE.Vector3(0, 1, 0), -turn.x * .1); off.y += turn.y * .5;
      camera.position.copy(cat).add(off); camera.lookAt(cat);
    }
  };
}
