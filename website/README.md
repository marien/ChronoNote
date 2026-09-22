# ChronoNote website

Plain static HTML/CSS — no build step for the site itself, no framework.
Three pages:

- `index.html` — landing page, with the live demo embedded partway down
  and a CTA linking to the web app
- `guide.html` — full token vocabulary, keyboard shortcuts, workflow walkthrough
- `demo.html` — the same live demo, full-screen, no marketing chrome around it

`style.css` hand-ports the desktop app's design tokens (`src/app.css`'s
charcoal surface palette, the monospace font stack, the "color" glyph
palette used as the site's accent) — it does not import the app's
stylesheet directly, so keep the two in sync by eye if the app's palette
ever changes.

This folder also holds two **built** bundles of the real ChronoNote
frontend, each its own Vite target sharing the same `src/` tree as the
desktop app — see "The live demo" and "The web app" below.

## The live demo — self-contained, checked in

`demo-app/` is a **built, static bundle** of the real ChronoNote
frontend running against a fake, hand-authored dataset (`scenarios.ts`'s
`"demo"` scenario) via the same in-memory mock Tauri backend the test
suite uses. It's entirely client-side — no dev server, no backend, no
Tauri host required, and it never retains anything (a reload resets it).
It's built by a dedicated Vite config (`vite.demo.config.ts`, entry
`demo-src/index.html` → `src/main-demo.ts`) that's completely separate
from the real app's own build, so it can never end up in the real
desktop app's `dist/` (see `build-guard` in
`.github/workflows/test.yml`, which only ever inspects that folder).
Static assets (favicon, `apple-touch-icon.png`) live in `demo-src/public/`
and are carried straight through to `website/demo-app/` by Vite's
public-dir passthrough — same mechanism `webapp-src/public/` uses below.

**`demo-app/` is committed to git.** Historically it got rebuilt and
committed to `main` alongside whatever frontend change prompted it. As
of the `website-live` deploy branch (see "Publishing" below), **that no
longer ships automatically** — a rebuild on `main` sits there until it's
deliberately promoted to `website-live`, normally as part of cutting a
new app release:

```bash
# from the project root
npm run build:demo
git add website/demo-app
git commit -m "rebuild demo bundle"
```

The demo scenario's dates are relative to *today* (via `date.ts`'s
`todayISO()`), not a fixed date, so it always looks current — no
"the demo's most recent note is three years old" problem later.

**Reference the demo with a trailing slash** (`demo-app/`, not
`demo-app/index.html`) wherever it's linked or iframed — some static
file servers (`npx serve`'s default "clean URLs" redirect is one) rewrite
the explicit-filename form in a way that drops the trailing slash too,
which then breaks the bundle's relative asset paths. `index.html` and
`demo.html` already do this correctly; keep it that way if you touch
either.

## The web app — the real thing, persisted in the browser

`webapp/` is a second **built, static bundle** of the same frontend, one
step up from the demo: instead of the zero-retention mock backend, it
runs against `WebBackend` — a real `IndexedDB`-backed implementation of
the same `TauriCommands` surface — so notes actually persist across
reloads, entirely in the visitor's own browser (nothing is sent
anywhere). Built by its own Vite config (`vite.webapp.config.ts`, entry
`webapp-src/index.html` → `src/main-webapp.ts`), and — like the demo —
reads the app's real version out of `package.json` at build time
(injected as `__WEBAPP_VERSION__`) rather than hardcoding one. It's also
installable as a PWA — `manifest.webmanifest` and `sw.js`, hand-written
in `webapp-src/public/` and carried through to the built output by
Vite's normal public-dir passthrough — for anyone who wants it to launch
in its own window.

**`webapp/` is committed to git**, same discipline as `demo-app/` — a
rebuild sits on `main` until deliberately promoted to `website-live`:

```bash
# from the project root
npm run build:webapp
git add website/webapp
git commit -m "rebuild web app bundle"
```

Deployed at `app.chrononote.mariendegelder.nl` — a **separate Plesk
subdomain whose document root just points at this same checkout's
`website/webapp/` folder**. No second Git repository, no second webhook:
a Plesk (sub)domain's document root is independent of where any Git
checkout lives, so pointing a new subdomain at an existing folder is a
one-time Plesk-side setting, not a deploy pipeline of its own. Once
`website-live` moves, both `demo-app/` and `webapp/` are live at their
respective subdomains together.

## Previewing the site locally

Any static file server works — there's no backend dependency anymore:

```bash
npx serve website
# or: python -m http.server 5000 --directory website
# or: open website/index.html directly in a browser
```

