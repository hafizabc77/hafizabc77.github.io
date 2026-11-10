/* Act I, scene 0–1: random weights gather into the logo (the title), then into a human brain made of light.
   The cortex fires where you touch it. Scrolling dives through the cortex into a forest of neurons and settles on one. */
import * as THREE from 'three';
import { additive, POINT_FRAG, PAL, rng, noise3, gaussian, unitVector, sstep, clamp, lerp, easeInOut, loadImage, pixelScale, alongPolyline, glowSprite } from '../core/util.js';
import { createCosmos } from '../core/cosmos.js';

export const HERO = new THREE.Vector3(.47, .14, .5);   // the neuron we follow, inside the right frontal lobe

export default function genesis(ctx) {
  const { small, ui, score, pointer, renderer } = ctx;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, .004, 3000);
  const r = rng(20261108), nz = noise3(11);
  const N = small ? 28000 : 66000;
  const brain = new THREE.Group(); scene.add(brain);

  /* ---------- The brain's shape ---------- */
  const ridged = (x, y, z) => { let s = 0, a = .5, f = 1; for (let o = 0; o < 3; o++) { s += a * (1 - Math.abs(nz(x * f, y * f, z * f))); f *= 2.15; a *= .5; } return s / .875; };
  const R = new THREE.Vector3(.6, .74, 1.12);
  function cortexPoint(out) {
    const side = r() < .5 ? -1 : 1, d = unitVector(r);
    let { x, y, z } = d;
    if (y < -.32) y = -.32 + (y + .32) * .45;                    // flatter underside
    y *= 1 + .1 * Math.max(0, z);                                // taller frontal lobe
    x *= 1 - .14 * Math.max(0, -z);                              // narrower at the back
    const temporal = Math.max(0, -y - .05) * Math.max(0, x * side) * (z > -.35 ? 1 : 0);
    let px = side * .5 + x * R.x + side * temporal * .16, py = y * R.y - temporal * .1, pz = z * R.z;
    if (side * px < .03) px = side * (.03 + (side * px - .03) * .04);   // the two halves meet in a flat face along the midline
    const groove = Math.exp(-Math.pow((y + .1 - .3 * z) / .07, 2)) * (x * side > .25 ? 1 : 0) * (z > -.4 ? 1 : 0);   // the lateral fissure
    const n = new THREE.Vector3(px - side * .5, py, pz).normalize();
    const crest = ridged(px * 4.1, py * 4.1, pz * 3.7);
    const disp = (crest - .55) * .11 - groove * .06 - r() * .012;
    out.set(px + n.x * disp, py + n.y * disp, pz + n.z * disp);
    return crest - groove * .5;
  }
  function cerebellumPoint(out) {
    const d = unitVector(r), c = new THREE.Vector3(0, -.5, -.8);
    const p = new THREE.Vector3(d.x * .6, d.y * .29, d.z * .36);
    const folia = Math.sin(p.y * 95 + p.z * 8) * .012 + (ridged(p.x * 4, p.y * 4, p.z * 4) - .5) * .02;
    out.copy(p.multiplyScalar(1 + folia / .35)).add(c);
    return .45 + Math.sin(p.y * 95) * .25;
  }

  /* ---------- Three shapes for the same points: random weights, the logo, the brain ---------- */
  const pos = new Float32Array(N * 3), rand = new Float32Array(N * 3), logo = new Float32Array(N * 3);
  const colB = new Float32Array(N * 3), colL = new Float32Array(N * 3), seed = new Float32Array(N * 4);
  const surface = [];   // a few cortex points where spontaneous activity starts
  const tmp = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const k = r(); let crest;
    if (k < .84) crest = cortexPoint(tmp);
    else if (k < .95) crest = cerebellumPoint(tmp);
    else if (k < .975) { const t = r(); tmp.set((r() - .5) * .22 * (1 - t * .4), -.5 - t * .75, -.36 + t * .1 + (r() - .5) * .2 * (1 - t * .4)); crest = .4; }
    else { const side = r() < .5 ? -1 : 1, d = unitVector(r); tmp.set(side * .5 + d.x * R.x * .7, d.y * R.y * .65, d.z * R.z * .78); crest = .15; }
    pos.set([tmp.x, tmp.y, tmp.z], i * 3);
    if (k < .84 && i % 40 === 0) surface.push(tmp.clone());
    // Colour: violet folds, gold and cream on the crests, a little phosphor mint.
    if (crest > .8) c.copy(PAL.goldHi).multiplyScalar(1.25);
    else if (crest > .68) c.copy(PAL.gold).lerp(PAL.violet, .25).multiplyScalar(1.05);
    else if (crest > .52) c.copy(PAL.violet).multiplyScalar(.75);
    else c.copy(PAL.magenta).lerp(PAL.blue, .6).multiplyScalar(.22);
    if (r() < .03) c.copy(PAL.mint);
    colB.set([c.r, c.g, c.b], i * 3);
    const g = gaussian(r) * 2.4, d = unitVector(r);
    rand.set([d.x * Math.abs(g) * 1.3, d.y * Math.abs(g) * .8, d.z * Math.abs(g)], i * 3);
    seed.set([r(), .35 + r() * .9, .05 + r() * .5, r()], i * 4);
    colL.set([.8, .8, .8], i * 3);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aRand', new THREE.BufferAttribute(rand, 3));
  geo.setAttribute('aLogo', new THREE.BufferAttribute(logo, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colB, 3));
  geo.setAttribute('aColLogo', new THREE.BufferAttribute(colL, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  // A fourth shape, filled in once the photo has loaded: points on Hafiz's portrait, its colours, and when each one burns free.
  const face = new Float32Array(N * 3), colF = new Float32Array(N * 3), burn = new Float32Array(N);
  geo.setAttribute('aFace', new THREE.BufferAttribute(face, 3));
  geo.setAttribute('aColFace', new THREE.BufferAttribute(colF, 3));
  geo.setAttribute('aBurn', new THREE.BufferAttribute(burn, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 6);
  const pulses = Array.from({ length: 10 }, () => new THREE.Vector4(0, 0, 0, -99));
  const mat = additive({
    uniforms: { uTime: { value: 0 }, uPx: { value: 1000 }, uForm: { value: 0 }, uFace: { value: 0 }, uBurn: { value: 1 }, uBrain: { value: 0 }, uOpacity: { value: 1 }, uDim: { value: 0 }, uPulse: { value: pulses }, uHover: { value: new THREE.Vector4(0, 0, 0, 0) }, uTilt: { value: new THREE.Vector2() } },
    vertexShader: `
      attribute vec3 aRand, aLogo, aColLogo, color, aFace, aColFace; attribute vec4 aSeed; attribute float aBurn;
      uniform float uTime, uPx, uForm, uFace, uBurn, uBrain, uOpacity, uDim; uniform vec4 uPulse[10]; uniform vec4 uHover; uniform vec2 uTilt;
      varying vec3 vColor; varying float vAlpha;
      void main() {
        float st = aSeed.x;
        float f = clamp((uForm - st * .4) / .6, 0., 1.); f = f * f * (3. - 2. * f);
        float fc = clamp((uFace - st * .35) / .65, 0., 1.); fc = fc * fc * (3. - 2. * fc);
        // Each point leaves the portrait when the burn reaches it, then flies into the brain.
        float b = clamp((uBrain - aBurn * .55) / .45, 0., 1.); b = b * b * (3. - 2. * b);
        vec3 drift = .22 * vec3(sin(uTime * .31 + st * 40.), cos(uTime * .27 + st * 31.), sin(uTime * .23 + st * 17.));
        vec3 logo = aLogo + .012 * vec3(sin(uTime * 1.3 + st * 60.), cos(uTime * 1.1 + st * 50.), 0.);
        vec3 p = mix(aRand + drift, logo, f);
        p = mix(p, aFace + .006 * vec3(sin(uTime + st * 50.), cos(uTime * .9 + st * 40.), 0.), fc);
        p = mix(p, position, b) + sin(b * 3.14159) * normalize(aRand + 1e-4) * .9 * aSeed.y;
        vec3 c = mix(mix(mix(vec3(.55, .5, .8) * .7, aColLogo, f), aColFace, fc), color, b);
        // On the portrait a point is hidden while the photo still covers it, and flares as the burn passes.
        float k = uBurn * 1.2 - .1;
        float freed = smoothstep(aBurn - .025, aBurn + .005, k);
        float flare = exp(-pow((aBurn - k) / .035, 2.)) * fc * (1. - b);
        float hide = fc * (1. - b) * (1. - freed);
        float act = 0.;
        for (int i = 0; i < 10; i++) {
          vec4 P = uPulse[i]; float age = uTime - P.w;
          if (age < 0. || age > 3.5) continue;
          float d = distance(position, P.xyz), R = age * 1.25;
          act += exp(-pow((d - R) * 7., 2.)) * exp(-age * 1.2) * 1.25;
        }
        float hd = distance(position, uHover.xyz); act += uHover.w * exp(-hd * hd * 30.) * 1.1;
        float tw = pow(fract(sin(st * 91.7) * 43.1 + uTime * aSeed.z), 40.) * 1.2;
        float glow = (act + tw) * b + flare * 1.1;
        c += glow * vec3(1., .74, .38) * .8;
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uPx * (.0055 + aSeed.y * .0072) * (1. + glow * .35) * mix(1.15, 1., b) / -mv.z;
        vColor = c * mix(1., .55, uDim * (1. - glow * .5));
        float near = smoothstep(.04, .6, -mv.z);   // points brushing past the camera fade instead of flaring
        vAlpha = uOpacity * mix(mix(mix(.16, .2, f), .13, fc), .12, b) * (1. - uDim * .6) * (1. + glow * .35) * near * (1. - hide);
      }`,
    fragmentShader: POINT_FRAG
  });
  const points = new THREE.Points(geo, mat); points.renderOrder = 5; brain.add(points);   // drawn after the photo (4) and the sky (≤ 3)
  // A soft inner light gives the brain mass instead of looking like a hollow shell.
  const core = [glowSprite(PAL.violet, 3.6, 0), glowSprite(PAL.magenta, 2.2, 0)]; core.forEach(s => { s.renderOrder = 5; brain.add(s); });

  // Invisible shapes for finding where the pointer touches the brain.
  const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
  const proxies = [-1, 1].map(s => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), proxyMat); m.scale.set(R.x * 1.05, R.y * 1.08, R.z * 1.04); m.position.x = s * .5; brain.add(m); return m; });

  /* ---------- The neuron forest inside the frontal lobe ---------- */
  const forest = new THREE.Group(); brain.add(forest);
  const fPts = [], fSeed = [], fCol = [], links = [];
  const somas = [];
  const nNeurons = small ? 70 : 150;
  function growNeuron(soma, scale, axonDir, rr, hero) {
    const add = (p, size, colr, bright = 1) => { fPts.push(p.x, p.y, p.z); fSeed.push(rr(), size, .3 + rr() * 2, bright); fCol.push(colr.r * bright, colr.g * bright, colr.b * bright); };
    for (let k = 0; k < (hero ? 260 : 26); k++) { const d = unitVector(rr); add(soma.clone().addScaledVector(d, scale * (.14 + rr() * .05)), .0022, PAL.goldHi, 1.1); }
    add(soma, hero ? .014 : .008, PAL.goldHi, 1.2);
    const dend = hero ? 7 : 5 + Math.floor(rr() * 3);
    for (let b = 0; b < dend; b++) {
      const dir = unitVector(rr); if (dir.dot(axonDir) > .2) dir.addScaledVector(axonDir, -1.2).normalize();
      const branch = (start, dir0, len, depth) => {
        const pts = [start.clone()]; let p = start.clone(), d = dir0.clone();
        for (let s = 0; s < 6; s++) { d.add(unitVector(rr).multiplyScalar(.45)).normalize(); p = p.clone().addScaledVector(d, len / 6); pts.push(p); }
        const out = []; alongPolyline(pts, hero ? 90 : 16, out, scale * .01, rr);
        out.forEach(o => add(o.p, .0016 * (1 - o.u * .5), PAL.violet.clone().lerp(PAL.magenta, o.u), 1.1 - o.u * .5));
        if (depth < 2) for (let k = 0; k < 2; k++) branch(pts[2 + Math.floor(rr() * 3)], d.clone().add(unitVector(rr)).normalize(), len * .6, depth + 1);
        return p;
      };
      branch(soma.clone().addScaledVector(dir, scale * .14), dir, scale * (.7 + rr() * .4), 0);
    }
    // The axon, with bright myelin beads.
    const apts = [soma.clone()]; let p = soma.clone(), d = axonDir.clone();
    for (let s = 0; s < 10; s++) { d.add(unitVector(rr).multiplyScalar(.12)).normalize(); p = p.clone().addScaledVector(d, scale * .22); apts.push(p); }
    const out = []; alongPolyline(apts, hero ? 260 : 30, out, scale * .006, rr);
    out.forEach(o => { const bead = Math.sin(o.u * 60) > .4; add(o.p, bead ? .0022 : .0014, bead ? PAL.cyan : PAL.violet, bead ? 1.3 : .8); });
    return p;
  }
  const fr = rng(77);
  growNeuron(HERO, .11, new THREE.Vector3(1, -.05, 0).normalize(), fr, true);
  somas.push(HERO.clone());
  for (let i = 0; i < nNeurons; i++) {
    const s = HERO.clone().add(new THREE.Vector3((fr() - .5) * .9, (fr() - .5) * .62, (fr() - .5) * .75 - .12));
    if (s.distanceTo(HERO) < .1) continue;
    somas.push(s);
    growNeuron(s, .045 + fr() * .04, unitVector(fr), fr, false);
  }
  for (let i = 0; i < somas.length; i++) for (let j = i + 1; j < somas.length; j++) if (somas[i].distanceTo(somas[j]) < .16 && fr() < .5) links.push(somas[i].x, somas[i].y, somas[i].z, somas[j].x, somas[j].y, somas[j].z);
  const fGeo = new THREE.BufferGeometry();
  fGeo.setAttribute('position', new THREE.Float32BufferAttribute(fPts, 3));
  fGeo.setAttribute('color', new THREE.Float32BufferAttribute(fCol, 3));
  fGeo.setAttribute('aSeed', new THREE.Float32BufferAttribute(fSeed, 4));
  const fMat = additive({
    uniforms: { uTime: { value: 0 }, uPx: { value: 1000 }, uOpacity: { value: 0 } },
    vertexShader: `
      attribute vec3 color; attribute vec4 aSeed; uniform float uTime, uPx, uOpacity;
      varying vec3 vColor; varying float vAlpha;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.); float d = length(mv.xyz);
        float fl = pow(fract(aSeed.x * 13.1 + uTime * aSeed.z * .4), 26.) * 2.2;
        vColor = color * (1. + fl);
        vAlpha = uOpacity * (1. - smoothstep(.45, 1.5, d)) * smoothstep(.0, .03, d);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uPx * aSeed.y * (1. + fl * .5) / -mv.z;
      }`,
    fragmentShader: POINT_FRAG
  });
  const forestPts = new THREE.Points(fGeo, fMat); forestPts.renderOrder = 5; forest.add(forestPts);
  const lGeo = new THREE.BufferGeometry(); lGeo.setAttribute('position', new THREE.Float32BufferAttribute(links, 3));
  const lMat = new THREE.LineBasicMaterial({ color: PAL.violet, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const forestLines = new THREE.LineSegments(lGeo, lMat); forestLines.renderOrder = 5; forest.add(forestLines);

  /* ---------- Deep space all around, in real depth: far galaxies, stars, nebulae and drifting dust ---------- */
  const turn = new THREE.Vector2();
  const space = createCosmos(renderer, { small, ui, pointer, labelId: 'genesis', onHover: () => score.sfx('hover', { pan: pointer.ndc.x * .5 }) });
  scene.add(space.group);

  /* ---------- Hafiz's portrait: the photo opens like a nebula. Hafiz in full colour and depth,
     the conference around him faded and cooled, the whole shape fraying into wisps at its edges. ---------- */
  const CROP = { x0: .07, x1: .93, y0: 0, y1: 1 };   // a wide view of the photo, as fractions from its top-left
  const PW = 4.3, PH = PW * ((CROP.y1 - CROP.y0) * 1333) / ((CROP.x1 - CROP.x0) * 2000);
  const PC = new THREE.Vector3(0, .05, 0);
  const portraitU = {
    tPhoto: { value: null }, tDepth: { value: null }, tShape: { value: null }, uTexel: { value: new THREE.Vector2(1 / 2000, 1 / 1333) }, uCrop: { value: new THREE.Vector4(CROP.x0, 1 - CROP.y1, CROP.x1 - CROP.x0, CROP.y1 - CROP.y0) },
    uBurn: { value: 1 }, uTime: { value: 0 }, uOpacity: { value: 0 }
  };
  const portrait = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH, small ? 110 : 190, small ? 100 : 176), new THREE.ShaderMaterial({
    uniforms: portraitU, transparent: true, depthWrite: false, premultipliedAlpha: true,
    vertexShader: `
      uniform sampler2D tDepth, tShape; uniform vec4 uCrop; uniform float uTime; varying vec2 vUv;
      void main() {
        vUv = uv; float d = texture2D(tDepth, uCrop.xy + uv * uCrop.zw).r, subj = texture2D(tShape, uv).r;
        vec3 p = position; p.z += mix(-.32, d * .55 - .25, subj) + sin(uTime * .7 + uv.y * 4.) * .004;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
      }`,
    fragmentShader: `
      uniform sampler2D tPhoto, tShape; uniform vec4 uCrop; uniform vec2 uTexel; uniform float uBurn, uOpacity, uTime; varying vec2 vUv;
      void main() {
        // A gentle softening: blend the photo with a small blur of itself, so it reads smooth rather than sharp.
        vec2 uvp = uCrop.xy + vUv * uCrop.zw, o1 = uTexel * 2.4, o2 = vec2(o1.x, -o1.y);
        vec3 c0 = texture2D(tPhoto, uvp).rgb;
        vec3 bl = c0 * .2 + (texture2D(tPhoto, uvp + vec2(o1.x, 0.)).rgb + texture2D(tPhoto, uvp - vec2(o1.x, 0.)).rgb + texture2D(tPhoto, uvp + vec2(0., o1.y)).rgb + texture2D(tPhoto, uvp - vec2(0., o1.y)).rgb) * .12
                  + (texture2D(tPhoto, uvp + o1 * .7).rgb + texture2D(tPhoto, uvp - o1 * .7).rgb + texture2D(tPhoto, uvp + o2 * .7).rgb + texture2D(tPhoto, uvp - o2 * .7).rgb) * .08;
        vec3 c = mix(c0, bl, .62);
        vec4 s = texture2D(tShape, vUv); float subj = s.r, neb = s.g, b = s.b;
        float l = dot(c, vec3(.3, .59, .11));
        vec3 back = mix(vec3(l), c, .8) * vec3(.9, .88, .97) * .74;            // the room around him, softly faded into the cosmos
        vec3 col = mix(back, (mix(vec3(l), c, .94) * .74 + .03) * vec3(1., .975, .95), subj);   // gentle: lifted shadows, softer highlights
        float a = max(subj, neb * .62);
        float rim = clamp(neb * (1. - neb) * 4., 0., 1.) * (1. - subj);          // a coloured glow where the nebula frays out
        vec3 rimCol = mix(vec3(.55, .28, 1.), vec3(.15, .75, 1.), vUv.x + .2 * sin(vUv.y * 6. + uTime * .2)) * rim * .07;
        float k = uBurn * 1.2 - .1, alive = smoothstep(k - .015, k + .015, b);
        float edge = exp(-pow((b - k) / .022, 2.)) * step(.001, uBurn) * step(uBurn, .999) * max(subj, neb);
        float A = a * alive * uOpacity;
        gl_FragColor = vec4(col * A + rimCol * alive * uOpacity + vec3(1., .72, .38) * edge * uOpacity * 1.4, max(A, edge * uOpacity * .8));
      }`
  }));
  portrait.position.copy(PC); portrait.visible = false; portrait.renderOrder = 4; scene.add(portrait);   // in front of everything in the sky, so nothing shines through it
  async function buildPortrait() {
    const [photo, depth] = await Promise.all([loadImage('../assets/showcase/portrait-wide.webp'), loadImage('../assets/showcase/portrait-depth.webp')]);
    if (!photo || !depth) { for (let i = 0; i < N; i++) { face.set([logo[i * 3], logo[i * 3 + 1] - .95, logo[i * 3 + 2]], i * 3); colF.set([colL[i * 3], colL[i * 3 + 1], colL[i * 3 + 2]], i * 3); burn[i] = r(); } return false; }
    const W = 256, H = Math.round(W * PH / PW);
    const crop = img => { const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(img, CROP.x0 * img.width, CROP.y0 * img.height, (CROP.x1 - CROP.x0) * img.width, (CROP.y1 - CROP.y0) * img.height, 0, 0, W, H); return g.getImageData(0, 0, W, H).data; };
    const ph = crop(photo), dp = crop(depth);
    // One shape map shared by the photo and its particles: R = Hafiz, G = the nebula around him, B = the order things burn in.
    const sc = document.createElement('canvas'); sc.width = W; sc.height = H; const sg = sc.getContext('2d'); const sd = sg.createImageData(W, H);
    const subjM = new Float32Array(W * H), nebM = new Float32Array(W * H), bmap = new Float32Array(W * H), nb = noise3(5);
    const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const fbm = (x, y, z) => .55 * nb(x, y, z) + .3 * nb(x * 2.1, y * 2.1, z + 3) + .15 * nb(x * 4.3, y * 4.3, z + 7);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, u = x / W, v = 1 - y / H, d = dp[i * 4] / 255;
      const oval = Math.hypot((u - .484) / .195, (v - .45) / .53);
      const subj = ss(.36, .62, d) * (1 - ss(.82, 1.05, oval)) * ss(.02, .1, v);
      const e = Math.hypot((u - .5) / .5, (v - .5) / .5) + fbm(u * 3.2, v * 3.2, 1) * .42 + nb(u * 11, v * 11, 9) * .1;
      const neb = (1 - ss(.55, 1.04, e)) * ss(0, .1, u) * ss(0, .1, 1 - u) * ss(0, .07, v) * ss(0, .07, 1 - v);   // never reaches the photo's edge
      const n = Math.min(1, Math.max(0, (1 - Math.min(1.2, e)) * .65 + subj * .35 + fbm(u * 6, v * 7, 4) * .18));
      subjM[i] = subj; nebM[i] = neb; bmap[i] = n;   // the edges burn first, Hafiz's face last
      sd.data[i * 4] = Math.round(subj * 255); sd.data[i * 4 + 1] = Math.round(neb * 255); sd.data[i * 4 + 2] = Math.round(n * 255); sd.data[i * 4 + 3] = 255;
    }
    sg.putImageData(sd, 0, 0);
    const tPhoto = new THREE.Texture(photo); tPhoto.colorSpace = THREE.SRGBColorSpace; tPhoto.needsUpdate = true;
    const tDepth = new THREE.Texture(depth); tDepth.needsUpdate = true;
    const tShape = new THREE.CanvasTexture(sc);
    portraitU.tPhoto.value = tPhoto; portraitU.tDepth.value = tDepth; portraitU.tShape.value = tShape; portraitU.uTexel.value.set(1 / photo.width, 1 / photo.height);
    // Points sit on the portrait, thickest on Hafiz and sparser across the faded room, carrying the photo's colours.
    for (let i = 0; i < N; i++) {
      let x = 0, y = 0, w = 0, tries = 0;
      do { x = Math.floor(r() * W); y = Math.floor(r() * H); const j = y * W + x; w = Math.max(subjM[j], nebM[j] * .3); } while (r() > w && ++tries < 40);
      const j = y * W + x, u = x / W, v = 1 - y / H, d = dp[j * 4] / 255, s = subjM[j];
      face.set([PC.x + (u - .5) * PW, PC.y + (v - .5) * PH, PC.z + lerp(-.32, d * .55 - .25, s) + .01], i * 3);
      c.setRGB(ph[j * 4] / 255, ph[j * 4 + 1] / 255, ph[j * 4 + 2] / 255, THREE.SRGBColorSpace);
      if (s < .5) c.lerp(PAL.violet, .45).multiplyScalar(.7); else c.lerp(PAL.goldHi, .3).multiplyScalar(.95);
      colF.set([c.r, c.g, c.b], i * 3);
      burn[i] = bmap[j];
    }
    geo.attributes.aFace.needsUpdate = true; geo.attributes.aColFace.needsUpdate = true; geo.attributes.aBurn.needsUpdate = true;
    portrait.visible = true;
    return true;
  }

  /* ---------- The logo: sample its pixels into points ---------- */
  async function sampleLogo() {
    const img = await loadImage('../assets/showcase/logo.webp');
    const pts = [];
    if (img) {
      const W = 460, H = Math.round(W * img.height / img.width), cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const x = cv.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, W, H);
      const d = x.getImageData(0, 0, W, H).data;
      for (let y = 0; y < H; y += 1) for (let xx = 0; xx < W; xx += 1) { const k = (y * W + xx) * 4; if (d[k + 3] > 120) pts.push([xx, y, d[k], d[k + 1], d[k + 2]]); }
      const width = small ? 2.6 : 3.4, s = width / W;
      for (let i = 0; i < N; i++) {
        const q = pts[Math.floor(r() * pts.length)];
        logo.set([(q[0] - W / 2) * s + (r() - .5) * s, -(q[1] - H / 2) * s + .95 + (r() - .5) * s, (r() - .5) * .06], i * 3);
        const green = q[3] > q[2] + 30; c.setRGB(q[2] / 255, q[3] / 255, q[4] / 255, THREE.SRGBColorSpace);
        if (green) c.copy(PAL.mint).multiplyScalar(1.1); else c.multiplyScalar(.95);
        colL.set([c.r, c.g, c.b], i * 3);
      }
    } else for (let i = 0; i < N; i++) { const d = unitVector(r); logo.set([d.x, d.y + .5, d.z * .2], i * 3); }
    geo.attributes.aLogo.needsUpdate = true; geo.attributes.aColLogo.needsUpdate = true;
  }

  /* ---------- Interaction: the cortex fires where you touch it ---------- */
  const ray = new THREE.Raycaster(); let pIdx = 0, lastSpark = 0, hoverOn = 0;
  const hoverPt = new THREE.Vector3();
  const pulse = (local, strength = 1) => { pulses[pIdx % pulses.length].set(local.x, local.y, local.z, mat.uniforms.uTime.value - (1 - strength) * .5); pIdx++; };
  let localP = 0, ready = false;
  function hit() {
    ray.setFromCamera(pointer.ndc, camera);
    brain.updateMatrixWorld();
    const h = ray.intersectObjects(proxies, false)[0];
    if (!h) return null;
    return points.worldToLocal(h.point.clone());
  }

  /* ---------- Camera path: orbit, then the dive through the cortex to our neuron ---------- */
  const dive = new THREE.CatmullRomCurve3([new THREE.Vector3(.1, .2, 5.2), new THREE.Vector3(.3, .22, 3.4), new THREE.Vector3(.46, .2, 1.9), new THREE.Vector3(.47, .17, 1.22), new THREE.Vector3(.47, .15, .9), new THREE.Vector3(.47, .145, .73)]);
  const look = new THREE.Vector3(), titleCam = new THREE.Vector3(), faceCam = new THREE.Vector3(), mid = new THREE.Vector3();
  const fit = () => (camera.aspect < 1 ? Math.max(1, .95 / camera.aspect) : 1);
  // The brain's own clock: it orbits while Hafiz's words appear around it, then the dive begins.
  const toQ = p => p < .22 ? 0 : p < .56 ? (p - .22) / .34 * .3 : .3 + (p - .56) / .44 * .7;
  let portraitOK = false;
  const corner = (html, small, x, y, align, at, m, mAt) => ({ at, html: `${html}<small>${small}</small>`, x, y, cls: 'quote', align, m, mAt });

  return {
    id: 'genesis', scene, camera, extra: {},
    captions: [
      // Meeting Hafiz.
      { at: [-1, .1], html: 'Hi, I’m Hafiz.', x: 7, y: 30, cls: 'hello-cap', m: { x: 50, y: 12, align: 'center' }, when: () => ctx.time - ctx.intro.at > 1 },
      { at: [-1, .1], html: 'I make large AI models run fast on real hardware. What brought me here is older: <b>how does intelligence actually work?</b>', x: 93, y: 54, cls: 'note', align: 'right', m: { x: 50, y: 58, align: 'center' }, when: () => ctx.time - ctx.intro.at > 1.6 },
      { at: [-1, .085], html: '<span class="hint-dot"></span>Scroll to look inside', x: 50, y: 88, cls: 'hint', align: 'center' },
      { at: [.12, .22], html: 'It begins in here.', x: 50, y: 78, cls: 'big', align: 'center' },
      // Four questions around the brain.
      corner('Curiosity is what drives me.', 'Hafiz', 7, 20, 'left', [.24, .42], { x: 50, y: 12, align: 'center' }, [.23, .31]),
      corner('How does a brain think?', 'And how does it know it is thinking?', 93, 20, 'right', [.27, .42], { x: 50, y: 62, align: 'center' }, [.26, .34]),
      corner('Can a machine learn the way we do?', 'It’s why I work on AI.', 7, 56, 'left', [.3, .42], { x: 50, y: 12, align: 'center' }, [.32, .4]),
      corner('How does the universe work?', 'The questions I can’t stop asking.', 93, 66, 'right', [.33, .42], { x: 50, y: 62, align: 'center' }, [.35, .43]),
      { at: [.24, .52], html: '<span class="hint-dot"></span>Touch the brain. Click to send a wave.', x: 50, y: 88, cls: 'hint', align: 'center' },
      // The brain itself.
      { at: [.43, .53], html: '<b>86 billion</b> neurons, a galaxy of them', x: 8, y: 26, cls: 'fact' },
      { at: [.46, .56], html: 'around <b>100 trillion</b> connections', x: 92, y: 60, cls: 'fact', align: 'right' },
      { at: [.52, .62], html: 'Every idea starts as a spark.', x: 50, y: 76, cls: 'big', align: 'center' },
      { at: [.75, .82], html: 'Inside, each neuron listens to thousands of others.', x: 8, y: 22, cls: 'note' },
      { at: [.82, .9], html: 'Somewhere in here, a thought becomes a feeling. Nobody knows how yet. That mystery is why I study AI.', x: 8, y: 22, cls: 'note' },
      { at: [.9, 1.1], html: 'Let’s follow one.', x: 50, y: 80, cls: 'big', align: 'center' }
    ],
    async init() { await sampleLogo(); portraitOK = await buildPortrait(); ready = true; },
    resize(aspect) { camera.aspect = aspect; camera.updateProjectionMatrix(); space.layout(aspect); },
    pointer(type) {
      if (type === 'down' && space.tap(pointer.x, pointer.y, camera, mat.uniforms.uTime.value)) return;   // a planet or the sun
      if (space.hovering || localP < .2 || toQ(localP) > .5) return;
      const p = hit();
      if (type === 'move' && p) { hoverPt.copy(p); hoverOn = 1; if (mat.uniforms.uTime.value - lastSpark > .14) { lastSpark = mat.uniforms.uTime.value; pulse(p, .45); score.sfx('spark', { pan: pointer.ndc.x * .7 }); } }
      if (type === 'down' && p) { pulse(p, 1); pulse(p.clone().multiplyScalar(-1).setY(p.y), .7); score.sfx('wave', { pan: pointer.ndc.x * .6 }); }
    },
    update(p, info) {
      localP = p;
      const q = toQ(p), t = info.time, I = ctx.intro, u = mat.uniforms;
      // Toward the mouse: the sky turns a little (held still while a planet is being looked at). The subject and the words stay put.
      const tx = space.hovering ? turn.x : pointer.inside && !ctx.coarse ? pointer.ndc.x : 0, ty = space.hovering ? turn.y : pointer.inside && !ctx.coarse ? pointer.ndc.y : 0;
      const kt = Math.min(1, (info.dt || .016) * 2.2); turn.x += (tx - turn.x) * kt; turn.y += (ty - turn.y) * kt;
      u.uTime.value = t; fMat.uniforms.uTime.value = t; portraitU.uTime.value = t;
      const px = pixelScale(renderer, camera); u.uPx.value = px; fMat.uniforms.uPx.value = px;
      const inside = sstep(.56, .68, q);
      space.update(t, px, { opacity: 1 - inside * .82, purple: sstep(.13, .26, p) * (1 - sstep(.58, .7, q)), fly: p * 20, camera, active: info.active && info.weight > .5 && (I.state === 'entering' || I.state === 'title'), sky: .62 * (1 - inside * .85), turnX: turn.x, turnY: turn.y });
      // Title → portrait → brain. The portrait materialises from the logo's points, then burns back into them as you scroll.
      const since = t - I.at;
      let form = 0, faceT = 0, burnT = 1, brainT = 0, mater = 0;
      if (I.state === 'title') form = ready ? Math.min(1, since / 2.4) : 0;
      else if (I.state === 'entering') {
        form = 1;
        mater = I.at < -50 ? 1 : clamp((since - .1) / 2.2);
        faceT = easeInOut(mater);
        const reveal = I.at < -50 ? 1 : clamp((since - 1.3) / 1.8);
        burnT = Math.max(1 - reveal, clamp((p - .07) / .12));
        brainT = clamp((p - .1) / .16);
      }
      u.uForm.value = form; u.uFace.value = faceT; u.uBurn.value = burnT; u.uBrain.value = brainT;
      portraitU.uBurn.value = burnT; portraitU.uOpacity.value = I.state === 'entering' ? 1 : 0;
      portrait.visible = portraitOK && burnT < .999 && info.weight > 0;
      const burning = clamp((p - .07) / .12);
      portrait.rotation.y = pointer.inside && !ctx.coarse ? pointer.ndc.x * .22 * (1 - burning) : 0;
      portrait.rotation.x = pointer.inside && !ctx.coarse ? -pointer.ndc.y * .12 * (1 - burning) : 0;
      const formed = brainT;
      core[0].material.opacity = .1 * formed * (1 - sstep(.45, .58, q)); core[1].material.opacity = .07 * formed * (1 - sstep(.45, .58, q));
      // Spontaneous activity, and the hover glow.
      if (formed > .6 && Math.random() < info.dt * (q < .5 ? 1.1 : .4)) pulse(surface[Math.floor(Math.random() * surface.length)], .5 + Math.random() * .3);
      hoverOn *= Math.pow(.02, info.dt);
      u.uHover.value.set(hoverPt.x, hoverPt.y, hoverPt.z, hoverOn * formed);
      // Rotation: starts in the classic three-quarter side view and turns to face us as we approach.
      const free = -1.2 * (1 - sstep(.03, .44, q)) + (1 - sstep(.3, .46, q)) * .14 * Math.sin(t * .14);
      const settle = sstep(.6, 1, formed);   // the brain only starts turning once the portrait's points have arrived
      brain.rotation.y = free * settle;
      brain.rotation.x = (1 - sstep(.28, .46, q)) * .12 * Math.sin(t * .1) * settle;
      // Camera: title → portrait → orbiting the brain → the dive.
      const k = fit(), kp = camera.aspect < 1 ? 1.1 : 1;
      const d = easeInOut(clamp((q - .26) / .7));
      const cp = d <= 0 ? new THREE.Vector3(.05, lerp(.95, .2, sstep(0, .26, q)), lerp(5.4, 5.2, sstep(0, .26, q))) : dive.getPoint(d);
      cp.z *= cp.z > 2 ? lerp(k, 1, sstep(.3, .55, q)) : 1;
      titleCam.set(0, 0, 6.2 * k);
      faceCam.set(0, .1, 5.7 * kp);
      mid.lerpVectors(faceCam, cp, easeInOut(sstep(.08, .26, p)));
      if (I.state === 'entering') camera.position.lerpVectors(titleCam, mid, easeInOut(mater)); else camera.position.copy(titleCam);
      look.copy(PC).lerp(new THREE.Vector3(0, 0, 0), sstep(.08, .26, p)).lerp(HERO, easeInOut(clamp((q - .38) / .5)));
      camera.lookAt(look);
      // The solar system keeps its place in the frame, whatever the film camera does.
      camera.updateMatrixWorld(); space.follow(camera, p * .12);
      // Inside the brain: the cortex dims to a starfield and the forest lights up.
      u.uDim.value = inside;
      fMat.uniforms.uOpacity.value = sstep(.5, .66, q);
      lMat.opacity = .14 * sstep(.55, .7, q);
      // A flash of light as we cross the surface.
      const cross = Math.exp(-Math.pow((q - .6) / .035, 2));
      this.extra.aberr = cross * 2.2; this.extra.bloom = cross * .9;
    }
  };
}
