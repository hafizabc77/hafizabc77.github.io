/* Interactive project demos, all hand-written on canvas and the DOM:
   the AutoDeploy scroll story and lab, the LHAASO-WCDA event display,
   the FPGA pipeline and the local assistant. script.js starts each one through safe(). */
(function () {
  'use strict';
  const LABS = {};
  window.LABS = LABS;

  const FONT = '"DM Mono","PingFang SC","Microsoft YaHei",ui-monospace,monospace';
  const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  function seeded(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /* Run only while on screen. */
  function whenVisible(el, onChange) {
    new IntersectionObserver(([entry]) => onChange(entry.isIntersecting), { threshold: 0.02 }).observe(el);
  }

  /* ==========================================================================
     AutoDeploy story: one set of dots morphs through the whole pipeline as you scroll.
     Every labelled number comes from Chapter 9 of the thesis.
     ========================================================================== */
  const AD_NODES = [
    ['ParT', .50, .46, 1], ['ParticleNet', .16, .18, 1], ['ResNet50', .86, .14, 1],
    ['TensorRT', .32, .30, 0], ['OpenVINO', .70, .28, 0], ['hls4ml', .13, .58, 0], ['Vitis AI', .40, .86, 0], ['CANN', .70, .86, 0],
    ['Static PTQ', .60, .64, 4], ['Magnitude pruning', .52, .12, 4],
    ['Tesla V100', .30, .62, 2], ['Alveo U200', .13, .90, 2], ['Xeon Platinum', .90, .46, 2], ['Ascend NPU', .90, .78, 2],
    ['Failure', .55, .97, 5]
  ];
  const AD_EDGES = [[0, 3], [0, 10], [0, 8], [0, 7], [0, 9], [1, 5], [1, 3], [1, 11], [2, 9], [2, 4], [2, 12], [3, 8], [3, 10], [4, 12], [5, 11], [6, 11], [6, 8], [7, 13], [7, 14], [0, 13], [4, 8]];
  const AD_STAGES = ['model_fingerprint', 'hardware_environment', 'baseline_profiling', 'objectives', 'patterns', 'compatibility', 'workload', 'security_policy', 'kg_signals', 'rl_features', 'request', 'sustainability', 'adversarial'];
  const AD_REQUIRED = new Set(['model_fingerprint', 'hardware_environment', 'objectives', 'compatibility', 'request']);
  const AD_PAL = ['#f3efdc', '#d8bb73', '#d98a5f', 'rgba(183,197,184,.3)', '#84c7a2', '#ffffff', 'rgba(243,239,220,.4)'];
  const AD_TEXT = {
    manual: ['Manual: ~3 weeks, ~80 expert hours, 5–10 configs', '人工：约 3 周，约 80 专家工时，5–10 个配置'],
    auto: ['AutoDeploy, to scale: ~8 hours, ~2 expert hours, 50–100 configs', 'AutoDeploy（等比例）：约 8 小时，约 2 专家工时，50–100 个配置'],
    day: ['day', '第'],
    model: ['ParT · 2.14 M parameters', 'ParT · 214 万参数'],
    blocks: ['8 particle + 2 class attention blocks', '8 个粒子注意力 + 2 个类注意力模块'],
    required: ['gold = required stage', '金色 = 必需阶段'],
    latency: ['latency, ms (log scale)', '延迟，毫秒（对数）'],
    accuracy: ['accuracy, %', '精度，%'],
    masked: ['masked before any compute is spent', '在消耗算力之前被掩蔽'],
    legend: ['Labelled points are measured on the V100. The cloud illustrates the search.', '带标注的点为 V100 实测值；点云仅为搜索过程示意。'],
    first: ['first attempt', '首次成功'],
    repaired: ['repaired or retried', '修复或重试'],
    rolled: ['rolled back, plan replaced', '回滚并替换方案'],
    iso: ['isolation tier by step', '各步骤隔离级别'],
    host: ['host', '主机'],
    est: ['HLS estimate', 'HLS 估算'],
    meas: ['measured', '实测'],
    loop: ['it gets better with use', '越用越好'],
    npu: ['supported, not benchmarked', '已支持，未纳入基准测试'],
    via: ['via CANN', '经由 CANN']
  };
  const AD_TITLES = [
    ['Manual work vs AutoDeploy, drawn to scale', '人工部署与 AutoDeploy，等比例对比'],
    ['Model in, one trusted report out', '输入模型，输出一份可信报告'],
    ['The knowledge graph, with names from my Neo4j database', '知识图谱：节点名称来自我的 Neo4j 数据库'],
    ['Every dot is a deployment recipe', '每个点都是一个部署方案'],
    ['Every square is one real step', '每个方块都是真实执行的一步'],
    ['Same config, four kinds of chip', '同一份配置，四类芯片'],
    ['The loop that makes it smarter', '让系统越来越聪明的闭环']
  ];

  LABS.autoDeploy = function (S) {
    const { $, $$, clamp, frameTasks, measureTasks, state, currentLang, FX, reducedMotion, docTop } = S;
    const section = $('#autodeploy'), canvas = $('#dep-canvas');
    if (!section || !canvas) return;
    if (!FX || reducedMotion) { canvas.remove(); return; }
    const ctx = canvas.getContext('2d');
    const small = innerWidth < 900;
    const N = small ? 380 : 640, STATES = 7;
    const rnd = seeded(11);
    const r1 = Float32Array.from({ length: N }, rnd), r2 = Float32Array.from({ length: N }, rnd), r3 = Float32Array.from({ length: N }, rnd);
    const targets = Array.from({ length: STATES }, () => new Float32Array(N * 4));
    const steps = $$('.dep-step', section), railItems = $$('.dep-rail li', section), bar = $('.dep-progress i', section);
    let W = 0, H = 0, dpr = 1, R = { x: 0, y: 0, w: 1, h: 1 }, top = 0, range = 1, visible = false, active = -1, ring = { x: 0, y: 0, r: 1 };
    let nodes = [];
    // Shared by the dots and the drawing, so both line up.
    const chipLayout = () => {
      const kinds = [['cpu', 0], ['gpu', 1], ['fpga', 4], ['npu', 2]];
      return kinds.map(([kind, color], i) => {
        if (small) { const s = Math.min(R.w * .26, R.h * .26); return { kind, color, s, x: R.x + R.w * (.25 + (i % 2) * .5), y: R.y + R.h * (.2 + Math.floor(i / 2) * .5) }; }
        const s = Math.min(R.w * .17, R.h * .3);
        return { kind, color, s, x: R.x + R.w * (.125 + i * .25), y: R.y + R.h * .3 };
      });
    };
    const T = key => AD_TEXT[key][currentLang() === 'zh' ? 1 : 0];
    const SEGMENTS = [[0, 1.1, 0], [1.1, 2.9, 3], [2.9, 3.1, 0], [3.1, 3.8, 2], [3.8, 5, 3], [5, 5.8, 0], [5.8, 7, 3], [7, 8.8, 0], [8.8, 10.1, 3], [10.1, 10.8, 2], [10.8, 12, 0], [12, 13, 3], [13, 13.8, 2], [13.8, 15, 0], [15, 16.6, 3], [16.6, 17.6, 0], [17.6, 18, 3], [18, 21, 0]];

    const lx = v => R.x + (Math.log10(v) - Math.log10(0.3)) / (Math.log10(5.5) - Math.log10(0.3)) * R.w;
    const ly = v => R.y + R.h * .08 + (94.3 - v) / 1.6 * R.h * .72;
    const frontier = l => (l < .45 ? 93.5 : l < .82 ? 93.5 + (l - .45) / .37 * .2 : l < 3.8 ? 93.7 + (l - .82) / 2.98 * .3 : 94);

    function build() {
      const set = (s, i, x, y, size, color) => { const t = targets[s], k = i * 4; t[k] = x; t[k + 1] = y; t[k + 2] = size; t[k + 3] = color; };
      const dot = small ? 2.2 : 2.8;
      // 0: the manual workflow, day by day.
      const laneY = R.y + R.h * .36, laneH = R.h * .17;
      for (let i = 0; i < N; i++) {
        const day = (i + r1[i]) / N * 21;
        const seg = SEGMENTS.find(s => day < s[1]) || SEGMENTS[SEGMENTS.length - 1];
        set(0, i, R.x + day / 21 * R.w, laneY + (r2[i] - .5) * laneH, dot, seg[2]);
      }
      // 1: model blocks on the left, the resulting contract on the right.
      const blockW = R.w * (small ? .3 : .28), blockH = R.h * .068;
      const splitAt = Math.floor(N * .46);
      for (let i = 0; i < splitAt; i++) {
        const b = i % 10;
        set(1, i, R.x + r1[i] * blockW, R.y + R.h * .1 + b * (blockH + R.h * .014) + r2[i] * blockH, dot * .85, b < 8 ? 1 : 4);
      }
      const rows = 15, rx = R.x + R.w * (small ? .7 : .72), rw = R.w * (small ? .3 : .28);
      const lengths = [.3, .55, .85, .7, .4, .9, .75, .6, .35, .8, .95, .5, .7, .45, .25], indent = [0, .08, .16, .16, .08, .16, .24, .24, .16, .08, .16, .16, .08, .08, 0];
      for (let i = splitAt; i < N; i++) {
        const row = (i - splitAt) % rows;
        set(1, i, rx + (indent[row] + r1[i] * lengths[row] * (1 - indent[row])) * rw, R.y + R.h * .1 + row * (R.h * .78 / rows), dot * .78, 0);
      }
      // 2: knowledge graph.
      nodes = AD_NODES.map(n => ({ label: n[0], x: R.x + n[1] * R.w, y: R.y + R.h * (.03 + n[2] * .94), color: n[3] }));
      const edgeDots = Math.floor(N * .28), rad = Math.min(R.w, R.h) * .07;
      for (let i = 0; i < N; i++) {
        if (i < edgeDots) {
          const e = AD_EDGES[i % AD_EDGES.length], a = nodes[e[0]], b = nodes[e[1]], t = r1[i];
          set(2, i, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, dot * .55, 3);
        } else {
          const n = nodes[i % nodes.length], ang = r1[i] * 6.283, d = Math.pow(r2[i], .7) * rad * (n.label === 'ParT' ? 1.35 : 1);
          set(2, i, n.x + Math.cos(ang) * d, n.y + Math.sin(ang) * d * .86, dot * .85, n.color);
        }
      }
      // 3: search cloud and Pareto frontier.
      for (let i = 0; i < N; i++) {
        const kind = r3[i];
        if (kind < .14) { // Masked before evaluation.
          set(3, i, R.x + r1[i] * R.w, R.y + R.h * (.9 + r2[i] * .07), dot * .7, 2);
        } else if (kind < .28) { // Frontier.
          const l = Math.pow(10, Math.log10(.45) + r1[i] * (Math.log10(3.8) - Math.log10(.45)));
          set(3, i, lx(l), ly(frontier(l)) + (r2[i] - .5) * 2, dot, 1);
        } else { // Dominated candidates.
          const l = Math.pow(10, Math.log10(.5) + r1[i] * (Math.log10(5) - Math.log10(.5)));
          const room = frontier(l) - .05 - 92.9;
          set(3, i, lx(l), ly(frontier(l) - .05 - Math.pow(r2[i], 1.15) * room), dot * .85, 6);
        }
      }
      // 4: about 320 steps: 64% first attempt, 24% repaired, 12% rolled back. Failures are more common early.
      const stat = new Uint8Array(320);
      const pr = seeded(5);
      const place = (count, value, power) => { let left = count, guard = 0; while (left > 0 && guard++ < 9000) { const k = Math.floor(Math.pow(pr(), power) * 320); if (!stat[k]) { stat[k] = value; left--; } } };
      place(38, 2, 1.9);
      place(77, 1, 1.25);
      const cols = small ? 32 : 32, gridRows = 10;
      const cell = Math.min(R.w / cols, R.h * .62 / gridRows);
      const gx = R.x + (R.w - cell * cols) / 2, gy = R.y + R.h * .04;
      for (let i = 0; i < N; i++) {
        if (i < 320) set(4, i, gx + (i % cols) * cell + cell * .14, gy + Math.floor(i / cols) * cell + cell * .14, cell * .72, stat[i] === 2 ? 2 : stat[i] === 1 ? 1 : 0);
        else set(4, i, gx + r1[i] * cell * cols, gy + r2[i] * cell * gridRows, 0, 3);
      }
      // 5: four chips. Dots light the die of each one.
      chipLayout().forEach((c, n) => {
        for (let i = n; i < N; i += 4) {
          const a = r1[i], b = r2[i], q = c.s * .4;
          let x, y;
          if (c.kind === 'cpu') { x = (Math.floor(a * 3) + .2 + r3[i] * .6) / 3; y = (Math.floor(b * 2) + .2 + r3[(i + 5) % N] * .6) / 2; }
          else if (c.kind === 'gpu') { x = (Math.floor(a * 8) + .5) / 8; y = (Math.floor(b * 8) + .5) / 8; }
          else if (c.kind === 'fpga') { if (r3[i] < .5) { x = (Math.floor(a * 5) + .5) / 5; y = b; } else { x = a; y = (Math.floor(b * 5) + .5) / 5; } }
          else { const e = Math.floor(a * 12), t = b; const E = [[0, 0, 1, 0], [1, 0, 1, 1], [1, 1, 0, 1], [0, 1, 0, 0]]; const k = E[e % 4], back = e >= 4 && e < 8, link = e >= 8;
            if (link) { const corner = E[e % 4]; x = corner[0] * .7 + t * .3; y = corner[1] * .7 + .3 - t * .3; }
            else { x = (k[0] + (k[2] - k[0]) * t) * .7 + (back ? .3 : 0); y = (k[1] + (k[3] - k[1]) * t) * .7 + (back ? 0 : .3); } }
          set(5, i, c.x - q + x * q * 2, c.y - q + y * q * 2, dot * .8, c.color);
        }
      });
      // 6: the closed loop.
      ring = { x: R.x + R.w * .5, y: R.y + R.h * .48, r: Math.min(R.w * .44, R.h * .4) };
      for (let i = 0; i < N; i++) {
        const ang = i / N * 6.283, wob = (r1[i] - .5) * ring.r * .1;
        set(6, i, ring.x + Math.cos(ang) * (ring.r + wob), ring.y + Math.sin(ang) * (ring.r + wob), dot * .85, i % 5 === 0 ? 0 : 1);
      }
    }

    function label(text, x, y, color, size, align) {
      let s = size || (small ? 10 : 12);
      ctx.font = `${s}px ${FONT}`;
      if (!align || align === 'left') { // Shrink a left-aligned label that would run off the right edge.
        const room = W - x - 8, width = ctx.measureText(text).width;
        if (width > room && room > 40) { s = Math.max(7, s * room / width); ctx.font = `${s}px ${FONT}`; }
      }
      ctx.textAlign = align || 'left';
      ctx.fillStyle = color || '#c9d0cc';
      ctx.fillText(text, x, y);
    }

    const OVERLAYS = [
      now => { // Timeline
        const laneY = R.y + R.h * .36, laneH = R.h * .17;
        label(T('manual'), R.x, laneY - laneH * .85, '#f3efdc');
        [0, 7, 14, 21].forEach(d => {
          const x = R.x + d / 21 * R.w;
          ctx.fillStyle = 'rgba(243,239,220,.28)'; ctx.fillRect(x, laneY + laneH * .6, 1, 7);
          label(`${d}d`, x, laneY + laneH * .6 + 20, '#9aa5a1', small ? 9 : 11, d === 21 ? 'right' : 'left');
        });
        const y2 = laneY + laneH * 1.65;
        label(T('auto'), R.x, y2 - 10, '#d8bb73');
        // To scale: 8 hours out of 21 days.
        const w8 = Math.max(4, R.w * 8 / (21 * 24));
        ctx.fillStyle = '#d8bb73'; ctx.fillRect(R.x, y2, w8, 14);
        const pulse = (now * .7) % 1;
        ctx.fillStyle = `rgba(216,187,115,${(1 - pulse) * .35})`; ctx.fillRect(R.x, y2 - pulse * 6, w8 + pulse * 26, 14 + pulse * 12);
      },
      now => { // Parser
        const mid = R.x + R.w * .5, colW = R.w * (small ? .3 : .3), x0 = mid - colW / 2;
        const scan = Math.floor(now * 2.6) % 13;
        const rowH = R.h * .78 / 13;
        AD_STAGES.forEach((name, i) => {
          const y = R.y + R.h * .1 + i * rowH + rowH * .6, req = AD_REQUIRED.has(name), on = i === scan;
          if (on) { ctx.fillStyle = 'rgba(243,239,220,.14)'; ctx.fillRect(x0 - 6, y - rowH * .72, colW + 12, rowH * .96); }
          label(small ? name.replace('_environment', '_env').replace('baseline_', 'base_') : name, x0, y, on ? '#f3efdc' : req ? '#d8bb73' : '#a7b0ac', small ? 8.5 : 11);
        });
        label(T('model'), R.x, R.y + R.h * .05, '#d8bb73', small ? 9.5 : 12);
        label('StateContract', R.x + R.w, R.y + R.h * .05, '#f3efdc', small ? 9.5 : 12, 'right');
        if (!small) label(T('blocks'), R.x, R.y + R.h * .93, '#9aa5a1', 11);
        if (!small) label(T('required'), mid, R.y + R.h * .93, '#d8bb73', 11, 'center');
        // Model layers, drawn as real blocks.
        const blockW = R.w * (small ? .3 : .28), blockH = R.h * .068;
        ctx.lineWidth = 1;
        for (let b = 0; b < 10; b++) {
          ctx.strokeStyle = b < 8 ? 'rgba(216,187,115,.42)' : 'rgba(132,199,162,.5)';
          ctx.strokeRect(R.x - 3, R.y + R.h * .1 + b * (blockH + R.h * .014) - 3, blockW + 6, blockH + 6);
        }
        // Evidence crossing from the model into the analyzers, and from the analyzers into the contract.
        for (let i = 0; i < 14; i++) {
          const f = (now * .32 + i / 14) % 1;
          const gutter = i % 2 ? [R.w * .29, R.w * .07] : [R.w * .645, R.w * .065];
          const x = R.x + gutter[0] + f * gutter[1], y = R.y + R.h * (.14 + ((i * 37) % 14) / 14 * .72);
          ctx.fillStyle = `rgba(243,239,220,${Math.sin(f * 3.14) * .85})`;
          ctx.fillRect(x, y, 6, 1.6);
        }
      },
      now => { // Knowledge graph
        ctx.lineWidth = 1;
        AD_EDGES.forEach(([a, b]) => {
          ctx.strokeStyle = 'rgba(243,239,220,.17)';
          ctx.beginPath(); ctx.moveTo(nodes[a].x, nodes[a].y); ctx.lineTo(nodes[b].x, nodes[b].y); ctx.stroke();
        });
        // A retrieval query spreads out from ParT.
        const q = (now * .45) % 1;
        AD_EDGES.slice(0, 6).concat(AD_EDGES.slice(19)).forEach(([a, b]) => {
          const x = nodes[a].x + (nodes[b].x - nodes[a].x) * q, y = nodes[a].y + (nodes[b].y - nodes[a].y) * q;
          ctx.fillStyle = `rgba(255,255,255,${Math.sin(q * 3.14) * .9})`;
          ctx.fillRect(x - 2, y - 2, 4, 4);
        });
        nodes.forEach(n => {
          const y = n.y - Math.min(R.w, R.h) * .075;
          ctx.font = `${small ? 9.5 : 12}px ${FONT}`;
          const w = ctx.measureText(n.label).width;
          ctx.fillStyle = 'rgba(5,14,16,.72)'; ctx.fillRect(n.x - w / 2 - 4, y - (small ? 10 : 12), w + 8, small ? 14 : 16);
          label(n.label, n.x, y, AD_PAL[n.color] === AD_PAL[3] ? '#f3efdc' : AD_PAL[n.color], small ? 9.5 : 12, 'center');
        });
      },
      now => { // Pareto
        const axisY = ly(92.75);
        ctx.strokeStyle = 'rgba(243,239,220,.26)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(R.x, ly(94.3)); ctx.lineTo(R.x, axisY); ctx.lineTo(R.x + R.w, axisY); ctx.stroke();
        [0.5, 1, 2, 4].forEach(v => { ctx.fillStyle = 'rgba(243,239,220,.3)'; ctx.fillRect(lx(v), axisY, 1, 5); label(String(v), lx(v), axisY + 17, '#9aa5a1', small ? 9 : 11, 'center'); });
        [93, 93.5, 94].forEach(v => { label(v.toFixed(1), R.x - 6, ly(v) + 4, '#9aa5a1', small ? 8.5 : 11, 'right'); ctx.fillStyle = 'rgba(243,239,220,.06)'; ctx.fillRect(R.x, ly(v), R.w, 1); });
        label(T('latency'), R.x + R.w, axisY - 7, '#9aa5a1', small ? 9 : 11, 'right');
        label(T('accuracy'), R.x + 6, ly(94.3) + 2, '#9aa5a1', small ? 9 : 11);
        [['PyTorch FP32', 3.8, 94.0, '#f3efdc', 'right'], ['TensorRT FP16', .82, 93.7, '#f3efdc', 'left'], ['TensorRT INT8', .51, 93.4, '#f3efdc', 'left'], ['AutoDeploy Best, 0.45 ms', .45, 93.5, '#d8bb73', 'left']].forEach(([name, l, a, color, align]) => {
          const x = lx(l), y = ly(a), best = name.startsWith('Auto');
          if (best) { const p = (now * .8) % 1; ctx.strokeStyle = `rgba(216,187,115,${1 - p})`; ctx.beginPath(); ctx.arc(x, y, 5 + p * 16, 0, 6.283); ctx.stroke(); }
          ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, best ? 5.5 : 4, 0, 6.283); ctx.fill();
          const dy = best ? -20 : name === 'TensorRT INT8' ? 16 : -11;
          const text = name;
          ctx.font = `${small ? 9 : 11.5}px ${FONT}`;
          const tw = ctx.measureText(text).width, tx = x + (align === 'right' ? -8 - tw : best ? -6 : 8);
          ctx.fillStyle = 'rgba(7,29,25,.88)'; ctx.fillRect(tx - 3, y + dy - 11, tw + 6, 15);
          label(text, tx, y + dy, color, small ? 9 : 11.5, 'left');
        });
        label(T('masked'), R.x, R.y + R.h * .885, '#d98a5f', small ? 9 : 11);
        if (!small) label(T('legend'), R.x + R.w, R.y + R.h, '#8a9592', 11, 'right');
      },
      now => { // Orchestrator
        const cols = 32, rows = 10, cell = Math.min(R.w / cols, R.h * .62 / rows);
        const gx = R.x + (R.w - cell * cols) / 2, gy = R.y + R.h * .04;
        const sweep = Math.floor((now * 34) % 320);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2;
        ctx.strokeRect(gx + (sweep % cols) * cell + cell * .06, gy + Math.floor(sweep / cols) * cell + cell * .06, cell * .88, cell * .88);
        const by = gy + cell * rows + (small ? 10 : 18), gap = small ? R.w / 3 : R.w / 3;
        [['#f3efdc', '64%', 'first'], ['#d8bb73', '24%', 'repaired'], ['#d98a5f', '12%', 'rolled']].forEach(([c, pct, key], i) => {
          const x = gx + i * gap;
          ctx.fillStyle = c; ctx.fillRect(x, by + 1, 10, 10);
          label(pct, x + 15, by + 11, c, small ? 11 : 14);
          label(T(key), x, by + (small ? 25 : 30), '#b7c0bc', small ? 8.5 : 11);
        });
        const iy = by + (small ? 42 : 56), total = cell * cols;
        label(T('iso'), gx, iy, '#9aa5a1', small ? 9 : 11);
        let x = gx;
        [['container', 38, '#f3efdc'], [T('host'), 35, 'rgba(243,239,220,.42)'], ['namespace', 16, '#84c7a2'], ['bwrap', 6, '#d8bb73'], ['venv', 5, '#d98a5f']].forEach(([name, pct, c]) => {
          const w = total * pct / 100;
          ctx.fillStyle = c; ctx.fillRect(x, iy + 7, Math.max(1, w - 2), 9);
          if (pct >= 16) label(`${name} ${pct}%`, x, iy + 31, '#b7c0bc', small ? 8.5 : 11);
          x += w;
        });
      },
      now => { // Hardware: real chip drawings with labels.
        const info = {
          cpu: ['CPU', 'Intel Xeon Gold 6248', '8.6 ms', '116 inf/s · 145 W', '#f3efdc', 1.1],
          gpu: ['GPU', 'NVIDIA Tesla V100', '0.45 ms', '2,222 inf/s · 180 W', '#d8bb73', 3.2],
          fpga: ['FPGA', 'Xilinx Alveo U200', '72 µs*', '13,890 inf/s* · 40 W*', '#84c7a2', 5.2],
          npu: ['NPU', 'Huawei Ascend', T('via'), T('npu'), '#d98a5f', 0]
        };
        chipLayout().forEach(c => {
          const [type, name, value, sub, color, speed] = info[c.kind], s = c.s, h = s / 2;
          ctx.strokeStyle = color; ctx.lineWidth = 1.4;
          if (c.kind === 'npu') ctx.setLineDash([4, 4]);
          ctx.strokeRect(c.x - h, c.y - h, s, s);
          ctx.setLineDash([]);
          ctx.lineWidth = 1.2;
          const pins = 6;
          for (let k = 0; k < pins; k++) { // Pins on all four sides.
            const p = c.x - h + (k + 1) * s / (pins + 1), q = c.y - h + (k + 1) * s / (pins + 1), L = s * .09;
            ctx.beginPath();
            ctx.moveTo(p, c.y - h); ctx.lineTo(p, c.y - h - L); ctx.moveTo(p, c.y + h); ctx.lineTo(p, c.y + h + L);
            ctx.moveTo(c.x - h, q); ctx.lineTo(c.x - h - L, q); ctx.moveTo(c.x + h, q); ctx.lineTo(c.x + h + L, q);
            ctx.stroke();
          }
          ctx.globalAlpha *= .55;
          ctx.strokeRect(c.x - s * .42, c.y - s * .42, s * .84, s * .84);
          ctx.globalAlpha /= .55;
          for (let i = 0; speed && i < 4; i++) { // Data arriving, faster on faster chips.
            const f = (now * speed * .22 + i / 4) % 1;
            ctx.fillStyle = color;
            ctx.fillRect(c.x - h + (i + .5) / 4 * s - 1, c.y - h - s * .12 - (1 - f) * s * .35, 2, 6);
          }
          const ty = c.y + h + (small ? 22 : 30);
          label(small ? type : ` · `, c.x, ty, small ? color : '#c9d0cc', small ? 10 : 11.5, 'center');
          if (small) label(name, c.x, ty + 12, '#9fb3a8', 8, 'center');
          label(value, c.x, ty + (small ? 30 : 30), color, small ? 15 : 26, 'center');
          if (!small) label(sub, c.x, ty + 50, '#9fb3a8', 10.5, 'center');
        });
        if (!small) label(`* ${T('est')}`, R.x + R.w, R.y + R.h + 4, '#8a9e94', 11, 'right');
      },
      now => { // Loop
        const stations = [['Parser', -2.36], [currentLang() === 'zh' ? '知识图谱' : 'Knowledge graph', -.79], [currentLang() === 'zh' ? '推荐引擎' : 'Recommendation', .79], [currentLang() === 'zh' ? '编排器' : 'Orchestrator', 2.36]];
        const contracts = [['GraphPatch', -1.57], ['PlanBundle', 0], ['StepEvent', 1.57], ['StateContract', 3.14]];
        stations.forEach(([name, a]) => {
          const x = ring.x + Math.cos(a) * ring.r, y = ring.y + Math.sin(a) * ring.r;
          ctx.font = `${small ? 10.5 : 14}px ${FONT}`;
          const w = ctx.measureText(name).width + 20;
          ctx.fillStyle = '#0c2923'; ctx.strokeStyle = '#d8bb73'; ctx.lineWidth = 1.2;
          ctx.fillRect(x - w / 2, y - 15, w, 30); ctx.strokeRect(x - w / 2, y - 15, w, 30);
          label(name, x, y + 5, '#f3efdc', small ? 10.5 : 14, 'center');
        });
        contracts.forEach(([name, a]) => {
          const x = ring.x + Math.cos(a) * ring.r * (small ? .7 : .72), y = ring.y + Math.sin(a) * ring.r * .72;
          label(name, x, y + 4, '#f3efdc', small ? 8.5 : 11, 'center');
        });
        for (let i = 0; i < 5; i++) {
          const a = now * .55 + i / 5 * 6.283;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(ring.x + Math.cos(a) * ring.r, ring.y + Math.sin(a) * ring.r, 3.4, 0, 6.283); ctx.fill();
        }
        label(T('loop'), ring.x, ring.y + 4, '#d8bb73', small ? 10.5 : 13, 'center');
      }
    ];

    const fit = () => {
      const box = canvas.getBoundingClientRect();
      dpr = Math.min(devicePixelRatio || 1, 1.5);
      W = box.width; H = box.height;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      const narrow = W < 900;
      R = narrow ? { x: W * .07, y: H * .125, w: W * .86, h: H * .385 } : { x: W * .4, y: H * .2, w: W * .55, h: H * .68 };
      top = docTop(section);
      range = Math.max(1, section.offsetHeight - state.vh);
      build();
    };
    measureTasks.push(fit);
    whenVisible(section, on => { visible = on; });

    const xyFor = (s, i, now) => {
      const t = targets[s], k = i * 4;
      if (s !== 6) return [t[k], t[k + 1]];
      const a = now * .12, dx = t[k] - ring.x, dy = t[k + 1] - ring.y;
      return [ring.x + dx * Math.cos(a) - dy * Math.sin(a), ring.y + dx * Math.sin(a) + dy * Math.cos(a)];
    };

    frameTasks.push((dt, now) => {
      if (!visible || !W) return;
      const p = clamp((state.y - top) / range);
      const f = p * (STATES - 1), a = Math.min(STATES - 1, Math.floor(f)), b = Math.min(STATES - 1, a + 1), local = f - a;
      const mix = sstep(.28, .86, local);
      const current = local > .57 ? b : a;
      if (current !== active) {
        active = current;
        steps.forEach((step, i) => step.classList.toggle('active', i === current));
        railItems.forEach((item, i) => { item.classList.toggle('on', i === current - 1); item.classList.toggle('done', i < current - 1); });
      }
      if (bar) bar.style.transform = `scaleX(${p.toFixed(3)})`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.textBaseline = 'alphabetic';
      const ta = targets[a], tb = targets[b];
      for (let c = 0; c < AD_PAL.length; c++) {
        ctx.fillStyle = AD_PAL[c];
        for (let i = 0; i < N; i++) {
          const k = i * 4;
          const stagger = Math.min(1, Math.max(0, (mix - r1[i] * .34) / .66));
          const e = stagger * stagger * (3 - 2 * stagger);
          const col = e > .5 ? tb[k + 3] : ta[k + 3];
          if (col !== c) continue;
          const pa = xyFor(a, i, now), pb = b === a ? pa : xyFor(b, i, now);
          const size = ta[k + 2] + (tb[k + 2] - ta[k + 2]) * e;
          if (size < .25) continue;
          const arc = Math.sin(e * 3.14159) * (r2[i] - .5) * 60;
          ctx.fillRect(pa[0] + (pb[0] - pa[0]) * e, pa[1] + (pb[1] - pa[1]) * e + arc, size, size);
        }
      }
      // Labels and axes go on top, so dots never cover the text.
      const title = (k, alpha) => { ctx.globalAlpha = alpha; label(AD_TITLES[k][currentLang() === 'zh' ? 1 : 0].toUpperCase(), R.x, R.y - (small ? 18 : 30), '#d8bb73', small ? 9.5 : 12); };
      if (mix < .9) { ctx.globalAlpha = 1 - sstep(0, .5, mix); OVERLAYS[a](now); title(a, 1 - sstep(0, .5, mix)); }
      if (mix > .1 && b !== a) { ctx.globalAlpha = sstep(.5, 1, mix); OVERLAYS[b](now); title(b, sstep(.5, 1, mix)); }
      ctx.globalAlpha = 1;
    });
    window.__adState = () => ({ active, W, H, N });
  };

  /* ==========================================================================
     AutoDeploy lab: pick a target and an accuracy floor. The rule matches the thesis:
     the minimum-latency measured configuration that satisfies the constraint.
     ========================================================================== */
  // Rows: [label EN, label ZH, detail, latency, accuracy %, watts, AutoDeploy's own tuned setup]
  const LAB_DATA = {
    cpu: { name: ['Intel Xeon Gold 6248', 'Intel Xeon Gold 6248'], unit: 'ms', est: false, base: 0, baseName: ['PyTorch on one thread', 'PyTorch 单线程'], rows: [
      ['PyTorch, one thread', 'PyTorch，单线程', 'FP32, as trained', 45.2, 94.0, 85],
      ['PyTorch, 20 threads', 'PyTorch，20 线程', 'FP32', 12.8, 94.0, 150],
      ['ONNX Runtime, tuned by AutoDeploy', 'ONNX Runtime，AutoDeploy 调优', 'fused graph, 20 threads', 8.6, 94.0, 145, true]
    ], fail: null, steps: ['s1_export', 's2_ort_session'] },
    gpu: { name: ['NVIDIA Tesla V100', 'NVIDIA Tesla V100'], unit: 'ms', est: false, base: 0, baseName: ['the model as trained', '原始模型'], rows: [
      ['PyTorch, as trained', 'PyTorch，原始模型', 'FP32', 3.8, 94.0, 220],
      ['TensorRT, half precision', 'TensorRT，半精度', 'FP16', 0.82, 93.7, 200],
      ['TensorRT, 8-bit', 'TensorRT，8 位', 'INT8 post-training quantization', 0.51, 93.4, 190],
      ['AutoDeploy’s tuned setup', 'AutoDeploy 调优方案', 'FP16, searched kernels and workspace', 0.45, 93.5, 180, true]
    ], fail: ['s2_quant', 'calibration_overflow', 'ROLLBACK ckpt#0, safer calibration preset'], steps: ['s1_export', 's2_quant', 's3_compile'] },
    fpga: { name: ['Xilinx Alveo U200', 'Xilinx Alveo U200'], unit: 'µs', est: true, base: 3, baseName: ['my best hand-tuned design', '我手工调出的最佳设计'], rows: [
      ['hls4ml, 16-bit fixed point', 'hls4ml，16 位定点', 'ap_fixed<16,6>', 92, 93.0, 42],
      ['hls4ml, 8-bit fixed point', 'hls4ml，8 位定点', 'ap_fixed<8,4>', 68, 91.6, 38],
      ['Vitis AI, 8-bit', 'Vitis AI，8 位', 'INT8', 85, 92.3, 41],
      ['My best, tuned by hand', '我的手工最佳', 'days of manual tuning', 78, 92.1, 42],
      ['AutoDeploy’s tuned setup', 'AutoDeploy 调优方案', 'precision chosen per layer', 72, 93.0, 40, true]
    ], fail: ['s3_hls', 'hls_resource_overflow', 'RETRY_STEP, reduced parallelism'], steps: ['s1_quant', 's2_hls4ml', 's3_hls'] }
  };
  const CONTRACTS = {
    StateContract: `{
  "_type": "StateContract",
  "schema_version": "1.0.0",
  "request": { "request_id": "req_01HZX9FQ9V2K7R9ZC7J6P4", "source": "cli" },
  "model": {
    "identity": {
      "urn": "model:particle_transformer:hep:jet_tagging:v1",
      "domain": "hep", "family": "transformer"
    },
    "provenance": { "framework": "pytorch", "model_format": "state_dict" },
    "scale": { "parameter_count": 2100000, "layer_count": 24, "total_flops": 856000000 }
  }
}`,
    PlanBundle: `{
  "schema_version": "re.plan_bundle.v1",
  "plans": [{
    "plan_id": "plan_a",
    "hardware_urn": "hw:gpu:nvidia:volta:v100:32:pci:v1",
    "steps": [
      { "step_id": "s1_export",  "kind": "export",   "tool_urn": "tool:pytorch:onnx_export:2.1:v1" },
      { "step_id": "s2_quant",   "kind": "quantize", "technique_urn": "technique:quantization:fp16:v1" },
      { "step_id": "s3_compile", "kind": "compile",  "tool_urn": "tool:nvidia:tensorrt:8.6.1:v1" }
    ],
    "predicted_risk": { "compatibility": 0.1 },
    "confidence": 0.74
  }],
  "evaluation_policy": { "max_trials": 3, "timeout_s": 3600 }
}`,
    StepEvent: `{
  "plan_id": "plan_a",
  "step_id": "s2_quant",
  "step_index": 1,
  "status": "FAILED",
  "step_result": { "ok": false, "status": "FAILED" },
  "checkpoint_id": "ckpt_run01#1",
  "can_rollback": true,
  "metadata": { "reason_code": "calibration_overflow" }
}`,
    ControlAction: `{
  "kind": "ROLLBACK",
  "reason": "Quantization failed; retry with safer calibration preset.",
  "rollback_to_checkpoint_id": "ckpt_run01#0",
  "metadata": {
    "idempotency_key": "run01#rollback#1",
    "conflict_policy": "reject"
  }
}`
  };
  const DETAIL_ZH = {
    'FP32, as trained': 'FP32，原始精度', 'fused graph, 20 threads': '融合计算图，20 线程', 'INT8 post-training quantization': 'INT8 训练后量化',
    'FP16, searched kernels and workspace': 'FP16，搜索内核与工作空间', 'days of manual tuning': '数天手工调优', 'precision chosen per layer': '逐层选择精度'
  };
  const LAB_TEXT = {
    picksOn: ['On the {chip}, AutoDeploy picks', '在 {chip} 上，AutoDeploy 选择'],
    summary: ['{lat} per inference, {x}× faster than {base}, at {acc}% accuracy.', '单次推理 {lat}，比{base}快 {x} 倍，精度 {acc}%。'],
    only: ['{lat} per inference. It is the only setup that keeps {acc}% accuracy.', '单次推理 {lat}。只有它能保持 {acc}% 的精度。'],
    none: ['Nothing on this chip keeps that much accuracy.', '这块芯片上没有方案能保持这么高的精度。'],
    noneWhy: ['AutoDeploy reports that instead of shipping a worse model. Try allowing a little loss.', 'AutoDeploy 会如实报告，而不是交付更差的模型。试试放宽一点精度要求。'],
    baseline: ['the starting point', '基准'],
    tooLow: ['over your limit', '超出你的限度'],
    noLoss: ['no loss', '无损失'],
    drop: ['−{x} pt', '下降 {x} 个点'],
    winner: ['AutoDeploy’s pick', 'AutoDeploy 之选'],
    est: ['FPGA numbers are HLS synthesis estimates.', 'FPGA 数据为 HLS 综合估算值。'],
    gpuFix: ['quantize step failed → rolled back → fixed', '量化步骤失败 → 回滚 → 已修复'],
    fpgaFix: ['out of FPGA resources → retried smaller → fixed', 'FPGA 资源不足 → 缩小重试 → 已修复'],
    start: ['$ press Start to replay a deployment', '$ 点击开始，重放一次部署']
  };

  LABS.autoDeployLab = function (S) {
    const { $, $$, refreshTasks, currentLang, reducedMotion } = S;
    if (!$('#dep-lab')) return;
    const rowsEl = $('#dep-race-rows'), runBtn = $('#dep-run'), logEl = $('#dep-log'), pick = $('#dep-pick'), jsonEl = $('#dep-json');
    const tabs = $$('#dep-targets button'), floors = $$('#dep-floor-pick button'), contractTabs = $$('#dep-contracts button'), runSteps = $$('#dep-run-steps li');
    const zh = () => currentLang() === 'zh';
    const L = () => (zh() ? 1 : 0);
    const T = (key, vars) => { let out = LAB_TEXT[key][L()]; Object.keys(vars || {}).forEach(k => { out = out.split(`{${k}}`).join(vars[k]); }); return out; };
    const esc = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    let target = 'gpu', floor = 93, timers = [];
    const fmt = (v, d) => (d.unit === 'µs' ? `${v} µs` : `${v < 1 ? v.toFixed(2) : v.toFixed(v < 10 ? 2 : 1)} ms`);
    const choose = () => {
      const ok = LAB_DATA[target].rows.filter(r => r[4] >= floor - 1e-9);
      return ok.length ? ok.reduce((a, b) => (b[3] < a[3] ? b : a)) : null;
    };
    const versus = (row, base) => {
      if (row === base) return T('baseline');
      const ratio = base[3] / row[3];
      if (zh()) return ratio >= 1 ? `比基准快 ${ratio.toFixed(1)} 倍` : `比基准慢 ${(1 / ratio).toFixed(1)} 倍`;
      return ratio >= 1 ? `${ratio.toFixed(1)}× faster` : `${(1 / ratio).toFixed(1)}× slower`;
    };
    const describe = () => {
      const d = LAB_DATA[target], sel = choose(), base = d.rows[d.base];
      if (!sel) { pick.innerHTML = `<small>${esc(T('picksOn', { chip: d.name[L()] }))}</small><b class="bad">${T('none')}</b><span>${T('noneWhy')}</span>`; return; }
      const lat = fmt(sel[3], d) + (d.est ? '*' : '');
      const acc = sel[4].toFixed(1);
      const baseName = d.baseName[L()];
      const line = sel === base ? T('only', { lat, acc }) : T('summary', { lat, acc, x: (base[3] / sel[3]).toFixed(1), base: baseName });
      pick.innerHTML = `<small>${esc(T('picksOn', { chip: d.name[L()] }))}</small><b>${esc(sel[L()])}</b><span>${esc(line)}</span>${d.est ? `<em>* ${T('est')}</em>` : ''}`;
    };
    const render = animate => {
      const d = LAB_DATA[target], sel = choose(), base = d.rows[d.base];
      const fastest = Math.min(...d.rows.map(r => r[3])), slowest = Math.max(...d.rows.map(r => r[3]));
      rowsEl.classList.remove('go', 'done', 'instant');
      rowsEl.innerHTML = d.rows.map(r => {
        const low = r[4] < floor - 1e-9, win = r === sel;
        const width = Math.max(4, fastest / r[3] * 100);
        const dur = .55 + 1.9 * (r[3] / slowest);
        return `<div class="race-row${low ? ' out' : ''}${win ? ' win' : ''}" style="--w:${width.toFixed(1)}%;--d:${dur.toFixed(2)}s">
          <div class="race-name"><b>${esc(r[L()])}</b><small>${esc(zh() && DETAIL_ZH[r[2]] || r[2])}</small></div>
          <div class="race-track"><i class="race-bar"></i><span class="race-time">${fmt(r[3], d)}${d.est ? '*' : ''}<em>${esc(versus(r, base))}</em></span>${win ? `<span class="race-flag">★ ${T('winner')}</span>` : ''}</div>
          <div class="race-acc"><b>${r[4].toFixed(1)}%</b><em>${low ? T('tooLow') : r[4] >= 94 ? T('noLoss') : T('drop', { x: (94 - r[4]).toFixed(1) })}</em></div>
        </div>`;
      }).join('');
      describe();
      if (!animate || reducedMotion) { rowsEl.classList.add('instant', 'go', 'done'); return; }
      void rowsEl.offsetWidth;
      requestAnimationFrame(() => rowsEl.classList.add('go'));
      timers.push(setTimeout(() => rowsEl.classList.add('done'), 2600));
    };

    const highlight = text => esc(text)
      .replace(/"([^"]+)"(\s*:)/g, '<span class="j-k">"$1"</span>$2')
      .replace(/:\s*"([^"]*)"/g, ': <span class="j-s">"$1"</span>')
      .replace(/:\s*(-?[\d.]+|true|false)/g, ': <span class="j-n">$1</span>');
    const showContract = name => { contractTabs.forEach(t => t.setAttribute('aria-selected', String(t.dataset.contract === name))); jsonEl.innerHTML = highlight(CONTRACTS[name]); };
    contractTabs.forEach(t => t.addEventListener('click', () => showContract(t.dataset.contract)));
    showContract('StateContract');
    const setStep = (name, state, note) => {
      const li = runSteps.find(l => l.dataset.step === name);
      if (!li) return;
      li.className = state || '';
      if (note) li.dataset.note = note; else delete li.dataset.note;
    };
    const resetSteps = () => runSteps.forEach(li => { li.className = ''; delete li.dataset.note; });
    const addLine = (text, kind) => {
      const line = document.createElement('span');
      line.textContent = text;
      if (kind) line.className = kind;
      logEl.append(line);
      logEl.scrollTop = logEl.scrollHeight;
    };
    const stop = () => { timers.forEach(clearTimeout); timers = []; runBtn.disabled = false; };
    tabs.forEach(b => b.addEventListener('click', () => {
      stop(); resetSteps(); target = b.dataset.target;
      tabs.forEach(t => t.setAttribute('aria-checked', String(t === b)));
      render(true);
    }));
    floors.forEach(b => b.addEventListener('click', () => {
      stop(); floor = +b.dataset.floor;
      floors.forEach(t => t.setAttribute('aria-checked', String(t === b)));
      render(true);
    }));
    refreshTasks.push(() => render(false));

    const run = () => {
      stop(); resetSteps();
      runBtn.disabled = true; logEl.textContent = '';
      const d = LAB_DATA[target], sel = choose();
      const gap = reducedMotion ? 0 : 1;
      let at = 0;
      const later = (ms, fn) => { at += ms * gap; timers.push(setTimeout(fn, at)); };
      rowsEl.classList.remove('go', 'done', 'instant');
      later(0, () => { setStep('parse', 'running'); addLine('AutoDeploy 1.0.0+beta.20260117.1', 'cmd'); addLine(`$ autodeploy run -c part.yaml --target ${target}`, 'cmd'); });
      later(600, () => { setStep('parse', 'done'); setStep('kg', 'running'); addLine('parser   13 stages ok · StateContract + GraphPatch'); showContract('StateContract'); });
      later(600, () => { setStep('kg', 'done'); setStep('plan', 'running'); addLine(`kg       recalled pipelines: transformer on ${d.name[0]}`); });
      later(650, () => { setStep('plan', 'done'); setStep('run', 'running'); addLine('re       planners: templates, rainbow-dqn, gflownet, mobo · infeasible plans masked'); showContract('PlanBundle'); });
      d.steps.forEach(step => {
        if (d.fail && d.fail[0] === step) {
          later(600, () => { addLine(`orch     ${step} FAILED  ${d.fail[1]}`, 'bad'); setStep('run', 'running bad'); showContract('StepEvent'); });
          later(750, () => { addLine(`re       ${d.fail[2]}`, 'warn'); showContract('ControlAction'); });
        }
        later(450, () => addLine(`orch     ${step} ok`, 'ok'));
      });
      later(300, () => { setStep('run', d.fail ? 'fixed' : 'done', d.fail ? T(target === 'fpga' ? 'fpgaFix' : 'gpuFix') : ''); setStep('bench', 'running'); render(true); });
      later(2700, () => {
        setStep('bench', 'done'); setStep('save', 'running');
        addLine(sel ? `eval     ${sel[0]}: ${fmt(sel[3], d)}${d.est ? ' (est.)' : ''}, ${sel[4].toFixed(1)}%` : 'eval     no setup meets the accuracy limit', sel ? 'best' : 'bad');
        pick.classList.remove('flash'); void pick.offsetWidth; pick.classList.add('flash');
      });
      later(600, () => { setStep('save', 'done'); addLine('kg       outcome saved as evidence for the next run'); runBtn.disabled = false; });
    };
    runBtn.addEventListener('click', run);
    render(false);
    addLine(T('start'));
  };

  /* ==========================================================================
     Curiosity case study: the world-model graph, the architecture explorer,
     the loop and the day timeline. Everything stops when the case closes.
     ========================================================================== */
  const CU_NODES = [
    ['me', 'Me', '我', 0, .5, .5, 'The centre of the graph. Everything else is linked by how it relates to my goals.', '图的中心。其他一切都按照与我的目标的关系相连。', 1],
    ['ad', 'AutoDeploy', 'AutoDeploy', 1, .2, .28, 'Project · source: my repositories and notes · confidence 0.99', '项目 · 来源：我的代码库与笔记 · 可信度 0.99', .99],
    ['paper', 'Draft-budget paper', '草稿预算论文', 1, .8, .3, 'Project · source: documents and calendar · confidence 0.97', '项目 · 来源：文档与日历 · 可信度 0.97', .97],
    ['sup', 'Supervisor', '导师', 0, .38, .12, 'Person · reviews the paper · source: email threads · confidence 0.95', '人物 · 审阅论文 · 来源：邮件往来 · 可信度 0.95', .95],
    ['arxiv', 'New arXiv paper', '新的 arXiv 论文', 5, .9, .06, 'Source: arXiv feed, today 07:55 · confidence 0.71 that it matters to the paper', '来源：arXiv 订阅，今天 07:55 · 与论文相关的可信度 0.71', .71],
    ['due', 'Paper due Friday', '论文周五截止', 2, .9, .6, 'Deadline · source: calendar · seen Monday 09:12 · confidence 0.98', '截止日期 · 来源：日历 · 周一 09:12 记录 · 可信度 0.98', .98],
    ['exp', 'Experiment 12 failed twice', '实验 12 失败两次', 3, .7, .8, 'Event · source: training logs, 10:31 · same CUDA error twice · confidence 0.93', '事件 · 来源：训练日志，10:31 · 同一个 CUDA 错误出现两次 · 可信度 0.93', .93],
    ['gpu', 'V100 server', 'V100 服务器', 4, .3, .95, 'Resource · source: nvidia-smi · busy until 16:00 · confidence 0.88', '资源 · 来源：nvidia-smi · 16:00 前占用 · 可信度 0.88', .88],
    ['talk', 'CEPC talk', 'CEPC 报告', 3, .14, .68, 'Event · source: calendar and slides · Friday 14:00 · confidence 0.96', '事件 · 来源：日历与幻灯片 · 周五 14:00 · 可信度 0.96', .96]
  ];
  const CU_EDGES = [['me', 'ad', 'works on', '负责'], ['me', 'paper', 'writes', '撰写'], ['sup', 'paper', 'reviews', '审阅'], ['paper', 'due', 'due', '截止'], ['arxiv', 'paper', 'related', '相关'],
    ['exp', 'paper', 'blocks', '阻碍'], ['exp', 'gpu', 'ran on', '运行于'], ['me', 'talk', 'gives', '主讲'], ['talk', 'ad', 'about', '主题']];
  const CU_COLORS = ['#f3efdc', '#d8bb73', '#d98a5f', '#84c7a2', '#b7c5b8', 'rgba(243,239,220,.75)'];
  LABS.curiosity = function (S, scope) {
    const { $, $$, currentLang, reducedMotion } = S;
    const zh = () => (currentLang() === 'zh' ? 1 : 0);
    // Architecture explorer.
    const nodes = $$('.cu-node', scope), detail = $('#cu-detail', scope);
    const show = n => {
      nodes.forEach(x => x.classList.toggle('on', x === n));
      detail.innerHTML = `<b>${n.querySelector('b').innerHTML}</b>${n.querySelector('.cu-info').innerHTML}`;
    };
    nodes.forEach(n => { n.addEventListener('click', () => show(n)); n.addEventListener('pointerenter', () => show(n)); });
    if (nodes[0]) show(nodes[0]);
    // The loop lights up step by step; the day timeline advances until someone picks a time.
    const steps = $$('.cu-loop-step', scope), times = $$('.cu-day-times button', scope), cards = $$('.cu-day-card', scope);
    let k = 0, day = 0, picked = false;
    const setDay = i => { day = i; times.forEach((b, j) => b.classList.toggle('on', j === i)); cards.forEach((c, j) => c.classList.toggle('on', j === i)); };
    times.forEach((b, i) => b.addEventListener('click', () => { picked = true; setDay(i); }));
    setDay(0);
    steps.forEach((st, i) => st.classList.toggle('on', i === 0));
    const tick = setInterval(() => {
      if (!scope.isConnected || !scope.querySelector('.cu')) { clearInterval(tick); return; }
      if (reducedMotion) return;
      k = (k + 1) % steps.length;
      steps.forEach((st, i) => st.classList.toggle('on', i === k));
      if (!picked && k % 2 === 0) setDay((day + 1) % cards.length);
    }, 1500);
    // The world-model graph grows node by node.
    const canvas = $('#cu-world', scope), info = $('#cu-world-info', scope);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, dpr = 1, selected = 'due', start = performance.now();
    const fit = () => { const r = canvas.getBoundingClientRect(); dpr = Math.min(devicePixelRatio || 1, 2); W = r.width; H = r.height; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); };
    fit();
    const pos = (n, now) => ({ x: (.06 + n[4] * .88) * W + Math.sin(now * .6 + n[4] * 9) * 3, y: (.08 + n[5] * .84) * H + Math.cos(now * .5 + n[5] * 7) * 3 });
    const shown = now => Math.min(CU_NODES.length, reducedMotion ? CU_NODES.length : Math.floor((now - start / 1000) / .7) + 1);
    const describe = () => {
      const n = CU_NODES.find(x => x[0] === selected);
      info.innerHTML = `<b style="color:${CU_COLORS[n[3]]}">${n[1 + zh()]}</b><span>${n[6 + zh()]}</span><i style="--c:${(n[8] * 100).toFixed(0)}%"></i>`;
      shownLang = zh();
    };
    let shownLang = zh();
    describe();
    canvas.addEventListener('pointerdown', event => {
      const r = canvas.getBoundingClientRect(), x = event.clientX - r.left, y = event.clientY - r.top, now = performance.now() / 1000;
      let best = null, bd = 30;
      CU_NODES.slice(0, shown(now)).forEach(n => { const p = pos(n, now), d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = n; } });
      if (best) { selected = best[0]; describe(); }
    });
    const frame = t => {
      if (!canvas.isConnected) return;
      const now = t / 1000, count = shown(now);
      if (canvas.getBoundingClientRect().width !== W) fit();
      if (shownLang !== zh()) describe();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const visible = new Set(CU_NODES.slice(0, count).map(n => n[0]));
      const P = {};
      CU_NODES.forEach(n => { P[n[0]] = pos(n, now); });
      ctx.font = `10px ${FONT}`; ctx.textAlign = 'center';
      CU_EDGES.forEach(([a, b, en, cn], i) => {
        if (!visible.has(a) || !visible.has(b)) return;
        const A = P[a], B = P[b], hot = a === selected || b === selected;
        ctx.strokeStyle = hot ? 'rgba(216,187,115,.75)' : 'rgba(243,239,220,.16)'; ctx.lineWidth = hot ? 1.5 : 1;
        ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
        const f = (now * .35 + i * .17) % 1;
        ctx.fillStyle = 'rgba(216,187,115,.8)'; ctx.beginPath(); ctx.arc(A.x + (B.x - A.x) * f, A.y + (B.y - A.y) * f, 1.8, 0, 6.283); ctx.fill();
        if (W > 520) { ctx.fillStyle = hot ? '#d8bb73' : 'rgba(183,197,184,.6)'; ctx.fillText(zh() ? cn : en, (A.x + B.x) / 2, (A.y + B.y) / 2 - 4); }
      });
      CU_NODES.slice(0, count).forEach((n, i) => {
        const p = P[n[0]], age = Math.min(1, (now - start / 1000 - i * .7) / .5), r = (n[0] === 'me' ? 15 : 9) * (reducedMotion ? 1 : Math.max(.2, age));
        if (n[0] === selected) { ctx.strokeStyle = 'rgba(216,187,115,.6)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, p.y, r + 7 + Math.sin(now * 3) * 2, 0, 6.283); ctx.stroke(); }
        ctx.fillStyle = CU_COLORS[n[3]]; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.283); ctx.fill();
        ctx.font = `${n[0] === 'me' ? 12 : 11}px ${FONT}`;
        const label = n[1 + zh()], w = ctx.measureText(label).width;
        const lx = Math.min(W - w / 2 - 5, Math.max(w / 2 + 5, p.x));
        ctx.fillStyle = 'rgba(10,35,30,.82)'; ctx.fillRect(lx - w / 2 - 4, p.y + r + 4, w + 8, 15);
        ctx.fillStyle = '#f3efdc'; ctx.fillText(label, lx, p.y + r + 15);
      });
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  };

  /* ==========================================================================
     LHAASO-WCDA event display. Geometry is exact: one 300 x 110 m pool of 60 x 22 cells
     (1,320 PMTs) above two 150 x 150 m pools of 30 x 30 cells (900 PMTs each): 3,120 in all.
     The events are simulated. The colour scale follows a real charge display.
     ========================================================================== */
  const WCDA_STOPS = [[0, [27, 66, 55]], [.22, [52, 104, 84]], [.42, [132, 168, 120]], [.6, [196, 176, 108]], [.76, [216, 187, 115]], [.9, [240, 214, 158]], [1, [255, 248, 228]]];
  function wcdaColor(t) {
    for (let i = 1; i < WCDA_STOPS.length; i++) {
      if (t <= WCDA_STOPS[i][0]) {
        const [a, ca] = WCDA_STOPS[i - 1], [b, cb] = WCDA_STOPS[i], f = (t - a) / (b - a);
        return ca.map((v, k) => Math.round(v + (cb[k] - v) * f));
      }
    }
    return WCDA_STOPS[WCDA_STOPS.length - 1][1];
  }
  LABS.wcda = function (S) {
    const { $, $$, clamp, frameTasks, measureTasks, currentLang, reducedMotion } = S;
    const canvas = $('#wcda'), plateau = $('#wcda-plateau');
    if (!canvas) return;
    const ctx = canvas.getContext('2d'), pctx = plateau.getContext('2d');
    const zh = () => currentLang() === 'zh';
    const cells = [];
    const addPool = (x0, y0, cols, rows) => { for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push({ x: x0 + (c + .5) * 5, y: y0 + (r + .5) * 5 }); };
    addPool(-150, 22, 60, 22); // 1,320
    addPool(-151, -130, 30, 30); // 900
    addPool(1, -130, 30, 30); // 900
    const POOLS = [[-150, 22, 300, 110], [-151, -130, 150, 150], [1, -130, 150, 150]];
    const heat = new Float32Array(cells.length);
    const LEVELS = 40;
    let W = 0, H = 0, dpr = 1, P = { x: 0, y: 0, w: 1, h: 1 }, scale = 1, base = null, sprites = [], visible = false;
    let shower = null, lastAuto = -3, hits = [], pw = 0, ph = 0, pdpr = 1, mode = 'triggerless', seen = 0, kept = 0, eventId = 40, hover = -1, axis = null, hud = '', tags = [];
    const statusEl = $('#wcda-status'), keptEl = $('#wcda-kept');
    const say = (en, cn) => { statusEl.dataset.en = en; statusEl.dataset.zh = cn; statusEl.textContent = zh() ? cn : en; };
    const toX = x => P.x + (x + 155) * scale, toY = y => P.y + (136 - y) * scale;
    const layout = () => {
      const box = canvas.getBoundingClientRect();
      if (!box.width) return;
      dpr = Math.min(devicePixelRatio || 1, 2);
      W = box.width; H = box.height;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      const barW = W < 460 ? 40 : 66;
      P = { x: W < 460 ? 28 : 38, y: 6, w: W - (W < 460 ? 28 : 38) - barW, h: H - 44 };
      scale = Math.min(P.w / 310, P.h / 272);
      P.x += (P.w - 310 * scale) / 2;
      P.y += (P.h - 272 * scale) / 2;
      const size = Math.max(1.2, scale * 1.85);
      sprites = Array.from({ length: LEVELS }, (_, i) => {
        const t = i / (LEVELS - 1), s = document.createElement('canvas'), r = Math.ceil(size * dpr * (.72 + t * .75));
        s.width = s.height = r * 2 + 2;
        const g = s.getContext('2d'), c = wcdaColor(t);
        g.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
        g.beginPath(); g.arc(r + 1, r + 1, r, 0, 6.283); g.fill();
        return s;
      });
      base = document.createElement('canvas');
      base.width = canvas.width; base.height = canvas.height;
      const b = base.getContext('2d');
      b.setTransform(dpr, 0, 0, dpr, 0, 0);
      b.font = `${W < 460 ? 9 : 10}px ${FONT}`;
      b.strokeStyle = 'rgba(243,239,220,.28)'; b.fillStyle = '#9fb3a8'; b.lineWidth = 1;
      b.textAlign = 'center';
      [-100, -50, 0, 50, 100, 150].forEach(v => {
        b.fillRect(toX(v), toY(-136), 1, 4);
        if (W >= 460 || v % 100 === 0) b.fillText(String(v), toX(v), toY(-136) + 14);
      });
      b.textAlign = 'right';
      [-100, -50, 0, 50, 100].forEach(v => { b.fillRect(toX(-155) - 4, toY(v), 4, 1); b.fillText(String(v), toX(-155) - 6, toY(v) + 3); });
      b.textAlign = 'left';
      b.fillText('X, Y [m]', toX(-155) - (W < 460 ? 26 : 34), toY(-136) + 14);
      b.strokeRect(toX(-155), toY(136), 310 * scale, 272 * scale);
      b.strokeStyle = 'rgba(216,187,115,.42)';
      POOLS.forEach(p => b.strokeRect(toX(p[0]), toY(p[1] + p[3]), p[2] * scale, p[3] * scale));
      b.fillStyle = '#1d4237';
      const baseR = Math.max(.7, scale * 1.15);
      cells.forEach(c => { b.beginPath(); b.arc(toX(c.x), toY(c.y), baseR, 0, 6.283); b.fill(); });
      b.font = `${W < 460 ? 8.5 : 10}px ${FONT}`; b.textAlign = 'left'; b.fillStyle = '#d8bb73';
      // Pool labels are drawn every frame on top of the hits, so a shower never hides them.
      tags = [
        [zh() ? '1,320 PMT · 300 × 110 m' : '1,320 PMTs · 300 × 110 m', toX(-146), toY(124)],
        [zh() ? '900 PMT · 150 × 150 m' : '900 PMTs · 150 × 150 m', toX(-147), toY(10)],
        [zh() ? '900 PMT · 150 × 150 m' : '900 PMTs · 150 × 150 m', toX(5), toY(10)]
      ];
      // Colour scale in photoelectrons.
      const bx = W - barW + (W < 460 ? 4 : 10), bh = Math.min(P.h, 272 * scale), by = toY(136), bw = W < 460 ? 8 : 12;
      for (let i = 0; i < bh; i++) { const c = wcdaColor(1 - i / bh); b.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`; b.fillRect(bx, by + i, bw, 1.5); }
      b.fillStyle = '#9fb3a8'; b.textAlign = 'left'; b.font = `${W < 460 ? 8 : 9.5}px ${FONT}`;
      [[1, '50000'], [.8, '3000'], [.6, '200'], [.4, '12'], [.2, '1'], [0, '0.2']].forEach(([t, text]) => b.fillText(text, bx + bw + 4, by + (1 - t) * bh + 3));
      b.fillText('Q [PE]', bx - 2, by + bh + 12);
      const r = plateau.getBoundingClientRect();
      pdpr = Math.min(devicePixelRatio || 1, 2);
      pw = r.width; ph = r.height;
      plateau.width = Math.round(pw * pdpr); plateau.height = Math.round(ph * pdpr);
    };
    measureTasks.push(layout);
    whenVisible(canvas, on => { visible = on; if (on) layout(); });

    const fire = (x, y, now, size) => {
      const sz = size == null ? Math.pow(Math.random(), 2.2) : size;
      const phi = Math.random() * 6.283, theta = 5 + Math.random() * 30;
      const small = sz < .34;
      const rejected = small && mode === 'trigger';
      seen++; if (!rejected) kept++;
      eventId++;
      shower = { x, y, t0: now, dir: [Math.cos(phi), Math.sin(phi)], R: 7 + sz * 26, peak: 25 + sz * sz * 50000, rejected, done: new Uint8Array(cells.length), speed: 620, hits: 0 };
      hits = [];
      axis = rejected ? null : { x, y, dx: Math.sin(phi), dy: Math.cos(phi), len: 40 + theta * 2.6, life: 1 };
      hud = `event ${String(eventId).padStart(4, '0')} · θ ${theta.toFixed(1)}° · φ ${(phi * 57.2958).toFixed(1)}°`;
      if (keptEl) keptEl.textContent = `${kept} / ${seen}`;
      if (rejected) say('Small shower below the trigger threshold: discarded', '低于触发阈值的小簇射：被丢弃');
      else if (small) say('Small shower kept: it stays in the data for the offline search', '小簇射被保留：留在数据中供离线搜索');
      else say('Large shower: hit times form a plateau', '大簇射：击中时间形成平台');
    };
    canvas.addEventListener('pointerdown', event => {
      const box = canvas.getBoundingClientRect();
      const x = (event.clientX - box.left - P.x) / scale - 155, y = 136 - (event.clientY - box.top - P.y) / scale;
      fire(clamp(x, -150, 150), clamp(y, -130, 130), performance.now() / 1000, .25 + Math.random() * .6);
    });
    canvas.addEventListener('pointermove', event => {
      const box = canvas.getBoundingClientRect();
      const x = (event.clientX - box.left - P.x) / scale - 155, y = 136 - (event.clientY - box.top - P.y) / scale;
      let best = -1, bestD = 16;
      for (let i = 0; i < cells.length; i++) { const dx = cells[i].x - x, dy = cells[i].y - y, d = dx * dx + dy * dy; if (d < bestD) { bestD = d; best = i; } }
      hover = best;
    });
    canvas.addEventListener('pointerleave', () => { hover = -1; });
    $$('#wcda-mode button').forEach(button => button.addEventListener('click', () => {
      mode = button.dataset.mode;
      $$('#wcda-mode button').forEach(b => b.setAttribute('aria-checked', String(b === button)));
      seen = 0; kept = 0;
      if (keptEl) keptEl.textContent = '0 / 0';
      lastAuto = -3;
    }));
    const qFromT = t => Math.pow(10, t * Math.log10(50000 / .2) + Math.log10(.2));

    frameTasks.push((dt, now) => {
      if (!visible || !W || !base) return;
      if (!shower && now - lastAuto > (reducedMotion ? 1e9 : 3.6)) {
        lastAuto = now;
        const c = cells[Math.floor(Math.random() * cells.length)];
        fire(c.x, c.y, now);
      }
      // Bright shower hits linger, noise flickers away quickly.
      for (let i = 0; i < heat.length; i++) if (heat[i] > 0) heat[i] *= Math.exp(-dt / (380 + 2600 * heat[i]));
      const noiseHits = Math.max(1, Math.round(dt * .14));
      for (let i = 0; i < noiseHits; i++) {
        const k = Math.floor(Math.random() * cells.length);
        if (heat[k] < .2) heat[k] = .1 + Math.random() * .16;
      }
      if (shower) {
        const age = now - shower.t0, front = age * shower.speed - 220;
        for (let i = 0; i < cells.length; i++) {
          if (shower.done[i]) continue;
          const c = cells[i], dx = c.x - shower.x, dy = c.y - shower.y;
          if (dx * shower.dir[0] + dy * shower.dir[1] > front) continue;
          shower.done[i] = 1;
          const r = Math.hypot(dx, dy);
          const q = shower.peak * Math.exp(-r / shower.R) * (0.55 + Math.random() * .9) + 1.6 * Math.exp(-r / 70) * Math.random();
          if (q > .35 && Math.random() < .96 * Math.exp(-r / (shower.R * 3.4))) {
            const t = clamp(Math.log10(q / .2) / Math.log10(50000 / .2));
            heat[i] = shower.rejected ? Math.min(.26, t) : Math.max(heat[i], t);
            shower.hits++;
            hits.push(shower.rejected ? (Math.random() - .5) * 4 : (r / 40) * (Math.random() - .5) * .25);
          }
        }
        if (age > 1.15) shower = null;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(base, 0, 0);
      for (let i = 0; i < cells.length; i++) {
        const t = heat[i];
        if (t < .045) continue;
        const sprite = sprites[Math.min(LEVELS - 1, Math.floor(t * LEVELS))];
        ctx.drawImage(sprite, (toX(cells[i].x)) * dpr - sprite.width / 2, (toY(cells[i].y)) * dpr - sprite.height / 2);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = `${W < 460 ? 8.5 : 10}px ${FONT}`;
      ctx.textAlign = 'left';
      tags.forEach(([text, x, y]) => {
        const w = ctx.measureText(text).width;
        ctx.fillStyle = 'rgba(8,30,25,.88)'; ctx.fillRect(x - 3, y - 10, w + 6, 13);
        ctx.fillStyle = '#d8bb73'; ctx.fillText(text, x, y);
      });
      if (axis && axis.life > 0) {
        axis.life -= dt / 2600;
        ctx.save();
        ctx.beginPath(); ctx.rect(toX(-155), toY(136), 310 * scale, 272 * scale); ctx.clip();
        ctx.strokeStyle = `rgba(243,239,220,${Math.min(1, axis.life * 1.6)})`;
        ctx.fillStyle = ctx.strokeStyle;
        ctx.lineWidth = 1.6;
        const x1 = toX(axis.x), y1 = toY(axis.y), x2 = toX(axis.x + axis.dx * axis.len), y2 = toY(axis.y + axis.dy * axis.len);
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        const a = Math.atan2(y2 - y1, x2 - x1);
        ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - Math.cos(a - .4) * 9, y2 - Math.sin(a - .4) * 9); ctx.lineTo(x2 - Math.cos(a + .4) * 9, y2 - Math.sin(a + .4) * 9); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      ctx.font = `${W < 460 ? 9 : 10.5}px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#e9e4cf';
      const info = hover >= 0
        ? `PMT ${(hover + 1).toLocaleString('en-US')} / 3,120 · (${cells[hover].x.toFixed(0)}, ${cells[hover].y.toFixed(0)}) m${heat[hover] > .045 ? ` · ${qFromT(heat[hover]).toFixed(heat[hover] > .4 ? 0 : 1)} PE` : ''}`
        : hud;
      ctx.fillText(info, toX(-152), H - 3);
      // Sorted hit times: a shower makes a flat plateau that noise cannot.
      pctx.setTransform(pdpr, 0, 0, pdpr, 0, 0);
      pctx.clearRect(0, 0, pw, ph);
      pctx.font = `10px ${FONT}`;
      pctx.fillStyle = '#9fb3a8';
      pctx.textAlign = 'left';
      pctx.fillText(zh() ? '排序后的击中时间' : 'sorted hit times', 2, 11);
      if (hits.length > 8) {
        const sorted = hits.slice().sort((a, b) => a - b);
        pctx.strokeStyle = '#d8bb73';
        pctx.lineWidth = 1.7;
        pctx.beginPath();
        const stepN = Math.max(1, Math.floor(sorted.length / 220));
        for (let i = 0; i < sorted.length; i += stepN) {
          const x = i / (sorted.length - 1) * pw, y = ph / 2 - clamp(sorted[i], -2.4, 2.4) / 2.4 * (ph / 2 - 7);
          if (i) pctx.lineTo(x, y); else pctx.moveTo(x, y);
        }
        pctx.stroke();
      } else {
        pctx.strokeStyle = 'rgba(159,179,168,.35)';
        pctx.beginPath(); pctx.moveTo(0, ph / 2); pctx.lineTo(pw, ph / 2); pctx.stroke();
      }
    });
    window.__wcdaCount = () => ({ total: cells.length, top: 60 * 22, left: 30 * 30, right: 30 * 30 });
  };

  /* ==========================================================================
     FPGA: a transformer block as a hardware pipeline. Data flows through the macros
     as bit stacks, so the width of each packet is the chosen precision.
     Sizes and accuracies are measured; the animation is illustrative.
     ========================================================================== */
  const FPGA_CONFIG = {
    32: { bits: 32, levels: '2³²', size: '8.17 MB', acc: '93.998%', packets: 22, sparse: 0, tone: 'ok', note: ['Baseline: 2.14 M weights, full precision.', '基线：214 万个权重，全精度。'] },
    prune: { bits: 32, levels: '2³²', size: '3.96 MB', acc: '93.936%', packets: 12, sparse: .5147, tone: 'ok', note: ['51.47% of weights pruned, then one epoch of fine-tuning.', '剪枝 51.47% 的权重，再微调一个 epoch。'] },
    8: { bits: 8, levels: '256', size: '2.04 MB', acc: '93.986%', packets: 22, sparse: 0, tone: 'ok', note: ['8-bit costs almost nothing.', '8 位几乎没有精度损失。'] },
    4: { bits: 4, levels: '16', size: '1.02 MB', acc: '93.352%', packets: 22, sparse: 0, tone: 'best', note: ['The sweet spot: 8× smaller, 0.65 points lost.', '最佳平衡点：缩小 8 倍，精度仅降 0.65 个百分点。'] },
    2: { bits: 2, levels: '4', size: '0.51 MB', acc: '64.687%', packets: 22, sparse: 0, tone: 'bad', note: ['Too coarse: attention falls apart.', '精度过低：注意力机制失效。'] }
  };
  const FPGA_BLOCKS = [
    { id: 'embed', x: .03, y: .14, w: .17, h: .3, en: 'Embed', cn: '嵌入', info: ['Linear layers project each particle into the embedding space.', '线性层将每个粒子投影到嵌入空间。'] },
    { id: 'qkv', x: .27, y: .14, w: .19, h: .3, en: 'Q, K, V', cn: 'Q, K, V', info: ['Three linear projections per head.', '每个注意力头执行三次线性投影。'] },
    { id: 'matmul', x: .53, y: .14, w: .19, h: .3, en: 'MatMul', cn: '矩阵乘', info: ['Query × key. This is where the DSP slices go.', '查询 × 键，DSP 资源主要消耗在这里。'] },
    { id: 'bias', x: .79, y: .14, w: .18, h: .3, en: 'U bias', cn: 'U 偏置', info: ['Pairwise particle interactions are added before softmax. This is what makes ParT physics-aware.', '在 Softmax 之前加入粒子两两相互作用，这是 ParT 融入物理信息的关键。'] },
    { id: 'softmax', x: .79, y: .6, w: .18, h: .3, en: 'Softmax', cn: 'Softmax', info: ['Built from exponential lookup tables, not floating-point division.', '基于指数查找表实现，而非浮点除法。'] },
    { id: 'matmul2', x: .53, y: .6, w: .19, h: .3, en: 'MatMul', cn: '矩阵乘', info: ['Attention × value. A second multiplier bank.', '注意力 × 值，第二组乘法器。'] },
    { id: 'norm', x: .27, y: .6, w: .19, h: .3, en: 'LayerNorm', cn: '层归一化', info: ['Layer normalization in fixed point.', '定点实现的层归一化。'] },
    { id: 'ffn', x: .03, y: .6, w: .17, h: .3, en: 'FFN', cn: '前馈网络', info: ['Feed-forward layers close the block.', '前馈层完成整个模块。'] }
  ];
  LABS.fabric = function (S) {
    const { $, $$, frameTasks, measureTasks, currentLang } = S;
    const canvas = $('#fabric'), stair = $('#fabric-stair');
    if (!canvas) return;
    const ctx = canvas.getContext('2d'), sctx = stair.getContext('2d');
    const box = canvas.closest('.fabric-box');
    const infoEl = $('#fabric-info');
    const zh = () => currentLang() === 'zh';
    let W = 0, H = 0, dpr = 1, SW = 0, SH = 0, sdpr = 1, visible = false, config = FPGA_CONFIG[32], die = null, hover = null, route = [], routeLen = 0, packets = [], blockGlow = new Float32Array(FPGA_BLOCKS.length), sparseMix = 0, bitsNow = 32;
    const rnd = seeded(77);
    const weights = Float32Array.from({ length: 19 * 11 }, () => (rnd() + rnd() + rnd() - 1.5) / 1.5);
    const prunedOrder = Float32Array.from(weights, v => Math.abs(v));
    const threshold = (() => { const s = Array.from(prunedOrder).sort((a, b) => a - b); return s[Math.floor(s.length * .5147)]; })();
    const blockRect = b => ({ x: b.x * W, y: b.y * H, w: b.w * W, h: b.h * H });
    const buildRoute = () => {
      const pts = [];
      const mid = b => { const r = blockRect(b); return [r.x + r.w / 2, r.y + r.h / 2]; };
      pts.push([0, mid(FPGA_BLOCKS[0])[1]]);
      for (let i = 0; i < 4; i++) pts.push(mid(FPGA_BLOCKS[i]));
      pts.push(mid(FPGA_BLOCKS[4]));
      for (let i = 5; i < 8; i++) pts.push(mid(FPGA_BLOCKS[i]));
      pts.push([0, mid(FPGA_BLOCKS[7])[1]]);
      route = pts;
      routeLen = 0;
      for (let i = 1; i < pts.length; i++) routeLen += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    };
    const pointAt = d => {
      let left = d * routeLen;
      for (let i = 1; i < route.length; i++) {
        const a = route[i - 1], b = route[i], seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (left <= seg) { const t = left / seg; return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, horizontal: Math.abs(b[0] - a[0]) > Math.abs(b[1] - a[1]) }; }
        left -= seg;
      }
      const last = route[route.length - 1];
      return { x: last[0], y: last[1], horizontal: true };
    };
    const layout = () => {
      const r = canvas.getBoundingClientRect();
      if (!r.width) return;
      dpr = Math.min(devicePixelRatio || 1, 2);
      W = r.width; H = r.height;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      buildRoute();
      die = document.createElement('canvas');
      die.width = canvas.width; die.height = canvas.height;
      const d = die.getContext('2d');
      d.setTransform(dpr, 0, 0, dpr, 0, 0);
      d.fillStyle = '#0a231e'; d.fillRect(0, 0, W, H);
      const cell = 7, g = seeded(3);
      for (let y = 4; y < H - 4; y += cell) for (let x = 4; x < W - 4; x += cell) { d.fillStyle = g() < .74 ? 'rgba(216,187,115,.09)' : 'rgba(243,239,220,.035)'; d.fillRect(x, y, cell - 2, cell - 2); }
      d.strokeStyle = 'rgba(216,187,115,.45)'; d.lineWidth = 2;
      d.beginPath();
      route.forEach((p, i) => { if (i) d.lineTo(p[0], p[1]); else d.moveTo(p[0], p[1]); });
      d.stroke();
      const r2 = plateRect();
      SW = r2.width; SH = r2.height;
      sdpr = dpr;
      stair.width = Math.round(SW * sdpr); stair.height = Math.round(SH * sdpr);
      seedPackets();
    };
    function plateRect() { return stair.getBoundingClientRect(); }
    function seedPackets() {
      packets = Array.from({ length: config.packets }, (_, i) => ({ d: i / config.packets, speed: .07 + Math.random() * .025, jitter: Math.random() }));
    }
    measureTasks.push(layout);
    whenVisible(canvas, on => { visible = on; if (on) layout(); });

    const setInfo = () => { infoEl.textContent = hover != null ? FPGA_BLOCKS[hover].info[zh() ? 1 : 0] : config.note[zh() ? 1 : 0]; };
    S.refreshTasks.push(setInfo);
    const select = key => {
      config = FPGA_CONFIG[key];
      $$('.bit-picker button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.bits === String(key))));
      $('#fabric-size').textContent = config.size;
      $('#fabric-acc').textContent = config.acc;
      box.dataset.tone = config.tone;
      $('#fabric-size-bar').style.transform = `scaleX(${(parseFloat(config.size) / 8.17).toFixed(3)})`;
      setInfo();
      seedPackets();
    };
    $$('.bit-picker button').forEach(b => b.addEventListener('click', () => select(b.dataset.bits)));
    const blockAt = event => {
      const r = canvas.getBoundingClientRect(), x = event.clientX - r.left, y = event.clientY - r.top;
      let found = null;
      FPGA_BLOCKS.forEach((b, i) => { const q = blockRect(b); if (x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h) found = i; });
      return found;
    };
    canvas.addEventListener('pointermove', event => { const next = blockAt(event); if (next !== hover) { hover = next; setInfo(); } });
    canvas.addEventListener('pointerleave', () => { hover = null; setInfo(); });
    canvas.addEventListener('pointerdown', event => { hover = blockAt(event); setInfo(); });
    select(32);

    const drawStair = () => {
      sctx.setTransform(sdpr, 0, 0, sdpr, 0, 0);
      sctx.clearRect(0, 0, SW, SH);
      const gridW = SW * .4, cols = 19, rows = 11, cw = gridW / cols, ch = (SH - 18) / rows;
      const bits = bitsNow, levels = Math.pow(2, Math.min(bits, 8));
      const q = v => Math.round((v + 1) / 2 * (levels - 1)) / (levels - 1);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const k = r * cols + c, v = weights[k];
          const cut = Math.abs(v) < threshold && sparseMix > .5;
          if (cut) { sctx.fillStyle = 'rgba(243,239,220,.05)'; }
          else {
            const t = q(v);
            const g = t < .5 ? [26 + t * 2 * 190, 64 + t * 2 * 123, 52 + t * 2 * 63] : [216 + (t - .5) * 2 * 27, 187 + (t - .5) * 2 * 52, 115 + (t - .5) * 2 * 105];
            sctx.fillStyle = `rgb(${g.map(Math.round).join(',')})`;
          }
          sctx.fillRect(c * cw + .5, r * ch + 16, Math.max(1, cw - 1), Math.max(1, ch - 1));
        }
      }
      sctx.font = `10px ${FONT}`; sctx.fillStyle = '#9fb3a8'; sctx.textAlign = 'left';
      sctx.fillText(zh() ? '权重矩阵' : 'weights', 0, 10);
      const ox = gridW + 18, pw = SW - ox - 2, ph = SH - 20, oy = 16;
      sctx.fillText(zh() ? `量化级数：${config.levels}` : `quantization levels: ${config.levels}`, ox, 10);
      const f = x => .5 + .42 * Math.sin(x * 6.283 * 1.15 + .4) * (.75 + .25 * Math.cos(x * 9));
      sctx.strokeStyle = 'rgba(243,239,220,.28)'; sctx.lineWidth = 1;
      sctx.beginPath();
      for (let i = 0; i <= 90; i++) { const x = i / 90, y = oy + ph - f(x) * ph; if (i) sctx.lineTo(ox + x * pw, y); else sctx.moveTo(ox + x * pw, y); }
      sctx.stroke();
      sctx.strokeStyle = config.tone === 'bad' ? '#d98a5f' : '#f3efdc'; sctx.lineWidth = 1.8;
      sctx.beginPath();
      const steps = Math.min(240, Math.pow(2, Math.min(bits, 8)) * 8);
      const L = levels - 1;
      for (let i = 0; i <= steps; i++) {
        const x = i / steps, v = Math.round(f(x) * L) / L, y = oy + ph - v * ph;
        if (i) sctx.lineTo(ox + x * pw, y); else sctx.moveTo(ox + x * pw, y);
      }
      sctx.stroke();
    };

    frameTasks.push(dt => {
      if (!visible || !W || !die) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(die, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      bitsNow = config.bits;
      sparseMix += ((config.sparse ? 1 : 0) - sparseMix) * .12;
      const bad = config.tone === 'bad';
      const color = bad ? '#d98a5f' : '#f3efdc';
      const decay = Math.exp(-dt / 320);
      packets.forEach(p => {
        p.d += p.speed * dt / 1000;
        if (p.d > 1) { p.d -= 1; }
        const pt = pointAt(p.d);
        FPGA_BLOCKS.forEach((b, i) => { const q = blockRect(b); if (pt.x >= q.x && pt.x <= q.x + q.w && pt.y >= q.y && pt.y <= q.y + q.h) blockGlow[i] = 1; });
      });
      FPGA_BLOCKS.forEach((b, i) => {
        blockGlow[i] *= decay;
        const q = blockRect(b), g = blockGlow[i], on = hover === i;
        ctx.fillStyle = '#0e2c25';
        ctx.fillRect(q.x, q.y, q.w, q.h);
        ctx.fillStyle = bad ? `rgba(217,138,95,${g * .16})` : `rgba(243,239,220,${g * .14})`;
        ctx.fillRect(q.x, q.y, q.w, q.h);
        ctx.strokeStyle = on ? '#ffffff' : `rgba(216,187,115,${.45 + g * .55})`;
        ctx.lineWidth = on ? 1.6 : 1;
        ctx.strokeRect(q.x + .5, q.y + .5, q.w - 1, q.h - 1);
        // Name in the corner, so data running through the middle never covers it.
        ctx.font = `${W < 460 ? 9 : 11.5}px ${FONT}`;
        ctx.textAlign = 'left';
        ctx.fillStyle = on ? '#fff' : '#f3efdc';
        ctx.fillText(zh() ? b.cn : b.en, q.x + 7, q.y + (W < 460 ? 13 : 16));
      });
      // Each packet is a stack of bits: its thickness is the precision.
      const thickness = config.bits >= 32 ? 18 : config.bits === 8 ? 10 : config.bits === 4 ? 6 : 3;
      const lines = config.bits >= 32 ? 9 : config.bits === 8 ? 5 : config.bits === 4 ? 3 : 2;
      packets.forEach(p => {
        const pt = pointAt(p.d);
        const bx = pt.x, by = pt.y;
        ctx.fillStyle = color;
        for (let k = 0; k < lines; k++) {
          const off = (k - (lines - 1) / 2) * (thickness / lines);
          if (pt.horizontal) ctx.fillRect(bx - 5, by + off - .6, 10, 1.2);
          else ctx.fillRect(bx + off - .6, by - 5, 1.2, 10);
        }
        if (bad && p.jitter > .55) { ctx.fillStyle = 'rgba(217,138,95,.5)'; ctx.fillRect(bx + (p.jitter - .75) * 40, by - 9, 3, 3); }
      });
      ctx.font = `${W < 460 ? 8.5 : 10}px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#d8bb73';
      ctx.fillText(zh() ? 'ParT 注意力模块 · hls4ml 流水线' : 'ParT attention block · hls4ml pipeline', 8, 14);
      drawStair();
    });
  };

  /* ==========================================================================
     Local assistant: a scripted replay of how one request moves through the stack.
     ========================================================================== */
  const AGENT_TOOLS = [['search', 'Search', '搜索', 165], ['terminal', 'Terminal', '终端', 215], ['files', 'Files', '文件', 270], ['calendar', 'Calendar', '日程', 325], ['memory', 'Memory', '记忆', 15]];
  const AGENT_SCENES = [
    { ask: ['Summarize today’s papers on speculative decoding.', '总结今天关于投机解码的论文。'],
      steps: [['ask', null, 'Your message reaches Hermes, running on my own machine.', '消息到达运行在我自己机器上的 Hermes。'],
        ['plan', null, 'Hermes makes a plan: search, read, summarize.', 'Hermes 制定计划：搜索、阅读、总结。'],
        ['tool', 'search', 'It calls the web-search tool.', '它调用网页搜索工具。'],
        ['tool', 'memory', 'It remembers that you study draft budgets.', '它记得你在研究草稿预算。'],
        ['engine', null, 'llama.cpp or Ollama runs Qwen3.8-27B locally.', 'llama.cpp 或 Ollama 在本地运行 Qwen3.8-27B。'],
        ['stream', null, 'The answer streams back to the phone, token by token.', '答案逐个 token 流回手机。']],
      reply: ['Three papers stood out today. I sorted them by how close they are to your draft-budget study. Want the notes in your reading list?', '今天有三篇论文值得关注，我按与你的草稿预算研究的相关度排好了序。要把笔记加入阅读清单吗？'] },
    { ask: ['Is the GPU server still healthy?', 'GPU 服务器还正常吗？'],
      steps: [['ask', null, 'Your message reaches Hermes.', '消息到达 Hermes。'],
        ['plan', null, 'Hermes plans: check first, report, change nothing yet.', 'Hermes 计划：先检查、再汇报，暂不做改动。'],
        ['tool', 'terminal', 'It runs nvidia-smi through the terminal tool.', '它通过终端工具运行 nvidia-smi。'],
        ['engine', null, 'Qwen3.8-27B reads the output locally.', 'Qwen3.8-27B 在本地读取输出。'],
        ['stream', null, 'A short status report streams back.', '简短的状态报告流回手机。']],
      reply: ['All four GPUs are up. Memory and temperature look normal, and your vLLM job is still running.', '四块 GPU 都在线，显存和温度正常，你的 vLLM 任务仍在运行。'] },
    { ask: ['Remind me about the job fair at 8 tomorrow.', '明天 8 点提醒我去招聘会。'],
      steps: [['ask', null, 'Your message reaches Hermes.', '消息到达 Hermes。'],
        ['tool', 'calendar', 'It schedules the reminder.', '它设置提醒。'],
        ['tool', 'memory', 'It saves the job fair to memory.', '它把招聘会记入记忆。'],
        ['engine', null, 'Qwen3.8-27B writes the confirmation.', 'Qwen3.8-27B 撰写确认消息。'],
        ['stream', null, 'The confirmation streams back.', '确认消息流回手机。']],
      reply: ['Done. I will remind you at 8:00 tomorrow. I am awake all night anyway.', '好的，明天 8:00 提醒你。反正我整晚都在线。'] }
  ];
  LABS.assistant = function (S) {
    const { $, $$, FX, reducedMotion, currentLang, refreshTasks, frameTasks, measureTasks, fitCanvas } = S;
    const box = $('#agent');
    if (!box) return;
    const chat = $('#agent-chat'), stepEl = $('#agent-step'), prompts = $$('.agent-prompts button', box), canvas = $('#agent-canvas'), timeEl = $('#agent-time'), phone = $('.agent-phone', box);
    const ctx = canvas.getContext('2d');
    const zh = () => (currentLang() === 'zh' ? 1 : 0);
    let W = 0, H = 0, dpr = 1, visible = false, timers = [], current = 0, playing = false, userPicked = false, G = null;
    const stage = { phase: 'idle', tool: null, t0: 0 };
    const avatar = new Image(), qwenMark = new Image();
    avatar.src = 'assets/showcase/logo-hermes.png';
    qwenMark.src = 'assets/showcase/logo-qwen-mark.png';
    const layout = () => {
      const a = fitCanvas(canvas); W = a.w; H = a.h; dpr = a.dpr;
      const R = Math.min(W * .44, H * .46), c = { x: W * .55, y: H * .5 };
      const pr = phone.getBoundingClientRect(), cr = canvas.getBoundingClientRect();
      const side = pr.right <= cr.left + 4;
      G = { R, c, orbit: R * .62, phone: side ? { x: 0, y: Math.min(H - 10, Math.max(10, pr.top + pr.height / 2 - cr.top)) } : { x: W / 2, y: 0 } };
    };
    measureTasks.push(layout);
    const toolPos = (deg, now) => { const a = (deg + Math.sin(now * .6 + deg) * 2) * Math.PI / 180; return { x: G.c.x + Math.cos(a) * G.orbit, y: G.c.y + Math.sin(a) * G.orbit }; };
    const enginePos = () => ({ x: G.c.x, y: G.c.y + G.orbit });
    const beam = (A, B, color, now, count, bend) => {
      const mx = (A.x + B.x) / 2 + (B.y - A.y) * (bend || .18), my = (A.y + B.y) / 2 - (B.x - A.x) * (bend || .18);
      ctx.strokeStyle = color.replace('1)', '.25)'); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.quadraticCurveTo(mx, my, B.x, B.y); ctx.stroke();
      ctx.fillStyle = color.replace('1)', '.95)');
      for (let i = 0; i < count; i++) {
        const t = (now * .9 + i / count) % 1, u = 1 - t;
        const x = u * u * A.x + 2 * u * t * mx + t * t * B.x, y = u * u * A.y + 2 * u * t * my + t * t * B.y;
        ctx.beginPath(); ctx.arc(x, y, 2.4, 0, 6.283); ctx.fill();
      }
    };
    const node = (p, r, fill, stroke, lw) => { ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.2; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.283); ctx.fill(); ctx.stroke(); };
    const text = (t, x, y, color, size, align, weight) => { ctx.font = `${weight || ''} ${size}px ${FONT}`; ctx.fillStyle = color; ctx.textAlign = align || 'center'; ctx.fillText(t, x, y); };
    const glyph = (kind, p, s, color) => { // Small line icons for each tool.
      ctx.strokeStyle = color; ctx.lineWidth = 1.3; ctx.beginPath();
      if (kind === 'search') { ctx.arc(p.x - s * .15, p.y - s * .15, s * .38, 0, 6.283); ctx.moveTo(p.x + s * .14, p.y + s * .14); ctx.lineTo(p.x + s * .5, p.y + s * .5); }
      else if (kind === 'terminal') { ctx.moveTo(p.x - s * .5, p.y - s * .3); ctx.lineTo(p.x - s * .1, p.y); ctx.lineTo(p.x - s * .5, p.y + s * .3); ctx.moveTo(p.x, p.y + s * .35); ctx.lineTo(p.x + s * .5, p.y + s * .35); }
      else if (kind === 'files') { ctx.rect(p.x - s * .35, p.y - s * .45, s * .7, s * .9); ctx.moveTo(p.x - s * .18, p.y - s * .1); ctx.lineTo(p.x + s * .18, p.y - s * .1); ctx.moveTo(p.x - s * .18, p.y + s * .12); ctx.lineTo(p.x + s * .18, p.y + s * .12); }
      else if (kind === 'calendar') { ctx.rect(p.x - s * .45, p.y - s * .35, s * .9, s * .8); ctx.moveTo(p.x - s * .45, p.y - s * .1); ctx.lineTo(p.x + s * .45, p.y - s * .1); ctx.moveTo(p.x - s * .2, p.y - s * .5); ctx.lineTo(p.x - s * .2, p.y - s * .25); ctx.moveTo(p.x + s * .2, p.y - s * .5); ctx.lineTo(p.x + s * .2, p.y - s * .25); }
      else { ctx.arc(p.x, p.y, s * .42, 0, 6.283); ctx.moveTo(p.x - s * .42, p.y); ctx.lineTo(p.x + s * .42, p.y); ctx.moveTo(p.x, p.y - s * .42); ctx.lineTo(p.x, p.y + s * .42); }
      ctx.stroke();
    };
    const draw = now => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const { R, c } = G, age = now - stage.t0;
      // The 24-hour dial: always running, the current Beijing hour lit.
      const hour = +new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', hour12: false }).format(new Date()) % 24;
      ctx.strokeStyle = 'rgba(216,187,115,.18)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(c.x, c.y, R, 0, 6.283); ctx.stroke();
      for (let i = 0; i < 24; i++) {
        const a = i / 24 * 6.283 - Math.PI / 2, on = i === hour, L = on ? 10 : i % 6 ? 4 : 7;
        ctx.strokeStyle = on ? '#d8bb73' : 'rgba(216,187,115,.45)'; ctx.lineWidth = on ? 2.6 : 1.2;
        ctx.beginPath(); ctx.moveTo(c.x + Math.cos(a) * (R - L), c.y + Math.sin(a) * (R - L)); ctx.lineTo(c.x + Math.cos(a) * R, c.y + Math.sin(a) * R); ctx.stroke();
        if (i % 6 === 0) text(String(i).padStart(2, '0'), c.x + Math.cos(a) * (R + 11), c.y + Math.sin(a) * (R + 11) + 3, '#9fb3a8', 9);
      }
      const sweep = now * .5 % 6.283;
      ctx.strokeStyle = 'rgba(216,187,115,.55)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(c.x, c.y, R, sweep, sweep + .5); ctx.stroke();
      text('24/7', c.x + R * .74, c.y - R * .78, '#d8bb73', 11, 'center', '500');
      ctx.strokeStyle = 'rgba(243,239,220,.08)'; ctx.setLineDash([3, 5]);
      ctx.beginPath(); ctx.arc(c.x, c.y, G.orbit, 0, 6.283); ctx.stroke(); ctx.setLineDash([]);
      // Beams for the current phase.
      const E = enginePos();
      if (stage.phase === 'ask') beam(G.phone, c, 'rgba(243,239,220,1)', now, 6, .12);
      if (stage.phase === 'tool' && stage.tool) { const t = AGENT_TOOLS.find(x => x[0] === stage.tool); const p = toolPos(t[3], now); beam(c, p, 'rgba(216,187,115,1)', now, 4, .25); beam(p, c, 'rgba(132,199,162,1)', now + .5, 3, .25); }
      if (stage.phase === 'engine') beam(c, E, 'rgba(216,187,115,1)', now, 5, .3);
      if (stage.phase === 'stream') beam(E, G.phone, 'rgba(216,187,115,1)', now * 1.4, 12, -.15);
      // Tools on the orbit.
      AGENT_TOOLS.forEach(([kind, en, cn, deg]) => {
        const p = toolPos(deg, now), on = stage.phase === 'tool' && stage.tool === kind, r = Math.max(14, R * .11);
        node(p, r, on ? '#d8bb73' : '#0c2923', on ? '#d8bb73' : 'rgba(243,239,220,.35)');
        glyph(kind, p, r * .9, on ? '#0c2923' : '#e9e4cf');
        text(zh() ? cn : en, p.x, p.y + r + 13, on ? '#d8bb73' : '#b7c5b8', 10);
      });
      // The engine: llama.cpp or Ollama, running Qwen.
      const ew = Math.max(110, R * .86), eh = Math.max(34, R * .26), engineOn = stage.phase === 'engine' || stage.phase === 'stream';
      ctx.fillStyle = engineOn ? '#123a30' : '#0c2923'; ctx.strokeStyle = engineOn ? '#d8bb73' : 'rgba(243,239,220,.35)'; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(E.x - ew / 2, E.y - eh / 2, ew, eh, 6) : ctx.rect(E.x - ew / 2, E.y - eh / 2, ew, eh); ctx.fill(); ctx.stroke();
      for (let k = 0; k < 7; k++) { const px = E.x - ew / 2 + (k + 1) * ew / 8; ctx.beginPath(); ctx.moveTo(px, E.y + eh / 2); ctx.lineTo(px, E.y + eh / 2 + 5); ctx.moveTo(px, E.y - eh / 2); ctx.lineTo(px, E.y - eh / 2 - 5); ctx.stroke(); }
      const markS = eh * .62;
      if (qwenMark.complete && qwenMark.naturalWidth) ctx.drawImage(qwenMark, E.x - ew / 2 + 8, E.y - markS / 2, markS, markS);
      text('Qwen3.8-27B', E.x + markS / 2 + 2, E.y + 4, engineOn ? '#d8bb73' : '#f3efdc', 12, 'center', '500');
      text('llama.cpp / Ollama', E.x, E.y + eh / 2 + 18, '#9fb3a8', 9.5);
      // Hermes at the centre.
      const hr = Math.max(26, R * .2), pulse = stage.phase === 'plan' ? (age * 1.2) % 1 : 0;
      if (pulse) { ctx.strokeStyle = `rgba(216,187,115,${1 - pulse})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(c.x, c.y, hr + pulse * 26, 0, 6.283); ctx.stroke(); }
      node(c, hr, '#ffffff', stage.phase === 'idle' ? 'rgba(216,187,115,.6)' : '#d8bb73', 2.2);
      if (avatar.complete && avatar.naturalWidth) { ctx.save(); ctx.beginPath(); ctx.arc(c.x, c.y, hr - 2, 0, 6.283); ctx.clip(); ctx.drawImage(avatar, c.x - hr + 2, c.y - hr + 2, hr * 2 - 4, hr * 2 - 4); ctx.restore(); }
      ctx.fillStyle = 'rgba(7,29,25,.85)'; ctx.fillRect(c.x - 34, c.y + hr + 4, 68, 17);
      text('Hermes Agent', c.x, c.y + hr + 16, '#f3efdc', 11, 'center', '500');
    };
    frameTasks.push((dt, now) => { if (visible && W && G) draw(now); });

    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    const bubble = (cls, t) => {
      const el = document.createElement('p');
      el.className = `agent-msg ${cls}`;
      el.textContent = t;
      chat.append(el);
      while (chat.children.length > 2) chat.firstChild.remove();
      return el;
    };
    const setPhase = (phase, tool) => { stage.phase = phase; stage.tool = tool || null; stage.t0 = performance.now() / 1000; };
    const stop = () => { timers.forEach(clearTimeout); timers = []; playing = false; setPhase('idle'); };
    const play = index => {
      stop();
      current = index; playing = true;
      const scene = AGENT_SCENES[index], lang = zh();
      prompts.forEach((p, i) => p.setAttribute('aria-pressed', String(i === index)));
      chat.textContent = '';
      bubble('me', scene.ask[lang]);
      const pace = reducedMotion ? 0 : 1300;
      let t = 250;
      scene.steps.forEach(([phase, tool, en, cn], k) => {
        later(() => {
          setPhase(phase, tool);
          stepEl.innerHTML = `<b>${k + 1}/${scene.steps.length}</b> ${zh() ? cn : en}`;
          if (phase === 'stream') {
            const el = bubble('bot', '');
            const words = lang ? [...scene.reply[lang]] : scene.reply[lang].split(' ');
            let i = 0;
            const type = () => {
              i++;
              el.textContent = words.slice(0, i).join(lang ? '' : ' ');
              if (i < words.length) timers.push(setTimeout(type, reducedMotion ? 0 : lang ? 45 : 85));
              else later(() => {
                setPhase('idle'); playing = false;
                if (!userPicked && visible && FX && !reducedMotion) later(() => play((current + 1) % AGENT_SCENES.length), 2600);
              }, 900);
            };
            type();
          }
        }, t);
        t += pace;
      });
    };
    prompts.forEach((p, i) => p.addEventListener('click', () => { userPicked = true; play(i); }));
    const labelPrompts = () => prompts.forEach((p, i) => { p.textContent = AGENT_SCENES[i].ask[zh()]; });
    labelPrompts();
    refreshTasks.push(() => { labelPrompts(); if (!playing) stepEl.textContent = ''; });
    const clock = () => { if (timeEl) timeEl.textContent = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' }).format(new Date()); };
    clock(); setInterval(clock, 30000);
    whenVisible(box, on => {
      visible = on;
      if (on) { layout(); if (!playing) play(current); } else stop();
    });
  };
})();
