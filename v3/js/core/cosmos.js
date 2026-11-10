/* Deep space, kept quiet and real. Everything is far away, and each layer sits at a distance that makes sense,
   so as the camera flies forward (and turns a little toward the mouse), nearer things shift more than farther ones:
     · the Milky Way, at infinity: a faint band of unresolved stars with warm star clouds toward the galactic
       centre and dark dust lanes along its middle (painted once into a cube map; it never shifts)
     · thousands of pin-point stars, thickest along the band, at 80–900 units
     · a few tiny galaxies, 900–1300 units away
     · one modest sun 300 units away, with its eight planets on Kepler orbits (see solar.js)
     · the Crab Nebula (a supernova remnant) on the right edge of the sky, and the Pillars of Creation on the left, both in 3D
     · the Andromeda Galaxy, the farthest thing here (2200 units away)
     · a soft violet nebula that glows up behind the brain, and nowhere else */
import * as THREE from 'three';
import { additive, POINT_FRAG, rng, unitVector, gaussian, col, noise3, glowTexture } from './util.js';
import { createSolar } from './solar.js';

const SKY = `
  varying vec3 vDir; uniform vec3 uN, uCore;
  float h(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float n3(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
    return mix(mix(mix(h(i), h(i + vec3(1, 0, 0)), f.x), mix(h(i + vec3(0, 1, 0)), h(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(h(i + vec3(0, 0, 1)), h(i + vec3(1, 0, 1)), f.x), mix(h(i + vec3(0, 1, 1)), h(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
  float fbm(vec3 p) { float s = 0., a = .5; for (int i = 0; i < 6; i++) { s += a * n3(p); p = p * 2.03 + vec3(1.7, 9.2, 3.4); a *= .5; } return s; }
  float starLayer(vec3 d, float scale, float density) {
    vec3 g = d * scale, cell = floor(g), f = fract(g) - .5;
    if (h(cell) < 1. - density) return 0.;
    vec3 off = vec3(h(cell + 1.7), h(cell + 3.1), h(cell + 5.3)) - .5;
    float dist = length(f - off * .7);
    return exp(-dist * dist * 60.) * (.3 + .7 * h(cell + 9.1));
  }
  void main() {
    vec3 d = normalize(vDir);
    float lat = dot(d, uN);
    vec3 onBand = normalize(d - uN * lat);
    float along = acos(clamp(dot(onBand, uCore), -1., 1.));                     // angle along the band from the galactic centre
    float core = exp(-pow(along / .6, 2.)), bulge = exp(-pow(length(d - uCore) / .26, 2.));
    float w = (.1 + .07 * fbm(d * 2.3)) * (1. + core * .9);
    float band = exp(-pow(lat / w, 2.)), halo = exp(-pow(lat / (w * 3.4), 2.)) * .2;
    float clouds = .25 + 1.2 * fbm(d * 9. + 3.1), fine = .55 + .9 * fbm(d * 34.);
    vec3 wp = d * 5. + vec3(fbm(d * 3.), fbm(d * 3. + 7.), 0.) * 1.3;
    float lanes = smoothstep(.5, .7, fbm(wp)) * exp(-pow((lat - .02 * sin(along * 3.)) / (w * .6), 2.));   // ragged dust
    float rift = exp(-pow((lat + .008) / (w * .2), 2.)) * smoothstep(.35, .6, fbm(d * 4. + 2.)) * (.35 + core * .65);   // the great rift
    float dust = clamp(lanes + rift, 0., 1.);
    float glow = (band * clouds * fine + halo + bulge * .8) * (1. - .9 * dust);
    vec3 c = vec3(.0025, .003, .0055);
    c += mix(vec3(.5, .48, .5), vec3(.72, .55, .38), clamp(core * 1.1 + bulge, 0., 1.)) * glow * .1;
    c += vec3(.3, .18, .1) * dust * band * .01;                                  // the warm brown edge of the dust
    float dens = (.22 + band * 1.9 + bulge * 2.) * (1. - .8 * dust);
    c += vec3(.86, .86, .95) * starLayer(d, 230., .05 * dens) * .2;
    c += vec3(.92, .92, 1.) * starLayer(d, 135., .025 * dens) * .28;
    gl_FragColor = vec4(c, 1.);
  }`;

