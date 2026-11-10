/* Act VII, scene 19: Curiosity, Hafiz's personal AI, and the question underneath.
   It opens diving into Beijing and lands on his desk: a V100 and an RTX 4090. A request flows (scripted replay, not a
   live connection) from you through Hermes Agent, Ollama / llama.cpp and Qwen to the GPUs and back; you pick the
   request. Then five kinds of memory as rings around the model, a world-model graph of people, projects and deadlines
   (click a node: where the fact came from, when, how sure), a day in its life, and the honest status (phase one of
   seven). Finally the question underneath, as the graph's points flow into the brain from Act I: the question that
   started the film. */
import * as THREE from 'three';
import { additive, POINT_FRAG, col, rng, sstep, clamp, lerp, easeInOut, easeOut, pixelScale, glowTexture, textTexture } from '../core/util.js';
import { slab, floor, motes } from '../core/glass.js';
import { makeChip } from './race.js';
import { brainPoints } from '../core/brainShape.js';

const REQUESTS = [
  { q: 'Morning brief', a: 'Your CEPC talk is Friday. Here are last week’s slides and the two comments you never answered.' },
  { q: 'Why did my run fail?', a: 'The training run failed twice with the same CUDA error. Last month the fix was a smaller batch. Try that?' },
  { q: 'What’s due this week?', a: 'Paper due in three days. Two experiments are unfinished, and one is waiting on the V100.' }
];
const MEM = [['working', 'seconds to minutes'], ['episodic', 'days to months'], ['semantic', 'months to years'], ['procedural', 'skills that worked'], ['identity and goals', 'years']];
const FACTS = [['CEPC talk', 'Friday', 'calendar', .95], ['Draft-budget paper', 'due in three days', 'email', .9], ['V100', 'busy until 18:00', 'GPU monitor', .99], ['Training run', 'failed twice: CUDA error', 'logs', 1], ['Smaller batch', 'fixed the same error last month', 'memory', .7], ['Advisor', 'two comments unanswered', 'email', .85], ['AutoDeploy', 'project · thesis follow-up', 'notes', 1], ['LHAASO data', 'a new run arrived', 'storage', .8], ['Lyon slides', 'from April', 'files', .9], ['New draft-budget paper', 'tests the setting my study left open', 'paper watch', .6], ['Quiet hours', 'after 23:00, stay quiet', 'my rules', 1], ['Spurs match', 'Saturday', 'calendar', .9]];
const DAY = [['08:10', 'Morning brief', 'Your CEPC talk is Friday. Here are last week’s slides.'], ['10:40', 'Spots a pattern', 'Same CUDA error twice. Last month: a smaller batch.'], ['14:05', 'Connects the dots', 'A new paper tests the setting your study left open.'], ['18:30', 'Watches the deadline', 'Paper due in three days; one experiment waits on the V100.'], ['22:50', 'Stays quiet', 'Nothing urgent. It writes today into memory.']];

