/* Hand-written WebGL stage (no libraries). One context draws, back to front:
   1. a quiet stable-fluids ink trail behind the page, which only runs while the pointer moves,
   2. particles that morph between named shapes,
   3. image planes kept in sync with the page. Images never move on their own.
   Phones skip the fluid and planes and keep a light background and the particles. */
(function () {
  'use strict';

  /* ---------- Particles ---------- */
  const PARTICLE_VS = `
    precision highp float;
    attribute vec4 aFrom;
    attribute vec4 aTo;
    attribute vec4 aSeed;
    uniform float uMix, uTime, uAspect, uSize, uDim, uPulseAge, uDensity, uAudio;
    uniform vec2 uMouse, uPulse, uCenter;
    varying float vAlpha;
    varying float vTone;

    void main() {
      float delay = aSeed.x * 0.4;
      float t = clamp((uMix - delay) / 0.6, 0.0, 1.0);
      t = t * t * (3.0 - 2.0 * t);
      vec4 shape = mix(aFrom, aTo, t);
      vec3 p = shape.xyz;

      // Particles lift off and scatter in the middle of a morph.
      float flight = sin(t * 3.14159);
      p.xy += (aSeed.yz - 0.5) * flight * 0.62;
      p.z += (aSeed.w - 0.5) * flight * 0.8;

      // The galaxy shape keeps turning, faster towards its core.
      if (shape.w > 0.001) {
        vec2 q = p.xy - uCenter;
        q.y /= 0.62;
        float r = length(q);
        float a = uTime * 0.09 / (0.35 + r);
        float c = cos(a), s = sin(a);
        q = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
        q.y *= 0.62;
        p.xy = mix(p.xy, uCenter + q, shape.w);
      }

      // Slow breathing, so a held shape still feels alive.
      float w = 1.0 + aSeed.w * 2.0;
      p.x += sin(uTime * 0.6 + aSeed.y * 6.283 + p.y * 2.0) * 0.0045 * w;
      p.y += cos(uTime * 0.5 + aSeed.z * 6.283 + p.x * 2.0) * 0.0045 * w;

      float persp = 1.0 / (1.0 - p.z * 0.35);
      vec2 pos = p.xy * persp;
      pos *= 1.0 + uAudio * 0.05 * (aSeed.x - 0.25);

      // Gentle push away from the pointer.
      vec2 d = pos - uMouse;
      float dist = length(d) + 0.0001;
      float force = smoothstep(0.24, 0.0, dist);
      pos += (d / dist) * force * force * 0.05;

      // A click sends out one expanding ring.
      if (uPulseAge < 2.5) {
        vec2 pd = pos - uPulse;
        float pr = length(pd) + 0.0001;
        float band = pr - uPulseAge * 1.15;
        pos += (pd / pr) * exp(-band * band * 70.0) * exp(-uPulseAge * 1.8) * 0.2;
      }

      gl_Position = vec4(pos.x / uAspect, pos.y, 0.0, 1.0);
      gl_PointSize = uSize * (0.55 + aSeed.w * 0.95) * persp * (1.0 + uAudio * 0.5);
      vAlpha = uDim * (0.32 + 0.68 * aSeed.y) * uDensity * (1.0 - flight * 0.25) * (1.0 + uAudio * 0.8);
      vTone = aSeed.z;
    }`;

  const PARTICLE_FS = `
    precision mediump float;
    varying float vAlpha;
    varying float vTone;
    const vec3 MINT = vec3(0.518, 0.780, 0.635);
    const vec3 GOLD = vec3(0.847, 0.733, 0.451);
    void main() {
      float d = length(gl_PointCoord - 0.5);
      float a = smoothstep(0.5, 0.05, d);
      vec3 c = vTone > 0.62 ? MINT : GOLD;
      gl_FragColor = vec4(c * a * vAlpha, 1.0);
    }`;

  /* ---------- Full-screen passes (WebGL2) ---------- */
  const QUAD_VS = `#version 300 es
    precision highp float;
    in vec2 aPos;
    out vec2 vUv;
    void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

  const header = `#version 300 es
    precision highp float;
    precision highp sampler2D;
    in vec2 vUv;
    out vec4 o;
    uniform vec2 uTexel;
  `;
  const FLUID = {
    splat: header + `
      uniform sampler2D uTarget; uniform float uAspect, uRadius; uniform vec2 uPoint; uniform vec3 uColor;
      void main() {
        vec2 p = vUv - uPoint; p.x *= uAspect;
        vec3 s = exp(-dot(p, p) / uRadius) * uColor;
        o = vec4(texture(uTarget, vUv).xyz + s, 1.0);
      }`,
    advect: header + `
      uniform sampler2D uVelocity, uSource; uniform float uDt, uDissipation;
      void main() {
        vec2 coord = vUv - uDt * texture(uVelocity, vUv).xy * uTexel;
        o = texture(uSource, coord) / (1.0 + uDissipation * uDt);
      }`,
    divergence: header + `
      uniform sampler2D uVelocity;
      void main() {
        float L = texture(uVelocity, vUv - vec2(uTexel.x, 0.0)).x;
        float R = texture(uVelocity, vUv + vec2(uTexel.x, 0.0)).x;
        float T = texture(uVelocity, vUv + vec2(0.0, uTexel.y)).y;
        float B = texture(uVelocity, vUv - vec2(0.0, uTexel.y)).y;
        o = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
      }`,
    curl: header + `
      uniform sampler2D uVelocity;
      void main() {
        float L = texture(uVelocity, vUv - vec2(uTexel.x, 0.0)).y;
        float R = texture(uVelocity, vUv + vec2(uTexel.x, 0.0)).y;
        float T = texture(uVelocity, vUv + vec2(0.0, uTexel.y)).x;
        float B = texture(uVelocity, vUv - vec2(0.0, uTexel.y)).x;
        o = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
      }`,
    vorticity: header + `
      uniform sampler2D uVelocity, uCurl; uniform float uCurlAmount, uDt;
      void main() {
        float L = texture(uCurl, vUv - vec2(uTexel.x, 0.0)).x;
        float R = texture(uCurl, vUv + vec2(uTexel.x, 0.0)).x;
        float T = texture(uCurl, vUv + vec2(0.0, uTexel.y)).x;
        float B = texture(uCurl, vUv - vec2(0.0, uTexel.y)).x;
        float C = texture(uCurl, vUv).x;
        vec2 f = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
        f /= length(f) + 0.0001;
        f *= uCurlAmount * C;
        f.y *= -1.0;
        o = vec4(texture(uVelocity, vUv).xy + f * uDt, 0.0, 1.0);
      }`,
    pressure: header + `
      uniform sampler2D uPressure, uDivergence;
      void main() {
        float L = texture(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
        float R = texture(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
        float T = texture(uPressure, vUv + vec2(0.0, uTexel.y)).x;
        float B = texture(uPressure, vUv - vec2(0.0, uTexel.y)).x;
        o = vec4((L + R + B + T - texture(uDivergence, vUv).x) * 0.25, 0.0, 0.0, 1.0);
      }`,
    gradient: header + `
      uniform sampler2D uPressure, uVelocity;
      void main() {
        float L = texture(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
        float R = texture(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
        float T = texture(uPressure, vUv + vec2(0.0, uTexel.y)).x;
        float B = texture(uPressure, vUv - vec2(0.0, uTexel.y)).x;
        o = vec4(texture(uVelocity, vUv).xy - vec2(R - L, T - B), 0.0, 1.0);
      }`,
    clear: header + `
      uniform sampler2D uSource; uniform float uValue;
      void main() { o = uValue * texture(uSource, vUv); }`
  };

  const BACKDROP_FS = header + `
    uniform sampler2D uDye; uniform float uInk, uTime, uHasDye; uniform vec2 uRes;
    void main() {
      vec3 bg = vec3(0.027, 0.114, 0.098);
      vec2 p = vUv - 0.5; p.x *= uRes.x / uRes.y;
      vec2 g = p - vec2(0.45, 0.25);
      vec3 c = bg + vec3(0.016, 0.05, 0.036) * exp(-dot(g, g) * 2.2);
      if (uHasDye > 0.5) {
        // A soft silk trail: capped low, so it can never compete with text on top of it.
        vec3 d = texture(uDye, vUv).rgb;
        c += (1.0 - exp(-d * 1.2)) * uInk * 0.16;
      } else {
        float a = sin(vUv.x * 3.0 + uTime * 0.12) + sin(vUv.y * 4.0 - uTime * 0.09 + vUv.x * 2.0);
        c += vec3(0.008, 0.03, 0.022) * (a * 0.5 + 0.5);
      }
      o = vec4(c, 1.0);
    }`;

  /* ---------- Image planes (WebGL2) ---------- */
  const PLANE_VS = `#version 300 es
    precision highp float;
    in vec2 aPos;
    uniform vec4 uRect;
    uniform vec2 uRes;
    out vec2 vUv;
    void main() {
      vec2 uv = aPos * 0.5 + 0.5;
      vUv = vec2(uv.x, 1.0 - uv.y);
      vec2 clip = (uRect.xy + vUv * uRect.zw) / uRes * 2.0 - 1.0;
      gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
    }`;

  const PLANE_FS = `#version 300 es
    precision highp float;
    precision highp sampler2D;
    in vec2 vUv;
    out vec4 o;
    uniform sampler2D uTex, uDepth, uNoise;
    uniform vec2 uImg, uFocus, uParallax;
    uniform vec4 uRect;
    uniform float uReveal, uDissolve, uHasDepth, uShape, uRadius;

    // One texture read instead of eight procedural noise calls per pixel: much lighter on laptop GPUs.
    float fbm(vec2 p) { return texture(uNoise, p * 0.125).r; }
    vec2 cover(vec2 uv) {
      float ra = uRect.z / uRect.w, ia = uImg.x / uImg.y;
      vec2 s = ra > ia ? vec2(1.0, ia / ra) : vec2(ra / ia, 1.0);
      return uv * s + uFocus * (1.0 - s);
    }
    void main() {
      vec2 t = cover(vUv);
      if (uHasDepth > 0.5) { t += (texture(uDepth, t).r - 0.35) * uParallax; }
      vec3 c = texture(uTex, t).rgb;

      float a = 1.0;
      vec2 px = vUv * uRect.zw;
      if (uShape < 0.5) {
        vec2 q = abs(px - uRect.zw * 0.5) - uRect.zw * 0.5 + uRadius;
        float dist = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uRadius;
        a = 1.0 - smoothstep(-1.0, 1.0, dist);
      } else {
        // Hero photo: the left and bottom edges dissolve into the page.
        float n = fbm(vUv * vec2(3.0, 5.0));
        a *= smoothstep(0.0, 0.42, vUv.x + (n - 0.5) * 0.14);
        a *= 1.0 - smoothstep(0.7, 1.0, vUv.y + (n - 0.5) * 0.1);
        a *= smoothstep(0.0, 0.05, vUv.y);
        c *= vec3(0.93, 0.975, 0.96) * mix(0.42, 1.0, smoothstep(0.0, 0.2, vUv.y)); // Keeps the header readable.
      }

      // Reveal and dissolve only cost anything while they are actually happening.
      vec3 edge = vec3(0.0);
      if (uReveal < 1.0 || uDissolve > 0.001) {
        float aspect = uRect.z / uRect.w;
        float nd = fbm(vUv * vec2(aspect, 1.0) * 5.0 + 3.0);
        float rv = smoothstep(nd - 0.06, nd + 0.06, uReveal * 1.3 - 0.15);
        float ds = 1.0 - smoothstep(nd - 0.09, nd + 0.09, uDissolve * 1.35 - 0.15);
        float glow = max(smoothstep(nd - 0.2, nd, uReveal * 1.3 - 0.15) * (1.0 - rv),
                         smoothstep(nd - 0.2, nd, uDissolve * 1.35 - 0.15) * ds * (uDissolve > 0.001 ? 1.0 : 0.0));
        float shapeMask = a;
        a *= rv * ds;
        edge = vec3(0.85, 0.72, 0.45) * glow * 0.5 * shapeMask * shapeMask;
      }
      o = vec4(c * a + edge, a);
    }`;

  /* ---------- Shapes: N points of (x, y, z, spin); x runs -aspect..aspect, y -1..1 ---------- */
  const rand = Math.random;
  const gauss = () => (rand() + rand() + rand() + rand() - 2) / 2;

  function vortex(N, cx, cy, R) {
    const out = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) {
      const r = R * Math.pow(rand(), 0.62);
      const a = r * 5.2 / R + (i % 3) * 2.0944 + gauss() * 0.55;
      out[i * 4] = cx + Math.cos(a) * r + gauss() * 0.04;
      out[i * 4 + 1] = cy + Math.sin(a) * r * 0.62 + gauss() * 0.04;
      out[i * 4 + 2] = gauss() * 0.3;
      out[i * 4 + 3] = 1;
    }
    return out;
  }

  function textShape(N, text, font, cx, cy, boxW) {
    const c = document.createElement('canvas');
    c.width = 1500; c.height = 620;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    let size = 430;
    ctx.font = font.replace('$', size);
    const width = ctx.measureText(text).width;
    if (width > 1400) { size = Math.floor(size * 1400 / width); ctx.font = font.replace('$', size); }
    ctx.fillText(text, 750, 310);
    const px = ctx.getImageData(0, 0, 1500, 620).data;
    const hits = [];
    let minX = 1500, maxX = 0, minY = 620, maxY = 0;
    for (let y = 0; y < 620; y += 2) {
      for (let x = 0; x < 1500; x += 2) {
        if (px[(y * 1500 + x) * 4 + 3] > 120) {
          hits.push(x, y);
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (!hits.length) return vortex(N, cx, cy, 0.6);
    const out = new Float32Array(N * 4);
    const scale = boxW / Math.max(1, maxX - minX);
    const midX = (minX + maxX) / 2, midY = (minY + maxY) / 2, count = hits.length / 2;
    for (let i = 0; i < N; i++) {
      const k = Math.floor(rand() * count) * 2;
      out[i * 4] = cx + (hits[k] + rand() * 2 - midX) * scale;
      out[i * 4 + 1] = cy - (hits[k + 1] + rand() * 2 - midY) * scale;
      out[i * 4 + 2] = gauss() * 0.03;
    }
    return out;
  }

  /* Glyph pixels for a short label, sampled once. */
  function textSampler(text, font) {
    const c = document.createElement('canvas');
    c.width = 900; c.height = 300;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    ctx.font = font.replace('$', 210);
    ctx.fillText(text, 450, 150);
    const px = ctx.getImageData(0, 0, 900, 300).data, hits = [];
    let minX = 900, maxX = 0, minY = 300, maxY = 0;
    for (let y = 0; y < 300; y += 2) {
      for (let x = 0; x < 900; x += 2) {
        if (px[(y * 900 + x) * 4 + 3] > 120) {
          hits.push(x, y);
          if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    return { hits, minX, maxX, minY, maxY };
  }

  /* Three recognisable chips: a package with pins and a die, each with its own inside,
     labelled GPU, FPGA and NPU in particles. Units run -1..1 inside each package. */
  function chipParts(kind) {
    const parts = []; // [x1, y1, x2, y2, fill]
    const line = (a, b, c, d) => parts.push([a, b, c, d, 0]);
    const box = (a, b, c, d) => { line(a, b, c, b); line(c, b, c, d); line(c, d, a, d); line(a, d, a, b); };
    box(-0.78, -0.78, 0.78, 0.78); // Package.
    [-0.55, -0.33, -0.11, 0.11, 0.33, 0.55].forEach(p => { // Pins on every side.
      line(p, 0.78, p, 1); line(p, -0.78, p, -1); line(0.78, p, 1, p); line(-0.78, p, -1, p);
    });
    box(-0.52, -0.52, 0.52, 0.52); // Die.
    if (kind === 0) { // GPU: a block of compute units.
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { const x = -0.44 + c * 0.23, y = -0.44 + r * 0.23; parts.push([x, y, x + 0.17, y + 0.17, 1]); }
    } else if (kind === 1) { // FPGA: a routing lattice of logic tiles.
      [-0.32, -0.11, 0.11, 0.32].forEach(p => { line(-0.52, p, 0.52, p); line(p, -0.52, p, 0.52); });
      for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) { const x = -0.44 + c * 0.215, y = -0.44 + r * 0.215; parts.push([x, y, x + 0.05, y + 0.05, 1]); }
    } else { // NPU: a cube unit.
      const f = [-0.34, -0.2, 0.16, 0.3], o = 0.16;
      box(f[0], f[1], f[2], f[3]); box(f[0] + o, f[1] - o, f[2] + o, f[3] - o);
      line(f[0], f[1], f[0] + o, f[1] - o); line(f[2], f[1], f[2] + o, f[1] - o); line(f[0], f[3], f[0] + o, f[3] - o); line(f[2], f[3], f[2] + o, f[3] - o);
    }
    let total = 0;
    const weighted = parts.map(p => { const w = p[4] ? (p[2] - p[0]) * (p[3] - p[1]) * 9 : Math.hypot(p[2] - p[0], p[3] - p[1]); total += w; return [p, total]; });
    return { weighted, total };
  }
  function chips(N, aspect, narrow) {
    const out = new Float32Array(N * 4);
    const size = narrow ? Math.min(0.15, aspect * 0.28) : Math.min(0.26, aspect * 0.125);
    const middle = narrow ? 0 : aspect * 0.24;
    const gap = size * 3.1;
    const centres = narrow
      ? [[-aspect * 0.3, 0.64], [-aspect * 0.3, 0.27], [-aspect * 0.3, -0.1]]
      : [[middle - gap, 0.18], [middle, 0.18], [middle + gap, 0.18]];
    const sans = '700 $px "DM Sans", system-ui, sans-serif';
    const labels = ['GPU', 'FPGA', 'NPU'].map(l => textSampler(l, sans));
    const shapes = [0, 1, 2].map(chipParts);
    for (let i = 0; i < N; i++) {
      const kind = i % 3, [cx, cy] = centres[kind];
      let x, y;
      if (rand() < 0.24) {
        const T = labels[kind], k = Math.floor(rand() * (T.hits.length / 2)) * 2;
        const w = narrow ? size * 2.1 : size * 1.45, scale = w / Math.max(1, T.maxX - T.minX);
        const lx = narrow ? cx + size * 2.85 : cx, ly = narrow ? cy : cy - size * 1.6;
        x = lx + (T.hits[k] + rand() * 2 - (T.minX + T.maxX) / 2) * scale;
        y = ly - (T.hits[k + 1] + rand() * 2 - (T.minY + T.maxY) / 2) * scale;
      } else {
        const S = shapes[kind], u = rand() * S.total;
        const p = (S.weighted.find(entry => entry[1] >= u) || S.weighted[S.weighted.length - 1])[0];
        let ux, uy;
        if (p[4]) { ux = p[0] + rand() * (p[2] - p[0]); uy = p[1] + rand() * (p[3] - p[1]); }
        else { const t = rand(); ux = p[0] + (p[2] - p[0]) * t; uy = p[1] + (p[3] - p[1]) * t; }
        x = cx + ux * size + gauss() * 0.002;
        y = cy - uy * size + gauss() * 0.002;
      }
      out[i * 4] = x; out[i * 4 + 1] = y; out[i * 4 + 2] = gauss() * 0.02;
    }
    return out;
  }

  function network(N, aspect, narrow) {
    const out = new Float32Array(N * 4);
    const nodes = [];
    const spreadX = narrow ? aspect * 0.92 : aspect * 0.5;
    const offsetX = narrow ? 0 : aspect * 0.45;
    for (let i = 0; i < 34; i++) nodes.push([offsetX + (rand() * 2 - 1) * spreadX, (rand() * 2 - 1) * 0.92]);
    const edges = [];
    nodes.forEach((n, i) => {
      const nearest = nodes.map((m, j) => [Math.hypot(n[0] - m[0], n[1] - m[1]), j]).sort((a, b) => a[0] - b[0]);
      edges.push([i, nearest[1][1]], [i, nearest[2][1]]);
    });
    for (let i = 0; i < N; i++) {
      let x, y;
      if (rand() < 0.38) {
        const n = nodes[Math.floor(rand() * nodes.length)];
        const a = rand() * 6.283, r = Math.sqrt(rand()) * 0.026;
        x = n[0] + Math.cos(a) * r; y = n[1] + Math.sin(a) * r;
      } else {
        const e = edges[Math.floor(rand() * edges.length)], t = rand();
        x = nodes[e[0]][0] * (1 - t) + nodes[e[1]][0] * t;
        y = nodes[e[0]][1] * (1 - t) + nodes[e[1]][1] * t;
      }
      out[i * 4] = x; out[i * 4 + 1] = y; out[i * 4 + 2] = gauss() * 0.05;
    }
    return out;
  }

  function ring(N, cx, cy, R) {
    const out = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) {
      const a = rand() * 6.283, r = R * (1 + gauss() * 0.11);
      out[i * 4] = cx + Math.cos(a) * r;
      out[i * 4 + 1] = cy + Math.sin(a) * r;
      out[i * 4 + 2] = gauss() * 0.14;
    }
    return out;
  }

  /* ---------- GL helpers ---------- */
  function shader(gl, type, source) {
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function program(gl, vs, fs, attribs) {
    const p = gl.createProgram();
    gl.attachShader(p, shader(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, shader(gl, gl.FRAGMENT_SHADER, fs));
    (attribs || ['aPos']).forEach((name, i) => gl.bindAttribLocation(p, i, name));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const count = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const name = gl.getActiveUniform(p, i).name;
      u[name] = gl.getUniformLocation(p, name);
    }
    return { p, u };
  }

  window.createScene = function createScene(canvas, options) {
    const opts = options || {};
    const attrs = { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' };
    let gl = opts.webgl2 === false ? null : canvas.getContext('webgl2', attrs);
    const isGL2 = !!gl;
    if (!gl) gl = canvas.getContext('webgl', attrs);
    if (!gl) return null;

    const vao = fn => {
      if (!isGL2) { fn(); return null; }
      const v = gl.createVertexArray();
      gl.bindVertexArray(v);
      fn();
      gl.bindVertexArray(null);
      return v;
    };
    const useVao = v => { if (isGL2) gl.bindVertexArray(v); };

    /* Particles */
    const part = program(gl, PARTICLE_VS, PARTICLE_FS, ['aFrom', 'aTo', 'aSeed']);
    let N = opts.count || 18000;
    const capacity = N;
    const seeds = new Float32Array(capacity * 4);
    for (let i = 0; i < seeds.length; i++) seeds[i] = rand();
    const seedBuffer = gl.createBuffer();
    const partVao = vao(() => {
      gl.bindBuffer(gl.ARRAY_BUFFER, seedBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(0);
      gl.enableVertexAttribArray(1);
    });
    const buffers = {};
    let bound = [null, null];
    const store = (name, data) => {
      if (!buffers[name]) buffers[name] = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffers[name]);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    };
    const bindShape = (slot, name) => {
      if (bound[slot] === name) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, buffers[name]);
      gl.vertexAttribPointer(slot, 4, gl.FLOAT, false, 0, 0);
      bound[slot] = name;
    };

    /* Quad for all full-screen passes */
    let quadVao = null, backdrop = null, plane = null;
    if (isGL2) {
      const quad = gl.createBuffer();
      quadVao = vao(() => {
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      });
      backdrop = program(gl, QUAD_VS, BACKDROP_FS);
      if (opts.planes) plane = program(gl, PLANE_VS, PLANE_FS);
    }

    /* A tiling noise texture, baked once, replaces per-pixel procedural noise in the image shader. */
    let noiseTex = null;
    if (plane) {
      const S = 256, data = new Uint8Array(S * S * 4);
      const octaves = [[8, 0.5], [16, 0.25], [32, 0.125], [64, 0.0625]].map(([n, amp]) => ({ n, amp, grid: Float32Array.from({ length: n * n }, () => rand()) }));
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          let v = 0;
          for (const { n, amp, grid } of octaves) {
            const fx = x / S * n, fy = y / S * n, ix = Math.floor(fx), iy = Math.floor(fy);
            let tx = fx - ix, ty = fy - iy;
            tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
            const at = (a, b) => grid[((b + n) % n) * n + ((a + n) % n)];
            const top = at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx;
            const bottom = at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx;
            v += amp * (top * (1 - ty) + bottom * ty);
          }
          const k = (y * S + x) * 4, b = Math.round(v * 255);
          data[k] = data[k + 1] = data[k + 2] = b; data[k + 3] = 255;
        }
      }
      noiseTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, noiseTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, S, S, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    }

    let dpr = Math.min(window.devicePixelRatio || 1, opts.maxDpr || 2);
    let width = 0, height = 0, aspect = 1, narrow = false;
    let anchors = [];
    let pulseAt = -10, pulse = [0, 0];
    const mouse = { x: 9, y: 9, tx: 9, ty: 9, px: -1, py: -1, nx: 0, ny: 0, sx: 0, sy: 0 };
    let frames = 0, slowFrames = 0, tier = 0, dimNow = 0.7, inkNow = 0.9, audio = 0;
    let vortexCentre = [0, 0];
    let colorIndex = 0, fluidUntil = -1;
    const stroke = { x: 0, y: 0, dx: 0, dy: 0, on: false };

    /* ---------- Fluid ---------- */
    let fluid = null;
    function setupFluid() {
      if (!isGL2 || !opts.fluid) return null;
      const ok = gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float');
      if (!ok) return null;
      gl.getExtension('OES_texture_float_linear');
      const programs = {};
      Object.keys(FLUID).forEach(k => { programs[k] = program(gl, QUAD_VS, FLUID[k]); });
      const makeTarget = (w, h, filter) => {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        return { tex, fbo, w, h, texel: [1 / w, 1 / h] };
      };
      const makeDouble = (w, h, filter) => {
        let a = makeTarget(w, h, filter), b = makeTarget(w, h, filter);
        return { get read() { return a; }, get write() { return b; }, swap() { const t = a; a = b; b = t; }, w, h, texel: a.texel };
      };
      const size = base => {
        const ratio = aspect > 1 ? aspect : 1 / aspect;
        const lo = base, hi = Math.round(base * ratio);
        return aspect > 1 ? [hi, lo] : [lo, hi];
      };
      const [sw, sh] = size(opts.simRes || 96);
      const [dw, dh] = size(opts.dyeRes || 320);
      const f = {
        programs,
        velocity: makeDouble(sw, sh, gl.LINEAR),
        pressure: makeDouble(sw, sh, gl.NEAREST),
        dye: makeDouble(dw, dh, gl.LINEAR),
        divergence: makeTarget(sw, sh, gl.NEAREST),
        curl: makeTarget(sw, sh, gl.NEAREST)
      };
      gl.bindFramebuffer(gl.FRAMEBUFFER, f.dye.read.fbo);
      const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return complete ? f : null;
    }
    const bindTex = (unit, tex, loc) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(loc, unit);
    };
    const pass = target => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
      if (target) gl.viewport(0, 0, target.w, target.h);
      else gl.viewport(0, 0, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    function splat(x, y, dx, dy, color, radius) {
      if (!fluid) return;
      const P = fluid.programs.splat;
      gl.useProgram(P.p);
      gl.uniform1f(P.u.uAspect, aspect);
      gl.uniform2f(P.u.uPoint, x, y);
      gl.uniform1f(P.u.uRadius, (radius || 0.0022) * (aspect > 1 ? aspect : 1));
      bindTex(0, fluid.velocity.read.tex, P.u.uTarget);
      gl.uniform3f(P.u.uColor, dx, dy, 0);
      pass(fluid.velocity.write);
      fluid.velocity.swap();
      bindTex(0, fluid.dye.read.tex, P.u.uTarget);
      gl.uniform3f(P.u.uColor, color[0], color[1], color[2]);
      pass(fluid.dye.write);
      fluid.dye.swap();
    }
    function stepFluid(dt) {
      const F = fluid, V = F.velocity, T = V.texel;
      let P = F.programs.curl;
      gl.useProgram(P.p);
      gl.uniform2f(P.u.uTexel, T[0], T[1]);
      bindTex(0, V.read.tex, P.u.uVelocity);
      pass(F.curl);

      P = F.programs.vorticity;
      gl.useProgram(P.p);
      gl.uniform2f(P.u.uTexel, T[0], T[1]);
      bindTex(0, V.read.tex, P.u.uVelocity);
      bindTex(1, F.curl.tex, P.u.uCurl);
      gl.uniform1f(P.u.uCurlAmount, 5);
      gl.uniform1f(P.u.uDt, dt);
      pass(V.write);
      V.swap();

      P = F.programs.divergence;
      gl.useProgram(P.p);
      gl.uniform2f(P.u.uTexel, T[0], T[1]);
      bindTex(0, V.read.tex, P.u.uVelocity);
      pass(F.divergence);

      P = F.programs.clear;
      gl.useProgram(P.p);
      bindTex(0, F.pressure.read.tex, P.u.uSource);
      gl.uniform1f(P.u.uValue, 0.8);
      pass(F.pressure.write);
      F.pressure.swap();

      P = F.programs.pressure;
      gl.useProgram(P.p);
      gl.uniform2f(P.u.uTexel, T[0], T[1]);
      bindTex(1, F.divergence.tex, P.u.uDivergence);
      for (let i = 0; i < 10; i++) {
        bindTex(0, F.pressure.read.tex, P.u.uPressure);
        pass(F.pressure.write);
        F.pressure.swap();
      }

      P = F.programs.gradient;
      gl.useProgram(P.p);
      gl.uniform2f(P.u.uTexel, T[0], T[1]);
      bindTex(0, F.pressure.read.tex, P.u.uPressure);
      bindTex(1, V.read.tex, P.u.uVelocity);
      pass(V.write);
      V.swap();

      P = F.programs.advect;
      gl.useProgram(P.p);
      gl.uniform2f(P.u.uTexel, T[0], T[1]);
      gl.uniform1f(P.u.uDt, dt);
      gl.uniform1f(P.u.uDissipation, 1.6);
      bindTex(0, V.read.tex, P.u.uVelocity);
      bindTex(1, V.read.tex, P.u.uSource);
      pass(V.write);
      V.swap();

      gl.uniform1f(P.u.uDissipation, 1.3);
      bindTex(0, V.read.tex, P.u.uVelocity);
      bindTex(1, F.dye.read.tex, P.u.uSource);
      pass(F.dye.write);
      F.dye.swap();
    }
    const INK = [[0.03, 0.14, 0.1], [0.13, 0.1, 0.03], [0.04, 0.12, 0.09], [0.02, 0.1, 0.08]];

    /* ---------- Planes ---------- */
    const planes = [];
    function loadTexture(src, cb) {
      const im = new Image();
      im.decoding = 'async';
      im.onload = async () => {
        // Decode off the main thread first, so the upload does not cause a visible hitch.
        try { if (im.decode) await im.decode(); } catch (e) { /* Upload still works without it. */ }
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        cb(tex, im.naturalWidth, im.naturalHeight);
      };
      im.src = src;
    }

    function setBounds() {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      gl.viewport(0, 0, canvas.width, canvas.height);
      aspect = width / height;
      narrow = aspect < 1;
    }
    function buildShapes() {
      const sans = '700 $px "DM Sans", system-ui, sans-serif';
      const textBox = narrow ? aspect * 1.72 : Math.min(aspect * 1.08, 1.75);
      const textX = narrow ? 0 : aspect * 0.28;
      const textY = narrow ? 0.34 : 0.06;
      vortexCentre = narrow ? [aspect * 0.2, 0.02] : [aspect * 0.2, 0.02];
      store('vortex', vortex(capacity, vortexCentre[0], vortexCentre[1], narrow ? 0.6 : 0.98));
      store('n303', textShape(capacity, '3.03×', sans, textX, textY, textBox));
      store('n104', textShape(capacity, '10.4×', sans, textX, textY, textBox));
      store('n63', textShape(capacity, '63×', sans, textX, textY, textBox * 0.7));
      store('chips', chips(capacity, aspect, narrow));
      store('n6', textShape(capacity, '6', sans, textX, textY, narrow ? aspect * 0.5 : Math.min(aspect * 0.3, 0.52)));
      store('network', network(capacity, aspect, narrow));
      store('ring', ring(capacity, narrow ? 0 : aspect * 0.42, narrow ? -0.25 : 0, narrow ? aspect * 0.8 : 0.72));
      bound = [null, null];
    }

    setBounds();
    fluid = setupFluid();
    useVao(partVao);
    buildShapes();
    useVao(null);

    const api = {
      get aspect() { return aspect; },
      get hasFluid() { return !!fluid; },
      get hasPlanes() { return !!plane; },
      rebuild() { setBounds(); useVao(partVao); buildShapes(); useVao(null); },
      resize() {
        if (window.innerWidth === width && window.innerHeight <= height) return; // A phone's address bar sliding away.
        setBounds();
        if (fluid) fluid = setupFluid();
        useVao(partVao);
        buildShapes();
        useVao(null);
      },
      setAnchors(list) { anchors = list; },
      setAudio(level) { audio = level; },
      addPlane(img, config) {
        if (!plane) return null;
        const p = {
          img, tex: null, depth: null, w: 1, h: 1, reveal: 0, dissolve: 0, seen: false, loading: false,
          shape: config.shape === 'hero' ? 1 : 0,
          radius: config.radius == null ? 10 : config.radius,
          focus: config.focus || [0.5, 0.5],
          src: config.src,
          depthSrc: config.depth
        };
        planes.push(p);
        return p;
      },
      pointer(px, py) {
        mouse.tx = (px / width * 2 - 1) * aspect;
        mouse.ty = -(py / height * 2 - 1);
        mouse.nx = px / width * 2 - 1;
        mouse.ny = py / height * 2 - 1;
        if (fluid && mouse.px >= 0) {
          // Several pointer events can arrive per frame: gather them into one soft stroke.
          stroke.dx += (px - mouse.px) / width;
          stroke.dy += -(py - mouse.py) / height;
          stroke.x = px / width;
          stroke.y = 1 - py / height;
          stroke.on = true;
        }
        mouse.px = px; mouse.py = py;
      },
      pointerLeave() { mouse.tx = 9; mouse.ty = 9; mouse.px = -1; },
      pulse(px, py, now) {
        pulse = [(px / width * 2 - 1) * aspect, -(py / height * 2 - 1)];
        pulseAt = now;
      },
      stats() { return { count: N, dpr, tier, frames, fluid: !!fluid, fluidRunning: !!fluid && performance.now() / 1000 < fluidUntil, planes: planes.length, gl2: isGL2 }; },

      render(now, scrollY, dtMs) {
        if (!anchors.length) return;

        // Step quality down if this device cannot hold a smooth frame rate. ?hq=1 disables this for testing.
        frames++;
        if (!opts.keepQuality) {
          if (frames > 30 && dtMs > 42) slowFrames++;
          if (frames > 140 && slowFrames > 50 && tier < 2) {
            tier++; slowFrames = 0; frames = 0;
            if (tier === 1 && fluid) { fluid = null; }
            else { N = Math.floor(N * 0.6); if (dpr > 1) { dpr = 1; setBounds(); } }
          }
        }

        // Find where we are between shape anchors.
        let a = anchors[0], b = anchors[0], t = 0;
        if (scrollY >= anchors[anchors.length - 1].y) {
          a = b = anchors[anchors.length - 1];
        } else {
          for (let i = 0; i < anchors.length - 1; i++) {
            if (scrollY >= anchors[i].y && scrollY < anchors[i + 1].y) {
              a = anchors[i]; b = anchors[i + 1];
              t = (scrollY - a.y) / Math.max(1, b.y - a.y);
              break;
            }
          }
        }
        const eased = Math.min(1, Math.max(0, (t - 0.18) / 0.64));
        dimNow += (a.dim + (b.dim - a.dim) * eased - dimNow) * 0.12;
        const inkTarget = (a.ink == null ? 0.8 : a.ink) + ((b.ink == null ? 0.8 : b.ink) - (a.ink == null ? 0.8 : a.ink)) * eased;
        inkNow += (inkTarget - inkNow) * 0.08;

        mouse.x += (mouse.tx - mouse.x) * 0.14;
        mouse.y += (mouse.ty - mouse.y) * 0.14;
        mouse.sx += (mouse.nx - mouse.sx) * 0.06;
        mouse.sy += (mouse.ny - mouse.sy) * 0.06;

        gl.disable(gl.BLEND);
        if (isGL2) {
          useVao(quadVao);
          if (fluid) {
            // No wind: the fluid only ever moves because the pointer did, and it sleeps a few seconds later.
            if (stroke.on) {
              stroke.on = false;
              const moved = Math.abs(stroke.dx) + Math.abs(stroke.dy);
              if (moved > 0.0004) {
                colorIndex = (colorIndex + (rand() < 0.04 ? 1 : 0)) % INK.length;
                const limit = v => Math.max(-0.05, Math.min(0.05, v));
                splat(stroke.x, stroke.y, limit(stroke.dx) * 2200, limit(stroke.dy) * 2200, INK[colorIndex], 0.0026);
                fluidUntil = now + 4.5;
              }
              stroke.dx = 0; stroke.dy = 0;
            }
            if (now < fluidUntil) stepFluid(Math.min(dtMs, 30) / 1000);
          }
          gl.useProgram(backdrop.p);
          gl.uniform2f(backdrop.u.uRes, width, height);
          gl.uniform1f(backdrop.u.uTime, now);
          gl.uniform1f(backdrop.u.uInk, inkNow);
          gl.uniform1f(backdrop.u.uHasDye, fluid ? 1 : 0);
          if (fluid) bindTex(0, fluid.dye.read.tex, backdrop.u.uDye);
          pass(null);
        } else {
          gl.clearColor(7 / 255, 29 / 255, 25 / 255, 1);
          gl.clear(gl.COLOR_BUFFER_BIT);
        }

        // Particles sit behind the image planes, so they never land on a face.
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        useVao(partVao);
        gl.useProgram(part.p);
        bindShape(0, a.shape);
        bindShape(1, b.shape);
        gl.uniform1f(part.u.uMix, eased);
        gl.uniform1f(part.u.uTime, now);
        gl.uniform1f(part.u.uAspect, aspect);
        gl.uniform1f(part.u.uSize, (narrow ? 2.3 : 2.5) * dpr);
        gl.uniform1f(part.u.uDim, dimNow);
        gl.uniform1f(part.u.uDensity, Math.min(1.25, capacity / N * (narrow ? 0.72 : 0.56)));
        gl.uniform1f(part.u.uPulseAge, now - pulseAt);
        gl.uniform1f(part.u.uAudio, audio);
        gl.uniform2f(part.u.uMouse, mouse.x, mouse.y);
        gl.uniform2f(part.u.uPulse, pulse[0], pulse[1]);
        gl.uniform2f(part.u.uCenter, vortexCentre[0], vortexCentre[1]);
        gl.drawArrays(gl.POINTS, 0, N);

        if (plane && planes.length) {
          useVao(quadVao);
          gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
          gl.useProgram(plane.p);
          gl.uniform2f(plane.u.uRes, width, height);
          gl.uniform2f(plane.u.uParallax, -mouse.sx * 0.007, -mouse.sy * 0.005);
          bindTex(3, noiseTex, plane.u.uNoise);
          for (let i = 0; i < planes.length; i++) {
            const p = planes[i];
            const r = p.img.getBoundingClientRect();
            const near = r.bottom > -height * 0.6 && r.top < height * 1.6 && r.right > -width && r.left < width * 2;
            if (near && !p.loading) {
              p.loading = true;
              loadTexture(p.src, (tex, w, h) => {
                p.tex = tex; p.w = w; p.h = h;
                p.img.classList.add('gl-on');
              });
              if (p.depthSrc) loadTexture(p.depthSrc, tex => { p.depth = tex; });
            }
            if (!p.tex || r.bottom < 0 || r.top > height || r.right < 0 || r.left > width || r.width < 2) continue;
            p.reveal = Math.min(1, p.reveal + dtMs / 1500);
            if (p.dissolve >= 0.999) continue;
            bindTex(0, p.tex, plane.u.uTex);
            gl.uniform1f(plane.u.uHasDepth, p.depth ? 1 : 0);
            if (p.depth) bindTex(1, p.depth, plane.u.uDepth);
            gl.uniform4f(plane.u.uRect, r.left, r.top, r.width, r.height);
            gl.uniform2f(plane.u.uImg, p.w, p.h);
            gl.uniform2f(plane.u.uFocus, p.focus[0], p.focus[1]);
            gl.uniform1f(plane.u.uReveal, p.reveal);
            gl.uniform1f(plane.u.uDissolve, p.dissolve);
            gl.uniform1f(plane.u.uShape, p.shape);
            gl.uniform1f(plane.u.uRadius, p.radius);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          }
        }
        useVao(null);
      }
    };
    return api;
  };
})();
