const root = document.documentElement;
const header = document.querySelector(".site-header");
const navToggle = document.querySelector(".nav-toggle");
const navLinks = document.querySelector(".nav-links");
const themeToggle = document.querySelector(".theme-toggle");
const repoGrid = document.querySelector("#repo-grid");

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

window.addEventListener("scroll", () => {
  header.dataset.elevated = String(window.scrollY > 18);
});

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
  {
    rootMargin: "-32% 0px -54% 0px",
    threshold: [0.16, 0.35, 0.6]
  }
);

observedSections.forEach((section) => sectionObserver.observe(section));

const labData = {
  scaling: {
    kicker: "Joint model-data scaling",
    title: "Fit model size N and unique events D instead of guessing which axis matters.",
    body:
      "Extend Higgs scaling from one data axis into a Chinchilla-style physics view: model size, data size, training effort, features, objective design, generator robustness, optimizer dynamics, and compression are tracked separately.",
    equation: "U(N,D) = U_inf + A / N^alpha + B / D^beta",
    paths: [
      "M90 285 C148 270, 192 236, 236 176 S336 72, 440 64 S520 60, 574 58",
      "M90 286 C150 256, 188 208, 242 162 S372 124, 574 118",
      "M90 292 C150 282, 204 244, 272 214 S424 172, 574 168"
    ]
  },
  bottleneck: {
    kicker: "Statistical-limit gap",
    title: "Use gap_abs and gap_ratio to decide whether the work is data-, model-, feature-, or robustness-limited.",
    body:
      "The priority is not simply a larger network. If U stays above the statistical limit, diagnose whether new simulated events, better features, architecture scaling, score binning, or generator robustness will move the frontier.",
    equation: "gap_ratio = U / U_stat; prioritize highest-gap modes such as H -> ZZ*",
    paths: [
      "M90 238 C150 226, 208 218, 270 205 S430 176, 574 160",
      "M90 270 C140 242, 194 214, 246 188 S386 146, 574 132",
      "M90 292 C168 286, 230 282, 304 270 S466 252, 574 248"
    ]
  },
  robustness: {
    kicker: "Generator and systematic robustness",
    title: "Separate Pythia8 and Herwig7 behavior before declaring a scaling result solved.",
    body:
      "Two-body modes may stay stable while harder modes diverge as data and model size grow. Robustness needs its own axis, otherwise scaling can improve one generator while hiding systematic gaps.",
    equation: "gap_gen = (U_Herwig - U_Pythia) / U_Pythia",
    paths: [
      "M90 265 C170 236, 240 184, 310 124 S442 86, 574 82",
      "M90 278 C166 254, 248 206, 320 148 S470 118, 574 116",
      "M90 290 C160 284, 236 258, 308 286 S468 276, 574 232"
    ]
  },
  compression: {
    kicker: "Deployment after understanding limits",
    title: "Compression is a complementary axis: scale first, understand bottlenecks, then make the model smaller and faster.",
    body:
      "Pruning, quantization, KD, and NAS can preserve physics performance while reducing latency, memory, and cost. They should not be confused with the primary scaling question of what is fundamentally attainable.",
    equation: "scale -> prune -> fine-tune -> quantize -> fine-tune -> deploy",
    paths: [
      "M90 230 C152 158, 214 108, 300 88 S460 74, 574 74",
      "M90 246 C166 224, 238 218, 330 216 S494 214, 574 214",
      "M90 286 C150 240, 224 214, 294 208 S438 206, 574 202"
    ]
  }
};

const labTabs = document.querySelectorAll(".lab-tab");
const labKicker = document.querySelector("#lab-kicker");
const labTitle = document.querySelector("#lab-title");
const labBody = document.querySelector("#lab-body");
const labEquation = document.querySelector("#lab-equation");
const labPaths = document.querySelectorAll("#lab-svg .svg-main");

function setLabView(key) {
  const data = labData[key];
  if (!data) return;

  labTabs.forEach((tab) => {
    const active = tab.dataset.lab === key;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });

  labKicker.textContent = data.kicker;
  labTitle.textContent = data.title;
  labBody.textContent = data.body;
  labEquation.textContent = data.equation;
  labPaths.forEach((path, index) => path.setAttribute("d", data.paths[index]));
}

labTabs.forEach((tab) => {
  tab.addEventListener("click", () => setLabView(tab.dataset.lab));
});

const noteData = {
  1: {
    src: "assets/research-notes/scaling-notes-1.png",
    alt: "Research notes page 1 about Higgs model and data scaling",
    caption: "Notes 1/7 - joint model, data, and training scaling for Higgs classification."
  },
  2: {
    src: "assets/research-notes/scaling-notes-2.png",
    alt: "Research notes page 2 about unique events, epochs, and scaling thresholds",
    caption: "Notes 2/7 - unique events, epochs, compute formula, and overfitting threshold."
  },
  3: {
    src: "assets/research-notes/scaling-notes-3.png",
    alt: "Research notes page 3 about ParticleNet, ParT, ACSI, robustness, and score cuts",
    caption: "Notes 3/7 - ParticleNet vs ParT, ACSI link, generator effect, and score-cut optimization."
  },
  4: {
    src: "assets/research-notes/scaling-notes-4.png",
    alt: "Research notes page 4 about expected plots, bottlenecks, and experiment sequence",
    caption: "Notes 4/7 - expected plots, bottleneck definitions, and first experiment sequence."
  },
  5: {
    src: "assets/research-notes/scaling-notes-5.png",
    alt: "Research notes page 5 about scaling axes and gap quantification",
    caption: "Notes 5/7 - extra axes, loss-floor bottlenecks, gap quantification, and expected outcomes."
  },
  6: {
    src: "assets/research-notes/scaling-notes-6.png",
    alt: "Research notes page 6 about compression, pruning, quantization, lottery tickets, and methods",
    caption: "Notes 6/7 - compression as a complementary axis: pruning, quantization, KD, NAS."
  },
  7: {
    src: "assets/research-notes/scaling-notes-7.png",
    alt: "Research notes page 7 about knowledge distillation, NAS, and compression-scaling fit",
    caption: "Notes 7/7 - KD, NAS, compression-scaling relationship, and important extra axes."
  }
};

