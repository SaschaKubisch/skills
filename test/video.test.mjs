#!/usr/bin/env node
// test/video.test.mjs — exercises build/scripts/video/compose-video.mjs and
// record.mjs. The pure parts (cut validation, layout, filter graph,
// chapters, codec choice, HTML cards) run anywhere. The integration test
// composes a real video; it needs ffmpeg and a project with Playwright
// installed, named by VIDEO_TEST_PROJECT, and prints SKIP without them.
// Run by test/run.sh; exits 1 on any failure.

import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { createServer } from "node:http";
import { readdirSync } from "node:fs";
import {
  validateCut,
  normalizeCut,
  layoutPanels,
  computeChapters,
  totalSeconds,
  captionWindows,
  buildSceneArgs,
  chooseCodec,
  encodeArgs,
  parseProbe,
  cardHtml,
  captionHtml,
  sceneBgHtml,
  fontFaceCss,
  findFfmpeg,
  loadChromium,
} from "../build/scripts/video/compose-video.mjs";
import { createStory, runStory } from "../build/scripts/video/record.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const composeScript = join(here, "..", "build", "scripts", "video", "compose-video.mjs");

let fail = 0;
function check(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    fail = 1;
  }
}
const has = (errs, text) => errs.some((e) => e.includes(text));

const goodCut = () => ({
  out: "walkthrough.mp4",
  title: { heading: "A visit", text: "Three screens" },
  closing: { heading: "Done" },
  scenes: [
    { title: "Intro", heading: "The owner", duration_s: 10, panels: [{ clip: "a.webm", label: "Owner" }], captions: [{ text: "Signs in", from_s: 1 }, { text: "Adds menu", from_s: 4, to_s: 6 }] },
    { title: "Visit", duration_s: 20, panels: [{ clip: "a.webm", offset_s: 2 }, { clip: "b.webm" }] },
  ],
});

// ---- validateCut
check(validateCut(goodCut()).length === 0, `a good cut should validate; got ${validateCut(goodCut())}`);
check(has(validateCut(null), "must be a JSON object"), "null is not a cut");
{
  const c = goodCut();
  delete c.out;
  check(has(validateCut(c), "out:"), "a missing out is named");
  c.out = "x.avi";
  check(has(validateCut(c), "out: must end in"), "a bad extension is named");
}
{
  const c = goodCut();
  c.scenes = [];
  check(has(validateCut(c), "scenes:"), "no scenes is refused");
}
{
  const c = goodCut();
  c.scenes[0].duration_s = 0;
  c.scenes[1].panels = [];
  const errs = validateCut(c);
  check(has(errs, "scenes[0].duration_s"), "a zero duration is named with its path");
  check(has(errs, "scenes[1].panels"), "an empty panel list is named with its path");
}
{
  const c = goodCut();
  c.scenes[0].panels[0].x = 10;
  check(has(validateCut(c), "give all four or none"), "a half placement is refused");
  c.scenes[0].panels[0] = { clip: "a.webm", x: 1800, y: 0, w: 400, h: 300 };
  check(has(validateCut(c), "inside the 1920x1080 frame"), "a placement outside the frame is refused");
  c.scenes[0].panels[0] = { clip: "a.webm", x: 100, y: 100, w: 400, h: 300 };
  check(validateCut(c).length === 0, "a full placement inside the frame is fine");
}
{
  const c = goodCut();
  c.scenes[0].captions = [{ text: "x", from_s: 2, to_s: 1 }, { text: "late", from_s: 99 }, { from_s: 1 }];
  const errs = validateCut(c);
  check(has(errs, "captions[0].to_s"), "to_s before from_s is refused");
  check(has(errs, "captions[1].from_s"), "a caption after the scene end is refused");
  check(has(errs, "captions[2]"), "a caption without text is refused");
}
{
  const c = goodCut();
  c.size = { width: 1921, height: 1080 };
  c.max_mb = -1;
  c.chapters = "all";
  c.title.seconds = 0;
  const errs = validateCut(c);
  check(has(errs, "size:"), "an odd frame width is refused");
  check(has(errs, "max_mb"), "a negative max_mb is refused");
  check(has(errs, "chapters"), "an unknown chapters mode is refused");
  check(has(errs, "title.seconds"), "a zero card time is refused");
}

