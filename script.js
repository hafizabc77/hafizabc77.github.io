const root = document.documentElement;
const body = document.body;
const header = document.querySelector(".site-header");
const navToggle = document.querySelector(".nav-toggle");
const navLinks = document.querySelector(".nav-links");
const themeToggle = document.querySelector(".theme-toggle");
const repoGrid = document.querySelector("#repo-grid");
const scrollProgress = document.querySelector(".scroll-rail span");
const cursorRing = document.querySelector(".cursor-ring");
const cursorDot = document.querySelector(".cursor-dot");
const cursorLabel = document.querySelector(".cursor-label");

const storedTheme = localStorage.getItem("theme");
const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
root.dataset.theme = storedTheme || (prefersLight ? "light" : "dark");

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function setTheme(theme) {
  root.dataset.theme = theme;
  localStorage.setItem("theme", theme);
  const icon = themeToggle?.querySelector("i");
  if (icon) {
    icon.dataset.lucide = theme === "dark" ? "sun" : "moon";
    refreshIcons();
  }
}

setTheme(root.dataset.theme);

themeToggle?.addEventListener("click", () => {
  setTheme(root.dataset.theme === "dark" ? "light" : "dark");
});

navToggle?.addEventListener("click", () => {
  const isOpen = navLinks.dataset.open === "true";
  navLinks.dataset.open = String(!isOpen);
  navToggle.setAttribute("aria-expanded", String(!isOpen));
});

document.querySelectorAll(".nav-links a").forEach((link) => {
  link.addEventListener("click", () => {
    navLinks.dataset.open = "false";
    navToggle?.setAttribute("aria-expanded", "false");
  });
});

function updateScrollState() {
  const scrollable = document.documentElement.scrollHeight - window.innerHeight;
  const progress = scrollable > 0 ? (window.scrollY / scrollable) * 100 : 0;
  header.dataset.elevated = String(window.scrollY > 18);
  if (scrollProgress) {
    scrollProgress.style.setProperty("--scroll", `${progress}%`);
  }
}

window.addEventListener("scroll", updateScrollState, { passive: true });
updateScrollState();

const navAnchors = [...document.querySelectorAll(".nav-links a")];
const observedSections = [...document.querySelectorAll("main section[id]")];

const sectionObserver = new IntersectionObserver(
  (entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

    if (!visible) return;

    navAnchors.forEach((anchor) => {
      anchor.classList.toggle("active", anchor.getAttribute("href") === `#${visible.target.id}`);
    });
  },
  { rootMargin: "-34% 0px -55% 0px", threshold: [0.15, 0.35, 0.6] }
);

observedSections.forEach((section) => sectionObserver.observe(section));

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        const scrambleTarget = entry.target.matches("[data-scramble]")
          ? entry.target
          : entry.target.querySelector("[data-scramble]");
        if (scrambleTarget) scramble(scrambleTarget);
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.16, rootMargin: "0px 0px -8% 0px" }
);

document.querySelectorAll(".reveal").forEach((item) => revealObserver.observe(item));

const labVisual = document.querySelector("#lab-visual");
const labMode = document.querySelector("#lab-mode");
const labEquation = document.querySelector("#lab-equation");
const labPaths = document.querySelectorAll(".live-curve");

