#!/usr/bin/env node
// compose-video.mjs — turns recorded clips into one walkthrough video: a
// title card, one scene per story part (clips side by side on a labelled
// background, a caption bar over them) and a closing card. Node ESM, Node
// built-ins only: Playwright (for the cards and captions) is resolved from
// the PROJECT (its package.json and node_modules), never from the skills.
//
//   node .claude/skills/build/scripts/video/compose-video.mjs <cut.json> [--project <root>]
//
// The cut file is described in build/video.md ("The cut file"). Paths in it
// are relative to the folder that holds it. On success the script prints one
// JSON object on stdout, ready to paste into report.json's videos[]:
//
//   { "file": "<absolute path>", "duration_s": 41.2, "size_mb": 3.4,
//     "codec": "h264", "crf": 23, "chapters": [ { "at_s": 0, "title": "..." } ] }
//
// Exit codes: 0 ok, 1 failure (the reason is on stderr), 2 usage.
//
// Why pictures: the ffmpeg builds that ship with many systems (and
// Playwright's own) lack the drawtext filter. So the cards, labels and
// captions are rendered as PNGs by Chromium and laid over the clips.
//
// The pure parts (validateCut, normalizeCut, layoutPanels, buildSceneArgs,
// computeChapters, chooseCodec, the HTML builders) are exported and need
// neither ffmpeg nor Playwright. record.mjs reuses loadChromium.

import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, readdirSync, statSync, renameSync, copyFileSync } from "node:fs";
import { join, dirname, resolve, extname, delimiter } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { findProjectRoot } from "../lib/workflow.mjs";

export const DEFAULT_SIZE = { width: 1920, height: 1080 };
export const DEFAULT_FPS = 25;
export const DEFAULT_THEME = {
  background: "#131211",
  ink: "#f2efea",
  muted: "#b3ada4",
  accent: "#e3a8d0",
  font: 'ui-sans-serif, system-ui, "Segoe UI", sans-serif',
  heading_font: 'Georgia, "Times New Roman", serif',
  fonts: [],
};

