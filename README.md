# Mustofa A. Ahmed (Hafiz): AI engineering portfolio

Static bilingual portfolio for https://hafizabc77.github.io/. No build step and no runtime dependency on another service.

Run `python -m http.server 4174 --bind 127.0.0.1` from this directory and open http://localhost:4174/.

GitHub Pages: main branch, repository root. Keep `.nojekyll`.

## Files

- `index.html`: the hiring page, with paired `data-en` / `data-zh` copy. Case studies live in `<template>` blocks and open as full-screen stories at `#case/<name>`.
- `creative.html`: MetaHuman, the Unreal game, music videos, AI songs and personal interests.
- `scene.js`: hand-written WebGL stage. A quiet fluid trail that runs only while the pointer moves, particles that morph between shapes as the page scrolls, and image planes that stay still.
- `labs.js`: the interactive project demos: the AutoDeploy scroll story and race lab, the LHAASO-WCDA event display, the FPGA pipeline, the Curiosity assistant replay and the Curiosity case study visuals.
- `script.js`: motion engine with one animation loop: smooth scroll, scroll-linked effects, cursor, sideways project section, role selector, speculative decoding playground, knowledge graph, Bayesian optimization, scroll-driven film, audio players, command palette and page transitions. It starts the demos in `labs.js`.
- `styles.css`: deep green and gold design. Effects that hide content apply only under `.fx`.
- `assets/vendor/lenis.min.js`: smooth scrolling (Lenis 1.1.20, MIT).
- `assets/fonts/`: self-hosted Cormorant Garamond, DM Sans and DM Mono (SIL OFL). Chinese text uses each device's system font.
- `assets/metahuman/`, `assets/metahuman-m/`: film frames taken from the showreel, for desktop and phone. Loaded only when the section is near and decoded before they are drawn.
- `assets/data/waves.js`: waveform peaks computed from the MP3 files.
- `assets/Mustofa-Ahmed-Resume-EN.pdf` and `-ZH.pdf`: the current resume, split by language, with a searchable text layer and clickable links.

## Behaviour by device

- Wide screen with a mouse: everything, including the fluid trail, image planes, custom cursor, smooth scrolling, the pinned AutoDeploy story, the pinned sideways project section and music-reactive particles.
- Phone or tablet: native scrolling, a light background, fewer particles, plain images, the AutoDeploy story with fewer dots, vertical project cards and a bottom action bar.
- Performance: the fluid sleeps a few seconds after the pointer stops, the WebGL stage is skipped while an opaque section fills the screen, and every canvas demo draws only while it is on screen. A slow device turns the fluid off first, then reduces particles. Data Saver turns the stage off. `?hq=1` keeps full quality for testing and `?fluid=0` turns the fluid off.
- `prefers-reduced-motion`, no JavaScript or a script failure: a plain, fully readable page.

Language order: `?lang=en` or `?lang=zh`, then the visitor's earlier choice, then the device language.

See REVIEW.md for sources and validation.