/* Tileable 3D noise baked into a small volume texture (four fractal channels), for the violet nebula's gas. */
function volumeTexture(N) {
  const data = new Uint8Array(N * N * N * 4), buf = new Float32Array(N * N * N);
  const channels = [[11, 3, 4], [23, 6, 3], [37, 4, 3], [53, 2, 3]];   // [seed, base period, octaves]
  const sm = t => t * t * (3 - 2 * t);
  channels.forEach(([seed, P0, oct], ch) => {
    const r = rng(seed), lat = [];
    for (let o = 0; o < oct; o++) { const P = Math.min(P0 << o, N >> 1), L = new Float32Array(P * P * P); for (let i = 0; i < L.length; i++) L[i] = r(); lat.push({ P, L, a: Math.pow(.5, o) }); }
    const axes = lat.map(({ P }) => { const i0 = new Int32Array(N), i1 = new Int32Array(N), f = new Float32Array(N); for (let x = 0; x < N; x++) { const u = x * P / N, i = Math.floor(u); i0[x] = i % P; i1[x] = (i + 1) % P; f[x] = sm(u - i); } return { i0, i1, f }; });
    let mn = 1e9, mx = -1e9, k = 0;
    for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++, k++) {
      let s = 0, norm = 0;
      for (let o = 0; o < lat.length; o++) {
        const { P, L, a } = lat[o], A = axes[o];
        const x0 = A.i0[x], x1 = A.i1[x], fx = A.f[x], y0 = A.i0[y] * P, y1 = A.i1[y] * P, fy = A.f[y], z0 = A.i0[z] * P * P, z1 = A.i1[z] * P * P, fz = A.f[z];
        const c00 = L[z0 + y0 + x0] + (L[z0 + y0 + x1] - L[z0 + y0 + x0]) * fx, c10 = L[z0 + y1 + x0] + (L[z0 + y1 + x1] - L[z0 + y1 + x0]) * fx;
        const c01 = L[z1 + y0 + x0] + (L[z1 + y0 + x1] - L[z1 + y0 + x0]) * fx, c11 = L[z1 + y1 + x0] + (L[z1 + y1 + x1] - L[z1 + y1 + x0]) * fx;
        const c0 = c00 + (c10 - c00) * fy, c1 = c01 + (c11 - c01) * fy;
        s += (c0 + (c1 - c0) * fz) * a; norm += a;
      }
      s /= norm; buf[k] = s; if (s < mn) mn = s; if (s > mx) mx = s;
    }
    const span = 1 / (mx - mn || 1);
    for (let i = 0; i < buf.length; i++) data[i * 4 + ch] = Math.round((buf[i] - mn) * span * 255);
  });
  const t = new THREE.Data3DTexture(data, N, N, N);
  t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType; t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping; t.unpackAlignment = 1; t.needsUpdate = true;
  return t;
}

/* A tiny, soft galaxy image: a warm core and a faint disc (inclined or edge-on), or a plain elliptical glow. */
function galaxyTexture(kind, seed) {
  const S = 96, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d'), r = rng(seed), c = S / 2;
  g.globalCompositeOperation = 'lighter';
  const blob = (x, y, rad, rgb, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); };
  if (kind === 'elliptical') { blob(c, c, S * .46, '255,226,196', .3); blob(c, c, S * .16, '255,236,212', .7); }
  else {
    if (kind === 'edge') { g.translate(c, c); g.scale(1, .2); g.translate(-c, -c); }
    blob(c, c, S * .46, '176,190,236', .16);
    for (let i = 0; i < 500; i++) {
      const t = Math.pow(r(), .85), rad = .12 + t * .8, th = (i % 2) * Math.PI + Math.log(rad + .05) * 2.6 + gaussian(r) * .3;
      blob(c + Math.cos(th) * rad * S * .44, c + Math.sin(th) * rad * S * .44, 1.4 + r() * 2, t < .35 ? '255,226,196' : '190,204,255', .1);
    }
    blob(c, c, S * .14, '255,222,180', .6); blob(c, c, S * .045, '255,244,226', .9);
  }
  const out = document.createElement('canvas'); out.width = out.height = S; const og = out.getContext('2d');
  og.filter = 'blur(1.4px)'; og.drawImage(cv, 0, 0);
  const t = new THREE.CanvasTexture(out); t.colorSpace = THREE.SRGBColorSpace; return t;
}


/* A supernova remnant, after the Crab Nebula: the blue-white synchrotron glow around the pulsar at its heart, wrapped
   in a 3D web of filaments (hydrogen red, orange and gold, with green-teal patches). It is still expanding: two layers
   of filaments drift slowly outward and cross-fade, so the motion never stops and never jumps. Its gas thins out
   gradually into space, with a faint halo well beyond the bright edge. */
