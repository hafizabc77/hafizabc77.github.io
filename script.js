const root = document.documentElement;
const header = document.querySelector(".site-header");
const navToggle = document.querySelector(".nav-toggle");
const navLinks = document.querySelector(".nav-links");
const themeToggle = document.querySelector(".theme-toggle");
const repoGrid = document.querySelector("#repo-grid");
const filterButtons = document.querySelectorAll("[data-filter]");
const publications = document.querySelectorAll(".publication");

const storedTheme = localStorage.getItem("theme");
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
root.dataset.theme = storedTheme || (prefersDark ? "dark" : "light");

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

themeToggle?.addEventListener("click", () => {
  setTheme(root.dataset.theme === "dark" ? "light" : "dark");
});

setTheme(root.dataset.theme);

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

const observedSections = [...document.querySelectorAll("main section[id]")];
const navAnchors = [...document.querySelectorAll(".nav-links a")];

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
    rootMargin: "-30% 0px -55% 0px",
    threshold: [0.12, 0.25, 0.5, 0.75]
  }
);

observedSections.forEach((section) => sectionObserver.observe(section));

window.addEventListener("scroll", () => {
  header.dataset.elevated = String(window.scrollY > 20);
});

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const filter = button.dataset.filter;

    filterButtons.forEach((item) => item.classList.toggle("active", item === button));
    publications.forEach((publication) => {
      publication.hidden = filter !== "all" && publication.dataset.kind !== filter;
    });
  });
});

const languageColors = {
  Python: "#3572a5",
  JavaScript: "#c8a024",
  "C++": "#c6553f",
  C: "#555f6b",
  HTML: "#e06b41",
  CSS: "#366bd9",
  Shell: "#2f8f57",
  Jupyter: "#c88921",
  TeX: "#19766f"
};

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
      <p>GitHub repository metadata could not be loaded from the public API in this browser session.</p>
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
        const color = languageColors[language] || "#19766f";
        const description = repo.description || "Public repository from hafizabc77.";

        return `
          <a class="repo-card" href="${repo.html_url}" target="_blank" rel="noreferrer">
            <strong><i data-lucide="book-marked"></i>${repo.name}</strong>
            <p>${description}</p>
            <div class="repo-meta">
              <span><span class="language-dot" style="background:${color}"></span>${language}</span>
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

function startSignalCanvas() {
  const canvas = document.querySelector("#signal-canvas");
  if (!canvas || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const ctx = canvas.getContext("2d");
  const nodes = [];
  let width = 0;
  let height = 0;
  let pixelRatio = 1;
  let animationId;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    width = rect.width;
    height = rect.height;
    canvas.width = Math.floor(width * pixelRatio);
    canvas.height = Math.floor(height * pixelRatio);
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    nodes.length = 0;

    const count = Math.max(42, Math.floor((width * height) / 26000));
    for (let index = 0; index < count; index += 1) {
      nodes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.28,
        vy: (Math.random() - 0.5) * 0.28,
        r: Math.random() * 1.8 + 0.7,
        tone: Math.random()
      });
    }
  }

  function strokeStyle(alpha, tone) {
    const dark = root.dataset.theme === "dark";
    if (tone < 0.34) return dark ? `rgba(69, 182, 168, ${alpha})` : `rgba(25, 118, 111, ${alpha})`;
    if (tone < 0.68) return dark ? `rgba(238, 125, 97, ${alpha})` : `rgba(198, 85, 63, ${alpha})`;
    return dark ? `rgba(226, 173, 67, ${alpha})` : `rgba(200, 137, 33, ${alpha})`;
  }

  function animate() {
    ctx.clearRect(0, 0, width, height);

    nodes.forEach((node, index) => {
      node.x += node.vx;
      node.y += node.vy;

      if (node.x < -20) node.x = width + 20;
      if (node.x > width + 20) node.x = -20;
      if (node.y < -20) node.y = height + 20;
      if (node.y > height + 20) node.y = -20;

      ctx.beginPath();
      ctx.fillStyle = strokeStyle(0.72, node.tone);
      ctx.rect(node.x - node.r / 2, node.y - node.r / 2, node.r, node.r);
      ctx.fill();

      for (let nextIndex = index + 1; nextIndex < nodes.length; nextIndex += 1) {
        const other = nodes[nextIndex];
        const distance = Math.hypot(node.x - other.x, node.y - other.y);
        const limit = width < 700 ? 94 : 132;
        if (distance < limit) {
          const alpha = (1 - distance / limit) * 0.18;
          ctx.beginPath();
          ctx.strokeStyle = strokeStyle(alpha, (node.tone + other.tone) / 2);
          ctx.lineWidth = 1;
          ctx.moveTo(node.x, node.y);
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
  loadRepos();
  startSignalCanvas();
});
