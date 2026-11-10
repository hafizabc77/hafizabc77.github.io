/* Deep space, as a long-exposure photograph would show it: mostly black, a faint Milky Way with mottled star clouds
   and dark dust lanes, a little dim nebulosity, and a dense field of tiny stars of natural brightness and colour.
   The sky is painted once into a cube map (free per frame). A few distant objects sit around the edge of the frame,
   small and faint: the Crab and Helix nebulae (NASA/ESA images), some far-off galaxies, and the rare shooting star. */
import * as THREE from 'three';
import { additive, POINT_FRAG, rng, unitVector, gaussian, col, loadImage, glowTexture } from './util.js';

const SKY = `
  varying vec3 vDir;
  float h(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float n3(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
    return mix(mix(mix(h(i), h(i + vec3(1, 0, 0)), f.x), mix(h(i + vec3(0, 1, 0)), h(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(h(i + vec3(0, 0, 1)), h(i + vec3(1, 0, 1)), f.x), mix(h(i + vec3(0, 1, 1)), h(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
  float fbm(vec3 p) { float s = 0., a = .5; for (int i = 0; i < 6; i++) { s += a * n3(p); p = p * 2.03 + vec3(1.7, 9.2, 3.4); a *= .5; } return s; }
  // Sharp stars: one candidate per cell, each a tiny soft disc at its own offset and brightness.
  float starLayer(vec3 d, float scale, float density) {
    vec3 g = d * scale, cell = floor(g), f = fract(g) - .5;
    if (h(cell) < 1. - density) return 0.;
    vec3 off = vec3(h(cell + 1.7), h(cell + 3.1), h(cell + 5.3)) - .5;
    float dist = length(f - off * .7);
    return exp(-dist * dist * 55.) * (.35 + .65 * h(cell + 9.1));
  }
  void main() {
    vec3 d = normalize(vDir);
    vec3 N = normalize(vec3(.38, 1., .22));                                            // the galactic plane
    float lat = dot(d, N);
    float band = exp(-pow(lat * 3.4, 2.));
    float core = exp(-pow(length(d - normalize(vec3(-.7, -.22, -.65))) * 1.6, 2.));   // the galactic centre, off to one side
    float mott = fbm(d * 7.);                                                          // clumpy star clouds
    float rift = smoothstep(.48, .72, fbm(d * 3.6 + vec3(2., 0., 1.))) * exp(-pow(lat * 9., 2.));   // dark dust lanes along the middle
    float hush = 1. - .75 * exp(-pow(length(d - vec3(0., 0., -1.)) * 1.8, 2.));     // the sky behind the subject stays darkest
    vec3 c = vec3(.004, .004, .009);
    vec3 milky = mix(vec3(.5, .48, .56), vec3(.62, .52, .44), core) * (band * (.3 + .7 * mott) + core * .6) * (1. - rift * .8);
    c += milky * .09;
    float neb = smoothstep(.55, .85, fbm(d * 2.6 + vec3(5.))) * band;                 // faint hydrogen red and reflection blue
    c += mix(vec3(.5, .08, .12), vec3(.12, .2, .45), smoothstep(.4, .6, fbm(d * 1.8))) * neb * .08;
    float dens = .5 + band * 1.6 + core;                                               // more stars along the Milky Way
    c += vec3(.78, .8, .9) * starLayer(d, 150., .055 * dens) * .45;
    c += vec3(.9, .9, 1.) * starLayer(d, 90., .04 * dens) * .7;
    c += mix(vec3(1., .82, .62), vec3(.7, .8, 1.), h(floor(d * 50.))) * starLayer(d, 50., .03 * (.6 + band)) * 1.;
    c *= hush;
    gl_FragColor = vec4(c, 1.);
  }`;

