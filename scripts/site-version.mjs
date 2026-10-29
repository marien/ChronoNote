// Writes a stable release's version and installer link into the website (§440). release.sh runs it for stable
// releases, before the website-live promotion; betas leave the site alone.
//
//   node scripts/site-version.mjs 0.35.0          # update website/*.html
//   node scripts/site-version.mjs 0.35.0 --check  # exit 1 if any page shows another version
//
// What it touches, in every website/*.html:
//   - the installer link .../releases/download/v<X>/ChronoNote_<X>_x64-setup.exe (download buttons, JSON-LD downloadUrl)
//   - <… data-version>X</…>
//   - "softwareVersion": "X" in the JSON-LD
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const [version, flag] = process.argv.slice(2);
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
  console.error("usage: node scripts/site-version.mjs X.Y.Z [--check]   (stable versions only)");
  process.exit(2);
}
const check = flag === "--check";
const dir = "website";
const RULES = [
  [/releases\/download\/v[\w.-]+\/ChronoNote_[\w.-]+?_x64-setup\.exe/g, `releases/download/v${version}/ChronoNote_${version}_x64-setup.exe`],
  [/(<[^>]*\bdata-version\b[^>]*>)[^<]*(<)/g, `$1${version}$2`],
  [/("softwareVersion":\s*")[^"]*(")/g, `$1${version}$2`],
];

let changed = 0;
for (const name of readdirSync(dir).filter((f) => f.endsWith(".html"))) {
  const path = `${dir}/${name}`;
  const before = readFileSync(path, "utf8");
  const after = RULES.reduce((text, [re, to]) => text.replace(re, to), before);
  if (after === before) continue;
  changed++;
  if (check) console.error(`${path} does not show ${version}`);
  else {
    writeFileSync(path, after);
    console.log(`${path}: set to ${version}`);
  }
}
if (check && changed) process.exit(1);
if (!changed) console.log(`website already shows ${version}`);