## Publishing (Plesk)

Deploy method: **Plesk's own Git extension, pulling the public GitHub
repo directly** — no credentials anywhere (the repo is public, so a plain
HTTPS clone needs no auth), nothing to leak. Two subdomains share the
one checkout: `chrononote.mariendegelder.nl` (document root = `website/`,
the marketing site + demo) and `app.chrononote.mariendegelder.nl`
(document root = `website/webapp/`, the installable web app). Subdomain
creation, DNS, and both document-root settings have to be done directly
in Plesk — nothing about them can be scripted from here.

A GitHub webhook triggers Plesk to pull on every push — but **Plesk
tracks a dedicated `website-live` branch, not `main`**. Regular app
development happens on `main` as always and never touches the live site,
even though the webhook itself fires on every push to any branch (Plesk
just re-pulls `website-live`, which hasn't moved — a harmless no-op).
The live site only changes when `website-live` itself is moved forward,
which is always a deliberate, separate step:

- **A small, direct website tweak** (copy, a wording fix): commit to
  `main` as usual, then publish it:
  ```bash
  git checkout website-live
  git merge --ff-only main
  git push origin website-live
  git checkout main
  ```
- **A larger website project** (redesign, new pages): do the work on its
  own branch (e.g. `website/new-guide-layout`), push it to GitHub freely
  at any point for backup/review — `website-live` isn't watching that
  branch, so nothing goes live until it's deliberately merged into `main`
  and then promoted to `website-live` with the same three commands above.
- **A new app release**: rebuild both bundles (`npm run build:demo` and
  `npm run build:webapp` — each reads the just-bumped version from
  `package.json` automatically) and commit that to `main` as part of the
  release, then promote to `website-live` the same way. See the root
  `CLAUDE.local.md`'s release workflow for exactly where this step sits.
  **If the release touches `docs/design/icon-A-master.svg`** (a real icon
  redesign, not every release): regenerate `website/assets/favicon.ico` /
  `favicon-32.png` / `apple-touch-icon.png` from the freshly-regenerated
  `src-tauri/icons/{icon.ico,32x32.png,128x128@2x.png}` (same source,
  already the right sizes — no separate conversion needed) **and** bump
  the `?v=` query param on all three `<link>` tags in `index.html`/
  `demo.html`/`guide.html` to the new version. Browsers cache favicons
  extremely aggressively and mostly ignore normal cache-control headers,
  so without a new URL (the query param) a returning visitor can keep
  seeing the old icon indefinitely — this was missed for the v0.12.5 icon
  redesign and needed a follow-up fix. The web app's own icon has the
  equivalent problem solved automatically instead: its service worker's
  cache name is tied to the app version at build time
  (`vite.webapp.config.ts`'s `injectSwVersion` plugin) so every release
  gets a fresh cache generation without anyone needing to remember a step.

## Follow-ups

Done (§146, `docs/CHANGELOG.md`):
- **Guide page shows plain text *and* rendered output side by side.**
  The "Putting it together" section's two `.snippet` examples
  (`guide.html`) now each sit next to a `.snippet-rendered` panel using
  the same `.glyph`/`.badge-assignee` classes the token-vocabulary table
  above it already uses, so the token → glyph mapping is visible on the
  page itself without needing the live demo. Stacks to one column under
  640px (`.snippet-pair` in `style.css`).
- **A backward action-state cycle shipped** — `Ctrl+Shift+Space` /
  `Ctrl/Cmd+Shift+Enter` walks the existing `# → v → > → x → #` chain in
  reverse, in both the editor and the Action Drawer. This was an editor
  change, not a website one (`src/lib/shortcuts.ts`, `tokens.ts`'s
  `cycleActionSymbol`) — mentioned here because the Guide page's
  shortcut cheat-sheet has been updated with the new binding to match.
- **Favicon and social-preview tags added** to the marketing site and
  the demo, reusing the app's own existing baked "dated page" icon
  assets (`src-tauri/icons/`) rather than commissioning new ones — see
  `<head>` in `index.html`/`guide.html`/`demo.html`/`demo-src/index.html`.
  (The web app already had its own favicon via `webapp-src/public/` —
  an earlier note here claiming otherwise was wrong.)

Not done — real tooling blocker, not a priority call:
- **Screenshots/GIFs of the native desktop app.** Attempted this session:
  the Browser pane can render and display a screenshot inline, but
  nothing available could *save* one to a file for committing as a site
  asset. Needs either a different capture tool or Marien supplying image
  files directly.
