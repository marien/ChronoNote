#!/usr/bin/env node
/**
 * Measures ChronoNote web app start-up on a phone-like Chromium profile.
 *
 * Emulates:
 * - 412x915 touch viewport + mobile Chrome user agent (`(pointer: coarse)` = true)
 * - Fast 4G network via CDP `Network.emulateNetworkConditions`
 *   (9 Mbps down, 1.5 Mbps up, 165 ms latency)
 * - CPU throttling 4x and 6x via CDP `Emulation.setCPUThrottlingRate`
 * - Cold load (fresh browser context, no cache, empty IndexedDB) and
 *   warm load (same context, HTTP/Service Worker cache + IndexedDB active)
 * - Median of 7 loads per scenario (configurable via `--runs N`)
 * - Trace-based V8 parse / compile / evaluate timing for the main bundle
 *
 * Usage:
 *   npm run build:webapp
 *   node scripts/measure-startup.mjs [--throttle 4] [--runs 7] [--json]
 */

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEBAPP_DIR = path.join(ROOT, "website", "webapp");

const MOBILE_USER_AGENT =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";

// Chrome DevTools "Fast 4G" preset: 9 Mbps down (with ~10% protocol overhead),
// 1.5 Mbps up, 165 ms RTT.
const FAST_4G = {
  offline: false,
  latency: 165,
  downloadThroughput: Math.round((9 * 1000 * 1000) / 8 * 0.9),
  uploadThroughput: Math.round((1.5 * 1000 * 1000) / 8 * 0.9),
  connectionType: "cellular4g",
};

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

/**
 * Parses CLI flags.
 * @param {string[]} argv
 */
function parseArgs(argv) {
  /** @type {number[]} */
  let throttles = [4, 6];
  let runs = 7;
  let json = false;
  let debugTrace = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--throttle" && i + 1 < argv.length) {
      const n = Number(argv[++i]);
      if (!Number.isFinite(n) || n < 1) {
        throw new Error(`Invalid --throttle value: ${argv[i]}`);
      }
      throttles = [n];
    } else if (arg.startsWith("--throttle=")) {
      const n = Number(arg.slice("--throttle=".length));
      if (!Number.isFinite(n) || n < 1) {
        throw new Error(`Invalid --throttle value: ${arg}`);
      }
      throttles = [n];
    } else if (arg === "--runs" && i + 1 < argv.length) {
      runs = Number(argv[++i]);
      if (!Number.isInteger(runs) || runs < 1) {
        throw new Error(`Invalid --runs value: ${argv[i]}`);
      }
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--debug-trace") {
      debugTrace = true;
    } else if (arg === "-h" || arg === "--help") {
      console.log("Usage: node scripts/measure-startup.mjs [--throttle N] [--runs N] [--json]");
      process.exit(0);
    }
  }
  return { throttles, runs, json, debugTrace };
}

/**
 * Starts a local static HTTP server for `website/webapp/`.
 * @returns {Promise<{ server: http.Server, url: string }>}
 */
function startStaticServer() {
  if (!fs.existsSync(path.join(WEBAPP_DIR, "index.html"))) {
    throw new Error(`Built webapp not found at ${WEBAPP_DIR}. Run 'npm run build:webapp' first.`);
  }

  const gzipCache = new Map();
  const compressibleExts = new Set([".html", ".js", ".mjs", ".css", ".json", ".webmanifest", ".svg", ".txt"]);

  const server = http.createServer((req, res) => {
    const reqUrl = new URL(req.url || "/", "http://127.0.0.1");
    let relPath = decodeURIComponent(reqUrl.pathname).replace(/^\/+/, "");
    if (relPath === "") relPath = "index.html";
    const filePath = path.resolve(WEBAPP_DIR, relPath);
    if (!filePath.startsWith(WEBAPP_DIR)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME_TYPES[ext] || "application/octet-stream";
    const isHashedAsset = relPath.startsWith("assets/");
    const acceptGzip = /\bgzip\b/.test(String(req.headers["accept-encoding"] || ""));
    const headers = {
      "Content-Type": mime,
      "Cache-Control": isHashedAsset ? "public, max-age=31536000, immutable" : "no-cache",
    };

    if (acceptGzip && compressibleExts.has(ext)) {
      let gz = gzipCache.get(filePath);
      if (!gz) {
        gz = zlib.gzipSync(fs.readFileSync(filePath), { level: 6 });
        gzipCache.set(filePath, gz);
      }
      res.writeHead(200, { ...headers, "Content-Encoding": "gzip", "Content-Length": gz.length });
      res.end(gz);
      return;
    }

    const raw = fs.readFileSync(filePath);
    res.writeHead(200, { ...headers, "Content-Length": raw.length });
    res.end(raw);
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Unexpected server address"));
        return;
      }
      resolve({ server, url: `http://127.0.0.1:${addr.port}/` });
    });
  });
}

