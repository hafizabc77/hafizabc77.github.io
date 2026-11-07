/* Hand-written WebGL particle scene (no libraries).
   One set of particles morphs between named shapes as the page scrolls, and
   reacts to the pointer and to clicks. All motion runs in the vertex shader,
   so a phone only has to update a handful of uniforms each frame. */
(function () {
  'use strict';

  const VERTEX = `
    precision highp float;
    attribute vec4 aFrom;
    attribute vec4 aTo;
    attribute vec4 aSeed;
    uniform float uMix, uTime, uAspect, uSize, uDim, uPulseAge, uDensity;
    uniform vec2 uMouse, uMouseVel, uPulse, uCenter;
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

      // Pointer pushes particles away and drags them with its velocity.
      vec2 d = pos - uMouse;
      float dist = length(d) + 0.0001;
      float force = smoothstep(0.3, 0.0, dist);
      pos += (d / dist) * force * force * 0.11;
      pos += uMouseVel * force * 0.26;

      // A click sends out one expanding ring.
      if (uPulseAge < 2.5) {
        vec2 pd = pos - uPulse;
        float pr = length(pd) + 0.0001;
        float band = pr - uPulseAge * 1.15;
        pos += (pd / pr) * exp(-band * band * 70.0) * exp(-uPulseAge * 1.8) * 0.2;
      }

      gl_Position = vec4(pos.x / uAspect, pos.y, 0.0, 1.0);
      gl_PointSize = uSize * (0.55 + aSeed.w * 0.95) * persp;
      vAlpha = uDim * (0.32 + 0.68 * aSeed.y) * uDensity * (1.0 - flight * 0.25);
      vTone = aSeed.z;
    }`;

  const FRAGMENT = `
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

  const rand = Math.random;
  function gauss() { return (rand() + rand() + rand() + rand() - 2) / 2; }

  function compile(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  }

  /* ---------- Shapes: every shape is N points of (x, y, z, spin) in clip-like
     space, where x runs from -aspect to +aspect and y from -1 to +1. ---------- */
  function vortex(N, cx, cy, R) {
    const out = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) {
      const r = R * Math.pow(rand(), 0.62);
      const arm = (i % 3) * 2.0944;
      const a = r * 5.2 / R + arm + gauss() * 0.55;
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
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    const out = new Float32Array(N * 4);
    if (!hits.length) return vortex(N, cx, cy, 0.6);
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

  /* Three dies: a GPU core grid, an FPGA fabric lattice and an NPU of rings. */
  function chips(N, aspect, narrow) {
    const out = new Float32Array(N * 4);
    const size = narrow ? Math.min(0.17, aspect * 0.3) : Math.min(0.34, aspect * 0.165);
    const middle = narrow ? 0 : aspect * 0.24;
    const centres = narrow
      ? [[0, 0.66], [0, 0.3], [0, -0.06]]
      : [[middle - size * 2.28, 0.08], [middle, 0.08], [middle + size * 2.28, 0.08]];
    for (let i = 0; i < N; i++) {
      const kind = i % 3, [cx, cy] = centres[kind];
      const part = rand();
      let x, y;
      if (part < 0.26) { // package outline
        const side = Math.floor(rand() * 4), s = rand() * 2 - 1;
        x = side < 2 ? s : (side === 2 ? -1 : 1);
        y = side < 2 ? (side === 0 ? -1 : 1) : s;
      } else if (part < 0.36) { // pins
        const side = Math.floor(rand() * 4), s = Math.round((rand() * 2 - 1) * 7) / 7, out2 = 1 + rand() * 0.14;
        x = side < 2 ? s : (side === 2 ? -out2 : out2);
        y = side < 2 ? (side === 0 ? -out2 : out2) : s;
      } else if (kind === 0) { // GPU: dense blocks
        const gx = Math.floor(rand() * 5), gy = Math.floor(rand() * 5);
        x = -0.8 + gx * 0.34 + rand() * 0.24;
        y = -0.8 + gy * 0.34 + rand() * 0.24;
      } else if (kind === 1) { // FPGA: routing lattice
        if (rand() < 0.5) { x = -0.82 + Math.floor(rand() * 7) * 0.273; y = rand() * 1.64 - 0.82; }
        else { y = -0.82 + Math.floor(rand() * 7) * 0.273; x = rand() * 1.64 - 0.82; }
      } else { // NPU: concentric rings
        const r = 0.2 + Math.floor(rand() * 4) * 0.2, a = rand() * 6.283;
        x = Math.cos(a) * r; y = Math.sin(a) * r;
      }
      out[i * 4] = cx + x * size + gauss() * 0.004;
      out[i * 4 + 1] = cy + y * size + gauss() * 0.004;
      out[i * 4 + 2] = gauss() * 0.02;
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

  window.createScene = function createScene(canvas, options) {
    const opts = options || {};
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
    if (!gl) return null;

    const program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);

    const U = {};
    ['uMix', 'uTime', 'uAspect', 'uSize', 'uDim', 'uPulseAge', 'uDensity', 'uMouse', 'uMouseVel', 'uPulse', 'uCenter']
      .forEach(name => { U[name] = gl.getUniformLocation(program, name); });
    const A = { from: gl.getAttribLocation(program, 'aFrom'), to: gl.getAttribLocation(program, 'aTo'), seed: gl.getAttribLocation(program, 'aSeed') };

    let N = opts.count || 18000;
    const capacity = N;
    let dpr = Math.min(window.devicePixelRatio || 1, opts.maxDpr || 2);
    let width = 0, height = 0, aspect = 1, narrow = false;
    const buffers = {};
    let bound = [null, null];
    let anchors = [];
    let pulseAt = -10, pulse = [0, 0];
    const mouse = { x: 9, y: 9, tx: 9, ty: 9, vx: 0, vy: 0 };
    let frames = 0, slowMs = 0, tier = 0;
    let dimNow = 0.7;

    const seeds = new Float32Array(capacity * 4);
    for (let i = 0; i < seeds.length; i++) seeds[i] = rand();
    const seedBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, seedBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(A.seed);
    gl.vertexAttribPointer(A.seed, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(A.from);
    gl.enableVertexAttribArray(A.to);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.clearColor(7 / 255, 29 / 255, 25 / 255, 1);

    function store(name, data) {
      if (!buffers[name]) buffers[name] = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffers[name]);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    }

    function setBounds() {
      width = window.innerWidth;
      height = Math.max(window.innerHeight, opts.stableHeight ? opts.stableHeight() : 0);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      gl.viewport(0, 0, canvas.width, canvas.height);
      aspect = width / height;
      narrow = aspect < 1;
    }

    let vortexCentre = [0, 0];
    function buildShapes() {
      // Sans figures stay readable as particles; the serif's old-style digits do not.
      const sans = '700 $px "DM Sans", system-ui, sans-serif';
      const textBox = narrow ? aspect * 1.72 : Math.min(aspect * 1.08, 1.75);
      const textX = narrow ? 0 : aspect * 0.28;
      const textY = narrow ? 0.34 : 0.06;
      vortexCentre = narrow ? [aspect * 0.42, 0.72] : [aspect * 0.42, 0.08];
      store('vortex', vortex(capacity, vortexCentre[0], vortexCentre[1], narrow ? 0.5 : 0.86));
      store('n303', textShape(capacity, '3.03×', sans, textX, textY, textBox));
      store('n104', textShape(capacity, '10.4×', sans, textX, textY, textBox));
      store('chips', chips(capacity, aspect, narrow));
      store('n5', textShape(capacity, '5', sans, textX, textY, narrow ? aspect * 0.5 : Math.min(aspect * 0.3, 0.52)));
      store('network', network(capacity, aspect, narrow));
      store('ring', ring(capacity, narrow ? 0 : aspect * 0.42, narrow ? -0.25 : 0, narrow ? aspect * 0.8 : 0.72));
      bound = [null, null];
    }

    function bind(slot, attr, name) {
      if (bound[slot] === name) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, buffers[name]);
      gl.vertexAttribPointer(attr, 4, gl.FLOAT, false, 0, 0);
      bound[slot] = name;
    }

    function pointSize() { return (narrow ? 2.3 : 2.5) * dpr; }

    setBounds();
    buildShapes();

    return {
      get aspect() { return aspect; },
      rebuild() { setBounds(); buildShapes(); },
      resize() {
        const w = window.innerWidth;
        if (w === width && window.innerHeight <= height) return; // Ignore a phone's address bar sliding away.
        setBounds();
        buildShapes();
      },
      setAnchors(list) { anchors = list; },
      pointer(px, py) {
        mouse.tx = (px / width * 2 - 1) * aspect;
        mouse.ty = -(py / height * 2 - 1);
      },
      pointerLeave() { mouse.tx = 9; mouse.ty = 9; },
      pulse(px, py, now) {
        pulse = [(px / width * 2 - 1) * aspect, -(py / height * 2 - 1)];
        pulseAt = now;
      },
      /* Stats for the test harness. */
      stats() { return { count: N, dpr, tier, frames }; },
      render(now, scrollY, dtMs) {
        if (!anchors.length) return;

        // Step quality down once if this device cannot hold a smooth frame rate.
        frames++;
        if (frames > 30 && dtMs > 40) slowMs++;
        if (frames > 150 && tier < 2 && slowMs > 60) {
          tier++; slowMs = 0; frames = 0;
          N = Math.floor(N * 0.62);
          if (dpr > 1) { dpr = 1; setBounds(); }
        }

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
        // Hold each shape briefly at both ends of its scroll range.
        const eased = Math.min(1, Math.max(0, (t - 0.18) / 0.64));
        const dimTarget = a.dim + (b.dim - a.dim) * eased;
        dimNow += (dimTarget - dimNow) * 0.12;

        const px = mouse.x, py = mouse.y;
        mouse.x += (mouse.tx - mouse.x) * 0.14;
        mouse.y += (mouse.ty - mouse.y) * 0.14;
        mouse.vx += ((mouse.x - px) * 2.6 - mouse.vx) * 0.12;
        mouse.vy += ((mouse.y - py) * 2.6 - mouse.vy) * 0.12;

        bind(0, A.from, a.shape);
        bind(1, A.to, b.shape);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform1f(U.uMix, eased);
        gl.uniform1f(U.uTime, now);
        gl.uniform1f(U.uAspect, aspect);
        gl.uniform1f(U.uSize, pointSize());
        gl.uniform1f(U.uDim, dimNow);
        gl.uniform1f(U.uDensity, Math.min(1.25, capacity / N * (narrow ? 0.72 : 0.56)));
        gl.uniform1f(U.uPulseAge, now - pulseAt);
        gl.uniform2f(U.uMouse, mouse.x, mouse.y);
        gl.uniform2f(U.uMouseVel, mouse.vx, mouse.vy);
        gl.uniform2f(U.uPulse, pulse[0], pulse[1]);
        gl.uniform2f(U.uCenter, vortexCentre[0], vortexCentre[1]);
        gl.drawArrays(gl.POINTS, 0, N);
      }
    };
  };
})();
