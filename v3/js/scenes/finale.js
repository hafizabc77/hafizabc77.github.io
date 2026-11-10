/* Act VIII, scene 21: the finale. The camera pulls back until the whole film hangs in the dark as one path through
   the eight acts. "What are you hiring for?": pick a role and the scenes that prove it light up along the path, each
   one a jump straight back into the film. Then the credits roll (education, experience, papers, talks, awards, the
   toolbox, languages), and it ends on your turn: write a prompt and your email app opens with it, addressed to Hafiz;
   then the ways to reach him, and the flag. */
import * as THREE from 'three';
import { additive, POINT_FRAG, col, rng, sstep, clamp, lerp, easeInOut, pixelScale, glowTexture } from '../core/util.js';
import { motes } from '../core/glass.js';

const ACTS = [['I', 'Spark', '#a98bff'], ['II', 'Data', '#6aa8ff'], ['III', 'Architecture', '#4fe0b8'], ['IV', 'Training', '#ffb27a'], ['V', 'Optimise', '#8fe8ff'], ['VI', 'Deploy', '#b49bff'], ['VII', 'Inference', '#9ff7dc'], ['VIII', 'Generate', '#ff9a7a']];
const NAMES = { genesis: 'The brain', neuron: 'One neuron', data: 'Data', tok: 'The tokenizer', arch: 'Building a transformer', fwd: 'The forward pass', train: 'Training', fit: 'Overfitting', tune: 'Tuning · LHAASO', comp: 'Compression', auto: 'AutoDeploy', race: 'The race on real chips', fpga: 'Inside the FPGA', chip: 'Silicon to data centre', infer: 'Speculative decoding', globe: 'Talks around the world', cur: 'Curiosity', make: 'What I make', end: 'The end' };
const MAIL = 'hafizabc77@gmail.com';

