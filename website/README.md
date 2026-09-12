# ChronoNote website

Plain static HTML/CSS — no build step for the site itself, no framework.
Three pages:

- `index.html` — landing page, with the live demo embedded partway down
- `guide.html` — full token vocabulary, keyboard shortcuts, workflow walkthrough
- `demo.html` — the same live demo, full-screen, no marketing chrome around it

`style.css` hand-ports the desktop app's design tokens (`src/app.css`'s
charcoal surface palette, the monospace font stack, the "color" glyph
palette used as the site's accent) — it does not import the app's
stylesheet directly, so keep the two in sync by eye if the app's palette
ever changes.

## The live demo — self-contained, checked in

`demo-app/` is a **built, static bundle** of the real ChronoNote
frontend running against a fake, hand-authored dataset (`scenarios.ts`'s
`"demo"` scenario) via the same in-memory mock Tauri backend the test
suite uses. It's entirely client-side — no dev server, no backend, no
Tauri host required. It's built by a dedicated Vite config
(`vite.demo.config.ts`, entry `demo-src/index.html` → `src/main-demo.ts`)
that's completely separate from the real app's own build, so it can
never end up in the real desktop app's `dist/` (see `build-guard` in
`.github/workflows/test.yml`, which only ever inspects that folder).

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

## Previewing the site locally

Any static file server works — there's no backend dependency anymore:

```bash
npx serve website
# or: python -m http.server 5000 --directory website
# or: open website/index.html directly in a browser
```

## Publishing (Plesk, `chrononote.mariendegelder.nl`)

Deploy method: **Plesk's own Git extension, pulling the public GitHub
repo directly** — no credentials anywhere (the repo is public, so a plain
HTTPS clone needs no auth), nothing to leak. See the root-level deploy
notes for the exact Plesk-side steps (subdomain creation, Git setup,
document root) — those have to be done by Marien directly in Plesk;
nothing about them can be scripted from here.

A GitHub webhook now triggers Plesk to pull on every push — but **Plesk
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
- **A new app release**: rebuild the demo bundle
  (`npm run build:demo` — it reads the just-bumped version from
  `package.json` automatically) and commit that to `main` as part of the
  release, then promote to `website-live` the same way. See the root
  `CLAUDE.local.md`'s release workflow for exactly where this step sits.

## Not done yet

- A favicon / social-preview (`og:image`) — using the app's own
  "dated page" icon would be the natural choice.
- Screenshots/GIFs of the native desktop app, for anyone who skips the
  live demo.
