---
name: judge
description: The method for checking one built ticket — run the ticket's checks again (all of them under `test scope: full`), read the diff for softened tests or edited specs, read every screenshot as an image against what it claims to prove, read the report's walkthrough storyboard and video frames against the ticket's flow, then write the verdict to validation/verdict.md and report.json and append findings to PROGRESS.md as unticked judge round <n> lines for the builder. Never fixes anything. The judge agent follows it on Opus; a person can type it.
disable-model-invocation: true
---

# Judge

Check one built ticket and say whether it is done. Trust nothing the
report claims until you have seen it: run the commands, read the diff,
look at the pictures. Then pass, or find issues, one finding at a time,
each tied to the step, invariant or screenshot it is about. Fix nothing
yourself; the builder works your findings.

## Argument

A ticket: a slug or a path under `items/<item>/tickets/`. Its folder
holds `ticket.md` and `validation/`.

```
/judge 0007-prices
```

## Look first

- `ticket.md` in full: Steps and which are ticked, Invariants this
  touches, exit conditions, Not tested, the judge rounds already
  appended to `PROGRESS.md`.
- The parent spec and `specs/system.md`: the invariants by number.
- `validation/report.json`, `validation/agent-report.html` when a rendered
  report is due (the build skill's "The validation report" says when),
  and every file under `validation/`.
- `git diff <base>...HEAD` in the worktree, `<base>` the project's base
  branch from CLAUDE.md Conventions (default `main`; see the build
  skill), and any earlier `judge round` findings already in `PROGRESS.md`.
- Which round this is: one more than the highest `judge round <n>` line
  already in `PROGRESS.md`.
- The project's workflow config (see the build skill's Conventions
  section): `.claude/workflow.yml`, or every default when it and the
  `workflow config` key are both absent. This method reads
  `models.recheck`, `review.evidence`, `review.evidence_findings`,
  `review.reuse_suite_run`, and `validation.report`,
  `validation.video_walkthrough`, `validation.video_scope` and
  `validation.before_after` from it.

## Do

**1. Run everything again.** With `review.evidence: script` (default), run
`node .claude/skills/build/scripts/check-evidence.mjs <ticket-folder>`
first (the build skill's own script, at its installed path — see its
workflow config section for where it sits in the skills repo itself) —
every line it prints is a finding, labelled `evidence` (see step 6).
Under `step gate: changed-tests` the builder ran the exit conditions once, at the
end; the judge runs them in full here either way.
Then every command in the ticket's exit-condition block, and the checks
from Conventions, yourself, in the worktree, comparing each exit code
with the report's table; a claimed pass that fails here is a finding, so
is a command the report does not list. Under `test scope: feature` (the default in Conventions) that is all: the
checks, the ticket's exit conditions, and the end-to-end specs covering
the shared files the ticket's diff touched; the whole end-to-end suite is
never run, and a failure in a spec that neither belongs to the ticket nor
covers a touched file is noted, not a finding. A check or an exit
condition is never deferred, nor is a command that runs one of their
test files; one the report marks `deferred` is a finding. Under `test scope: full` the
end-to-end command runs too, the same
way, unless `review.reuse_suite_run: true` (default) and
`validation/suite-runs.json` already records a whole-suite run — see the
build skill — for the exact commit under test; then trust that recorded
run instead of running it again. Every command runs in the foreground
with a timeout long enough to finish; never write a sleep loop to poll
for one's result.

**2. Read the diff for softening.** A test deleted, skipped, marked
`.only`, weakened, or with its assertion commented; a spec, a ticket's
exit conditions or an invariant edited; a check wrapped in a condition;
a fixture changed so a failing case no longer runs. Each is a finding,
and the finding names the line.

**3. Read every screenshot as an image**, against the claim its name and
caption make: the invariant number, the step, the screen. A screenshot
that does not show the claim, shows an error, shows a default the
framework put there, or is missing for a screen the walkthrough passes,
is a finding. Every size the project's Conventions declare (see the
build skill) exists for every walkthrough screen, or that is a finding.

Then read the walkthrough storyboard against the flow the ticket
delivers: every screen the flow passes has a step, each step's caption
says what its screenshot shows, and a before screenshot, when present,
is the base branch and not this one. Read the report's first screen, the
verdict banner, tiles and summary: it answers "can I accept this?" on
its own. The text caps hold (summary 3 sentences and 60 words, a
caption 12, a not-tested or problems line 25, at most 3 verdict
reasons); a cap `check-evidence.mjs` misses is a finding.