// ---- normalizeCut, chapters
const norm = normalizeCut(goodCut(), "/base/dir");
check(norm.out === "/base/dir/walkthrough.mp4", "out is resolved against the cut's folder");
check(norm.scenes[0].panels[0].clip === "/base/dir/a.webm" && norm.scenes[0].panels[0].offset_s === 0, "clips are resolved and offsets default to 0");
check(norm.size.width === 1920 && norm.fps === 25 && norm.title.seconds === 5, "defaults: 1920x1080, 25 fps, 5 s cards");
check(norm.scenes[1].title === "Visit" && normalizeCut({ ...goodCut(), scenes: [{ duration_s: 3, panels: [{ clip: "a" }] }] }, "/b").scenes[0].title === "Scene 1", "a scene title falls back to the heading, then to Scene n");
check(totalSeconds(norm) === 40, `total seconds should be 40; got ${totalSeconds(norm)}`);
{
  const ch = computeChapters(norm);
  check(JSON.stringify(ch) === JSON.stringify([
    { at_s: 0, title: "A visit" },
    { at_s: 5, title: "Intro" },
    { at_s: 15, title: "Visit" },
    { at_s: 35, title: "Done" },
  ]), `scene chapters wrong: ${JSON.stringify(ch)}`);
  const withCaptions = computeChapters({ ...norm, chapters: "captions" });
  check(withCaptions.some((c) => c.at_s === 6 && c.title === "Signs in") && withCaptions.some((c) => c.at_s === 9 && c.title === "Adds menu"), `caption chapters wrong: ${JSON.stringify(withCaptions)}`);
  const noCards = computeChapters({ ...norm, title: null, closing: null });
  check(noCards.length === 2 && noCards[0].at_s === 0 && noCards[1].at_s === 10, "without cards the first scene starts at 0");
}
{
  const w = captionWindows(norm.scenes[0]);
  check(w.length === 2 && w[0].to_s === 4 && w[1].from_s === 4 && w[1].to_s === 6, `a caption lasts until the next one; got ${JSON.stringify(w)}`);
  const last = captionWindows({ duration_s: 8, captions: [{ text: "a", from_s: 1 }] });
  check(last[0].to_s === 8, "the last caption lasts to the scene's end");
  const clip = captionWindows({ duration_s: 8, captions: [{ text: "a", from_s: 1, to_s: 12 }] });
  check(clip[0].to_s === 8, "a caption is clipped to the scene");
}

// ---- layoutPanels
{
  const frame = { width: 1920, height: 1080 };
  const one = layoutPanels([{ w: 1440, h: 810 }], { frame, heading: true, labels: true });
  check(one[0].w === 1440 || one[0].w < 1440, "a single clip is not enlarged");
  check(Math.abs(one[0].w / one[0].h - 1440 / 810) < 0.01, "the aspect ratio is kept (one panel)");
  check(one[0].x >= 0 && one[0].x + one[0].w <= 1920 && one[0].y + one[0].h <= 1080, "a single panel lies inside the frame");
  const three = layoutPanels([{ w: 390, h: 844 }, { w: 1280, h: 920 }, { w: 390, h: 844 }], { frame, heading: true, labels: true });
  check(three.every((r) => r.w % 2 === 0 && r.h % 2 === 0), "sizes are even");
  check(three.every((r) => r.h === three[0].h), "panels share one height");
  check(three[0].x + three[0].w < three[1].x && three[1].x + three[1].w < three[2].x, "panels do not overlap and keep their order");
  check(three[2].x + three[2].w <= 1920 && three[0].x >= 0, "the row fits the frame");
  check(Math.abs(three[1].w / three[1].h - 1280 / 920) < 0.02, "the aspect ratio is kept (three panels)");
  const bottomEdge = three[0].y + three[0].h;
  check(bottomEdge <= 1080 - 100, "room is left under the panels for the caption bar");
  check(three[0].label.y + three[0].label.h === three[0].y && three[0].label.w === three[0].w, "the label sits right above its panel");
  const small = layoutPanels([{ w: 300, h: 200 }], { frame, heading: false, labels: false });
  check(small[0].w === 300 && small[0].h === 200, "a small clip stays at its own size");
  const other = layoutPanels([{ w: 800, h: 600 }, { w: 800, h: 600 }], { frame: { width: 1280, height: 720 }, heading: true, labels: true });
  check(other[1].x + other[1].w <= 1280 && other[0].y + other[0].h <= 720, "a smaller frame is honoured");
}