/**
 * Returns the median of a numeric array (ignoring null/undefined).
 * @param {(number | null | undefined)[]} values
 * @returns {number | null}
 */
function median(values) {
  const nums = values.filter((v) => typeof v === "number" && Number.isFinite(v)).sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 === 1 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

/**
 * Formats a number in ms or "-" when null.
 * @param {number | null | undefined} value
 * @param {number} [digits]
 */
function fmt(value, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return value.toFixed(digits);
}

/**
 * Merges overlapping [start, end] microsecond intervals and returns summed ms.
 * @param {Array<{ start: number, end: number }>} intervals
 */
function unionDurationMs(intervals) {
  if (intervals.length === 0) return 0;
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  let total = 0;
  let curStart = sorted[0].start;
  let curEnd = sorted[0].end;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start <= curEnd) {
      if (sorted[i].end > curEnd) curEnd = sorted[i].end;
    } else {
      total += curEnd - curStart;
      curStart = sorted[i].start;
      curEnd = sorted[i].end;
    }
  }
  total += curEnd - curStart;
  return total / 1000;
}

/**
 * Extracts V8 parse/compile/evaluate timings and `scriptReadyMs` from a Chrome trace buffer.
 * Uses `v8.parseOnBackgroundParsing` (actual CPU parse time, excluding `v8.parseOnBackgroundWaiting`
 * network streaming waits) and merges overlapping intervals so nested events are never double-counted.
 *
 * @param {Buffer} traceBuf
 * @param {string} mainScriptName
 * @param {number | null} syncPerfNowMs
 * @param {boolean} [debug]
 */
