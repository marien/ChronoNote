// D1: writes a Tauri config override for the native smoke-test build only. The app's WebView2 gets its browser
// arguments from Tauri's window config, which makes it ignore WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS; so the test
// build adds the debugging port here. The shipped app never gets this file.
// Usage: node scripts/native-test-config.mjs <out.json> [port]
import fs from "node:fs";

const [out, port = "9333"] = process.argv.slice(2);
const conf = JSON.parse(fs.readFileSync("src-tauri/tauri.conf.json", "utf8"));
// wry's own default, kept so behaviour matches the real app apart from the port.
const defaults = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection";
const windows = conf.app.windows.map((w) => ({
  ...w,
  additionalBrowserArgs: `${w.additionalBrowserArgs ?? defaults} --remote-debugging-port=${port}`,
}));
fs.writeFileSync(out, JSON.stringify({ app: { windows } }, null, 2));
console.log(`wrote ${out}`);
