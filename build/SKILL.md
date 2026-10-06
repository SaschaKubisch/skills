---
name: build
description: The method for working one ticket to done — a working copy on its own branch, one test written before each step and named after what the step proves, validation from lint to end to end with screenshots wherever there is a UI, a self-contained, mostly visual HTML validation report at validation/agent-report.html, and a hand-back with the report's path. The builder agent follows it; a person can type it to work a ticket by hand. Never softens a check; stops and says so instead.
disable-model-invocation: true
---

# Build

Work one ticket to done. Test first, one test per step, named after what
the step proves. Validate from the cheapest check to the most expensive.
Write the report. Hand back. Stop rather than soften.

Two rules run through everything below:

- **A check is never edited to pass.** Not a test, not a spec, not a
  ticket's exit condition. If a check is wrong, say so in the report and
  stop; a person changes it.
- **Everything claimed is shown.** A test that ran has its command and
  exit code in the report. A screen that exists has its screenshot. What
  was not tested says so, with the reason.

## Argument

A ticket: a slug (`0007-prices`) or a path under `items/<item>/tickets/`.
The ticket is a folder holding `ticket.md` and, after this method runs,
`validation/`.

```
/build 0007-prices
```

## Look first

Detect, do not assume. Say what you found before the first change:

- The ticket in full: its Steps, its exit conditions, its Blocked by, its
  Kind line. A ticket without a `Kind:` line is not ready to work: stop
  and say so. Every ticket it is blocked by is in `done/`, or stop.
- Its parent spec, `specs/system.md`, `CONTEXT.md`, `stdlib/` if present.
  The tickets use the glossary's words; so does the code.
- `PROGRESS.md` at the working-tree root: if present and its first
  line is `ticket: <slug>` for this ticket, the steps already ticked are
  done; start at the first unticked one. Present with any other first
  line: it belongs to another ticket — stop and say so. If absent, write
  it: `ticket: <slug>` on the first line, then the ticket's Steps, one
  `- [ ] ` line per step. It is a working
  file; never commit it — list it in `.git/info/exclude` if nothing
  ignores it yet.
- The project's CLAUDE.md `## Conventions` section (below). If present,
  its checks, end-to-end command, screenshot sizes and method, base
  branch and github project are the ones this method uses. If absent,
  detect them as the Conventions section below describes, and write what
  you found into a new Conventions section, committed with the ticket's
  first commit.
- A frontend, or not. With a frontend, end to end means screenshots are
  mandatory.

## The project's Conventions

A project's own facts — base branch, checks, end-to-end command,
screenshot sizes and method, video method, GitHub project — live in one
place: a
`## Conventions` section in the project's CLAUDE.md (or AGENTS.md for a
Codex mirror), a fixed set of bullet keys:

```
## Conventions
- base branch: main
- checks (cheapest first): npm run lint; npx tsc --noEmit; npm test; npm run build
- end to end: npx playwright test
- test scope: feature
- context: per-ticket
- step gate: changed-tests
- prove failing first: bug-fixes
- per-ticket extras: end
- screenshots: Playwright, 1280x800 and 390x844, saved per test
- workflow config: .claude/workflow.yml
- github project: <name, or none>
```

`write-tickets` and `judge` read it the same way this method does.

`test scope` says how much of the end-to-end suite runs. `feature` (the
default when the key is absent): nothing in the method runs the whole
end-to-end suite — not per step, not at the end of a ticket, not in the
judge, not in the hand-back. Per step, run the cheap checks (every
`checks` entry), the ticket's own exit-condition commands, and the
end-to-end specs that cover any shared file the step touched, found by
searching the tests for the route, component or table the changed file
serves. A failure in a spec that neither belongs to the ticket nor covers
a touched file is noted as deferred, not chased. `full`: every check and
the whole end-to-end suite on every step, and the judge re-runs
everything. The whole suite runs only under `full`.

Four more keys trade rigour per step for speed. The first value is the
default; the second reproduces the older behaviour exactly.

- `context: per-ticket | per-step`. `per-ticket`: one agent works all of a
  ticket's steps as a checklist in one context. No fresh agent, no
  re-reading of the ticket, spec or docs, and no harness smoke preflight
  per step; the preflight runs once per run. Still one commit per step.
  `per-step`: a fresh context per step, as before.