function analyzeTrace(traceBuf, mainScriptName, syncPerfNowMs, debug = false) {
  const parsed = JSON.parse(traceBuf.toString("utf8"));
  const events = Array.isArray(parsed) ? parsed : parsed.traceEvents || [];

  /** @type {Array<{ name: string, ts: number, dur: number, url: string }>} */
  const matched = [];
  /** @type {Map<string, { count: number, durMs: number }>} */
  const byName = new Map();
  let syncTraceTs = null;

  for (const ev of events) {
    if (ev.name === "cn-measure-sync" && typeof ev.ts === "number") {
      syncTraceTs = ev.ts;
    }
    if (ev.ph !== "X" || typeof ev.dur !== "number") continue;
    const cat = ev.cat || "";
    if (!cat.includes("devtools.timeline") && !cat.includes("v8")) continue;
    const prev = byName.get(ev.name) || { count: 0, durMs: 0 };
    prev.count += 1;
    prev.durMs += ev.dur / 1000;
    byName.set(ev.name, prev);

    const url = ev.args?.data?.url || ev.args?.url || ev.args?.fileName || "";
    matched.push({ name: ev.name, ts: ev.ts, dur: ev.dur, url });
  }

  if (debug) {
    console.log("\n[debug-trace] Top trace X-event names by summed dur:");
    for (const [name, info] of [...byName.entries()].sort((a, b) => b[1].durMs - a[1].durMs).slice(0, 20)) {
      console.log(`  ${name.padEnd(36)} count=${String(info.count).padStart(4)}  sum=${info.durMs.toFixed(2)} ms`);
    }
  }

  // Note: `v8.parseOnBackgroundParsing` events live inside `v8.parseOnBackground` (which also
  // includes `v8.parseOnBackgroundWaiting` while waiting for network bytes) and may not carry
  // `args.data.url` themselves — check if they fall within the main script's `v8.parseOnBackground` window.
  const mainBgRanges = matched
    .filter((e) => e.name === "v8.parseOnBackground" && e.url.includes(mainScriptName))
    .map((e) => ({ start: e.ts, end: e.ts + e.dur }));

  /** @param {number} ts */
  function inMainBgRange(ts) {
    return mainBgRanges.some((r) => ts >= r.start && ts <= r.end);
  }

  const compileNames = new Set([
    "v8.compile",
    "v8.compileModule",
    "v8.parseOnBackgroundParsing",
    "V8.CompileCode",
    "v8.compileFunction",
  ]);
  const evalNames = new Set(["EvaluateScript", "v8.evaluateModule"]);

  /** @type {Array<{ start: number, end: number }>} */
  const mainCompileIntervals = [];
  /** @type {Array<{ start: number, end: number }>} */
  const mainEvalIntervals = [];
  /** @type {Array<{ start: number, end: number }>} */
  const mainWaitIntervals = [];
  /** @type {Array<{ start: number, end: number }>} */
  const allScriptIntervals = [];

  let mainEvalStartTs = null;
  let mainEvalEndTs = null;

  for (const e of matched) {
    const isMainUrl = Boolean(mainScriptName && e.url && e.url.includes(mainScriptName));
    const isMainBgParse = e.name === "v8.parseOnBackgroundParsing" && (isMainUrl || inMainBgRange(e.ts));
    const isMainBgWait = e.name === "v8.parseOnBackgroundWaiting" && (isMainUrl || inMainBgRange(e.ts));
    const interval = { start: e.ts, end: e.ts + e.dur };

    if (compileNames.has(e.name) || evalNames.has(e.name)) {
      allScriptIntervals.push(interval);
    }
    if (isMainBgWait) {
      mainWaitIntervals.push(interval);
    }
    if (isMainUrl || isMainBgParse) {
      if (compileNames.has(e.name)) mainCompileIntervals.push(interval);
      if (evalNames.has(e.name)) {
        mainEvalIntervals.push(interval);
        if (mainEvalStartTs === null || e.ts < mainEvalStartTs) mainEvalStartTs = e.ts;
        if (mainEvalEndTs === null || e.ts + e.dur > mainEvalEndTs) mainEvalEndTs = e.ts + e.dur;
      }
    }
  }

  const mainCompileMs = unionDurationMs(mainCompileIntervals);
  const mainEvalMs = unionDurationMs(mainEvalIntervals);
  const mainTotalPceMs = unionDurationMs([...mainCompileIntervals, ...mainEvalIntervals]);
  const mainParseWaitMs = unionDurationMs(mainWaitIntervals);
  const allPceMs = unionDurationMs(allScriptIntervals);

  let scriptReadyMs = null;
  let scriptEvalDoneMs = null;
  if (syncTraceTs !== null && syncPerfNowMs !== null && mainEvalStartTs !== null && mainEvalEndTs !== null) {
    scriptReadyMs = syncPerfNowMs - (syncTraceTs - mainEvalStartTs) / 1000;
    scriptEvalDoneMs = syncPerfNowMs - (syncTraceTs - mainEvalEndTs) / 1000;
  }

  const layoutMs = byName.get("Layout")?.durMs ?? 0;
  const paintMs = byName.get("Paint")?.durMs ?? 0;

  return {
    scriptReadyMs,
    scriptEvalDoneMs,
    mainCompileMs,
    mainEvalMs,
    mainTotalPceMs,
    mainParseWaitMs,
    allPceMs,
    layoutMs,
    paintMs,
  };
}

/**
 * Installs an init script in the browser context to capture exact in-page
 * timestamps when the main script mounts `#app` and when `.cm-content`
 * renders visible note text.
 */
