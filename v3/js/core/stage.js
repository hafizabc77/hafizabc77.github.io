/* The stage: renders one scene (or two while they hand over), mixes them with a cinematic transition,
   then adds bloom and a film grade: colour per act, grain, vignette and a little lens fringing. */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { lerp } from './util.js';

const VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }';
export const TRANSITIONS = { dissolve: 0, dive: 1, pull: 2, whip: 3, flash: 4, fade: 5 };

const MIX = `
  uniform sampler2D tA, tB; uniform float uT, uTime, uAspect; uniform int uType; uniform vec2 uCenter;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
  float fbm(vec2 p) { float s = 0., a = .5; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p *= 2.03; a *= .5; } return s; }
  vec3 zoomTap(sampler2D t, vec2 uv, vec2 c, float amt) {
    vec3 acc = vec3(0.);
    for (int i = 0; i < 12; i++) { float k = float(i) / 11.; acc += texture2D(t, c + (uv - c) * (1. - amt * k)).rgb; }
    return acc / 12.;
  }
  vec3 panTap(sampler2D t, vec2 uv, float shift, float blur) {
    vec3 acc = vec3(0.);
    for (int i = 0; i < 12; i++) { float k = float(i) / 11. - .5; acc += texture2D(t, uv + vec2(shift + k * blur, 0.)).rgb; }
    return acc / 12.;
  }
  void main() {
    float t = clamp(uT, 0., 1.), e = t * t * (3. - 2. * t);
    vec2 uv = vUv, d = uv - uCenter; d.x *= uAspect; float r = length(d);
    if (t <= .0001) { gl_FragColor = vec4(texture2D(tA, uv).rgb, 1.); return; }
    if (t >= .9999) { gl_FragColor = vec4(texture2D(tB, uv).rgb, 1.); return; }
    vec3 col;
    if (uType == 1) {            // dive: we rush into A and a portal opens onto B
      vec3 a = zoomTap(tA, uCenter + (uv - uCenter) / (1. + e * 2.4), uCenter, .5 * e);
      vec3 b = zoomTap(tB, uCenter + (uv - uCenter) * (1. + (1. - e) * 1.8), uCenter, .35 * (1. - e));
      float R = e * 1.7, wob = .07 * fbm(uv * 7. + uTime * .3);
      float m = smoothstep(R, R - .3, r + wob);
      float rim = exp(-pow((r + wob - R + .14) / .05, 2.)) * (1. - e);
      col = mix(a * (1. - e * .5), b, m) + vec3(1., .82, .5) * rim * 1.4;
    } else if (uType == 2) {     // pull back: A falls away into the centre while B opens around it
      vec3 a = zoomTap(tA, uCenter + (uv - uCenter) * (1. + e * 2.), uCenter, .25 * e);
      vec3 b = zoomTap(tB, uCenter + (uv - uCenter) / (1. + (1. - e) * 1.2), uCenter, .3 * (1. - e));
      float R = (1. - e) * 1.6, wob = .06 * fbm(uv * 6. - uTime * .2);
      float m = smoothstep(R - .25, R, r + wob);
      float rim = exp(-pow((r + wob - R + .1) / .05, 2.)) * e * (1. - e) * 4.;
      col = mix(a, b, max(m, smoothstep(.6, 1., e))) + vec3(.6, .85, 1.) * rim;
    } else if (uType == 3) {     // whip pan with motion blur
      float blur = sin(3.14159 * t) * .35;
      vec3 a = panTap(tA, uv, e * .7, blur), b = panTap(tB, uv, -(1. - e) * .7, blur);
      col = mix(a, b, smoothstep(.35, .65, t));
    } else if (uType == 4) {     // flash of light
      vec3 a = texture2D(tA, uv).rgb, b = texture2D(tB, uv).rgb;
      float f = exp(-pow((t - .5) / .16, 2.));
      col = mix(a, b, smoothstep(.45, .55, t)) + vec3(1., .9, .75) * f * 2.5;
    } else if (uType == 5) {     // a clean crossfade, for match cuts where both shots frame the same thing
      col = mix(texture2D(tA, uv).rgb, texture2D(tB, uv).rgb, e);
    } else {                     // dissolve with a thin burning gold edge
      float n = fbm(uv * 4.5 + vec2(uTime * .04, 0.));
      float k = t * 1.3 - .15;
      float m = smoothstep(k - .04, k + .04, n);
      float edge = exp(-pow((n - k) / .018, 2.)) * (1. - e);
      col = mix(texture2D(tB, uv).rgb, texture2D(tA, uv).rgb, m) + vec3(1., .78, .42) * edge * .9;
    }
    gl_FragColor = vec4(col, 1.);
  }`;