// -------------------------------------------------------------- the cut

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isStr = (v) => typeof v === "string" && v.trim() !== "";
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// Returns a list of problems, each one line naming the field. Empty: valid.
export function validateCut(cut) {
  const errs = [];
  const bad = (path, msg) => errs.push(`${path}: ${msg}`);
  if (!isObj(cut)) return ["cut: must be a JSON object"];
  if (!isStr(cut.out)) bad("out", "must be the output path, ending in .mp4 or .webm");
  else if (![".mp4", ".webm"].includes(extname(cut.out).toLowerCase())) bad("out", "must end in .mp4 or .webm");
  if (cut.size !== undefined) {
    if (!isObj(cut.size) || !Number.isInteger(cut.size.width) || !Number.isInteger(cut.size.height) || cut.size.width < 320 || cut.size.height < 240) {
      bad("size", "must be { width, height } in whole pixels, at least 320x240");
    } else if (cut.size.width % 2 || cut.size.height % 2) bad("size", "width and height must be even");
  }
  if (cut.fps !== undefined && !(Number.isInteger(cut.fps) && cut.fps >= 5 && cut.fps <= 60)) bad("fps", "must be a whole number from 5 to 60");
  if (cut.max_mb !== undefined && !(isNum(cut.max_mb) && cut.max_mb > 0)) bad("max_mb", "must be a number above 0");
  if (cut.chapters !== undefined && !["scenes", "captions"].includes(cut.chapters)) bad("chapters", 'must be "scenes" or "captions"');
  if (cut.theme !== undefined) {
    if (!isObj(cut.theme)) bad("theme", "must be an object");
    else {
      for (const k of ["background", "ink", "muted", "accent", "font", "heading_font"]) {
        if (cut.theme[k] !== undefined && !isStr(cut.theme[k])) bad(`theme.${k}`, "must be a string");
      }
      if (cut.theme.fonts !== undefined) {
        if (!Array.isArray(cut.theme.fonts)) bad("theme.fonts", "must be a list");
        else
          cut.theme.fonts.forEach((f, i) => {
            if (!isObj(f) || !isStr(f.family) || !isStr(f.file)) bad(`theme.fonts[${i}]`, "needs a family and a file");
          });
      }
    }
  }
  for (const key of ["title", "closing"]) {
    const card = cut[key];
    if (card === undefined || card === null) continue;
    if (!isObj(card) || !isStr(card.heading)) bad(key, "must be an object with a heading");
    else {
      for (const k of ["text", "mark"]) if (card[k] !== undefined && typeof card[k] !== "string") bad(`${key}.${k}`, "must be a string");
      if (card.seconds !== undefined && !(isNum(card.seconds) && card.seconds > 0 && card.seconds <= 30)) bad(`${key}.seconds`, "must be a number above 0 and at most 30");
    }
  }
  if (!Array.isArray(cut.scenes) || cut.scenes.length === 0) {
    bad("scenes", "must be a list with at least one scene");
    return errs;
  }
  const frame = { ...DEFAULT_SIZE, ...(isObj(cut.size) ? cut.size : {}) };
  cut.scenes.forEach((scene, si) => {
    const sp = `scenes[${si}]`;
    if (!isObj(scene)) return bad(sp, "must be an object");
    if (!isNum(scene.duration_s) || scene.duration_s <= 0) bad(`${sp}.duration_s`, "must be a number above 0 (seconds)");
    for (const k of ["title", "heading"]) if (scene[k] !== undefined && typeof scene[k] !== "string") bad(`${sp}.${k}`, "must be a string");
    if (!Array.isArray(scene.panels) || scene.panels.length === 0) bad(`${sp}.panels`, "must be a list with at least one panel");
    else
      scene.panels.forEach((p, pi) => {
        const pp = `${sp}.panels[${pi}]`;
        if (!isObj(p)) return bad(pp, "must be an object");
        if (!isStr(p.clip)) bad(`${pp}.clip`, "must be the path of a recorded clip");
        if (p.offset_s !== undefined && !(isNum(p.offset_s) && p.offset_s >= 0)) bad(`${pp}.offset_s`, "must be a number of seconds, 0 or more");
        if (p.label !== undefined && typeof p.label !== "string") bad(`${pp}.label`, "must be a string");
        if (p.view !== undefined && !(isObj(p.view) && isNum(p.view.width) && isNum(p.view.height) && p.view.width > 0 && p.view.height > 0)) {
          bad(`${pp}.view`, "must be { width, height }, the clip's size in pixels");
        }
        const placed = ["x", "y", "w", "h"].filter((k) => p[k] !== undefined);
        if (placed.length > 0 && placed.length < 4) bad(pp, "x, y, w and h go together; give all four or none");
        else if (placed.length === 4) {
          if (!placed.every((k) => Number.isInteger(p[k]) && p[k] >= 0)) bad(pp, "x, y, w and h must be whole pixels, 0 or more");
          else if (p.w < 2 || p.h < 2 || p.x + p.w > frame.width || p.y + p.h > frame.height) bad(pp, `the placement must lie inside the ${frame.width}x${frame.height} frame`);
        }
      });
    if (scene.captions !== undefined) {
      if (!Array.isArray(scene.captions)) bad(`${sp}.captions`, "must be a list");
      else
        scene.captions.forEach((c, ci) => {
          const cp = `${sp}.captions[${ci}]`;
          if (!isObj(c) || !isStr(c.text)) return bad(cp, "needs a text");
          if (!isNum(c.from_s) || c.from_s < 0) bad(`${cp}.from_s`, "must be a number of seconds, 0 or more");
          if (c.to_s !== undefined && !(isNum(c.to_s) && isNum(c.from_s) && c.to_s > c.from_s)) bad(`${cp}.to_s`, "must be a number above from_s");
          if (isNum(c.from_s) && isNum(scene.duration_s) && c.from_s >= scene.duration_s) bad(`${cp}.from_s`, `starts after the scene ends (${scene.duration_s} s)`);
        });
    }
  });
  return errs;
}