- `step gate: changed-tests | ticket-tests`. `changed-tests`: per step run
  the typecheck and only the test files the step created or changed (and,
  under `test scope: feature`, the specs covering a shared file the step
  touched); the ticket's whole exit-condition set runs once, at the end of
  the ticket. `ticket-tests`: every step runs the ticket's exit conditions.
- `prove failing first: bug-fixes | always`. `bug-fixes`: the proof that a
  test fails against the old code is required only for a bug fix (a fix
  ticket or step); tests for new features skip it. `always`: every test
  has it.
- `per-ticket extras: end | per-step`. `end`: the build, the screenshots
  and evidence capture happen once per ticket, at the end, and the design
  brief is folded into the first work step instead of being its own step.
  `per-step`: each of these happens in every step that needs it.
`write-tickets` defines every key here except `screenshots`,
`video method` and `workflow config`, which are this method's own. The
block above does not list `video method`: it is one more line, `- video
method: <how>`, added the first time a video is recorded (see "The
validation report"). When it is missing: detect what it would say — `package.json`, a `Makefile`,
CI config for the checks; a UI or not, and which kind, for the
screenshot method — then write it in, so the next ticket does not
detect it again. Defaults when nothing declares it: a web UI gets
Playwright at 1280x800 and 390x844; a terminal UI gets text captures; no
UI gets command output saved as text; the video method is Playwright's
video, combined with ffmpeg when it is installed; the base branch is `main`; the
workflow config is `.claude/workflow.yml` if that file exists, else
every default in the next section.

## The workflow config

A file of commented keys grouped under `models:`, `review:`, `parallel:`
and `validation:`, `.claude/workflow.yml`, tunes how this method, `judge` and
`implement-ticket` work in this project — `install.sh` copies a starting
one, never over a project's own. A key a group leaves out, a group the
file leaves out, or a missing file, takes the default below.

`models`:
- `builder` — `sonnet` (default). The model that works a ticket.
- `judge` — `opus` (default). The model that checks a builder's work.
  Both win over the `model:` line in `.claude/agents/builder.md` and
  `judge.md`, which applies only when an agent is started outside
  `implement-ticket`.
- `recheck` — `sonnet` (default). The model of the short recheck agent
  that follows an evidence-only judge round; `implement-ticket`'s own
  key, see that method.

`review`:
- `evidence` — `script` (default) or `judge`. `script`: this method runs
  `.claude/skills/build/scripts/check-evidence.mjs <ticket-folder>`
  before hand-back and fixes everything it reports — the path a project
  installs it at; in the skills repo itself, the scripts below sit at
  `build/scripts/` — `judge` also runs it first. `judge`: the script does
  not run; only the judge's own reading of the screenshots and report
  catches evidence problems.
- `evidence_findings` — `recheck` (default) or `full-round`. `judge`'s
  own key; see that method.
- `reuse_suite_run` — `true` by default, and read only under
  `test scope: full`. See "The whole-suite record" below.

`parallel`:
- `tickets` — `1` (default). `implement-ticket`'s own key; see that
  method.
- `e2e_workers` — `1` (default). See "Parallel end to end" below.

`validation` — tunes the validation report this method writes; each key
is described in "The validation report" section. A value that is not
allowed stops the config from loading, with an error naming the key.
The evidence, `validation/report.json` and the screenshots, is always
written and checked; no key turns it off. When no rendered report is due
for a ticket (`report` is `false`, or `report_scope` is `item` and the
ticket does not empty its item's backlog, as defined under "Where it
lives, and when it is due"), `implement-ticket` shows a short summary in
the chat instead. The keys:
- `report` — `true` by default. `false`: no rendered report (HTML or
  PDF); the evidence is still kept.
- `report_scope` — `ticket` (default) or `item`. `ticket`: a rendered
  report for every ticket. `item`: one for the whole item, after the
  ticket that empties its item's backlog.
- `report_pdf` — `false` (default). `true`: also write a PDF of each
  rendered report, `validation/agent-report.pdf` beside the HTML.
- `video_walkthrough` — `false` (default). `true`: record the key flow
  as a video with chapters, embedded in the report.
- `video_scope` — `ticket` (default) or `item`. `ticket`: every ticket's
  report gets the video. `item`: only the ticket that empties its item's
  backlog.
- `video_commit` — `true` by default. `false`: keep videos git-ignored
  instead of committed.
- `video_max_mb` — `10` (default). A larger video is re-encoded or
  shortened; `check-evidence.mjs` refuses it if it is still over.
- `before_after` — `false` (default). `true`: also capture the
  walkthrough screens on the base branch, shown side by side.
- `traces` — `true` by default. Failed and retried tests link to their
  Playwright trace; flaky tests are marked. `false`: no trace links.
- `changed_line_coverage` — `false` (default). `true`: a tile with the
  test coverage of only this ticket's changed lines; needs the
  project's coverage tool.

## Do

**1. The branch.** Never work on the project's base branch (from
Conventions; default `main`). On the base branch, create or switch to
`<kind>/<slug>` from the ticket's `Kind:` line, e.g. `feat/0007-prices`
— create it fresh, or switch to it if an earlier round already made it
— then work there. On any other branch, stay there — a harness or a
person already prepared it.

**2. The checks pass first.** Step 1 of every ticket: the walking
skeleton on an empty repository, or the baseline confirmed on a green one,
or the checks repaired on a red one. Nothing else in that step.

**3. Every step, test first.** Under `context: per-ticket` (default) work
every unticked step in this one context as a checklist: do not re-read the
ticket, spec or docs for each step, start no fresh agent per step, and run
no smoke preflight per step (once per run). Under `context: per-step` each
step starts from a fresh read. For each unticked step, in order:

1. Name the test after the step's `proves:` clause. One test, one claim.
2. Write it. Run it. See it fail, and for the right reason: the thing is
   missing, not the test broken. The further proof that it also fails
   against the old code is owed only for a bug fix under
   `prove failing first: bug-fixes` (default), for every test under
   `always`. Record it as `"proved_failing": true` on the test in
   `report.json`.
3. Implement the least that makes it pass. Run the step's gate. Under
   `step gate: changed-tests` (default): the typecheck and only the test
   files the step created or changed, plus, under `test scope: feature`,
   the specs covering a shared file the step touched; the ticket's exit
   conditions wait for the end of the ticket (step 4). Under
   `ticket-tests`: the cheap checks and the ticket's exit conditions on
   every step. Under `test scope: full`: the whole suite.
4. Refactor with that scope green.
5. Commit: `<type>(<NNNN>): step <n>, <what the step built>`, one commit
   per step, and tick the step.

A step whose `proves:` clause no command can check gets its work done and
its claim written under Not tested in the report, with the reason. Never
skip it silently.

**4. Validate, cheapest first.** The checks from Conventions, cheapest
first, then the ticket's exit-conditions block as it stands. Under
`test scope: full` the whole end-to-end command from Conventions runs
in between; under `feature` (default) it never runs whole, only the
specs of the ticket and those covering the shared files its diff
touched. A spec that fails and neither belongs to the ticket nor covers
a touched file is recorded with `"deferred": true` and noted, not chased. All green, or stop at the first red
and go back to step 3. Every command runs in the foreground with a
timeout long enough to finish; a sleep loop that polls for a result is
never written, here or in `judge`. Under `full`, record every whole-suite run in
`validation/suite-runs.json` — see "The whole-suite record" below.

With a UI, end to end is mandatory, and three sets of shots exist before
validation counts, each captured by Conventions' screenshot method, at
every size Conventions declares:

- **One full walkthrough** of the flow the ticket delivers, as a user
  would do it, with a shot at every screen it passes, at every declared
  size. Named `walkthrough-<NN>-<screen>.png`.
- **One test per invariant the ticket touches**, named
  `invariant-<NN>-<slug>`, with a shot at the moment the invariant is
  observed. A touched invariant is any under Invariants this touches, or
  any a step's `proves:` clause names (a number next to the word
  "invariant"/"invariants", or a letter-number id like `D1` on its own,
  as a spec's design invariants are named: the Design section inside each
  spec numbers them D1, D2, ...) — every one has a test.