const SNR_F = `
  precision highp sampler3D;
  uniform sampler3D tVol; uniform vec3 uR, uSeed, uRed, uOrange, uGold, uGreen, uBlue; uniform float uScale, uTime, uOpacity, uGain, uK, uRot, uPad;
  varying vec3 vL;
  vec4 layer(vec3 base, float grow, vec3 seed, float r, out vec3 cf) {
    vec3 p = base / (1. + grow * .4) + seed;                                       // sampling shrinks, so features move outward
    vec4 w = texture(tVol, p * .45 + vec3(uTime * .012, uTime * .007, -uTime * .005));   // the flow itself keeps changing
    vec3 q = p + (w.rgb - .5) * 1.1;
    vec4 n = texture(tVol, q * 1.3), m = texture(tVol, q * 2.7 + .31);
    float f = pow(1. - abs(n.b * 2. - 1.), 10.) + pow(1. - abs(m.r * 2. - 1.), 14.) * .9;
    cf = mix(uRed, uOrange, smoothstep(.3, .7, w.a));
    cf = mix(cf, uGold, smoothstep(.55, .82, n.g) * .75);
    cf = mix(cf, uGreen, smoothstep(.6, .85, m.a) * .65);
    return vec4(f, n.r, m.g, 0.);
  }
  void main() {
    vec3 L = vL; float cr = cos(uRot), sr = sin(uRot); L.xz = mat2(cr, -sr, sr, cr) * L.xz;
    vec3 e = L / uR; float r = length(e);
    if (r > uPad) discard;
    vec3 base = L / uScale;
    float ph = uTime * .035, g1 = fract(ph), g2 = fract(ph + .5), a1 = 1. - abs(2. * g1 - 1.);
    vec3 c1, c2;
    vec4 l1 = layer(base, g1, uSeed, r, c1), l2 = layer(base, g2, uSeed + 3.7, r, c2);
    float fil = l1.x * a1 + l2.x * (1. - a1), nr = mix(l2.y, l1.y, a1), mg = mix(l2.z, l1.z, a1);
    vec3 cf = mix(c2, c1, a1);
    float edge = exp(-pow(max(0., r + (nr - .5) * .5 - .55) / .32, 2.));            // bright inside, then thinning out smoothly
    fil *= smoothstep(.1, .5, r) * edge;
    float glow = exp(-r * r * 4.) * (.55 + .45 * mg);
    float wisp = texture(tVol, base * .6 + uSeed + vec3(uTime * .01, -uTime * .004, uTime * .006)).r;
    float halo = exp(-r * r * 1.3) * (.25 + 1.1 * smoothstep(.4, .8, wisp)) * .13;   // the faintest gas, drifting, far past the edge
    float k = uGain * uOpacity / uK;
    vec3 c = (cf * fil * 1.35 + mix(uBlue, vec3(1.), exp(-r * r * 18.) * .5) * glow * 1.5 + mix(uRed, uBlue, .35) * halo) * k;
    gl_FragColor = vec4(c, 0.);
  }`;

/* The Pillars of Creation (in the Eagle Nebula), built in 3D: columns of cold dust with lumpy, finger-like surfaces
   rising out of a teal glow of ionised oxygen. The dust absorbs the glow behind it; only the tops that face the young
   stars above are lit, with golden rims and a yellow-green haze. The dense columns stand still, while the glowing gas
   streams slowly up and away from their tops and churns around them; everything fades gradually into space.
   Drawn back to front with "over" blending, so each slice can both swallow light (alpha) and add its own (colour). */
const PIL_F = `
  precision highp sampler3D;
  uniform sampler3D tVol; uniform vec3 uR, uSeed; uniform float uTime, uOpacity, uGain, uK, uRot, uAbs, uPad;
  varying vec3 vL;
  float seg(vec3 p, vec2 b, vec2 t, float rb, float rt, float cz) {
    float h = clamp((p.y - b.y) / (t.y - b.y), 0., 1.);
    return length(p - vec3(mix(b.x, t.x, h), mix(b.y, t.y, h), cz)) - mix(rb, rt, h);
  }
  float pillars(vec3 p) {
    float d = seg(p, vec2(-.5, -1.3), vec2(-.36, .5), .3, .15, .1);               // the tall pillar
    d = min(d, length((p - vec3(-.27, .57, .1)) * vec3(1., 1.3, 1.)) - .19);       // its head, leaning right
    d = min(d, seg(p, vec2(.16, -1.3), vec2(.24, .08), .22, .1, 0.));             // the middle pillar
    d = min(d, seg(p, vec2(.6, -1.3), vec2(.58, -.34), .16, .09, -.05));          // the small one on the right
    d = min(d, seg(p, vec2(.44, -1.3), vec2(.52, -.62), .1, .07, -.05));          // and a finger beside it
    return d;
  }
  void main() {
    vec3 P = vL / uR;
    float R0 = length(P * vec3(1., .92, 1.35));
    if (R0 > uPad) discard;
    // The columns: their surfaces barely change.
    vec3 s0 = P * 1.3 + uSeed + vec3(0., 0., uTime * .0008);
    vec4 nd = texture(tVol, s0), md = texture(tVol, s0 * 2.4 + .17);
    float disp = (nd.g - .5) * .16 + (md.b - .5) * .07;
    float d = pillars(P) + disp, dUp = pillars(P + vec3(0., .05, 0.)) + disp;
    float up = clamp((dUp - d) / .05, -1., 1.);                                    // +1 where the surface faces up, toward the stars
    // The glowing gas: it churns, and streams up and away from the lit tops.
    vec3 q0 = P * 1.2 + uSeed + vec3(sin(uTime * .05) * .03, -uTime * .04, uTime * .01);
    vec4 w = texture(tVol, q0 * .5 + vec3(uTime * .012, -uTime * .006, uTime * .008));
    vec3 q = q0 + (w.rgb - .5) * .9;
    vec4 n = texture(tVol, q), m = texture(tVol, q * 2.6 + .31);
    float env = exp(-pow(max(0., R0 + (n.r - .5) * .45 - .45) / .38, 2.));          // dense in the middle, thinning out smoothly
    float colEnv = exp(-pow(max(0., R0 - .7) / .3, 2.));
    float inside = smoothstep(.06, -.05, d) * colEnv;
    float rim = exp(-pow(d / .05, 2.)) * smoothstep(-.2, .8, up) * colEnv;
    float top = smoothstep(-.6, .7, P.y);
    vec3 haze = mix(vec3(.05, .26, .25), vec3(.24, .56, .5), smoothstep(.35, .8, n.r)) * (.3 + .7 * m.g) * (.4 + .6 * top) * env;
    vec4 tf = texture(tVol, P * 2.2 + uSeed + vec3(0., -uTime * .09, uTime * .02));          // gas boiling off the lit tips, rising fast
    haze = mix(haze, vec3(.74, .78, .44) * (.3 + .7 * n.b) * (.35 + 1.2 * tf.r), exp(-pow(d / .14, 2.)) * smoothstep(0., .8, up) * .55 * colEnv);
    haze += vec3(.22, .06, .09) * exp(-R0 * R0 * .75) * smoothstep(.35, .8, m.a) * .35;      // the wider Eagle Nebula: faint hydrogen red all around
    haze += vec3(.06, .2, .19) * exp(-R0 * R0 * 1.1) * (.5 + .5 * n.r) * .5;        // the faintest outer glow
    vec3 body = mix(vec3(.2, .08, .035), vec3(.52, .25, .1), smoothstep(.3, .8, md.r)) * (.3 + .7 * smoothstep(-.4, .9, up + P.y * .4));
    vec3 rimC = mix(vec3(1., .6, .24), vec3(1., .86, .5), smoothstep(.4, .8, n.b));
    float k = uGain * uOpacity / uK;
    gl_FragColor = vec4((haze * (1. - inside) + body * inside * .9 + rimC * rim * 1.9) * k, inside * uAbs * uOpacity);
  }`;