// Fills the defaults and resolves every path against `baseDir`. Call after
// validateCut; it does not look at the disk.
export function normalizeCut(cut, baseDir) {
  const abs = (p) => resolve(baseDir, p);
  const theme = { ...DEFAULT_THEME, ...(cut.theme || {}) };
  theme.fonts = (theme.fonts || []).map((f) => ({ style: "normal", weight: "400", ...f, file: abs(f.file) }));
  const card = (c, seconds) => (c ? { mark: "", text: "", seconds, ...c } : null);
  return {
    out: abs(cut.out),
    size: { ...DEFAULT_SIZE, ...(cut.size || {}) },
    fps: cut.fps ?? DEFAULT_FPS,
    max_mb: cut.max_mb ?? null,
    chapters: cut.chapters ?? "scenes",
    theme,
    title: card(cut.title, 5),
    closing: card(cut.closing, 5),
    scenes: cut.scenes.map((s, i) => ({
      title: s.title || s.heading || `Scene ${i + 1}`,
      heading: s.heading || "",
      duration_s: s.duration_s,
      panels: s.panels.map((p) => ({ ...p, clip: abs(p.clip), offset_s: p.offset_s ?? 0, label: p.label || "" })),
      captions: (s.captions || []).map((c) => ({ ...c })),
    })),
  };
}

// ------------------------------------------------------------- layout

const even = (n) => Math.max(2, Math.floor(n / 2) * 2);

// Fits panels side by side into the frame, keeping each panel's aspect
// ratio. All panels get the same height. A panel is never shown larger than
// its recorded size (max_scale 1). `sources` is [{w, h}] in pixels.
// Returns [{x, y, w, h, label: {x, y, w, h}}] in the order given. Room is
// kept for a heading above (when `heading`), a label row (when `labels`) and
// a caption bar below.
export function layoutPanels(sources, opts = {}) {
  const frame = opts.frame || DEFAULT_SIZE;
  const k = frame.width / DEFAULT_SIZE.width;
  const gap = opts.gap ?? Math.round(28 * k);
  const side = opts.side ?? Math.round(40 * k);
  const top = opts.top ?? Math.round((opts.heading ? 120 : 40) * k);
  const bottom = opts.bottom ?? Math.round(130 * k);
  const labelH = opts.labels ? Math.round(52 * k) : 0;
  const maxScale = opts.max_scale ?? 1;
  const n = sources.length;
  const availW = frame.width - 2 * side - gap * (n - 1);
  const availH = frame.height - top - labelH - bottom;
  const aspects = sources.map((s) => s.w / s.h);
  const sumAspect = aspects.reduce((a, b) => a + b, 0);
  const h = even(Math.min(availH, availW / sumAspect, Math.min(...sources.map((s) => s.h)) * maxScale));
  const widths = aspects.map((a) => even(a * h));
  const total = widths.reduce((a, b) => a + b, 0) + gap * (n - 1);
  const y = top + labelH + Math.max(0, Math.floor((availH - h) / 2));
  let x = Math.floor((frame.width - total) / 2);
  return widths.map((w) => {
    const rect = { x, y, w, h, label: { x, y: y - labelH, w, h: labelH } };
    x += w + gap;
    return rect;
  });
}

// ------------------------------------------------------------ chapters

// The chapter list for report.json: the title card, each scene's start, the
// closing card. With chapters: "captions" every caption is a chapter too.
// Expects a normalized cut.
export function computeChapters(cut) {
  const r1 = (n) => Math.round(n * 10) / 10;
  const chapters = [];
  let t = 0;
  if (cut.title) {
    chapters.push({ at_s: 0, title: cut.title.heading });
    t += cut.title.seconds;
  }
  for (const scene of cut.scenes) {
    chapters.push({ at_s: r1(t), title: scene.title });
    if (cut.chapters === "captions") {
      for (const c of scene.captions) chapters.push({ at_s: r1(t + c.from_s), title: c.text });
    }
    t += scene.duration_s;
  }
  if (cut.closing) chapters.push({ at_s: r1(t), title: cut.closing.heading });
  return chapters;
}

