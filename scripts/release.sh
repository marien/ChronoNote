#!/usr/bin/env bash
# Cut a ChronoNote release end to end: gates -> version bump -> tag -> signed
# build -> latest.json -> demo/webapp bundles -> push -> GitHub release ->
# website-live promotion. Output is deliberately terse: full logs go to a
# scratch directory and are only printed (tail) when a step fails.
#
# Usage:
#   scripts/release.sh <X.Y.Z> <notes-file> [--skip-gates] [--dry-run]
#                      [--checklist-done] [--force-red] [--beta]
#
#   <notes-file>   Markdown release notes (the GitHub release body).
#   --skip-gates   Skip check/vitest/cargo test/playwright (only if they were
#                  just run on this exact commit).
#   --dry-run      Run preflight + gates + print the plan; change nothing.
#   --checklist-done  Required for a minor release (X.Y.0): confirms the
#                  environment checklist below was run (it is printed when the
#                  flag is missing, and the script stops).
#   --force-red    Release although GitHub's last Test run on main failed.
#                  Say why in the release notes.
#   --beta         An early-updates build (F1): version X.Y.Z-N (N numeric;
#                  the MSI bundler needs that), published as a GitHub
#                  pre-release, announced only on the early channel
#                  (latest-beta.json on the rolling `early` pre-release). No
#                  web app/demo rebuild, no website-live promotion.
#
# Every release (stable or beta) also updates the early channel's manifest
# when it is newer than what that manifest serves, so early users always get
# the newest build of either kind.
#
# Env: RELEASE_CO_AUTHOR="Name <email>" adds a Co-Authored-By trailer to the
#      bump and bundles commits (omitted when unset).
#
# Resumable: every step first checks whether its result already exists
# (bump commit, tag, installers, release, ...) so re-running after a failure
# picks up where it stopped.
set -euo pipefail

VERSION="${1:-}"; NOTES="${2:-}"
SKIP_GATES=0; DRY=0; CHECKLIST=0; FORCE_RED=0; BETA=0
for a in "${@:3}"; do
  case "$a" in
    --skip-gates) SKIP_GATES=1 ;;
    --dry-run) DRY=1 ;;
    --checklist-done) CHECKLIST=1 ;;
    --force-red) FORCE_RED=1 ;;
    --beta) BETA=1 ;;
    *) echo "unknown option: $a" >&2; exit 2 ;;
  esac
done
if [[ $BETA == 1 ]]; then
  [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+-[0-9]+$ ]] || { echo "a --beta version is X.Y.Z-N (numeric N)" >&2; exit 2; }
else
  [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "usage: $0 <X.Y.Z> <notes-file> [--skip-gates] [--dry-run]" >&2; exit 2; }
