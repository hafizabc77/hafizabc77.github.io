/* Act VII, scene 18: the whole world, asking.
   It opens on the point of light the screen shrank to: Beijing, seen from just above the night side of a dotted Earth
   (land as points, from Natural Earth). The camera pulls back; requests arc between cities everywhere. Beijing is home
   (IHEP, UCAS, Zidong Taichu); then gold arcs fly to the cities where Hafiz presented his work or joined workshops:
   Kraków (CHEP 2024), Changchun (2024), Hangzhou (2024), Lyon (2026), Shenzhen (2026). Drag to turn the Earth; hover a
   city for what happened there. It ends diving back into Beijing, towards his desk. */
import * as THREE from 'three';
import { additive, POINT_FRAG, col, rng, sstep, clamp, lerp, easeInOut, pixelScale, glowTexture } from '../core/util.js';
import { motes } from '../core/glass.js';
import { LAND_COUNT, LAND_B64 } from '../data/land.js';

const RG = 5;
const CITIES = [['Beijing', 39.9, 116.4], ['Shanghai', 31.2, 121.5], ['Tokyo', 35.7, 139.7], ['Seoul', 37.6, 127], ['Delhi', 28.6, 77.2], ['Mumbai', 19.1, 72.9], ['Singapore', 1.35, 103.8], ['Jakarta', -6.2, 106.8], ['Sydney', -33.9, 151.2], ['Dubai', 25.2, 55.3], ['Cairo', 30, 31.2], ['Lagos', 6.5, 3.4], ['Nairobi', -1.3, 36.8], ['Addis Ababa', 9, 38.7], ['Johannesburg', -26.2, 28], ['London', 51.5, -.1], ['Paris', 48.9, 2.35], ['Berlin', 52.5, 13.4], ['Madrid', 40.4, -3.7], ['Moscow', 55.8, 37.6], ['Istanbul', 41, 29], ['New York', 40.7, -74], ['Los Angeles', 34, -118.2], ['Chicago', 41.9, -87.6], ['Toronto', 43.7, -79.4], ['Mexico City', 19.4, -99.1], ['São Paulo', -23.6, -46.6], ['Buenos Aires', -34.6, -58.4], ['San Francisco', 37.8, -122.4], ['Hong Kong', 22.3, 114.2], ['Bangalore', 12.97, 77.6], ['Riyadh', 24.7, 46.7]];
const HOME = [39.9, 116.4];
const TALKS = [
  { city: 'Kraków', lat: 50.06, lon: 19.94, year: 2024, what: 'CHEP 2024 · talk', title: 'Optimizing triggerless GRB analysis for LHAASO-WCDA' },
  { city: 'Changchun', lat: 43.82, lon: 125.32, year: 2024, what: 'Quantum Computing and Machine Learning Workshop, Jilin University · talk', title: 'Enhancing GRB detection for LHAASO-WCDA' },
  { city: 'Hangzhou', lat: 30.27, lon: 120.15, year: 2024, what: 'International Workshop on the High Energy CEPC · participant', title: '' },
  { city: 'Lyon', lat: 45.76, lon: 4.84, year: 2026, what: '17th FCPPN/L Workshop · talk', title: 'AutoDeploy, a toolkit for HEP ML deployment' },
  { city: 'Shenzhen', lat: 22.54, lon: 114.06, year: 2026, what: 'Quantum Computing and Machine Learning Workshop, Sun Yat-sen University · participant', title: '' }
];
const D2R = Math.PI / 180;
const ll = (lat, lon, rad = RG, out = new THREE.Vector3()) => out.set(rad * Math.cos(lat * D2R) * Math.sin(lon * D2R), rad * Math.sin(lat * D2R), rad * Math.cos(lat * D2R) * Math.cos(lon * D2R));