export function totalSeconds(cut) {
  return (cut.title ? cut.title.seconds : 0) + cut.scenes.reduce((a, s) => a + s.duration_s, 0) + (cut.closing ? cut.closing.seconds : 0);
}

// Caption windows of one scene: each lasts until the next one starts, or
// the scene ends, unless it names its own to_s. Clipped to the scene.
export function captionWindows(scene) {
  const sorted = [...scene.captions].sort((a, b) => a.from_s - b.from_s);
  return sorted.map((c, i) => {
    const next = sorted[i + 1] ? sorted[i + 1].from_s : scene.duration_s;
    return { text: c.text, from_s: c.from_s, to_s: Math.min(scene.duration_s, c.to_s ?? next) };
  });
}

// ------------------------------------------------------------ ffmpeg

// The ffmpeg arguments that build one scene (without the encode arguments):
// the background picture, each clip cut at its offset, each caption picture,
// and one filter_complex that scales the clips, lays them on the background
// and switches each caption on for its window.
//   panels:   [{clip, offset_s, rect: {x, y, w, h}}]
//   captions: [{file, from_s, to_s}]
export function buildSceneArgs({ bg, panels, captions, duration_s, fps }) {
  const dur = duration_s.toFixed(3);
  const args = ["-loop", "1", "-framerate", String(fps), "-t", dur, "-i", bg];
  for (const p of panels) args.push("-ss", p.offset_s.toFixed(3), "-i", p.clip);
  for (const c of captions) args.push("-loop", "1", "-framerate", String(fps), "-t", dur, "-i", c.file);
  let graph = "";
  panels.forEach((p, i) => {
    // pad the last frame forever, so a clip that ends early holds its last picture
    graph += `[${i + 1}:v]setpts=PTS-STARTPTS,fps=${fps},tpad=stop_mode=clone:stop=-1,scale=${p.rect.w}:${p.rect.h}:flags=lanczos,setsar=1[p${i}];`;
  });
  let last = "0:v";
  panels.forEach((p, i) => {
    graph += `[${last}][p${i}]overlay=${p.rect.x}:${p.rect.y}:shortest=1[o${i}];`;
    last = `o${i}`;
  });
  captions.forEach((c, i) => {
    const idx = panels.length + 1 + i;
    graph += `[${last}][${idx}:v]overlay=0:0:enable='between(t,${c.from_s.toFixed(3)},${c.to_s.toFixed(3)})':shortest=1[c${i}];`;
    last = `c${i}`;
  });
  graph += `[${last}]format=yuv420p[out]`;
  return { graph, args: [...args, "-filter_complex", graph, "-map", "[out]", "-t", dur] };
}

// Picks the encoder from the text of `ffmpeg -encoders`. The wanted
// extension (.mp4 or .webm) decides the family; when its encoder is missing
// the other family is used and `changed_ext` is true. Throws when ffmpeg can
// encode neither H.264 nor VP8/VP9.
export function chooseCodec(encodersText, wantedExt) {
  const has = (name) => new RegExp(`\\s${name}\\s`).test(encodersText);
  const h264 = has("libx264")
    ? { name: "libx264", codec: "h264", ext: ".mp4", crf: 23, ladder: [28, 32, 36], extra: ["-preset", "medium", "-pix_fmt", "yuv420p"], faststart: true }
    : null;
  const webm = has("libvpx-vp9")
    ? { name: "libvpx-vp9", codec: "vp9", ext: ".webm", crf: 33, ladder: [38, 43, 48], extra: ["-b:v", "0", "-pix_fmt", "yuv420p"], faststart: false }
    : has("libvpx")
      ? { name: "libvpx", codec: "vp8", ext: ".webm", crf: 10, ladder: [16, 22, 28], extra: ["-b:v", "2M", "-pix_fmt", "yuv420p"], faststart: false }
      : null;
  const order = wantedExt === ".webm" ? [webm, h264] : [h264, webm];
  const pick = order.find(Boolean);
  if (!pick) {
    throw new Error("this ffmpeg can encode neither H.264 (libx264) nor VP8/VP9 (libvpx); install a full ffmpeg, for example `brew install ffmpeg`");
  }
  return { ...pick, changed_ext: pick.ext !== wantedExt };
}