export function createSpace(renderer, { small = false, seed = 31 } = {}) {
  /* ---------- The sky, painted once ---------- */
  const tmp = new THREE.Scene();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 64, 32), new THREE.ShaderMaterial({
    vertexShader: 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: SKY, side: THREE.BackSide, depthWrite: false
  }));
  tmp.add(sky);
  const rt = new THREE.WebGLCubeRenderTarget(small ? 768 : 1024, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const cam = new THREE.CubeCamera(.1, 100, rt);
  const prevTone = renderer.toneMapping; renderer.toneMapping = THREE.NoToneMapping;
  cam.update(renderer, tmp);
  renderer.toneMapping = prevTone;
  sky.geometry.dispose(); sky.material.dispose();

  const r = rng(seed), group = new THREE.Group();
  const tints = [col('#ffffff'), col('#dfe8ff'), col('#fff1dc'), col('#ffd9b0'), col('#cfdcff')];

  /* ---------- A sparse layer of slightly brighter stars that twinkle ---------- */
  const N = small ? 1400 : 4000;
  const pos = new Float32Array(N * 3), colr = new Float32Array(N * 3), sd = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    const d = unitVector(r).multiplyScalar(30 + r() * 25);
    pos.set([d.x, d.y, d.z], i * 3);
    const t = tints[Math.floor(r() * tints.length)], b = Math.pow(r(), 8) * 1.4 + .2;
    colr.set([t.r * b, t.g * b, t.b * b], i * 3);
    sd.set([r(), .025 + Math.pow(r(), 12) * .1, .3 + r() * 1.5, r()], i * 4);
  }
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); sGeo.setAttribute('color', new THREE.BufferAttribute(colr, 3)); sGeo.setAttribute('aSeed', new THREE.BufferAttribute(sd, 4));
  const starMat = additive({
    uniforms: { uTime: { value: 0 }, uPx: { value: 1000 }, uOpacity: { value: 1 } },
    vertexShader: `
      attribute vec3 color; attribute vec4 aSeed; uniform float uTime, uPx, uOpacity; varying vec3 vColor; varying float vAlpha;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv;
        float tw = .75 + .25 * sin(uTime * aSeed.z + aSeed.x * 40.);
        gl_PointSize = max(1., uPx * aSeed.y / -mv.z); vColor = color * tw; vAlpha = uOpacity * .8; }`,
    fragmentShader: POINT_FRAG
  });
  const stars = new THREE.Points(sGeo, starMat); stars.frustumCulled = false; group.add(stars);
  // A handful of bright stars with faint diffraction spikes, as a telescope sees them.
  const fc = document.createElement('canvas'); fc.width = fc.height = 128; const fx = fc.getContext('2d');
  const fg = fx.createRadialGradient(64, 64, 0, 64, 64, 64); fg.addColorStop(0, 'rgba(255,255,255,1)'); fg.addColorStop(.06, 'rgba(255,255,255,.5)'); fg.addColorStop(.22, 'rgba(255,255,255,.05)'); fg.addColorStop(1, 'rgba(255,255,255,0)');
  fx.fillStyle = fg; fx.fillRect(0, 0, 128, 128); fx.globalCompositeOperation = 'lighter';
  [[128, 2], [2, 128]].forEach(([w, h]) => { const lg = fx.createLinearGradient(64 - w / 2, 64 - h / 2, 64 + w / 2, 64 + h / 2); lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(.5, 'rgba(255,255,255,.32)'); lg.addColorStop(1, 'rgba(255,255,255,0)'); fx.fillStyle = lg; fx.fillRect(64 - w / 2, 64 - h / 2, w, h); });
  const flareTex = new THREE.CanvasTexture(fc); flareTex.colorSpace = THREE.SRGBColorSpace;
  const flares = new THREE.Group();
  for (let i = 0; i < (small ? 4 : 7); i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flareTex, color: tints[i % tints.length].clone().multiplyScalar(.7), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.position.copy(unitVector(r).multiplyScalar(40 + r() * 8)); s.scale.setScalar(.8 + r() * .9); s.userData.ph = r() * 7; flares.add(s);
  }
  group.add(flares);

  /* ---------- Distant objects, small and faint ---------- */
  const marks = {};
  const plane = new THREE.PlaneGeometry(1, 1);
  const fitPhoto = m => { const k = (m.userData.s || 1) * m.userData.size; m.scale.set(k * m.userData.ia, k, 1); };
  function photoNebula(src, size, opacity) {
    const m = new THREE.Mesh(plane, new THREE.ShaderMaterial({
      uniforms: { tMap: { value: null }, uOpacity: { value: 0 }, uMax: { value: opacity } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: `uniform sampler2D tMap; uniform float uOpacity; varying vec2 vUv;
        void main() { vec3 c = texture2D(tMap, vUv).rgb; float m = 1. - smoothstep(.3, .5, length(vUv - .5)); c = max(c - .06, 0.) * m * uOpacity; gl_FragColor = vec4(c, 0.); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, premultipliedAlpha: true
    }));
    m.userData.size = size; m.userData.ia = 1; m.visible = false; group.add(m); fitPhoto(m);
    loadImage(src).then(img => { if (!img) return; const t = new THREE.Texture(img); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; m.material.uniforms.tMap.value = t; m.userData.ia = img.width / img.height; fitPhoto(m); m.visible = true; });
    return m;
  }
  marks.crab = photoNebula('../assets/space/crab.webp', 1.6, .42);
  marks.helix = photoNebula('../assets/space/helix.webp', 1.5, .3);
  // Far-off galaxies: soft elongated smudges with a brighter core, like the ones scattered through deep-field photos.
  const smudge = (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 32, 0, 64, 32, 32); gr.addColorStop(0, 'rgba(255,244,225,1)'); gr.addColorStop(.18, 'rgba(255,236,210,.45)'); gr.addColorStop(.55, 'rgba(200,210,255,.08)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.setTransform(2, 0, 0, 1, -64, 0); g.fillStyle = gr; g.fillRect(0, 0, 128, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const galaxies = [];
  for (let i = 0; i < (small ? 5 : 9); i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smudge, color: col(i % 3 ? '#fff0de' : '#dfe6ff'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, rotation: r() * Math.PI }));
    const d = unitVector(r); if (d.z > -.2) d.z = -Math.abs(d.z) - .3;   // mostly in front of the camera
    s.position.copy(d.normalize().multiplyScalar(46)); s.scale.set(.5 + r() * .6, (.5 + r() * .6) * .55, 1); s.userData.o = .25 + r() * .3;
    group.add(s); galaxies.push(s);
  }
  // One nearer spiral, still far away and faint.
  const GN = small ? 1800 : 4200, gp = new Float32Array(GN * 3), gc = new Float32Array(GN * 3), gs = new Float32Array(GN * 4);
  for (let i = 0; i < GN; i++) {
    let x, y, z, c;
    if (i < GN * .22) { const rr = Math.abs(gaussian(r)) * .12; const d = unitVector(r); x = d.x * rr; y = d.y * rr * .45; z = d.z * rr; c = col('#ffe4bf'); }
    else { const t = Math.pow(r(), .75), rad = .08 + t * .92, arm = i % 2, th = arm * Math.PI + Math.log(rad + .05) * 2.6 + gaussian(r) * (.36 * (1 - t) + .16); x = Math.cos(th) * rad; z = Math.sin(th) * rad; y = gaussian(r) * .02; c = col('#b9cbff').lerp(col('#ffe4bf'), Math.max(0, .5 - t)); }
    gp.set([x, y, z], i * 3); gc.set([c.r, c.g, c.b], i * 3); gs.set([r(), .012 + r() * .012, .2 + r(), r()], i * 4);
  }
  const gGeo = new THREE.BufferGeometry(); gGeo.setAttribute('position', new THREE.BufferAttribute(gp, 3)); gGeo.setAttribute('color', new THREE.BufferAttribute(gc, 3)); gGeo.setAttribute('aSeed', new THREE.BufferAttribute(gs, 4));
  const galMat = additive({ uniforms: { uTime: { value: 0 }, uPx: { value: 1000 }, uOpacity: { value: 1 } }, vertexShader: starMat.vertexShader.replace('max(1., uPx * aSeed.y / -mv.z)', 'max(1., uPx * aSeed.y * 5. / -mv.z)').replace('vAlpha = uOpacity * .8', 'vAlpha = uOpacity * .22'), fragmentShader: POINT_FRAG });
  const galaxy = new THREE.Group(); const galPts = new THREE.Points(gGeo, galMat); galaxy.add(galPts);
  const galCore = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: col('#ffe2b8'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: .25 })); galCore.scale.setScalar(.4); galaxy.add(galCore);
  galPts.rotation.set(1.15, 0, 0); galaxy.rotation.z = .4; group.add(galaxy); marks.galaxy = galaxy;
  // Rare, faint shooting stars.
  const shooters = [0, 1].map(() => {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(6), 3));
    const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); l.visible = false; l.frustumCulled = false; group.add(l);
    return { l, t0: 0, life: 0, a: new THREE.Vector3(), v: new THREE.Vector3(), next: 4 + r() * 8 };
  });

  /* Place the distant objects near the edges of the frame for the current screen shape. */
  const SPOTS = { wide: { crab: [-.8, .7], helix: [-.82, -.72], galaxy: [.8, -.7] }, tall: { crab: [-.55, .84], helix: [9, 9], galaxy: [.55, -.86] } };
  function layout(aspect, fov = 42) {
    const ty = Math.tan(THREE.MathUtils.degToRad(fov / 2)), tx = ty * aspect, set = aspect < 1 ? SPOTS.tall : SPOTS.wide;
    Object.entries(set).forEach(([k, [x, y]]) => { const o = marks[k]; if (!o) return; o.userData.hidden = x > 5; if (!o.userData.hidden) o.position.set(x * tx, y * ty, -1).normalize().multiplyScalar(46); });
    const s = aspect < 1 ? .7 : 1;
    marks.crab.userData.s = s; marks.helix.userData.s = s; fitPhoto(marks.crab); fitPhoto(marks.helix); marks.galaxy.scale.setScalar(1.7 * s);
  }
  layout(innerWidth / innerHeight);

  return {
    background: rt.texture, group, layout,
    update(t, px, opacity = 1, camera = null, landmarks = 1) {
      const lo = opacity * landmarks;
      starMat.uniforms.uTime.value = t; starMat.uniforms.uPx.value = px; starMat.uniforms.uOpacity.value = opacity;
      galMat.uniforms.uTime.value = t; galMat.uniforms.uPx.value = px; galMat.uniforms.uOpacity.value = lo * (marks.galaxy.userData.hidden ? 0 : 1);
      galPts.rotation.y = t * .015; galCore.material.opacity = .25 * lo;
      flares.children.forEach(s => { s.material.opacity = opacity * (.7 + .3 * Math.sin(t * .6 + s.userData.ph)); });
      galaxies.forEach(g => { g.material.opacity = g.userData.o * lo; });
      [marks.crab, marks.helix].forEach(m => { m.material.uniforms.uOpacity.value = lo * m.material.uniforms.uMax.value * (m.userData.hidden ? 0 : 1); if (camera) m.lookAt(camera.position); });
      shooters.forEach(s => {
        if (!s.l.visible && t > s.next) { s.l.visible = true; s.t0 = t; s.life = .5 + r() * .4; s.a.set((r() - .5) * 60, 8 + r() * 14, -32 - r() * 8); s.v.set(-(20 + r() * 16) * (r() < .5 ? 1 : -1), -(8 + r() * 6), 0); }
        if (s.l.visible) {
          const k = (t - s.t0) / s.life;
          if (k >= 1) { s.l.visible = false; s.next = t + 8 + r() * 12; return; }
          const head = s.a.clone().addScaledVector(s.v, t - s.t0), tail = head.clone().addScaledVector(s.v, -.1 - k * .08);
          s.l.geometry.attributes.position.array.set([head.x, head.y, head.z, tail.x, tail.y, tail.z]); s.l.geometry.attributes.position.needsUpdate = true;
          const f = Math.sin(Math.PI * k) * .55 * opacity; s.l.geometry.attributes.color.array.set([f, f, f * .95, 0, 0, 0]); s.l.geometry.attributes.color.needsUpdate = true;
        }
      });
    }
  };
}
