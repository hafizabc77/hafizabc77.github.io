/* Shared helpers: numbers, noise, easing, colours, textures and the glowing-point shader. */
import * as THREE from 'three';

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const remap = (v, a, b) => clamp((v - a) / (b - a));
export const smooth = t => { t = clamp(t); return t * t * (3 - 2 * t); };
export const sstep = (a, b, v) => smooth(remap(v, a, b));
export const easeInOut = t => { t = clamp(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
export const easeOut = t => 1 - Math.pow(1 - clamp(t), 3);
export const easeIn = t => Math.pow(clamp(t), 3);
/* A bump that rises over [a,b] and falls over [c,d]: used to show something for part of a scene. */
export const window4 = (v, a, b, c, d) => Math.min(sstep(a, b, v), 1 - sstep(c, d, v));

/* Seeded random numbers, so the world looks the same on every visit. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const gaussian = r => { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2831853 * r()); };
export function unitVector(r, out = new THREE.Vector3()) {
  const z = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - z * z);
  return out.set(Math.cos(a) * s, Math.sin(a) * s, z);
}

/* 3D simplex noise (after Stefan Gustavson), seeded. Returns roughly −1…1. */
export function noise3(seed = 7) {
  const g = [1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1];
  const p = new Uint8Array(256); for (let i = 0; i < 256; i++) p[i] = i;
  const r = rng(seed); for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  const perm = new Uint8Array(512), pm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; pm[i] = perm[i] % 12; }
  const F = 1 / 3, G = 1 / 6;
  const corner = (gi, x, y, z) => { let t = .6 - x * x - y * y - z * z; if (t < 0) return 0; t *= t; gi *= 3; return t * t * (g[gi] * x + g[gi + 1] * y + g[gi + 2] * z); };
  return (x, y, z) => {
    const s = (x + y + z) * F, i = Math.floor(x + s), j = Math.floor(y + s), k = Math.floor(z + s), t = (i + j + k) * G;
    const x0 = x - (i - t), y0 = y - (j - t), z0 = z - (k - t);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) { if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; } else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; } else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; } }
    else if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; } else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; } else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    const ii = i & 255, jj = j & 255, kk = k & 255;
    return 32 * (corner(pm[ii + perm[jj + perm[kk]]], x0, y0, z0)
      + corner(pm[ii + i1 + perm[jj + j1 + perm[kk + k1]]], x0 - i1 + G, y0 - j1 + G, z0 - k1 + G)
      + corner(pm[ii + i2 + perm[jj + j2 + perm[kk + k2]]], x0 - i2 + 2 * G, y0 - j2 + 2 * G, z0 - k2 + 2 * G)
      + corner(pm[ii + 1 + perm[jj + 1 + perm[kk + 1]]], x0 - 1 + 3 * G, y0 - 1 + 3 * G, z0 - 1 + 3 * G));
  };
}

/* Colours are written in sRGB and stored linear, as Three.js expects. */
export const col = hex => new THREE.Color(hex);
export const PAL = {
  gold: col('#e3bd6a'), goldHi: col('#ffe6a8'), cream: col('#f4efe0'), violet: col('#8a63ff'), magenta: col('#d24dff'),
  mint: col('#62f5b0'), cyan: col('#53d8ff'), blue: col('#2f7dff'), deep: col('#0d2a6b'), rose: col('#ff6f91'), amber: col('#ffa23a'), red: col('#ff4d4d'), white: col('#ffffff')
};

