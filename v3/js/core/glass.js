/* Teal-and-emerald glass, shared by Act III: glowing glass cells (one per number in a vector), glass slabs (one per
   block of the model), an attention heat map, a lab floor that fades into the dark, and drifting motes for depth. */
import * as THREE from 'three';
import { additive, POINT_FRAG, rng, col } from './util.js';

/* A number as a colour: negative deep teal-blue, zero dim glass, positive emerald, large positive gold. */
export const VALCOL = `
  vec3 valCol(float v) {
    vec3 neg = vec3(.07, .36, .62), mid = vec3(.04, .14, .14), pos = vec3(.14, .92, .6), hot = vec3(1., .84, .42);
    return v < 0. ? mix(mid, neg, clamp(-v, 0., 1.)) : mix(mix(mid, pos, clamp(v * 1.4, 0., 1.)), hot, clamp(v * 1.6 - .95, 0., 1.));
  }`;

/* Many small glass boxes in one draw call. set(i, x, y, z, sx, sy, sz, value, glow, alpha), then commit(). */
export function cells(n) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 1 } },
    vertexShader: `
      attribute vec3 iData; varying vec3 vN, vV, vData;
      void main() {
        vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.);
        vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal); vV = normalize(cameraPosition - w.xyz); vData = iData;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: VALCOL + `
      uniform float uOpacity; varying vec3 vN, vV, vData;
      void main() {
        float fr = pow(1. - abs(dot(normalize(vN), normalize(vV))), 2.2);
        vec3 c = valCol(vData.x);
        vec3 col = c * (.42 + .9 * vData.y) + mix(vec3(.45, 1., .88), c, .45) * fr * .8 + vec3(1., .9, .62) * vData.y * .35;
        float a = vData.z * uOpacity;
        gl_FragColor = vec4(col * a, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, premultipliedAlpha: true
  });
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, n);
  const data = new Float32Array(n * 3);
  mesh.geometry.setAttribute('iData', new THREE.InstancedBufferAttribute(data, 3));
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  return {
    mesh, mat,
    set(i, x, y, z, sx, sy, sz, v, glow, a) { m4.compose(p.set(x, y, z), q, s.set(Math.max(1e-4, sx), Math.max(1e-4, sy), Math.max(1e-4, sz))); mesh.setMatrixAt(i, m4); data[i * 3] = v; data[i * 3 + 1] = glow; data[i * 3 + 2] = a; },
    commit() { mesh.instanceMatrix.needsUpdate = true; mesh.geometry.attributes.iData.needsUpdate = true; }
  };
}

/* A pane of glass shaped like a box: faint faces that brighten at grazing angles, and bright edges. */
export function slab(w, h, d, tint = '#2fe0b4') {
  const g = new THREE.Group(), c = col(tint);
  const faces = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0 }, uTint: { value: c }, uGlow: { value: 0 } },
    vertexShader: 'varying vec3 vN, vV; void main() { vec4 w = modelMatrix * vec4(position, 1.); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: 'uniform float uOpacity, uGlow; uniform vec3 uTint; varying vec3 vN, vV; void main() { float fr = pow(1. - abs(dot(normalize(vN), normalize(vV))), 3.); vec3 col = uTint * (fr * .32 + .025 + uGlow * .22) + vec3(1., .9, .7) * uGlow * fr * .3; gl_FragColor = vec4(col * uOpacity, 0.); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, premultipliedAlpha: true, side: THREE.DoubleSide
  }));
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  faces.renderOrder = 1; edges.renderOrder = 1; g.add(faces, edges);
  g.userData.set = (o, glow = 0) => { faces.material.uniforms.uOpacity.value = o; faces.material.uniforms.uGlow.value = glow; edges.material.opacity = o * (.45 + glow * .5); g.visible = o > .003; };
  g.userData.tint = c2 => { faces.material.uniforms.uTint.value.copy(c2); edges.material.color.copy(c2); };   // e.g. red while gradients flow back
  return g;
}