const labScenes = {
  scaling: {
    label: "Scaling law",
    equation: "U(N,D)=Uinf+A/N^alpha+B/D^beta",
    paths: [
      "M96 408C168 392 222 328 280 242C350 140 458 98 690 86",
      "M96 410C176 370 236 286 318 222C424 138 542 152 690 144",
      "M96 438C180 408 240 384 330 336C456 268 552 248 690 234"
    ]
  },
  grb: {
    label: "GRB sensitivity",
    equation: "argmax sensitivity(cuts, windows, background)",
    paths: [
      "M96 410C160 386 210 356 282 298C356 238 468 180 690 132",
      "M96 388C176 362 252 316 324 248C424 154 546 126 690 112",
      "M96 436C170 418 244 382 344 336C472 278 570 260 690 252"
    ]
  },
  gap: {
    label: "Gap ratio",
    equation: "gap_ratio = U / Ustat",
    paths: [
      "M96 326C164 324 236 318 316 298C414 274 528 220 690 166",
      "M96 392C184 358 260 304 336 236C442 142 558 126 690 118",
      "M96 438C178 424 254 410 344 390C472 360 582 348 690 336"
    ]
  },
  compress: {
    label: "Compression frontier",
    equation: "scale -> prune -> quantize -> deploy",
    paths: [
      "M96 236C186 160 254 126 348 104C456 78 570 82 690 78",
      "M96 294C174 282 266 276 360 276C482 276 586 264 690 254",
      "M96 410C172 360 250 324 348 308C466 288 570 292 690 286"
    ]
  }
};

function setLabScene(mode) {
  const scene = labScenes[mode];
  if (!scene) return;
  labVisual.dataset.mode = mode;
  labMode.textContent = scene.label;
  labEquation.textContent = scene.equation;
  labPaths.forEach((path, index) => path.setAttribute("d", scene.paths[index]));
  document.querySelectorAll(".scene-step").forEach((step) => {
    step.classList.toggle("active", step.dataset.mode === mode);
  });
}

const sceneObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) setLabScene(entry.target.dataset.mode);
    });
  },
  { threshold: 0.58 }
);

document.querySelectorAll(".scene-step").forEach((step) => sceneObserver.observe(step));

const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_+-/[]{}";

function scramble(element) {
  const original = element.dataset.original || element.textContent;
  element.dataset.original = original;
  let frame = 0;
  const maxFrames = 16;
  clearInterval(element._scrambleTimer);
  element._scrambleTimer = setInterval(() => {
    const output = original
      .split("")
      .map((char, index) => {
        if (char === " " || index < (frame / maxFrames) * original.length) return char;
        return letters[Math.floor(Math.random() * letters.length)];
      })
      .join("");
    element.textContent = output;
    frame += 1;
    if (frame > maxFrames) {
      clearInterval(element._scrambleTimer);
      element.textContent = original;
    }
  }, 32);
}

document.querySelectorAll("[data-scramble]").forEach((item) => {
  item.addEventListener("mouseenter", () => scramble(item));
});

function setupPointerInteractions() {
  const finePointer = window.matchMedia("(pointer: fine)").matches;
  if (!finePointer || !cursorRing || !cursorDot) return;

  let pointerX = window.innerWidth / 2;
  let pointerY = window.innerHeight / 2;
  let ringX = pointerX;
  let ringY = pointerY;

  window.addEventListener(
    "pointermove",
    (event) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      root.style.setProperty("--mx", `${pointerX}px`);
      root.style.setProperty("--my", `${pointerY}px`);
      body.classList.add("pointer-ready");
      cursorDot.style.transform = `translate(${pointerX}px, ${pointerY}px) translate(-50%, -50%)`;
      cursorLabel.style.transform = `translate(${pointerX + 18}px, ${pointerY + 18}px)`;
    },
    { passive: true }
  );

  function animateCursor() {
    ringX += (pointerX - ringX) * 0.18;
    ringY += (pointerY - ringY) * 0.18;
    cursorRing.style.transform = `translate(${ringX}px, ${ringY}px) translate(-50%, -50%)`;
    requestAnimationFrame(animateCursor);
  }
  animateCursor();

  document.querySelectorAll("[data-cursor]").forEach((item) => {
    item.addEventListener("mouseenter", () => {
      body.classList.add("pointer-grow", "pointer-label");
      cursorLabel.textContent = item.dataset.cursor;
    });
    item.addEventListener("mouseleave", () => {
      body.classList.remove("pointer-grow", "pointer-label");
    });
  });

  document.querySelectorAll(".magnetic").forEach((item) => {
    item.addEventListener("pointermove", (event) => {
      const rect = item.getBoundingClientRect();
      const x = event.clientX - rect.left - rect.width / 2;
      const y = event.clientY - rect.top - rect.height / 2;
      item.style.transform = `translate(${x * 0.16}px, ${y * 0.16}px)`;
    });
    item.addEventListener("pointerleave", () => {
      item.style.transform = "";
    });
  });

  document.querySelectorAll(".tilt-card").forEach((card) => {
    card.addEventListener("pointermove", (event) => {
      const rect = card.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width;
      const py = (event.clientY - rect.top) / rect.height;
      card.style.setProperty("--rx", `${(0.5 - py) * 9}deg`);
      card.style.setProperty("--ry", `${(px - 0.5) * 10}deg`);
    });
    card.addEventListener("pointerleave", () => {
      card.style.setProperty("--rx", "0deg");
      card.style.setProperty("--ry", "0deg");
    });
  });
}

