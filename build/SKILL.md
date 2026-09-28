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
  method runs `.claude/skills/build/scripts/check-evidence.mjs
  <ticket-folder>` before hand-back and fixes everything it reports —
  the path a project installs it at; in the skills repo itself, the
  scripts below sit at `build/scripts/` — `judge` also runs it first.
  `judge`: the script does not run; only the judge's own reading of the
  screenshots and report catches evidence problems.
- `judge_findings` — `split` (default) or `all-blocking`. `judge`'s own
  key; see that method.
- `evidence_recheck` — `short-pass` (default) or `full-round`. `judge`'s
  and `implement-ticket`'s own key; see those methods.
- `e2e_workers` — `1` (default). See "Parallel end to end" below.
- `share_suite_result` — `true` by default. See "The whole-suite record"
  below.
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
or the checks repaired on a red one. Nothing else in that step.

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
and go back to step 3. Every command runs in the foreground with a
timeout long enough to finish; a sleep loop that polls for a result is
never written, here or in `judge`. Record every whole-suite run in
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
  as `specs/design.md`'s invariants are named) — every one has a test.
- **One test per exit condition a screen can observe**, named
  `exit-<NN>-<slug>`, with its shot.

Capture every one of these in a single pass, right after the last code
change of the round — never once per step. Save each shot straight into
the ticket's `validation/screenshots/` folder as it is captured.

**Parallel end to end.** The end-to-end command from Conventions is what
runs; a project that wants it against a production build puts that in
its `end to end:` line. `e2e_workers` above `1` is passed to the
end-to-end runner as its worker count; it needs the project to give
each worker its own test resources (a database, a port), documented the
same way — without that, run with one worker regardless of the key's
value.

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

Write `validation/report.json` first (schema below), then run `node
.claude/skills/build/scripts/render-report.mjs <ticket-folder>` to
produce the HTML from it. Regenerate `report.json` whole after every
round, then re-render; the one edit anyone else makes is the judge's
line appended to `report.json`'s `rounds`, which the next regeneration
carries over.

Commit the report, `report.json`, and `validation/screenshots/` every
time they are written — `<type>(<NNNN>): report` — so the tree is clean
for the judge and for the merge `implement-ticket` makes on accept.

**6. Hand back.** With `evidence_check: script` (default), run `node
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
size actually captured for that shot — every size Conventions declares
must be among them, and each must exist as `<file>-<size>.png` under
`validation/screenshots/`. `screenshots[].file` matches its filenames
without the size suffix, and carries the `walkthrough-`, `invariant-` or
`exit-` prefix the naming rules above give it. `diagrams[].text` is the
fenced block's contents without the fence, one entry per diagram kind:
module graph, schema, sequence, lifecycle. Each diagram is drawn from
the code as built after the ticket, whole; this ticket's changes are in
a `changed` class (e.g. `classDef changed fill:#fff3bf,stroke:#b38600`
in a flowchart), removed parts dashed. The module-and-dependency diagram
carries a caption of at most five sentences: what changed and which
steps did it.

## The whole-suite record

A whole-suite run is every check from Conventions and every
exit-conditions command run together, back to back, nothing failing in
between. Append each one to `validation/suite-runs.json` — one line per
run: the commit, the commands, the exit codes, how long it took.

- `share_suite_result: true` (default): a whole-suite run already
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