- **One test per exit condition a screen can observe**, named
  `exit-<NN>-<slug>`, with its shot.

Capture every one of these in a single pass, right after the last code
change of the round — never once per step. Under `per-ticket extras: end`
(default) the build and this capture run once per ticket, at the end;
under `per-step` they also run in each step that changes what they show. Save each shot straight into
the ticket's `validation/screenshots/` folder as it is captured.

The walkthrough shots are the report's storyboard: they are the same
files, not a second capture. With `validation.before_after` true, the same
pass also captures the same walkthrough on the base branch, one shot per
screen and size named `before-walkthrough-<NN>-<screen>.png`: in a git
worktree of the base branch, or on a checkout of the base commit, and the
branch you were on is restored afterwards. With `validation.video_walkthrough`
true and in scope, the same pass records the video too; see "The
validation report".

**Parallel end to end.** The end-to-end command from Conventions is what
runs; a project that wants it against a production build puts that in
its `end to end:` line. `parallel.e2e_workers` above `1` is passed to the
end-to-end runner as its worker count; it needs the project to give
each worker its own test resources (a database, a port), documented the
same way — without that, run with one worker regardless of the key's
value.

**5. The report.** Write `validation/report.json` first (schema below);
the report it feeds, and what each part must show, is "The validation
report" below. When a rendered report is due, run `node
.claude/skills/build/scripts/render-report.mjs <ticket-folder>` to
produce the HTML from it (it prints one line and writes nothing when no
rendered report is due); with `validation.report_pdf`, `node
.claude/skills/build/scripts/render-pdf.mjs <ticket-folder>` adds the PDF,
using the Playwright of the project (`--project <root>` names another
project root). Regenerate `report.json` whole after every round,
then re-render; the edits anyone else makes are the judge's line appended
to `report.json`'s `rounds` and its entry in `verdict.judge`, which the
next regeneration carries over.

Commit the report, `report.json`, and `validation/screenshots/` every
time they are written — `<type>(<NNNN>): report` — so the tree is clean
for the judge and for the merge `implement-ticket` makes on accept. A
video goes in the same commit, unless `validation.video_commit` is `false`.

**6. Hand back.** With `review.evidence: script` (default), run `node
.claude/skills/build/scripts/check-evidence.mjs <ticket-folder>` and fix
everything it reports before anything else here — each line it prints
names one problem with the screenshots or the report against the ticket
and the Conventions. Push nothing. How the branch lands is not this
method's job. Run every line of the exit-conditions block yourself, in
order; all exit 0, or stop. The ticket reaches its item's `tickets/done/`
when the person accepts the report: the `implement-ticket` skill does the merge
and the move on that accept; working by hand, the person does it — merge,
then `git mv` to `done/`, and a commit. Then hand back: the report's
path, which steps are ticked, what was not tested.

**7. A review round.** Findings arrive as unticked lines appended to
`PROGRESS.md` after the ticket's own steps — `judge round <n>: ...` from
the judge, or `change <n>: ...` from a person's request, through
`implement-ticket`'s accept question. Step 3 already works every unticked line
in order, whichever wrote it: test first, one commit each. Regenerate
the report and commit it, as in step 5. A finding you believe is wrong: say why — in the report,
under Not tested — leave the step unticked, and stop; a person decides.
Never argue a finding away in silence.

## The validation report

The validation report lets the engineer who decides whether to accept the
ticket see what was built, whether it works and what is risky, without
reading much. Saving that engineer's time is its goal, so it is mainly
visual (screenshots, diagrams, tiles, grids) and its text is short.

`validation/agent-report.html`, rendered from `report.json`, top to
bottom:

1. **Verdict banner.** `Ready`, `Ready with notes` or `Not ready`, with at
   most 3 reasons. The builder's verdict follows fixed rules. Not ready:
   any command of the round failed (a deferred one excepted under
   `feature`), any test failed, or, under `full`, the whole-suite
   run is missing. Ready with notes: anything is under not tested (a skipped
   PDF included), any changed module is high risk, or a flaky test was
   retried, or a failure was deferred under `feature`. Ready: otherwise. When the judge ran, its verdict stands beside the builder's.
   The judge writes its own line; the builder never writes it.
2. **Tiles.** Steps done; tests passed and failed; invariants covered,
   the numbered ones and the design invariants `D1`, `D2`, ...; not
   tested; problems fixed; review rounds; and, when
   `validation.changed_line_coverage` is `true`, the test coverage of the
   changed lines. Under the tiles, the summary: at most 3 sentences and
   60 words.
3. **Walkthrough storyboard.** With a UI it is always present, whatever
   the video setting: numbered steps grouped by role, each with a caption
   of at most 12 words and its walkthrough screenshot at every declared
   size, side by side. With `validation.before_after` `true`, the same
   screen captured on the base branch sits beside it. With
   `validation.video_walkthrough` `true` and in scope, the video, with
   chapters, sits on top. Without a UI, the command outputs that stand in
   for screens.
4. **Journeys.** One small flowchart per role of the journey this ticket
   delivers, each box naming its storyboard step.
5. **What changed.** The module-and-dependency diagram and the sequence
   diagram of the new flow, this ticket's changes highlighted (the
   `changed` class, see the schema) with a legend. One bar per changed
   file, lines added and removed from `git diff --stat` against the base
   branch, grouped by module. A risk tier per changed module: high if it
   touches permissions, authentication, money, database migrations or
   audit; medium if it changes shared code other modules import; low
   otherwise.
6. **Traceability grid.** Every touched invariant, numbered and
   D-numbered, against the tests that prove it. A cell is green when the
   test passes, with its evidence screenshot linked; red when it fails;
   an invariant no test proves is a red row. With `validation.traces`
   `true`, a failed or retried test links its Playwright trace, and a
   retried test is marked flaky.
7. **Not tested and Problems fixed.** Not tested: one line each, what and
   why. Problems fixed: one card each, problem, cause, fix, commit. Every
   line is at most 25 words.
8. **Folded closed**, collapsed by default: the full test table, every
   command with its exit code, the review rounds, and the invariant and
   exit screenshots the grid does not already show.

The rules that run through it:

- Every section starts with its visual; the text comes after it.
- A section's note is at most 2 sentences. A long list starts collapsed.
- The report is self-contained: screenshots and videos by relative path,
  and the diagram renderer is the one external asset allowed.

**Where it lives, and when it is due.** Scope `ticket` (`report_scope`,
`video_scope`): the outputs sit in the ticket's own `validation/` folder,
`agent-report.html`, `agent-report.pdf`, `walkthrough.mp4` or the `.webm`
files, and `screenshots/`. Scope `item`: the item-wide outputs sit in the
item's root, `items/<item>/validation/`, and the ticket that empties its
item's backlog produces them. A ticket empties its item's backlog when
no other ticket of its item is left in `backlog/` or `in-progress/`.
The per-ticket evidence, `report.json` and
`screenshots/`, stays in each ticket's own folder; the item report links
it by relative path. A rendered report is not due when `validation.report`
is `false`, or when `report_scope` is `item` and the ticket does not
empty its item's backlog. Then `report.json`, the screenshots and
`check-evidence.mjs` still run, no HTML is rendered, and `implement-ticket`
prints a chat summary instead: the verdict, the test counts, what was not
tested, and the screenshots folder.

**A report for a whole item** (`report_scope: item`). The ticket that
empties its item's backlog renders one report for the item: the evidence
of all its tickets, and their storyboards and diagrams, merged. One line in
the report says where the item's tickets live.

**The PDF.** With `validation.report_pdf` `true`, `render-pdf.mjs`, beside
`render-report.mjs`, writes `agent-report.pdf` next to the HTML. Without a
headless browser it skips, writes the reason to `report.json`'s
`pdf.skipped`, and the report shows it under Not tested.

**The video.** With `validation.video_walkthrough` `true` and in scope
(`video_scope`: `ticket` gives every ticket's report the video, `item`
only the ticket that empties its item's backlog), the video is captured in
the same single pass as the screenshots, never in a second one.

- One recording per role, with Playwright's video. With ffmpeg, combine
  them side by side with a caption per chapter into `walkthrough.mp4`.
  Without ffmpeg, keep one `.webm` per role and say so in the video's
  `claim`.
- Detect the method once and write it into Conventions as a `video
  method:` line, as the screenshot method is.
- `video_commit` `false`: add the video to `.gitignore`, at whichever of
  the two places it lives.
- `video_max_mb`: a larger video is re-encoded or shortened first.
  `check-evidence.mjs` measures the real file.

## Report schema

`validation/report.json`, read by `render-report.mjs` and by
`check-evidence.mjs`, one object:

```json
{
  "ticket": "0007-prices",
  "title": "Prices",
  "spec": "specs/system.md",
  "branch": "feat/0007-prices",
  "started": "2026-01-01T10:00:00Z",
  "ended": "2026-01-01T12:00:00Z",
  "ended_by": "exit conditions passed",
  "verdict": { "builder": "ready_with_notes", "reasons": ["<at most 3>"], "judge": null },
  "summary": "<at most 3 sentences and 60 words>",
  "steps": [ { "n": 1, "summary": "<what exists now because of it>" } ],
  "tests": [
    { "kind": "unit", "name": "<test name>", "proves": "<step or invariant>", "result": "pass", "evidence": null },
    { "kind": "end to end", "name": "<test name>", "proves": "invariant 4", "result": "pass", "evidence": "invariant-04-order-total-1280x800.png" },
    { "kind": "end to end", "name": "<test name>", "proves": "D2 of specs/system.md", "result": "pass", "evidence": "invariant-d2-table-state-1280x800.png" }
  ],
  "not_tested": [ { "what": "<what>", "reason": "<why>" } ],
  "commands": [
    { "command": "npm run lint", "exit_code": 0, "commit": "<hash>", "whole_suite": false },
    { "command": "npx playwright test", "exit_code": 0, "commit": "<hash>", "whole_suite": true }
  ],
  "screenshots": [
    { "file": "walkthrough-01-menu", "claim": "<what to look at>", "sizes": ["1280x800", "390x844"] },
    { "file": "before-walkthrough-01-menu", "claim": "<the same screen on the base branch>", "sizes": ["1280x800", "390x844"] }
  ],
  "journeys": [
    { "role": "<role>", "steps": [
      { "n": 1, "caption": "<at most 12 words>", "screenshot": "walkthrough-01-menu", "before": "before-walkthrough-01-menu" }
    ] }
  ],
  "changes": [
    { "file": "app/prices.ts", "module": "prices", "added": 10, "removed": 2, "risk": "high", "risk_reason": "<why>" }
  ],
  "problems": [ { "problem": "<what>", "cause": "<why>", "fix": "<what changed>", "commit": "<hash>" } ],
  "videos": [
    { "file": "walkthrough.mp4", "claim": "<what it shows>", "duration_s": 40, "size_mb": 4.2,
      "chapters": [ { "at_s": 0, "title": "<chapter>" } ] }
  ],
  "traces": [ { "test": "<test name>", "file": "traces/<test>.zip", "retried": true } ],
  "coverage": { "changed_lines_pct": 91.5 },
  "pdf": { "skipped": "<why, when render-pdf.mjs could not write it>" },
  "rounds": [ { "round": "judge round 1", "findings": ["<one line per finding>"] } ],
  "diagrams": [ { "title": "Modules and dependencies", "text": "flowchart LR\n..." } ]
}
```

Always required: `verdict`, `summary`, `journeys` when there is a UI (any
`walkthrough-` screenshot), `changes`, `problems` (each may be an empty
list) and `not_tested`. Required only when the config asks:

- `videos`: with `video_walkthrough` `true` and in scope.
- `traces`: with `traces` `true`, an entry for every failed test and
  every retried test; otherwise `[]` or left out.
- `coverage`: with `changed_line_coverage` `true`; otherwise `null` or left
  out.
- `pdf`: `null` (or left out) when the PDF was written or is not due;
  `{ "skipped": "<reason>" }` when `report_pdf` is `true` and
  `render-pdf.mjs` skipped. `check-evidence.mjs` then accepts the missing
  PDF.
- `journeys[].steps[].before`: with `before_after` `true`; otherwise
  `null`.

`verdict.builder` is `ready`, `ready_with_notes` or `not_ready`, by the
rules in "The validation report"; `reasons` has at most 3 entries.
`verdict.judge` is `null` until the judge runs, then the judge's own
entry, `{ "round": 1, "result": "pass", "line": "<its one line>" }`. The
builder never writes it and a regeneration carries it over.

`summary` is at most 3 sentences and 60 words. A journey step's `caption`
is at most 12 words and its `screenshot` is the `file` of an entry in
`screenshots`; its `before` is the `file` of the same screen on the base
branch, also an entry in `screenshots`, present at every declared size.
`changes` has one entry per changed file, with `added` and `removed` from
`git diff --stat` against the base branch and a `risk` of `high`,
`medium` or `low` by the rules in "The validation report". Each `problems`
field and each `not_tested` line (what and reason together) is at most 25
words. A `videos[].file` is a path relative to the folder that holds the video:
the ticket's `validation/` at scope `ticket`, `items/<item>/validation/`
at scope `item`. A `traces[].file` is relative to the ticket's
`validation/`. `size_mb` is for the renderer; the check measures the file.
`chapters[].at_s` is seconds from
the start. In `tests[].proves`, a design invariant is written `D<n> of
<spec path>`.

`commands` carries every command run this round, not only the
exit-conditions block; a test carries `"proved_failing": true` when the old-code proof was run and
`"bug_fix": true` when it covers a bug fix; under `test scope: full` the one whole-suite run of the round (see step 4)
has `whole_suite: true`, on the commit it ran on — `check-evidence.mjs`'s
whole-suite rule reads exactly this; under `feature` no command carries it
and the rule is off. A command may carry `"deferred": true` under `feature`
only: an unrelated failure, noted and not chased. A Conventions check or
one of the ticket's exit conditions is never deferred; `check-evidence.mjs`
refuses the flag on one and counts its failure. `screenshots[].sizes` names every
size actually captured for that shot — every size Conventions declares
must be among them, and each must exist as `<file>-<size>.png` under
`validation/screenshots/`. `screenshots[].file` matches its filenames
without the size suffix, and carries the `walkthrough-`, `before-walkthrough-`,
`invariant-` or `exit-` prefix the naming rules above give it.
`diagrams[].text` is the fenced block's contents without the fence, one
entry per diagram kind: module graph, schema, sequence, lifecycle. Each
diagram is drawn from the code as built after the ticket, whole; this
ticket's changes are in a `changed` class (e.g. `classDef changed
fill:#fff3bf,stroke:#b38600` in a flowchart), removed parts dashed, and
the diagram carries a legend saying so. The module-and-dependency diagram
carries a caption of at most two sentences: what changed and which steps
did it.

