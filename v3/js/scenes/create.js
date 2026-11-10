/* Act VIII, scene 20: what else a model makes, and what Hafiz makes.
   It opens on the brain Act VII ended with; its points burst and settle into a picture: his MetaHuman, a digital human,
   with scrolling dollying the camera in to the eye (his 90-frame render). Then his Unreal Engine 5 worlds as portals
   around the showreel playing on a screen (click a scene to step closer). Then his music videos and three AI songs
   (play one and the room pulses with it; click a video for sound), with the chain that made them. Then away from the
   screen: volleyball, badminton, swimming and Spurs (tap the ball). It ends pulling back, for the finale. */
import * as THREE from 'three';
import { additive, POINT_FRAG, col, rng, sstep, clamp, lerp, easeInOut, easeOut, pixelScale, glowTexture } from '../core/util.js';
import { floor, motes } from '../core/glass.js';
import { brainPoints } from '../core/brainShape.js';

const SONGS = [['Lion of My Chest', 'lion-of-my-chest'], ['Fire in the Rubble', 'fire-in-the-rubble'], ['River to Sea', 'river-to-sea']];
const SHOW = n => `../assets/showcase/${n}`;

export default function create(ctx) {
  const { small, ui, score, pointer, renderer, coarse } = ctx;
  const scene = new THREE.Scene();
  scene.background = col('#0a0507');
  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, .05, 300);
  const r = rng(2020);
  let tall = false;
  scene.add(floor(-.06, '#ff8a6a'));
  const dust = motes(small ? 180 : 420, [44, 16, 34], '#ffc0a0'); scene.add(dust.pts);
  const geoOf = attrs => { const g = new THREE.BufferGeometry(); Object.entries(attrs).forEach(([k, [arr, n]]) => g.setAttribute(k, new THREE.Float32BufferAttribute(arr, n))); return g; };

  /* ---------- The brain from Act VII, bursting into a picture ---------- */
  const BC = new THREE.Vector3(0, 4.1, -1), BN = small ? 1600 : 3000, brain = brainPoints(BN, 21);
  const bp = new Float32Array(BN * 3), tgt = new Float32Array(BN * 3), rr = [];
  for (let i = 0; i < BN; i++) { tgt.set([(r() - .5) * 9.2, 4.1 + (r() - .5) * 5.2, -1.02], i * 3); rr.push(r()); }
  const bGeo = new THREE.BufferGeometry(); bGeo.setAttribute('position', new THREE.BufferAttribute(bp, 3)); bGeo.setAttribute('aR', new THREE.Float32BufferAttribute(rr, 1));
  const bMat = additive({ uniforms: { uPx: { value: 1000 }, uO: { value: 1 }, uT: { value: 0 }, uAmp: { value: 0 } }, vertexShader: 'attribute float aR; uniform float uPx, uO, uT, uAmp; varying vec3 vColor; varying float vAlpha; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; float spark = pow(.5 + .5 * sin(uT * 2. + aR * 40.), 12.); gl_PointSize = max(1., uPx * (.035 + aR * .03) * (1. + spark + uAmp * 1.5) / -mv.z); vColor = mix(vec3(.62, .4, 1.), vec3(1., .72, .5), aR * aR) * (1. + spark); vAlpha = uO * .85; }', fragmentShader: POINT_FRAG });
  const bPts = new THREE.Points(bGeo, bMat); bPts.frustumCulled = false; scene.add(bPts);

  /* ---------- Image: his MetaHuman, scroll dollies in to the eye ---------- */
  const FRAMES = small ? 45 : 90, dir = small ? 'metahuman-m' : 'metahuman', frames = new Array(FRAMES);
  const mhTex = new THREE.Texture(); mhTex.colorSpace = THREE.SRGBColorSpace;
  const mh = new THREE.Mesh(new THREE.PlaneGeometry(9.2, 5.175), new THREE.MeshBasicMaterial({ map: mhTex, transparent: true, opacity: 0, depthWrite: false })); mh.position.copy(BC); scene.add(mh);
  let loadedFrames = false, shownFrame = -1;
  function loadFrames() {
    if (loadedFrames) return; loadedFrames = true;
    const order = []; for (let s = 16; s >= 1; s = Math.floor(s / 2)) for (let i = 0; i < FRAMES; i += s) if (!order.includes(i)) order.push(i);
    order.forEach(i => { const im = new Image(); im.decoding = 'async'; im.onload = () => { im._ok = true; }; im.src = `../assets/${dir}/${String(i).padStart(3, '0')}.webp`; frames[i] = im; });
  }
  const nearestFrame = i => { for (let d = 0; d < FRAMES; d++) { const a = frames[i - d], b = frames[i + d]; if (a && a._ok) return a; if (b && b._ok) return b; } return null; };

  /* ---------- Worlds: Unreal Engine scenes as portals, the showreel on a screen ---------- */
  const video = (name) => { const v = document.createElement('video'); v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'none'; v.crossOrigin = 'anonymous'; v.dataset.src = SHOW(name); const t = new THREE.VideoTexture(v); t.colorSpace = THREE.SRGBColorSpace; return { v, t }; };
  const reel = video('unreal-showreel.mp4');
  const reelScreen = new THREE.Mesh(new THREE.PlaneGeometry(8, 4.5), new THREE.MeshBasicMaterial({ map: reel.t, color: col('#c8c4c0'), transparent: true, opacity: 0, depthWrite: false })); reelScreen.position.set(0, 4.3, -5); scene.add(reelScreen);
  const loader = new THREE.TextureLoader();
  const PORTALS = [['unreal-canyon.webp', 'A canyon at dusk'], ['unreal-arena.webp', 'An arena, mid-fight'], ['environment.webp', 'A forest clearing']].map(([img, name], k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.025), new THREE.MeshBasicMaterial({ color: col('#d0ccc8'), transparent: true, opacity: 0, depthWrite: false }));
    loader.load(SHOW(img), tx => { tx.colorSpace = THREE.SRGBColorSpace; m.material.map = tx; m.material.needsUpdate = true; });
    scene.add(m); const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(3.7, 2.12)), new THREE.LineBasicMaterial({ color: 0xffc29a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending })); scene.add(frame);
    return { m, frame, name, k, focus: 0 };
  });
  let focusPortal = -1;

  /* ---------- Video and sound: two music videos, three songs, a room that pulses ---------- */
  const mvA = video('palestine.mp4'), mvB = video('xiao-mi.mp4');
  const mvScreens = [[mvA, 'For Palestine', 'an AI-generated music video I made'], [mvB, 'A song for Xiao Mi', 'made to comfort a close friend']].map(([vv, name, sub], k) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.6), new THREE.MeshBasicMaterial({ map: vv.t, color: col('#bdb8b4'), transparent: true, opacity: 0, depthWrite: false })); scene.add(m); return { vv, m, name, sub }; });
  const RN = small ? 700 : 1400, ringP = new Float32Array(RN * 3), ringA = [];
  for (let i = 0; i < RN; i++) ringA.push([r() * Math.PI * 2, r(), r()]);
  const ringGeo = new THREE.BufferGeometry(); ringGeo.setAttribute('position', new THREE.BufferAttribute(ringP, 3)); ringGeo.setAttribute('aR', new THREE.Float32BufferAttribute(ringA.map(a => a[1]), 1));
  const ringMat = additive({ uniforms: { uPx: { value: 1000 }, uO: { value: 0 }, uAmp: { value: 0 } }, vertexShader: 'attribute float aR; uniform float uPx, uO, uAmp; varying vec3 vColor; varying float vAlpha; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = max(1., uPx * (.04 + aR * .04) * (1. + uAmp * 2.) / -mv.z); vColor = mix(vec3(1., .5, .45), vec3(1., .82, .5), aR) * (1. + uAmp); vAlpha = uO * .8; }', fragmentShader: POINT_FRAG });
  const ring = new THREE.Points(ringGeo, ringMat); ring.frustumCulled = false; scene.add(ring);
  let audio = null, playing = -1, analyser = null, ampData = null, amp = 0, actx = null;
  const sources = new Map();
  function duck(on) { if (score.ctx && score.master) { const t0 = score.ctx.currentTime; score.master.gain.cancelScheduledValues(t0); score.master.gain.setTargetAtTime(score.muted ? 0 : on ? .08 : .75, t0, .3); } }
  function playSong(k) {
    if (playing === k) { audio.pause(); playing = -1; duck(false); syncSongs(); return; }
    if (audio) audio.pause();
    mvScreens.forEach(s => { s.vv.v.muted = true; });
    audio = audio || new Audio(); audio.crossOrigin = 'anonymous'; audio.src = SHOW(`${SONGS[k][1]}.mp3`); audio.loop = true;
    try {
      actx = actx || score.ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (!sources.has(audio)) { const src = actx.createMediaElementSource(audio); analyser = actx.createAnalyser(); analyser.fftSize = 256; ampData = new Uint8Array(analyser.frequencyBinCount); src.connect(analyser).connect(actx.destination); sources.set(audio, src); }
      actx.resume();
    } catch (e) { analyser = null; }
    audio.play().catch(() => {}); playing = k; duck(true); syncSongs(); score.sfx('pop');
  }
  function stopAll() { if (audio) audio.pause(); if (playing >= 0) duck(false); playing = -1; mvScreens.forEach(s => { s.vv.v.muted = true; }); syncSongs(); }

  /* ---------- Away from the screen ---------- */
  const ballTex = (() => { const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d'); ['#f7d23e', '#1f5fbf', '#f4efe0'].forEach((cc, i) => { g.fillStyle = cc; g.fillRect(0, i * 256 / 3, 512, 256 / 3 + 1); }); g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 4; for (let x = 0; x < 512; x += 128) { g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 60, 80, x - 60, 170, x, 256); g.stroke(); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(.42, 40, 28), new THREE.MeshBasicMaterial({ map: ballTex, transparent: true, opacity: 0 })); scene.add(ball);
  const shuttle = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: col('#f4efe0'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 })); shuttle.scale.setScalar(.5); scene.add(shuttle);
  const WR = 3, waves = Array.from({ length: WR }, () => { const m = new THREE.Mesh(new THREE.RingGeometry(.95, 1, 64), new THREE.MeshBasicMaterial({ color: col('#7fd6ff'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; scene.add(m); return m; });
  let by = 1.6, vy = 0, bumpAt = -9;
  const SPORT = new THREE.Vector3(0, 0, 0);

  /* ---------- Words, controls ---------- */
  const L = (html, cls) => ui.label('make', html, cls);
  const mhLab = L('<span class="tag"><b>A digital human I designed</b><small>MetaHuman · Unreal Engine 5</small></span>', 'plain chipname-lab');
  const portalLabs = PORTALS.map(o => L(`<span class="tag">${o.name}</span>`, 'plain portal-lab'));
  const reelLab = L('<span class="tag"><b>My Unreal Engine 5 game</b><small>showreel · environment design, interactive scenes, digital characters</small></span>', 'plain chipname-lab');
  const mvLabs = mvScreens.map(s => L(`<span class="tag"><b>${s.name}</b><small>${s.sub} · click for sound</small></span>`, 'plain chipname-lab'));
  const chainLab = L('<span class="tag"><i>idea, story</i> me → <i>lyrics</i> ReMi → <i>voices, music</i> Chirp → <i>timed lyrics</i> Gladia → <i>the cut</i> me<small>no human singers, no microphone</small></span>', 'plain chain-lab');
  const sportLabs = [['volleyball', -4, 4.7], ['badminton', 3.7, 4.3], ['swimming', 0, .55], ['Spurs on the weekend', 4.4, .7]].map(([n, x, y]) => [L(`<span class="tag">${n}</span>`, 'plain sport-lab2'), new THREE.Vector3(x, y, 0)]);
  const songs = document.createElement('div'); songs.className = 'race-ctl song-ctl';
  songs.innerHTML = `<span>Songs I made with AI voices</span><div class="rc-row">${SONGS.map((s, k) => `<button type="button" data-s="${k}"><i class="sg-ico" aria-hidden="true">▶</i>${s[0]}</button>`).join('')}</div><small>Every voice and instrument is AI-generated. The idea, the story and the cut are mine.</small>`;
  ctx.$('#scene-ui').append(songs);
  function syncSongs() { songs.querySelectorAll('[data-s]').forEach((b, k) => { b.classList.toggle('sel', k === playing); b.querySelector('.sg-ico').textContent = k === playing ? '❚❚' : '▶'; }); }
  songs.querySelectorAll('[data-s]').forEach(b => b.addEventListener('click', () => playSong(+b.dataset.s)));

  /* ---------- Camera ---------- */
  const cpos = new THREE.Vector3(), cat = new THREE.Vector3(), off = new THREE.Vector3(), turn = new THREE.Vector2(), tmp = new THREE.Vector3();
  const S = (a, b) => [new THREE.Vector3(...a), new THREE.Vector3(...b)];
  function shot(p) {
    const fitW = (w, h) => Math.max(w / camera.aspect, h) / (2 * Math.tan(THREE.MathUtils.degToRad(21)));
    const OPEN = S([0, 4.3, 9.5], [0, 4.1, -1]), IMG = S([0, 4.1, -1 + fitW(10.2, 6.6)], [0, 4.1, -1]);
    const WORLD = tall ? S([0, 4.6, fitW(8.6, 14)], [0, 3.6, -3]) : S([0, 4.4, 9.5], [0, 3.8, -3]);
    const SOUND = tall ? S([0, 4.4, fitW(5.6, 13)], [0, 3.8, -3]) : S([0, 4.2, 10], [0, 3.8, -3]);
    const SPORTV = tall ? S([0, 2.4, fitW(7.6, 9)], [0, 1.8, 0]) : S([0, 2.6, 10], [0, 1.9, 0]);
    const FAR = S([0, 5, 26], [0, 3.4, -2]);
    const seq = [[0, OPEN], [.05, OPEN], [.1, IMG], [.3, IMG], [.35, WORLD], [.5, WORLD], [.55, SOUND], [.72, SOUND], [.76, SPORTV], [.88, SPORTV], [1, FAR]];
    let i = 0; while (i < seq.length - 2 && p > seq[i + 1][0]) i++;
    const [pa, A] = seq[i], [pb, B] = seq[i + 1], e = easeInOut(clamp((p - pa) / Math.max(1e-4, pb - pa)));
    cpos.lerpVectors(A[0], B[0], e); cat.lerpVectors(A[1], B[1], e);
    const Kc = tall ? Math.min(2.3, 1.05 / camera.aspect) : 1, K = i === 0 ? Kc : i === 1 ? lerp(Kc, 1, e) : 1;   // the opening matches Curiosity's last frame
    off.subVectors(cpos, cat).multiplyScalar(K); cpos.copy(cat).add(off);
    if (focusPortal >= 0 && p > .35 && p < .5) { const fp = PORTALS[focusPortal].m.position; cpos.lerp(tmp.set(fp.x, fp.y, fp.z + 3.2), .85); cat.lerp(fp, .85); }
  }

  let localP = 0, wasIn = false;
  const playVid = (vv, on) => { if (on) { if (!vv.v.src) vv.v.src = vv.v.dataset.src; if (vv.v.paused) vv.v.play().catch(() => {}); } else if (!vv.v.paused) vv.v.pause(); };
  return {
    id: 'make', scene, camera, extra: {},
    captions: [
      { at: [.02, .1], html: 'Models make more than words: pictures, worlds, music. These are things <b>I</b> make when nobody is asking.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.1, .2], html: 'A digital human I designed in Unreal Engine’s <b>MetaHuman</b>. The camera moves in.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.2, .3], html: 'Skin, brows and lashes hold up all the way to the eye.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.33, .5], html: 'Worlds you can walk through: my <b>Unreal Engine 5</b> game, from environments to interactive scenes and characters.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.35, .5], html: `<span class="hint-dot"></span>${coarse ? 'Tap' : 'Click'} a scene to step closer`, x: 50, y: 92, cls: 'hint', align: 'center', m: { x: 50, y: 88 } },
      { at: [.53, .62], html: 'When something is close to my heart, I make it a <b>song</b>: AI voices and instruments, my idea, story and final cut.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.62, .73], html: 'A song to comfort a friend, Xiao Mi, and a music video for Palestine. Play one; the room moves with it.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.75, .88], html: 'And away from the screen: <b>volleyball</b>, badminton, swimming, and Spurs on the weekend.', x: 7, y: 12, cls: 'note', m: { x: 50, y: 11, align: 'center' } },
      { at: [.76, .88], html: `<span class="hint-dot"></span>${coarse ? 'Tap' : 'Click'} the ball to bump it`, x: 50, y: 92, cls: 'hint', align: 'center', m: { x: 50, y: 88 } },
      { at: [.9, 1.05], html: 'That is the whole life of a neural network, and mine inside it.', x: 50, y: 14, cls: 'note center-note', align: 'center' }
    ],
    resize(aspect) { camera.aspect = aspect; camera.updateProjectionMatrix(); tall = aspect < 1; },
    init() { this.resize(innerWidth / innerHeight); },
    show(on) { if (!on) { songs.classList.remove('on'); stopAll(); [reel, mvA, mvB].forEach(vv => playVid(vv, false)); document.body.style.cursor = ''; focusPortal = -1; } },
    pointer(type) {
      const p = localP;
      const hit = (m) => { const box = new THREE.Box3().setFromObject(m), a = ui.screen(box.min, camera), b = ui.screen(box.max, camera); return pointer.x > Math.min(a.x, b.x) && pointer.x < Math.max(a.x, b.x) && pointer.y > Math.min(a.y, b.y) && pointer.y < Math.max(a.y, b.y); };
      let cur = '';
      if (p > .35 && p < .5) { const k = PORTALS.findIndex(o => hit(o.m)); if (k >= 0) cur = 'zoom-in'; if (type === 'down') { focusPortal = k >= 0 && k !== focusPortal ? k : -1; if (k >= 0) score.sfx('whoosh', { up: true, dur: .5 }); } }
      else if (p > .55 && p < .73) { const k = mvScreens.findIndex(s => hit(s.m)); if (k >= 0) cur = 'pointer'; if (type === 'down' && k >= 0) { const s = mvScreens[k], unmute = s.vv.v.muted; stopAll(); mvScreens.forEach(o => { o.vv.v.muted = true; }); s.vv.v.muted = !unmute; if (unmute) { duck(true); playing = -2; } } }
      else if (p > .75 && p < .88) { const s = ui.screen(ball.position, camera), near = Math.hypot(s.x - pointer.x, s.y - pointer.y) < 70; if (near) cur = 'pointer'; if (type === 'down' && near && ctx.time - bumpAt > .25) { vy = Math.min(6.2, Math.max(vy, 0) + 5.4); bumpAt = ctx.time; score.sfx('pop'); } }
      document.body.style.cursor = cur;
    },
    update(p, info) {
      localP = p;
      const t = info.time, act = info.active, dt = Math.min(info.dt, .05), px = pixelScale(renderer, camera);
      [bMat, ringMat].forEach(m => { m.uniforms.uPx.value = px; }); bMat.uniforms.uT.value = t; dust.mat.uniforms.uTime.value = t; dust.mat.uniforms.uPx.value = px;
      if (p > .0 && act) loadFrames();
      const inView = act || info.weight > .3;
      if (!inView && wasIn) { stopAll(); }
      wasIn = inView;

      /* The brain bursts into the picture. */
      const burst = easeInOut(clamp((p - .03) / .07)), spin = t * .25 * (1 - burst);
      if (p < .14) for (let i = 0; i < BN; i++) {
        const x = brain[i * 3] * 2.6, y = brain[i * 3 + 1] * 2.6, z = brain[i * 3 + 2] * 2.6, cx = x * Math.cos(spin) + z * Math.sin(spin), cz = -x * Math.sin(spin) + z * Math.cos(spin);
        const fx = BC.x + cx, fy = BC.y + y, fz = BC.z + cz, k = clamp(burst * 1.4 - rr[i] * .4), e = easeOut(k);
        bp[i * 3] = lerp(fx, tgt[i * 3], e) + Math.sin(e * Math.PI) * (rr[i] - .5) * 3; bp[i * 3 + 1] = lerp(fy, tgt[i * 3 + 1], e); bp[i * 3 + 2] = lerp(fz, tgt[i * 3 + 2], e) + Math.sin(e * Math.PI) * 2;
      }
      bGeo.attributes.position.needsUpdate = true; bMat.uniforms.uO.value = 1 - sstep(.09, .13, p);

      /* MetaHuman frames, driven by the scroll. */
      const mhO = sstep(.08, .12, p) * (1 - sstep(.3, .35, p));
      mh.material.opacity = mhO; mh.visible = mhO > .01;
      if (mhO > .01) { const fi = Math.round(clamp((p - .1) / .2) * (FRAMES - 1)), im = nearestFrame(fi); if (im && im !== mhTex.image) { mhTex.image = im; mhTex.needsUpdate = true; } shownFrame = fi; }

      /* Worlds. */
      const worldO = sstep(.31, .36, p) * (1 - sstep(.5, .55, p));
      reelScreen.material.opacity = worldO; reelScreen.visible = worldO > .01; playVid(reel, worldO > .01 && inView);
      PORTALS.forEach((o, k) => {
        const a = (k - 1) * (tall ? .0 : .55), base = tall ? new THREE.Vector3(0, 6.6 - k * 2.4, -1) : new THREE.Vector3(Math.sin(a) * 6.2, 2.6 + (k === 1 ? -.6 : 0), -3 + Math.cos(a) * 3.4);
        o.focus += ((focusPortal === k ? 1 : 0) - o.focus) * Math.min(1, dt * 5);
        o.m.position.copy(base); o.m.lookAt(camera.position); o.m.scale.setScalar(1 + o.focus * .5);
        o.frame.position.copy(o.m.position); o.frame.quaternion.copy(o.m.quaternion); o.frame.scale.copy(o.m.scale);
        o.m.material.opacity = worldO; o.frame.material.opacity = worldO * (.4 + o.focus * .5); o.m.visible = worldO > .01;
      });
      if (worldO < .01) focusPortal = -1;
      if (tall) reelScreen.position.set(0, 9.2, -3); else reelScreen.position.set(0, 4.6, -6);
      reelScreen.scale.setScalar(tall ? .7 : 1);

      /* Video and sound: the room moves with the music. */
      const soundO = sstep(.52, .57, p) * (1 - sstep(.72, .76, p));
      mvScreens.forEach((s, k) => { s.m.position.set(tall ? 0 : (k ? 3 : -3), tall ? 6.3 - k * 3 : 4.4, -3); s.m.material.opacity = soundO; s.m.visible = soundO > .01; playVid(s.vv, soundO > .01 && inView); });
      if (analyser && playing >= 0) { analyser.getByteFrequencyData(ampData); let sum = 0; for (let i = 0; i < 24; i++) sum += ampData[i]; amp += (sum / 24 / 255 - amp) * .3; } else amp *= .9;
      if (soundO > .001) for (let i = 0; i < RN; i++) { const [a0, aR, h] = ringA[i], a = a0 + t * (.1 + aR * .15), rad = 4.4 + aR * 1.6 + amp * 1.2 * Math.sin(a * 6 + t * 4); ringP.set([Math.cos(a) * rad * (tall ? .55 : 1.3), 4.2 + Math.sin(a) * rad * .55 + (h - .5) * .6, -3.6 + Math.sin(a) * .8], i * 3); }
      ringGeo.attributes.position.needsUpdate = true; ringMat.uniforms.uO.value = soundO; ringMat.uniforms.uAmp.value = amp;
      if (soundO < .01 && playing !== -1 && p > .78) stopAll();

      /* Away from the screen: a ball to bump, a shuttle, the pool. */
      const sportO = sstep(.74, .78, p) * (1 - sstep(.9, .95, p));
      vy -= 9.8 * dt; by += vy * dt; if (by < .45) { by = .45; vy = Math.abs(vy) > 1 ? -vy * .55 : 0; }
      if (by > 4.2) { by = 4.2; vy = Math.min(vy, 0); }
      ball.position.set(tall ? -1.3 : -4, by, 0); ball.rotation.x += dt * (1 + Math.abs(vy)); ball.material.opacity = sportO; ball.visible = sportO > .01;
      const sf = (t * .35) % 1; shuttle.position.set(tall ? lerp(-2, 2, sf) : lerp(1.4, 5.4, sf), (tall ? 3.6 : 2.2) + Math.sin(sf * Math.PI) * 1.6, 0); shuttle.material.opacity = sportO * .8;
      waves.forEach((w, k) => { const f = (t * .4 + k / WR) % 1; w.position.set(tall ? 1.2 : 0, .01, tall ? 2.2 : 1.4); w.scale.setScalar(.3 + f * 2.2); w.material.opacity = sportO * (1 - f) * .6; });

      /* Words. */
      const show = (lab, pos, on) => ui.place(lab, pos, camera, act && on);
      show(mhLab, new THREE.Vector3(0, BC.y - 2.9, -1), mhO > .5 && p < .2);
      PORTALS.forEach((o, k) => show(portalLabs[k], o.m.position.clone().add(tmp.set(0, -1.25 * o.m.scale.x, 0)), worldO > .5));
      show(reelLab, reelScreen.position.clone().add(tmp.set(0, 2.5 * reelScreen.scale.x + .2, 0)), worldO > .5 && !tall);
      mvScreens.forEach((s, k) => show(mvLabs[k], s.m.position.clone().add(tmp.set(0, -1.55, 0)), soundO > .5));
      show(chainLab, new THREE.Vector3(0, tall ? 2.6 : 1.9, -3), soundO > .5 && p > .6 && !tall);
      sportLabs.forEach(([lab, v], k) => show(lab, tall ? [new THREE.Vector3(-1.3, 4.7, 0), new THREE.Vector3(1.4, 5.6, 0), new THREE.Vector3(1.2, .7, 2.2), new THREE.Vector3(0, -.6, 0)][k] : v, sportO > .5));
      songs.classList.toggle('on', act && p > .55 && p < .73);

      /* Camera. */
      shot(p);
      const want = pointer.inside && !coarse ? pointer.ndc : null;
      turn.x += ((want ? want.x : 0) - turn.x) * Math.min(1, dt * 2); turn.y += ((want ? want.y : 0) - turn.y) * Math.min(1, dt * 2);
      off.subVectors(cpos, cat).applyAxisAngle(new THREE.Vector3(0, 1, 0), -turn.x * .05 * (mhO > .5 ? .2 : 1)); off.y += turn.y * .3 * (mhO > .5 ? .2 : 1);
      camera.position.copy(cat).add(off); camera.lookAt(cat);
    }
  };
}
