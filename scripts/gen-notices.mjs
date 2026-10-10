#!/usr/bin/env node
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const checkOnly = process.argv.includes('--check');

// Same allow-list as scripts/notices/about.toml
const ALLOWED_SPDX_IDS = new Set([
  'MIT',
  'Apache-2.0',
  'Apache-2.0 WITH LLVM-exception',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  'MPL-2.0',
  'Zlib',
  'Unicode-3.0',
  'Unicode-DFS-2016',
  'BSL-1.0',
  'CC0-1.0',
  '0BSD',
  'Unlicense',
  'CDLA-Permissive-2.0',
]);

function isLicenseAllowed(licenseStr) {
  if (!licenseStr || typeof licenseStr !== 'string') return false;
  const trimmed = licenseStr.trim();
  if (ALLOWED_SPDX_IDS.has(trimmed)) return true;

  const unparenthesized = trimmed.replace(/^\(+|\)+$/g, '').trim();
  if (ALLOWED_SPDX_IDS.has(unparenthesized)) return true;

  const parts = unparenthesized.split(/\s+OR\s+/i);
  return parts.some((part) => {
    const cleaned = part.trim().replace(/^\(+|\)+$/g, '').trim();
    return ALLOWED_SPDX_IDS.has(cleaned);
  });
}

// -----------------------------------------------------------------------------
// 1. Rust part (cargo-about)
// -----------------------------------------------------------------------------
let rustStdout;
const cargoArgs = [
  'about',
  'generate',
  '--manifest-path',
  'src-tauri/Cargo.toml',
  '-c',
  'scripts/notices/about.toml',
  'scripts/notices/about.hbs',
];

const rustProc = spawnSync('cargo', cargoArgs, {
  cwd: rootDir,
  encoding: 'utf8',
  maxBuffer: 50 * 1024 * 1024,
});

if (rustProc.status !== 0) {
  // If cargo-about fails due to PowerShell parent process restrictions on Windows,
  // rerun with a temporary output file.
  if (rustProc.stderr && rustProc.stderr.includes('cargo-about should not redirect its output in powershell')) {
    const tmpFile = path.resolve(rootDir, 'scripts/notices/.tmp-cargo-about.txt');
    const fallbackArgs = [
      'about',
      'generate',
      '--manifest-path',
      'src-tauri/Cargo.toml',
      '-c',
      'scripts/notices/about.toml',
      '-o',
      tmpFile,
      'scripts/notices/about.hbs',
    ];
    const fallbackProc = spawnSync('cargo', fallbackArgs, {
      cwd: rootDir,
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
    });
    if (fallbackProc.status !== 0) {
      process.stderr.write(fallbackProc.stderr || 'cargo about failed\n');
      process.exit(fallbackProc.status || 1);
    }
    rustStdout = fs.readFileSync(tmpFile, 'utf8');
    try {
      fs.unlinkSync(tmpFile);
    } catch {}
  } else {
    process.stderr.write(rustProc.stderr || 'cargo about failed\n');
    process.exit(rustProc.status || 1);
  }
} else {
  rustStdout = rustProc.stdout;
}