// ---- buildSceneArgs
{
  const { graph, args } = buildSceneArgs({
    bg: "/t/bg.png",
    panels: [
      { clip: "/c/a.webm", offset_s: 1.5, rect: { x: 10, y: 20, w: 400, h: 300 } },
      { clip: "/c/b.webm", offset_s: 0, rect: { x: 500, y: 20, w: 200, h: 300 } },
    ],
    captions: [{ file: "/t/cap0.png", from_s: 0.5, to_s: 3 }],
    duration_s: 8,
    fps: 25,
  });
  check(args[0] === "-loop" && args.includes("/t/bg.png"), "the background is the first, looped input");
  const ss = args.indexOf("-ss");
  check(args[ss + 1] === "1.500" && args[ss + 3] === "/c/a.webm", "each clip is cut at its offset by -ss before its -i");
  check(args.filter((a) => a === "-i").length === 4, "one input per background, clip and caption");
  check(graph.includes("[1:v]") && graph.includes("scale=400:300:flags=lanczos") && graph.includes("fps=25"), "the first clip is scaled and set to the frame rate");
  check(graph.includes("overlay=10:20") && graph.includes("overlay=500:20"), "each panel is placed at its position");
  check(graph.includes("[3:v]") && graph.includes("enable='between(t,0.500,3.000)'"), "the caption is switched on for its window");
  check(graph.endsWith("[out]") && args.includes("[out]") && args.includes("-filter_complex"), "the graph ends in [out], which is mapped");
  check(args[args.indexOf("-t", args.indexOf("-map")) + 1] === "8.000", "the scene length is set on the output");
  check(graph.includes("tpad=stop_mode=clone"), "a short clip holds its last frame");
}

// ---- chooseCodec, encodeArgs, parseProbe, findFfmpeg
{
  const full = " V....D libx264 H.264\n V....D libvpx VP8\n V....D libvpx-vp9 VP9\n";
  const c = chooseCodec(full, ".mp4");
  check(c.name === "libx264" && !c.changed_ext, "libx264 is chosen for .mp4");
  check(chooseCodec(full, ".webm").name === "libvpx-vp9", "VP9 is chosen for .webm");
  const vpxOnly = chooseCodec(" V....D libvpx VP8\n", ".mp4");
  check(vpxOnly.name === "libvpx" && vpxOnly.changed_ext && vpxOnly.ext === ".webm", "without libx264 an .mp4 request falls back to VP8 in .webm");
  let threw = false;
  try {
    chooseCodec(" V....D mpeg4 MPEG-4\n", ".mp4");
  } catch (e) {
    threw = /libx264/.test(e.message);
  }
  check(threw, "no usable encoder fails with a clear message");
  const enc = encodeArgs(c, 25).join(" ");
  check(enc === "-c:v libx264 -crf 23 -preset medium -pix_fmt yuv420p -r 25 -an -video_track_timescale 12800", `the fixed encode arguments changed: ${enc}`);
  check(encodeArgs(c, 25, 30).includes("30"), "the crf can be raised");
  const probe = parseProbe("  Duration: 00:01:02.50, start: 0.0\n  Stream #0:0: Video: vp8, yuv420p, 1440x810, SAR 1:1, 25 fps\n");
  check(probe.duration_s === 62.5 && probe.width === 1440 && probe.height === 810, `parseProbe: ${JSON.stringify(probe)}`);
  check(findFfmpeg({ PATH: "/nonexistent", HOME: "/nonexistent" }) === null || typeof findFfmpeg({ PATH: "/nonexistent" }) === "string", "findFfmpeg returns a path or null");
  check(loadChromium(join(tmpdir(), "no-such-project")) === null, "loadChromium returns null when the project has no Playwright");
}