## The whole-suite record

Only under `test scope: full`; under `feature` there is no such run and
no `suite-runs.json`. A whole-suite run is every check from Conventions and every end-to-end spec and
exit-conditions command run together, back to back, nothing failing in
between. Append each one to `validation/suite-runs.json` — one line per
run: the commit, the commands, the exit codes, how long it took.

- `review.reuse_suite_run: true` (default): a whole-suite run already
  recorded there for the commit step 4 would otherwise re-run stands in
  for it; nothing runs twice for the same commit. `false`: always run it
  again.

## Checklist

What round after round of judging keeps finding, written down so it
stops recurring. `judge` reads this section too, as part of what it
checks.

- Every screenshot shows what its file name claims, readable at every
  declared size; scroll or capture full page when needed; wait for a
  live view to be connected before capturing it. Look at each image.
- Name `exit-NN-*` only for this ticket's exit condition NN,
  `invariant-NN-*` only for invariant NN. Screenshots a shared spec file
  produces for other tickets' screens are not kept.
- A refusal's screenshot shows the refusal as a person sees it.
- Browser tests check the visible layout at each size.
- Tests clean up what they create.
- A state change that must respect a rule reads its row under a lock; a
  test races two changes and fails without the lock. Write that test
  first.
- Every new route gets tests over HTTP for each refusal it has.
- Every change another screen shows is published to every screen that
  shows it; a test with a second screen already open proves it.