/* The Andromeda Galaxy as it really looks: a disc seen nearly edge-on (about 77°), so it is a long, soft spindle.
   Most of its light is a big, smooth, yellowish bulge (a squashed ball, drawn facing us); the disc around it is faint
   and turns bluer outward, its spiral arms wound so tightly they read almost as rings, with a ring of young blue stars.
   Dark dust lanes follow the arms; on the side of the disc nearest us they block the bulge's light behind them. */
const AND_F = `
  precision highp sampler3D;
  uniform sampler3D tVol; uniform float uOpacity; varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2. - 1.; float r = length(p);
    if (r > 1.) discard;
    float th = atan(p.y, p.x);
    float n = texture(tVol, vec3(p * 2.2, .37)).r, n2 = texture(tVol, vec3(p * 7., .61)).g, n3 = texture(tVol, vec3(p * 3.4 + 1.3, .2)).b;
    float sp = 2. * (th - log(r + .02) * 7.) + (n - .5) * 1.6;
    float arm = .5 + .5 * cos(sp), ring = exp(-pow((r - .56) / .09, 2.));
    float disc = exp(-r / .3) * smoothstep(1., .72, r);
    vec3 dcol = mix(vec3(1., .87, .7), vec3(.72, .8, .98), smoothstep(.2, .78, r));
    vec3 c = dcol * disc * (mix(1., .72 + .56 * arm, smoothstep(.12, .35, r)) + ring * .45);
    float lane = pow(.5 + .5 * cos(sp + 1.5), 5.) * smoothstep(.14, .3, r) * smoothstep(.95, .6, r) * (.6 + .4 * n3);
    lane = max(lane, exp(-pow((r - .47) / .04, 2.)) * (.55 + .45 * n3));
    float nearSide = smoothstep(-.15, .45, p.y);
    c *= 1. - lane * (.35 + .5 * nearSide);
    c += vec3(.75, .82, 1.) * smoothstep(.88, .98, n2) * ring * disc * 1.1;
    c += vec3(1., .55, .7) * smoothstep(.92, .99, n2 * n3 * 1.6) * ring * disc * .9;
    gl_FragColor = vec4(c * uOpacity * .8, lane * nearSide * .6 * uOpacity);
  }`;
const BUL_F = `
  uniform float uOpacity; varying vec2 vUv;
  void main() {
    vec2 q = vUv * 2. - 1.;
    float e = length(q * vec2(1., 1.75));
    float core = exp(-pow(e / .05, .9)) * 1.1, bulge = exp(-pow(e / .14, .85)) * .55 + exp(-e / .3) * .12;
    float halo = exp(-length(q * vec2(1., 2.4)) / .55) * .035;
    gl_FragColor = vec4((vec3(1., .93, .8) * core + vec3(1., .86, .66) * bulge + vec3(.85, .85, .95) * halo) * uOpacity, 0.);
  }`;