const INIT_SCRIPT = `(() => {
  const m = {
    appMountMs: null,
    firstNoteMs: null,
    firstNotePaintMs: null,
    noteTextSample: "",
  };
  window.__startupMeasure = m;

  function check() {
    const app = document.getElementById("app");
    if (app && app.firstElementChild && m.appMountMs === null) {
      m.appMountMs = performance.now();
    }
    if (m.firstNoteMs === null) {
      const cm = document.querySelector(".cm-content");
      if (cm) {
        const text = (cm.textContent || "").trim();
        const rect = cm.getBoundingClientRect();
        if (text.length > 0 && rect.width > 0 && rect.height > 0) {
          m.firstNoteMs = performance.now();
          m.noteTextSample = text.slice(0, 60);
          requestAnimationFrame(() => {
            m.firstNotePaintMs = performance.now();
          });
        }
      }
    }
  }

  const obs = new MutationObserver(check);
  if (document.documentElement) {
    obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
      check();
    });
  }
})();`;

/**
 * Runs one page load and collects timings + trace.
 * @param {import("playwright").Browser} browser
 * @param {import("playwright").BrowserContext} context
 * @param {string} url
 * @param {number} throttleRate
 * @param {boolean} disableCache
 * @param {string} mainScriptName
 * @param {boolean} debugTrace
 */
async function measureSingleLoad(browser, context, url, throttleRate, disableCache, mainScriptName, debugTrace) {
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttleRate });
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", FAST_4G);
  if (disableCache) {
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  }

  await browser.startTracing(page, {
    categories: ["devtools.timeline", "v8.execute", "blink.user_timing"],
  });

  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => Boolean(window.__startupMeasure && window.__startupMeasure.firstNotePaintMs !== null),
    undefined,
    { timeout: 60000 },
  );

  // Wait briefly for initApp()'s final `boot done in N ms` log write to IndexedDB
  await page.waitForFunction(
    () =>
      new Promise((resolve) => {
        try {
          const req = indexedDB.open("chrononote-webapp");
          req.onerror = () => resolve(false);
          req.onsuccess = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains("meta")) {
              db.close();
              resolve(false);
              return;
            }
            const tx = db.transaction("meta", "readonly");
            const getReq = tx.objectStore("meta").get("app_log");
            getReq.onsuccess = () => {
              db.close();
              const logs = Array.isArray(getReq.result) ? getReq.result : [];
              resolve(logs.some((line) => typeof line === "string" && line.includes("boot done in ")));
            };
            getReq.onerror = () => {
              db.close();
              resolve(false);
            };
          };
        } catch {
          resolve(false);
        }
      }),
    undefined,
    { timeout: 15000 },
  );

  // Align Chrome trace timestamps with `performance.now()`
  const syncPerfNowMs = await page.evaluate(() => {
    performance.mark("cn-measure-sync");
    return performance.now();
  });

  const traceBuf = await browser.stopTracing();

  const metrics = await page.evaluate(async () => {
    const nav = /** @type {PerformanceNavigationTiming | undefined} */ (
      performance.getEntriesByType("navigation")[0]
    );
    const resources = /** @type {PerformanceResourceTiming[]} */ (
      performance.getEntriesByType("resource")
    );
    const mainJs = resources.find((r) => /assets\/index-.*\.js/.test(r.name));
    const mainCss = resources.find((r) => /assets\/index-.*\.css/.test(r.name));

    let bootDoneLogMs = null;
    try {
      bootDoneLogMs = await new Promise((resolve) => {
        const req = indexedDB.open("chrononote-webapp");
        req.onerror = () => resolve(null);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("meta", "readonly");
          const getReq = tx.objectStore("meta").get("app_log");
          getReq.onsuccess = () => {
            db.close();
            const logs = Array.isArray(getReq.result) ? getReq.result : [];
            const last = [...logs].reverse().find((l) => typeof l === "string" && l.includes("boot done in "));
            const m = last ? last.match(/boot done in (\d+) ms/) : null;
            resolve(m ? Number(m[1]) : null);
          };
          getReq.onerror = () => {
            db.close();
            resolve(null);
          };
        };
      });
    } catch {
      bootDoneLogMs = null;
    }

    return {
      measure: window.__startupMeasure,
      isMobileMatch: window.matchMedia("(pointer: coarse)").matches,
      swControlled: Boolean(navigator.serviceWorker?.controller),
      bootDoneLogMs,
      nav: nav
        ? {
            responseEnd: nav.responseEnd,
            domInteractive: nav.domInteractive,
            domContentLoaded: nav.domContentLoadedEventEnd,
            loadEventEnd: nav.loadEventEnd,
            transferSize: nav.transferSize,
          }
        : null,
      mainJs: mainJs
        ? {
            startTime: mainJs.startTime,
            responseEnd: mainJs.responseEnd,
            duration: mainJs.duration,
            transferSize: mainJs.transferSize,
            encodedBodySize: mainJs.encodedBodySize,
            decodedBodySize: mainJs.decodedBodySize,
          }
        : null,
      mainCss: mainCss
        ? {
            startTime: mainCss.startTime,
            responseEnd: mainCss.responseEnd,
            duration: mainCss.duration,
            transferSize: mainCss.transferSize,
          }
        : null,
    };
  });

  await page.close();

  const trace = analyzeTrace(traceBuf, mainScriptName, syncPerfNowMs, debugTrace);

  return {
    isMobileMatch: metrics.isMobileMatch,
    swControlled: metrics.swControlled,
    htmlResponseEndMs: metrics.nav?.responseEnd ?? null,
    mainJsStartMs: metrics.mainJs?.startTime ?? null,
    mainJsFetchEndMs: metrics.mainJs?.responseEnd ?? null,
    mainJsTransferBytes: metrics.mainJs?.transferSize ?? null,
    mainCssFetchEndMs: metrics.mainCss?.responseEnd ?? null,
    domInteractiveMs: metrics.nav?.domInteractive ?? null,
    scriptReadyMs: trace.scriptReadyMs,
    scriptEvalDoneMs: trace.scriptEvalDoneMs,
    appMountMs: metrics.measure.appMountMs,
    bootDoneLogMs: metrics.bootDoneLogMs,
    firstNoteMs: metrics.measure.firstNoteMs,
    firstNotePaintMs: metrics.measure.firstNotePaintMs,
    traceMainCompileMs: trace.mainCompileMs,
    traceMainEvalMs: trace.mainEvalMs,
    traceMainPceMs: trace.mainTotalPceMs,
    traceMainParseWaitMs: trace.mainParseWaitMs,
    traceAllPceMs: trace.allPceMs,
    traceLayoutMs: trace.layoutMs,
    tracePaintMs: trace.paintMs,
  };
}

