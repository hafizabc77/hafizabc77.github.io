/* The brain from Act I as plain points (the same cortex and cerebellum shapes as the opening), so the film can return
   to it at the end of Act VII. Returns positions in a unit-ish box: x ±1.1, y ±.8, z ±1.2. */
import * as THREE from 'three';
import { rng, noise3, unitVector } from './util.js';

export function brainPoints(n = 3000, seed = 21) {
  const r = rng(seed), nz = noise3(seed + 1), out = new Float32Array(n * 3), v = new THREE.Vector3();
  const ridged = (x, y, z) => { let s = 0, a = .5, f = 1; for (let o = 0; o < 3; o++) { s += a * (1 - Math.abs(nz(x * f, y * f, z * f))); f *= 2.15; a *= .5; } return s / .875; };
  const R = new THREE.Vector3(.6, .74, 1.12);
  function cortex(o) {
    const side = r() < .5 ? -1 : 1, d = unitVector(r);
    let { x, y, z } = d;
    if (y < -.32) y = -.32 + (y + .32) * .45;
    y *= 1 + .1 * Math.max(0, z);
    x *= 1 - .14 * Math.max(0, -z);
    const temporal = Math.max(0, -y - .05) * Math.max(0, x * side) * (z > -.35 ? 1 : 0);
    let px = side * .5 + x * R.x + side * temporal * .16, py = y * R.y - temporal * .1, pz = z * R.z;
    if (side * px < .03) px = side * (.03 + (side * px - .03) * .04);
    const groove = Math.exp(-Math.pow((y + .1 - .3 * z) / .07, 2)) * (x * side > .25 ? 1 : 0) * (z > -.4 ? 1 : 0);
    const nrm = new THREE.Vector3(px - side * .5, py, pz).normalize();
    const disp = (ridged(px * 4.1, py * 4.1, pz * 3.7) - .55) * .11 - groove * .06 - r() * .012;
    o.set(px + nrm.x * disp, py + nrm.y * disp, pz + nrm.z * disp);
  }
  function cerebellum(o) {
    const d = unitVector(r), p = new THREE.Vector3(d.x * .6, d.y * .29, d.z * .36);
    const folia = Math.sin(p.y * 95 + p.z * 8) * .012 + (ridged(p.x * 4, p.y * 4, p.z * 4) - .5) * .02;
    o.copy(p.multiplyScalar(1 + folia / .35)).add(new THREE.Vector3(0, -.5, -.8));
  }
  for (let i = 0; i < n; i++) { (r() < .9 ? cortex : cerebellum)(v); out.set([v.x, v.y, v.z], i * 3); }
  return out;
}