const NEB_V = `varying vec3 vL; void main() { vL = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
const NEB_F = `
  precision highp sampler3D;
  uniform sampler3D tVol; uniform vec3 uR, uA, uB, uC, uSeed; uniform float uScale, uTime, uOpacity, uGain, uK, uLanes, uFil, uCore;
  varying vec3 vL;
  void main() {
    vec3 e = vL / uR; float r2 = dot(e, e);
    if (r2 > 1.) discard;
    float shape = 1. - r2;
    vec3 p = vL / uScale + uSeed + vec3(0., 0., uTime * .006);
    vec4 w = texture(tVol, p * .37 + vec3(uTime * .002, 0., 0.));
    vec3 q = p + (w.rgb - .5) * 1.25;
    vec4 n = texture(tVol, q), m = texture(tVol, q * 2.3 + .31);
    float d = n.r * .64 + m.g * .36, v = d - (1. - shape) * .62;
    float dens = smoothstep(.28, .75, v) * smoothstep(0., .25, shape);
    dens += pow(1. - abs(n.b * 2. - 1.), 7.) * smoothstep(.05, .45, shape) * smoothstep(.25, .5, d) * uFil;   // fine filaments
    dens *= 1. - smoothstep(.56, .74, m.a) * uLanes;                                                          // dark dust lanes
    vec3 c = mix(uA, uB, smoothstep(.3, .75, n.g));
    c = mix(c, uC, smoothstep(.5, .85, v) * .6) * (1. + smoothstep(.6, .92, v) * uCore);                      // the hot, bright core
    float a = dens * uGain * uOpacity / uK;
    gl_FragColor = vec4(c * a, a);
  }`;

export function createCosmos(renderer, { small = false, ui = null, pointer = null, labelId = 'cosmos', onHover = null } = {}) {
  const r = rng(77), nz = noise3(29), group = new THREE.Group(), far = new THREE.Group(); group.add(far);

  /* ---------- The Milky Way, at infinity ---------- */
  const N = new THREE.Vector3(.14, 1, -.06).normalize();                       // the galactic plane runs just below the centre of the view, gently tilted
  const c0 = new THREE.Vector3(-.85, 0, -.5), CORE = c0.sub(N.clone().multiplyScalar(c0.dot(N))).normalize();   // its bright centre, off to the left
  const tmp = new THREE.Scene();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 64, 32), new THREE.ShaderMaterial({
    uniforms: { uN: { value: N }, uCore: { value: CORE } },
    vertexShader: 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: SKY, side: THREE.BackSide, depthWrite: false
  }));
  tmp.add(sky);
  const rt = new THREE.WebGLCubeRenderTarget(small ? 512 : 1024, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const cc = new THREE.CubeCamera(.1, 100, rt), tone = renderer.toneMapping;
  renderer.toneMapping = THREE.NoToneMapping; cc.update(renderer, tmp); renderer.toneMapping = tone;
  sky.geometry.dispose(); sky.material.dispose();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(2500, 48, 24), new THREE.ShaderMaterial({
    uniforms: { tCube: { value: rt.texture }, uI: { value: .62 } }, side: THREE.BackSide, depthWrite: false, depthTest: false,
    vertexShader: 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: 'uniform samplerCube tCube; uniform float uI; varying vec3 vDir; void main() { gl_FragColor = vec4(textureCube(tCube, normalize(vDir)).rgb * uI, 1.); }'
  }));
  dome.renderOrder = -10; dome.frustumCulled = false; group.add(dome);   // the Milky Way, drawn first; it turns with the rest of the sky

  const starMat = additive({
    uniforms: { uTime: { value: 0 }, uPx: { value: 1000 }, uOpacity: { value: 1 } },
    vertexShader: `
      attribute vec3 color; attribute vec4 aSeed; uniform float uTime, uPx, uOpacity; varying vec3 vColor; varying float vAlpha;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv;
        float tw = .84 + .16 * sin(uTime * aSeed.z + aSeed.x * 40.);
        gl_PointSize = max(1., uPx * aSeed.y / -mv.z); vColor = color * tw; vAlpha = uOpacity; }`,
    fragmentShader: POINT_FRAG
  });

  /* ---------- Pin-point stars through every depth, thickest along the band ---------- */
  const tints = [col('#ffffff'), col('#e6ecff'), col('#fff3e2'), col('#ffd9b0'), col('#d2ddff'), col('#ffc59a')];
  const FN = small ? 2200 : 5500, BN = small ? 4500 : 13000, SN = FN + BN;
  const sp = new Float32Array(SN * 3), sc = new Float32Array(SN * 3), ss = new Float32Array(SN * 4);
  const E2 = new THREE.Vector3().crossVectors(N, CORE).normalize(), d = new THREE.Vector3();
  for (let i = 0; i < SN; i++) {
    let dist, b, size;
    if (i < FN) {   // field stars, all around us
      dist = 80 + Math.pow(r(), .55) * 700; unitVector(r, d);
      b = Math.pow(r(), 6) * 1.3 + .1; size = .0011 + Math.pow(r(), 14) * .0034;
    } else {        // the band: many faint stars, clumped into star clouds
      let tries = 0;
      do {
        const nearCore = r() < .35, phi = nearCore ? gaussian(r) * .55 : (r() * 2 - 1) * Math.PI, lat = gaussian(r) * (nearCore ? .15 : .09);
        d.copy(CORE).multiplyScalar(Math.cos(phi)).addScaledVector(E2, Math.sin(phi)).multiplyScalar(Math.cos(lat)).addScaledVector(N, Math.sin(lat)).normalize();
      } while (r() > .35 + .65 * (nz(d.x * 4, d.y * 4, d.z * 4) * .5 + .5) && ++tries < 6);
      dist = 650 + r() * 250; b = Math.pow(r(), 4) * .6 + .06; size = .0011;
    }
    sp.set([d.x * dist, d.y * dist, d.z * dist], i * 3);
    const t = tints[Math.floor(r() * tints.length)];
    sc.set([t.r * b, t.g * b, t.b * b], i * 3);
    ss.set([r(), dist * size, .3 + r() * 1.4, r()], i * 4);
  }
  const sGeo = new THREE.BufferGeometry(); sGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sGeo.setAttribute('color', new THREE.BufferAttribute(sc, 3)); sGeo.setAttribute('aSeed', new THREE.BufferAttribute(ss, 4));
  const stars = new THREE.Points(sGeo, starMat); stars.frustumCulled = false; far.add(stars);

  /* ---------- A few tiny galaxies, very far away ---------- */
  const kinds = ['spiral', 'edge', 'elliptical'], gTex = kinds.map((k, i) => galaxyTexture(k, 300 + i * 17)), galaxies = [];
  const GSPOT = [[.62, .34], [-.4, .5], [.86, -.42], [-.78, -.2], [.18, .58], [-.2, -.5]];
  GSPOT.slice(0, small ? 3 : 6).forEach(([dx, dy], i) => {
    const kind = i % 3, m = new THREE.SpriteMaterial({ map: gTex[kind], transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, rotation: r() * Math.PI * 2 });
    const s = new THREE.Sprite(m), R = 3 + r() * 3.5, inc = kind === 0 ? .35 + r() * .5 : 1;
    s.scale.set(R * 2, R * 2 * inc, 1); s.userData = { dx, dy, dist: 900 + r() * 400, o: .35 + r() * .25 };
    far.add(s); galaxies.push(s);
  });

  /* ---------- A distant solar system: one sun, eight planets ---------- */
  const solar = createSolar({ small, ui, pointer, labelId, onHover }); group.add(solar.group);

  /* ---------- Nebulae: a stack of slices through 3D noise, so the gas has real thickness ---------- */
  const vol = volumeTexture(small ? 32 : 48);
  function nebula({ R, A = '#000000', B = '#000000', C = '#000000', seed, gain, slices, lanes = .6, fil = .4, core = 0, frag = NEB_F, extra = {}, over = false, pad = 1 }) {
    const VR = new THREE.Vector3(...R), K = small ? Math.ceil(slices / 2) : slices, pos = [], idx = [];
    const X = VR.x * pad, Y = VR.y * pad, Z = VR.z * pad;   // slices reach past the gas's shape (pad), so it can thin out gradually
    for (let k = 0; k < K; k++) { const z = -Z + (k + .5) / K * 2 * Z, b = k * 4; pos.push(-X, -Y, z, X, -Y, z, X, Y, z, -X, Y, z); idx.push(b, b + 1, b + 2, b, b + 2, b + 3); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      uniforms: { tVol: { value: vol }, uR: { value: VR }, uA: { value: col(A) }, uB: { value: col(B) }, uC: { value: col(C) }, uSeed: { value: new THREE.Vector3(...seed) },
        uScale: { value: (VR.x + VR.y + VR.z) / 3 * 1.5 }, uTime: { value: 0 }, uOpacity: { value: 0 }, uGain: { value: gain }, uK: { value: K }, uLanes: { value: lanes }, uFil: { value: fil }, uCore: { value: core }, uPad: { value: pad }, ...extra },
      vertexShader: NEB_V, fragmentShader: frag, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      ...(over ? { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor } : { blending: THREE.AdditiveBlending, premultipliedAlpha: true })
    });
    const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.visible = false; far.add(mesh);
    return { mesh, mat, K, set(t, o) { mat.uniforms.uTime.value = t; mat.uniforms.uOpacity.value = o; mesh.visible = o > .004; } };
  }
  // The violet glow behind the brain.
  const violet = nebula({ R: [108, 64, 44], A: '#25125c', B: '#6a34d8', C: '#c68cff', seed: [.9, .5, .25], gain: .5, slices: 9 });
  violet.mesh.position.set(0, 4, -160);
  // A distant supernova remnant on the right edge of the sky (see SNR_F), with its pulsar at the centre.
  const remnant = nebula({ R: [31, 22, 25], seed: [.15, .62, .4], gain: .95, slices: 16, pad: 1.6, frag: SNR_F, extra: { uRot: { value: 0 },
    uRed: { value: col('#ff3b2f') }, uOrange: { value: col('#ff8f3a') }, uGold: { value: col('#ffd66e') }, uGreen: { value: col('#6fe0a6') }, uBlue: { value: col('#6f9cff') } } });
  // The Pillars of Creation, farther still, on the left (see PIL_F).
  const pillars = nebula({ R: [34, 40, 24], seed: [.4, .2, .7], gain: 1, slices: 16, pad: 1.55, frag: PIL_F, over: true, extra: { uRot: { value: 0 }, uAbs: { value: 0 } } });
  pillars.mat.uniforms.uAbs.value = 1 - Math.pow(.54, 16 / pillars.K);   // the same total darkness whatever the number of slices
  const pStars = [];
  for (let k = 0; k < 5; k++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: col(k % 2 ? '#ffd9f0' : '#ffffff'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); s.position.set((r() - .5) * 60, 10 + r() * 30, 26); s.scale.setScalar(2 + r() * 2.4); pillars.mesh.add(s); pStars.push(s); }
  // The Andromeda Galaxy: the farthest thing here (see AND_F), with its two companion galaxies, M32 and M110.
  const AR = 44, PA = .62, UVV = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }';
  const andHolder = new THREE.Group();   // faces us; the disc inside it is tilted, the bulge is not
  const bulMat = new THREE.ShaderMaterial({ uniforms: { uOpacity: { value: 0 } }, vertexShader: UVV, fragmentShader: BUL_F, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, premultipliedAlpha: true });
  const bulge = new THREE.Mesh(new THREE.PlaneGeometry(AR * .9, AR * .9), bulMat); bulge.rotation.z = PA; bulge.renderOrder = 2; bulge.frustumCulled = false; andHolder.add(bulge);
  const andMat = new THREE.ShaderMaterial({ uniforms: { tVol: { value: vol }, uOpacity: { value: 0 } }, vertexShader: UVV, fragmentShader: AND_F, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor });   // drawn after the bulge, so its dust can dim it
  const andDisc = new THREE.Mesh(new THREE.PlaneGeometry(AR * 2, AR * 2), andMat); andDisc.quaternion.setFromEuler(new THREE.Euler(1.34, 0, PA, 'ZXY')); andDisc.renderOrder = 3; andDisc.frustumCulled = false; andHolder.add(andDisc);
  // Its companions: M32, small and bright just off the near side of the disc, and M110, larger and faint on the far side.
  const maj = new THREE.Vector2(Math.cos(PA), Math.sin(PA)), mnr = new THREE.Vector2(-Math.sin(PA), Math.cos(PA));
  const sat = (a, b, s, o) => { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: col('#ffe8cc'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); m.position.set((maj.x * a + mnr.x * b) * AR, (maj.y * a + mnr.y * b) * AR, 2); m.scale.setScalar(s * AR); m.userData.o = o; andHolder.add(m); return m; };
  const andSats = [sat(.06, -.2, .09, .7), sat(-.28, .42, .2, .26)];
  const andromeda = { mesh: andHolder, mat: { uniforms: { uR: { value: new THREE.Vector3(AR, AR, 1) } } }, set(t, o) { andMat.uniforms.uOpacity.value = o; bulMat.uniforms.uOpacity.value = o; andHolder.visible = o > .004; andSats.forEach(m => { m.material.opacity = m.userData.o * o; }); } };
  // All three are held in their own bands of the frame (see follow), like the solar system.
  const TILT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -.45), NOTILT = new THREE.Quaternion(), tmpV = new THREE.Vector3();
  const pinned = [{ k: 'crab', neb: remnant, dist: 600, tilt: TILT, anchor: new THREE.Vector3(), rpx: 0 }, { k: 'pillars', neb: pillars, dist: 760, tilt: NOTILT, anchor: new THREE.Vector3(), rpx: 0 },
    { k: 'andromeda', neb: andromeda, dist: 2200, tilt: NOTILT, anchor: new THREE.Vector3(), rpx: 0 }];
  pinned.forEach(o => { group.add(o.neb.mesh); solar.addTarget(o.k, o.neb.mesh, () => o.rpx); });
  const pulsar = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: col('#cfe0ff'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  pulsar.scale.setScalar(2.2); remnant.mesh.add(pulsar);

  /* ---------- Shooting stars: rare and unhurried, each at its own depth and moving through 3D (some toward us, some away),
     a bright head with a glowing trail that tapers and fades behind it ---------- */
  const TRAIL = 48, shooters = [0, 1].map(() => {
    const g = new THREE.BufferGeometry(), aT = new Float32Array(TRAIL);
    for (let i = 0; i < TRAIL; i++) aT[i] = i / (TRAIL - 1);
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL * 3), 3)); g.setAttribute('aT', new THREE.BufferAttribute(aT, 1));
    const mat = additive({ uniforms: { uPx: { value: 1000 }, uA: { value: 0 } },
      vertexShader: `attribute float aT; uniform float uPx, uA; varying vec3 vColor; varying float vAlpha;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv;
          gl_PointSize = max(1., uPx * .17 * (1. - aT * .65) / -mv.z);
          vColor = mix(vec3(1., .97, .92), vec3(.7, .86, 1.), aT); vAlpha = uA * pow(1. - aT, 1.35); }`,
      fragmentShader: POINT_FRAG });
    const pts = new THREE.Points(g, mat); pts.visible = false; pts.frustumCulled = false; far.add(pts);
    const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: col('#f4f8ff'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); head.visible = false; far.add(head);
    const sh = { pts, mat, head, t0: 0, life: 0, a: new THREE.Vector3(), v: new THREE.Vector3(), next: 5 + r() * 9 };
    pts.userData.shooter = sh;   // lets a test launch one on demand
    return sh;
  });
  const mHead = new THREE.Vector3();

  /* Arrange the landmarks for the screen's shape. */
  function layout(aspect) {
    const tall = aspect < 1, kx = tall ? Math.max(.24, aspect * .55) : 1;
    solar.layout(aspect);
    // Bands of the frame no caption uses: the Crab on the right edge, the Pillars on the left (top corners on a phone).
    const tv = Math.tan(THREE.MathUtils.degToRad(21)), th = tv * aspect;
    const spots = { crab: tall ? [.84, .115, .42] : [.87, .41, 1], pillars: tall ? [.15, .13, .4] : [.115, .49, .78], andromeda: tall ? [.76, .4, .7] : [.62, .09, 1] };
    pinned.forEach(o => { const [sx, sy, sc] = spots[o.k]; o.anchor.set((2 * sx - 1) * th * o.dist, (1 - 2 * sy) * tv * o.dist, -o.dist); o.neb.mesh.scale.setScalar(sc);
      const R = o.neb.mat.uniforms.uR.value; o.rpx = Math.min(R.x, R.y) * sc * .8 / o.dist / tv * 450; });
    galaxies.forEach(s => { const u = s.userData; s.position.set(u.dx * kx, u.dy, -1).normalize().multiplyScalar(u.dist); });
  }
  layout(innerWidth / innerHeight);

  return {
    group, layout,
    tap: (x, y, camera, t) => solar.tap(x, y, camera, t),
    follow(camera, near) { solar.follow(camera, near); pinned.forEach(o => { o.neb.mesh.position.copy(camera.localToWorld(tmpV.copy(o.anchor))); o.neb.mesh.quaternion.copy(camera.quaternion).multiply(o.tilt); }); },
    get hovering() { return solar.hovering; },
    update(t, px, { opacity = 1, purple = 0, fly = 0, camera = null, active = false, sky = .62, turnX = 0, turnY = 0 } = {}) {
      dome.material.uniforms.uI.value = sky;
      group.rotation.set(-turnY * .032, turnX * .05, 0);   // looking toward the mouse: the sky turns as if we turned our head
      starMat.uniforms.uTime.value = t; starMat.uniforms.uPx.value = px; starMat.uniforms.uOpacity.value = opacity;
      galaxies.forEach(s => { s.material.opacity = s.userData.o * opacity; });
      solar.update(t, opacity, { camera, active });
      violet.set(t, opacity * purple);
      // The gas moves on its own (see the shaders), never with the mouse; the nebula being looked at brightens a little.
      const eo = opacity * (1 - purple * .35), hk = solar.hotKey;
      pinned.forEach(o => { o.boost = (o.boost || 0) + ((hk === o.k ? 1 : 0) - (o.boost || 0)) * .08; o.neb.set(t, eo * (1 + o.boost * .35)); });
      remnant.mat.uniforms.uRot.value = t * .004;
      pulsar.material.opacity = eo * (.8 + .2 * Math.sin(t * 3.1)); pStars.forEach((s, i) => { s.material.opacity = eo * (.8 + .2 * Math.sin(t * .7 + i)); });
      far.position.set(0, 0, fly);   // scrolling carries us forward through the stars
      shooters.forEach(s => {
        if (!s.pts.visible && t > s.next) {
          // Start somewhere in the upper part of the view, 70–240 units away; cross at 2–4° a second, drifting in depth too.
          const D = 70 + r() * 170, tv = .384, th = tv * innerWidth / innerHeight, w = .035 + r() * .035, side = r() < .5 ? 1 : -1;
          s.a.set((r() * 1.6 - .8) * th * D, (.15 + r() * .7) * tv * D, -D);
          s.v.set(side * (.75 + r() * .25), -(.35 + r() * .45), (r() - .5) * .8).normalize().multiplyScalar(w * D);
          s.t0 = t; s.life = 2.6 + r() * 1.6; s.pts.visible = s.head.visible = true;
        }
        if (s.pts.visible) {
          const k = (t - s.t0) / s.life;
          if (k >= 1) { s.pts.visible = s.head.visible = false; s.next = t + 9 + r() * 12; return; }
          mHead.copy(s.a).addScaledVector(s.v, t - s.t0);
          const arr = s.pts.geometry.attributes.position.array, tl = 1.1 * Math.min(1, (t - s.t0) / 1.1);   // the trail grows in, then keeps its length
          for (let i = 0; i < TRAIL; i++) { const f = i / (TRAIL - 1) * tl; arr[i * 3] = mHead.x - s.v.x * f; arr[i * 3 + 1] = mHead.y - s.v.y * f; arr[i * 3 + 2] = mHead.z - s.v.z * f; }
          s.pts.geometry.attributes.position.needsUpdate = true;
          const fa = Math.pow(Math.sin(Math.PI * k), .7) * .85 * opacity;
          s.mat.uniforms.uA.value = fa; s.mat.uniforms.uPx.value = px;
          s.head.position.copy(mHead); s.head.scale.setScalar(-mHead.z * .008); s.head.material.opacity = fa;
        }
      });
    }
  };
}