// The fixed encode arguments, for one crf.
export function encodeArgs(codec, fps, crf = codec.crf) {
  const args = ["-c:v", codec.name, "-crf", String(crf), ...codec.extra, "-r", String(fps), "-an"];
  if (codec.faststart) args.push("-video_track_timescale", "12800");
  return args;
}

// ffmpeg on PATH, else the ffmpeg Playwright installs in its browser cache.
export function findFfmpeg(env = process.env) {
  const names = process.platform === "win32" ? ["ffmpeg.exe"] : ["ffmpeg"];
  for (const dir of (env.PATH || "").split(delimiter).filter(Boolean)) {
    for (const n of names) if (existsSync(join(dir, n))) return join(dir, n);
  }
  const caches = [
    env.PLAYWRIGHT_BROWSERS_PATH && env.PLAYWRIGHT_BROWSERS_PATH !== "0" ? env.PLAYWRIGHT_BROWSERS_PATH : null,
    join(homedir(), "Library", "Caches", "ms-playwright"),
    join(homedir(), ".cache", "ms-playwright"),
    env.LOCALAPPDATA ? join(env.LOCALAPPDATA, "ms-playwright") : null,
  ].filter(Boolean);
  for (const cache of caches) {
    if (!existsSync(cache)) continue;
    const dirs = readdirSync(cache).filter((d) => d.startsWith("ffmpeg-")).sort().reverse();
    for (const d of dirs) {
      const file = readdirSync(join(cache, d)).find((f) => f.startsWith("ffmpeg") && !f.endsWith(".txt"));
      if (file) return join(cache, d, file);
    }
  }
  return null;
}

function lastLines(text, n = 6) {
  return String(text || "").trim().split("\n").slice(-n).join("\n");
}

function ff(ffmpeg, args) {
  const r = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw new Error(`ffmpeg could not be started (${r.error.message})`);
  if (r.status !== 0) throw new Error(`ffmpeg failed:\n${lastLines(r.stderr)}`);
}

// `ffmpeg -i <file>` prints the streams on stderr and exits 1; read them.
// Playwright's ffmpeg has no ffprobe, so this is the one probe used.
export function parseProbe(stderr) {
  const dur = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  const size = /Stream #[^\n]*Video:[^\n]*?,\s*(\d{2,5})x(\d{2,5})/.exec(stderr);
  return {
    duration_s: dur ? Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]) : null,
    width: size ? Number(size[1]) : null,
    height: size ? Number(size[2]) : null,
  };
}

function probe(ffmpeg, file) {
  const r = spawnSync(ffmpeg, ["-hide_banner", "-i", file], { encoding: "utf8" });
  return parseProbe(r.stderr || "");
}

// ----------------------------------------------------------- the cards

const escHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const FONT_MIME = { ".woff2": ["font/woff2", "woff2"], ".woff": ["font/woff", "woff"], ".ttf": ["font/ttf", "truetype"], ".otf": ["font/otf", "opentype"] };

// @font-face rules with the font files embedded as base64.
export function fontFaceCss(fonts, readFile = (f) => readFileSync(f)) {
  return fonts
    .map((f) => {
      const [mime, format] = FONT_MIME[extname(f.file).toLowerCase()] || FONT_MIME[".ttf"];
      return `@font-face{font-family:"${f.family}";font-style:${f.style};font-weight:${f.weight};src:url(data:${mime};base64,${readFile(f.file).toString("base64")}) format("${format}")}`;
    })
    .join("");
}

