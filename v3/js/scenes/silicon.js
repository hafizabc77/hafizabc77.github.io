/* Act VI, scene 16: from one transistor to a data centre, in powers of ten.
   It opens diving into one FPGA cell: a lattice of transistors, then one transistor you can switch (electrons cross from
   source to drain when the gate is on). "This is where I started": a B.Sc. in microelectronics; then zooming out to his
   bachelor's thesis, SECHA, an ESP32 running a home. Then scale up: a V100 die (80 SMs, 640 tensor cores multiplying
   4×4 FP16 tiles: why FP16 won the race), a rack, the aisles of a data centre, and MCG, the storage gateway he co-wrote.
   The data centre's lights pull into one point, a blinking cursor: where Act VII begins. */
import * as THREE from 'three';
import { additive, POINT_FRAG, col, rng, sstep, clamp, lerp, easeInOut, pixelScale, textTexture } from '../core/util.js';
import { cells, slab, floor, motes } from '../core/glass.js';

export default function silicon(ctx) {
  const { small, ui, score, pointer, renderer, coarse } = ctx;
  const scene = new THREE.Scene();
  scene.background = col('#04040a');
  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, .05, 400);
  const r = rng(8404);
  let tall = false;
  scene.add(new THREE.HemisphereLight(col('#c8d6ff'), col('#160c22'), 1.1));
  const key = new THREE.DirectionalLight(col('#ffffff'), 1.7); key.position.set(4, 10, 9); scene.add(key);
  const rim = new THREE.PointLight(col('#9a7bff'), 40, 30); rim.position.set(-6, 6, -4); scene.add(rim);
  const fl = floor(-1.6, '#7a6cff'); scene.add(fl);
  const dust = motes(small ? 140 : 320, [40, 14, 30], '#c9b8ff'); scene.add(dust.pts);
  const std = (c, m = .5, ro = .45, extra = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: col(c), metalness: Math.min(m, .4), roughness: Math.max(ro, .32), transparent: true }, extra));
  const ptsMat = (size, color) => additive({ uniforms: { uPx: { value: 1000 }, uO: { value: 0 } }, vertexShader: `attribute float aS; uniform float uPx, uO; varying vec3 vColor; varying float vAlpha; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = max(1., uPx * ${size.toFixed(3)} * aS / -mv.z); vColor = vec3(${color.join(',')}); vAlpha = uO; }`, fragmentShader: POINT_FRAG });
  const pts = (n, size, color) => { const g = new THREE.BufferGeometry(), p = new Float32Array(n * 3), s = new Float32Array(n).fill(1); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('aS', new THREE.BufferAttribute(s, 1)); const m = ptsMat(size, color), o = new THREE.Points(g, m); o.frustumCulled = false; return { o, p, s, g, m }; };
  const label3 = (text, sub, w, color) => { const { texture, aspect } = textTexture([text], { size: 80, weight: 700, color, sub, subColor: color, subSize: .5, pad: .25 }); return new THREE.Mesh(new THREE.PlaneGeometry(w, w / aspect), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })); };
  // Every stage is a group with its own fade; zooming swaps stages by scale, like powers of ten.
  const stages = [];
  const stage = (fade) => { const g = new THREE.Group(); scene.add(g); const s = { g, fade }; stages.push(s); return s; };
  const fadeStd = (g, o) => g.traverse(m => { if (m.material && m.material.isMeshStandardMaterial) m.material.opacity = o; if (m.material && m.material.isMeshBasicMaterial) m.material.opacity = o; if (m.material && m.material.isLineBasicMaterial) m.material.opacity = o * (m.userData.o ?? 1); });

  /* ---------- 0 · One FPGA cell ---------- */
  const s0 = stage(o => { tile.material.opacity = o; });
  const tile = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, .25), std('#2fe0b4', .2, .5, { emissive: col('#0e5a48'), emissiveIntensity: .8 })); s0.g.add(tile);

  /* ---------- 1 · A lattice of transistors ---------- */
  const LN = 14, lat = cells(LN * LN * 3);
  const s1 = stage(o => { lat.mat.uniforms.uOpacity.value = o; wires.material.opacity = o * .5; });
  s1.g.add(lat.mesh); lat.mesh.renderOrder = 3;
  for (let i = 0; i < LN * LN; i++) { const x = (i % LN - (LN - 1) / 2) * .7, z = (Math.floor(i / LN) - (LN - 1) / 2) * .7; lat.set(i * 3, x - .18, 0, z, .18, .06, .34, -.7, 0, .45); lat.set(i * 3 + 1, x + .18, 0, z, .18, .06, .34, -.7, 0, .45); lat.set(i * 3 + 2, x, .06, z, .1, .08, .4, 1.15, .05, .5); }
  lat.commit();
  const wp = []; for (let k = 0; k < LN; k++) { const v = (k - (LN - 1) / 2) * .7; wp.push(-5, .1, v + .25, 5, .1, v + .25, v + .35, .12, -5, v + .35, .12, 5); }
  const wires = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wp.reduce((a, _, i) => i % 3 === 0 ? [...a, new THREE.Vector3(wp[i], wp[i + 1], wp[i + 2])] : a, [])), new THREE.LineBasicMaterial({ color: 0xb8a0ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); s1.g.add(wires);

  /* ---------- 2 · One transistor ---------- */
  const s2 = stage(o => { fadeStd(s2.g, o); oxide.userData.set(.5 * o, 0); elec.m.uniforms.uO.value = o; chan.material.opacity = o * gateOn * .5; });
  const sub = new THREE.Mesh(new THREE.BoxGeometry(7, 1.4, 3.2), std('#3a4658', .25, .7)); s2.g.add(sub);
  const wells = [-2.3, 2.3].map(x => { const m = new THREE.Mesh(new THREE.BoxGeometry(1.8, .55, 2.7), std('#3f7fe0', .3, .5, { emissive: col('#0d2a66'), emissiveIntensity: .7 })); m.position.set(x, .45, 0); s2.g.add(m); return m; });
  const oxide = slab(2.7, .07, 2.7, '#bfe9ff'); oxide.position.set(0, .74, 0); s2.g.add(oxide);
  const gate = new THREE.Mesh(new THREE.BoxGeometry(2.5, .45, 2.5), std('#d9b25a', .85, .3, { emissive: col('#4a3510'), emissiveIntensity: .4 })); gate.position.set(0, 1.0, 0); s2.g.add(gate);
  const pillars = [-2.3, 0, 2.3].map(x => { const m = new THREE.Mesh(new THREE.CylinderGeometry(.16, .16, 1.6, 20), std('#cfd3da', .9, .25)); m.position.set(x, x === 0 ? 2 : 1.5, 0); s2.g.add(m); return m; });
  const chan = new THREE.Mesh(new THREE.BoxGeometry(2.8, .1, 2.4), new THREE.MeshBasicMaterial({ color: col('#62f5b0'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); chan.position.set(0, .64, 0); s2.g.add(chan);
  const EN = small ? 120 : 220, elec = pts(EN, .12, [.6, .95, 1]); s2.g.add(elec.o);
  const eInfo = Array.from({ length: EN }, () => [r(), r(), (r() - .5) * 2.2, .3 + r() * .5]);
  let gateOn = 0, gateWant = 1, userGate = -99, lastAuto = 0;

  /* ---------- 3 · SECHA: an ESP32 running a home ---------- */
  const s3 = stage(o => { fadeStd(s3.g, o); sig.m.uniforms.uO.value = o; });
  const esp = new THREE.Group(); esp.position.set(-4.6, 0, 0); s3.g.add(esp);
  esp.add(new THREE.Mesh(new THREE.BoxGeometry(3, .12, 1.7), std('#1b2142', .3, .6)));
  const shield = new THREE.Mesh(new THREE.BoxGeometry(1.7, .22, 1.3), std('#c7cbd2', .9, .28)); shield.position.set(-.4, .17, 0); esp.add(shield);
  const espLab = label3('ESP32', 'WROOM', 1.1, '#2a3550'); espLab.rotation.x = -Math.PI / 2; espLab.position.set(-.4, .29, 0); esp.add(espLab);
  for (let k = 0; k < 2; k++) for (let i = 0; i < 12; i++) { const pin = new THREE.Mesh(new THREE.BoxGeometry(.08, .1, .16), std('#d8b45a', .9, .3)); pin.position.set(-1.3 + i * .22, -.02, k ? .86 : -.86); esp.add(pin); }
  const zz = []; for (let i = 0; i < 7; i++) zz.push(new THREE.Vector3(.75 + (i % 2) * .4, .08, -.6 + i * .2));
  const ant = new THREE.Line(new THREE.BufferGeometry().setFromPoints(zz), new THREE.LineBasicMaterial({ color: 0xd8b45a, transparent: true })); esp.add(ant);
  const house = new THREE.Group(); house.position.set(.6, -.2, 0); s3.g.add(house);
  const hp = [[-1.5, 0, 1.5, 0], [1.5, 0, 1.5, 2], [1.5, 2, -1.5, 2], [-1.5, 2, -1.5, 0], [-1.7, 1.9, 0, 3.2], [0, 3.2, 1.7, 1.9]].flatMap(([a, b, c, d]) => [new THREE.Vector3(a, b, 0), new THREE.Vector3(c, d, 0)]);
  const houseLines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(hp), new THREE.LineBasicMaterial({ color: 0xffd9a8, transparent: true })); house.add(houseLines);
  const HOME = [['lights', -.8, 1.3], ['fan', .8, 1.3], ['door lock', 0, .45], ['energy meter', -.9, .45]].map(([name, x, y]) => { const w = new THREE.Mesh(new THREE.PlaneGeometry(.62, .5), new THREE.MeshBasicMaterial({ color: col('#ffd27a'), transparent: true, opacity: 0, depthWrite: false })); w.position.set(x, y, .01); house.add(w); return { name, w, on: 0 }; });
  const SG = 60, sig = pts(SG, .07, [1, .86, .5]); s3.g.add(sig.o);

  /* ---------- 4 · A V100 die and one tensor core ---------- */
  const s4 = stage(o => { fadeStd(s4.g, o); sms.mat.uniforms.uOpacity.value = o; tc.mat.uniforms.uOpacity.value = o; });
  const die = new THREE.Mesh(new THREE.BoxGeometry(6.4, .12, 6.4), std('#1d2028', .7, .35)); s4.g.add(die);
  [[-4.1, -1.3], [-4.1, 1.3], [4.1, -1.3], [4.1, 1.3]].forEach(([x, z]) => { const m = new THREE.Mesh(new THREE.BoxGeometry(1.2, .32, 2.2), std('#3a3f4a', .6, .4)); m.position.set(x, .1, z); s4.g.add(m); });
  const sms = cells(80); s4.g.add(sms.mesh); sms.mesh.renderOrder = 3;
  const SMX = i => -2.6 + (i % 8) * .74, SMZ = i => -2.75 + Math.floor(i / 8) * .61, HOT = 44;
  const tc = cells(48); s4.g.add(tc.mesh); tc.mesh.renderOrder = 3;   // three 4×4 tiles: A × B + C

  /* ---------- 5 · A rack ---------- */
  const s5 = stage(o => { rackFrame.userData.set(.55 * o, 0); servers.mat.uniforms.uOpacity.value = o; leds.m.uniforms.uO.value = o; });
  const rackFrame = slab(2.6, 7.2, 1.6, '#b49bff'); rackFrame.position.y = 2.1; s5.g.add(rackFrame);
  const servers = cells(14); s5.g.add(servers.mesh); servers.mesh.renderOrder = 3;
  for (let i = 0; i < 14; i++) servers.set(i, 0, -1.1 + i * .48, 0, 2.3, .36, 1.3, -.2, 0, .8);
  servers.commit();
  const LD = 14 * 6, leds = pts(LD, .09, [.5, 1, .75]); s5.g.add(leds.o);
  for (let i = 0; i < LD; i++) leds.p.set([-.9 + (i % 6) * .17, -1.1 + Math.floor(i / 6) * .48, .68], i * 3);

  /* ---------- 6 · The aisles of a data centre ---------- */
  const s6 = stage(o => { racks.mat.uniforms.uOpacity.value = o * (1 - endF); aled.m.uniforms.uO.value = o; });
  const NR = 2 * 14, racks = cells(NR); s6.g.add(racks.mesh); racks.mesh.renderOrder = 3;
  for (let i = 0; i < NR; i++) { const side = i % 2 ? 1 : -1, k = Math.floor(i / 2); racks.set(i, side * 2.4, 2, -k * 3, 1.6, 6, 2.4, -.6, 0, .14); }
  racks.commit();
  const AL = small ? 900 : 1800, aled = pts(AL, .05, [.55, 1, .8]), aHome = [];
  for (let i = 0; i < AL; i++) { const side = r() < .5 ? -1 : 1, k = Math.floor(r() * 14); aHome.push(new THREE.Vector3(side * 1.58, -.6 + r() * 5.2, -k * 3 + (r() - .5) * 2)); }
  s6.g.add(aled.o);
  const cursor = new THREE.Mesh(new THREE.BoxGeometry(.07, .2, .02), new THREE.MeshBasicMaterial({ color: col('#f4efe0'), transparent: true, opacity: 0 })); scene.add(cursor);
  let endF = 0;

  /* ---------- Words and cards ---------- */
  const L = (html, cls) => ui.label('chip', html, cls);
  const tLabs = [['source', -2.3, 2.45], ['gate', 0, 2.95], ['drain', 2.3, 2.45]].map(([n, x, y]) => [L(`<span class="tag">${n}</span>`, 'plain part-lab2'), new THREE.Vector3(x, y, 0)]);
  const bitLab = L('<span class="tag"><b>1</b><small>on</small></span>', 'plain bit-lab');
  const homeLabs = HOME.map(h => L(`<span class="tag">${h.name}</span>`, 'plain home-lab'));
  const espName = L('<span class="tag"><b>ESP32</b><small>one small chip, one whole home</small></span>', 'plain chipname-lab');
  const tcLab = L('<span class="tag"><b>one tensor core</b><small>A × B + C · 4×4 tiles · FP16 · every clock</small></span>', 'plain chipname-lab');
  const dieLab = L('<span class="tag"><b>NVIDIA V100</b><small>21 billion transistors · 80 SMs · 640 tensor cores</small></span>', 'plain chipname-lab');
  const card = (img, meta, title, href, cls) => { const a = document.createElement('aside'); a.className = `paper-card mini-card ${cls}`; a.innerHTML = `<div class="pc-img"><img src="../assets/showcase/${img}.webp" alt="" loading="lazy"></div><div class="pc-body"><small>${meta}</small><h3>${title}</h3><div class="pc-btns"><a class="pc-btn" href="${href}" target="_blank" rel="noopener">Read the paper <span aria-hidden="true">↗</span></a></div></div>`; ctx.$('#scene-ui').append(a); return a; };
  const secha = card('paper-secha', 'My bachelor’s thesis · first author · 2023', 'SECHA: a smart, energy-efficient and cost-effective home automation system for developing countries', 'https://doi.org/10.1155/2023/8571506', 'secha');
  const mcg = card('paper-mcg', 'Co-author · IEEE CSCWD 2026', 'MCG: a multi-data-center content gateway for topology-hiding and secure WAN storage access', 'https://doi.org/10.1109/cscwd68734.2026.11582304', 'mcg');

  /* ---------- Timeline: which stage, and the zoom between stages ---------- */
  // [stage, from, to, direction] : zoom in (+1) or out (-1) into the next stage
  const PLAN_ = [[0, 0, .04], [1, .05, .1], [2, .13, .42], [3, .46, .56], [4, .6, .72], [5, .76, .8], [6, .84, 1]];
  const ZOOMS = [[0, 1, .04, .05, 1], [1, 2, .1, .13, 1], [2, 3, .42, .46, -1], [3, 4, .56, .6, -1], [4, 5, .72, .76, -1], [5, 6, .8, .84, -1]];
  const cpos = new THREE.Vector3(), cat = new THREE.Vector3(), off = new THREE.Vector3(), turn = new THREE.Vector2(), tmp = new THREE.Vector3();
  let localP = 0;

  return {
    id: 'chip', scene, camera, extra: {},
    captions: [
      { at: [0, .1], html: 'Each of those logic cells is a few dozen transistors, wired together. Closer still.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.13, .24], html: 'Every chip is built from billions of <b>transistors</b>: switches. Voltage on the gate lets electrons cross. On, off: 1, 0.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.14, .42], html: `<span class="hint-dot"></span>${coarse ? 'Tap' : 'Click'} to switch the transistor`, x: 50, y: 90, cls: 'hint', align: 'center', m: { x: 50, y: 86 } },
      { at: [.24, .32], html: 'Every word a model writes is billions of these switching.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.32, .43], html: 'This is where I started: a B.Sc. in <b>microelectronics</b> at Yangzhou University, learning how chips are designed and made.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.45, .57], html: 'My bachelor’s thesis put one chip in charge of a home: <b>SECHA</b>, low-cost home automation for developing countries on an ESP32. My first paper.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.59, .73], html: 'Scale up: 21 billion transistors make a V100, its 640 <b>tensor cores</b> multiplying FP16 tiles every clock. That is why FP16 won.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.75, .85], html: 'Then cards into servers, servers into racks, racks into data centres that answer millions of requests a day.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.85, .925], html: 'Data centres must also share data safely. <b>MCG</b>, a gateway I co-authored, lets them reach each other’s storage without exposing their wiring.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.93, 1.08], html: 'Somewhere in those racks, a model is answering someone right now.', x: 50, y: 14, cls: 'note center-note', align: 'center' }
    ],
    resize(aspect) { camera.aspect = aspect; camera.updateProjectionMatrix(); tall = aspect < 1; esp.position.set(tall ? -1.7 : -4.6, 0, tall ? 1.8 : 0); house.position.set(tall ? 1.1 : .6, -.2, tall ? -1.2 : 0); },
    init() { this.resize(innerWidth / innerHeight); },
    show(on) { if (!on) { secha.classList.remove('on'); mcg.classList.remove('on'); document.body.style.cursor = ''; } },
    pointer(type) {
      if (localP > .13 && localP < .42) { document.body.style.cursor = 'pointer'; if (type === 'down') { gateWant = gateWant ? 0 : 1; userGate = ctx.time; score.sfx(gateWant ? 'spark' : 'tick'); } }
      else document.body.style.cursor = '';
    },
    update(p, info) {
      localP = p;
      const t = info.time, act = info.active, dt = info.dt, px = pixelScale(renderer, camera);
      [elec.m, sig.m, leds.m, aled.m].forEach(m => { m.uniforms.uPx.value = px; }); dust.mat.uniforms.uTime.value = t; dust.mat.uniforms.uPx.value = px;

      /* Which stages are visible, at what scale. */
      const vis = stages.map(() => ({ o: 0, s: 1 }));
      PLAN_.forEach(([k, a, b]) => { if (p >= a && p <= b) vis[k] = { o: 1, s: 1 }; });
      ZOOMS.forEach(([a, b, p0, p1, dir]) => { if (p > p0 && p < p1) { const u = easeInOut((p - p0) / (p1 - p0)); vis[a] = { o: 1 - u, s: dir > 0 ? lerp(1, 7, u) : lerp(1, .14, u) }; vis[b] = { o: u, s: dir > 0 ? lerp(.15, 1, u) : lerp(6, 1, u) }; } });
      stages.forEach((st, k) => { st.g.visible = vis[k].o > .003; st.g.scale.setScalar(vis[k].s); st.fade(vis[k].o); });
      if (p < .002) { stages[0].g.visible = true; stages[0].fade(1); }

      /* The transistor: the gate switches by itself until you do; electrons cross only when it is on. */
      if (p > .13 && p < .42 && t - userGate > 6 && t - lastAuto > 2.4) { gateWant = gateWant ? 0 : 1; lastAuto = t; }
      gateOn += (gateWant - gateOn) * Math.min(1, dt * 6);
      gate.material.emissiveIntensity = .3 + gateOn * 1.2; chan.material.opacity = vis[2].o * gateOn * .45;
      if (vis[2].o > .001) for (let i = 0; i < EN; i++) {
        const e = eInfo[i]; e[0] = (e[0] + dt * e[3] * (.15 + gateOn)) % 1;
        const x = gateOn > .5 ? lerp(-3, 3, e[0]) : -2.3 + Math.sin(t * 3 + i) * .6, y = gateOn > .5 ? .6 + Math.sin(e[0] * 9 + i) * .03 : .45 + Math.cos(t * 2 + i) * .15;
        elec.p.set([x, y, e[2]], i * 3); elec.s[i] = gateOn > .5 || i % 3 === 0 ? 1 : .5;
      }
      elec.g.attributes.position.needsUpdate = true; elec.g.attributes.aS.needsUpdate = true;

      /* SECHA: signals from the ESP32 switch things in the house. */
      HOME.forEach((h, k) => { h.on = .5 + .5 * Math.sign(Math.sin(t * .9 + k * 1.7)); h.w.material.opacity = vis[3].o * (.12 + h.on * .55); });
      if (vis[3].o > .001) for (let i = 0; i < SG; i++) { const k = i % HOME.length, f = (t * .5 + i / SG * 3) % 1, a = tmp.set(esp.position.x + 1, .3, esp.position.z - .4), b = HOME[k].w.getWorldPosition(new THREE.Vector3()).divideScalar(Math.max(.001, s3.g.scale.x)); const v = new THREE.Vector3().lerpVectors(a, b, f); v.y += Math.sin(f * Math.PI) * 1.2; sig.p.set([v.x, v.y, v.z], i * 3); }
      sig.g.attributes.position.needsUpdate = true;

      /* The die: one SM lit; its tensor core multiplies A × B + C. */
      if (vis[4].o > .001) for (let i = 0; i < 80; i++) sms.set(i, SMX(i), .12, SMZ(i), .64, .08, .52, i === HOT ? 1.15 : .45, i === HOT ? .6 + .4 * Math.sin(t * 4) : .05 * Math.sin(t + i), .9);
      sms.commit();
      const step = Math.floor(t * 2.5) % 4;
      if (vis[4].o > .001) for (let m = 0; m < 3; m++) for (let i = 0; i < 16; i++) { const rr = Math.floor(i / 4), cc = i % 4, hotCell = m === 0 ? rr === step : m === 1 ? cc === step : true; tc.set(m * 16 + i, (tall ? 0 : 5.2) + (m - 1) * 1.55 + (cc - 1.5) * .3, (tall ? 2.6 : 1.5) + (1.5 - rr) * .3, tall ? -3.2 : .8, .25, .25, .06, m === 2 ? .9 : .5, hotCell ? .35 : 0, hotCell ? .75 : .35); }
      tc.commit();

      /* The rack and the aisles: lights blink; at the end they pull into one point, a cursor. */
      if (vis[5].o > .001) for (let i = 0; i < LD; i++) leds.s[i] = (Math.sin(t * (2 + (i % 7)) + i * 3.1) > .3 ? 1 : .35);
      leds.g.attributes.aS.needsUpdate = true;
      endF = easeInOut(clamp((p - .915) / .035));
      if (vis[6].o > .001) for (let i = 0; i < AL; i++) { const h = aHome[i]; tmp.copy(h).lerp(new THREE.Vector3(0, 2.2, -8), endF); aled.p.set([tmp.x, tmp.y, tmp.z], i * 3); aled.s[i] = (Math.sin(t * 3 + i) > .2 ? 1 : .4) * (1 - endF * .95); }
      aled.g.attributes.position.needsUpdate = true; aled.g.attributes.aS.needsUpdate = true;
      s6.g.position.z = p > .84 ? (p - .84) / .1 * 9 * (1 - endF) + endF * 9 : 0;
      cursor.position.set(0, 2.2, 1); cursor.material.opacity = endF * (Math.sin(t * 6) > 0 ? 1 : .15);

      /* Words. */
      const show = (lab, pos, on) => ui.place(lab, pos, camera, act && on);
      tLabs.forEach(([lab, v]) => show(lab, v, vis[2].o > .8));
      const bl = bitLab.el.querySelector('b'), bx = gateWant ? '1' : '0'; if (bl.textContent !== bx) { bl.textContent = bx; bitLab.el.querySelector('small').textContent = gateWant ? 'on' : 'off'; }
      bitLab.el.classList.toggle('off', !gateWant);
      show(bitLab, new THREE.Vector3(tall ? 0 : 4.6, tall ? 3.8 : 1.6, 0), vis[2].o > .8);
      HOME.forEach((h, k) => show(homeLabs[k], h.w.getWorldPosition(new THREE.Vector3()).add(tmp.set(0, -.42, 0)), vis[3].o > .8 && !tall));
      show(espName, esp.position.clone().add(new THREE.Vector3(0, -.9, 0)), vis[3].o > .8);
      show(dieLab, new THREE.Vector3(0, -.6, 3.6), vis[4].o > .8);
      show(tcLab, new THREE.Vector3(tall ? 0 : 5.2, tall ? 3.45 : 2.35, tall ? -3.2 : .8), vis[4].o > .8);
      secha.classList.toggle('on', act && p > .47 && p < .57);
      mcg.classList.toggle('on', act && p > .86 && p < .915);

      /* Camera: a gentle drift; the die is seen from above, the aisle from inside. */
      const V = (a, b) => [new THREE.Vector3(...a), new THREE.Vector3(...b)];
      const NEAR = V([0, 3.4, 9.5], [0, .9, 0]), DIE = V([1.4, 8.4, 9.2], [1.4, .4, .4]), RACK = V([0, 3.4, 13.5], [0, 2.3, 0]), AISLE = V([0, 2.2, 6], [0, 2.2, -6]);
      const seq = [[0, NEAR], [.56, NEAR], [.6, DIE], [.72, DIE], [.76, RACK], [.8, RACK], [.84, AISLE], [1, AISLE]];
      let i = 0; while (i < seq.length - 2 && p > seq[i + 1][0]) i++;
      const [pa, A] = seq[i], [pb, B] = seq[i + 1], e = easeInOut(clamp((p - pa) / Math.max(1e-4, pb - pa)));
      cpos.lerpVectors(A[0], B[0], e); cat.lerpVectors(A[1], B[1], e);
      const K = tall ? Math.min(2.3, 1.05 / camera.aspect) * (i >= 6 ? lerp(1, 1 / Math.min(2.3, 1.05 / camera.aspect), i === 6 ? e : 1) : 1) : 1;
      off.subVectors(cpos, cat).multiplyScalar(K); cpos.copy(cat).add(off);
      const want = pointer.inside && !coarse ? pointer.ndc : null;
      turn.x += ((want ? want.x : 0) - turn.x) * Math.min(1, dt * 2); turn.y += ((want ? want.y : 0) - turn.y) * Math.min(1, dt * 2);
      off.subVectors(cpos, cat).applyAxisAngle(new THREE.Vector3(0, 1, 0), -turn.x * .06 + Math.sin(t * .15) * .04); off.y += turn.y * .3;
      camera.position.copy(cat).add(off); camera.lookAt(cat);
    }
  };
}
