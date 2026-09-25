---
name: build
description: The method for working one ticket to done — a working copy on its own branch, one test written before each step and named after what the step proves, validation from lint to end to end with screenshots wherever there is a UI, a self-contained HTML validation report at validation/agent-report.html, and a hand-back with the report's path. The builder agent follows it; a person can type it to work a ticket by hand. Never softens a check; stops and says so instead.
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
screenshot sizes and method, GitHub project — live in one place: a
`## Conventions` section in the project's CLAUDE.md (or AGENTS.md for a
Codex mirror), a fixed set of bullet keys:

```
## Conventions
- base branch: main
- checks (cheapest first): npm run lint; npx tsc --noEmit; npm test; npm run build
- end to end: npx playwright test
- screenshots: Playwright, 1280x800 and 390x844, saved per test
- workflow config: .claude/workflow.yml
- github project: <name, or none>
```

`write-tickets` and `judge` read it the same way this method does.
`write-tickets` defines every key here except `screenshots` and
`workflow config`, which are this method's own. When
it is missing: detect what it would say — `package.json`, a `Makefile`,
CI config for the checks; a UI or not, and which kind, for the
screenshot method — then write it in, so the next ticket does not
detect it again. Defaults when nothing declares it: a web UI gets
Playwright at 1280x800 and 390x844; a terminal UI gets text captures; no
UI gets command output saved as text; the base branch is `main`; the
workflow config is `.claude/workflow.yml` if that file exists, else
every default in the next section.

## The workflow config

A file of flat, commented keys, `.claude/workflow.yml`, tunes how this
method, `judge` and `implement-ticket` work in this project — `install.sh`
copies a starting one, never over a project's own. One `key: value` per
line; a list is written `[]` or `[a, b]`; `models` is the one inline map.
A key the file leaves out, or a missing file, takes the default below.

- `evidence_check` — `script` (default) or `judge`. `script`: this
  method runs `build/scripts/check-evidence.mjs <ticket-folder>` before
  hand-back and fixes everything it reports; `judge` also runs it first.
  `judge`: the script does not run; only the judge's own reading of the
  screenshots and report catches evidence problems.
- `judge_findings` — `split` (default) or `all-blocking`. `judge`'s own
  key; see that method.
- `evidence_recheck` — `short-pass` (default) or `full-round`. `judge`'s
  and `implement-ticket`'s own key; see those methods.
- `report` — `from-data` (default) or `handwritten`. `from-data`: this
  method writes `validation/report.json` (schema below), then renders
  `validation/agent-report.html` from it with
  `build/scripts/render-report.mjs <ticket-folder>`. `handwritten`: the
  report is written by hand, as the template further below lays it out,
  with no `report.json`.
- `screenshots_capture` — `once` (default) or `every-round`. `once`:
  every screenshot is captured in a single pass, right after the last
  code change of a round — not once per step. `every-round`: capture
  happens per step, as an earlier round of this project might.
- `screenshot_sizes_phone_only_for` — a list of screen name globs, `[]`
  by default. A screen matching one only needs the phone size — the last
  size the Conventions `screenshots` line lists — captured and checked;
  every other screen still needs every declared size.
- `e2e_server` — `dev` (default) or `production`; `e2e_workers` — `1`
  (default). See "Production and parallel end to end" below.
- `share_suite_result`, `skip_baseline_when_judged` — both `true` by
  default. See "The whole-suite record" below.
- `background_waits` — `foreground` (default) or `poll`. `foreground`:
  every long command runs in the foreground with a timeout long enough
  to finish; a sleep loop that polls for a result is never written,
  here or in `judge`. `poll` allows one, when the harness gives no other
  way to wait.
- `parallel_tickets` — `1` (default). `implement-ticket`'s own key; see
  that method.
- `models` — `{ builder: sonnet, judge: opus, evidence: sonnet }` by
  default. `implement-ticket`'s own key; see that method.

## Do

**1. The branch.** Never work on the project's base branch (from
Conventions; default `main`). On the base branch, create or switch to
`<kind>/<slug>` from the ticket's `Kind:` line, e.g. `feat/0007-prices`
— create it fresh, or switch to it if an earlier round already made it
— then work there. On any other branch, stay there — a harness or a
person already prepared it.

**2. The checks pass first.** Step 1 of every ticket: the walking
skeleton on an empty repository, or the baseline confirmed on a green one,
or the checks repaired on a red one. Nothing else in that step. Skipped
when `skip_baseline_when_judged` applies — see "The whole-suite record"
below.

**3. Every step, test first.** For each unticked step, in order:

1. Name the test after the step's `proves:` clause. One test, one claim.
2. Write it. Run it. See it fail, and for the right reason: the thing is
   missing, not the test broken.