export default function curiosity(ctx) {
  const { small, ui, score, pointer, renderer, coarse } = ctx;
  const scene = new THREE.Scene();
  scene.background = col('#05040c');
  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, .05, 300);
  const r = rng(1919);
  let tall = false;
  scene.add(new THREE.HemisphereLight(col('#cdbbff'), col('#140a20'), 1.1));
  const key = new THREE.DirectionalLight(col('#ffffff'), 1.5); key.position.set(3, 8, 9); scene.add(key);
  scene.add(floor(-.06, '#8a6cff'));
  const dust = motes(small ? 160 : 360, [40, 14, 30], '#cdb8ff'); scene.add(dust.pts);
  const geoOf = attrs => { const g = new THREE.BufferGeometry(); Object.entries(attrs).forEach(([k, [arr, n]]) => g.setAttribute(k, new THREE.Float32BufferAttribute(arr, n))); return g; };
  const glowS = (c, s) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: col(c), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 })); sp.scale.setScalar(s); scene.add(sp); return sp; };

  /* ---------- His desk: a V100 and an RTX 4090 ---------- */
  const v100 = makeChip('gpu'); v100.scale.setScalar(.8); scene.add(v100);
  const rtx = new THREE.Group(); scene.add(rtx);
  { const m = (c, me = .4, ro = .4) => new THREE.MeshStandardMaterial({ color: col(c), metalness: me, roughness: ro });
    rtx.add(new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.4, .55), m('#202227')));
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.42, .57), m('#a9adb6', .42, .3)); band.position.x = .5; rtx.add(band);
    [-1.3, 1.9].forEach(x => { const fan = new THREE.Mesh(new THREE.CylinderGeometry(.5, .5, .06, 32), m('#111216')); fan.rotation.x = Math.PI / 2; fan.position.set(x, 0, .3); rtx.add(fan); });
    const { texture, aspect } = textTexture(['GEFORCE'], { size: 70, weight: 700, color: '#d6dbe4', sub: 'RTX 4090', subColor: '#9ff7dc', subSize: .55, pad: .2 });
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(1, 1 / aspect), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })); lab.position.set(.5, 0, .29); rtx.add(lab);
    rtx.scale.setScalar(.8); }

  /* ---------- The path of a request ---------- */
  const loader = new THREE.TextureLoader();
  const node = (img, txt, color) => {
    const g = new THREE.Group(); scene.add(g);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(.62, 48), new THREE.MeshBasicMaterial({ color: col('#b8b2a6'), transparent: true, opacity: 0, toneMapped: false })); g.add(disc);
    const ring = new THREE.Mesh(new THREE.RingGeometry(.66, .72, 48), new THREE.MeshBasicMaterial({ color: col(color), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); g.add(ring);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(.9, .9), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })); face.position.z = .01; g.add(face);
    if (img) loader.load(`../assets/showcase/${img}`, tx => { tx.colorSpace = THREE.SRGBColorSpace; face.material.map = tx; face.material.needsUpdate = true; const a = tx.image.width / tx.image.height; face.scale.set(a >= 1 ? 1 : a, a >= 1 ? 1 / a : 1, 1); });
    else { const { texture } = textTexture([txt], { size: 90, weight: 700, color: '#1a1204', pad: .3 }); face.material.map = texture; disc.material.color = col('#c9a456'); }
    return { g, disc, ring, face };
  };
  const NODES = [node(null, 'you', '#ffd27a'), node('logo-hermes.png', '', '#cdbbff'), node('logo-ollama.png', '', '#cdbbff'), node('logo-llamacpp.png', '', '#cdbbff'), node('logo-qwen-mark.png', '', '#9ff7dc')];
  const pkt = glowS('#ffe6a8', .9);
  let NP = [];

  /* ---------- Five kinds of memory ---------- */
  const RC = new THREE.Vector3(0, 3.6, -1);
  const RN = small ? 900 : 1800, rp = new Float32Array(RN * 3), rInfo = [];
  for (let i = 0; i < RN; i++) rInfo.push([i % 5, r() * Math.PI * 2, (r() - .5) * .12]);
  const ringGeo = new THREE.BufferGeometry(); ringGeo.setAttribute('position', new THREE.BufferAttribute(rp, 3));
  ringGeo.setAttribute('aK', new THREE.Float32BufferAttribute(rInfo.map(o => o[0]), 1));
  const ringMat = additive({ uniforms: { uPx: { value: 1000 }, uO: { value: 0 } }, vertexShader: 'attribute float aK; uniform float uPx, uO; varying vec3 vColor; varying float vAlpha; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = max(1., uPx * .045 / -mv.z); vColor = mix(vec3(1., .85, .5), vec3(.6, .5, 1.), aK / 4.); vAlpha = uO * .8; }', fragmentShader: POINT_FRAG });
  const rings = new THREE.Points(ringGeo, ringMat); rings.frustumCulled = false; scene.add(rings);
  const core = glowS('#ffd27a', 1.6);

  /* ---------- The world model, and the brain it becomes ---------- */
  const GC = new THREE.Vector3(0, 4.2, -.6);
  const gn = FACTS.map((_, i) => { const a = i / FACTS.length * Math.PI * 2 + (r() - .5) * 1.1, rad = .9 + r() * 3.1; return new THREE.Vector3(GC.x + Math.cos(a) * rad * 1.35, GC.y + Math.sin(a) * rad * .62, GC.z + (r() - .5) * 2); });
  const ge = []; gn.forEach((a, i) => { gn.map((b, j) => [j, a.distanceTo(b)]).filter(([j]) => j !== i).sort((x, y) => x[1] - y[1]).slice(0, 2).forEach(([j]) => { if (i < j) ge.push([i, j]); }); });
  const edgeGeo = new THREE.BufferGeometry().setFromPoints(ge.flatMap(([a, b]) => [gn[a], gn[b]]));
  const edges = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: 0xb8a0ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); scene.add(edges);
  const BN = small ? 1600 : 3000, bp = new Float32Array(BN * 3), from = new Float32Array(BN * 3), brain = brainPoints(BN, 21);
  for (let i = 0; i < BN; i++) {
    let v;
    if (i < FACTS.length * 40) { const c = gn[i % FACTS.length]; v = new THREE.Vector3(c.x + (r() - .5) * .35, c.y + (r() - .5) * .35, c.z + (r() - .5) * .35); }
    else { const [a, b] = ge[i % ge.length]; v = new THREE.Vector3().lerpVectors(gn[a], gn[b], r()); }
    from.set([v.x, v.y, v.z], i * 3);
  }
  const bGeo = new THREE.BufferGeometry(); bGeo.setAttribute('position', new THREE.BufferAttribute(bp, 3)); bGeo.setAttribute('aR', new THREE.Float32BufferAttribute(Array.from({ length: BN }, () => r()), 1));
  const bMat = additive({ uniforms: { uPx: { value: 1000 }, uO: { value: 0 }, uM: { value: 0 }, uT: { value: 0 } }, vertexShader: 'attribute float aR; uniform float uPx, uO, uM, uT; varying vec3 vColor; varying float vAlpha; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; float spark = pow(.5 + .5 * sin(uT * 2. + aR * 40.), 12.); gl_PointSize = max(1., uPx * (.035 + aR * .03) * (1. + spark) / -mv.z); vColor = mix(vec3(.75, .65, 1.), mix(vec3(.62, .4, 1.), vec3(1., .82, .45), aR * aR), uM) * (1. + spark); vAlpha = uO * (.55 + .3 * uM); }', fragmentShader: POINT_FRAG });
  const bPts = new THREE.Points(bGeo, bMat); bPts.frustumCulled = false; scene.add(bPts);
  const BC = new THREE.Vector3(0, 4.1, -1);
  const sun = glowS('#ffd9a0', 1.3);

  /* ---------- Words, controls, the card ---------- */
  const L = (html, cls) => ui.label('cur', html, cls);
  const gpuLabs = [L('<span class="tag"><b>NVIDIA V100</b><small>32 GB</small></span>', 'plain chipname-lab'), L('<span class="tag"><b>RTX 4090</b><small>24 GB</small></span>', 'plain chipname-lab')];
  const nodeLabs = [['you', ''], ['Hermes Agent', 'plans and orchestrates'], ['Ollama', 'serves the model'], ['llama.cpp', 'or this, on the GPU'], ['Qwen', 'open-weight model, 27B']].map(([a, b]) => L(`<span class="tag"><b>${a}</b>${b ? `<small>${b}</small>` : ''}</span>`, 'plain node-lab2'));
  const answer = L('<span class="tag"></span>', 'plain answer-lab');
  const replayLab = L('<span class="tag">a scripted replay of how a request flows, not a live connection</span>', 'plain axis-lab');
  const memLabs = MEM.map(([a, b]) => L(`<span class="tag"><b>${a}</b><small>${b}</small></span>`, 'plain mem-lab'));
  const factLabs = FACTS.map(f => L(`<span class="tag"><b>${f[0]}</b><small></small></span>`, 'plain fact-lab'));
  const dayLabs = DAY.map(d => L(`<span class="tag"><i>${d[0]}</i><b>${d[1]}</b><small>${d[2]}</small></span>`, 'plain day-lab'));
  const roadLab = L(`<span class="tag"><b>Phase 1 of 7, now:</b> a local AI on my own GPUs<small>next: persistent memory · world model and goals · tools and proactive help · architecture experiments · continual learning · toward adaptive intelligence</small></span>`, 'plain road-lab');
  const ctl = document.createElement('div'); ctl.className = 'race-ctl cur-ctl';
  ctl.innerHTML = `<span>Ask Curiosity</span><div class="rc-row">${REQUESTS.map((o, i) => `<button type="button" data-q="${i}">${o.q}</button>`).join('')}</div>`;
  const card = document.createElement('aside'); card.className = 'paper-card mini-card cur-card';
  card.innerHTML = `<div class="pc-logos"><img src="../assets/showcase/logo-hermes.png" alt="Hermes Agent"><img src="../assets/showcase/logo-ollama.png" alt="Ollama"><img src="../assets/showcase/logo-llamacpp.png" alt="llama.cpp"><img src="../assets/showcase/logo-qwen.png" alt="Qwen"></div><div class="pc-body"><small>Personal research project · in progress</small><h3>Curiosity</h3><p>A personal AI that remembers, notices what matters and learns over time, within limits I set. Phase one runs locally: Hermes Agent orchestrates, llama.cpp or Ollama serves Qwen on a V100 and an RTX 4090. It is also my testbed for world models and autonomous agents.</p><div class="pc-btns"><a class="pc-btn" href="../index.html#projects" target="_blank" rel="noopener">Case study <span aria-hidden="true">↗</span></a></div></div>`;
  ctx.$('#scene-ui').append(ctl, card);
  let req = 0, reqT0 = -1, userReq = -99, hotFact = -1;
  ctl.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => { req = +b.dataset.q; reqT0 = ctx.time; userReq = ctx.time; score.sfx('pop'); }));

  /* ---------- Layout and camera ---------- */
  function layout() {
    v100.position.set(tall ? 0 : -2.4, tall ? 1.15 : .9, 0); rtx.position.set(tall ? 0 : 2.4, tall ? -.3 : .9, 0); v100.scale.setScalar(tall ? .6 : .8); rtx.scale.setScalar(tall ? .6 : .8);
    NP = tall ? [new THREE.Vector3(0, 7.3, 0), new THREE.Vector3(-1.5, 6.2, 0), new THREE.Vector3(1.5, 5.1, 0), new THREE.Vector3(-1.5, 4, 0), new THREE.Vector3(1.5, 2.9, 0)]
      : [new THREE.Vector3(-6.4, 4.4, 0), new THREE.Vector3(-3.4, 5.4, 0), new THREE.Vector3(-.4, 5.6, 0), new THREE.Vector3(2.6, 5.4, 0), new THREE.Vector3(5.6, 4.4, 0)];
    NODES.forEach((n, i) => n.g.position.copy(NP[i]));
  }
  const pathPts = () => { const gp = tall ? new THREE.Vector3(0, 1.3, .3) : new THREE.Vector3(0, 1.2, .3); return [NP[0], NP[1], NP[2], NP[4], gp, NP[4], NP[3], NP[1], NP[0]]; };
  const along = (pts, f, out) => { const segs = pts.length - 1, s = Math.min(segs - 1, Math.floor(f * segs)), u = f * segs - s; return out.lerpVectors(pts[s], pts[s + 1], u); };
  const cpos = new THREE.Vector3(), cat = new THREE.Vector3(), off = new THREE.Vector3(), turn = new THREE.Vector2(), tmp = new THREE.Vector3();
  const S = (a, b) => [new THREE.Vector3(...a), new THREE.Vector3(...b)];
  function shot(p) {
    const OPEN = S([0, 1.6, 4.6], [0, 1.2, 0]), DESK = tall ? S([0, 4.8, 15], [0, 4.6, 0]) : S([0, 3.6, 14], [0, 3.1, 0]);
    const RINGS = S([0, 3.9, 11.5], [0, 3.6, -1]), GRAPH = S([0, 4.5, 13.5], [0, 4.2, -.4]), BRAIN = S([0, 4.3, 9.5], [0, 4.1, -1]);
    const seq = [[0, OPEN], [.03, OPEN], [.11, DESK], [.34, DESK], [.38, RINGS], [.54, RINGS], [.58, GRAPH], [.86, GRAPH], [.92, BRAIN], [1, BRAIN]];
    let i = 0; while (i < seq.length - 2 && p > seq[i + 1][0]) i++;
    const [pa, A] = seq[i], [pb, B] = seq[i + 1], e = easeInOut(clamp((p - pa) / Math.max(1e-4, pb - pa)));
    cpos.lerpVectors(A[0], B[0], e); cat.lerpVectors(A[1], B[1], e);
    const K = tall ? Math.min(2.3, 1.05 / camera.aspect) * (i <= 1 ? lerp(.45, 1, i === 1 ? e : 0) : 1) : 1;
    off.subVectors(cpos, cat).multiplyScalar(K); cpos.copy(cat).add(off);
  }

  let localP = 0;
  return {
    id: 'cur', scene, camera, extra: {},
    captions: [
      { at: [.02, .13], html: 'Under my desk, on a V100 and an RTX 4090, I’m building <b>Curiosity</b>: a personal AI that remembers my work and speaks up when needed.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.13, .34], html: 'A request goes to <b>Hermes Agent</b>, which plans, then to <b>Ollama</b> or <b>llama.cpp</b> running <b>Qwen</b>. Nothing leaves the room.', x: 93, y: 12, cls: 'note', align: 'right', m: { x: 50, y: 11, align: 'center' } },
      { at: [.36, .55], html: 'Curiosity keeps <b>five kinds of memory</b>, from the task at hand to long-term goals.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.56, .72], html: 'Its picture of my world is a <b>graph</b> of people, projects and deadlines. Each fact keeps its source, date and confidence.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.58, .72], html: `<span class="hint-dot"></span>${coarse ? 'Tap' : 'Hover'} a node to see why it believes it`, x: 50, y: 92, cls: 'hint desk', align: 'center' },
      { at: [.72, .86], html: 'Honestly, that’s the plan: today it is phase one of seven, a local assistant. Each later phase is tested against a baseline.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.86, .95], html: 'The question underneath: can a small model get much smarter through better memory and design, instead of more parameters?', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.95, 1.08], html: 'It is the question that brought me here: how does intelligence actually work? I am still chasing it.', x: 50, y: 13, cls: 'note center-note', align: 'center' }
    ],
    resize(aspect) { camera.aspect = aspect; camera.updateProjectionMatrix(); tall = aspect < 1; layout(); },
    init() { this.resize(innerWidth / innerHeight); },
    show(on) { if (!on) { ctl.classList.remove('on'); card.classList.remove('on'); document.body.style.cursor = ''; } },
    pointer() {
      if (localP < .57 || localP > .73) { hotFact = -1; return; }
      let best = -1, bd = coarse ? 40 : 30;
      gn.forEach((v, i) => { const s = ui.screen(v, camera), d = Math.hypot(s.x - pointer.x, s.y - pointer.y); if (d < bd) { bd = d; best = i; } });
      if (best !== hotFact && best >= 0) score.sfx('hover');
      hotFact = best; document.body.style.cursor = best >= 0 ? 'help' : '';
    },
    update(p, info) {
      localP = p;
      const t = info.time, act = info.active, dt = info.dt, px = pixelScale(renderer, camera);
      [ringMat, bMat].forEach(m => { m.uniforms.uPx.value = px; }); bMat.uniforms.uT.value = t; dust.mat.uniforms.uTime.value = t; dust.mat.uniforms.uPx.value = px;

      /* The desk and the request. */
      const deskO = 1 - sstep(.36, .42, p), flowO = sstep(.1, .15, p) * (1 - sstep(.34, .38, p));
      v100.visible = rtx.visible = deskO > .02; v100.rotation.y = Math.sin(t * .3) * .06; rtx.rotation.y = Math.sin(t * .3 + 1) * .06;
      if (p > .13 && p < .34 && t - userReq > 9 && (reqT0 < 0 || t - reqT0 > 6.5)) { req = reqT0 < 0 ? 0 : (req + 1) % REQUESTS.length; reqT0 = t; }
      const el = reqT0 < 0 ? -1 : t - reqT0, f = clamp(el / 3.2), pts = pathPts();
      NODES.forEach((n, i) => { n.disc.material.opacity = flowO; n.face.material.opacity = flowO; n.ring.material.opacity = flowO * (.4 + (el >= 0 && Math.abs(f * 8 - [0, 1, 2, 6, 3][i]) < .6 ? .6 : 0)); n.g.lookAt(camera.position); });
      if (el >= 0 && f < 1) along(pts, f, pkt.position); pkt.material.opacity = el >= 0 && f < 1 ? flowO : 0;

      /* Memory rings: inner ones fast, outer ones slow. */
      const ringO = sstep(.36, .42, p) * (1 - sstep(.54, .58, p));
      if (ringO > .001) for (let i = 0; i < RN; i++) { const [k, a0, h] = rInfo[i], rad = 1 + k * .62, a = a0 + t * (.5 / (k + 1)); rp.set([RC.x + Math.cos(a) * rad * (tall ? .8 : 1.35), RC.y + Math.sin(a) * rad * .5 + h, RC.z + Math.sin(a) * rad * .4], i * 3); }
      ringGeo.attributes.position.needsUpdate = true; ringMat.uniforms.uO.value = ringO;
      core.position.copy(RC); core.material.opacity = ringO * .7;

      /* The world model, then the brain. */
      const graphO = sstep(.55, .6, p), m = easeInOut(clamp((p - .87) / .08));
      edges.material.opacity = graphO * .35 * (1 - m);
      const spin = m * t * .25;
      if (graphO > .001) for (let i = 0; i < BN; i++) {
        const fx = from[i * 3], fy = from[i * 3 + 1], fz = from[i * 3 + 2], bx = brain[i * 3] * 2.6, by = brain[i * 3 + 1] * 2.6, bz = brain[i * 3 + 2] * 2.6;
        const cx = bx * Math.cos(spin) + bz * Math.sin(spin), cz = -bx * Math.sin(spin) + bz * Math.cos(spin);
        bp[i * 3] = lerp(fx + Math.sin(t + i) * .02, BC.x + cx, m); bp[i * 3 + 1] = lerp(fy, BC.y + by, m); bp[i * 3 + 2] = lerp(fz, BC.z + cz, m);
      }
      bGeo.attributes.position.needsUpdate = true; bMat.uniforms.uO.value = graphO * (1 - .45 * sstep(.72, .75, p) * (1 - sstep(.85, .88, p))); bMat.uniforms.uM.value = m;
      const dayO = sstep(.72, .75, p) * (1 - sstep(.85, .88, p)), dayF = clamp((p - .73) / .12);
      sun.position.set(lerp(-6, 6, dayF), GC.y + 2.6 + Math.sin(dayF * Math.PI) * 1.2, -2); sun.material.opacity = dayO * .8;

      /* Words. */
      const show = (lab, pos, on) => ui.place(lab, pos, camera, act && on);
      show(gpuLabs[0], v100.position.clone().add(tmp.set(0, -.8, 0)), deskO > .5 && p > .05);
      show(gpuLabs[1], rtx.position.clone().add(tmp.set(0, -.85, 0)), deskO > .5 && p > .05);
      NODES.forEach((n, i) => show(nodeLabs[i], NP[i].clone().add(tmp.set(0, -.85, 0)), flowO > .5));
      const at = answer.el.querySelector('.tag'), tx = REQUESTS[req].a; if (at.textContent !== tx) at.textContent = tx;
      show(answer, tall ? new THREE.Vector3(0, -1.5, 1) : NP[0].clone().add(tmp.set(.2, 1, 0)), flowO > .5 && el > 2.9);
      show(replayLab, new THREE.Vector3(0, -.55, 1), flowO > .5 && !tall);
      MEM.forEach((mm, k) => { const th = -1.15 + k * .5, rad = 1 + k * .62; show(memLabs[k], new THREE.Vector3(RC.x + Math.cos(th) * rad * (tall ? .8 : 1.35) + .12, RC.y + Math.sin(th) * rad * .5, RC.z + Math.sin(th) * rad * .4), ringO > .5 && !tall || (ringO > .5 && k % 2 === 0)); });
      FACTS.forEach((fc, i) => { const el2 = factLabs[i].el; el2.classList.toggle('hot', i === hotFact); const sm = el2.querySelector('small'), sx = i === hotFact ? `${fc[1]} · from ${fc[2]} · ${Math.round(fc[3] * 100)}% sure` : ''; if (sm.textContent !== sx) sm.textContent = sx; show(factLabs[i], gn[i].clone().add(tmp.set(0, -.3, 0)), graphO > .5 && p < .72 && (!tall || i % 2 === 0 || i === hotFact)); });
      DAY.forEach((d, k) => show(dayLabs[k], new THREE.Vector3(tall ? 0 : -5.6 + k * 2.8, tall ? 2.6 : GC.y - (k % 2 ? 1.6 : .4), 0), dayO > .5 && dayF > k / 5 - .02 && (!tall || k === Math.min(4, Math.floor(dayF * 5)))));
      show(roadLab, new THREE.Vector3(0, tall ? .8 : GC.y - 3.2, 0), dayO > .5 && dayF > .5);
      ctl.classList.toggle('on', act && p > .14 && p < .34);
      ctl.querySelectorAll('[data-q]').forEach((b, i) => b.classList.toggle('sel', i === req));
      card.classList.toggle('on', act && p > .26 && p < .35);

      /* Camera. */
      shot(p);
      const want = pointer.inside && !coarse ? pointer.ndc : null;
      turn.x += ((want ? want.x : 0) - turn.x) * Math.min(1, dt * 2); turn.y += ((want ? want.y : 0) - turn.y) * Math.min(1, dt * 2);
      off.subVectors(cpos, cat).applyAxisAngle(new THREE.Vector3(0, 1, 0), -turn.x * .05); off.y += turn.y * .3;
      camera.position.copy(cat).add(off); camera.lookAt(cat);
    }
  };
}