const GRADE = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) },
    uTint: { value: new THREE.Color(1, 1, 1) }, uShadow: { value: new THREE.Color(0, 0, 0) },
    uSat: { value: 1 }, uVig: { value: .6 }, uGrain: { value: .05 }, uAberr: { value: .2 }, uExposure: { value: 1 }, uFade: { value: 0 }, uBars: { value: 0 }
  },
  vertexShader: VERT,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uSat, uVig, uGrain, uAberr, uExposure, uFade, uBars; uniform vec3 uTint, uShadow; uniform vec2 uRes;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 uv = vUv, d = uv - .5;
      float ab = uAberr * (.15 + dot(d, d) * 2.2) * .02;
      vec3 c = vec3(texture2D(tDiffuse, uv - d * ab).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv + d * ab).b);
      c *= uExposure;
      float l = dot(c, vec3(.2126, .7152, .0722));
      c = mix(vec3(l), c, uSat);
      c = c * uTint + uShadow * (1. - smoothstep(0., .25, l)) * .05;
      c *= mix(1., smoothstep(1.05, .25, length(d * vec2(1.1, 1.))), uVig);
      c += (hash(uv * uRes + fract(uTime * 7.3) * 113.) - .5) * uGrain * (.4 + min(l, 1.) * .8);
      c *= 1. - uFade;
      c *= step(abs(d.y), .5 - uBars * .075);
      gl_FragColor = vec4(max(c, vec3(0.)), 1.);
    }`
};

class StagePass extends Pass {
  constructor(samples) {
    super();
    this.needsSwap = false;
    const make = () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples });
    this.rtA = make(); this.rtB = make();
    this.mat = new THREE.ShaderMaterial({
      uniforms: { tA: { value: null }, tB: { value: null }, uT: { value: 0 }, uType: { value: 0 }, uTime: { value: 0 }, uAspect: { value: 1 }, uCenter: { value: new THREE.Vector2(.5, .5) } },
      vertexShader: VERT, fragmentShader: MIX, depthTest: false, depthWrite: false
    });
    this.quad = new FullScreenQuad(this.mat);
    this.A = null; this.B = null; this.t = 0; this.type = 0;
  }
  setSize(w, h) { this.rtA.setSize(w, h); this.rtB.setSize(w, h); this.mat.uniforms.uAspect.value = w / Math.max(1, h); }
  render(renderer, writeBuffer, readBuffer) {
    const u = this.mat.uniforms, two = this.B && this.t > 0 && this.t < 1;
    const first = this.t >= 1 && this.B ? this.B : this.A;
    renderer.setRenderTarget(this.rtA); renderer.clear(); if (first) renderer.render(first.scene, first.camera);
    if (two) { renderer.setRenderTarget(this.rtB); renderer.clear(); renderer.render(this.B.scene, this.B.camera); }
    u.tA.value = this.rtA.texture; u.tB.value = two ? this.rtB.texture : this.rtA.texture;
    u.uT.value = two ? this.t : 0; u.uType.value = this.type;
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    this.quad.render(renderer);
  }
}

export class Stage {
  constructor(canvas, { small }) {
    const renderer = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false });
    renderer.setClearColor(0x000000, 1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    this.small = small;
    this.ratio = Math.min(devicePixelRatio || 1, small ? 1.75 : 1.5);
    renderer.setPixelRatio(this.ratio);
    this.composer = new EffectComposer(renderer);
    this.stagePass = new StagePass(small ? 0 : 4);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .85, .55, .62);
    this.grade = new ShaderPass(GRADE);
    this.out = new OutputPass();
    [this.stagePass, this.bloom, this.grade, this.out].forEach(p => this.composer.addPass(p));
    this.look = { tint: new THREE.Color(1, 1, 1), shadow: new THREE.Color(0, 0, 0), sat: 1, vig: .6, grain: .05, aberr: .2, bloom: .85, threshold: .62, exposure: 1 };
    this.resize();
  }
  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.ratio);
    this.composer.setSize(w, h);
    this.grade.uniforms.uRes.value.set(w * this.ratio, h * this.ratio);
    this.aspect = w / h;
  }
  /* Blend toward a colour grade for the current act. */
  setLook(target, k = 1) {
    const L = this.look;
    L.tint.lerp(target.tint, k); L.shadow.lerp(target.shadow, k);
    ['sat', 'vig', 'grain', 'aberr', 'bloom', 'threshold', 'exposure'].forEach(n => { L[n] = lerp(L[n], target[n], k); });
  }
  render(A, B, t, type, time, extra = {}) {
    const sp = this.stagePass;
    sp.A = A; sp.B = B; sp.t = t; sp.type = TRANSITIONS[type] ?? 0;
    sp.mat.uniforms.uTime.value = time;
    if (extra.center) sp.mat.uniforms.uCenter.value.copy(extra.center); else sp.mat.uniforms.uCenter.value.set(.5, .5);
    const L = this.look, g = this.grade.uniforms;
    g.uTime.value = time; g.uTint.value.copy(L.tint); g.uShadow.value.copy(L.shadow);
    g.uSat.value = L.sat; g.uVig.value = L.vig; g.uGrain.value = L.grain; g.uExposure.value = L.exposure;
    g.uAberr.value = L.aberr + (extra.aberr || 0); g.uFade.value = extra.fade || 0; g.uBars.value = extra.bars || 0;
    this.bloom.strength = L.bloom + (extra.bloom || 0); this.bloom.threshold = L.threshold; this.bloom.radius = .55;
    this.composer.render();
  }
}
