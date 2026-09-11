# ChronoNote website (local, not yet published)

Plain static HTML/CSS — no build step, no framework. Three pages:

- `index.html` — landing page, with the live demo embedded partway down
- `guide.html` — full token vocabulary, keyboard shortcuts, workflow walkthrough
- `demo.html` — the same live demo, full-screen, no marketing chrome around it

`style.css` hand-ports the desktop app's design tokens (`src/app.css`'s
charcoal surface palette, the monospace font stack, the "color" glyph
palette used as the site's accent) — it does not import the app's
stylesheet directly, so keep the two in sync by eye if the app's palette
ever changes.

## The live demo

The embedded demo isn't a recreation — it's the real ChronoNote frontend,
running against a fake, hand-authored dataset (`scenarios.ts`'s `"demo"`
scenario) via the same in-memory mock Tauri backend the test suite uses.
Nothing typed into it is saved anywhere; it resets on reload.

That means it needs the app's own dev server running:

```bash
# from the ChronoNote project root, in one terminal
npm run dev
```

That serves the app at `http://localhost:1420`, which is what
`index.html` and `demo.html` iframe. Leave it running while you preview
the site.

The demo scenario's dates are relative to *today* (via `date.ts`'s
`todayISO()`), not a fixed date, so it always looks current — no
"the demo's most recent note is three years old" problem later.

## Previewing the site itself

Any of these work — it's just static files:

```bash
# option 1: open it directly
# (double-click website/index.html, or open it in a browser)

# option 2: a tiny local server (nicer for relative links/reload)
npx serve website

# option 3: Python, if you have it
python -m http.server 5000 --directory website
```

## Not done yet — for the publish pass

- A production build of the demo: right now it depends on `npm run dev`,
  which only works locally. Publishing needs a dedicated build target
  that intentionally bundles `src/lib/testing/` for a demo bundle,
  without weakening the existing guarantee that the real desktop app's
  `dist/` never contains it (see `build-guard` in
  `.github/workflows/test.yml`).
- Hosting choice, domain, analytics (if wanted), and a real
  `og:image`/favicon.
- Screenshots/GIFs of the native app for anyone who can't or doesn't
  want to run the demo.