export default function finale(ctx) {
  const { small, ui, score, pointer, renderer, coarse } = ctx;
  const scene = new THREE.Scene();
  scene.background = col('#050307');
  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, .05, 400);
  const r = rng(2121);
  let tall = false;
  const dust = motes(small ? 300 : 700, [80, 30, 50], '#ffc0a0'); scene.add(dust.pts);

  /* ---------- The film as one path ---------- */
  const ctrl = ACTS.map((_, i) => new THREE.Vector3((i - 3.5) * 4.4, Math.sin(i * .9) * 1.6 + 3, Math.cos(i * .7) * 2.4 - 1));
  const curve = new THREE.CatmullRomCurve3(ctrl, false, 'catmullrom', .5);
  const N = 1400, pp = [], pc = [], pu = [];
  for (let i = 0; i < N; i++) { const u = i / (N - 1), v = curve.getPointAt(u), k = Math.min(ACTS.length - 1, Math.floor(u * ACTS.length)), c = col(ACTS[k][2]).lerp(col(ACTS[Math.min(ACTS.length - 1, k + 1)][2]), u * ACTS.length - k); pp.push(v.x, v.y, v.z); pc.push(c.r, c.g, c.b); pu.push(u); }
  const pathMat = additive({ uniforms: { uPx: { value: 1000 }, uDraw: { value: 0 }, uT: { value: 0 } }, vertexShader: 'attribute vec3 color; attribute float aU; uniform float uPx, uDraw, uT; varying vec3 vColor; varying float vAlpha; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; float run = pow(.5 + .5 * sin(aU * 80. - uT * 3.), 6.); gl_PointSize = max(1., uPx * (.06 + run * .04) / -mv.z); vColor = color * (.8 + run * .8); vAlpha = step(aU, uDraw) * .85; }', fragmentShader: POINT_FRAG });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(pc, 3)); g.setAttribute('aU', new THREE.Float32BufferAttribute(pu, 1));
  const path = new THREE.Points(g, pathMat); path.frustumCulled = false; scene.add(path);
  const actGlows = ACTS.map((a, i) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: col(a[2]), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 })); s.position.copy(curve.getPointAt((i + .5) / ACTS.length)); s.scale.setScalar(1.6); scene.add(s); return s; });
  // Every scene of the film, as a point on the path.
  let scenes = [];
  function placeScenes() {
    const plan = ctx.plan || [], total = plan.length ? plan[plan.length - 1].end : 1;
    scenes = plan.filter(P => P.sc).map(P => { const u = clamp((P.start + P.dur / 2) / total), s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: col('#ffe6a8'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 })); s.position.copy(curve.getPointAt(u)); s.scale.setScalar(.7); scene.add(s); return { id: P.sc.id, u, s, lab: ui.label('end', `<span class="tag">${NAMES[P.sc.id] || P.sc.id}</span>`, 'plain scene-dot-lab'), lit: 0 }; });
  }

  /* ---------- Words: act names, the role picker, the credits, your turn ---------- */
  const actLabs = ACTS.map(a => ui.label('end', `<span class="tag"><i>${a[0]}</i>${a[1]}</span>`, 'plain act-lab'));
  const roles = document.createElement('div'); roles.className = 'end-roles';
  roles.innerHTML = '<p class="er-q">What are you hiring for?</p><div class="er-chips"></div><div class="er-panel"></div>';
  const credits = document.createElement('div'); credits.className = 'credits';
  credits.innerHTML = `<div class="cr-roll">
    <p class="cr-k">Forward Pass</p><h2>Mustofa A. Ahmed <span>(Hafiz)</span></h2><p class="cr-sub">Machine learning engineer · PhD student, UCAS · IHEP, Beijing</p>
    <h3>Education</h3><ul><li><b>PhD, Computer Application Technology</b><span>University of Chinese Academy of Sciences · IHEP · 2026 –</span></li><li><b>M.Eng., Computer Application Technology</b><span>University of Chinese Academy of Sciences · IHEP · 2023 – 2026</span></li><li><b>B.Sc., Microelectronics Engineering</b><span>Yangzhou University · 2019 – 2023</span></li></ul>
    <h3>Experience</h3><ul><li><b>Algorithm R&amp;D Intern · Zidong Taichu (紫东太初)</b><span>Jul – Oct 2026 · speculative decoding in vLLM</span></li><li><b>Research Fellow · IHEP Computing Center, CAS</b><span>2023 – now · ML deployment for CEPC, CMS and LHAASO; AutoDeploy</span></li><li><b>Web Developer · GeePower Energy Technology</b><span>2021 – 2022 · the company website, database and all</span></li></ul>
    <h3>Papers</h3><ul>
      <li><b>Draft-budget trade-offs in block-parallel speculative decoding: an empirical study</b><span>Mustofa, Cheng · submitted to IEEE CSCWD 2027 · first author</span></li>
      <li><a href="https://doi.org/10.1007/s41605-026-00734-w" target="_blank" rel="noopener"><b>A knowledge-driven framework for HEP model deployment on heterogeneous hardware</b></a><span>Mustofa, Cheng · Radiation Detection Technology and Methods, 2026 · first author</span></li>
      <li><a href="https://doi.org/10.1109/cscwd68734.2026.11582304" target="_blank" rel="noopener"><b>MCG: a multi-data-center content gateway for topology-hiding and secure WAN storage access</b></a><span>Wei, Meng, Li, Mustofa, Cheng, Li, Bi · IEEE CSCWD 2026</span></li>
      <li><a href="https://doi.org/10.1051/epjconf/202533701330" target="_blank" rel="noopener"><b>Enhancing GRB detection: Bayesian optimization of triggerless data analysis for LHAASO-WCDA</b></a><span>Mustofa, Cheng, Yao · EPJ Web of Conferences 337 (CHEP 2024) · first author</span></li>
      <li><a href="https://doi.org/10.1007/s41605-024-00490-9" target="_blank" rel="noopener"><b>Fast lossless images compression for synchrotron radiation facility using deep learning and hybrid architecture</b></a><span>Zhang, Fu, Gao, Cheng, Mustofa, Chen · Radiation Detection Technology and Methods 8, 2024</span></li>
      <li><a href="https://doi.org/10.1155/2023/8571506" target="_blank" rel="noopener"><b>SECHA: a smart energy-efficient and cost-effective home automation system for developing countries</b></a><span>Mustofa, Dagnew, Gantela, Idrisi · Journal of Computer Networks and Communications, 2023 · first author</span></li></ul>
    <h3>Talks and workshops</h3><ul><li><b>AutoDeploy, a toolkit for HEP ML deployment</b><span>17th FCPPN/L Workshop · Lyon · 2026</span></li><li><b>Quantum Computing and Machine Learning Workshop</b><span>Sun Yat-sen University · Shenzhen · 2026 · participant</span></li><li><b>Optimizing triggerless GRB analysis for LHAASO-WCDA</b><span>CHEP 2024 · Kraków</span></li><li><b>International Workshop on the High Energy CEPC</b><span>Hangzhou · 2024 · participant</span></li><li><b>Enhancing GRB detection for LHAASO-WCDA</b><span>Quantum Computing and Machine Learning Workshop · Jilin University, Changchun · 2024</span></li></ul>
    <h3>Awards</h3><ul><li><b>CSC Chinese Government Scholarship</b><span>2026</span></li><li><b>IHEP Director’s Award, Best Graduation Project</b><span>2026</span></li><li><b>ANSO Scholarship for Young Talents</b><span>2023</span></li><li><b>Yangjie “Excellent Student” Scholarship</b><span>2021</span></li></ul>
    <h3>The toolbox</h3><ul class="cr-tools"><li><b>LLM inference and serving</b><span>vLLM · llama.cpp · DFlash · DSpark · MTP · CUDA Graphs</span></li><li><b>Model optimisation</b><span>TensorRT · ONNX · PTQ · QAT · pruning · hls4ml · Vitis AI</span></li><li><b>Deep learning</b><span>PyTorch · Hugging Face · GNNs (HGT, TGN) · RL · Bayesian optimisation</span></li><li><b>Programming and infrastructure</b><span>Python · C++ · CUDA · Linux · Docker · Git · CI/CD · Neo4j</span></li><li><b>Hardware</b><span>NVIDIA GPUs · Xilinx FPGAs · Huawei Ascend NPUs</span></li></ul>
    <h3>Research interests</h3><p class="cr-p">ML acceleration · efficient LLM inference · world models · autonomous agents</p>
    <h3>Languages</h3><p class="cr-p">English · Amharic · Mandarin</p>
    <h3>When nobody is asking</h3><p class="cr-p">MetaHuman and Unreal Engine 5 · songs and music videos with AI voices · volleyball, badminton, swimming, Spurs</p>
    <p class="cr-made">Built with Three.js, hand-written shaders and the Web Audio API. Land on the globe: Natural Earth (public domain).</p>
  </div>`;
  const fin = document.createElement('div'); fin.className = 'end-final';
  fin.innerHTML = `<p class="ef-k">Your turn to prompt</p>
    <form class="ef-prompt"><input type="text" name="msg" placeholder="Write to Hafiz: a role, a question, an idea…" aria-label="Your message to Hafiz" autocomplete="off"><button type="submit">Send ↵</button></form>
    <small class="ef-note">This opens your own email app with your message, addressed to Hafiz.</small>
    <div class="ef-links"><a class="btn gold" href="../assets/Mustofa-Ahmed-Resume-EN.pdf" target="_blank" rel="noopener">Resume, English</a><a class="btn" href="../assets/Mustofa-Ahmed-Resume-ZH.pdf" target="_blank" rel="noopener">简历 · 中文</a><a class="btn" href="mailto:${MAIL}">${MAIL}</a></div>
    <p class="ef-more">Work email <a href="mailto:mustofa@ihep.ac.cn">mustofa@ihep.ac.cn</a> · WeChat <b>hafizabc77</b> · <a href="https://github.com/hafizabc77" target="_blank" rel="noopener">GitHub</a> · <a href="https://orcid.org/0009-0009-4363-9342" target="_blank" rel="noopener">ORCID</a> · <a href="../index.html">Classic site</a></p>
    <div class="ef-foot"><img class="ef-qr" src="../assets/showcase/wechat-qr.webp" alt="WeChat QR code for hafizabc77" loading="lazy"><figure class="ef-flag"><img src="../assets/showcase/flag-small.webp" alt="" loading="lazy"><figcaption>For dignity. For peace.</figcaption></figure></div>
    <button type="button" class="btn ghost ef-top">Back to the start ↑</button>`;
  ctx.$('#scene-ui').append(roles, credits, fin);
  fin.querySelector('.ef-prompt').addEventListener('submit', e => { e.preventDefault(); const msg = fin.querySelector('input').value.trim(); location.href = `mailto:${MAIL}?subject=${encodeURIComponent('Hello Hafiz')}&body=${encodeURIComponent(msg || 'Hello Hafiz,')}`; score.sfx('chime'); });
  fin.querySelector('.ef-top').addEventListener('click', () => ctx.go && ctx.go(0));

  let role = -1;
  function renderRoles() {
    const list = ctx.roles || [];
    if (!list.length) return;
    roles.querySelector('.er-chips').innerHTML = list.map((rl, i) => `<button type="button" data-r="${i}">${rl.name}</button>`).join('');
    roles.querySelectorAll('[data-r]').forEach(b => b.addEventListener('click', () => { role = +b.dataset.r; showRole(); score.sfx('chime', { f: 400 + role * 90 }); }));
  }
  function showRole() {
    const rl = (ctx.roles || [])[role]; if (!rl) return;
    roles.querySelectorAll('[data-r]').forEach((b, i) => b.classList.toggle('sel', i === role));
    roles.querySelector('.er-panel').innerHTML = `<p class="er-pitch">${rl.pitch}</p><div class="er-proofs">${rl.proofs.map(([id, p, act, tt]) => `<button type="button" data-go="${id}:${p}"><span>${act}</span>${tt}<i>→</i></button>`).join('')}</div>`;
    roles.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { const [id, p] = b.dataset.go.split(':'); if (ctx.jump) ctx.jump(id, parseFloat(p)); }));
  }

  /* ---------- Camera ---------- */
  const cpos = new THREE.Vector3(), cat = new THREE.Vector3(), off = new THREE.Vector3(), turn = new THREE.Vector2(), tmp = new THREE.Vector3();
  let localP = 0, rendered = false;
  return {
    id: 'end', scene, camera, extra: {},
    captions: [
      { at: [.02, .14], html: 'Eight acts, from a spark in a brain to a song. Every stop is something I studied, built or made.', x: 50, y: 13, cls: 'note center-note', align: 'center' }
    ],
    resize(aspect) { camera.aspect = aspect; camera.updateProjectionMatrix(); tall = aspect < 1; },
    init() { this.resize(innerWidth / innerHeight); },
    show(on) { if (!on) { roles.classList.remove('on'); credits.classList.remove('on'); fin.classList.remove('on'); } },
    pointer() {},
    update(p, info) {
      localP = p;
      const t = info.time, act = info.active, dt = info.dt, px = pixelScale(renderer, camera);
      pathMat.uniforms.uPx.value = px; pathMat.uniforms.uT.value = t; dust.mat.uniforms.uTime.value = t; dust.mat.uniforms.uPx.value = px;
      if (!scenes.length && ctx.plan) placeScenes();
      if (!rendered && ctx.roles) { rendered = true; renderRoles(); }

      /* The path draws itself from the last act back to the first, and stays. */
      pathMat.uniforms.uDraw.value = 1;
      actGlows.forEach((s, i) => { s.material.opacity = (.5 + .2 * Math.sin(t * 2 + i)) * sstep(.02, .08, p); });
      const proofIds = role >= 0 && ctx.roles ? ctx.roles[role].proofs.map(x => x[0]) : [];
      scenes.forEach(o => { const want = proofIds.includes(o.id) ? 1 : 0; o.lit += (want - o.lit) * Math.min(1, dt * 5); o.s.material.opacity = sstep(.04, .1, p) * (.25 + o.lit * .75); o.s.scale.setScalar(.5 + o.lit * .7); });

      /* Camera: from the last act out to the whole path, then slowly back towards the first. */
      const fit = Math.max(36 / camera.aspect, 12) / (2 * Math.tan(THREE.MathUtils.degToRad(21)));
      const end = curve.getPointAt(1), start = curve.getPointAt(0);
      const k0 = easeInOut(clamp(p / .12)), k1 = easeInOut(clamp((p - .86) / .14));
      cat.copy(end).lerp(new THREE.Vector3(0, 3, -1), k0).lerp(start.clone().setY(3.2), k1 * .6);
      cpos.copy(cat).add(tmp.set(0, lerp(1.4, tall ? 2 : 4, k0), lerp(6, tall ? fit * .62 : fit, k0) * (1 - k1 * .35)));
      const want = pointer.inside && !coarse ? pointer.ndc : null;
      turn.x += ((want ? want.x : 0) - turn.x) * Math.min(1, dt * 2); turn.y += ((want ? want.y : 0) - turn.y) * Math.min(1, dt * 2);
      off.subVectors(cpos, cat).applyAxisAngle(new THREE.Vector3(0, 1, 0), -turn.x * .06 + Math.sin(t * .1) * .05); off.y += turn.y * .4;
      camera.position.copy(cat).add(off); camera.lookAt(cat);

      /* Words. */
      ACTS.forEach((a, i) => ui.place(actLabs[i], actGlows[i].position.clone().add(tmp.set(0, .9, 0)), camera, act && p > .06 && p < .46 && (!tall || i % 2 === 0)));
      scenes.forEach(o => ui.place(o.lab, o.s.position.clone().add(tmp.set(0, -.55, 0)), camera, act && o.lit > .5 && p > .12 && p < .46 && !tall));
      roles.classList.toggle('on', act && p > .14 && p < .46);
      credits.classList.toggle('on', act && p > .46 && p < .87);
      const roll = clamp((p - .46) / .41);
      credits.querySelector('.cr-roll').style.transform = `translateY(${(100 - roll * 100).toFixed(2)}vh) translateY(${(-roll * 100).toFixed(2)}%)`;
      fin.classList.toggle('on', act && p > .87);
    }
  };
}
