# Mustofa A. Ahmed Portfolio

Static GitHub Pages portfolio for `hafizabc77`.

## Local preview

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

## Deploy to GitHub Pages

1. Create an empty public repository named `hafizabc77.github.io` on GitHub.
2. Push the files from this folder to that repository.
3. In GitHub, open **Settings -> Pages**.
4. Set **Source** to **Deploy from a branch**.
5. Select the `main` branch and `/root`, then save.

Recommended push commands for this machine:

```bash
cd /home/hafiz/agents/hafiz-portfolio
git remote set-url origin git@github.com:hafizabc77/hafizabc77.github.io.git
git push -u origin main
```

Your site will publish at:

```text
https://hafizabc77.github.io
```

## Files

- `index.html` - page structure and CV-backed content.
- `styles.css` - responsive visual design.
- `script.js` - theme toggle, navigation state, publication filters, canvas animation, and GitHub repository loading.
- `assets/Mustofa-Ahmed-CV.pdf` - downloadable CV.