- A screen takes its state from the server, so a second and a reloaded
  screen show the same.
- Live-publish tests listen only after their setup.
- Anything that must not reach a client is checked in the raw response.
- Each test claim is proved by mutation: remove the code it protects, see
  it fail, restore. Say so in the report.
- Bad input gets a 4xx, never a 500; bound anything a client can make
  large or repeat. Browser code imports no server-only module.
- Never run two test suites that share state at the same time.

## Stop when

- A test cannot be written for a step: say why in the report, under Not
  tested, and continue with the step's work; the judge reads it there.
- A check fails and the fix would be to change the check: stop. Write
  what is wrong with the check in the report. A person edits specs and
  tests.
- The ticket is HITL and reaches the point that needs the person: stop
  and say what is needed.
- A blocked-by ticket is not in `done/`: stop before the branch.
- The branch is about to be pushed or a pull request opened: it is not.
  How it lands is not this method's job; the report is the hand-back.

## Attribution

Test first per step is Kent Beck's test-driven development, as commonly
practised: red, green, refactor. The walking-skeleton-first rule, the
separate test database, the two-browser-context step and the audit are
this project's own, from `write-tickets`. The rest is ours: the test named
after the step's proves clause, the three screenshot sets as evidence,
the self-contained report in the ticket's folder, the branch convention,
and the never-soften rule: a check that skips itself when inconvenient
is how a test suite becomes decoration.

Licence: MIT, see `LICENSE` beside this folder.
