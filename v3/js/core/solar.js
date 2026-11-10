/* A distant solar system: one modest sun, and the eight planets on Kepler orbits around it (no orbit lines).
   Distances and sizes are compressed so everything fits on screen, but they keep their real order and character:
   inner planets small and quick, the giants large and slow, each lit by the sun, so you see a real day side,
   a terminator and, when a planet swings toward us, a crescent. Saturn has its rings (and casts its shadow on them),
   Earth has the Moon, Jupiter its four big moons, and the asteroid belt turns between Mars and Jupiter. */
import * as THREE from 'three';
import { rng, noise3, col, glowTexture, additive, POINT_FRAG, gaussian } from './util.js';

const PLANET_V = `varying vec3 vN, vW; varying vec2 vUv;
  void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`;
const PLANET_F = `uniform sampler2D map; uniform vec3 uSun, uAtmoCol; uniform float uOpacity, uAtmo, uLight;
  varying vec3 vN, vW; varying vec2 vUv;
  void main() {
    vec3 n = normalize(vN), l = normalize(uSun - vW), v = normalize(cameraPosition - vW);
    float ndl = dot(n, l);
    vec3 c = texture2D(map, vUv).rgb * (max(ndl, 0.) * uLight + .13);                       // a faint fill, so the night side never vanishes
    c += uAtmoCol * pow(1. - max(dot(n, v), 0.), 2.5) * uAtmo * smoothstep(-.25, .5, ndl);   // a thin lit atmosphere at the limb
    gl_FragColor = vec4(c, uOpacity);
  }`;
