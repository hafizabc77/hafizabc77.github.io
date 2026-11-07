/* Hand-written motion engine. One requestAnimationFrame loop drives everything:
   smooth scrolling, scroll-linked effects, the cursor and the WebGL stage.
   Every feature starts through safe(), so one failure cannot take down the page. */
(function () {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const root = document.documentElement;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FX = root.classList.contains('fx');
  const FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const CJK = /[　-鿿＀-￯]/;
  const params = new URLSearchParams(location.search);

  function safe(name, fn) {
    try { return fn(); } catch (error) { console.error(`[${name}]`, error); return undefined; }
  }

  const frameTasks = [];
  const measureTasks = [];
  const refreshTasks = []; // Run after the language changes.
  const state = { y: window.scrollY, smoothY: window.scrollY, velocity: 0, vw: innerWidth, vh: innerHeight };

  /* Canvas helper: size to the element and the device pixel ratio. */
  function fitCanvas(canvas) {
    const box = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(box.width * dpr)), h = Math.max(1, Math.round(box.height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    return { w: box.width, h: box.height, dpr };
  }

  /* ---------- Text splitting ---------- */
  function splitChars(el) {
    let i = 0;
    const walk = node => {
      [...node.childNodes].forEach(child => {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach(token => {
            if (!token) return;
            if (/^\s+$/.test(token)) { frag.append(' '); return; }
            const groups = CJK.test(token) ? [...token] : [token];
            groups.forEach(group => {
              const word = document.createElement('span');
              word.className = 'w';
              word.setAttribute('aria-hidden', 'true');
              [...group].forEach(ch => {
                const c = document.createElement('span');
                c.className = 'c';
                c.style.setProperty('--i', i++);
                c.textContent = ch;
                word.append(c);
              });
              frag.append(word);
            });
          });
          child.replaceWith(frag);
        } else if (child.nodeType === 1 && child.tagName !== 'BR') {
          walk(child);
        }
      });
    };
    el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
    walk(el);
  }

  function splitWords(el) {
    // Keeps inline markup such as <i> for emphasis; only the text inside is split into words.
    el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
    const walk = node => {
      [...node.childNodes].forEach(child => {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).filter(Boolean).forEach(word => {
            if (/^\s+$/.test(word)) { frag.append(' '); return; }
            (CJK.test(word) ? [...word] : [word]).forEach(part => {
              const span = document.createElement('span');
              span.className = 'sw';
              span.setAttribute('aria-hidden', 'true');
              span.textContent = part;
              frag.append(span);
            });
          });
          child.replaceWith(frag);
        } else if (child.nodeType === 1 && child.tagName !== 'BR') {
          walk(child);
        }
      });
    };
    walk(el);
  }

  function applySplits() {
    if (!FX) return;
    $$('[data-split]').forEach(splitChars);
    $$('[data-words]').forEach(splitWords);
  }

  /* ---------- "Decoding" text effect: glyphs resolve left to right ---------- */
  const GLYPHS = '01<>/#%×ΔΣ∇▌';
  function scramble(el, duration = 750) {
    if (!FX || el._scrambling) return;
    const final = el.textContent;
    if (!final || CJK.test(final)) return;
    el._scrambling = true;
    el.setAttribute('aria-label', final);
    if (getComputedStyle(el).writingMode === 'horizontal-tb') el.style.minWidth = `${el.getBoundingClientRect().width}px`;
    const start = performance.now();
    const tick = now => {
      if (el._scrambleCancel) { el._scrambling = false; el._scrambleCancel = false; return; }
      const t = clamp((now - start) / duration);
      const solved = Math.floor(t * final.length);
      let out = final.slice(0, solved);
      for (let i = solved; i < final.length; i++) out += final[i] === ' ' ? ' ' : GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      el.textContent = out;
      if (t < 1) requestAnimationFrame(tick);
      else { el.textContent = final; el._scrambling = false; el.style.minWidth = ''; }
    };
    requestAnimationFrame(tick);
  }

  /* ---------- Language ----------
     Order: ?lang= link, the visitor's earlier choice, then the phone's language. */
  const CHOICE_KEY = 'hafiz-lang-choice';
  function initialLanguage() {
    const param = params.get('lang');
    if (param === 'zh' || param === 'en') return param;
    let stored = null;
    try { stored = localStorage.getItem(CHOICE_KEY); } catch (e) { /* storage can be blocked */ }
    if (stored === 'zh' || stored === 'en') return stored;
    return (navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
  }
  const currentLang = () => (root.lang === 'en' ? 'en' : 'zh');
  function translate(scope, lang) {
    $$('[data-en]', scope).forEach(el => { el.innerHTML = el.dataset[lang]; });
  }
  function setLanguage(lang) {
    root.lang = lang === 'zh' ? 'zh-CN' : 'en';
    $$('[data-scramble-hover],[data-scramble]').forEach(el => { if (el._scrambling) el._scrambleCancel = true; });
    translate(document, lang);
    const title = root.dataset[lang === 'zh' ? 'titleZh' : 'titleEn'];
    if (title) document.title = title;
    $$('[data-resume]').forEach(a => { a.href = `assets/Mustofa-Ahmed-Resume-${lang === 'zh' ? 'ZH' : 'EN'}.pdf`; });
    const button = $('#language');
    button.textContent = lang === 'zh' ? 'EN' : '中文';
    button.lang = lang === 'zh' ? 'en' : 'zh-CN';
    button.setAttribute('aria-label', lang === 'zh' ? 'Switch to English' : '切换到中文');
    applySplits();
    refreshTasks.forEach(task => safe('refresh', task));
    measureAll();
  }

  /* ---------- Measuring ---------- */
  let measureTimer;
  function measureAll() {
    state.vw = innerWidth;
    state.vh = innerHeight;
    measureTasks.forEach(task => safe('measure', task));
  }
  function measureSoon() {
    clearTimeout(measureTimer);
    measureTimer = setTimeout(measureAll, 120);
  }
  const docTop = el => el.getBoundingClientRect().top + window.scrollY;

  /* ---------- Smooth scroll ---------- */
  let lenis = null;
  function initScroll() {
    if (FX && FINE && window.Lenis) {
      lenis = new window.Lenis({
        lerp: 0.12, wheelMultiplier: 1, smoothWheel: true,
        prevent: node => node.classList.contains('case-scroll') || node.tagName === 'DIALOG' || node.id === 'palette-list'
      });
      root.classList.add('lenis', 'lenis-smooth');
    }
    window.__jump = y => { if (lenis) lenis.scrollTo(y, { immediate: true, force: true }); else window.scrollTo({ top: y, behavior: 'instant' }); };
    document.addEventListener('click', event => {
      const link = event.target.closest('a[href^="#"]');
      if (!link) return;
      const id = link.getAttribute('href').slice(1);
      const target = id ? document.getElementById(id) : null;
      if (!target) return;
      event.preventDefault();
      goTo(target);
    });
  }
  function goTo(target) {
    let y = docTop(target);
    const panel = target.closest('.panel');
    if (panel && root.classList.contains('h-scroll') && horizontal) y = horizontal.yForPanel(panel);
    else if (target.id !== 'home') y -= 10;
    if (target.id === 'home') y = 0;
    // Start first: if a closing dialog restarted Lenis afterwards, that would cancel this scroll.
    if (lenis) { lenis.start(); lenis.scrollTo(y, { duration: 1.5, force: true }); }
    else window.scrollTo({ top: y, behavior: FX ? 'smooth' : 'auto' });
  }

  /* ---------- Reveal on entering the screen ---------- */
  function initReveal() {
    if (!FX) return;
    const io = new IntersectionObserver(entries => entries.forEach(({ target, isIntersecting }) => {
      if (!isIntersecting) return;
      target.classList.add('in');
      if (target.hasAttribute('data-scramble')) scramble(target);
      io.unobserve(target);
    }), { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    $$('[data-split],[data-reveal],[data-scramble]').forEach(el => { if (!el.closest('.hero')) io.observe(el); });
    $$('[data-reveal]').forEach(el => {
      const siblings = el.parentElement ? [...el.parentElement.children].filter(c => c.hasAttribute('data-reveal')) : [];
      el.style.setProperty('--d', `${Math.max(0, siblings.indexOf(el)) * 70}ms`);
    });
    $$('.creative-hero [data-rise]').forEach(el => io.observe(el));
    $$('[data-scramble-hover]').forEach(el => {
      const host = el.closest('a') || el;
      host.addEventListener('pointerenter', () => { if (FINE) scramble(el, 420); });
    });
  }

  /* Hero entrance, started when the preloader leaves. */
  function heroIn() {
    const hero = $('.hero');
    if (!hero) return;
    $$('[data-split]', hero).forEach(el => el.classList.add('in'));
    $$('[data-rise]', hero).forEach((el, i) => {
      el.style.setProperty('--d', `${240 + i * 75}ms`);
      el.classList.add('in');
    });
    $$('[data-scramble]', hero).forEach(el => scramble(el));
    if (FX) $$('[data-count]', hero).forEach(countUp);
  }
  function countUp(el) {
    const end = parseFloat(el.dataset.count), decimals = +el.dataset.decimals || 0, suffix = el.dataset.suffix || '';
    const start = performance.now(), duration = 1500;
    el.style.minWidth = `${el.getBoundingClientRect().width}px`;
    const tick = now => {
      const t = clamp((now - start) / duration), eased = 1 - Math.pow(1 - t, 4);
      el.textContent = (end * eased).toFixed(decimals) + suffix;
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /* ---------- Preloader: tokens stream in like a model generating ---------- */
  function runLoader() {
    const loader = $('#loader');
    if (!loader || !FX || root.classList.contains('intro-done')) {
      if (loader) loader.remove();
      heroIn();
      return;
    }
    const num = $('#loader-num'), label = $('#loader-text'), tokens = $$('.loader-tokens i', loader), stream = $('#loader-stream');
    const zh = currentLang() === 'zh';
    const phases = zh ? ['正在加载权重', '正在预热 GPU', '准备就绪'] : ['Loading weights', 'Warming up GPU', 'Ready'];
    const words = zh ? ['让', 'AI 模型', '快到', '能真正', '落地。'] : ['AI models,', 'fast', 'enough for', 'the real', 'world.'];
    let shown = 0;
    label.textContent = phases[0];
    const start = performance.now(), duration = 1250;
    const tick = now => {
      const t = clamp((now - start) / duration), eased = 1 - Math.pow(1 - t, 2.2);
      const pct = Math.round(eased * 100);
      num.textContent = pct;
      label.textContent = phases[pct < 55 ? 0 : pct < 100 ? 1 : 2];
      tokens.forEach((token, i) => token.classList.toggle('on', i < Math.round(eased * tokens.length)));
      const due = Math.floor(t * (words.length + 0.5));
      while (shown < Math.min(due, words.length)) {
        const span = document.createElement('span');
        span.textContent = words[shown];
        if (shown === words.length - 1) span.className = 'last';
        stream.append(span);
        shown += 1;
      }
      if (t < 1) { requestAnimationFrame(tick); return; }
      try { sessionStorage.setItem('hafiz-intro-done', '1'); } catch (e) { /* ignore */ }
      setTimeout(() => {
        loader.classList.add('done');
        setTimeout(heroIn, 220);
        setTimeout(() => loader.remove(), 1100);
      }, 140);
    };
    requestAnimationFrame(tick);
  }

  /* ---------- Page transitions ---------- */
  function initTransitions() {
    if (root.classList.contains('wipe-in')) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        root.classList.add('wipe-leaving');
        setTimeout(() => root.classList.remove('wipe-in', 'wipe-leaving'), 900);
      }));
    }
    window.addEventListener('pageshow', event => { if (event.persisted) root.classList.remove('wipe-out', 'wipe-in', 'wipe-leaving'); });
    document.addEventListener('click', event => {
      const link = event.target.closest('a[href$=".html"]');
      if (!link || link.target || event.metaKey || event.ctrlKey || event.shiftKey) return;
      event.preventDefault();
      const url = `${link.getAttribute('href')}?lang=${currentLang()}`;
      if (!FX) { location.href = url; return; }
      try { sessionStorage.setItem('hafiz-wipe', '1'); } catch (e) { /* ignore */ }
      root.classList.add('wipe-out');
      setTimeout(() => { location.href = url; }, 700);
    });
  }

  /* ---------- Cursor, magnetic elements, tilt and spotlight ---------- */
  const pointer = { x: -100, y: -100, active: false };
  function initPointer() {
    if (!FX || !FINE) return;
    root.classList.add('has-cursor');
    const ring = $('.cursor'), dot = $('.cursor-dot'), label = $('.cursor-label');
    let rx = -100, ry = -100;
    document.addEventListener('pointermove', event => {
      pointer.x = event.clientX; pointer.y = event.clientY; pointer.active = true;
      if (scene) scene.pointer(event.clientX, event.clientY);
    }, { passive: true });
    document.addEventListener('pointerover', event => {
      const el = event.target.closest('[data-cursor],a,button,summary,input,label,video');
      // A filled cursor label would cover a button's own text, so buttons just get the larger ring.
      const text = el && !el.closest('.button,.seg,.bit-picker,.role-tab,.copy,.track-play,.agent-prompts') && el.dataset.cursor;
      ring.classList.toggle('is-label', !!text);
      ring.classList.toggle('is-link', !!el && !text);
      label.textContent = text || '';
    }, { passive: true });
    document.addEventListener('pointerdown', () => ring.classList.add('is-down'));
    document.addEventListener('pointerup', () => ring.classList.remove('is-down'));
    root.addEventListener('pointerleave', () => { if (scene) scene.pointerLeave(); });
    frameTasks.push(() => {
      rx = lerp(rx, pointer.x, 0.2);
      ry = lerp(ry, pointer.y, 0.2);
      ring.style.transform = `translate3d(${rx}px,${ry}px,0)`;
      dot.style.transform = `translate3d(${pointer.x}px,${pointer.y}px,0)`;
    });
    wireHover(document);
  }
  function wireHover(scope) {
    if (!FX || !FINE) return;
    $$('[data-magnetic]', scope).forEach(el => {
      el.style.transition = 'transform .6s var(--ease)';
      el.addEventListener('pointermove', event => {
        const box = el.getBoundingClientRect();
        const x = event.clientX - box.left - box.width / 2, y = event.clientY - box.top - box.height / 2;
        el.style.transition = 'transform .12s linear';
        el.style.transform = `translate(${x * 0.3}px,${y * 0.42}px)`;
      });
      el.addEventListener('pointerleave', () => {
        el.style.transition = 'transform .7s var(--ease)';
        el.style.transform = '';
      });
    });
    $$('[data-tilt]', scope).forEach(el => {
      el.addEventListener('pointermove', event => {
        const box = el.getBoundingClientRect();
        el.style.setProperty('--ry', `${((event.clientX - box.left) / box.width - 0.5) * 9}deg`);
        el.style.setProperty('--rx', `${-((event.clientY - box.top) / box.height - 0.5) * 9}deg`);
      });
      el.addEventListener('pointerleave', () => { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); });
    });
    $$('[data-spot]', scope).forEach(el => {
      el.addEventListener('pointermove', event => {
        const box = el.getBoundingClientRect();
        el.style.setProperty('--mx', `${event.clientX - box.left}px`);
        el.style.setProperty('--my', `${event.clientY - box.top}px`);
      });
    });
  }

  /* ---------- Header, progress bar and section rail ---------- */
  function initChrome() {
    const header = $('.site-header'), bar = $('.progress');
    const rail = $('.rail');
    const sections = $$('[data-rail-en]');
    let tops = [], maxScroll = 1, lastY = 0, current = -1;
    measureTasks.push(() => {
      tops = sections.map(docTop);
      maxScroll = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    });
    const railName = rail && $('.rail-name', rail), railIndex = rail && $('.rail-index', rail), railFill = rail && $('.rail-line i', rail);
    const updateRail = force => {
      if (!rail) return;
      let index = 0;
      tops.forEach((top, i) => { if (state.y + state.vh * 0.45 >= top) index = i; });
      if (index === current && !force) return;
      current = index;
      rail.classList.toggle('over-panels', sections[index].id === 'projects');
      railIndex.textContent = String(index + 1).padStart(2, '0');
      railName.textContent = sections[index].dataset[currentLang() === 'zh' ? 'railZh' : 'railEn'];
      if (FX && FINE) scramble(railName, 380);
    };
    refreshTasks.push(() => updateRail(true));
    frameTasks.push(() => {
      const p = clamp(state.y / maxScroll);
      bar.style.transform = `scaleX(${p})`;
      if (railFill) railFill.style.transform = `scaleY(${p})`;
      updateRail();
      if (Math.abs(state.y - lastY) > 4) {
        const menuOpen = $('#nav') && $('#nav').classList.contains('open');
        header.classList.toggle('hide', state.y > lastY && state.y > state.vh * 0.7 && !menuOpen);
        header.classList.toggle('scrolled', state.y > 30);
        lastY = state.y;
      }
    });
    const menu = $('#menu'), nav = $('#nav');
    if (menu && nav) {
      const setOpen = open => {
        nav.classList.toggle('open', open);
        header.classList.toggle('menu-open', open); // A blur or transform on the header would trap the full-screen menu inside it.
        if (open) header.classList.remove('hide');
        menu.setAttribute('aria-expanded', String(open));
        if (lenis) { if (open) lenis.stop(); else lenis.start(); }
      };
      menu.addEventListener('click', () => setOpen(!nav.classList.contains('open')));
      $$('a', nav).forEach(a => a.addEventListener('click', () => setOpen(false)));
    }
    const clock = $('#clock');
    if (clock) {
      const format = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' });
      const update = () => { clock.textContent = `${currentLang() === 'zh' ? '北京' : 'BEIJING'} ${format.format(new Date())}`; };
      update();
      setInterval(update, 20000);
      refreshTasks.push(update);
    }
    const flag = $('#flag-wave');
    if (flag) {
      const SLICES = 12, width = flag.offsetWidth || 38;
      for (let i = 0; i < SLICES; i++) {
        const slice = document.createElement('i');
        slice.style.setProperty('--n', i);
        slice.style.backgroundPosition = `${-(i / SLICES) * width}px 0`;
        flag.append(slice);
      }
    }
  }

  /* ---------- Scroll-linked words, timeline, ghost titles ---------- */
  function initScrollEffects() {
    if (!FX) return;
    let wordBlocks = [];
    measureTasks.push(() => {
      wordBlocks = $$('[data-words]').map(el => ({ el, words: $$('.sw', el), top: docTop(el), height: el.offsetHeight }));
    });
    frameTasks.push(() => {
      wordBlocks.forEach(block => {
        if (state.smoothY + state.vh < block.top - 60 || state.smoothY > block.top + block.height + 60) return;
        const p = clamp((state.smoothY + state.vh * 0.84 - block.top) / (block.height + state.vh * 0.46));
        if (Math.abs(p - (block.p == null ? -1 : block.p)) < 0.002) return;
        block.p = p;
        const lit = p * block.words.length;
        block.words.forEach((word, i) => {
          const value = clamp(0.14 + (lit - i) * 0.5, 0.14, 1).toFixed(2);
          if (word._o !== value) { word._o = value; word.style.setProperty('--o', value); }
        });
      });
    });

    // The manifesto's track fills from "first gradient" to "last millisecond" as you scroll.
    const manifesto = $('.manifesto'), mLead = $('.mf-lead');
    if (manifesto && mLead) {
      let mTop = 0, mHeight = 1, mLast = -1;
      measureTasks.push(() => { mTop = docTop(mLead); mHeight = mLead.offsetHeight; });
      frameTasks.push(() => {
        // Same pace as the headline's words, finishing just after "last millisecond" lights up.
        const p = clamp((state.smoothY + state.vh * 0.84 - mTop) / (mHeight + state.vh * 0.46) * 0.94);
        if (Math.abs(p - mLast) > 0.002) { mLast = p; manifesto.style.setProperty('--p', p.toFixed(3)); }
      });
    }

    const timeline = $('.timeline'), line = $('.timeline-line');
    if (timeline) {
      let top = 0, height = 1;
      measureTasks.push(() => { top = docTop(timeline); height = timeline.offsetHeight; });
      frameTasks.push(() => line.style.setProperty('--p', clamp((state.smoothY + state.vh * 0.7 - top) / height).toFixed(3)));
    }

    let ghosts = [];
    measureTasks.push(() => { ghosts = $$('[data-ghost]').map(el => ({ el, top: docTop(el.closest('section')), h: el.closest('section').offsetHeight })); });
    frameTasks.push(() => {
      ghosts.forEach(g => {
        if (state.smoothY + state.vh < g.top || state.smoothY > g.top + g.h) return;
        const p = clamp((state.smoothY + state.vh - g.top) / (g.h + state.vh));
        g.el.style.transform = `translate3d(${(0.5 - p) * state.vw * 0.5}px,0,0)`;
      });
    });

    const cinema = $('#cinema'), cinemaSection = $('#cinema-section');
    if (cinema && cinemaSection && innerWidth > 760) {
      let top = 0, range = 1;
      measureTasks.push(() => { top = docTop(cinemaSection); range = Math.max(1, cinemaSection.offsetHeight - state.vh); });
      frameTasks.push(() => cinema.style.setProperty('--p', clamp((state.smoothY - top + state.vh * 0.35) / (range * 0.75 + state.vh * 0.35)).toFixed(3)));
    }

    const pipeline = $('#pipeline');
    if (pipeline) {
      const pipes = $$('.pipe', pipeline);
      let top = 0;
      measureTasks.push(() => { top = docTop(pipeline); });
      frameTasks.push(() => {
        const p = clamp((state.smoothY + state.vh * 0.82 - top) / (state.vh * 0.5));
        pipeline.style.setProperty('--p', p.toFixed(3));
        pipes.forEach((pipe, i) => pipe.classList.toggle('on', p >= i / pipes.length));
      });
    }
  }

  /* ---------- Results story ---------- */
  function initNumbers() {
    const section = $('#numbers');
    if (!section || !FX) return;
    const steps = $$('.step', section), dots = $$('.step-dots i', section);
    let top = 0, range = 1, active = -1;
    measureTasks.push(() => { top = docTop(section); range = Math.max(1, section.offsetHeight - state.vh); });
    frameTasks.push(() => {
      const p = clamp((state.smoothY - top) / range);
      const index = Math.min(steps.length - 1, Math.floor(p * steps.length));
      if (index === active) return;
      active = index;
      steps.forEach((step, i) => step.classList.toggle('active', i === index));
      dots.forEach((dot, i) => dot.classList.toggle('on', i <= index));
    });
  }

  /* ---------- Projects: sideways while pinned, on wide screens with a pointer ---------- */
  let horizontal = null;
  function initHorizontal() {
    const section = $('#projects');
    if (!section) return;
    const track = $('.track', section), bar = $('.projects-progress', section);
    const wanted = () => FX && FINE && innerWidth >= 1024 && innerHeight >= 620;
    let top = 0, travel = 0, lastX = -1;
    const apply = () => {
      const on = wanted();
      root.classList.toggle('h-scroll', on);
      if (!on) {
        section.style.height = '';
        track.style.transform = '';
        travel = 0;
        return;
      }
      travel = Math.max(0, track.scrollWidth - innerWidth);
      section.style.height = `${travel + innerHeight}px`;
      top = docTop(section);
    };
    measureTasks.unshift(apply);
    frameTasks.push(() => {
      if (!travel) return;
      const p = clamp((state.y - top) / travel);
      const x = Math.round(p * travel * 2) / 2;
      if (x === lastX) return;
      lastX = x;
      track.style.transform = `translate3d(${-x}px,0,0)`;
      bar.style.setProperty('--p', p.toFixed(4));
    });
    const sticky = $('.projects-sticky', section);
    section.addEventListener('focusin', event => {
      if (!travel) return;
      sticky.scrollLeft = 0; // Tabbing must move the scroll story, not the clipped container.
      const panel = event.target.closest('.panel');
      if (panel && event.target.matches(':focus-visible')) goTo(panel);
    });
    horizontal = {
      yForPanel(panel) {
        const offset = panel.offsetLeft - Math.max(0, (innerWidth - panel.offsetWidth) / 2);
        return top + clamp(offset, 0, travel);
      }
    };
  }

  /* ---------- Role selector: tailors the page to what the visitor is hiring for ---------- */
  function initRoles() {
    const tabs = $$('.role-tab');
    if (!tabs.length) return;
    const select = (role, interacted) => {
      tabs.forEach(tab => {
        const on = tab.dataset.role === role;
        tab.setAttribute('aria-selected', String(on));
        tab.tabIndex = on ? 0 : -1;
      });
      $$('.role-panel').forEach(panel => {
        const on = panel.dataset.panel === role;
        panel.hidden = !on;
        panel.classList.toggle('enter', on && interacted);
      });
      if (!interacted) return;
      const matches = el => (el.dataset.roles || '').split(' ').includes(role);
      $$('.panel[data-roles]').forEach(panel => panel.classList.toggle('match', matches(panel)));
      $$('.chips [data-roles]').forEach(chip => chip.classList.toggle('match', matches(chip)));
      try { sessionStorage.setItem('hafiz-role', role); } catch (e) { /* ignore */ }
      measureSoon();
    };
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', event => {
        select(tab.dataset.role, true);
        if (scene) scene.pulse(event.clientX, event.clientY, performance.now() / 1000);
      });
      tab.addEventListener('keydown', event => {
        const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
        if (!step) return;
        const next = tabs[(i + step + tabs.length) % tabs.length];
        next.focus();
        select(next.dataset.role, true);
      });
    });
    let saved = null;
    try { saved = sessionStorage.getItem('hafiz-role'); } catch (e) { /* ignore */ }
    select(saved || 'inference', !!saved);
  }

  /* ---------- Speculative decoding playground ----------
     Toy model. Each step the target verifies k drafted tokens: accepted tokens
     run until the first rejection, plus the one token the target produces itself.
     Drafting has a small cost per token, so there is a best draft length. */
  const DRAFT_COST = 0.09;
  const tokensPerStep = (k, p) => 1 + (p >= 1 ? k : p * (1 - Math.pow(p, k)) / (1 - p));
  const toySpeedup = (k, p) => tokensPerStep(k, p) / (1 + DRAFT_COST * k);
  function initPlayground() {
    const box = $('#playground');
    if (!box) return;
    const SLOTS = innerWidth < 1024 ? 48 : 72;
    const inK = $('#pg-k'), inP = $('#pg-p');
    const lanes = {};
    ['base', 'spec'].forEach(name => {
      const holder = $(`[data-lane="${name}"]`, box);
      holder.innerHTML = '<i></i>'.repeat(SLOTS);
      lanes[name] = { slots: $$('i', holder), out: $(`[data-count-lane="${name}"]`, box), n: 0 };
    });
    const read = () => {
      const k = +inK.value, p = +inP.value / 100;
      $('#pg-k-out').textContent = k;
      $('#pg-p-out').textContent = `${inP.value}%`;
      $('#pg-speed').textContent = `${toySpeedup(k, p).toFixed(1)}×`;
      let best = 1;
      for (let i = 1; i <= 10; i++) if (toySpeedup(i, p) > toySpeedup(best, p)) best = i;
      $('#pg-best').textContent = best;
      return { k, p };
    };
    inK.addEventListener('input', read);
    inP.addEventListener('input', read);
    read();
    const reset = () => Object.values(lanes).forEach(lane => {
      lane.n = 0;
      lane.slots.forEach(slot => { slot.className = ''; });
      lane.out.textContent = '0';
    });
    let timers = [], running = false;
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    const step = () => {
      if (!running) return;
      if (lanes.spec.n >= SLOTS) { later(() => { reset(); step(); }, 1500); return; }
      const { k, p } = read();
      const base = lanes.base;
      if (base.n < SLOTS) { base.slots[base.n++].className = 'on'; base.out.textContent = base.n; }
      const spec = lanes.spec, from = spec.n;
      let accepted = 0;
      while (accepted < k && Math.random() < p) accepted++;
      const drafted = Math.min(k, SLOTS - from);
      for (let i = 0; i < drafted; i++) spec.slots[from + i].className = 'draft';
      later(() => {
        for (let i = 0; i < drafted; i++) spec.slots[from + i].className = i <= accepted ? 'on' : 'no';
        const gained = Math.min(accepted + 1, drafted);
        spec.n = from + gained;
        spec.out.textContent = spec.n;
        later(() => { for (let i = gained; i < drafted; i++) spec.slots[from + i].className = ''; }, 170);
      }, 230);
      later(step, 560);
    };
    if (reducedMotion) return;
    new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !running) { running = true; step(); }
      else if (!entry.isIntersecting && running) { running = false; timers.forEach(clearTimeout); timers = []; }
    }, { threshold: 0.15 }).observe(box);
  }

  /* ---------- Knowledge graph: a small force simulation drawn on canvas ---------- */
  const GRAPH_NODES = [
    ['ParT', 'model'], ['ParticleNet', 'model'], ['ResNet50', 'model'],
    ['TensorRT', 'tool'], ['ONNX', 'tool'], ['hls4ml', 'tool'], ['Vitis AI', 'tool'], ['Brevitas', 'tool'], ['Torch Pruner', 'tool'], ['PPQ', 'tool'], ['CANN', 'tool'],
    ['PTQ', 'tech'], ['QAT', 'tech'], ['Pruning', 'tech'], ['HLS', 'tech'], ['GPU kernels', 'tech'],
    ['NVIDIA V100', 'hw'], ['Xilinx Alveo', 'hw'], ['Huawei Ascend', 'hw'], ['Intel Xeon', 'hw'], ['Intel Core i9', 'hw']
  ];
  const GRAPH_EDGES = [
    ['ParT', 'TensorRT'], ['ParT', 'NVIDIA V100'], ['ParT', 'Huawei Ascend'], ['ParT', 'ONNX'], ['ParT', 'CANN'],
    ['ParticleNet', 'TensorRT'], ['ParticleNet', 'NVIDIA V100'], ['ParticleNet', 'Xilinx Alveo'], ['ParticleNet', 'hls4ml'], ['ParticleNet', 'QAT'], ['ParticleNet', 'Intel Core i9'],
    ['ResNet50', 'Pruning'], ['ResNet50', 'PTQ'], ['ResNet50', 'NVIDIA V100'], ['ResNet50', 'Intel Xeon'],
    ['TensorRT', 'PTQ'], ['TensorRT', 'GPU kernels'], ['PPQ', 'PTQ'], ['Vitis AI', 'PTQ'], ['Vitis AI', 'Xilinx Alveo'], ['Brevitas', 'QAT'], ['hls4ml', 'HLS'], ['HLS', 'Xilinx Alveo'], ['Torch Pruner', 'Pruning'], ['CANN', 'Huawei Ascend'], ['GPU kernels', 'NVIDIA V100']
  ];
  function initGraph() {
    const canvas = $('#graph');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const COLORS = { model: '#d8bb73', tool: '#84c7a2', tech: '#c9d8cc', hw: '#d98a5f' };
    const nodes = GRAPH_NODES.map(([label, kind]) => ({ label, kind, x: 0, y: 0, vx: 0, vy: 0, links: new Set() }));
    const find = label => nodes.find(n => n.label === label);
    const edges = GRAPH_EDGES.map(([a, b]) => {
      const A = find(a), B = find(b);
      A.links.add(B); B.links.add(A);
      return [A, B];
    });
    let W = 0, H = 0, dpr = 1, visible = false, hover = null, drag = null, seeded = false, energy = 1;
    const size = () => {
      const box = canvas.getBoundingClientRect();
      if (!box.width) return;
      dpr = Math.min(devicePixelRatio || 1, 2);
      W = box.width; H = box.height;
      canvas.width = W * dpr; canvas.height = H * dpr;
      if (!seeded) {
        nodes.forEach((n, i) => {
          const a = i / nodes.length * 6.283;
          n.x = W / 2 + Math.cos(a) * W * 0.3;
          n.y = H / 2 + Math.sin(a) * H * 0.3;
        });
        seeded = true;
      }
      energy = 1;
    };
    measureTasks.push(size);
    const stepPhysics = () => {
      const area = Math.min(W, H * 1.6);
      const repulse = area * area * 0.042;
      const rest = area * 0.2;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          let dx = a.x - b.x, dy = a.y - b.y;
          const d2 = Math.max(120, dx * dx + dy * dy), d = Math.sqrt(d2);
          const f = repulse / d2;
          dx /= d; dy /= d;
          a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
        }
      }
      edges.forEach(([a, b]) => {
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, f = (d - rest) * 0.022;
        a.vx += dx / d * f; a.vy += dy / d * f; b.vx -= dx / d * f; b.vy -= dy / d * f;
      });
      nodes.forEach(n => {
        if (n === drag) { n.vx = n.vy = 0; return; }
        n.vx += (W / 2 - n.x) * 0.006;
        n.vy += (H / 2 - n.y) * 0.012;
        n.vx *= 0.82; n.vy *= 0.82;
        n.x = clamp(n.x + n.vx, 46, W - 46);
        n.y = clamp(n.y + n.vy, 28, H - 14);
      });
    };
    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const focus = drag || hover;
      edges.forEach(([a, b]) => {
        const lit = focus && (a === focus || b === focus);
        ctx.strokeStyle = lit ? 'rgba(216,187,115,.9)' : `rgba(132,199,162,${focus ? 0.1 : 0.28})`;
        ctx.lineWidth = lit ? 1.5 : 1;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      });
      ctx.textAlign = 'center';
      ctx.font = `${W < 480 ? 10.5 : 12}px "DM Sans", sans-serif`;
      nodes.forEach(n => {
        const dim = focus && n !== focus && !focus.links.has(n);
        ctx.globalAlpha = dim ? 0.25 : 1;
        ctx.fillStyle = COLORS[n.kind];
        ctx.beginPath(); ctx.arc(n.x, n.y, n === focus ? 8 : 5.5, 0, 6.283); ctx.fill();
        ctx.fillStyle = '#f3efdc';
        ctx.fillText(n.label, n.x, n.y - 10);
      });
      ctx.globalAlpha = 1;
    };
    frameTasks.push(() => {
      if (!visible || !W) return;
      if (energy > 0.02 || drag) { stepPhysics(); energy *= 0.992; }
      draw();
    });
    const pos = event => {
      const box = canvas.getBoundingClientRect();
      return [event.clientX - box.left, event.clientY - box.top];
    };
    const near = (x, y) => {
      let best = null, bestD = 26;
      nodes.forEach(n => { const d = Math.hypot(n.x - x, n.y - y); if (d < bestD) { best = n; bestD = d; } });
      return best;
    };
    canvas.addEventListener('pointerdown', event => {
      const [x, y] = pos(event);
      drag = near(x, y);
      if (drag) { canvas.setPointerCapture(event.pointerId); energy = 1; }
    });
    canvas.addEventListener('pointermove', event => {
      const [x, y] = pos(event);
      if (drag) { drag.x = x; drag.y = y; energy = 1; }
      else hover = near(x, y);
    });
    const release = () => { drag = null; };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('pointerleave', () => { hover = null; });
    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) size(); }, { threshold: 0.05 }).observe(canvas);
    size();
  }

  /* ---------- Floating image that follows the pointer over marked rows ---------- */
  function initPreviews() {
    const rows = $$('[data-preview]');
    if (!rows.length || !FX || !FINE) return;
    const preview = document.createElement('div');
    preview.className = 'float-preview';
    preview.setAttribute('aria-hidden', 'true');
    const img = document.createElement('img');
    img.alt = '';
    preview.append(img);
    document.body.append(preview);
    let tx = 0, ty = 0, x = 0, y = 0, shown = false;
    const aim = event => {
      const w = preview.offsetWidth || 300, h = preview.offsetHeight || 200;
      tx = Math.min(event.clientX + 40, innerWidth - w - 20);
      ty = clamp(event.clientY - h / 2, 12, innerHeight - h - 12);
    };
    rows.forEach(row => {
      row.addEventListener('pointerenter', event => {
        img.src = row.dataset.preview;
        aim(event);
        if (!shown) { x = tx; y = ty; }
        preview.classList.add('show');
        shown = true;
      });
      row.addEventListener('pointermove', aim);
      row.addEventListener('pointerleave', () => { preview.classList.remove('show'); shown = false; });
    });
    frameTasks.push(() => {
      if (!shown) return;
      const vx = tx - x;
      x += vx * 0.14;
      y += (ty - y) * 0.14;
      preview.style.transform = `translate3d(${x}px,${y}px,0) rotate(${clamp(vx * 0.03, -8, 8)}deg)`;
    });
  }

  /* ---------- Contact title: letters react to how close the pointer is ---------- */
  function initProximityTitle() {
    const title = $('#contact-title');
    if (!title || !FX || !FINE) return;
    let chars = [];
    const build = () => {
      title.setAttribute('aria-label', title.textContent);
      const words = title.textContent.split(/(\s+)/).filter(Boolean);
      title.textContent = '';
      words.forEach(token => {
        if (/^\s+$/.test(token)) { title.append(' '); return; }
        const word = document.createElement('span');
        word.style.display = 'inline-block';
        word.setAttribute('aria-hidden', 'true');
        [...token].forEach(ch => {
          const c = document.createElement('span');
          c.className = 'c';
          c.textContent = ch;
          word.append(c);
        });
        title.append(word);
      });
      chars = $$('.c', title);
    };
    build();
    refreshTasks.push(build);
    let active = false, lastPx = -1, lastPy = -1, lastPs = -1;
    new IntersectionObserver(([entry]) => { active = entry.isIntersecting; }, { threshold: 0 }).observe(title);
    frameTasks.push(() => {
      if (!active || !pointer.active) return;
      if (pointer.x === lastPx && pointer.y === lastPy && state.y === lastPs) return;
      lastPx = pointer.x; lastPy = pointer.y; lastPs = state.y;
      const boxes = chars.map(c => c.getBoundingClientRect());
      chars.forEach((c, i) => {
        const box = boxes[i];
        const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
        const d = Math.hypot(pointer.x - cx, pointer.y - cy);
        const f = clamp(1 - d / 240);
        c.style.transform = f > 0 ? `translateY(${(-f * 12).toFixed(1)}px)` : '';
        c.style.color = f > 0.45 ? 'var(--mint)' : '';
      });
    });
  }

  /* ---------- Scroll-driven film: MetaHuman from portrait to macro ---------- */
  function initMeta() {
    const section = $('#meta'), canvas = $('#meta-canvas');
    if (!section || !canvas) return;
    if (!FX) { canvas.remove(); return; }
    const small = innerWidth < 760;
    const COUNT = small ? 45 : 90;
    const folder = small ? 'assets/metahuman-m' : 'assets/metahuman';
    const ctx = canvas.getContext('2d');
    const frames = new Array(COUNT);
    const lines = $$('.meta-line', section), bar = $('.meta-progress', section);
    let top = 0, range = 1, started = false, drawn = -1, lastDrawn = null, cw = 0, ch = 0, smooth = 0, activeLine = 0;
    // Key frames first, so a fast scroller always has something close to show.
    const queue = [];
    for (let step = 8; step >= 1; step = Math.floor(step / 2)) {
      for (let i = 0; i < COUNT; i += step) if (!queue.includes(i)) queue.push(i);
    }
    const pump = () => {
      const i = queue.shift();
      if (i === undefined) return;
      const im = new Image();
      im.decoding = 'async';
      let retried = false;
      im.onload = () => {
        const ready = () => { im._ready = true; pump(); };
        if (im.decode) im.decode().then(ready, ready); else ready();
      };
      im.onerror = () => {
        if (retried) { pump(); return; }
        retried = true;
        setTimeout(() => { im.src = `${folder}/${String(i).padStart(3, '0')}.webp?r=1`; }, 400);
      };
      im.src = `${folder}/${String(i).padStart(3, '0')}.webp`;
      frames[i] = im;
    };
    const start = () => {
      if (started) return;
      started = true;
      for (let n = 0; n < 6; n++) pump(); // A few at a time keeps the rest of the page responsive.
    };
    new IntersectionObserver(([entry]) => { if (entry.isIntersecting) start(); }, { rootMargin: '150% 0px' }).observe(section);
    measureTasks.push(() => {
      top = docTop(section);
      range = Math.max(1, section.offsetHeight - state.vh);
      const box = canvas.getBoundingClientRect();
      cw = Math.round(box.width * Math.min(devicePixelRatio || 1, 1.5));
      ch = Math.round(box.height * Math.min(devicePixelRatio || 1, 1.5));
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; drawn = -1; }
    });
    const best = i => {
      if (frames[i] && frames[i]._ready) return frames[i];
      for (let d = 1; d < COUNT; d++) {
        const a = frames[i - d], b = frames[i + d];
        if (a && a._ready) return a;
        if (b && b._ready) return b;
      }
      return null;
    };
    frameTasks.push(() => {
      if (!started || state.y < top - state.vh || state.y > top + range + state.vh) return;
      const p = clamp((state.y - top) / range);
      smooth = FINE ? p : lerp(smooth, p, 0.3); // Lenis already smooths the scroll on a desktop.
      bar.style.setProperty('--p', smooth.toFixed(3));
      const i = Math.min(COUNT - 1, Math.floor(smooth * COUNT));
      const im = best(i);
      if (im && (drawn !== i || lastDrawn !== im)) {
        const s = Math.max(cw / im.naturalWidth, ch / im.naturalHeight);
        const w = im.naturalWidth * s, h = im.naturalHeight * s;
        ctx.drawImage(im, (cw - w) / 2, (ch - h) * 0.32, w, h);
        drawn = i;
        lastDrawn = im;
      }
      const lineIndex = smooth < 0.3 ? 0 : smooth < 0.62 ? 1 : 2;
      if (lineIndex !== activeLine) {
        activeLine = lineIndex;
        lines.forEach((line, k) => line.classList.toggle('active', k === lineIndex));
      }
    });
  }

  /* ---------- Audio players with real waveforms; on a desktop the page reacts to the music ---------- */
  function initTracks() {
    const tracks = $$('.song');
    if (!tracks.length) return;
    const waves = window.WAVES || {};
    let audioCtx = null, analyser = null, scopeAnalyser = null, bins = null, wave = null, playingEntry = null;
    const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    const entries = tracks.map(track => {
      const id = track.dataset.track;
      const data = waves[id] || { duration: 0, peaks: [] };
      const canvas = $('.wave', track), button = $('.track-play', track), time = $('.track-time', track);
      const entry = { track, id, data, canvas, button, time, audio: null, progress: 0, source: null };
      time.textContent = fmt(data.duration);
      const draw = () => {
        const a = fitCanvas(canvas);
        const ctx = canvas.getContext('2d');
        ctx.setTransform(a.dpr, 0, 0, a.dpr, 0, 0);
        ctx.clearRect(0, 0, a.w, a.h);
        const n = data.peaks.length || 1, bw = a.w / n;
        data.peaks.forEach((v, i) => {
          const h = Math.max(2, v * (a.h - 4));
          ctx.fillStyle = i / n < entry.progress ? '#d8bb73' : 'rgba(132,199,162,.42)';
          ctx.fillRect(i * bw, (a.h - h) / 2, Math.max(1, bw - 1), h);
        });
      };
      entry.draw = draw;
      draw();
      measureTasks.push(draw);
      const ensureAudio = () => {
        if (entry.audio) return entry.audio;
        const audio = new Audio(`assets/showcase/${id}.mp3`);
        audio.preload = 'auto';
        audio.addEventListener('timeupdate', () => {
          entry.progress = audio.duration ? audio.currentTime / audio.duration : 0;
          time.textContent = fmt(audio.currentTime);
          draw();
        });
        audio.addEventListener('ended', () => { track.classList.remove('playing'); entry.progress = 0; draw(); time.textContent = fmt(data.duration); if (scene) scene.setAudio(0); playingEntry = null; });
        audio.addEventListener('pause', () => { track.classList.remove('playing'); if (playingEntry === entry) { playingEntry = null; if (scene) scene.setAudio(0); } });
        audio.addEventListener('play', () => { track.classList.add('playing'); playingEntry = entry; });
        entry.audio = audio;
        return audio;
      };
      button.addEventListener('click', () => {
        const audio = ensureAudio();
        if (audio.paused) {
          entries.forEach(other => { if (other !== entry && other.audio) other.audio.pause(); });
          document.querySelectorAll('video').forEach(v => v.pause());
          connect(entry);
          audio.play().catch(() => {});
        } else {
          audio.pause();
        }
      });
      canvas.addEventListener('pointerdown', event => {
        const box = canvas.getBoundingClientRect();
        const audio = ensureAudio();
        const seek = clamp((event.clientX - box.left) / box.width);
        const target = seek * (audio.duration || data.duration);
        try { audio.currentTime = target; } catch (e) { /* not seekable yet */ }
        entry.progress = seek;
        draw();
      });
      return entry;
    });
    // Only desktops route audio through Web Audio: some in-app phone browsers would stay silent.
    function connect(entry) {
      if (!FINE || !FX || !scene) return;
      try {
        if (!audioCtx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          audioCtx = new AC();
          analyser = audioCtx.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.72;
          analyser.connect(audioCtx.destination);
          bins = new Uint8Array(analyser.frequencyBinCount);
          // A longer window for the waveform strip, so the shape of the voice is visible.
          scopeAnalyser = audioCtx.createAnalyser();
          scopeAnalyser.fftSize = 2048;
          wave = new Uint8Array(scopeAnalyser.fftSize);
        }
        if (!entry.source) {
          entry.source = audioCtx.createMediaElementSource(entry.audio);
          entry.source.connect(analyser);
          entry.source.connect(scopeAnalyser);
        }
        if (audioCtx.state === 'suspended') audioCtx.resume();
      } catch (e) { /* The page simply will not react to this track. */ }
    }
    frameTasks.push(() => {
      if (!analyser || !playingEntry || !scene) return;
      analyser.getByteFrequencyData(bins);
      let low = 0;
      for (let i = 1; i < 12; i++) low += bins[i];
      scene.setAudio(Math.pow(clamp(low / (11 * 255)), 2.2));
    });
    // The waveform strip: a calm idle line, then the real voice while a song plays (on a desktop).
    $$('.music-scope').forEach(canvas => {
      const ctx = canvas.getContext('2d');
      const wrap = canvas.closest('.music-scope-wrap'), label = $('.scope-label', wrap);
      let visible = false, W = 0, H = 0, dpr = 1, lastTitle = '';
      const size = () => { const a = fitCanvas(canvas); W = a.w; H = a.h; dpr = a.dpr; };
      measureTasks.push(size);
      new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) size(); }).observe(canvas);
      const setLabel = () => {
        const zh = currentLang() === 'zh';
        const title = playingEntry ? $('h3', playingEntry.track).firstChild.textContent.trim() : '';
        if (title === lastTitle && label.dataset.state === (zh ? 'zh' : 'en')) return;
        lastTitle = title; label.dataset.state = zh ? 'zh' : 'en';
        wrap.classList.toggle('live', !!playingEntry);
        label.textContent = playingEntry
          ? (zh ? `正在播放：${title} · 你看到的是一个 AI 声音的实时波形。` : `Now playing: ${title} · the live waveform of an AI voice.`)
          : label.dataset[zh ? 'zh' : 'en'];
      };
      refreshTasks.push(() => { lastTitle = '-'; setLabel(); });
      frameTasks.push((dt, now) => {
        if (!visible || !W) return;
        setLabel();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        const mid = H / 2;
        ctx.strokeStyle = 'rgba(243,239,220,.08)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(W, mid); ctx.stroke();
        const live = scopeAnalyser && playingEntry && !playingEntry.audio.paused;
        if (live) scopeAnalyser.getByteTimeDomainData(wave);
        const progress = playingEntry ? playingEntry.progress : 0;
        const points = Math.min(260, Math.floor(W / 3));
        for (let pass = 0; pass < 2; pass++) {
          ctx.strokeStyle = pass ? '#d8bb73' : 'rgba(216,187,115,.22)';
          ctx.lineWidth = pass ? 1.8 : 5;
          ctx.beginPath();
          for (let i = 0; i <= points; i++) {
            const u = i / points;
            let v;
            if (live) v = (wave[Math.floor(u * (wave.length - 1))] - 128) / 128 * 2.4 * Math.sin(Math.PI * Math.min(1, u * 1.15 + .02));
            else {
              const env = Math.sin(u * Math.PI);
              v = env * (Math.sin(u * 18 + now * 1.6) * .22 + Math.sin(u * 47 - now * 2.3) * .08) * (playingEntry ? .8 : .45);
            }
            const y = mid - Math.max(-1, Math.min(1, v)) * (H / 2 - 6);
            if (i) ctx.lineTo(u * W, y); else ctx.moveTo(u * W, y);
          }
          ctx.stroke();
        }
        if (progress > 0) { ctx.fillStyle = 'rgba(216,187,115,.75)'; ctx.fillRect(0, H - 2, W * progress, 2); }
      });
    });
  }

  /* ---------- Copy buttons and dialogs ---------- */
  const toast = $('#toast');
  let toastTimer;
  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  }
  function legacyCopy(text) {
    // In-app browsers such as WeChat can refuse the Clipboard API.
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:0;opacity:0';
    (document.querySelector('dialog[open]') || document.body).append(area);
    area.select();
    area.setSelectionRange(0, text.length);
    let copied = false;
    try { copied = document.execCommand('copy'); } catch (e) { /* ignore */ }
    area.remove();
    return copied;
  }
  async function copyText(text) {
    let copied = false;
    try { await navigator.clipboard.writeText(text); copied = true; } catch (e) { copied = legacyCopy(text); }
    showToast(copied ? `${currentLang() === 'zh' ? '已复制' : 'Copied'}: ${text}` : text);
  }
  function openDialog(dialog) {
    if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', '');
    if (lenis) lenis.stop();
  }
  function wireEnlarge(scope) {
    const imageDialog = $('#image-dialog');
    if (!imageDialog) return;
    $$('.gallery-frame img,[data-enlarge]', scope).forEach(img => {
      if (img._wired) return;
      img._wired = true;
      img.tabIndex = 0;
      img.setAttribute('role', 'button');
      const open = () => {
        const big = $('img', imageDialog);
        big.src = img.src;
        big.alt = img.alt;
        openDialog(imageDialog);
      };
      img.addEventListener('click', open);
      img.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } });
    });
  }
  function initDialogs() {
    $$('[data-copy]').forEach(button => button.addEventListener('click', () => copyText(button.dataset.copy)));
    $$('dialog').forEach(dialog => {
      const close = $('.dialog-close', dialog);
      if (close) close.addEventListener('click', () => (dialog.close ? dialog.close() : dialog.removeAttribute('open')));
      dialog.addEventListener('click', event => { if (event.target === dialog && dialog.close) dialog.close(); });
      dialog.addEventListener('close', () => { if (lenis && !caseOpen) lenis.start(); });
    });
    const wechat = $('#wechat-dialog');
    [$('#wechat-open'), $('#qr-card')].forEach(opener => {
      if (wechat && opener) opener.addEventListener('click', () => openDialog(wechat));
    });
    wireEnlarge(document);
  }

  /* ---------- Case studies: full-screen stories that open from where you clicked ---------- */
  const CASES = ['autodeploy', 'decoding', 'lhaaso', 'fpga', 'curiosity'];
  const CASE_TITLES = {
    autodeploy: ['AutoDeploy', 'AutoDeploy'],
    decoding: ['Speculative decoding', '投机解码加速'],
    lhaaso: ['Finding gamma-ray bursts in noise', '从噪声中寻找伽马射线暴'],
    fpga: ['Transformers on FPGAs', 'FPGA 上的 Transformer'],
    curiosity: ['Curiosity', 'Curiosity']
  };
  let caseOpen = null, caseReturn = null;
  function initCases() {
    const host = $('#case');
    if (!host) return;
    const scroll = $('#case-scroll');
    const fill = id => {
      const lang = currentLang();
      scroll.innerHTML = '';
      const frag = $(`#case-${id}`).content.cloneNode(true);
      translate(frag, lang);
      scroll.append(frag);
      const nextId = CASES[(CASES.indexOf(id) + 1) % CASES.length];
      const next = document.createElement('button');
      next.type = 'button';
      next.className = 'case-next';
      next.dataset.cursor = 'NEXT';
      next.innerHTML = `<small>${lang === 'zh' ? '下一个案例' : 'Next case study'}</small><b>${CASE_TITLES[nextId][lang === 'zh' ? 1 : 0]} →</b>`;
      next.addEventListener('click', () => show(nextId, true));
      scroll.append(next);
      scroll.scrollTop = 0;
      wireEnlarge(scroll);
      wireHover(scroll);
      if (id === 'lhaaso') safe('bayes', () => initBayes(scroll));
      if (id === 'curiosity' && window.LABS && window.LABS.curiosity) safe('curiosity', () => window.LABS.curiosity(labContext, scroll));
    };
    const show = (id, replace) => {
      fill(id);
      caseOpen = id;
      const url = `#case/${id}`;
      if (replace) history.replaceState({ case: id }, '', url);
      else if (location.hash !== url) history.pushState({ case: id }, '', url);
    };
    const open = (id, event) => {
      if (!CASES.includes(id)) return;
      caseReturn = event ? event.currentTarget : null;
      if (event) {
        host.style.setProperty('--cx', `${event.clientX || innerWidth / 2}px`);
        host.style.setProperty('--cy', `${event.clientY || innerHeight / 2}px`);
      }
      show(id, false);
      host.hidden = false;
      root.classList.add('case-locked');
      if (lenis) lenis.stop();
      requestAnimationFrame(() => requestAnimationFrame(() => {
        host.classList.add('open');
        $('.case-close', host).focus({ preventScroll: true });
      }));
    };
    const close = fromHistory => {
      if (!caseOpen) return;
      caseOpen = null;
      host.classList.remove('open');
      root.classList.remove('case-locked');
      if (lenis) lenis.start();
      if (!fromHistory && location.hash.startsWith('#case/')) history.pushState({}, '', location.pathname + location.search);
      setTimeout(() => { if (!caseOpen) { host.hidden = true; scroll.innerHTML = ''; } }, FX ? 760 : 0);
      if (caseReturn) caseReturn.focus({ preventScroll: true });
    };
    $$('.case-open').forEach(button => button.addEventListener('click', event => open(button.dataset.case, event)));
    $('.case-close', host).addEventListener('click', () => close(false));
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && caseOpen && !document.querySelector('dialog[open]')) close(false); });
    window.addEventListener('popstate', () => {
      const match = location.hash.match(/^#case\/([a-z]+)/);
      if (match && CASES.includes(match[1])) { if (caseOpen) fill(match[1]); else open(match[1]); caseOpen = match[1]; }
      else close(true);
    });
    refreshTasks.push(() => { if (caseOpen) fill(caseOpen); });
    window.__openCase = open;
    const initial = location.hash.match(/^#case\/([a-z]+)/);
    if (initial) setTimeout(() => open(initial[1]), 150);
  }

  /* ---------- Bayesian optimization: a real Gaussian process running in the browser ---------- */
  function initBayes(scope) {
    const canvas = $('#bo-canvas', scope);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const GRID = 140;
    const xs = Array.from({ length: GRID }, (_, i) => i / (GRID - 1));
    const objective = x => 0.55 * Math.exp(-Math.pow((x - 0.72) / 0.09, 2)) + 0.32 * Math.exp(-Math.pow((x - 0.28) / 0.13, 2)) + 0.14 * Math.sin(x * 16) * 0.5 + 0.2;
    const kernel = (a, b) => Math.exp(-Math.pow(a - b, 2) / (2 * 0.085 * 0.085));
    const NOISE = 1e-5;
    let X = [], Y = [], mean = [], sd = [], ei = [];
    const cholesky = A => {
      const n = A.length, L = A.map(() => new Float64Array(n));
      for (let i = 0; i < n; i++) {
        for (let j = 0; j <= i; j++) {
          let s = A[i][j];
          for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
          L[i][j] = i === j ? Math.sqrt(Math.max(s, 1e-10)) : s / L[j][j];
        }
      }
      return L;
    };
    const solveL = (L, b) => { const n = b.length, y = new Float64Array(n); for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i][k] * y[k]; y[i] = s / L[i][i]; } return y; };
    const solveLT = (L, b) => { const n = b.length, x = new Float64Array(n); for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k]; x[i] = s / L[i][i]; } return x; };
    const phi = z => Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
    const Phi = z => { // Abramowitz and Stegun approximation of the normal CDF
      const t = 1 / (1 + 0.2316419 * Math.abs(z));
      const d = 0.3989423 * Math.exp(-z * z / 2);
      const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
      return z > 0 ? 1 - p : p;
    };
    const fit = () => {
      if (!X.length) { mean = xs.map(() => 0.4); sd = xs.map(() => 0.34); ei = xs.map(() => 0); return; }
      const avg = Y.reduce((a, b) => a + b, 0) / Y.length;
      const K = X.map((a, i) => X.map((b, j) => kernel(a, b) + (i === j ? NOISE : 0)));
      const L = cholesky(K);
      const alpha = solveLT(L, solveL(L, Y.map(v => v - avg)));
      const best = Math.max(...Y);
      mean = []; sd = []; ei = [];
      xs.forEach(x => {
        const k = X.map(a => kernel(a, x));
        const m = avg + k.reduce((s, v, i) => s + v * alpha[i], 0);
        const v = solveL(L, k);
        const variance = Math.max(1e-9, 1 - v.reduce((s, w) => s + w * w, 0));
        const s = Math.sqrt(variance) * 0.34;
        mean.push(m); sd.push(s);
        const z = (m - best - 0.005) / s;
        ei.push(Math.max(0, (m - best - 0.005) * Phi(z) + s * phi(z)));
      });
    };
    const draw = () => {
      const a = fitCanvas(canvas);
      ctx.setTransform(a.dpr, 0, 0, a.dpr, 0, 0);
      ctx.clearRect(0, 0, a.w, a.h);
      const topH = a.h * 0.72, botY = a.h * 0.78, botH = a.h * 0.2;
      const px = x => 8 + x * (a.w - 16);
      const py = y => topH - clamp(y, -0.05, 1.1) / 1.1 * (topH - 10);
      ctx.fillStyle = 'rgba(132,199,162,.2)';
      ctx.beginPath();
      xs.forEach((x, i) => { const y = py(mean[i] + 2 * sd[i]); if (i) ctx.lineTo(px(x), y); else ctx.moveTo(px(x), y); });
      for (let i = GRID - 1; i >= 0; i--) ctx.lineTo(px(xs[i]), py(mean[i] - 2 * sd[i]));
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(243,239,220,.26)'; ctx.setLineDash([4, 5]); ctx.lineWidth = 1;
      ctx.beginPath();
      xs.forEach((x, i) => { const y = py(objective(x)); if (i) ctx.lineTo(px(x), y); else ctx.moveTo(px(x), y); });
      ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = '#84c7a2'; ctx.lineWidth = 2;
      ctx.beginPath();
      xs.forEach((x, i) => { const y = py(mean[i]); if (i) ctx.lineTo(px(x), y); else ctx.moveTo(px(x), y); });
      ctx.stroke();
      X.forEach((x, i) => {
        ctx.fillStyle = '#d8bb73';
        ctx.beginPath(); ctx.arc(px(x), py(Y[i]), i === X.length - 1 ? 7 : 4.5, 0, 6.283); ctx.fill();
      });
      const peak = Math.max(1e-6, ...ei);
      ctx.fillStyle = 'rgba(216,187,115,.32)'; ctx.strokeStyle = '#d8bb73'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(px(0), botY + botH);
      xs.forEach((x, i) => ctx.lineTo(px(x), botY + botH - ei[i] / peak * botH * 0.92));
      ctx.lineTo(px(1), botY + botH); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.font = '11px "DM Mono", monospace'; ctx.fillStyle = 'rgba(183,197,184,.9)';
      ctx.fillText(currentLang() === 'zh' ? '期望提升' : 'expected improvement', 10, botY + 10);
      ctx.fillText(currentLang() === 'zh' ? '代理模型' : 'surrogate model', 10, 14);
    };
    const count = $('#bo-count', scope), bestOut = $('#bo-best', scope);
    const report = () => {
      count.textContent = X.length;
      bestOut.textContent = Y.length ? Math.max(...Y).toFixed(3) : '–';
    };
    const addPoint = x => { X.push(x); Y.push(objective(x)); fit(); draw(); report(); };
    const next = () => {
      if (!X.length) { addPoint(0.1); return; }
      if (X.length >= 16) return;
      let index = 0;
      ei.forEach((v, i) => { if (v > ei[index]) index = i; });
      addPoint(xs[index]);
    };
    const reset = () => { X = []; Y = []; fit(); draw(); report(); [0.1, 0.5].forEach(addPoint); };
    $('#bo-next', scope).addEventListener('click', next);
    $('#bo-reset', scope).addEventListener('click', reset);
    canvas.addEventListener('pointerdown', event => {
      const box = canvas.getBoundingClientRect();
      if (X.length < 20) addPoint(clamp((event.clientX - box.left - 8) / (box.width - 16)));
    });
    requestAnimationFrame(reset);
  }

  /* ---------- Command palette (Ctrl/Cmd + K) ---------- */
  function initPalette() {
    const dialog = $('#palette');
    if (!dialog) return;
    const input = $('#palette-input'), list = $('#palette-list');
    const jump = id => () => { dialog.close(); goTo(document.getElementById(id)); };
    const study = id => () => { dialog.close(); if (window.__openCase) window.__openCase(id); };
    const COMMANDS = [
      ['Open resume (English)', '查看英文简历', 'PDF', () => { dialog.close(); window.open('assets/Mustofa-Ahmed-Resume-EN.pdf', '_blank', 'noopener'); }],
      ['Open resume (Chinese)', '查看中文简历', 'PDF', () => { dialog.close(); window.open('assets/Mustofa-Ahmed-Resume-ZH.pdf', '_blank', 'noopener'); }],
      ['Copy email', '复制邮箱', 'COPY', () => { dialog.close(); copyText('hafizabc77@gmail.com'); }],
      ['Copy WeChat ID', '复制微信号', 'COPY', () => { dialog.close(); copyText('hafizabc77'); }],
      ['Go to AutoDeploy, my flagship project', '前往旗舰项目 AutoDeploy', 'GO', jump('autodeploy')],
      ['Try the AutoDeploy lab', '体验 AutoDeploy 实验台', 'TRY', jump('dep-lab')],
      ['Case study: AutoDeploy', '案例：AutoDeploy', 'READ', study('autodeploy')],
      ['Case study: speculative decoding', '案例：投机解码', 'READ', study('decoding')],
      ['Case study: LHAASO gamma-ray bursts', '案例：LHAASO 伽马射线暴', 'READ', study('lhaaso')],
      ['Case study: transformers on FPGAs', '案例：FPGA 上的 Transformer', 'READ', study('fpga')],
      ['Case study: Curiosity, my personal AI', '案例：个人 AI 项目 Curiosity', 'READ', study('curiosity')],
      ['Go to results', '前往成果', 'GO', jump('numbers')],
      ['Go to experience', '前往经历', 'GO', jump('experience')],
      ['Go to the decoding playground', '前往投机解码演练场', 'GO', jump('p-spec')],
      ['Go to the LHAASO detector', '前往 LHAASO 探测器', 'GO', jump('p-lhaaso')],
      ['Go to the knowledge graph', '前往知识图谱', 'GO', jump('p-graph')],
      ['Go to skills', '前往技能', 'GO', jump('skills')],
      ['Go to publications', '前往论文', 'GO', jump('publications')],
      ['Go to Curiosity, my personal AI', '前往个人 AI 项目 Curiosity', 'GO', jump('p-agent')],
      ['Go to the MetaHuman film', '前往 MetaHuman 影片', 'GO', jump('meta')],
      ['Go to music videos and AI songs', '前往音乐视频与 AI 歌曲', 'GO', jump('music')],
      ['Go to contact', '前往联系方式', 'GO', jump('contact')],
      ['Switch language', '切换语言', 'EN/中', () => { dialog.close(); $('#language').click(); }],
      ['Open GitHub', '打开 GitHub', 'LINK', () => { dialog.close(); window.open('https://github.com/hafizabc77', '_blank', 'noopener'); }]
    ];
    let shown = [], selected = 0;
    const render = () => {
      const zh = currentLang() === 'zh', q = input.value.trim().toLowerCase();
      shown = COMMANDS.filter(c => !q || c[0].toLowerCase().includes(q) || c[1].includes(q));
      selected = clamp(selected, 0, Math.max(0, shown.length - 1));
      list.innerHTML = '';
      shown.forEach((command, i) => {
        const li = document.createElement('li');
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', String(i === selected));
        li.className = i === selected ? 'sel' : '';
        const name = document.createElement('span');
        name.textContent = zh ? command[1] : command[0];
        const kind = document.createElement('small');
        kind.textContent = command[2];
        li.append(name, kind);
        li.addEventListener('click', () => command[3]());
        li.addEventListener('pointermove', () => { if (selected !== i) { selected = i; render(); } });
        list.append(li);
      });
      input.placeholder = zh ? '输入命令' : 'Type a command';
    };
    const open = () => { input.value = ''; selected = 0; render(); openDialog(dialog); input.focus(); };
    document.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (dialog.open) dialog.close(); else open();
      }
    });
    const button = $('#palette-open');
    if (button) {
      if (/Mac/.test(navigator.platform)) $('kbd', button).textContent = '⌘K';
      button.addEventListener('click', open);
    }
    input.addEventListener('input', () => { selected = 0; render(); });
    input.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown') { event.preventDefault(); selected = (selected + 1) % Math.max(1, shown.length); render(); }
      if (event.key === 'ArrowUp') { event.preventDefault(); selected = (selected - 1 + shown.length) % Math.max(1, shown.length); render(); }
      if (event.key === 'Enter' && shown[selected]) { event.preventDefault(); shown[selected][3](); }
    });
  }

  /* ---------- Video: one player at a time ---------- */
  function initMedia() {
    document.addEventListener('play', event => {
      if (!event.target.matches('video')) return;
      $$('video').forEach(media => { if (media !== event.target) media.pause(); });
      $$('.song.playing .track-play').forEach(b => b.click());
    }, true);
  }

  /* ---------- WebGL stage ---------- */
  let scene = null;
  function initScene() {
    const canvas = $('#scene');
    if (!canvas || !FX || !window.createScene) return;
    const connection = navigator.connection;
    if (connection && connection.saveData) return;
    const small = innerWidth < 760;
    const rich = FINE && !small;
    const memory = navigator.deviceMemory || 4;
    const count = small ? (memory <= 2 ? 6000 : 11000) : 20000;
    scene = window.createScene(canvas, {
      count,
      maxDpr: 1.5,
      fluid: rich && params.get('fluid') !== '0',
      planes: rich,
      keepQuality: params.get('hq') === '1'
    });
    if (!scene) return;
    root.classList.add('has-gl');
    const shapeAnchors = () => {
      const list = [];
      $$('[data-shape]').forEach(el => {
        if (el.classList.contains('step')) return;
        // On a phone text sits on top of the particles, so anything behind reading content is dimmer.
        const dim = parseFloat(el.dataset.dim || '0.3') * (small ? 0.55 : 1);
        const ink = el.dataset.ink ? parseFloat(el.dataset.ink) : 0.8;
        list.push({ y: Math.max(0, docTop(el) - state.vh * 0.25), shape: el.dataset.shape, dim, ink });
      });
      const numbers = $('#numbers');
      if (numbers) {
        const steps = $$('.step', numbers), top = docTop(numbers);
        const range = Math.max(1, numbers.offsetHeight - state.vh);
        steps.forEach((step, i) => list.push({ y: top + range * (i + 0.5) / steps.length, shape: step.dataset.shape, dim: 1, ink: 0.55 }));
      }
      list.sort((a, b) => a.y - b.y);
      if (list.length) list[0].y = 0;
      return list;
    };
    measureTasks.push(() => scene.setAnchors(shapeAnchors()));
    window.addEventListener('resize', () => scene.resize());
    if (document.fonts && document.fonts.load) {
      document.fonts.load('700 200px "DM Sans"').then(() => scene.rebuild()).catch(() => { /* Shapes then use fallback fonts. */ });
    }
    document.addEventListener('pointerdown', event => {
      if (event.target.closest('a,button,input,summary,video,audio,canvas,dialog,.case')) return;
      scene.pulse(event.clientX, event.clientY, performance.now() / 1000);
    }, { passive: true });

    // Image planes: drawn in the stage so the ink ripples through them.
    if (scene.hasPlanes) {
      const planes = $$('[data-plane]').map(img => {
        const focus = (img.dataset.focus || '0.5,0.5').split(',').map(Number);
        const plane = scene.addPlane(img, {
          src: img.dataset.hq || img.currentSrc || img.src,
          depth: img.dataset.depth,
          shape: img.dataset.plane,
          radius: 12,
          focus
        });
        return { img, plane };
      });
      const hero = planes.find(p => p.img.id === 'hero-photo');
      if (hero) {
        frameTasks.push(() => { hero.plane.dissolve = clamp((state.smoothY - state.vh * 0.12) / (state.vh * 0.8)); });
      }
    }
    // While an opaque section fills the screen the stage cannot be seen, so skip it and save the GPU.
    let covers = [];
    measureTasks.push(() => { covers = $$('[data-covers-scene]').map(el => { const t = docTop(el); return { top: t, bottom: t + el.offsetHeight }; }); });
    frameTasks.push((dt, nowSec) => {
      const y = state.y;
      for (let i = 0; i < covers.length; i++) if (y >= covers[i].top && y + state.vh <= covers[i].bottom) return;
      scene.render(nowSec, state.smoothY, dt);
    });
    window.__scene = scene;
  }

  /* ---------- Main loop ---------- */
  function startLoop() {
    let last = performance.now();
    const loop = now => {
      const dt = Math.min(100, now - last);
      last = now;
      if (lenis) lenis.raf(now);
      const y = window.scrollY;
      const previous = state.y;
      state.y = y;
      state.velocity = lerp(state.velocity, y - previous, 0.25);
      state.smoothY = lenis ? y : lerp(state.smoothY, y, 0.45);
      if (Math.abs(state.smoothY - y) < 0.05) state.smoothY = y;
      const nowSec = now / 1000;
      for (let i = 0; i < frameTasks.length; i++) {
        // If one effect ever fails, drop only that effect and keep everything else running.
        try { frameTasks[i](dt, nowSec); }
        catch (error) { console.error('[frame]', error); frameTasks.splice(i, 1); i -= 1; }
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /* ---------- Start ---------- */
  safe('split+language', () => setLanguage(initialLanguage()));
  $('#language').addEventListener('click', () => {
    const next = currentLang() === 'en' ? 'zh' : 'en';
    setLanguage(next);
    try { localStorage.setItem(CHOICE_KEY, next); } catch (e) { /* ignore */ }
  });
  safe('scroll', initScroll);
  safe('scene', initScene);
  safe('horizontal', initHorizontal);
  safe('pointer', initPointer);
  safe('chrome', initChrome);
  safe('effects', initScrollEffects);
  safe('numbers', initNumbers);
  safe('roles', initRoles);
  safe('playground', initPlayground);
  safe('graph', initGraph);
  const labContext = { $, $$, clamp, lerp, frameTasks, measureTasks, refreshTasks, state, fitCanvas, currentLang, docTop, FX, FINE, reducedMotion };
  ['autoDeploy', 'autoDeployLab', 'wcda', 'fabric', 'assistant'].forEach(name => {
    if (window.LABS && window.LABS[name]) safe(name, () => window.LABS[name](labContext));
  });
  safe('previews', initPreviews);
  safe('proximity', initProximityTitle);
  safe('meta', initMeta);
  safe('tracks', initTracks);
  safe('dialogs', initDialogs);
  safe('cases', initCases);
  safe('palette', initPalette);
  safe('media', initMedia);
  safe('transitions', initTransitions);
  safe('reveal', initReveal);
  measureAll();
  window.addEventListener('resize', measureSoon);
  window.addEventListener('load', measureAll);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureAll);
  if (window.ResizeObserver) new ResizeObserver(measureSoon).observe(document.body);
  safe('loader', runLoader);
  if ($('.creative-hero')) {
    $$('.creative-hero [data-split]').forEach(el => setTimeout(() => el.classList.add('in'), 200));
  }
  // A slow connection showed the content early; keep what is on screen visible and let the rest reveal on scroll as usual.
  if (root.classList.contains('fx-slow')) {
    $$('[data-rise],[data-reveal]').forEach(el => { if (el.getBoundingClientRect().top < innerHeight) el.classList.add('in'); });
    root.classList.remove('fx-slow');
  }
  startLoop();
  window.__fxReady = true;
})();