// The HTML of a heading-and-labels background (a scene) with no panels yet.
export function sceneBgHtml(theme, size, heading, labels) {
  const k = size.width / DEFAULT_SIZE.width;
  const px = (n) => Math.round(n * k);
  const lab = labels
    .filter((l) => l.text)
    .map((l) => `<div class="lab" style="left:${l.rect.x}px;top:${l.rect.y}px;width:${l.rect.w}px;height:${l.rect.h}px">${escHtml(l.text)}</div>`)
    .join("");
  return `<style>body{margin:0;width:${size.width}px;height:${size.height}px;background:${theme.background};font-family:${theme.font};position:relative;overflow:hidden}
.head{position:absolute;top:${px(14)}px;width:100%;text-align:center;font-size:${px(50)}px;font-family:${theme.heading_font};color:${theme.ink}}
.lab{position:absolute;display:flex;align-items:center;justify-content:center;font-size:${px(30)}px;font-weight:600;color:${theme.ink}}</style>${heading ? `<div class="head">${escHtml(heading)}</div>` : ""}${lab}`;
}

// The HTML of the title card or the closing card.
export function cardHtml(theme, size, card) {
  const k = size.width / DEFAULT_SIZE.width;
  const px = (n) => Math.round(n * k);
  return `<style>body{margin:0;width:${size.width}px;height:${size.height}px;background:${theme.background};color:${theme.ink};font-family:${theme.font};display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
h1{font-size:${px(92)}px;margin:0 ${px(80)}px ${px(24)}px;font-weight:400;font-family:${theme.heading_font}}
p{font-size:${px(38)}px;margin:${px(8)}px ${px(80)}px;color:${theme.muted}}
.bar{width:${px(160)}px;height:${px(6)}px;background:${theme.accent};margin:${px(28)}px 0}
.mark{font-size:${px(30)}px;letter-spacing:.3em;font-weight:700;color:${theme.accent};margin-bottom:${px(6)}px}</style>${card.mark ? `<div class="mark">${escHtml(card.mark)}</div>` : ""}<h1>${escHtml(card.heading)}</h1><div class="bar"></div>${card.text ? `<p>${escHtml(card.text)}</p>` : ""}`;
}

// The HTML of one caption, on a transparent page.
export function captionHtml(theme, size, text) {
  const k = size.width / DEFAULT_SIZE.width;
  const px = (n) => Math.round(n * k);
  return `<style>body{margin:0;width:${size.width}px;height:${size.height}px;background:transparent;font-family:${theme.font};position:relative}
.cap{position:absolute;left:50%;transform:translateX(-50%);bottom:${px(22)}px;max-width:${size.width - px(120)}px;background:${theme.background};color:${theme.ink};border:${px(2)}px solid ${theme.accent};border-radius:${px(20)}px;padding:${px(14)}px ${px(36)}px;font-size:${px(36)}px;font-weight:600;line-height:1.25;text-align:center}</style><div class="cap">${escHtml(text)}</div>`;
}

// Playwright's chromium launcher, resolved from the project, or null.
export function loadChromium(projectRoot) {
  const require = createRequire(join(projectRoot, "package.json"));
  for (const name of ["playwright", "playwright-core", "@playwright/test"]) {
    try {
      const mod = require(name);
      if (mod && mod.chromium) return mod.chromium;
    } catch {
      // try the next package
    }
  }
  return null;
}

// ------------------------------------------------------------ compose

