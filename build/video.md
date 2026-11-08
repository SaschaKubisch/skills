# The video recipe

The `build` skill reads this file when `validation.video_walkthrough` is
`true` and the ticket is in scope (`video_scope`). It says how to record
the key flow of the app and turn it into one video with captions and
chapters. Two small scripts do the hard parts. The builder writes only the
story: what to click, and what to say about it.

The scripts sit beside this file, in `.claude/skills/build/scripts/video/`:

- `record.mjs` helps the story script. It opens one recorded browser per
  role, logs when each caption starts, and writes the cut file.
- `compose-video.mjs` reads the cut file and writes the video. It prints
  the chapters, ready for `report.json`.

Both need Node and Playwright. Playwright is taken from the project's own
`node_modules`, never from the skills folder.

## What the video covers

`validation.video_scope` in `.claude/workflow.yml` decides what the video
shows and when it is made.

- `ticket` (default). Every ticket gets a video of its own key flow. Write
  the story for that flow. It may be thrown away: keep it in the ticket's
  `validation/tmp/` folder and do not commit it, unless the project wants
  it.
- `item`. Only the ticket that empties its item's backlog gets a video. It
  shows the flows of all the item's tickets. The video sits in
  `items/<item>/validation/`. The story is written for this item and may be
  thrown away in the same way.
- `app`. The video is a tour of the whole app. It is due and stored like
  `item`: only for the ticket that empties its item's backlog, in
  `items/<item>/validation/`. The story is different. The project keeps
  ONE story script for the whole app, committed, for example
  `scripts/walkthrough.mjs`. The Conventions `video method:` line names
  that script and the command that runs it.

Under `app`, do not write a new story. Open the project's script and extend
it with what the finished item added: new scenes, or new steps in existing
scenes. Keep the old scenes working. If an old scene breaks because the
item changed the app, fix the scene. Then run the script and compose, as
in the sections below. The first time, when no script exists, write it for
the app as it is now, and write its path and command into Conventions.

A tour is long. Two to four minutes at 1920x1080 is usually 5 to 12 MB, so
`video_max_mb` may need raising for `app`. The composer's CRF ladder
(section 12) still applies.

## 1. Before you start

Check these once. Write the result into Conventions as the `video method:`
line (see "Conventions" in `SKILL.md`), so the next ticket does not check
again.

- ffmpeg. Run `ffmpeg -version`. The composer needs a full build: one that
  reads PNG pictures and has `libx264` or `libvpx`. The small ffmpeg that
  `npx playwright install ffmpeg` installs is too small, and the composer
  stops with a clear message when it finds only that one. Without a full
  ffmpeg, do not compose. Keep one `.webm` per role and say so in the
  video's `claim` (see section 13).
- Chromium. Run `npx playwright install chromium` if it is missing. The
  composer needs it to draw the title card, the labels and the captions.
- A test database. The story changes data. It must never touch the
  development database.

Many ffmpeg builds have no `drawtext` filter. This is why the composer
draws text as pictures with Chromium and lays them over the clips.

A build without `libx264` still works. The composer then writes VP9 or VP8
in a `.webm` file and says so in `warnings`. Most browsers play it.

## 2. Own port, test database only

Start a separate instance of the app for the recording.

- Use a port no one else uses. Stop the run if it is taken. Never share a
  port with the development server.
- Point it at the test database. Assert the database name in the story
  script before anything else, for example that it ends in `_test`. Stop if
  it does not.
- If the dev server allows only one instance per folder, run it from a
  throwaway copy of the app folder.

## 3. The warm-up run

A dev server compiles each page the first time someone opens it. That wait
must never be on film.

Run the whole story once first, with nothing recorded. `runStory` in
`record.mjs` does this. In the warm-up pass `say`, `pause` and `shot` do
nothing, so it runs fast. Its only job is to make the server compile every
page the story visits.

## 4. A clean slate, with a check

The warm-up leaves data behind. Reset the test database after it, then
assert that it is empty. Pass this as `cleanSlate` to `runStory`. It runs
between the warm-up and the recorded run.

Without the check, a reset that silently fails puts the warm-up's data in
the video.

## 5. The same pass takes the screenshots

The report's screenshots are taken in the recorded run, by the same story.
The report needs each one at every size in Conventions (default 1280x800
and 390x844), as `validation/screenshots/<file>-<size>.png`, for example
`walkthrough-01-menu-1280x800.png`. Use
`await story.shot(page, "walkthrough-01-menu")` for each. It writes one
file per size and returns `{ file, sizes }`, which is one entry of
`report.json`'s `screenshots`. Pass `{ sizes: [...] }` when Conventions
declares other sizes.

