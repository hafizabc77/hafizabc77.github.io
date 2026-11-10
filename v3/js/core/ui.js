/* Words in the world: captions that drift in and out around the scene, and labels pinned to 3D objects. */
import * as THREE from 'three';

const v = new THREE.Vector3();

export class UI {
  constructor() {
    this.capLayer = document.getElementById('captions');
    this.labLayer = document.getElementById('labels');
    this.uiLayer = document.getElementById('scene-ui');
    this.sets = new Map();     // scene id → caption elements
    this.labels = new Map();   // scene id → label elements
    this.w = innerWidth; this.h = innerHeight;
    addEventListener('resize', () => { this.w = innerWidth; this.h = innerHeight; });
  }

  /* Captions: [{ at: [from, to], html, x, y, cls, align }] in the scene's own progress (0…1). x and y are % of the screen. */
  captions(id, list) {
    const phone = innerWidth < 760;
    const els = list.map(c0 => {
      // On phones a caption can sit somewhere else (m) and show at another moment (mAt).
      const c = phone && (c0.m || c0.mAt) ? Object.assign({}, c0, c0.m || {}, c0.mAt ? { at: c0.mAt } : {}) : c0;
      const el = document.createElement('p');
      el.className = `cap ${c.cls || ''}`;
      el.innerHTML = c.html;
      el.style.top = /\bhint\b/.test(c.cls || '') ? `min(${c.y}%, calc(100% - var(--dock) - 34px))` : `${c.y}%`;
      if (c.align === 'right') el.style.right = `${100 - c.x}%`;   // anchored on the right so it keeps its full width
      else { el.style.left = `${c.x}%`; if (c.align === 'center') el.style.transform = 'translate(-50%, 0)'; }
      el.dataset.align = c.align || 'left';
      this.capLayer.append(el);
      return { el, c, on: false };
    });
    this.sets.set(id, els);
  }
  /* Show the captions whose window contains p; weight fades a scene's captions during a hand-over. */
  syncCaptions(id, p, active) {
    const els = this.sets.get(id); if (!els) return;
    els.forEach(o => {
      const on = active && p >= o.c.at[0] && p <= o.c.at[1] && (!o.c.when || o.c.when());
      if (on !== o.on) { o.on = on; o.el.classList.toggle('on', on); }
    });
  }

  /* Labels pinned to points in 3D. */
  label(id, html, cls = '') {
    const el = document.createElement('div');
    el.className = `lab ${cls}`; el.innerHTML = html;
    this.labLayer.append(el);
    if (!this.labels.has(id)) this.labels.set(id, []);
    const o = { el, on: false, x: -1, y: -1 };
    this.labels.get(id).push(o);
    return o;
  }
  place(o, pos, camera, show = true) {
    v.copy(pos).project(camera);
    const vis = show && v.z < 1 && v.z > -1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2;
    if (vis !== o.on) { o.on = vis; o.el.classList.toggle('on', vis); }
    if (!vis) return false;
    const x = Math.round((v.x * .5 + .5) * this.w), y = Math.round((-v.y * .5 + .5) * this.h);
    if (x !== o.x || y !== o.y) { o.x = x; o.y = y; o.el.style.transform = `translate3d(${x}px, ${y}px, 0)`; }
    return true;
  }
  hideLabels(id) { (this.labels.get(id) || []).forEach(o => { if (o.on) { o.on = false; o.el.classList.remove('on'); } }); }
  /* Screen position of a 3D point, in pixels. */
  screen(pos, camera) { v.copy(pos).project(camera); return { x: (v.x * .5 + .5) * this.w, y: (-v.y * .5 + .5) * this.h, z: v.z }; }
}