/**
 * Creates a phone-emulated browser context.
 * @param {import("playwright").Browser} browser
 */
async function createPhoneContext(browser) {
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
    userAgent: MOBILE_USER_AGENT,
  });
  await context.addInitScript(INIT_SCRIPT);
  return context;
}

/**
 * Summarizes an array of load results by taking the median of each numeric field.
 * @param {Awaited<ReturnType<typeof measureSingleLoad>>[]} samples
 */
function summarize(samples) {
  const keys = [
    "htmlResponseEndMs",
    "mainJsFetchEndMs",
    "mainJsTransferBytes",
    "mainCssFetchEndMs",
    "domInteractiveMs",
    "scriptReadyMs",
    "scriptEvalDoneMs",
    "appMountMs",
    "bootDoneLogMs",
    "firstNoteMs",
    "firstNotePaintMs",
    "traceMainCompileMs",
    "traceMainEvalMs",
    "traceMainPceMs",
    "traceMainParseWaitMs",
    "traceAllPceMs",
    "traceLayoutMs",
    "tracePaintMs",
  ];
  /** @type {Record<string, number | null>} */
  const med = {};
  for (const k of keys) {
    med[k] = median(samples.map((s) => s[k]));
  }
  return {
    count: samples.length,
    swControlledCount: samples.filter((s) => s.swControlled).length,
    mobileMatchCount: samples.filter((s) => s.isMobileMatch).length,
    median: med,
    samples,
  };
}