/* A soft round glow, used for sprites. */
let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.18, 'rgba(255,255,255,.55)'); g.addColorStop(.45, 'rgba(255,255,255,.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c); glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}
export function glowSprite(color, scale = 1, opacity = 1) {
  const m = new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  const s = new THREE.Sprite(m); s.scale.setScalar(scale); return s;
}

/* Text drawn on a canvas and used as a texture: returns the texture and its aspect ratio. */
export const FONTS = {
  sans: '"DM Sans","Noto Sans Ethiopic","Nyala","Ebrima","Kefa","PingFang SC","Microsoft YaHei","Noto Sans SC",system-ui,sans-serif',
  mono: '"DM Mono","Noto Sans Ethiopic","Nyala","Ebrima","PingFang SC","Microsoft YaHei",ui-monospace,monospace',
  serif: '"Instrument Serif","Noto Serif Ethiopic","Nyala","Songti SC","Noto Serif SC",Georgia,serif'
};
export function textTexture(lines, o = {}) {
  const { size = 64, font = FONTS.sans, weight = 500, color = '#fff', pad = .45, bg = null, border = null, radius = .35, sub = null, subColor = 'rgba(255,255,255,.6)', subSize = .42, align = 'center', minWidth = 0 } = o;
  const c = document.createElement('canvas'), x = c.getContext('2d');
  lines = Array.isArray(lines) ? lines : [lines];
  x.font = `${weight} ${size}px ${font}`;
  let w = Math.max(minWidth, ...lines.map(l => x.measureText(l).width));
  if (sub) { x.font = `400 ${size * subSize}px ${FONTS.mono}`; w = Math.max(w, x.measureText(sub).width); }
  const lh = size * 1.18, h = lines.length * lh + (sub ? size * subSize * 1.5 : 0);
  const P = size * pad;
  c.width = Math.ceil(w + P * 2); c.height = Math.ceil(h + P * 2);
  if (bg || border) {
    const r = Math.min(c.height / 2, size * radius * 2);
    x.beginPath(); x.roundRect(2, 2, c.width - 4, c.height - 4, r);
    if (bg) { x.fillStyle = bg; x.fill(); }
    if (border) { x.lineWidth = 3; x.strokeStyle = border; x.stroke(); }
  }
  x.textBaseline = 'middle'; x.textAlign = align; x.fillStyle = color;
  x.font = `${weight} ${size}px ${font}`;
  const ax = align === 'center' ? c.width / 2 : P;
  lines.forEach((l, i) => x.fillText(l, ax, P + lh * (i + .5)));
  if (sub) { x.font = `400 ${size * subSize}px ${FONTS.mono}`; x.fillStyle = subColor; x.fillText(sub, ax, P + lines.length * lh + size * subSize * .8); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return { texture: t, aspect: c.width / c.height, canvas: c };
}

/* Load an image as a promise (resolves to null on failure, so nothing ever blocks the film). */
export const loadImage = src => new Promise(res => { const i = new Image(); i.decoding = 'async'; i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });

/* The glowing-point shader used by every particle system. Colours are premultiplied for additive light. */
export const POINT_FRAG = `
  varying vec3 vColor; varying float vAlpha;
  void main() {
    vec2 q = gl_PointCoord * 2. - 1.; float d = dot(q, q);
    if (d > 1.) discard;
    float a = vAlpha * (exp(-d * 4.5) + .55 * smoothstep(.22, 0., d));
    gl_FragColor = vec4(vColor * a, a);
  }`;
export function additive(o) {
  return new THREE.ShaderMaterial(Object.assign({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, premultipliedAlpha: true }, o));
}
/* Pixel scale for point sizes: makes a size of 1 equal to one world unit seen at distance 1. */
export const pixelScale = (renderer, camera) => renderer.getDrawingBufferSize(new THREE.Vector2()).y * .5 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);

/* Points sampled densely along a polyline, with how far along it each point is. */
export function alongPolyline(pts, count, out, jitter = 0, r = Math.random) {
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const total = L[L.length - 1] || 1;
  for (let n = 0; n < count; n++) {
    const want = (n + r() * .999) / count * total;
    let i = 1; while (i < L.length - 1 && L[i] < want) i++;
    const f = (want - L[i - 1]) / Math.max(1e-6, L[i] - L[i - 1]);
    const p = new THREE.Vector3().lerpVectors(pts[i - 1], pts[i], f);
    if (jitter) p.add(new THREE.Vector3((r() - .5) * jitter, (r() - .5) * jitter, (r() - .5) * jitter));
    out.push({ p, u: want / total });
  }
  return total;
}