const RING_V = `varying vec3 vW; varying float vR;
  void main() { vR = length(position.xy); vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const RING_F = `uniform sampler2D map; uniform vec3 uSun, uPC, uN; uniform float uPR, uOpacity, uIn, uOut, uLight;
  varying vec3 vW; varying float vR;
  void main() {
    vec4 t = texture2D(map, vec2((vR - uIn) / (uOut - uIn), .5));
    vec3 L = normalize(uSun - vW), oc = vW - uPC;
    float b = dot(oc, L), disc = b * b - (dot(oc, oc) - uPR * uPR);
    float lit = (disc > 0. && b < 0.) ? .06 : 1.;                                // Saturn's shadow across the rings
    vec3 c = t.rgb * (.25 + .75 * abs(dot(normalize(uN), L))) * uLight * lit;
    float a = t.a * uOpacity;
    gl_FragColor = vec4(c * a, a);
  }`;

/* Equirectangular surface maps, drawn once from 3D noise on the sphere (so there is no seam). */
function surface(kind, W, H) {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), img = g.createImageData(W, H), n = noise3(kind.length * 31 + 7);
  const fbm = (x, y, z, o = 4) => { let s = 0, a = .5, f = 1; for (let i = 0; i < o; i++) { s += a * n(x * f, y * f, z * f); f *= 2.02; a *= .5; } return s; };
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const bands = (list, x) => { const f = Math.min(.9999, Math.max(0, x)) * (list.length - 1), i = Math.floor(f); return mix(hex(list[i]), hex(list[i + 1]), ss(0, 1, f - i)); };
  const JUP = ['#c9b79c', '#e8dcc6', '#b98d68', '#efe4cf', '#a8714c', '#e2cfae', '#d8bb94', '#f2e8d4', '#b07a52', '#ead9bd', '#a0704f', '#e6d6bb', '#c9b190'];
  const SAT = ['#cdb88e', '#e6d4a8', '#d3bb87', '#ecdcb4', '#c9ad7a', '#e8d6ab', '#d6c194', '#efe1bd', '#c8ad80', '#dcc89c'];
  for (let y = 0; y < H; y++) {
    const lat = (.5 - (y + .5) / H) * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
    for (let x = 0; x < W; x++) {
      const lon = (x + .5) / W * Math.PI * 2, px = cl * Math.cos(lon), py = sl, pz = cl * Math.sin(lon);
      let c;
      if (kind === 'mercury') { const f = fbm(px * 3, py * 3, pz * 3, 5), k = fbm(px * 9, py * 9, pz * 9, 2); c = mix(hex('#5f5a55'), hex('#a8a198'), ss(-.45, .45, f)); c = mix(c, hex('#c9c2b8'), ss(.32, .5, k) * .6); }
      else if (kind === 'venus') { const f = fbm(px * 2 + fbm(px, py * 4, pz, 2), py * 6, pz * 2, 4); c = mix(hex('#c9a668'), hex('#f2e3bd'), ss(-.4, .4, f)); }
      else if (kind === 'earth') {
        const h = fbm(px * 1.8, py * 1.8, pz * 1.8, 5), land = h > .05, ice = Math.abs(lat) > 1.2 + fbm(px * 4, py * 4, pz * 4, 2) * .2;
        c = land ? mix(hex('#3c6a30'), hex('#9c8456'), ss(-.2, .4, fbm(px * 4 + 3, py * 4, pz * 4, 3)) * (1 - ss(.5, .9, Math.abs(Math.abs(lat) - .45) * 3) * .5)) : mix(hex('#0b2756'), hex('#1f5b9e'), ss(-.3, .05, h));
        if (ice) c = hex('#eef3f6');
        const cloud = ss(.05, .42, fbm(px * 3.2 + 9, py * 4.2, pz * 3.2, 5)); c = mix(c, hex('#f4f6f8'), cloud * .85);
      }
      else if (kind === 'mars') { const f = fbm(px * 2.2, py * 2.2, pz * 2.2, 5); c = mix(hex('#9a4527'), hex('#cf7444'), ss(-.4, .35, f)); c = mix(c, hex('#5a2c1b'), ss(.12, .35, fbm(px * 1.4 + 5, py * 1.4, pz * 1.4, 3)) * .7); if (Math.abs(lat) > 1.33 + fbm(px * 5, py * 5, pz * 5, 2) * .15) c = hex('#f1ece4'); }
      else if (kind === 'jupiter' || kind === 'saturn') {
        const turb = fbm(px * 3, py * 9, pz * 3, 4) * (kind === 'jupiter' ? .07 : .025);
        c = bands(kind === 'jupiter' ? JUP : SAT, (Math.sin(lat) + turb) * .5 + .5);
        c = mix(c, hex('#ffffff'), ss(.2, .5, fbm(px * 8, py * 20, pz * 8, 2)) * .08);
        if (kind === 'jupiter') { const dl = (lat + .39) / .07, dn = Math.atan2(Math.sin(lon - 1.2), Math.cos(lon - 1.2)) / .17, e = dl * dl + dn * dn; c = mix(c, hex('#b8573c'), ss(1.1, .5, e)); }   // the Great Red Spot
      }
      else if (kind === 'uranus') { c = mix(hex('#93cfd8'), hex('#b9e6ea'), ss(-.6, .9, Math.sin(lat * 3) * .2 + sl * .6 + fbm(px * 2, py * 8, pz * 2, 2) * .2)); }
      else if (kind === 'neptune') { c = mix(hex('#2a4fb4'), hex('#4d7fe0'), ss(-.5, .5, Math.sin(lat * 7 + fbm(px * 3, py * 6, pz * 3, 3) * 2) * .5 + .2)); const dl = (lat + .38) / .09, dn = Math.atan2(Math.sin(lon - 2.4), Math.cos(lon - 2.4)) / .16; c = mix(c, hex('#1a2f7a'), ss(1.1, .4, dl * dl + dn * dn)); }
      else { const f = fbm(px * 4, py * 4, pz * 4, 4); c = mix(hex('#6d6a66'), hex('#b3afa8'), ss(-.4, .4, f)); }   // the Moon
      const k = (y * W + x) * 4; img.data[k] = c[0]; img.data[k + 1] = c[1]; img.data[k + 2] = c[2]; img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

/* Saturn's rings, inner to outer: the faint C ring, the bright B ring, the Cassini Division, the A ring with the Encke Gap. */
function ringTexture() {
  const W = 512, cv = document.createElement('canvas'); cv.width = W; cv.height = 1;
  const g = cv.getContext('2d'), img = g.createImageData(W, 1), r = rng(9);
  for (let x = 0; x < W; x++) {
    const u = x / (W - 1); let a, c;
    if (u < .22) { a = .12 + .08 * (u / .22); c = [150, 135, 115]; }
    else if (u < .58) { a = .78 + .12 * Math.sin(u * 70); c = [222, 205, 172]; }
    else if (u < .64) { a = .07; c = [120, 110, 95]; }
    else if (u < .9) { a = (Math.abs(u - .86) < .006 ? .1 : .55) + .06 * Math.sin(u * 90); c = [204, 190, 160]; }
    else { a = .5 * (1 - (u - .9) / .1); c = [196, 182, 154]; }
    a *= .85 + .15 * r();
    img.data[x * 4] = c[0]; img.data[x * 4 + 1] = c[1]; img.data[x * 4 + 2] = c[2]; img.data[x * 4 + 3] = Math.round(Math.max(0, Math.min(1, a)) * 255);
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}


/* A name, a kind and one true fact for each body, shown when the pointer rests on it. */
const INFO = {
  sun: ['The Sun', 'Our star', 'Its light takes about eight minutes to reach Earth.'],
  mercury: ['Mercury', 'Rocky planet · 1st from the Sun', 'The smallest planet. A year there lasts just 88 days.'],
  venus: ['Venus', 'Rocky planet · 2nd from the Sun', 'The hottest planet, about 465 °C under thick clouds. It spins backwards.'],
  earth: ['Earth', 'Rocky planet · 3rd from the Sun', 'Home, and the only world we know of with life.'],
  mars: ['Mars', 'Rocky planet · 4th from the Sun', 'Red from iron-rich dust. Home of Olympus Mons, the tallest volcano we know of.'],
  jupiter: ['Jupiter', 'Gas giant · 5th from the Sun', 'The largest planet. Its Great Red Spot is a storm wider than Earth.'],
  saturn: ['Saturn', 'Gas giant · 6th from the Sun', 'Its rings are about 280,000 km across, yet in places only about ten metres thick.'],
  uranus: ['Uranus', 'Ice giant · 7th from the Sun', 'It rolls around the Sun on its side, tilted about 98°.'],
  neptune: ['Neptune', 'Ice giant · 8th from the Sun', 'The windiest planet, with gusts over 2,000 km/h. One year there lasts 165 Earth years.'],
  crab: ['The Crab Nebula', 'Supernova remnant · about 6,500 light-years away', 'The wreck of a star whose explosion Chinese astronomers recorded in 1054. The pulsar at its heart spins 30 times a second.'],
  pillars: ['The Pillars of Creation', 'Eagle Nebula · about 7,000 light-years away', 'Towers of cold gas and dust, about four light-years tall, lit by hot young stars above them. New stars are forming inside.'],
  andromeda: ['The Andromeda Galaxy', 'Our nearest large galaxy · 2.5 million light-years away', 'About a trillion stars. In a dark sky it spans six full Moons, and in about 4.5 billion years it will merge with our Milky Way.'],
  belt: ['The asteroid belt', 'Between Mars and Jupiter', 'Millions of rocky bodies, yet so spread out that a spacecraft can fly through without a care. All together they weigh only about 3% as much as our Moon.']
};

export function createSolar({ small = false, ui = null, labelId = 'cosmos', pointer = null, onHover = null } = {}) {
  const r = rng(1969), root = new THREE.Group(), system = new THREE.Group();
  system.rotation.set(.4, 0, -.12); root.add(system);   // we look down on the plane of the orbits from about 23°

  /* Sizes are set in screen pixels (radius, on a 900-px-tall view) and turned into world units for the distance,
     so the system can sit close to the camera (strong parallax) and still look small. */
  const D = 140, U = 2 * Math.tan(THREE.MathUtils.degToRad(21)) / 900 * D;   // world units per pixel at that distance

  /* The sun: a modest, limb-darkened disc with a soft glow whose glare covers passing planets. */
  const sun = new THREE.Group(); system.add(sun);
  const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 1 } }, transparent: true,
    vertexShader: 'varying vec3 vN, vV; void main() { vec4 w = modelMatrix * vec4(position, 1.); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: 'uniform float uOpacity; varying vec3 vN, vV; void main() { float mu = max(dot(normalize(vN), normalize(vV)), 0.); vec3 c = mix(vec3(1., .62, .36), vec3(1., .94, .84), pow(mu, .45)) * (.5 + .5 * mu) * 1.1; gl_FragColor = vec4(c, uOpacity); }'
  }));
  const glare = (c, o) => { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: col(c), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, opacity: o })); m.renderOrder = 2; m.userData.o = o; return m; };
  const sunGlow = [glare('#fff1dc', .45), glare('#ffb36e', .09)];
  sun.add(sunDisc, ...sunGlow); sunDisc.renderOrder = 1;

  /* px: radius in pixels; o: orbit radius in pixels from the sun (desktop). Periods follow Kepler's third law. */
  const S = small ? 128 : 256;
  const PL = [
    { k: 'mercury', o: 20, e: .206, i: .12, px: 2.9, glow: '#b5aea5', tilt: 0, spin: 60, map: [S, S / 2] },
    { k: 'venus', o: 29, e: .007, i: .06, px: 3.7, glow: '#f3dfb0', tilt: 3.1, spin: -90, map: [S, S / 2], atmo: ['#ffe2a8', .35] },
    { k: 'earth', o: 39, e: .017, i: 0, px: 3.8, glow: '#8fb5ff', tilt: .41, spin: 22, map: [S, S / 2], atmo: ['#6fa8ff', .55] },
    { k: 'mars', o: 51, e: .093, i: .03, px: 3.1, glow: '#ff9a6a', tilt: .44, spin: 23, map: [S, S / 2], atmo: ['#ffb08a', .12] },
    { k: 'jupiter', o: 93, e: .049, i: .02, px: 7.8, glow: '#f0d9b5', tilt: .05, spin: 12, map: [S * 1.5, S * .75] },
    { k: 'saturn', o: 124, e: .057, i: .04, px: 6.9, glow: '#f2dfb0', tilt: .47, spin: 13, map: [S * 1.5, S * .75] },
    { k: 'uranus', o: 160, e: .046, i: .01, px: 5.1, glow: '#b8eef2', tilt: 1.71, spin: -18, map: [S, S / 2], atmo: ['#bff4ff', .25] },
    { k: 'neptune', o: 196, e: .01, i: .03, px: 5, glow: '#7aa0ff', tilt: .49, spin: 17, map: [S, S / 2], atmo: ['#7fa8ff', .25] }
  ];
  const sphere = new THREE.SphereGeometry(1, 40, 24), small3 = new THREE.SphereGeometry(1, 16, 10), mats = [];
  const planetMat = (map, atmo) => { const m = new THREE.ShaderMaterial({ uniforms: { map: { value: map }, uSun: { value: new THREE.Vector3() }, uAtmoCol: { value: col(atmo ? atmo[0] : '#000000') }, uAtmo: { value: atmo ? atmo[1] : 0 }, uOpacity: { value: 1 }, uLight: { value: 1.55 } }, vertexShader: PLANET_V, fragmentShader: PLANET_F, transparent: true }); mats.push(m); return m; };
  const planets = PL.map(p => {
    const holder = new THREE.Group(), body = new THREE.Mesh(sphere, planetMat(surface(p.k, ...p.map), p.atmo));
    const axis = new THREE.Group(); axis.rotation.z = p.tilt; axis.add(body); holder.add(axis); system.add(holder); body.renderOrder = 1;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: col(p.glow), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: .2 })); halo.renderOrder = 1; holder.add(halo);   // a faint glow, so it reads at a glance
    const o = { ...p, holder, body, axis, halo, R: 1, a: p.o, M0: r() * Math.PI * 2, T: 60 * Math.pow(p.o / 39, 1.5), w: r() * Math.PI * 2, node: r() * Math.PI * 2 };
    if (p.k === 'saturn') {
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.24, 2.27, 160, 1), new THREE.ShaderMaterial({
        uniforms: { map: { value: ringTexture() }, uSun: { value: new THREE.Vector3() }, uPC: { value: new THREE.Vector3() }, uN: { value: new THREE.Vector3() }, uPR: { value: 1 }, uOpacity: { value: 1 }, uIn: { value: 1.24 }, uOut: { value: 2.27 }, uLight: { value: 1.2 } },
        vertexShader: RING_V, fragmentShader: RING_F, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor
      }));
      ring.rotation.x = -Math.PI / 2; ring.renderOrder = 1; axis.add(ring); o.ring = ring;
    }
    if (p.k === 'earth') { const moon = new THREE.Mesh(small3, planetMat(surface('moon', S / 2, S / 4))); holder.add(moon); o.moons = [{ m: moon, d: 9, px: .9, T: 9, ph: r() * 6 }]; }
    if (p.k === 'jupiter') o.moons = [[11, 5], [14, 9], [18, 16], [24, 34]].map(([d, T]) => { const m = new THREE.Mesh(small3, planetMat(surface('moon', 32, 16))); holder.add(m); return { m, d, px: .8, T, ph: r() * 6 }; });
    return o;
  });

  /* The asteroid belt, as it really is shaped (only far denser than life, so it can be seen at all): the main belt from
     2.1 to 3.3 AU, with the Kirkwood gaps that Jupiter's pull keeps clear, rocks on orbits inclined by up to ~20°,
     and the two swarms of Trojan asteroids that share Jupiter's orbit 60° ahead of it and 60° behind.
     Positions are in pixels from the sun (AU mapped between Mars and Jupiter), scaled in sizes(). */
  const AU = au => 51 + (au - 1.52) / (5.2 - 1.52) * 42;
  const GAPS = [2.5, 2.82, 2.95, 3.27];
  const BN = small ? 700 : 1800, TN = small ? 160 : 420, bp = new Float32Array((BN + TN) * 3), bc = new Float32Array((BN + TN) * 3);
  for (let i = 0; i < BN + TN; i++) {
    let rad, th, y;
    if (i < BN) {
      let au; do { au = 2.1 + Math.pow(r(), .8) * 1.2; } while (GAPS.some(g => Math.abs(au - g) < .025) && r() < .92);
      rad = AU(au); th = r() * Math.PI * 2; y = rad * Math.sin(gaussian(r) * .13);
    } else {
      rad = 93 * (1 + gaussian(r) * .035); th = (i % 2 ? 1 : -1) * Math.PI / 3 + gaussian(r) * .2; y = rad * Math.sin(gaussian(r) * .12);
    }
    bp.set([Math.cos(th) * rad, y, Math.sin(th) * rad], i * 3);
    const b = .07 + Math.pow(r(), 3) * .2; bc.set([b, b * .93, b * .84], i * 3);
  }
  const mkPts = (from, n) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(bp.slice(from * 3, (from + n) * 3), 3)); g.setAttribute('color', new THREE.BufferAttribute(bc.slice(from * 3, (from + n) * 3), 3)); const o = new THREE.Points(g, beltMat); o.frustumCulled = false; o.renderOrder = 1; system.add(o); return o; };
  const beltMat = additive({ uniforms: { uOpacity: { value: 1 } }, vertexShader: `attribute vec3 color; uniform float uOpacity; varying vec3 vColor; varying float vAlpha;
    void main() { vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = 1.3; vColor = color; vAlpha = uOpacity; }`, fragmentShader: POINT_FRAG });
  const belt = mkPts(0, BN), trojans = mkPts(BN, TN);

  /* A patch of darker sky behind the system, so the small planets stand out against it. */
  const shadeTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(.55, 'rgba(0,0,0,.7)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
  const shade = new THREE.Sprite(new THREE.SpriteMaterial({ map: shadeTex, color: 0x000000, transparent: true, depthWrite: false, depthTest: false, opacity: .6 }));
  shade.position.set(0, 0, -6); shade.renderOrder = -1.5; root.add(shade);   // drawn right after the sky, before the stars and the planets

  /* Hover labels: a ring around the body and a small card with its name, its kind and one fact. */
  const beltMark = new THREE.Object3D(); root.add(beltMark);
  const bodies = [{ k: 'sun', obj: sunDisc, px: () => sunPx }, ...planets.map(p => ({ k: p.k, obj: p.body, px: () => p.px * scaleK, p })), { k: 'belt', obj: beltMark, px: () => 0, belt: true }];
  const BELT = bodies.length - 1, ray = new THREE.Raycaster(), plane = new THREE.Plane(), hitP = new THREE.Vector3(), up = new THREE.Vector3(), ndc = new THREE.Vector2();
  const card = (b, cls = 'planet-lab') => { const [n, kind, fact] = INFO[b.k]; b.lab = ui ? ui.label(labelId, `<span class="tag card-tip"><b>${n}</b><small>${kind}</small>${fact}</span>`, cls) : null; };
  bodies.forEach(b => card(b));
  let hot = -1, tapHot = -1, tapUntil = 0, cursorSet = false, sunPx = 8.5, scaleK = 1, orbitK = 1, st = 0, lastT = -1, speed = 1;
  const wp = new THREE.Vector3();
  function pick(x, y, camera) {
    let best = -1, bd = 1e9;
    bodies.forEach((b, i) => {
      if (b.belt) return;
      b.obj.getWorldPosition(wp); const s = ui.screen(wp, camera); if (s.z > 1) return;
      const rad = b.px() * innerHeight / 900, d = Math.hypot(s.x - x, s.y - y);
      if (d < Math.max(rad + 9, 14) && d < bd) { bd = d; best = i; }
    });
    if (best < 0) {   // the asteroid belt: where the pointer's ray meets the plane of the orbits, between the belt's radii
      ndc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
      sun.getWorldPosition(sunW); up.set(0, 1, 0).transformDirection(system.matrixWorld); plane.setFromNormalAndCoplanarPoint(up, sunW);
      if (ray.ray.intersectPlane(plane, hitP)) { const d = hitP.distanceTo(sunW) / (orbitK * U); if (d > 56 && d < 73) { best = BELT; root.worldToLocal(beltMark.position.copy(hitP)); } }
    }
    return best;
  }

  function sizes() {
    sunDisc.scale.setScalar(sunPx * U); sunGlow[0].scale.setScalar(sunPx * U * 4.2); sunGlow[1].scale.setScalar(sunPx * U * 13);
    planets.forEach(p => {
      p.R = p.px * scaleK * U; p.body.scale.setScalar(p.R); p.halo.scale.setScalar(p.R * 6); p.a = p.o * orbitK * U;
      if (p.ring) { p.ring.scale.setScalar(p.R); p.ring.material.uniforms.uPR.value = p.R; }
      (p.moons || []).forEach(m => m.m.scale.setScalar(m.px * U));
    });
    belt.scale.setScalar(orbitK * U); trojans.scale.setScalar(orbitK * U);
    shade.scale.set(260 * orbitK * U * 1.35, 150 * orbitK * U * 1.35, 1);
  }

  const sunW = new THREE.Vector3(), pW = new THREE.Vector3(), nW = new THREE.Vector3(), anchor = new THREE.Vector3(0, 0, -D), tmpV = new THREE.Vector3();
  return {
    group: root,
    /* Low on the left of the frame, clear of the words; a phone gets a more compact system. */
    layout(aspect) {
      const tall = aspect < 1, tv = Math.tan(THREE.MathUtils.degToRad(21)), th = tv * aspect;
      const sx = tall ? .27 : .13, sy = tall ? .815 : .855;
      anchor.set((2 * sx - 1) * th * D, (1 - 2 * sy) * tv * D, -D);
      sunPx = tall ? 6 : 8.5; scaleK = tall ? .9 : 1; orbitK = tall ? .56 : .86; sizes();
    },
    /* Held at its spot in the frame whatever the film camera does (called before the camera turns toward the mouse); the scroll draws it a little nearer. */
    follow(camera, near = 0) {
      tmpV.set(anchor.x, anchor.y, anchor.z * (1 - near));
      root.position.copy(camera.localToWorld(tmpV)); root.quaternion.copy(camera.quaternion);
    },
    /* A tap on a phone shows a body's card for a few seconds. */
    tap(x, y, camera, t) { if (!ui) return false; const i = pick(x, y, camera); if (i < 0) return false; tapHot = i; tapUntil = t + 4.5; if (onHover) onHover(INFO[bodies[i].k][0]); return true; },
    get hovering() { return hot >= 0; },
    get hotKey() { return hot >= 0 ? bodies[hot].k : null; },
    /* Other things in the sky can be looked at too (the nebulae): px() is their radius on screen. */
    addTarget(k, obj, px) { const b = { k, obj, px, neb: true }; card(b, 'planet-lab neb-lab'); bodies.push(b); },
    update(t, opacity = 1, { camera = null, active = false } = {}) {
      // The system's own clock: it eases to a stop while you look at one of its bodies.
      const dt = lastT < 0 ? 0 : Math.min(.1, Math.max(0, t - lastT)); lastT = t; speed += ((hot >= 0 ? 0 : 1) - speed) * Math.min(1, dt * 6); st += dt * speed;
      planets.forEach(p => {
        // Kepler: mean anomaly → (approximate) true anomaly → distance on the ellipse.
        const M = p.M0 + st / p.T * Math.PI * 2, nu = M + 2 * p.e * Math.sin(M) + 1.25 * p.e * p.e * Math.sin(2 * M), rad = p.a * (1 - p.e * p.e) / (1 + p.e * Math.cos(nu)), ang = nu + p.w;
        p.ang = ang; p.holder.position.set(Math.cos(ang) * rad, Math.sin(ang - p.node) * rad * Math.sin(p.i), Math.sin(ang) * rad);
        p.body.rotation.y = st / p.spin * Math.PI * 2;
        (p.moons || []).forEach(m => { const a = m.ph + st / m.T * Math.PI * 2, d = m.d * U * scaleK; m.m.position.set(Math.cos(a) * d, Math.sin(a) * d * .05, Math.sin(a) * d); });
      });
      sun.getWorldPosition(sunW);
      mats.forEach(m => { m.uniforms.uSun.value.copy(sunW); m.uniforms.uOpacity.value = opacity; });
      planets.forEach(p => { p.halo.material.opacity = .2 * opacity; });
      belt.rotation.y = -st / (60 * Math.pow(64 / 39, 1.5)) * Math.PI * 2; trojans.rotation.y = -planets[4].ang; beltMat.uniforms.uOpacity.value = opacity; shade.material.opacity = .6 * opacity;   // the Trojans keep pace with Jupiter
      const sat = planets[5];
      if (sat.ring) { const u = sat.ring.material.uniforms; u.uSun.value.copy(sunW); sat.body.getWorldPosition(pW); u.uPC.value.copy(pW); nW.set(0, 0, 1).transformDirection(sat.ring.matrixWorld); u.uN.value.copy(nW); u.uOpacity.value = opacity; }
      sunDisc.material.uniforms.uOpacity.value = opacity; sunGlow.forEach(g => { g.material.opacity = g.userData.o * opacity; });

      // Hover: follow the pointer every frame, since the planets keep moving under it.
      if (!ui || !camera) return;
      const live = active && opacity > .5;
      let now = live && pointer && pointer.inside ? pick(pointer.x, pointer.y, camera) : -1;
      if (now < 0 && live && t < tapUntil) now = tapHot;
      if (now !== hot) { if (now >= 0 && onHover) onHover(INFO[bodies[now].k][0]); hot = now; }
      const want = live && hot >= 0;
      if (want !== cursorSet) { document.body.style.cursor = want ? 'pointer' : ''; cursorSet = want; }
      bodies.forEach((b, i) => {
        if (!b.lab) return;
        if (i === hot && live) { b.obj.getWorldPosition(wp); b.lab.el.style.setProperty('--r', `${Math.max(5, b.px() * innerHeight / 900 + 5)}px`); ui.place(b.lab, wp, camera, true); b.lab.el.classList.toggle('flip', b.lab.x > innerWidth * .55); b.lab.el.classList.toggle('below', b.lab.y < innerHeight * .3); }
        else if (b.lab.on) ui.place(b.lab, wp, camera, false);
      });
    }
  };
}