/* An n × n grid of tiles (an attention matrix). set(row, colIndex, value, highlight, alpha), then commit(). */
export function heat(n, tile = .42, gap = .05) {
  const N = n * n, geo = new THREE.PlaneGeometry(tile, tile), data = new Float32Array(N * 3);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0 } },
    vertexShader: 'attribute vec3 iData; varying vec3 vData; varying vec2 vUv; void main() { vData = iData; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.); }',
    fragmentShader: VALCOL + `
      uniform float uOpacity; varying vec3 vData; varying vec2 vUv;
      void main() {
        vec2 q = abs(vUv - .5); float edge = smoothstep(.5, .44, max(q.x, q.y));
        float rim = smoothstep(.36, .5, max(q.x, q.y)) * edge;
        vec3 c = mix(vec3(.03, .1, .1), valCol(vData.x * 1.25), clamp(vData.x * 3., 0., 1.)) + vec3(.4, 1., .85) * rim * .18 + vec3(1., .9, .6) * vData.y * .5;
        float a = edge * vData.z * uOpacity;
        gl_FragColor = vec4(c * a, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, premultipliedAlpha: true, side: THREE.DoubleSide
  });
  const mesh = new THREE.InstancedMesh(geo, mat, N); mesh.frustumCulled = false; mesh.renderOrder = 2;
  geo.setAttribute('iData', new THREE.InstancedBufferAttribute(data, 3));
  const m4 = new THREE.Matrix4(), step = tile + gap, off = (n - 1) * step / 2;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) { m4.makeTranslation(c * step - off, off - r * step, 0); mesh.setMatrixAt(r * n + c, m4); }
  return {
    mesh, mat, size: n * step,
    cell(r, c) { return new THREE.Vector3(c * step - off, off - r * step, 0); },
    set(r, c, v, hi, a) { const i = (r * n + c) * 3; data[i] = v; data[i + 1] = hi; data[i + 2] = a; },
    commit() { geo.attributes.iData.needsUpdate = true; }
  };
}

/* A dark glass lab floor with a fine grid that fades into the distance. */
export function floor(y = 0, tint = '#1fbfa6') {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 1 }, uTint: { value: col(tint) } },
    vertexShader: 'varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `
      uniform float uOpacity; uniform vec3 uTint; varying vec3 vW;
      float grid(vec2 p) { vec2 g = abs(fract(p - .5) - .5) / fwidth(p); return 1. - min(min(g.x, g.y), 1.); }
      void main() {
        float d = length(vW.xz), fade = exp(-d * .055);
        float g = grid(vW.xz) * .55 + grid(vW.xz / 5.) * .45;
        vec3 c = uTint * (g * .3 + .012) * fade;
        gl_FragColor = vec4(c * uOpacity, 0.);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, premultipliedAlpha: true
  }));
  m.rotation.x = -Math.PI / 2; m.position.y = y; m.renderOrder = -2;
  return m;
}

/* Faint motes drifting through the space, near and far. */
export function motes(n = 500, box = [40, 22, 40], tint = '#7fe8d6') {
  const r = rng(404), p = new Float32Array(n * 3), c = new Float32Array(n * 3), sd = new Float32Array(n * 4), t = col(tint);
  for (let i = 0; i < n; i++) { p.set([(r() - .5) * box[0], r() * box[1] - 2, (r() - .5) * box[2]], i * 3); const b = .15 + r() * .35; c.set([t.r * b, t.g * b, t.b * b], i * 3); sd.set([r(), .02 + r() * .03, r(), r()], i * 4); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 4));
  const mat = additive({
    uniforms: { uTime: { value: 0 }, uPx: { value: 1000 }, uOpacity: { value: 1 } },
    vertexShader: `attribute vec3 color; attribute vec4 aSeed; uniform float uTime, uPx, uOpacity; varying vec3 vColor; varying float vAlpha;
      void main() { vec3 q = position + vec3(sin(uTime * .07 + aSeed.x * 30.), sin(uTime * .05 + aSeed.z * 20.) * .6, cos(uTime * .06 + aSeed.w * 25.)) * .8;
        vec4 mv = modelViewMatrix * vec4(q, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = max(1., uPx * aSeed.y / -mv.z);
        vColor = color; vAlpha = uOpacity * .55 * smoothstep(.5, 3., -mv.z); }`,
    fragmentShader: POINT_FRAG
  });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false;
  return { pts, mat };
}
