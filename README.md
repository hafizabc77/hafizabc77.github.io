# Mustofa A. Ahmed (Hafiz): AI engineering portfolio

Static bilingual portfolio for https://hafizabc77.github.io/. No build step and no runtime dependency on another service.

Run `python -m http.server 4174 --bind 127.0.0.1` from this directory and open http://localhost:4174/.

GitHub Pages: main branch, repository root. Keep `.nojekyll`.

## Files

- `index.html`: the hiring page, with paired `data-en` / `data-zh` copy.
- `creative.html`: Unreal Engine, AI music and personal interests.
- `scene.js`: hand-written WebGL particle scene. Particles morph between named shapes as the page scrolls and react to the pointer and clicks.
- `script.js`: motion engine with one animation loop: smooth scroll, scroll-linked effects, cursor, sideways project section, role selector, speculative decoding playground, knowledge graph, command palette, page transitions and language selection.
- `styles.css`: deep green and gold design. Effects that hide content apply only under `.fx`.
- `assets/vendor/lenis.min.js`: smooth scrolling (Lenis 1.1.20, MIT).
- `assets/fonts/`: self-hosted Cormorant Garamond, DM Sans and DM Mono (SIL OFL). Chinese text uses each device's system font.
- `assets/Mustofa-Ahmed-Resume-EN.pdf` and `-ZH.pdf`: the current resume, split by language, with a searchable text layer and clickable links.

## Behaviour by device

- Wide screen with a mouse: everything, including the custom cursor, smooth scrolling and the pinned sideways project section.
- Phone or tablet: native scrolling, fewer particles, vertical project cards and a bottom action bar.
- A slow device steps particle count down by itself. Data Saver turns the particles off.
- `prefers-reduced-motion`, no JavaScript or a script failure: a plain, fully readable page.

Language order: `?lang=en` or `?lang=zh`, then the visitor's earlier choice, then the device language.

See REVIEW.md for sources and validation.