const noteMain = document.querySelector("#note-main");
const noteCaption = document.querySelector("#note-caption");
const noteThumbs = document.querySelectorAll(".note-thumb");

noteThumbs.forEach((button) => {
  button.addEventListener("click", () => {
    const note = noteData[button.dataset.note];
    if (!note) return;

    noteMain.src = note.src;
    noteMain.alt = note.alt;
    noteCaption.textContent = note.caption;
    noteThumbs.forEach((thumb) => thumb.classList.toggle("active", thumb === button));
  });
});

const languageColors = {
  Python: "#3572a5",
  JavaScript: "#c8a024",
  "C++": "#ff6d57",
  C: "#9aa8b6",
  HTML: "#e06b41",
  CSS: "#6da2ff",
  Shell: "#68d983",
  Jupyter: "#f3bd45",
  TeX: "#48d6c8"
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

    if (!response.ok) {
      throw new Error(`GitHub API returned ${response.status}`);
    }

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
        const color = languageColors[language] || "#48d6c8";
        const description = repo.description || "Public repository from hafizabc77.";

        return `
          <a class="repo-card" href="${escapeHtml(repo.html_url)}" target="_blank" rel="noreferrer">
            <strong><i data-lucide="book-marked"></i>${escapeHtml(repo.name)}</strong>
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
  } catch (error) {
    renderFallbackRepos();
  }
}

function startHeroCanvas() {
  const canvas = document.querySelector("#hero-canvas");
  if (!canvas || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const ctx = canvas.getContext("2d");
  const hits = [];
  const tracks = [];
  let width = 0;
  let height = 0;
  let pixelRatio = 1;
  let frame = 0;
  let animationId;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    width = rect.width;
    height = rect.height;
    canvas.width = Math.floor(width * pixelRatio);
    canvas.height = Math.floor(height * pixelRatio);
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    hits.length = 0;
    tracks.length = 0;

    const hitCount = Math.max(70, Math.floor((width * height) / 16000));
    for (let index = 0; index < hitCount; index += 1) {
      hits.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.38,
        vy: (Math.random() - 0.5) * 0.38,
        size: Math.random() * 2 + 1,
        tone: Math.random()
      });
    }

    const trackCount = Math.max(7, Math.floor(width / 180));
    for (let index = 0; index < trackCount; index += 1) {
      tracks.push({
        x: Math.random() * width,
        y: Math.random() * height,
        speed: 0.7 + Math.random() * 0.9,
        length: 70 + Math.random() * 120,
        tone: Math.random()
      });
    }
  }

  function color(alpha, tone) {
    const dark = root.dataset.theme !== "light";
    if (tone < 0.35) return dark ? `rgba(72, 214, 200, ${alpha})` : `rgba(8, 121, 111, ${alpha})`;
    if (tone < 0.7) return dark ? `rgba(255, 109, 87, ${alpha})` : `rgba(201, 78, 58, ${alpha})`;
    return dark ? `rgba(243, 189, 69, ${alpha})` : `rgba(166, 111, 18, ${alpha})`;
  }

  function animate() {
    frame += 1;
    ctx.clearRect(0, 0, width, height);

    ctx.lineWidth = 1;
    hits.forEach((hit, index) => {
      hit.x += hit.vx;
      hit.y += hit.vy;

      if (hit.x < -10) hit.x = width + 10;
      if (hit.x > width + 10) hit.x = -10;
      if (hit.y < -10) hit.y = height + 10;
      if (hit.y > height + 10) hit.y = -10;

      ctx.fillStyle = color(0.62, hit.tone);
      ctx.fillRect(hit.x, hit.y, hit.size, hit.size);

      for (let next = index + 1; next < hits.length; next += 1) {
        const other = hits[next];
        const distance = Math.hypot(hit.x - other.x, hit.y - other.y);
        const limit = width < 760 ? 84 : 118;
        if (distance < limit) {
          ctx.strokeStyle = color((1 - distance / limit) * 0.13, (hit.tone + other.tone) / 2);
          ctx.beginPath();
          ctx.moveTo(hit.x, hit.y);
          ctx.lineTo(other.x, other.y);
          ctx.stroke();
        }
      }
    });

    tracks.forEach((track) => {
      track.x += track.speed;
      track.y += Math.sin((frame + track.x) / 70) * 0.08;
      if (track.x - track.length > width) {
        track.x = -track.length;
        track.y = Math.random() * height;
      }
      ctx.strokeStyle = color(0.32, track.tone);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(track.x, track.y);
      ctx.lineTo(track.x - track.length, track.y + Math.sin(frame / 30) * 28);
      ctx.stroke();
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
  loadRepos();
  startHeroCanvas();
});
