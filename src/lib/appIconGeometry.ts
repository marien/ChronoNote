/**
 * The app icon ("daily agenda", no tile): a dark page with white outline, header rule,
 * twin binder pins and a check, wrapped in a thin dark keyline so it reads on dark and
 * light backgrounds alike (§416). One source for every copy of the icon:
 * `scripts/build-icons.mjs` (src-tauri/icons, web app, website favicons) and
 * `AppIcon.svelte` (title bar, About).
 *
 * Small sizes (<= 64 px) are pixel-fitted: stroke widths are whole pixels and every line
 * is placed so its edges land on pixel boundaries, which keeps the 16-48 px frames that
 * Windows shows on the taskbar and desktop sharp. Larger sizes use the plain 1024 master.
 * Pure TypeScript without imports, so Node can run it directly (type stripping).
 */

export const APP_ICON_INK = "#18181b";
export const APP_ICON_PAPER = "#fafafa";

/** Whole-pixel stroke width per pixel-fitted size. */
const FITTED_STROKE: Record<number, number> = {
  16: 1, 20: 2, 24: 2, 30: 2, 32: 2, 36: 3, 40: 3, 48: 4, 64: 5,
};

/** Snap `v` so a stroke of width `s` centred on it has its edges on pixel boundaries. */
function snap(v: number, s: number): number {
  return s % 2 === 1 ? Math.floor(v) + 0.5 : Math.round(v);
}

const n = (v: number) => +v.toFixed(3);

/** The icon's SVG elements for an N x N canvas (no <svg> wrapper), at offset (ox, oy). */
function glyph(N: number, ox = 0, oy = 0): string {
  const f = N / 1024;
  const fitted = FITTED_STROKE[N] !== undefined;
  let s: number, k: number, cx0: number, cx1: number, cy0: number, cy1: number;
  let ruleY: number, pinX: number, pinTop: number, pinBottom: number, r: number;
  let check: [number, number][], checkW: number, cap: "butt" | "round";
  if (fitted) {
    s = FITTED_STROKE[N];
    k = 1;
    const outerL = Math.max(1, Math.round(40 * f));
    cx0 = outerL + k + s / 2;
    cx1 = N - cx0;
    cy1 = N - Math.round(8 * f) - k - s / 2;
    cy0 = snap(170 * f, s);
    ruleY = snap(400 * f, s);
    pinX = snap(300 * f, s);
    pinTop = Math.round(8 * f) + k;
    pinBottom = Math.round(290 * f);
    r = Math.max(1.5, 150 * f);
    // Keep at least one pixel between the check's mitred point (0.71 s below its vertex)
    // and the inside of the page's bottom line.
    const mx = snap(445 * f, s), my = Math.min(snap(830 * f, s), cy1 - Math.ceil(1.25 * s) - 1);
    const a = Math.round(145 * f), b = Math.round(290 * f);
    check = [[mx - a, my - a], [mx, my], [mx + b, my - b]];
    checkW = s;
    cap = N >= 64 ? "round" : "butt";
  } else {
    s = 80 * f;
    k = 16 * f;
    cx0 = 96 * f; cx1 = 928 * f; cy0 = 170 * f; cy1 = 960 * f;
    ruleY = 400 * f; pinX = 300 * f; pinTop = 24 * f; pinBottom = 290 * f;
    r = 150 * f;
    check = [[300 * f, 690 * f], [445 * f, 830 * f], [735 * f, 540 * f]];
    checkW = 88 * f;
    cap = "round";
  }
  const X = (v: number) => n(v + ox), Y = (v: number) => n(v + oy);
  const pinX2 = N - pinX;
  const rect = `x="${X(cx0)}" y="${Y(cy0)}" width="${n(cx1 - cx0)}" height="${n(cy1 - cy0)}" rx="${n(r)}"`;
  // With butt caps the keyline pins start k above the white ones; round caps grow by themselves.
  const keyTop = cap === "butt" ? pinTop - k : pinTop;
  const pinStart = cap === "butt" ? pinTop : pinTop + s / 2;
  const keyStart = cap === "butt" ? keyTop : pinStart;
  const pins = (top: number) => `M${X(pinX)} ${Y(top)}V${Y(pinBottom)}M${X(pinX2)} ${Y(top)}V${Y(pinBottom)}`;
  const checkPath = "M" + check.map(([x, y]) => `${X(x)} ${Y(y)}`).join("L");
  return (
    `<g fill="none" stroke="${APP_ICON_INK}" stroke-width="${n(s + 2 * k)}" stroke-linecap="${cap}" stroke-linejoin="round">` +
    `<rect ${rect}/><path d="${pins(keyStart)}"/></g>` +
    `<rect ${rect} fill="${APP_ICON_INK}"/>` +
    `<g fill="none" stroke="${APP_ICON_PAPER}" stroke-width="${n(s)}" stroke-linecap="${cap}" stroke-linejoin="round">` +
    `<rect ${rect}/><path d="M${X(cx0)} ${Y(ruleY)}H${X(cx1)}"/><path d="${pins(pinStart)}"/></g>` +
    `<path d="${checkPath}" fill="none" stroke="${APP_ICON_PAPER}" stroke-width="${n(checkW)}" stroke-linecap="${cap}" stroke-linejoin="${cap === "butt" ? "miter" : "round"}"/>`
  );
}

/** The icon's inner SVG markup for an N x N viewBox. */
export function appIconInner(N: number): string {
  return glyph(N);
}

/** A complete standalone SVG of the icon at N x N (transparent background). */
export function appIconSvg(N: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${N}" height="${N}" viewBox="0 0 ${N} ${N}">${glyph(N)}</svg>`;
}

/**
 * The icon on a full-bleed ink square, the glyph at `scale` of the canvas: for places that
 * need an opaque square (iOS home screen, Android maskable icons, social previews).
 */
export function appIconPlateSvg(N: number, scale: number): string {
  const M = N * scale, o = (N - M) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${N}" height="${N}" viewBox="0 0 ${N} ${N}"><rect width="${N}" height="${N}" fill="${APP_ICON_INK}"/>${glyph(M, o, o)}</svg>`;
}
