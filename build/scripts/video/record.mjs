// record.mjs — helpers for the recording side of a walkthrough video. The
// project's own story script imports it (from a .mjs or, through tsx, a .ts
// file), drives the app with Playwright, and gets a cut.json for
// compose-video.mjs. Node ESM, Node built-ins only; Playwright is resolved
// from the PROJECT, as compose-video.mjs does.
//
//   import { runStory, DEVICES } from "../.claude/skills/build/scripts/video/record.mjs";
//
// What it keeps for you:
//   - one recorded browser context per role, sized like its device
//   - a wall clock: say(text) logs when each caption starts
//   - pause(ms) and typing delays that wait only while recording
//   - the warm-up pass (nothing recorded, nothing captured), then the
//     recorded pass, from the one story function you write
//   - writeCut(): the cut.json, from the clips and captions it recorded

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { loadChromium } from "./compose-video.mjs";

// Browser context options per device. A clip is recorded at its viewport size.
export const DEVICES = {
  desktop: { viewport: { width: 1280, height: 800 } },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  monitor: { viewport: { width: 1280, height: 920 } },
};

export const TYPE_DELAY_MS = 70;
// The screenshot sizes of a project's Conventions (`screenshots:` line).
export const DEFAULT_SIZES = ["1280x800", "390x844"];
// Playwright starts a clip a moment before the page shows anything, and the
// last moment of a scene is the close of a context; both ends are trimmed.
const LEAD_MS = 400;
const TAIL_MS = 200;