const languageColors = {
  Python: "#3572a5",
  JavaScript: "#c8a024",
  "C++": "#ff5f4a",
  C: "#9aa8b6",
  HTML: "#e06b41",
  CSS: "#78a8ff",
  Shell: "#7cff99",
  Jupyter: "#ffd15a",
  TeX: "#52f0df"
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

function renderFallbackRepos() {
  repoGrid.innerHTML = `
    <article class="repo-card">
      <strong><i data-lucide="github"></i> hafizabc77</strong>
      <p>GitHub repository metadata could not be loaded in this browser session.</p>
      <div class="repo-meta">
        <span><i data-lucide="external-link"></i><a href="https://github.com/hafizabc77" target="_blank" rel="noreferrer">Open profile</a></span>
      </div>
    </article>
  `;
  refreshIcons();
}

async function loadRepos() {
  if (!repoGrid) return;

  try {
    const response = await fetch("https://api.github.com/users/hafizabc77/repos?sort=updated&per_page=12", {
      headers: { Accept: "application/vnd.github+json" }
    });

    if (!response.ok) throw new Error(`GitHub API returned ${response.status}`);

    const repos = await response.json();
    const visibleRepos = repos
      .filter((repo) => !repo.fork)
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      .slice(0, 6);

    if (!visibleRepos.length) {
      renderFallbackRepos();
      return;
    }

    repoGrid.innerHTML = visibleRepos
      .map((repo) => {
        const language = repo.language || "Code";
        const color = languageColors[language] || "#52f0df";
        const description = repo.description || "Public repository from hafizabc77.";

        return `
          <a class="repo-card tilt-card" href="${escapeHtml(repo.html_url)}" target="_blank" rel="noreferrer" data-cursor="repo">
            <strong><i data-lucide="github"></i>${escapeHtml(repo.name)}</strong>
            <p>${escapeHtml(description)}</p>
            <div class="repo-meta">
              <span><span class="language-dot" style="background:${color}"></span>${escapeHtml(language)}</span>
              <span><i data-lucide="star"></i>${repo.stargazers_count}</span>
              <span><i data-lucide="git-fork"></i>${repo.forks_count}</span>
              <span><i data-lucide="clock-3"></i>${formatDate(repo.updated_at)}</span>
            </div>
          </a>
        `;
      })
      .join("");

    refreshIcons();
    setupPointerInteractions();
  } catch (error) {
    renderFallbackRepos();
  }
}

function startFieldCanvas() {
  const canvas = document.querySelector("#field-canvas");
  if (!canvas || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const ctx = canvas.getContext("2d");
  const particles = [];
  const beams = [];
  let width = 0;
  let height = 0;
  let pixelRatio = 1;
  let pointerX = -9999;
  let pointerY = -9999;
  let frame = 0;
  let animationId;

  function color(alpha, tone) {
    const light = root.dataset.theme === "light";
    if (tone < 0.35) return light ? `rgba(0, 127, 117, ${alpha})` : `rgba(82, 240, 223, ${alpha})`;
    if (tone < 0.7) return light ? `rgba(198, 77, 56, ${alpha})` : `rgba(255, 95, 74, ${alpha})`;
    return light ? `rgba(168, 114, 0, ${alpha})` : `rgba(255, 209, 90, ${alpha})`;
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    width = rect.width;
    height = rect.height;
    canvas.width = Math.floor(width * pixelRatio);
    canvas.height = Math.floor(height * pixelRatio);
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    particles.length = 0;
    beams.length = 0;

    const count = Math.max(120, Math.floor((width * height) / 10500));
    for (let index = 0; index < count; index += 1) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.42,
        vy: (Math.random() - 0.5) * 0.42,
        size: Math.random() * 2.2 + 0.8,
        tone: Math.random()
      });
    }

    const beamCount = Math.max(8, Math.floor(width / 150));
    for (let index = 0; index < beamCount; index += 1) {
      beams.push({
        x: Math.random() * width,
        y: Math.random() * height,
        length: 130 + Math.random() * 210,
        speed: 0.9 + Math.random() * 1.7,
        angle: -0.35 + Math.random() * 0.9,
        tone: Math.random()
      });
    }
  }

  window.addEventListener(
    "pointermove",
    (event) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
    },
    { passive: true }
  );

  function animate() {
    frame += 1;
    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = 1;

    beams.forEach((beam) => {
      beam.x += beam.speed;
      beam.y += Math.sin(frame / 50 + beam.x * 0.01) * 0.12;
      if (beam.x - beam.length > width + 60) {
        beam.x = -beam.length;
        beam.y = Math.random() * height;
      }
      const dx = Math.cos(beam.angle) * beam.length;
      const dy = Math.sin(beam.angle) * beam.length;
      ctx.strokeStyle = color(0.28, beam.tone);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(beam.x, beam.y);
      ctx.lineTo(beam.x - dx, beam.y - dy);
      ctx.stroke();
    });

    particles.forEach((particle, index) => {
      const pointerDistance = Math.hypot(particle.x - pointerX, particle.y - pointerY);
      if (pointerDistance < 150) {
        const force = (150 - pointerDistance) / 150;
        particle.vx += ((particle.x - pointerX) / Math.max(pointerDistance, 1)) * force * 0.04;
        particle.vy += ((particle.y - pointerY) / Math.max(pointerDistance, 1)) * force * 0.04;
      }

      particle.vx *= 0.992;
      particle.vy *= 0.992;
      particle.x += particle.vx;
      particle.y += particle.vy;

      if (particle.x < -20) particle.x = width + 20;
      if (particle.x > width + 20) particle.x = -20;
      if (particle.y < -20) particle.y = height + 20;
      if (particle.y > height + 20) particle.y = -20;

      ctx.fillStyle = color(0.68, particle.tone);
      ctx.fillRect(particle.x, particle.y, particle.size, particle.size);

      for (let next = index + 1; next < particles.length; next += 1) {
        const other = particles[next];
        const distance = Math.hypot(particle.x - other.x, particle.y - other.y);
        const limit = width < 760 ? 78 : 118;
        if (distance < limit) {
          ctx.strokeStyle = color((1 - distance / limit) * 0.14, (particle.tone + other.tone) / 2);
          ctx.beginPath();
          ctx.moveTo(particle.x, particle.y);
          ctx.lineTo(other.x, other.y);
          ctx.stroke();
        }
      }
    });

    animationId = requestAnimationFrame(animate);
  }

  resize();
  animate();
  window.addEventListener("resize", () => {
    cancelAnimationFrame(animationId);
    resize();
    animate();
  });
}

window.addEventListener("load", () => {
  refreshIcons();
  setupPointerInteractions();
  loadRepos();
  startFieldCanvas();
});
