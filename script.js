/* Hand-written motion engine. One requestAnimationFrame loop drives everything:
   smooth scrolling, scroll-linked effects, the cursor and the WebGL scene.
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

  function safe(name, fn) {
    try { return fn(); } catch (error) { console.error(`[${name}]`, error); return undefined; }
  }

  const frameTasks = [];
  const measureTasks = [];
  const refreshTasks = []; // Run after the language changes.
  const state = { y: window.scrollY, smoothY: window.scrollY, velocity: 0, vw: innerWidth, vh: innerHeight };

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
    const words = el.textContent.split(/(\s+)/).filter(Boolean);
    el.setAttribute('aria-label', el.textContent);
    el.textContent = '';
    words.forEach(word => {
      if (/^\s+$/.test(word)) { el.append(' '); return; }
      (CJK.test(word) ? [...word] : [word]).forEach(part => {
        const span = document.createElement('span');
        span.className = 'sw';
        span.setAttribute('aria-hidden', 'true');
        span.textContent = part;
        el.append(span);
      });
    });
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
    // Hold the width so nearby items do not jitter while glyphs change.
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
    const param = new URLSearchParams(location.search).get('lang');
    if (param === 'zh' || param === 'en') return param;
    let stored = null;
    try { stored = localStorage.getItem(CHOICE_KEY); } catch (e) { /* storage can be blocked */ }
    if (stored === 'zh' || stored === 'en') return stored;
    return (navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
  }
  const currentLang = () => (root.lang === 'en' ? 'en' : 'zh');
  function setLanguage(lang) {
    root.lang = lang === 'zh' ? 'zh-CN' : 'en';
    $$('[data-scramble-hover],[data-scramble]').forEach(el => { if (el._scrambling) el._scrambleCancel = true; });
    $$('[data-en]').forEach(el => { el.innerHTML = el.dataset[lang]; });
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
      lenis = new window.Lenis({ lerp: 0.085, wheelMultiplier: 1, smoothWheel: true });
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
    $('.hero-portrait', hero).classList.add('in');
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

  /* ---------- Preloader ---------- */
  function runLoader() {
    const loader = $('#loader');
    if (!loader || !FX || root.classList.contains('intro-done')) {
      if (loader) loader.remove();
      heroIn();
      return;
    }
    const num = $('#loader-num'), label = $('#loader-text'), tokens = $$('.loader-tokens i', loader);
    const zh = currentLang() === 'zh';
    const phases = zh ? ['正在加载权重', '正在预热 GPU', '准备就绪'] : ['Loading weights', 'Warming up GPU', 'Ready'];
    label.textContent = phases[0];
    const start = performance.now(), duration = 1050;
    const tick = now => {
      const t = clamp((now - start) / duration), eased = 1 - Math.pow(1 - t, 2.4);
      const pct = Math.round(eased * 100);
      num.textContent = pct;
      label.textContent = phases[pct < 55 ? 0 : pct < 100 ? 1 : 2];
      tokens.forEach((token, i) => token.classList.toggle('on', i < Math.round(eased * tokens.length)));
      if (t < 1) { requestAnimationFrame(tick); return; }
      try { sessionStorage.setItem('hafiz-intro-done', '1'); } catch (e) { /* ignore */ }
      setTimeout(() => {
        loader.classList.add('done');
        setTimeout(heroIn, 220);
        setTimeout(() => loader.remove(), 1100);
      }, 130);
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
      const text = el && el.dataset.cursor;
      ring.classList.toggle('is-label', !!text);
      ring.classList.toggle('is-link', !!el && !text);
      label.textContent = text || '';
    }, { passive: true });
    document.addEventListener('pointerdown', () => ring.classList.add('is-down'));
    document.addEventListener('pointerup', () => ring.classList.remove('is-down'));
    document.documentElement.addEventListener('pointerleave', () => { if (scene) scene.pointerLeave(); });
    frameTasks.push(() => {
      rx = lerp(rx, pointer.x, 0.2);
      ry = lerp(ry, pointer.y, 0.2);
      ring.style.transform = `translate3d(${rx}px,${ry}px,0)`;
      dot.style.transform = `translate3d(${pointer.x}px,${pointer.y}px,0)`;
    });

    $$('[data-magnetic]').forEach(el => {
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

    $$('[data-tilt]').forEach(el => {
      el.addEventListener('pointermove', event => {
        const box = el.getBoundingClientRect();
        el.style.setProperty('--ry', `${((event.clientX - box.left) / box.width - 0.5) * 9}deg`);
        el.style.setProperty('--rx', `${-((event.clientY - box.top) / box.height - 0.5) * 9}deg`);
      });
      el.addEventListener('pointerleave', () => { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); });
    });

    $$('[data-spot]').forEach(el => {
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
    if (document.hasFocus && $('.scroll-cue')) {
      frameTasks.push(() => { $('.scroll-cue').style.opacity = state.y > 40 ? 0 : 1; });
    }
  }

  /* ---------- Marquee that reacts to scroll speed and direction ---------- */
  function initTicker() {
    const track = $('.ticker-track');
    if (!track || !FX) return;
    let x = 0, half = 0, skew = 0, dir = 1;
    measureTasks.push(() => { half = track.firstElementChild.getBoundingClientRect().width; });
    frameTasks.push((dt) => {
      if (!half) return;
      if (Math.abs(state.velocity) > 0.2) dir = state.velocity > 0 ? 1 : -1;
      x -= (0.045 * dt + Math.abs(state.velocity) * 0.5) * dir;
      if (x <= -half) x += half;
      if (x > 0) x -= half;
      skew = lerp(skew, clamp(state.velocity * 0.32, -14, 14), 0.1);
      track.style.transform = `translate3d(${x}px,0,0) skewX(${-skew}deg)`;
    });
  }

  /* ---------- Scroll-linked words, timeline, parallax ---------- */
  function initScrollEffects() {
    if (!FX) return;
    let wordBlocks = [];
    const collect = () => {
      wordBlocks = $$('[data-words]').map(el => ({ el, words: $$('.sw', el), top: docTop(el), height: el.offsetHeight }));
    };
    measureTasks.push(collect);
    frameTasks.push(() => {
      wordBlocks.forEach(block => {
        const p = clamp((state.smoothY + state.vh * 0.84 - block.top) / (block.height + state.vh * 0.46));
        const lit = p * block.words.length;
        block.words.forEach((word, i) => { word.style.setProperty('--o', clamp(0.14 + (lit - i) * 0.5, 0.14, 1).toFixed(2)); });
      });
    });

    const timeline = $('.timeline'), line = $('.timeline-line');
    if (timeline) {
      let top = 0, height = 1;
      measureTasks.push(() => { top = docTop(timeline); height = timeline.offsetHeight; });
      frameTasks.push(() => line.style.setProperty('--p', clamp((state.smoothY + state.vh * 0.7 - top) / height).toFixed(3)));
    }

    const portrait = $('.hero-portrait');
    if (portrait) {
      const mask = $('.portrait-mask img', portrait);
      frameTasks.push(() => {
        const p = clamp(state.smoothY / state.vh);
        mask.style.setProperty('--pz', p.toFixed(3));
        portrait.style.translate = `0 ${(p * state.vh * 0.14).toFixed(1)}px`;
      });
    }

    const cinema = $('#cinema'), cinemaSection = $('#cinema-section');
    if (cinema && cinemaSection && innerWidth > 760) {
      let top = 0, range = 1;
      measureTasks.push(() => { top = docTop(cinemaSection); range = Math.max(1, cinemaSection.offsetHeight - state.vh); });
      frameTasks.push(() => cinema.style.setProperty('--p', clamp((state.smoothY - top + state.vh * 0.35) / (range * 0.75 + state.vh * 0.35)).toFixed(3)));
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
    let top = 0, travel = 0, x = 0;
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
      const p = clamp((state.smoothY - top) / travel);
      x = lerp(x, p * travel, 0.2);
      track.style.transform = `translate3d(${-x.toFixed(1)}px,0,0)`;
      bar.style.setProperty('--p', p.toFixed(4));
    });
    // Tabbing into an off-screen panel must move the scroll story, not the clipped container.
    const sticky = $('.projects-sticky', section);
    section.addEventListener('focusin', event => {
      if (!travel) return;
      sticky.scrollLeft = 0;
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
        for (let i = 0; i < drafted; i++) spec.slots[from + i].className = i < accepted ? 'on' : (i === accepted ? 'on' : 'no');
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
    const nodes = GRAPH_NODES.map(([label, kind]) => ({ label, kind, x: 0, y: 0, vx: 0, vy: 0, pin: false, links: new Set() }));
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
    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) { size(); } }, { threshold: 0.05 }).observe(canvas);
    size();
  }

  /* ---------- Terminal typed once when it scrolls into view ---------- */
  function initTerminal() {
    const output = $('#terminal-text');
    if (!output) return;
    const text = [
      '$ assistant status',
      'model    Qwen3.8-27B',
      'runtime  llama.cpp (local)',
      'agent    Hermes Agent, tool use',
      'uptime   always on',
      '$ '
    ].join('\n');
    if (!FX) { output.textContent = text; return; }
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      let i = 0;
      const type = () => {
        i += 1;
        output.textContent = text.slice(0, i);
        if (i < text.length) setTimeout(type, text[i] === '\n' ? 170 : 18);
      };
      type();
    }, { threshold: 0.3 });
    io.observe(output);
  }

  /* ---------- Floating image that follows the pointer over a list ---------- */
  function initHoverList() {
    const list = $('#hover-list');
    if (!list || !FX || !FINE) return;
    const preview = document.createElement('div');
    preview.className = 'float-preview';
    preview.setAttribute('aria-hidden', 'true');
    const img = document.createElement('img');
    img.alt = '';
    preview.append(img);
    document.body.append(preview);
    let tx = 0, ty = 0, x = 0, y = 0, shown = false;
    const aim = event => {
      tx = Math.min(event.clientX + 40, innerWidth - preview.offsetWidth - 20);
      ty = clamp(event.clientY - preview.offsetHeight / 2, 12, innerHeight - preview.offsetHeight - 12);
    };
    $$('li', list).forEach(li => {
      li.addEventListener('pointerenter', event => {
        img.src = li.dataset.image;
        aim(event);
        if (!shown) { x = tx; y = ty; } // Appear at the pointer, rather than flying in from the corner.
        preview.classList.add('show');
        shown = true;
      });
    });
    list.addEventListener('pointerleave', () => { preview.classList.remove('show'); shown = false; });
    list.addEventListener('pointermove', aim);
    frameTasks.push(() => {
      if (!shown) return;
      const vx = tx - x;
      x += vx * 0.14;
      y += (ty - y) * 0.14;
      preview.style.transform = `translate3d(${x}px,${y}px,0) rotate(${clamp(vx * 0.03, -8, 8)}deg) scale(1)`;
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
    let active = false;
    new IntersectionObserver(([entry]) => { active = entry.isIntersecting; }, { threshold: 0 }).observe(title);
    frameTasks.push(() => {
      if (!active || !pointer.active) return;
      chars.forEach(c => {
        const box = c.getBoundingClientRect();
        const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
        const d = Math.hypot(pointer.x - cx, pointer.y - cy);
        const f = clamp(1 - d / 240);
        c.style.transform = `translateY(${(-f * 18).toFixed(1)}px) rotate(${(f * (cx - pointer.x) * 0.04).toFixed(1)}deg)`;
        c.style.color = f > 0.45 ? 'var(--mint)' : '';
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
  function initDialogs() {
    $$('[data-copy]').forEach(button => button.addEventListener('click', () => copyText(button.dataset.copy)));
    $$('dialog').forEach(dialog => {
      const close = $('.dialog-close', dialog);
      if (close) close.addEventListener('click', () => (dialog.close ? dialog.close() : dialog.removeAttribute('open')));
      dialog.addEventListener('click', event => { if (event.target === dialog && dialog.close) dialog.close(); });
      dialog.addEventListener('close', () => { if (lenis) lenis.start(); });
    });
    const wechat = $('#wechat-dialog'), opener = $('#wechat-open');
    if (wechat && opener) opener.addEventListener('click', () => openDialog(wechat));
    const imageDialog = $('#image-dialog');
    if (imageDialog) {
      $$('.gallery-frame img,[data-enlarge]').forEach(img => {
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
  }

  /* ---------- AutoDeploy gallery ---------- */
  const SLIDES = [
    ['autodeploy-cli.webp', 'AutoDeploy command-line interface', 'A practical interface for deployment, validation and diagnostics.', '通过实用的命令行界面完成部署、验证与诊断。'],
    ['autodeploy-graph.webp', 'AutoDeploy knowledge graph', 'Reusable knowledge connects models, tools, hardware and previous deployment runs.', '知识图谱连接模型、工具、硬件与历史部署记录，让经验可以复用。'],
    ['parser_workflow.webp', 'AutoDeploy model analysis workflow', 'Model analysis turns an input model into structured information for planning.', '模型分析将输入模型转换为结构化信息，为部署规划提供依据。'],
    ['orchestrator_overview.webp', 'AutoDeploy execution workflow', 'The orchestrator coordinates execution, validation and recovery, with traceable records.', '编排器协调执行、验证与恢复，并保留可追溯的过程记录。']
  ];
  function initGallery() {
    const img = $('#autodeploy-slide');
    if (!img) return;
    let index = 0;
    const change = direction => {
      index = (index + direction + SLIDES.length) % SLIDES.length;
      const [src, alt, en, zh] = SLIDES[index];
      const caption = $('.gallery-caption');
      img.src = `assets/showcase/${src}`;
      img.alt = alt;
      caption.dataset.en = en;
      caption.dataset.zh = zh;
      caption.textContent = currentLang() === 'zh' ? zh : en;
      $('#gallery-count').textContent = `${index + 1} / ${SLIDES.length}`;
      img.classList.remove('swap');
      void img.offsetWidth;
      img.classList.add('swap');
    };
    $('#gallery-prev').addEventListener('click', () => change(-1));
    $('#gallery-next').addEventListener('click', () => change(1));
  }

  /* ---------- Command palette (Ctrl/Cmd + K) ---------- */
  function initPalette() {
    const dialog = $('#palette');
    if (!dialog) return;
    const input = $('#palette-input'), list = $('#palette-list');
    const jump = id => () => { dialog.close(); goTo(document.getElementById(id)); };
    const COMMANDS = [
      ['Open resume (English)', '查看英文简历', 'PDF', () => { dialog.close(); window.open('assets/Mustofa-Ahmed-Resume-EN.pdf', '_blank', 'noopener'); }],
      ['Open resume (Chinese)', '查看中文简历', 'PDF', () => { dialog.close(); window.open('assets/Mustofa-Ahmed-Resume-ZH.pdf', '_blank', 'noopener'); }],
      ['Copy email', '复制邮箱', 'COPY', () => { dialog.close(); copyText('hafizabc77@gmail.com'); }],
      ['Copy WeChat ID', '复制微信号', 'COPY', () => { dialog.close(); copyText('hafizabc77'); }],
      ['Go to results', '前往成果', 'GO', jump('numbers')],
      ['Go to experience', '前往经历', 'GO', jump('experience')],
      ['Go to the speculative decoding playground', '前往投机解码演练场', 'GO', jump('p-spec')],
      ['Go to the knowledge graph', '前往知识图谱', 'GO', jump('p-graph')],
      ['Go to skills', '前往技能', 'GO', jump('skills')],
      ['Go to publications', '前往论文', 'GO', jump('publications')],
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

  /* ---------- Media: one player at a time, animated bars while audio plays ---------- */
  function initMedia() {
    document.addEventListener('play', event => {
      if (!event.target.matches('audio,video')) return;
      $$('audio,video').forEach(media => { if (media !== event.target) media.pause(); });
      const card = event.target.closest('.audio-card');
      if (card) card.classList.add('playing');
    }, true);
    ['pause', 'ended'].forEach(type => document.addEventListener(type, event => {
      const card = event.target.closest && event.target.closest('.audio-card');
      if (card) card.classList.remove('playing');
    }, true));
  }

  /* ---------- WebGL scene ---------- */
  let scene = null;
  function initScene() {
    const canvas = $('#scene');
    if (!canvas || !FX || !window.createScene) return;
    const connection = navigator.connection;
    if (connection && connection.saveData) return;
    const small = innerWidth < 760;
    const memory = navigator.deviceMemory || 4;
    const count = small ? (memory <= 2 ? 6000 : 11000) : 26000;
    scene = window.createScene(canvas, { count, maxDpr: small ? 1.5 : 1.75 });
    if (!scene) return;
    root.classList.add('has-gl');
    const shapeAnchors = () => {
      const list = [];
      $$('[data-shape]').forEach(el => {
        if (el.classList.contains('step')) return;
        // On a phone text sits on top of the particles, so anything behind reading content is dimmer.
        const dim = parseFloat(el.dataset.dim || '0.3') * (small ? 0.55 : 1);
        list.push({ y: Math.max(0, docTop(el) - state.vh * 0.25), shape: el.dataset.shape, dim });
      });
      const numbers = $('#numbers');
      if (numbers) {
        const steps = $$('.step', numbers), top = docTop(numbers);
        const range = Math.max(1, numbers.offsetHeight - state.vh);
        steps.forEach((step, i) => {
          list.push({ y: top + range * (i + 0.5) / steps.length, shape: step.dataset.shape, dim: i === 2 ? 1 : 1 });
        });
      }
      list.sort((a, b) => a.y - b.y);
      if (list.length) list[0].y = 0;
      return list;
    };
    measureTasks.push(() => scene.setAnchors(shapeAnchors()));
    window.addEventListener('resize', () => scene.resize());
    if (document.fonts && document.fonts.load) {
      Promise.all([
        document.fonts.load('italic 600 200px "Cormorant Garamond"'),
        document.fonts.load('700 200px "DM Sans"')
      ]).then(() => scene.rebuild()).catch(() => { /* Shapes then use fallback fonts. */ });
    }
    document.addEventListener('pointerdown', event => {
      if (event.target.closest('a,button,input,summary,video,audio,canvas,dialog')) return;
      scene.pulse(event.clientX, event.clientY, performance.now() / 1000);
    }, { passive: true });
    frameTasks.push((dt, nowSec) => scene.render(nowSec, state.smoothY, dt));
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
      state.smoothY = lerp(state.smoothY, y, FINE ? 0.5 : 0.35);
      if (Math.abs(state.smoothY - y) < 0.05) state.smoothY = y;
      const nowSec = now / 1000;
      for (let i = 0; i < frameTasks.length; i++) frameTasks[i](dt, nowSec);
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
  safe('ticker', initTicker);
  safe('effects', initScrollEffects);
  safe('numbers', initNumbers);
  safe('roles', initRoles);
  safe('playground', initPlayground);
  safe('graph', initGraph);
  safe('terminal', initTerminal);
  safe('hover-list', initHoverList);
  safe('proximity', initProximityTitle);
  safe('dialogs', initDialogs);
  safe('gallery', initGallery);
  safe('palette', initPalette);
  safe('media', initMedia);
  safe('transitions', initTransitions);
  safe('reveal', initReveal);
  measureAll();
  window.addEventListener('resize', measureSoon);
  window.addEventListener('load', measureAll);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureAll);
  $$('details').forEach(d => d.addEventListener('toggle', measureSoon));
  if (window.ResizeObserver) new ResizeObserver(measureSoon).observe(document.body);
  safe('loader', runLoader);
  if ($('.creative-hero')) {
    $$('.creative-hero [data-split]').forEach(el => setTimeout(() => el.classList.add('in'), 200));
  }
  startLoop();
  window.__fxReady = true;
})();