- The size that equals the role's own viewport is the page itself. A
  desktop role is 1280x800 and a phone role is 390x844, so one of the two
  sizes is the recorded page.
- Every other size is taken in the same pass from a side browser context.
  It has the role's login, opens the page's current URL and takes the
  picture. It is not filmed.
- A role with another viewport, such as `monitor`, gets every size from a
  side context.
- State that a URL does not reproduce, such as an unsaved form or an open
  dialog, only appears at the recorded size. Pick shot moments that a URL
  reproduces, or name the gap in `not_tested`.
- In the warm-up pass `shot` does nothing, so the warm-up captures nothing.

The rule in `SKILL.md` still holds: the video is captured in the same
single pass as the screenshots, never in a second one. The warm-up is not a
second pass. It records nothing and captures nothing. It only warms the
server.

## 6. One browser context per role

Open one context per role with `story.open(name, device, options)`. A guest
and a cook are two contexts, even on the same page. The context records its
own video, sized like its viewport. Close it with `story.close(clip)` when
its role is done. `runStory` closes any that are left.

Pass `label` in the options to name the panel in the video, for example
`{ label: "Guest (phone)" }`. Pass any Playwright context option there too:
`baseURL`, `storageState`, `locale`.

## 7. Devices

`device` is one of these names, or an object with a `viewport`:

| Name | Viewport | Notes |
| --- | --- | --- |
| `desktop` | 1280x800 | a declared screenshot size |
| `phone` | 390x844 | `isMobile` and `hasTouch` on; a declared screenshot size |
| `monitor` | 1280x920 | a wall screen, for example a kitchen board |

The video is 1920x1080. The composer fits the panels of a scene side by
side, keeps each panel's aspect ratio, shows it no larger than recorded,
and leaves room for a heading, labels and one caption line.

## 8. Pacing

Without pauses a video is a blur. Pace it like a person.

- Use no `slowMo`. It slows every action and makes the video stutter.
- Pause 1 to 2 seconds after each visible action: `await story.pause(1500)`.
- Type with `story.type(locator, text)`. It types one key every 70 ms while
  recording and at once in the warm-up.
- Give a page time to be read: 3 to 4 seconds after it changes.
- Wait for the result with `expect` before the pause, so the pause shows
  the result and not the wait.

## 9. Captions and chapters

Call `story.say("text")` when something starts. The caption stays until the
next `say`. `say(null)` clears it. The time is the wall clock of the story,
so a caption lines up with what is on screen.

Group the story into scenes with `story.scene({ title, heading, panels })`
and `story.endScene()`. One scene shows its clips side by side:

- `title` is the chapter name in the report.
- `heading` is the line at the top of the frame.
- `panels` lists the clips to show: a name, or `{ clip, label }`.

Keep captions short: one line, 12 words at most. A scene shorter than a
second after trimming is an error. Each scene start is a chapter.

## 10. The cut file and the compose command

At the end of the story, `await story.writeCut("walkthrough/cut.json", {...})`
writes the cut file. You may also write it by hand. Paths in it are
relative to the folder that holds it.

```json
{
  "out": "walkthrough.mp4",
  "size": { "width": 1920, "height": 1080 },
  "fps": 25,
  "max_mb": 10,
  "chapters": "scenes",
  "theme": {
    "background": "#131211",
    "ink": "#f2efea",
    "muted": "#b3ada4",
    "accent": "#e3a8d0",
    "font": "\"Schibsted Grotesk\", system-ui, sans-serif",
    "heading_font": "\"Instrument Serif\", Georgia, serif",
    "fonts": [
      { "family": "Schibsted Grotesk", "file": "fonts/schibsted.woff2", "weight": "400 900", "style": "normal" },
      { "family": "Instrument Serif", "file": "fonts/instrument.woff2", "weight": "400", "style": "normal" }
    ]
  },
  "title":   { "mark": "MY APP", "heading": "A visit, from the first scan to the paid bill", "text": "Four roles, live", "seconds": 5 },
  "closing": { "heading": "That is the whole visit", "text": "Every step is in the audit log", "seconds": 5 },
  "scenes": [
    {
      "title": "The owner sets up",
      "heading": "Setup",
      "duration_s": 24.5,
      "panels": [
        { "clip": "clips/owner/a1b2.webm", "offset_s": 0.4, "label": "Owner (desktop)", "view": { "width": 1280, "height": 800 } }
      ],
      "captions": [
        { "text": "The owner signs in", "from_s": 0.5, "to_s": 4 },
        { "text": "The owner adds the menu", "from_s": 4 }
      ]
    },
    {
      "title": "The visit",
      "heading": "One visit, three screens",
      "duration_s": 61,
      "panels": [
        { "clip": "clips/guest/c3d4.webm", "offset_s": 12.1, "label": "Guest (phone)" },
        { "clip": "clips/cook/e5f6.webm",  "offset_s": 9.7,  "label": "Cook (board)" },
        { "clip": "clips/waiter/0a1b.webm", "offset_s": 10.3, "label": "Waiter (phone)" }
      ],
      "captions": [ { "text": "A guest scans the QR code", "from_s": 1.2 } ]
    }
  ]
}
```