// ---- HTML builders
{
  const theme = normalizeCut(goodCut(), "/b").theme;
  const size = { width: 1920, height: 1080 };
  const html = cardHtml(theme, size, { mark: "M", heading: "<b>&", text: "t", seconds: 5 });
  check(html.includes("&lt;b&gt;&amp;") && !html.includes("<b>&"), "card text is escaped");
  check(html.includes(theme.background) && html.includes(theme.accent), "the card uses the theme colours");
  check(captionHtml(theme, size, "a < b").includes("a &lt; b") && captionHtml(theme, size, "x").includes("transparent"), "a caption is escaped and on a transparent page");
  const bg = sceneBgHtml(theme, size, "Head", [{ text: "Owner", rect: { x: 5, y: 6, w: 7, h: 8 } }, { text: "", rect: { x: 0, y: 0, w: 1, h: 1 } }]);
  check(bg.includes("Head") && bg.includes("left:5px;top:6px;width:7px;height:8px") && (bg.match(/class="lab"/g) || []).length === 1, "the scene background has the heading and only the non-empty labels");
  const css = fontFaceCss([{ family: "F", file: "f.woff2", style: "normal", weight: "400" }], () => Buffer.from("abc"));
  check(css.includes('font-family:"F"') && css.includes("base64,YWJj") && css.includes('format("woff2")'), "fonts are embedded as base64");
}

// ---- record.mjs: the story writes a cut from what it recorded
{
  const fakeBrowser = {
    async newContext(opts) {
      return {
        opts,
        async newPage() {
          const name = opts.recordVideo ? opts.recordVideo.dir.split("/").pop() : "none";
          return { video: () => ({ path: async () => `/work/clips/${name}/v.webm` }) };
        },
        async close() {},
      };
    },
  };
  const warm = createStory({ browser: fakeBrowser, workDir: "/work", recording: false });
  const wc = await warm.open("x", "desktop");
  warm.say("ignored");
  check(!wc.ctx.opts.recordVideo, "the warm-up records no video");
  check((await warm.shot(null, "nope")) === null, "the warm-up takes no screenshot");
  const t0 = Date.now();
  await warm.pause(500);
  check(Date.now() - t0 < 100, "pause does not wait in the warm-up");

  const story = createStory({ browser: fakeBrowser, workDir: "/work", recording: true });
  const a = await story.open("guest", "phone", { label: "Guest (phone)", baseURL: "http://x" });
  const b = await story.open("owner", "desktop");
  check(a.ctx.opts.recordVideo.size.width === 390 && a.ctx.opts.isMobile && a.ctx.opts.hasTouch && a.ctx.opts.baseURL === "http://x", "a phone is mobile with touch, recorded at its viewport");
  check(b.ctx.opts.recordVideo.size.width === 1280 && b.ctx.opts.recordVideo.size.height === 800, "the desktop is recorded at 1280x800");
  let threw = false;
  try {
    await story.open("guest", "phone");
  } catch {
    threw = true;
  }
  check(threw, "a clip name can be used once");
  // move the clocks so the arithmetic is exact
  a.startedAt = 1_000_000;
  b.startedAt = 1_001_000;
  const realNow = Date.now;
  let now = 1_003_000;
  Date.now = () => now;
  try {
    story.scene({ title: "Visit", heading: "Both", panels: ["guest", { clip: "owner", label: "Owner" }] });
    now += 500;
    story.say("First");
    now += 2000;
    story.say(null);
    now += 500;
    story.say("Second");
    now += 3000;
    story.endScene();
  } finally {
    Date.now = realNow;
  }
  const cutFile = join(mkdtempSync(join(tmpdir(), "video-rec-")), "cut.json");
  const cut = await story.writeCut(cutFile, { out: "walkthrough.mp4" });
  const sc = cut.scenes[0];
  // the scene starts at 1_003_000, the later clip started at 1_001_000 (+400 lead): the scene start holds
  check(sc.duration_s === 5.8, `scene duration after the 200 ms tail trim should be 5.8; got ${sc.duration_s}`);
  check(sc.panels[0].offset_s === 3 && sc.panels[1].offset_s === 2, `offsets measure the scene start against each clip's start; got ${sc.panels[0].offset_s}, ${sc.panels[1].offset_s}`);
  check(sc.panels[0].label === "Guest (phone)" && sc.panels[1].label === "Owner", "labels come from open() or from the scene's panel");
  check(sc.captions.length === 2 && sc.captions[0].from_s === 0.5 && sc.captions[0].to_s === 2.5 && sc.captions[1].from_s === 3 && sc.captions[1].to_s === 5.8, `captions: ${JSON.stringify(sc.captions)}`);
  check(sc.panels[0].clip === "../../work/clips/guest/v.webm" || sc.panels[0].clip.endsWith("clips/guest/v.webm"), `clip paths are relative to the cut file; got ${sc.panels[0].clip}`);
  check(validateCut(JSON.parse(readFileSync(cutFile, "utf8"))).length === 0, "the written cut validates");
  rmSync(dirname(cutFile), { recursive: true, force: true });
}