// A story is the object your play function receives. `recording` is false in
// the warm-up pass: no video, no captions, no pauses, no screenshots.
export function createStory({ browser, workDir, recording }) {
  const clips = new Map();
  const events = [];
  const scenes = [];
  let current = null;

  const story = {
    recording,
    browser,
    workDir,

    // A new browser context, recorded when this is the recorded pass.
    // `device` is a DEVICES name or a context-options object with a viewport.
    // Other options (baseURL, storageState, ...) go in `options`; `label` is
    // the text shown above the clip in the video.
    async open(name, device = "desktop", options = {}) {
      const { label = "", ...contextOptions } = options;
      const preset = typeof device === "string" ? DEVICES[device] : device;
      if (!preset || !preset.viewport) throw new Error(`open("${name}"): unknown device "${device}"; use ${Object.keys(DEVICES).join(", ")} or an object with a viewport`);
      if (clips.has(name)) throw new Error(`open("${name}"): a clip of that name is already open`);
      const dir = join(workDir, "clips", name);
      const ctx = await browser.newContext({
        ...preset,
        ...(recording ? { recordVideo: { dir, size: preset.viewport } } : {}),
        ...contextOptions,
      });
      const startedAt = Date.now();
      const page = await ctx.newPage();
      const clip = { name, label, ctx, page, startedAt, view: preset.viewport, file: null, closed: false };
      clips.set(name, clip);
      return clip;
    },

    // Closes a context. The video file exists once this returns.
    async close(clip) {
      if (clip.closed) return;
      clip.closed = true;
      const video = recording ? clip.page.video() : null;
      await clip.ctx.close();
      if (video) clip.file = await video.path();
    },

    async closeAll() {
      for (const clip of clips.values()) await story.close(clip);
    },

    // Scenes cut the story into parts. `panels` lists the clips shown side by
    // side: a clip name, or { clip, label }. Call endScene() when it is over.
    scene({ title, heading = "", panels }) {
      if (!recording) return;
      if (current) throw new Error(`scene("${title}"): the scene "${current.title}" is still open; call endScene() first`);
      current = { title, heading, panels, start: Date.now(), end: null };
      scenes.push(current);
    },
    endScene() {
      if (!recording) return;
      if (!current) throw new Error("endScene(): no scene is open");
      current.end = Date.now();
      current = null;
    },

    // A caption starts now and lasts until the next say(). say(null) clears it.
    say(text) {
      if (recording) events.push({ t: Date.now(), text });
    },

    // Waits only while recording, so the warm-up runs at full speed.
    pause(ms) {
      return recording ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
    },

    // Clicks the field, clears it and types like a person.
    async type(locator, text) {
      await locator.click();
      await locator.fill("");
      await locator.pressSequentially(text, { delay: recording ? TYPE_DELAY_MS : 0 });
    },

    // The report's screenshots go through here: taken in the recorded pass
    // only, so one pass makes both the video and the pictures. `file` is the
    // name without extension (for example "walkthrough-01-menu"). One PNG is
    // written per size, as <dir>/<file>-<WxH>.png. The size equal to the
    // page's own viewport is the page itself. Every other size is shot from a
    // throwaway context, not filmed, that has the role's storage state and
    // opens the page's current URL; so only what a URL reproduces shows there.
    // Returns { file, sizes } for report.json's screenshots[], or null in
    // the warm-up.
    async shot(page, file, { sizes = DEFAULT_SIZES, dir = join("validation", "screenshots") } = {}) {
      if (!recording) return null;
      mkdirSync(resolve(dir), { recursive: true });
      const own = page.viewportSize();
      const ownKey = own ? `${own.width}x${own.height}` : "";
      let side = null;
      for (const size of sizes) {
        const out = join(dir, `${file}-${size}.png`);
        if (size === ownKey) {
          await page.screenshot({ path: out });
          continue;
        }
        const [width, height] = size.split("x").map(Number);
        if (!width || !height) throw new Error(`shot(): the size "${size}" must look like 1280x800`);
        side = side || { state: await page.context().storageState(), url: page.url() };
        const extra = width < 600 ? { isMobile: true, hasTouch: true } : {};
        const ctx = await browser.newContext({ viewport: { width, height }, storageState: side.state, ...extra });
        try {
          const other = await ctx.newPage();
          await other.goto(side.url, { waitUntil: "load" });
          await other.waitForLoadState("networkidle").catch(() => {});
          await other.screenshot({ path: out });
        } finally {
          await ctx.close();
        }
      }
      return { file, sizes: [...sizes] };
    },

    // Writes the cut file for compose-video.mjs and returns its object.
    // `extra`: out, title, closing, theme, max_mb, size, chapters (see build/video.md).
    async writeCut(file, extra = {}) {
      if (current) throw new Error(`writeCut(): the scene "${current.title}" was never ended`);
      await story.closeAll();
      const base = dirname(resolve(file));
      const rel = (p) => relative(base, p).split("\\").join("/");
      const cut = { ...extra, scenes: [] };
      for (const sc of scenes) {
        const panels = sc.panels.map((p) => {
          const name = typeof p === "string" ? p : p.clip;
          const clip = clips.get(name);
          if (!clip) throw new Error(`scene "${sc.title}": there is no clip "${name}"; open it with open("${name}", ...)`);
          return { clip, label: (typeof p === "object" && p.label) || clip.label };
        });
        // all clips of a scene must have started, and their first moments show nothing
        const start = Math.max(sc.start, ...panels.map((p) => p.clip.startedAt + LEAD_MS));
        const end = sc.end - TAIL_MS;
        if (end - start < 500) throw new Error(`scene "${sc.title}" is too short (${end - start} ms) after trimming; keep a scene longer than a second`);
        const inScene = events.filter((e) => e.t >= sc.start && e.t < sc.end);
        const captions = [];
        inScene.forEach((e, i) => {
          if (e.text === null) return;
          const next = inScene[i + 1] ? inScene[i + 1].t : end;
          const from = Math.max(0, (e.t - start) / 1000);
          const to = Math.min(end, next) - start;
          if (to / 1000 > from + 0.05) captions.push({ text: e.text, from_s: round3(from), to_s: round3(to / 1000) });
        });
        cut.scenes.push({
          title: sc.title,
          heading: sc.heading,
          duration_s: round3((end - start) / 1000),
          panels: panels.map(({ clip, label }) => ({
            clip: rel(clip.file),
            offset_s: round3((start - clip.startedAt) / 1000),
            label,
            view: clip.view,
          })),
          captions,
        });
      }
      writeFileSync(file, JSON.stringify(cut, null, 2) + "\n");
      return cut;
    },
  };
  return story;
}

const round3 = (n) => Math.round(n * 1000) / 1000;

// Runs `play(story)` twice: a silent warm-up (so a dev server compiles every
// route before the camera runs), then, after `cleanSlate()`, the recorded
// pass. Returns the recorded story; call its writeCut() afterwards.
//   projectRoot  the project (Playwright is resolved from there)
//   workDir      a scratch folder for the clips (emptied first)
//   play         async (story) => void — your story
//   cleanSlate   async () => void — resets the test database and asserts it
//                is empty; called between the two passes
//   warmUp       false: skip the warm-up pass (default true)
//   chromium     a Playwright chromium launcher, instead of the project's
export async function runStory({ projectRoot, workDir, play, cleanSlate, warmUp = true, chromium }) {
  const launcher = chromium || loadChromium(projectRoot);
  if (!launcher) throw new Error(`Playwright is not installed in the project (${projectRoot}); run: npm i -D @playwright/test && npx playwright install chromium`);
  rmSync(join(workDir, "clips"), { recursive: true, force: true });
  mkdirSync(workDir, { recursive: true });
  const browser = await launcher.launch();
  try {
    if (warmUp) {
      const warm = createStory({ browser, workDir, recording: false });
      await play(warm);
      if (cleanSlate) await cleanSlate();
    }
    const story = createStory({ browser, workDir, recording: true });
    await play(story);
    await story.closeAll();
    return story;
  } finally {
    await browser.close().catch(() => {});
  }
}