Every key except `out` and `scenes` is optional. What each one means:

- `out`: the video path, `.mp4` or `.webm`.
- `size`, `fps`: the frame, default 1920x1080 at 25 fps. Width and height
  are even.
- `max_mb`: the size cap. Use the config's `video_max_mb`.
- `chapters`: `scenes` (default) gives one chapter per scene. `captions`
  gives one per caption too.
- `theme`: colours and fonts for the cards, labels and captions. Match the
  app's own. `fonts` lists font files that are embedded, so the text uses the
  same type as the screens.
- `title`, `closing`: a card with an optional `mark` (a small line above),
  a `heading`, a `text` and `seconds` on screen (default 5). Leave one out
  for no card.
- `scenes[]`: `title` (chapter name), `heading`, `duration_s` (required),
  `panels`, `captions`.
- `panels[]`: `clip` (any file ffmpeg reads, required), `offset_s` (seconds
  into the clip where this scene starts, default 0), `label`, `view` (the
  clip's size, to skip a probe). Without `x`, `y`, `w` and `h` the panels are
  laid out side by side. With all four, in frame pixels, the panel goes
  exactly there.
- `captions[]`: `text`, `from_s` and `to_s`, in seconds from the scene
  start. Without `to_s` a caption lasts until the next one or the scene end.

A clip shorter than its scene holds its last frame.

Then compose:

```sh
node .claude/skills/build/scripts/video/compose-video.mjs walkthrough/cut.json
```

Add `--project <root>` when the project root is not the nearest folder with
`CLAUDE.md`, `AGENTS.md` or `.git`.

The command prints one JSON object:

```json
{ "file": "/abs/path/walkthrough.mp4", "duration_s": 41.2, "size_mb": 3.4,
  "codec": "h264", "crf": 23,
  "chapters": [ { "at_s": 0, "title": "A visit" }, { "at_s": 5, "title": "The owner sets up" } ] }
```

It exits 0 on success, 1 on failure with the reason on stderr, and 2 on a
wrong command line. It removes its temporary folder.

What it does, in order: finds ffmpeg and checks for `libx264`; draws the
cards, the scene backgrounds and each caption as a picture in Chromium;
builds each scene with one ffmpeg call; encodes at CRF 23; joins the parts
with `+faststart`.

## 11. Check the video

Never trust a video you have not looked at.

1. Read the facts with `ffprobe -v error -show_entries stream=codec_name,width,height -show_entries format=duration -of default=nw=1 <file>`.
   Expect `h264`, 1920 by 1080 and the duration the command printed.
2. Extract 3 to 5 frames, one near each chapter start:
   `ffmpeg -ss <at_s + 2> -i <file> -frames:v 1 <frame>.png`.
3. Look at each frame with the image reader. Check that the cards show, the
   panels are not cut off, the labels match the panels and the caption fits
   on one line.
4. Delete the frames.

If a frame is wrong, fix the story or the cut and compose again.

## 12. Size cap

`video_max_mb` goes into the cut as `max_mb`. If the first video is over,
the composer encodes the finished video again with a higher CRF: 28, then
32, then 36 (for VP9: 38, 43, 48), and stops at the first one that fits.
The result's `crf` says which. If it is still over, the result has a
warning and `check-evidence.mjs` will refuse the file.

Then shorten the story: fewer scenes, shorter pauses, fewer panels. A video
of 60 to 90 seconds at 1920x1080 is usually 3 to 8 MB.

## 13. Clean up and write the report entry

- Delete the clips, the cut file and the other temporary files. Do not
  commit the clips. Under `ticket` and `item`, the story script may be
  deleted with them. Under `app`, keep the story script and commit it with
  the item's other changes: the next item extends it.
- Stop the app instance. Check that its port is free.
- With `video_commit` `false`, add the video to `.gitignore`.
- Move the video into the folder the report expects (see "The validation
  report" in `SKILL.md`) and write one entry into `report.json`'s `videos`.
  Copy `duration_s`, `size_mb` and `chapters` from the command's output.
  `file` is the path relative to the report's folder.

```json
"videos": [
  { "file": "walkthrough.mp4", "claim": "One visit, from the first scan to the paid bill, in four roles",
    "duration_s": 41.2, "size_mb": 3.4,
    "chapters": [ { "at_s": 0, "title": "A visit" }, { "at_s": 5, "title": "The owner sets up" } ] }
]
```

## 14. Example story

A story script for any web app. It is plain JavaScript; the same calls work
in a `.ts` file run with `tsx`. Screenshots land in
`validation/screenshots/`. The names `resetTestDb`, `assertTestDb`,
`startApp`, `stopApp` and `countRows` are the project's own.

```js
// scripts/walkthrough.mjs — run: node scripts/walkthrough.mjs
import { expect } from "@playwright/test";
import { runStory } from "../.claude/skills/build/scripts/video/record.mjs";
import { startApp, stopApp, resetTestDb, assertTestDb, countRows } from "./test-helpers.mjs";

const PORT = 3400;
const BASE = `http://localhost:${PORT}`;
const root = process.cwd();
const work = `${root}/walkthrough/tmp`;

const shots = []; // the entries for report.json screenshots[] (the recorded pass fills them last)

async function play(story) {
  shots.length = 0;
  const { say, pause, type, shot } = story;

  // Scene 1: one role, one screen.
  const admin = await story.open("admin", "desktop", { baseURL: BASE, label: "Admin (desktop)" });
  story.scene({ title: "Admin adds an item", heading: "Setup", panels: ["admin"] });
  await admin.page.goto("/login");
  say("The admin signs in");
  await pause(1500);
  await type(admin.page.getByLabel("Email"), "admin@example.com");
  await type(admin.page.getByLabel("Password"), "secret");
  await admin.page.getByRole("button", { name: "Sign in" }).click();
  await expect(admin.page.getByTestId("dashboard")).toBeVisible();
  shots.push(await shot(admin.page, "walkthrough-01-dashboard"));
  say("The admin adds an item");
  await admin.page.getByRole("link", { name: "Items" }).click();
  await type(admin.page.getByLabel("Name"), "Sample item");
  await admin.page.getByRole("button", { name: "Add item" }).click();
  await expect(admin.page.getByText("Sample item")).toBeVisible();
  shots.push(await shot(admin.page, "walkthrough-02-item-added"));
  await pause(2500);
  say(null);
  story.endScene();
  await story.close(admin);

  // Scene 2: two roles side by side, both live.
  const user = await story.open("user", "phone", { baseURL: BASE, label: "User (phone)" });
  const staff = await story.open("staff", "monitor", { baseURL: BASE, label: "Staff (board)" });
  story.scene({ title: "A user orders", heading: "One order, two screens", panels: ["user", "staff"] });
  await staff.page.goto("/board");
  await user.page.goto("/");
  say("A user places an order on the phone");
  await user.page.getByRole("button", { name: "Order Sample item" }).click();
  await pause(1500);
  await expect(staff.page.getByTestId("order-card")).toHaveCount(1);
  shots.push(await shot(staff.page, "walkthrough-03-board"));
  say("It shows on the staff board at once");
  await pause(3500);
  say(null);
  story.endScene();
}

await assertTestDb();
await resetTestDb();
const server = await startApp({ port: PORT });
try {
  const story = await runStory({
    projectRoot: root,
    workDir: work,
    play,
    cleanSlate: async () => {
      await resetTestDb();
      if ((await countRows()) !== 0) throw new Error("the test database is not empty after the reset");
    },
  });
  console.log(JSON.stringify(shots)); // paste into report.json screenshots[], with a claim for each
  await story.writeCut(`${work}/cut.json`, {
    out: "../walkthrough.mp4",
    max_mb: 10,
    title: { heading: "Order to board", text: "Two roles, live" },
    closing: { heading: "That is the flow" },
  });
} finally {
  await stopApp(server);
}
// then: node .claude/skills/build/scripts/video/compose-video.mjs walkthrough/tmp/cut.json
```