// ---- CLI usage errors
{
  const noArgs = spawnSync("node", [composeScript], { encoding: "utf8" });
  check(noArgs.status === 2 && /usage:/.test(noArgs.stderr), "no arguments exit 2 with a usage line");
  const tmp = mkdtempSync(join(tmpdir(), "video-cli-"));
  try {
    const missing = spawnSync("node", [composeScript, join(tmp, "nope.json")], { encoding: "utf8" });
    check(missing.status === 1 && /not found/.test(missing.stderr), "a missing cut file exits 1 and says so");
    writeFileSync(join(tmp, "bad.json"), JSON.stringify({ out: "x.mp4", scenes: [{ duration_s: -1, panels: [] }] }));
    const bad = spawnSync("node", [composeScript, join(tmp, "bad.json")], { encoding: "utf8" });
    check(bad.status === 1 && /scenes\[0\]\.duration_s/.test(bad.stderr) && /scenes\[0\]\.panels/.test(bad.stderr), `an invalid cut exits 1 and names every problem; got ${bad.stderr}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ---- integration: compose two scenes from two generated clips
const ffmpeg = findFfmpeg();
const project = process.env.VIDEO_TEST_PROJECT;
let integration = "skipped";
if (!ffmpeg) {
  console.log("SKIP: video integration test (no ffmpeg found)");
} else if (!project || !existsSync(join(project, "package.json")) || !loadChromium(project)) {
  console.log("SKIP: video integration test (set VIDEO_TEST_PROJECT to a project with Playwright installed)");
} else if (!/libvpx|libx264/.test(execFileSync(ffmpeg, ["-hide_banner", "-encoders"], { encoding: "utf8" }))) {
  console.log("SKIP: video integration test (this ffmpeg cannot encode H.264 or VP8)");
} else {
  const tmp = mkdtempSync(join(tmpdir(), "video-int-"));
  try {
    const gen = (name, size, secs, codecArgs) =>
      execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", `testsrc=size=${size}:rate=25:duration=${secs}`, ...codecArgs, join(tmp, name)]);
    const hasVpx = /libvpx\s/.test(execFileSync(ffmpeg, ["-hide_banner", "-encoders"], { encoding: "utf8" }));
    const clipArgs = hasVpx ? ["-c:v", "libvpx", "-b:v", "1M"] : ["-c:v", "libx264", "-pix_fmt", "yuv420p"];
    const ext = hasVpx ? "webm" : "mp4";
    gen(`wide.${ext}`, "1280x720", 6, clipArgs);
    gen(`phone.${ext}`, "390x844", 3, clipArgs); // shorter than its scene: holds its last frame
    writeFileSync(
      join(tmp, "cut.json"),
      JSON.stringify({
        out: "out/test.mp4",
        title: { mark: "TEST", heading: "Integration", text: "two scenes", seconds: 2 },
        closing: { heading: "End", seconds: 2 },
        scenes: [
          { title: "One", heading: "One screen", duration_s: 3, panels: [{ clip: `wide.${ext}`, offset_s: 0.2, label: "Wide" }], captions: [{ text: "Caption one", from_s: 0.5 }] },
          { title: "Two", heading: "Two screens", duration_s: 4, panels: [{ clip: `wide.${ext}`, offset_s: 1, label: "Wide" }, { clip: `phone.${ext}`, label: "Phone" }], captions: [{ text: "Caption two", from_s: 1 }] },
        ],
      }),
    );
    const run = spawnSync("node", [composeScript, join(tmp, "cut.json"), "--project", project], { encoding: "utf8" });
    check(run.status === 0, `compose-video.mjs should exit 0; got ${run.status}:\n${run.stderr}`);
    if (run.status === 0) {
      const result = JSON.parse(run.stdout);
      const outFile = join(tmp, "out", `test.${result.file.endsWith(".webm") ? "webm" : "mp4"}`);
      check(result.file === outFile && existsSync(outFile), `the video should exist at ${outFile}; got ${result.file}`);
      check(Math.abs(result.duration_s - 11) < 0.6, `duration should be about 11 s; got ${result.duration_s}`);
      check(result.size_mb > 0 && result.size_mb < 10, `size_mb should be set; got ${result.size_mb}`);
      check(JSON.stringify(result.chapters.map((c) => c.at_s)) === "[0,2,5,9]" && result.chapters[1].title === "One", `chapters: ${JSON.stringify(result.chapters)}`);
      const probeFfprobe = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,width,height", "-of", "csv=p=0", outFile], { encoding: "utf8" });
      if (probeFfprobe.status === 0) {
        const [codec, w, h] = probeFfprobe.stdout.trim().split(",");
        check(w === "1920" && h === "1080", `the video should be 1920x1080; got ${w}x${h}`);
        check(result.codec === "h264" ? codec === "h264" : /vp[89]/.test(codec), `the codec should match the result (${result.codec}); got ${codec}`);
      } else {
        const info = spawnSync(ffmpeg, ["-hide_banner", "-i", outFile], { encoding: "utf8" }).stderr;
        check(/1920x1080/.test(info), "the video should be 1920x1080");
      }
      // a size cap that cannot be met raises the crf and reports it
      const cutFile = JSON.parse(readFileSync(join(tmp, "cut.json"), "utf8"));
      cutFile.max_mb = 0.001;
      cutFile.out = "out/capped.mp4";
      writeFileSync(join(tmp, "cut-capped.json"), JSON.stringify(cutFile));
      const capped = spawnSync("node", [composeScript, join(tmp, "cut-capped.json"), "--project", project], { encoding: "utf8" });
      check(capped.status === 0, `a missed size cap should still exit 0; got ${capped.status}:\n${capped.stderr}`);
      if (capped.status === 0) {
        const r2 = JSON.parse(capped.stdout);
        check(r2.crf > result.crf, `the crf should go up when over max_mb; got ${r2.crf}`);
        check(Array.isArray(r2.warnings) && /max_mb/.test(r2.warnings[0]), "the result should warn that max_mb was missed");
      }
      integration = "ran";
    }
    const leftovers = spawnSync("ls", [tmpdir()], { encoding: "utf8" }).stdout.split("\n").filter((f) => f.startsWith("compose-video-"));
    check(leftovers.length === 0, `compose-video.mjs should remove its temp folder; found ${leftovers}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ---- integration: record.mjs against a real browser, then compose
if (ffmpeg && project && existsSync(join(project, "package.json")) && loadChromium(project) && integration === "ran") {
  const tmp = mkdtempSync(join(tmpdir(), "video-real-"));
  const server = createServer((req, res) => {
    res.setHeader("content-type", "text/html");
    if (req.url.startsWith("/counter")) {
      res.end('<body style="font:40px sans-serif;background:#e8f0ff"><h1>Counter page</h1><p id="n">0</p><script>let n=0;setInterval(()=>{n++;document.getElementById("n").textContent=n},300)</script></body>');
    } else {
      res.end('<body style="font:32px sans-serif;background:#fff3e0"><h1>Home page</h1><input id="name" aria-label="Name" style="font-size:32px"><br><br><button id="go" style="font-size:32px" onclick="document.getElementById(\'out\').textContent=\'Hello \'+document.getElementById(\'name\').value">Greet</button><p id="out">Nobody yet</p></body>');
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const log = [];
    const shots = [];
    const work = join(tmp, "work");
    const shotDir = join(tmp, "shots");
    const play = async (story) => {
      log.push(`play:${story.recording}`);
      const d = await story.open("desk", "desktop", { baseURL: base, label: "Desk" });
      const p = await story.open("phone", "phone", { baseURL: base, label: "Phone" });
      story.scene({ title: "Two roles", heading: "Desk and phone", panels: ["desk", "phone"] });
      await d.page.goto("/");
      await p.page.goto("/counter");
      story.say("The desk greets");
      await story.pause(700);
      await story.type(d.page.locator("#name"), "Ada");
      await d.page.click("#go");
      await d.page.locator("#out", { hasText: "Hello Ada" }).waitFor();
      shots.push(await story.shot(d.page, "walkthrough-01-home", { dir: shotDir }));
      story.say("The phone counts");
      await story.pause(1500);
      shots.push(await story.shot(p.page, "walkthrough-02-counter", { dir: shotDir }));
      story.say(null);
      await story.pause(300);
      story.endScene();
      await story.close(d);
      await story.close(p);
      const m = await story.open("mon", "monitor", { baseURL: base, label: "Monitor" });
      story.scene({ title: "One role", heading: "The monitor", panels: ["mon"] });
      await m.page.goto("/counter");
      story.say("The monitor counts too");
      await story.pause(2000);
      story.endScene();
    };
    const story = await runStory({
      projectRoot: project,
      workDir: work,
      play,
      cleanSlate: async () => log.push("clean"),
    });
    check(JSON.stringify(log) === JSON.stringify(["play:false", "clean", "play:true"]), `cleanSlate runs once between the passes; got ${log}`);
    const clipDirs = readdirSync(join(work, "clips")).sort();
    check(JSON.stringify(clipDirs) === JSON.stringify(["desk", "mon", "phone"]), `only the recorded pass leaves clips; got ${clipDirs}`);
    check(shots[0] === null && shots[1] === null, "the warm-up shot returns null");
    const real = shots.filter(Boolean);
    check(real.length === 2 && real[0].file === "walkthrough-01-home" && real[0].sizes.join() === "1280x800,390x844", `shot returns { file, sizes }; got ${JSON.stringify(real)}`);
    const pngs = readdirSync(shotDir).sort();
    check(pngs.length === 4, `the warm-up takes no screenshots, the recorded pass takes 2 x 2; got ${pngs}`);
    for (const f of pngs) {
      const [, w, h] = /-(\d+)x(\d+)\.png$/.exec(f);
      const head = readFileSync(join(shotDir, f));
      check(head.readUInt32BE(16) === Number(w) && head.readUInt32BE(20) === Number(h), `${f} should be ${w}x${h} pixels; the file says ${head.readUInt32BE(16)}x${head.readUInt32BE(20)}`);
    }
    const cutFile = join(work, "cut.json");
    const cut = await story.writeCut(cutFile, { out: "../real.mp4", title: { heading: "Real", seconds: 2 }, closing: { heading: "End", seconds: 2 } });
    check(cut.scenes.length === 2 && cut.scenes[0].panels.length === 2, "the cut has both scenes");
    for (const sc of cut.scenes) {
      check(sc.captions.length > 0 && sc.captions.every((c) => c.from_s >= 0 && c.to_s <= sc.duration_s + 0.001 && c.to_s > c.from_s), `captions lie inside their scene; got ${JSON.stringify(sc.captions)}`);
      check(sc.panels.every((pn) => pn.offset_s >= 0), "offsets are not negative");
    }
    const run = spawnSync("node", [composeScript, cutFile, "--project", project], { encoding: "utf8" });
    check(run.status === 0, `composing the recorded cut should exit 0; got ${run.status}:\n${run.stderr}`);
    if (run.status === 0) {
      const result = JSON.parse(run.stdout);
      const expected = 4 + cut.scenes.reduce((a, s) => a + s.duration_s, 0);
      check(Math.abs(result.duration_s - expected) < 0.6, `duration should be about ${expected.toFixed(1)}; got ${result.duration_s}`);
      const info = spawnSync(ffmpeg, ["-hide_banner", "-i", result.file], { encoding: "utf8" }).stderr;
      check(/1920x1080/.test(info) && (result.codec !== "h264" || /Video: h264/.test(info)), "the recorded video is 1920x1080 and h264");
      if (process.env.VIDEO_TEST_FRAMES) {
        for (const [fi, t] of [3, 4.5, expected - 2.5].entries()) {
          spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-ss", String(t), "-i", result.file, "-frames:v", "1", join(process.env.VIDEO_TEST_FRAMES, `real-${fi}.png`)]);
        }
      }
    }
  } finally {
    server.close();
    rmSync(tmp, { recursive: true, force: true });
  }
  integration = "ran, with a real browser";
}

if (fail === 0) {
  console.log(
    `PASS: compose-video.mjs validates a cut file and names each problem, lays panels out inside the frame at their aspect ratio, builds the filter graph, computes chapters and picks an encoder; record.mjs writes a cut from what it recorded; integration test ${integration}.`,
  );
}
process.exit(fail);