export default function globe(ctx) {
  const { small, ui, score, pointer, renderer, coarse } = ctx;
  const scene = new THREE.Scene();
  scene.background = col('#03030a');
  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, .05, 600);
  const r = rng(1818);
  let tall = false;
  const dust = motes(small ? 300 : 700, [140, 80, 140], '#c9b8ff'); dust.pts.position.y = -20; scene.add(dust.pts);
  const earth = new THREE.Group(); scene.add(earth);
  earth.rotation.order = 'XYZ';

  /* ---------- The ocean, the atmosphere, the land ---------- */
  const ocean = new THREE.Mesh(new THREE.SphereGeometry(RG * .992, 72, 48), new THREE.ShaderMaterial({ uniforms: { uO: { value: 1 } },
    vertexShader: 'varying vec3 vN, vV; void main() { vec4 w = modelMatrix * vec4(position, 1.); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: 'uniform float uO; varying vec3 vN, vV; void main() { float f = pow(1. - max(dot(vN, vV), 0.), 3.5); gl_FragColor = vec4(mix(vec3(.006, .008, .02), vec3(.07, .07, .24), f) * uO, 1.); }' }));
  earth.add(ocean);
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(RG * 1.06, 64, 40), new THREE.ShaderMaterial({ uniforms: { uO: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
    vertexShader: 'varying vec3 vN, vV; void main() { vec4 w = modelMatrix * vec4(position, 1.); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: 'uniform float uO; varying vec3 vN, vV; void main() { float f = pow(max(dot(-vN, vV), 0.), 3.); gl_FragColor = vec4(vec3(.42, .36, 1.) * f * .4 * uO, 1.); }' }));
  scene.add(atmo);
  const raw = Uint8Array.from(atob(LAND_B64), c => c.charCodeAt(0)), dv = new DataView(raw.buffer);
  const lp = [], ls = [];
  for (let i = 0; i < LAND_COUNT; i++) { const lat = dv.getInt16(i * 4, true) / 100, lon = dv.getInt16(i * 4 + 2, true) / 100, v = ll(lat, lon, RG * 1.002); lp.push(v.x, v.y, v.z); ls.push(.5 + r() * .5); }
  const geoOf = attrs => { const g = new THREE.BufferGeometry(); Object.entries(attrs).forEach(([k, [arr, n]]) => g.setAttribute(k, new THREE.Float32BufferAttribute(arr, n))); return g; };
  const landMat = additive({ uniforms: { uPx: { value: 1000 }, uO: { value: 1 } }, vertexShader: 'attribute float aS; uniform float uPx, uO; varying vec3 vColor; varying float vAlpha; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = max(1., uPx * .05 * aS / -mv.z); vColor = mix(vec3(.4, .45, .85), vec3(.62, .66, .95), aS); vAlpha = uO * .5; }', fragmentShader: POINT_FRAG });
  const land = new THREE.Points(geoOf({ position: [lp, 3], aS: [ls, 1] }), landMat); land.frustumCulled = false; earth.add(land);
  // City lights.
  const cp = [], cs = []; CITIES.forEach(([, la, lo]) => { for (let k = 0; k < 7; k++) { const v = ll(la + (r() - .5) * 1.6, lo + (r() - .5) * 1.6, RG * 1.004); cp.push(v.x, v.y, v.z); cs.push(k ? .5 + r() * .5 : 1.4); } });
  const cityMat = additive({ uniforms: { uPx: { value: 1000 }, uO: { value: 1 }, uT: { value: 0 } }, vertexShader: 'attribute float aS; uniform float uPx, uO, uT; varying vec3 vColor; varying float vAlpha; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = max(1., uPx * .07 * aS / -mv.z); vColor = vec3(1., .82, .5); vAlpha = uO * (.6 + .4 * sin(uT * 2. + position.x * 3.)); }', fragmentShader: POINT_FRAG });
  const lights = new THREE.Points(geoOf({ position: [cp, 3], aS: [cs, 1] }), cityMat); lights.frustumCulled = false; earth.add(lights);

  /* ---------- Requests arcing between cities, and Hafiz's own arcs ---------- */
  const arcPts = (a, b, n, lift) => { const out = []; for (let i = 0; i <= n; i++) { const u = i / n, v = new THREE.Vector3().copy(a).lerp(b, u).normalize(); v.multiplyScalar(RG * (1.004 + Math.sin(u * Math.PI) * lift)); out.push(v); } return out; };
  const NA = small ? 28 : 46, SEG = 40, ap = [], au = [], as = [];
  for (let k = 0; k < NA; k++) {
    let i = Math.floor(r() * CITIES.length), j = Math.floor(r() * CITIES.length); if (i === j) j = (j + 5) % CITIES.length;
    const A = ll(CITIES[i][1], CITIES[i][2]), B = ll(CITIES[j][1], CITIES[j][2]), pts = arcPts(A, B, SEG, .03 + A.distanceTo(B) / RG * .05), seed = r();
    for (let s = 0; s < SEG; s++) { ap.push(pts[s].x, pts[s].y, pts[s].z, pts[s + 1].x, pts[s + 1].y, pts[s + 1].z); au.push(s / SEG, (s + 1) / SEG); as.push(seed, seed); }
  }
  const reqMat = new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uO: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'attribute float aU, aSeed; varying float vU, vS; void main() { vU = aU; vS = aSeed; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: 'uniform float uT, uO; varying float vU, vS; void main() { float h = fract(uT * (.18 + vS * .2) + vS * 7.); float d = vU - h; float c = exp(-d * d / .004) * step(d, .0) + exp(-d * d / .0004); gl_FragColor = vec4(vec3(.62, .58, 1.) * (c * .7 + .025) * uO, 1.); }' });
  const requests = new THREE.LineSegments(geoOf({ position: [ap, 3], aU: [au, 1], aSeed: [as, 1] }), reqMat); requests.frustumCulled = false; earth.add(requests);
  const homeV = ll(HOME[0], HOME[1]);
  const talkArcs = TALKS.map(tk => {
    const pts = arcPts(homeV, ll(tk.lat, tk.lon), 64, .05 + homeV.distanceTo(ll(tk.lat, tk.lon)) / RG * .1), p = [], u = [];
    for (let s = 0; s < 64; s++) { p.push(pts[s].x, pts[s].y, pts[s].z, pts[s + 1].x, pts[s + 1].y, pts[s + 1].z); u.push(s / 64, (s + 1) / 64); }
    const m = new THREE.ShaderMaterial({ uniforms: { uDraw: { value: 0 }, uO: { value: 0 }, uT: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'attribute float aU; varying float vU; void main() { vU = aU; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: 'uniform float uDraw, uO, uT; varying float vU; void main() { float on = step(vU, uDraw); float spark = exp(-pow((vU - uDraw) * 30., 2.)); float flow = .55 + .45 * sin(vU * 60. - uT * 4.); gl_FragColor = vec4(vec3(1., .82, .45) * (on * (.5 + .5 * flow) + spark * 2.) * uO, 1.); }' });
    const line = new THREE.LineSegments(geoOf({ position: [p, 3], aU: [u, 1] }), m); line.frustumCulled = false; earth.add(line);
    const ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: col('#ffd27a'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 })); ring.position.copy(ll(tk.lat, tk.lon, RG * 1.01)); ring.scale.setScalar(.6); earth.add(ring);
    return { m, ring, end: ll(tk.lat, tk.lon, RG * 1.02) };
  });
  const homeGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: col('#fff1c8'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 1 })); homeGlow.position.copy(ll(HOME[0], HOME[1], RG * 1.01)); earth.add(homeGlow);

  /* ---------- Words ---------- */
  const L = (html, cls) => ui.label('globe', html, cls);
  const homeLab = L('<span class="tag"><b>Beijing</b><small>home · IHEP · UCAS · Zidong Taichu</small></span>', 'plain city-lab home l');
  const SIDE = { 'Kraków': 'r', 'Changchun': 'r', 'Hangzhou': 'r', 'Lyon': 'l', 'Shenzhen': 'b' };
  const talkLabs = TALKS.map(tk => L(`<span class="tag"><b>${tk.city} <i>${tk.year}</i></b><small>${tk.what}</small>${tk.title ? `<em>${tk.title}</em>` : ''}</span>`, `plain city-lab ${SIDE[tk.city]}`));
  const countLab = L('<span class="tag"><b>3</b> talks · <b>2</b> workshops · <b>3</b> countries</span>', 'plain stat-lab');

  /* ---------- Turning the Earth: scripted focus, plus your drag ---------- */
  const focusAt = p => {
    const keys = [[0, HOME[0], HOME[1]], [.3, HOME[0], HOME[1]], [.42, 44, 62], [.8, 44, 62], [.92, HOME[0], HOME[1]], [1, HOME[0], HOME[1]]];
    let i = 0; while (i < keys.length - 2 && p > keys[i + 1][0]) i++;
    const [pa, la0, lo0] = keys[i], [pb, la1, lo1] = keys[i + 1], e = easeInOut(clamp((p - pa) / Math.max(1e-4, pb - pa)));
    return [lerp(la0, la1, e), lerp(lo0, lo1, e)];
  };
  let dragging = false, lastX = 0, lastY = 0, yawU = 0, pitchU = 0, localP = 0, hotTalk = -1;
  const cpos = new THREE.Vector3(), cat = new THREE.Vector3(), tmp = new THREE.Vector3();

  return {
    id: 'globe', scene, camera, extra: {},
    captions: [
      { at: [.03, .15], html: 'Each arc is a request, answered in a data centre like that one.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.15, .3], html: 'Home, for me, is <b>Beijing</b>: IHEP and UCAS, where I do my PhD, and Zidong Taichu, where I interned.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.31, .5], html: 'From there the work travels: the burst search to <b>CHEP 2024</b> in Kraków and to Changchun, and the CEPC workshop in Hangzhou.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.5, .68], html: 'In 2026, <b>AutoDeploy</b> went to the FCPPN/L workshop in Lyon, and I joined a quantum computing and ML workshop in Shenzhen.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.33, .82], html: `<span class="hint-dot"></span>${coarse ? 'Drag to turn the Earth · tap a city' : 'Drag to turn the Earth · hover a city'}`, x: 50, y: 92, cls: 'hint', align: 'center', m: { x: 50, y: 88 } },
      { at: [.82, 1.05], html: 'But most of these answers forget you the moment the chat ends. Back home, I’m building one that doesn’t.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } }
    ],
    resize(aspect) { camera.aspect = aspect; camera.updateProjectionMatrix(); tall = aspect < 1; },
    init() { this.resize(innerWidth / innerHeight); },
    show(on) { if (!on) { dragging = false; document.body.style.cursor = ''; } },
    pointer(type, e) {
      if (localP < .14 || localP > .86) { dragging = false; document.body.style.cursor = ''; return; }
      if (type === 'down') { dragging = true; lastX = pointer.x; lastY = pointer.y; }
      if (type === 'up') dragging = false;
      if (type === 'move' && dragging) { yawU += (pointer.x - lastX) * .006; pitchU = clamp(pitchU + (pointer.y - lastY) * .004, -.8, .8); lastX = pointer.x; lastY = pointer.y; }
      let best = -1, bd = coarse ? 40 : 28;
      talkArcs.forEach((a, i) => { if (a.m.uniforms.uDraw.value < 1) return; const s = ui.screen(a.end.clone().applyMatrix4(earth.matrixWorld), camera); const d = Math.hypot(s.x - pointer.x, s.y - pointer.y); if (d < bd && s.z < 1) { bd = d; best = i; } });
      if (best !== hotTalk && best >= 0) score.sfx('hover');
      hotTalk = best; document.body.style.cursor = dragging ? 'grabbing' : best >= 0 ? 'pointer' : 'grab';
    },
    update(p, info) {
      localP = p;
      const t = info.time, act = info.active, dt = info.dt, px = pixelScale(renderer, camera);
      [landMat, cityMat].forEach(m => { m.uniforms.uPx.value = px; }); cityMat.uniforms.uT.value = t; reqMat.uniforms.uT.value = t; dust.mat.uniforms.uTime.value = t; dust.mat.uniforms.uPx.value = px;
      if (!dragging) { yawU *= Math.pow(.25, dt); pitchU *= Math.pow(.25, dt); }
      const [fla, flo] = focusAt(p);
      earth.rotation.set(fla * D2R + pitchU, -flo * D2R + yawU + Math.sin(t * .05) * .03, 0);
      earth.updateMatrixWorld();
      reqMat.uniforms.uO.value = sstep(.04, .14, p);
      TALKS.forEach((tk, i) => { const a0 = .33 + i * .07, d = easeInOut(clamp((p - a0) / .06)); talkArcs[i].m.uniforms.uDraw.value = d; talkArcs[i].m.uniforms.uO.value = sstep(a0 - .01, a0 + .01, p); talkArcs[i].m.uniforms.uT.value = t; talkArcs[i].ring.material.opacity = d >= 1 ? .7 + .3 * Math.sin(t * 3 + i) : 0; if (d >= 1 && !talkArcs[i].hit) { talkArcs[i].hit = true; if (act) score.sfx('chime', { f: 440 + i * 80 }); } if (d < .5) talkArcs[i].hit = false; });
      homeGlow.scale.setScalar(.9 + .2 * Math.sin(t * 2) + (1 - sstep(0, .1, p)) * .5);

      /* Camera: from just above Beijing out to the whole Earth, and back down at the end. */
      const D = tall ? RG * 2 / (2 * Math.tan(THREE.MathUtils.degToRad(21)) * camera.aspect) * 1.4 : 16;
      const dist = p < .12 ? lerp(RG + 1.3, D, easeInOut(p / .12)) : p > .9 ? lerp(D, RG + .5, easeInOut((p - .9) / .1)) : D;
      cpos.set(0, 0, dist); cat.set(0, p > .12 && p < .9 && !tall ? -.0 : 0, 0);
      const want = pointer.inside && !coarse && !dragging ? pointer.ndc : null;
      camera.position.copy(cpos).add(tmp.set(want ? want.x * .4 : 0, want ? want.y * .3 : 0, 0)); camera.lookAt(cat);

      /* Words in the world: only the cities on the near side are labelled. */
      const facing = v => { const w = v.clone().applyMatrix4(earth.matrixWorld); return w.dot(tmp.copy(camera.position).sub(w)) > 0 ? w : null; };
      const hw = facing(ll(HOME[0], HOME[1], RG * 1.02)); homeLab.el.classList.toggle('tallb', tall);
      ui.place(homeLab, tall ? new THREE.Vector3(0, -RG - 1.3, 0) : (hw || cat), camera, act && (tall ? p > .14 && p < .33 : !!hw && p > .14 && p < .9));   // on a phone the labels sit under the Earth
      let latest = -1; TALKS.forEach((tk, i) => { if (talkArcs[i].m.uniforms.uDraw.value >= 1) latest = i; });
      TALKS.forEach((tk, i) => { const w = facing(talkArcs[i].end); talkLabs[i].el.classList.toggle('hot', i === hotTalk); talkLabs[i].el.classList.toggle('short', i !== latest && i !== hotTalk); talkLabs[i].el.classList.toggle('tallb', tall); ui.place(talkLabs[i], tall ? new THREE.Vector3(0, -RG - 1.3, 0) : (w || cat), camera, act && (tall || !!w) && talkArcs[i].m.uniforms.uDraw.value >= 1 && p < .88 && (!tall || i === latest)); });
      ui.place(countLab, new THREE.Vector3(0, tall ? -RG - 3.4 : -RG - .9, 0), camera, act && p > .7 && p < .82 && !tall);
    }
  };
}