// Composes the video for a cut file. Returns the result object; throws an
// Error with a one-line-first message on any failure. Removes its temp folder.
export async function composeVideo(cutPath, opts = {}) {
  const cutFile = resolve(cutPath);
  if (!existsSync(cutFile)) throw new Error(`cut file not found: ${cutFile}`);
  let raw;
  try {
    raw = JSON.parse(readFileSync(cutFile, "utf8"));
  } catch (err) {
    throw new Error(`${cutFile} is not valid JSON (${err.message})`);
  }
  const problems = validateCut(raw);
  if (problems.length) throw new Error(`the cut file is not valid:\n  ${problems.join("\n  ")}`);
  const baseDir = dirname(cutFile);
  const cut = normalizeCut(raw, baseDir);
  for (const scene of cut.scenes) {
    for (const p of scene.panels) if (!existsSync(p.clip)) throw new Error(`clip not found: ${p.clip}`);
  }
  for (const f of cut.theme.fonts) if (!existsSync(f.file)) throw new Error(`font file not found: ${f.file}`);

  const ffmpeg = opts.ffmpeg || findFfmpeg();
  if (!ffmpeg) throw new Error("ffmpeg not found on PATH or in the Playwright cache; install it (`brew install ffmpeg`) or run `npx playwright install ffmpeg`");
  const enc = spawnSync(ffmpeg, ["-hide_banner", "-encoders"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  const dec = spawnSync(ffmpeg, ["-hide_banner", "-decoders"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (!/\spng\s/.test(dec.stdout || "")) {
    throw new Error(`the ffmpeg at ${ffmpeg} cannot read PNG pictures (the small copy Playwright installs lacks the decoder), so it cannot lay cards and captions over clips; install a full ffmpeg, for example \`brew install ffmpeg\``);
  }
  const codec = chooseCodec(enc.stdout || "", extname(cut.out).toLowerCase());
  const warnings = [];
  let outFile = cut.out;
  if (codec.changed_ext) {
    outFile = cut.out.slice(0, cut.out.length - extname(cut.out).length) + codec.ext;
    warnings.push(`this ffmpeg has no encoder for ${extname(cut.out)}; the video is ${codec.codec} in ${codec.ext}`);
  }

  const projectRoot = opts.projectRoot || (() => { try { return findProjectRoot(baseDir); } catch { return baseDir; } })();
  const chromium = opts.chromium || loadChromium(projectRoot);
  if (!chromium) throw new Error(`Playwright is not installed in the project (${projectRoot}); the cards and captions need Chromium. Run: npm i -D @playwright/test && npx playwright install chromium`);

  const tmp = mkdtempSync(join(tmpdir(), "compose-video-"));
  try {
    const { size, fps, theme } = cut;
    // sizes of the clips, from the cut or from ffmpeg
    const sizeOf = new Map();
    const clipSize = (p) => {
      if (p.view) return { w: p.view.width, h: p.view.height };
      if (!sizeOf.has(p.clip)) {
        const pr = probe(ffmpeg, p.clip);
        if (!pr.width) throw new Error(`ffmpeg could not read the size of ${p.clip}`);
        sizeOf.set(p.clip, { w: pr.width, h: pr.height });
      }
      return sizeOf.get(p.clip);
    };

    // ----- pictures
    const css = `<style>${fontFaceCss(theme.fonts)}</style>`;
    let browser;
    try {
      browser = await chromium.launch();
    } catch (err) {
      throw new Error(`Chromium could not be started (${String(err.message).split("\n")[0]}); run: npx playwright install chromium`);
    }
    const plans = [];
    try {
      const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height } });
      const page = await ctx.newPage();
      const shot = async (html, file, transparent = false) => {
        await page.setContent(css + html);
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({ path: file, omitBackground: transparent });
      };
      const cards = [];
      if (cut.title) cards.push(["title", cut.title]);
      if (cut.closing) cards.push(["closing", cut.closing]);
      for (const [name, card] of cards) await shot(cardHtml(theme, size, card), join(tmp, `${name}.png`));
      for (const [si, scene] of cut.scenes.entries()) {
        const auto = scene.panels.every((p) => p.x === undefined);
        const sources = scene.panels.map(clipSize);
        const rects = auto
          ? layoutPanels(sources, { frame: size, heading: !!scene.heading, labels: scene.panels.some((p) => p.label) })
          : scene.panels.map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h, label: { x: p.x, y: Math.max(0, p.y - 52), w: p.w, h: 52 } }));
        const bg = join(tmp, `scene-${si}-bg.png`);
        await shot(sceneBgHtml(theme, size, scene.heading, scene.panels.map((p, i) => ({ text: p.label, rect: rects[i].label }))), bg);
        const captions = [];
        for (const [ci, w] of captionWindows(scene).entries()) {
          const file = join(tmp, `scene-${si}-cap-${ci}.png`);
          await shot(captionHtml(theme, size, w.text), file, true);
          captions.push({ file, from_s: w.from_s, to_s: w.to_s });
        }
        plans.push({ bg, rects, captions });
      }
      await ctx.close();
    } finally {
      await browser.close().catch(() => {});
    }

    // ----- segments
    const encode = (crf) => encodeArgs(codec, fps, crf);
    const segments = [];
    const seg = (name) => {
      const f = join(tmp, `${name}${codec.ext}`);
      segments.push(f);
      return f;
    };
    const cardSegment = (name, card) =>
      ff(ffmpeg, ["-loop", "1", "-framerate", String(fps), "-t", String(card.seconds), "-i", join(tmp, `${name}.png`), "-vf", `scale=${size.width}:${size.height},format=yuv420p`, ...encode(codec.crf), seg(name)]);
    if (cut.title) cardSegment("title", cut.title);
    cut.scenes.forEach((scene, si) => {
      const plan = plans[si];
      const { args } = buildSceneArgs({
        bg: plan.bg,
        panels: scene.panels.map((p, i) => ({ clip: p.clip, offset_s: p.offset_s, rect: plan.rects[i] })),
        captions: plan.captions,
        duration_s: scene.duration_s,
        fps,
      });
      ff(ffmpeg, [...args, ...encode(codec.crf), seg(`scene-${si}`)]);
    });
    if (cut.closing) cardSegment("closing", cut.closing);

    // ----- join
    const list = join(tmp, "list.txt");
    writeFileSync(list, segments.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n") + "\n");
    const joined = join(tmp, `joined${codec.ext}`);
    ff(ffmpeg, ["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", ...(codec.faststart ? ["-movflags", "+faststart"] : []), joined]);

    // ----- size cap: re-encode the joined file at a higher crf, step by step
    let crf = codec.crf;
    const mb = (f) => statSync(f).size / 1048576;
    if (cut.max_mb) {
      for (const step of codec.ladder) {
        if (mb(joined) <= cut.max_mb) break;
        const again = join(tmp, `again-${step}${codec.ext}`);
        ff(ffmpeg, ["-i", joined, ...encode(step), ...(codec.faststart ? ["-movflags", "+faststart"] : []), again]);
        renameSync(again, joined);
        crf = step;
      }
      if (mb(joined) > cut.max_mb) {
        warnings.push(`the video is ${mb(joined).toFixed(1)} MB, over max_mb ${cut.max_mb}, even at crf ${crf}; shorten the story or use fewer panels`);
      }
    }

    mkdirSync(dirname(outFile), { recursive: true });
    renameOrCopy(joined, outFile);
    const info = probe(ffmpeg, outFile);
    const result = {
      file: outFile,
      duration_s: Math.round((info.duration_s ?? totalSeconds(cut)) * 10) / 10,
      size_mb: Math.round(mb(outFile) * 100) / 100,
      codec: codec.codec,
      crf,
      chapters: computeChapters(cut),
    };
    if (warnings.length) result.warnings = warnings;
    return result;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function renameOrCopy(from, to) {
  try {
    renameSync(from, to);
  } catch {
    // another file system: copy instead
    copyFileSync(from, to);
  }
}

// ---------------------------------------------------------------- CLI

function usage() {
  console.error("usage: node compose-video.mjs <cut.json> [--project <root>]");
  process.exit(2);
}

async function main() {
  const args = process.argv.slice(2);
  let cutPath = null;
  let projectArg = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--project") {
      projectArg = args[++i];
      if (!projectArg) usage();
    } else if (args[i].startsWith("-")) usage();
    else if (!cutPath) cutPath = args[i];
    else usage();
  }
  if (!cutPath) usage();
  const result = await composeVideo(cutPath, { projectRoot: projectArg ? resolve(projectArg) : undefined });
  console.log(JSON.stringify(result, null, 2));
  for (const w of result.warnings || []) console.error(`warning: ${w}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(`compose-video: ${err.message}`);
    process.exit(1);
  });
}