3. Implement the least that makes it pass. Run the whole suite.
4. Refactor with the suite green.
5. Commit: `<type>(<NNNN>): step <n>, <what the step built>`, one commit
   per step, and tick the step.

A step whose `proves:` clause no command can check gets its work done and
its claim written under Not tested in the report, with the reason. Never
skip it silently.

**4. Validate, cheapest first.** The checks from Conventions, cheapest
first, then the end-to-end command from Conventions, then the ticket's
exit-conditions block as it stands. All green, or stop at the first red
and go back to step 3. Record every whole-suite run in
`validation/suite-runs.json` — see "The whole-suite record" below.

With a UI, end to end is mandatory, and three sets of shots exist before
validation counts, each captured by Conventions' screenshot method, at
every size Conventions declares (or only the phone size, the last size
Conventions lists, for a screen `screenshot_sizes_phone_only_for`
names):

- **One full walkthrough** of the flow the ticket delivers, as a user
  would do it, with a shot at every screen it passes, at every declared
  size. Named `walkthrough-<NN>-<screen>.png`.
- **One test per invariant the ticket touches**, named
  `invariant-<NN>-<slug>`, with a shot at the moment the invariant is
  observed. Under Invariants this touches, every line has a test.
- **One test per exit condition a screen can observe**, named
  `exit-<NN>-<slug>`, with its shot.

With `screenshots_capture: once` (default), capture every one of these in
a single pass, right after the last code change of the round — not once
per step; `every-round` captures as each step lands instead. Save each
shot straight into the ticket's `validation/screenshots/` folder as it is
captured.

**Production and parallel end to end.** `e2e_server: production` runs
the end-to-end command from Conventions against a production build
instead of the dev server named there — only when the project documents
how (its own script or Conventions line); confirm that documentation
exists before relying on it, and stop and say the project has no
production end-to-end support if it does not. This method never adds
that support itself — it is a project change, done as its own ticket.
`e2e_workers` above `1` is passed to the end-to-end runner as its worker
count; it needs the project to give each worker its own test resources
(a database, a port), documented the same way — without that, run with
one worker regardless of the key's value.

**5. The report.** `validation/agent-report.html` in the ticket folder,
self-contained: screenshots by relative path in `screenshots/`, no
external asset but the diagram renderer. Written for someone who has not
seen the ticket: plain words, every project term explained once.
Sections, in order: implemented, per step; tests by kind with each
result; the commands with exit codes; not tested and why; the
screenshots with one line each on what to look at; the diagrams of the
code as built, whole, with this ticket's changes highlighted; the
rounds — the judge's, and the person's requested changes — appended as
they happen.

With `report: from-data` (default): write `validation/report.json` first
(schema below), then run `node build/scripts/render-report.mjs
<ticket-folder>` to produce the HTML from it. Regenerate `report.json`
whole after every round, then re-render; the one edit anyone else makes
is the judge's line appended to `report.json`'s `rounds`, which the next
regeneration carries over. With `report: handwritten`: write the HTML
directly, from the template further below, the same way each round.

Commit the report (and `report.json`, with `from-data`) and
`validation/screenshots/` every time they are written —
`<type>(<NNNN>): report` — so the tree is clean for the judge and for
the merge `implement-ticket` makes on accept.