async function main() {
  const { throttles, runs, json, debugTrace } = parseArgs(process.argv.slice(2));
  const assetsDir = path.join(WEBAPP_DIR, "assets");
  const mainScriptName = fs.existsSync(assetsDir)
    ? fs.readdirSync(assetsDir).find((f) => f.startsWith("index-") && f.endsWith(".js")) || "index-"
    : "index-";

  const { server, url } = await startStaticServer();
  const browser = await chromium.launch({ headless: true });

  /** @type {Record<string, unknown>} */
  const report = {
    url,
    mainScriptName,
    runsPerScenario: runs,
    viewport: "412x915",
    network: FAST_4G,
    results: {},
  };

  try {
    for (const rate of throttles) {
      // 1. Cold loads: fresh context per load, cache disabled
      const coldSamples = [];
      for (let i = 0; i < runs; i++) {
        const ctx = await createPhoneContext(browser);
        try {
          const res = await measureSingleLoad(browser, ctx, url, rate, true, mainScriptName, debugTrace && i === 0);
          coldSamples.push(res);
        } finally {
          await ctx.close();
        }
      }

      // 2. Warm loads: one context, complete first run, seed today's note so subsequent
      //    warm loads open directly into a non-empty note, and activate Service Worker.
      const warmCtx = await createPhoneContext(browser);
      const warmSamples = [];
      try {
        const seedPage = await warmCtx.newPage();
        await seedPage.goto(url, { waitUntil: "load" });
        await seedPage.waitForSelector(".cm-content", { state: "visible", timeout: 30000 });
        await seedPage.evaluate(async () => {
          if ("serviceWorker" in navigator) {
            await navigator.serviceWorker.ready;
          }
          // Seed today's dated note so warm reloads open a non-empty note in `.cm-content`
          // (first-run onboarding only seeds a scratchpad, which isn't reopened on launch 2).
          const d = new Date();
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, "0");
          const dd = String(d.getDate()).padStart(2, "0");
          const todayFile = `${yyyy}-${mm}-${dd}.txt`;
          const internals = /** @type {{ __TAURI_INTERNALS__?: { invoke?: (cmd: string, args: unknown) => Promise<unknown> } }} */ (window).__TAURI_INTERNALS__;
          if (internals?.invoke) {
            await internals.invoke("write_note", {
              filename: todayFile,
              content: "# Work\n. Review startup measurements for ChronoNote\n",
            });
          }
        });
        // Navigate once more so SW controls the client and the seeded note is cached/session-ready
        await seedPage.goto(url, { waitUntil: "domcontentloaded" });
        await seedPage.waitForSelector(".cm-content", { state: "visible", timeout: 30000 });
        await seedPage.close();

        for (let i = 0; i < runs; i++) {
          const res = await measureSingleLoad(browser, warmCtx, url, rate, false, mainScriptName, debugTrace && i === 0);
          warmSamples.push(res);
        }
      } finally {
        await warmCtx.close();
      }

      report.results[`${rate}x`] = {
        cold: summarize(coldSamples),
        warm: summarize(warmSamples),
      };
    }
  } finally {
    await browser.close();
    server.close();
  }

  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`ChronoNote Web App Start-up Measurement (median of ${runs} loads, 412x915 touch, Fast 4G)`);
  console.log(`Main script: ${mainScriptName}\n`);
  console.log(
    "Scenario       | JS Fetch | Script Ready | Main Parse+Compile | Main Eval | Main PCE | Boot Done | First Note | First Paint | SW",
  );
  console.log(
    "---------------|----------|--------------|--------------------|-----------|----------|-----------|------------|-------------|----",
  );

  for (const rate of throttles) {
    const group = /** @type {Record<string, ReturnType<typeof summarize>>} */ (report.results[`${rate}x`]);
    for (const kind of ["cold", "warm"]) {
      const s = group[kind];
      const m = s.median;
      const label = `${rate}x ${kind}`.padEnd(14);
      console.log(
        `${label} | ${fmt(m.mainJsFetchEndMs).padStart(6)}ms | ${fmt(m.scriptReadyMs).padStart(10)}ms | ${fmt(m.traceMainCompileMs).padStart(16)}ms | ${fmt(m.traceMainEvalMs).padStart(7)}ms | ${fmt(m.traceMainPceMs).padStart(6)}ms | ${fmt(m.bootDoneLogMs).padStart(7)}ms | ${fmt(m.firstNoteMs).padStart(8)}ms | ${fmt(m.firstNotePaintMs).padStart(9)}ms | ${s.swControlledCount}/${s.count}`,
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