fi
[[ -f "$NOTES" ]] || { echo "notes file not found: $NOTES" >&2; exit 2; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
export PATH="/c/Program Files/nodejs:/c/Users/marie/.cargo/bin:$PATH"
TAG="v$VERSION"
WORK="$(mktemp -d)"; LOGS="$WORK/logs"; mkdir -p "$LOGS"
# Optional commit trailer, e.g. RELEASE_CO_AUTHOR="Some Model 6 <noreply@anthropic.com>".
# Deliberately not hardcoded: model names change; the caller passes the current one.
TRAILER=""
[[ -n "${RELEASE_CO_AUTHOR:-}" ]] && TRAILER=$'\n\nCo-Authored-By: '"$RELEASE_CO_AUTHOR"
NOTES_ABS="$(cd "$(dirname "$NOTES")" && pwd)/$(basename "$NOTES")"

step() { printf '\n== %s\n' "$*"; }
ok()   { printf '   ok: %s\n' "$*"; }
# run <name> <cmd...>: quiet, log to file, tail the log on failure
run() {
  local name="$1"; shift
  if "$@" >"$LOGS/$name.log" 2>&1; then ok "$name"
  else echo "   FAILED: $name  (log: $LOGS/$name.log)"; tail -40 "$LOGS/$name.log"; exit 1; fi
}

# ---------------------------------------------------------------- preflight
step "preflight"
[[ "$(git rev-parse --abbrev-ref HEAD)" == "main" ]] || { echo "not on main" >&2; exit 1; }
git fetch -q origin
[[ -z "$(git status --porcelain)" ]] || { echo "working tree not clean" >&2; git status --short; exit 1; }
[[ "$(git rev-list --count HEAD..origin/main)" == "0" ]] || { echo "main is behind origin/main" >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "gh not authenticated" >&2; exit 1; }
[[ -f src-tauri/updater-signing-key.local && -f src-tauri/updater-signing-key-password.local ]] \
  || { echo "updater signing key files missing" >&2; exit 1; }
CUR="$(node -p "require('./package.json').version")"
BUMPED=0; [[ "$CUR" == "$VERSION" ]] && BUMPED=1
if [[ $BUMPED == 0 ]]; then
  [[ "$(printf '%s\n%s\n' "$CUR" "$VERSION" | sort -V | tail -1)" == "$VERSION" ]] \
    || { echo "$VERSION is not newer than current $CUR" >&2; exit 1; }
fi
gh release view "$TAG" >/dev/null 2>&1 && { echo "GitHub release $TAG already exists" >&2; exit 1; }
ok "on main, clean, up to date; $CUR -> $VERSION"

# CI must be green on what is being released (it was red from v0.30.0 to
# v0.30.2 without anyone noticing). Skipped when this run is a resume after
# the bump commit, which has no CI run of its own yet.
if [[ $BUMPED == 0 ]]; then
  CI="$(gh run list --workflow Test --branch main --limit 1 --json headSha,status,conclusion     -q '.[0] | "\(.headSha) \(.status) \(.conclusion)"')"
  read -r CI_SHA CI_STATUS CI_CONCLUSION <<<"$CI"
  if [[ "$CI_SHA" != "$(git rev-parse HEAD)" ]]; then
    echo "   NOTE: the last Test run is for ${CI_SHA:0:7}, not HEAD; its result: $CI_STATUS $CI_CONCLUSION"
  fi
  if [[ "$CI_STATUS" != "completed" ]]; then
    echo "GitHub Test run still $CI_STATUS; wait for it" >&2; exit 1
  elif [[ "$CI_CONCLUSION" != "success" && $FORCE_RED == 0 ]]; then
    echo "GitHub's last Test run on main: $CI_CONCLUSION. Fix it, or pass --force-red with a reason in the notes." >&2; exit 1
  fi
  ok "GitHub Test: $CI_CONCLUSION"
fi

# A minor release carries bigger UI changes: run the environment checklist
# (the v0.30 lessons) before cutting it.
if [[ "$VERSION" =~ \.0$ && $CHECKLIST == 0 && $BUMPED == 0 && $BETA == 0 ]]; then
  cat >&2 <<'LIST'
Minor release: check these first, then re-run with --checklist-done.
  - Windows "Animation effects" off (prefers-reduced-motion): switch tabs, open drawers
  - Display scaling 125% and 150%
  - A phone: keyboard, sheets, long-press, symbols bar on one row
  - The web app installed on a PC (title bar hidden) and on a phone
  - A Windows contrast theme
  - German UI on CI's Linux fonts (GitHub Test run green)
  - Right-click, long-press and focus on every part of the window
LIST
  exit 1
fi

# --------------------------------------------------------------------- gates
if [[ $SKIP_GATES == 0 ]]; then
  step "gates (sequential; never run Playwright twice concurrently)"
  run check     npm run check
  run vitest    npm test -- --maxWorkers=2 --testTimeout=30000 --hookTimeout=30000
  run cargotest bash -c 'cd src-tauri && cargo test'
  run playwright npx playwright test --workers=2
  for f in check vitest cargotest playwright; do
    printf '   %-10s %s\n' "$f" "$(grep -Eio '[0-9]+ passed|test result: ok\.[^;]*|COMPLETED.*' "$LOGS/$f.log" | tail -1)"
  done
else
  step "gates skipped (--skip-gates)"
fi

if [[ $DRY == 1 ]]; then
  step "dry run: would bump, tag $TAG, build, publish; nothing changed"; exit 0
fi

# ---------------------------------------------------------------------- bump
step "version bump"
if [[ $BUMPED == 0 ]]; then
  node -e '
    const fs=require("fs"),v=process.argv[1];
    for (const f of ["package.json","src-tauri/tauri.conf.json"]) {
      const s=fs.readFileSync(f,"utf8");
      fs.writeFileSync(f,s.replace(/("version":\s*")[^"]+(")/,`$1${v}$2`));
    }
    let c=fs.readFileSync("src-tauri/Cargo.toml","utf8");
    fs.writeFileSync("src-tauri/Cargo.toml",c.replace(/^version = "[^"]+"/m,`version = "${v}"`));
  ' "$VERSION"
  run cargo-lock bash -c 'cd src-tauri && cargo check'
  # Third-party notices follow the dependencies of what ships (A2).
  if node -e 'process.exit(require("./package.json").scripts.notices ? 0 : 1)'; then
    run notices npm run notices
    git add src/assets/THIRD-PARTY-NOTICES.txt
  fi
  git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
  git commit -q -m "Bump version to $VERSION$TRAILER"
  ok "committed"
else
  ok "already at $VERSION"
fi
git rev-parse "$TAG" >/dev/null 2>&1 || { git tag -a "$TAG" -m "$TAG"; ok "tagged $TAG"; }

# --------------------------------------------------------------------- build
step "signed build"
TARGET="$(grep -E '^\s*target-dir' src-tauri/.cargo/config.toml 2>/dev/null | sed -E 's/.*"(.*)".*/\1/' || true)"
[[ -n "$TARGET" ]] || TARGET="$ROOT/src-tauri/target"
BUNDLE="$TARGET/release/bundle"
EXE="$BUNDLE/nsis/ChronoNote_${VERSION}_x64-setup.exe"
MSI="$BUNDLE/msi/ChronoNote_${VERSION}_x64_en-US.msi"
if [[ -f "$EXE" && -f "$EXE.sig" && -f "$MSI" ]]; then
  ok "installers for $VERSION already built"
else
  # stale dev instances interfere with the release build; the *installed* app
  # (%LOCALAPPDATA%\ChronoNote) is not touched by a build, so leave it alone
  export TAURI_SIGNING_PRIVATE_KEY="$(cat src-tauri/updater-signing-key.local)"
  export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$(cat src-tauri/updater-signing-key-password.local)"
  run tauri-build npm run tauri build
fi
[[ -f "$EXE" && -f "$EXE.sig" && -f "$MSI" ]] || { echo "expected installers missing under $BUNDLE" >&2; exit 1; }

# --------------------------------------------------------------- latest.json
# Must be named exactly latest.json on disk: `gh release create path#label`
# only sets a display label, the uploaded asset keeps the local file name.
step "latest.json"
ASSETS="$WORK/assets"; mkdir -p "$ASSETS"
SIG="$(tr -d '\r\n' < "$EXE.sig")"
node -e '
  const [v,sig]=process.argv.slice(1);
  process.stdout.write(JSON.stringify({
    version:v, notes:"See the release page.",
    pub_date:new Date().toISOString(),
    platforms:{"windows-x86_64":{signature:sig,
      url:`https://github.com/marien/ChronoNote/releases/download/v${v}/ChronoNote_${v}_x64-setup.exe`}}
  },null,2)+"\n");
' "$VERSION" "$SIG" > "$ASSETS/latest.json"
ok "$(node -p "require('$(cygpath -m "$ASSETS/latest.json")').version")"

# ------------------------------------------------------------------- bundles
step "demo + web app bundles"
if [[ $BETA == 1 ]]; then
  ok "skipped for a beta (the web app follows stable releases)"
else
run build-demo   npm run build:demo
run build-webapp npm run build:webapp
if [[ -n "$(git status --porcelain website/demo-app website/webapp)" ]]; then
  git add website/demo-app website/webapp
  git commit -q -m "Rebuild demo and web app bundles for $TAG$TRAILER"
  ok "committed"
else
  ok "bundles already fresh"
fi
fi
[[ -z "$(git status --porcelain)" ]] || { echo "unexpected uncommitted changes after build:" >&2; git status --short; exit 1; }

# ------------------------------------------------------------------- publish
step "publish"
git push -q origin main --follow-tags
ok "pushed main + $TAG"
cp "$EXE" "$MSI" "$ASSETS/"
if [[ $BETA == 1 ]]; then
  gh release create "$TAG" "$ASSETS/$(basename "$MSI")" "$ASSETS/$(basename "$EXE")" \
    --title "$TAG (early update)" --notes-file "$NOTES_ABS" --prerelease >/dev/null
  ok "GitHub pre-release $TAG created"
else
  gh release create "$TAG" "$ASSETS/$(basename "$MSI")" "$ASSETS/$(basename "$EXE")" "$ASSETS/latest.json" \
    --title "$TAG" --notes-file "$NOTES_ABS" >/dev/null
  ok "GitHub release $TAG created"
  git checkout -q website-live
  git merge -q --ff-only main
  git push -q origin website-live
  git checkout -q main
  ok "website-live fast-forwarded"
fi

# The early channel: latest-beta.json on the rolling `early` pre-release. Only moved forward, never back to an older
# version (a stable hotfix must not pull early users off a newer beta). Semver: 0.31.0-2 < 0.31.0.
EARLY_URL="https://github.com/marien/ChronoNote/releases/download/early/latest-beta.json"
EARLY_NOW="$(curl -fsSL "$EARLY_URL" 2>/dev/null | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).version" 2>/dev/null || echo none)"
NEWER="$(node -e '
  const [a,b]=process.argv.slice(1);
  if (b==="none") { console.log("yes"); process.exit(0); }
  const p=v=>{const [core,pre]=v.split("-");return [...core.split(".").map(Number), pre===undefined?Infinity:Number(pre)];};
  const x=p(a), y=p(b);
  for (let i=0;i<4;i++){ if (x[i]!==y[i]) { console.log(x[i]>y[i]?"yes":"no"); process.exit(0);} }
  console.log("no");
' "$VERSION" "$EARLY_NOW")"
if [[ "$NEWER" == "yes" ]]; then
  cp "$ASSETS/latest.json" "$ASSETS/latest-beta.json"
  gh release view early >/dev/null 2>&1 || gh release create early --prerelease --target main \
    --title "Early updates channel" \
    --notes "Holds latest-beta.json for ChronoNote's Get early updates setting. Not a release to download." >/dev/null
  gh release upload early "$ASSETS/latest-beta.json" --clobber >/dev/null
  ok "early channel now serves $VERSION (was $EARLY_NOW)"
else
  ok "early channel keeps $EARLY_NOW (newer than $VERSION)"
fi

# -------------------------------------------------------------------- verify
step "verify"
NAMES="$(gh release view "$TAG" --json assets -q '.assets[].name' | sort | tr '\n' ' ')"
echo "   assets: $NAMES"
EXPECT="ChronoNote_${VERSION}_x64-setup.exe ChronoNote_${VERSION}_x64_en-US.msi"
[[ $BETA == 0 ]] && EXPECT="$EXPECT latest.json"
for n in $EXPECT; do
  [[ "$NAMES" == *"$n "* ]] || { echo "   MISSING asset: $n" >&2; exit 1; }
done
if [[ $BETA == 0 ]]; then
LIVE="$(curl -fsSL "https://github.com/marien/ChronoNote/releases/latest/download/latest.json" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).version")"
[[ "$LIVE" == "$VERSION" ]] && ok "releases/latest serves $LIVE" || echo "   WARNING: releases/latest serves $LIVE (expected $VERSION)"
fi
# The release commit gets its own Test run: wait for it, so a red build is
# seen now and not at the next release.
step "GitHub Test on the release commit"
sleep 20
RUN_ID="$(gh run list --workflow Test --branch main --limit 1 --json databaseId,headSha   -q ".[] | select(.headSha==\"$(git rev-parse HEAD)\") | .databaseId")"
if [[ -z "$RUN_ID" ]]; then
  echo "   WARNING: no Test run found for $(git rev-parse --short HEAD); check GitHub Actions"
elif gh run watch "$RUN_ID" --exit-status >/dev/null 2>&1; then
  ok "Test run $RUN_ID green"
else
  echo "   WARNING: Test run $RUN_ID FAILED: gh run view $RUN_ID --log-failed"
fi
echo
echo "Released $TAG: https://github.com/marien/ChronoNote/releases/tag/$TAG"
echo "Remaining by hand: CHANGELOG/CLAUDE.local.md/memory notes, comment+close any issues."
