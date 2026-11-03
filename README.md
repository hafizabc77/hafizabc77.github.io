# Hafiz — AI engineering portfolio

Static bilingual portfolio for https://hafizabc77.github.io/.

Run `python -m http.server 4174 --bind 127.0.0.1` from this directory and open http://localhost:4174/.

GitHub Pages: main branch, repository root. No build dependencies. Keep `.nojekyll`.

`index.html` contains paired data-en/data-zh copy. `styles.css` defines responsive design. `script.js` handles language persistence, navigation, animation, image viewer and copy-email. Reduced motion is supported; core content remains visible without JS.

`assets/showcase/` contains selected supplied media, compressed to WebP; video is loaded only on interaction. Other existing assets are preserved. External Google Fonts have local fallbacks.

See REVIEW.md for validation and optional follow-ups.