// -----------------------------------------------------------------------------
// 2. npm part (production dependencies + svelte)
// -----------------------------------------------------------------------------
let prodTree;
try {
  const prodOut = execSync('npm ls --omit=dev --all --json', {
    cwd: rootDir,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  prodTree = JSON.parse(prodOut);
} catch (err) {
  console.error('Failed to run npm ls --omit=dev --all --json:', err.message);
  process.exit(1);
}

let svelteTree;
try {
  const svelteOut = execSync('npm ls svelte --all --json', {
    cwd: rootDir,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  svelteTree = JSON.parse(svelteOut);
} catch (err) {
  console.error('Failed to run npm ls svelte --all --json:', err.message);
  process.exit(1);
}

const packages = new Map();

function walkTree(node) {
  if (!node || typeof node !== 'object') return;
  if (node.dependencies) {
    for (const [depName, depData] of Object.entries(node.dependencies)) {
      if (depName === 'chrononote' || depName === prodTree.name) continue;
      if (!depData || !depData.version) continue;
      const key = `${depName}@${depData.version}`;
      if (!packages.has(key)) {
        packages.set(key, { name: depName, version: depData.version });
      }
      walkTree(depData);
    }
  }
}

walkTree(prodTree);
walkTree(svelteTree);

const collectedJsPackages = [];
const offenders = [];

for (const pkg of packages.values()) {
  const pkgDir = path.resolve(rootDir, 'node_modules', ...pkg.name.split('/'));
  const pkgJsonPath = path.join(pkgDir, 'package.json');

  if (!fs.existsSync(pkgJsonPath)) {
    offenders.push({
      name: pkg.name,
      version: pkg.version,
      reason: 'package.json not found in node_modules',
    });
    continue;
  }

  let pkgJson;
  try {
    pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  } catch (err) {
    offenders.push({
      name: pkg.name,
      version: pkg.version,
      reason: `failed to parse package.json: ${err.message}`,
    });
    continue;
  }

  const licenseId = pkgJson.license || (Array.isArray(pkgJson.licenses) && pkgJson.licenses[0]?.type);
  if (!licenseId || !isLicenseAllowed(licenseId)) {
    offenders.push({
      name: pkg.name,
      version: pkg.version,
      reason: `disallowed or missing licence (${licenseId || 'none'})`,
    });
    continue;
  }

  let licenseText = null;
  try {
    const dirFiles = fs.readdirSync(pkgDir);
    const licFile = dirFiles.find((f) => /^(licen[cs]e|copying)(\.|$)/i.test(f));
    if (licFile) {
      licenseText = fs.readFileSync(path.join(pkgDir, licFile), 'utf8');
    }
  } catch {
    // Ignore read error, licenseText remains null
  }

  collectedJsPackages.push({
    name: pkg.name,
    version: pkg.version,
    license: licenseId,
    licenseText,
  });
}

if (offenders.length > 0) {
  console.error(`Found ${offenders.length} package(s) with disallowed or missing licence:`);
  for (const o of offenders) {
    console.error(`  - ${o.name}@${o.version}: ${o.reason}`);
  }
  process.exit(1);
}

// -----------------------------------------------------------------------------
// 3. Assemble output
// -----------------------------------------------------------------------------
collectedJsPackages.sort((a, b) => a.name.localeCompare(b.name));

let jsSection = '================================================================================\n';
jsSection += 'JavaScript packages\n';
jsSection += '================================================================================\n\n';

for (const pkg of collectedJsPackages) {
  jsSection += '================================================================================\n';
  jsSection += `${pkg.name} ${pkg.version}\n`;
  if (pkg.licenseText) {
    jsSection += `${pkg.license}\n\n`;
    jsSection += `${pkg.licenseText.trim()}\n\n`;
  } else {
    jsSection += `(no licence file in the package; licence: ${pkg.license})\n\n`;
  }
}

let rustSection = '================================================================================\n';
rustSection += 'Rust crates\n';
rustSection += '================================================================================\n\n';
rustSection += rustStdout.trim() + '\n';

const header =
  'ChronoNote includes the following open-source software.\n' +
  'Generated by scripts/gen-notices.mjs; do not edit.\n\n';

const fullOutput = (header + jsSection + rustSection).replace(/\r\n/g, '\n').replace(/\r/g, '\n');

if (checkOnly) {
  console.log(`Third-party notices check passed: ${collectedJsPackages.length} npm packages and Rust dependencies verified.`);
} else {
  const destPath = path.resolve(rootDir, 'src/assets/THIRD-PARTY-NOTICES.txt');
  fs.writeFileSync(destPath, fullOutput, 'utf8');
  console.log(`Wrote third-party notices to ${destPath}`);
}