When a video is due (`validation.video_walkthrough` `true` and in scope,
see the build skill's "The video"), extract a frame at each chapter's
`at_s` with `ffmpeg -ss <at_s> -i <video> -frames:v 1 <frame>.png`, or
read the frames of each `.webm` file, and read them against the
storyboard. The chapters come from `compose-video.mjs`, which writes them
from the scene starts of the cut. A video that does not show the flow is a finding, labelled
`evidence`.

**4. Check coverage.** Every unticked step is a finding. Every ticked
step has a test named for its proves clause, or a line under Not tested
with a reason you accept. Every invariant under Invariants this touches
has an end-to-end test with a screenshot where a frontend exists. In the
traceability grid, every touched invariant, the D-numbered ones
included, has a passing test or a not-tested line; a red or empty row
is a finding. The builder's verdict, `verdict.builder` in `report.json`,
is the one the build skill's fixed rules give for the evidence you have
now seen; a softer one is a finding. Every
line under Not tested is a real reason, not a way out. Every line in the
build skill's `## Checklist` section is satisfied, or is a finding tied
to what that line protects.

**5. Read the built thing as a user.** Walk the flow the ticket delivers
in a browser or at the command line, once, without the tests. Something
on screen that no step names and no test checks is a finding, tied to
the spec line it breaks or the words "nobody asked for this".

**6. The verdict.**

- **Pass**: nothing found. Write one paragraph to `validation/verdict.md`
  and commit it: what was checked, what the commands returned, how many
  screenshots were read. Append `- [x] judge round <n>: pass` to
  `PROGRESS.md` and to the report's Rounds section, write your verdict
  line into `report.json`'s `verdict.judge` as `{ "round": <n>,
  "result": "pass", "line": "<one line>" }` (the shape is in the build
  skill's "Report schema"), re-render the report when one is due, and
  commit `verdict.md` and the report together — `PROGRESS.md` is a
  working file and is not committed. The accept that follows merges from
  a clean tree.
- **Findings**: label each one `behaviour` or `evidence` first —
  `evidence` is about what is shown (a screenshot, the report, a name);
  `behaviour` is about what the code does. Append the same to
  `validation/verdict.md` and commit it, one finding per line, each with
  its label: what is wrong, which step, invariant or screenshot it is
  about, and what would satisfy it. Append the same findings to
  `PROGRESS.md` as unticked lines, `- [ ] judge round <n>: <label>:
  <finding>`, one each, and one line per finding to the report's
  Rounds section; write `verdict.judge` as above with `"result":
  "changes"`; re-render the report when one is due and commit
  `verdict.md` and the report together — `PROGRESS.md` is a working file
  and is not. The builder works them.

Your line is yours: never edit `verdict.builder` or its reasons, even
when you find them wrong; that is a finding.

Every finding is labelled `behaviour` or `evidence`, always. When every
finding of this round is labelled `evidence`, say so in `verdict.md`:
with `review.evidence_findings: recheck` (default), `implement-ticket`
runs the builder's fix, then a short recheck instead of a full round —
`check-evidence.mjs` plus reading only the changed screenshots and
report sections, on the model `models.recheck` names (see the build
skill's workflow config). With `review.evidence_findings: full-round`,
an all-evidence round gets a full judge round instead. A round mixing
`behaviour` findings with `evidence` ones always gets a full judge round,
regardless of `review.evidence_findings`.

A finding is never "improve", "consider" or "maybe". It names one thing
that is wrong and one thing that would make it right.

## Stop when

- The report is missing or empty: that is the only finding this round.
- A command in the exit conditions cannot run on this machine: say which
  and why; do not pass it.
- You are about to change a file that is not `PROGRESS.md`, the verdict,
  or the report's Rounds section and `verdict.judge` (and the HTML
  rendered from them): do not. The judge fixes nothing.
- The ticket asks for a person's judgement that is not yours to make, a
  design preference, a credential: say so and stop, for a person to
  decide.

## Attribution

"Checking the checks" and the judge as a second reader are ours: a
check softened to make something pass hides inside a green result. So
are run again rather than trust, the screenshot read as an image against its claim,
the finding as one wrong thing and one right thing, and the findings as
appended steps so the loop needs no other channel.

Licence: MIT, see `LICENSE` beside this folder.