**6. Hand back.** With `evidence_check: script` (default), run `node
build/scripts/check-evidence.mjs <ticket-folder>` and fix everything it
reports before anything else here — each line it prints names one
problem with the screenshots or the report against the ticket and the
Conventions. Push nothing. How the branch lands is not this
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
  "steps": [ { "n": 1, "summary": "<what exists now because of it>" } ],
  "tests": [
    { "kind": "unit", "name": "<test name>", "proves": "<step or invariant>", "result": "pass", "evidence": null },
    { "kind": "end to end", "name": "<test name>", "proves": "invariant 4", "result": "pass", "evidence": "invariant-04-order-total-1280x800.png" }
  ],
  "not_tested": [ { "what": "<what>", "reason": "<why>" } ],
  "commands": [
    { "command": "npm run lint", "exit_code": 0, "commit": "<hash>", "whole_suite": false },
    { "command": "npx playwright test", "exit_code": 0, "commit": "<hash>", "whole_suite": true }
  ],
  "screenshots": [
    { "file": "walkthrough-01-menu", "claim": "<what to look at>", "sizes": ["1280x800", "390x844"] }
  ],
  "rounds": [ { "round": "judge round 1", "findings": ["<one line per finding>"] } ],
  "diagrams": [ { "title": "Modules and dependencies", "text": "flowchart LR\n..." } ]
}
```

`commands` carries every command run this round, not only the
exit-conditions block; the one whole-suite run of the round (see step 4)
has `whole_suite: true`, on the commit it ran on — `check-evidence.mjs`'s
whole-suite rule reads exactly this. `screenshots[].sizes` names every
size actually captured for that shot — the sizes required (all of
Conventions', or the phone one alone for a
`screenshot_sizes_phone_only_for` screen) must be among them, and each
must exist as `<file>-<size>.png` under `validation/screenshots/`.
`screenshots[].file` matches its filenames without the size suffix, and
carries the `walkthrough-`, `invariant-` or `exit-` prefix the naming
rules above give it. `diagrams[].text` is the fenced block's contents
without the fence, one entry per diagram kind (module graph, schema,
sequence, lifecycle) the template below lists.

## The whole-suite record

A whole-suite run is every check from Conventions and every
exit-conditions command run together, back to back, nothing failing in
between. Append each one to `validation/suite-runs.json` — one line per
run: the commit, the commands, the exit codes, how long it took.

- `share_suite_result: true` (default): a whole-suite run already
  recorded there for the commit step 4 would otherwise re-run stands in
  for it; nothing runs twice for the same commit. `false`: always run it
  again.
- `skip_baseline_when_judged: true` (default): step 2 is skipped entirely
  when `.claude/last-judged.json` at the repository root names a commit
  matching the base branch's current head — that commit already passed a
  judge round, so the baseline is known green. `implement-ticket`'s
  accept step writes that file. No such file, or its commit does not
  match the base's head: run step 2 as above. `false`: always run it.

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

## The report template

The layout `render-report.mjs` renders from `report.json`, and the one to
follow by hand with `report: handwritten`:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>NNNN — <title>: validation report</title>
<style>
  body { font: 15px/1.5 system-ui, sans-serif; max-width: 60rem; margin: 2rem auto; padding: 0 1rem; color: #222; }
  table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid #ccc; padding: .3rem .5rem; text-align: left; }
  .pass { color: #1a7f37; } .fail { color: #b3261e; }
  figure { margin: 1rem 0; } figure img { max-width: 100%; border: 1px solid #ccc; } figcaption { font-size: .9em; color: #555; }
  pre { background: #f6f6f6; padding: .5rem; overflow-x: auto; }
</style>
<script type="module">
  import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
  mermaid.initialize({ startOnLoad: true });
</script>
</head>
<body>
<h1>NNNN — <title>: validation report</h1>
<p>Ticket <code>items/&lt;item&gt;/tickets/&lt;column&gt;/NNNN-&lt;slug&gt;/ticket.md</code> · spec <code>&lt;parent&gt;</code> · branch <code>&lt;branch&gt;</code> · run &lt;started&gt; to &lt;ended&gt;, ended by &lt;exit conditions passed | a step could not be finished | stopped by a person&gt;</p>

<h2>Implemented</h2>
<ol><li>step 1: <what exists now because of it></li></ol>

<h2>Tests</h2>
<table><tr><th>Kind</th><th>Test</th><th>Proves</th><th>Result</th><th>Evidence</th></tr>
<tr><td>unit</td><td><name></td><td><step or invariant></td><td class="pass">pass</td><td></td></tr>
<tr><td>end to end</td><td>invariant-04-order-total</td><td>invariant 4</td><td class="pass">pass</td><td><a href="screenshots/invariant-04-order-total.png">screenshot</a></td></tr>
</table>
<pre><command>   exit 0
<command>   exit 0</pre>

<h2>Not tested</h2>
<ul><li><what>, because <reason></li></ul>

<h2>Screenshots</h2>
<h3>Walkthrough</h3>
<figure><img src="screenshots/walkthrough-01-<screen>.png" alt=""><figcaption><what to look at></figcaption></figure>
<h3>Invariants</h3>
<figure><img src="screenshots/invariant-04-order-total.png" alt=""><figcaption>invariant 4: <what to look at></figcaption></figure>
<h3>Exit conditions</h3>
<figure><img src="screenshots/exit-01-<slug>.png" alt=""><figcaption><what to look at></figcaption></figure>

<h2>Diagrams</h2>
<p>The code as built after this ticket, drawn from the code, whole; what this ticket changed is in class <code>changed</code>, removed parts dashed.</p>
<h3>Modules and dependencies</h3>
<pre class="mermaid">flowchart LR
  classDef changed fill:#fff3bf,stroke:#b38600
  ...</pre>
<p><at most five sentences: what changed and which steps did it></p>
<h3>Schema</h3>
<pre class="mermaid">erDiagram
  ...</pre>
<h3>Sequence: <the flow this ticket delivered></h3>
<pre class="mermaid">sequenceDiagram
  ...</pre>
<h3>Lifecycle</h3>
<pre class="mermaid">stateDiagram-v2
  ...</pre>

<h2>Rounds</h2>
<ol><li>judge round 1: <findings, one line each, and what changed for each></li>
<li>change round 1: <the person's requested changes, one line each, and what changed for each></li></ol>
</body>
</html>
```

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
