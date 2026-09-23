---
name: judge
description: The method for checking one built ticket — run every check again, read the diff for softened tests or edited specs, read every screenshot as an image against what it claims to prove, then write the verdict to validation/verdict.md and append findings to PROGRESS.md as unticked judge round <n> lines for the builder. Never fixes anything. The judge agent follows it on Opus; a person can type it.
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
- `validation/agent-report.html` and every file under `validation/`.
- `git diff <base>...HEAD` in the worktree, `<base>` the project's base
  branch from CLAUDE.md Conventions (default `main`; see the build
  skill), and any earlier `judge round` findings already in `PROGRESS.md`.
- Which round this is: one more than the highest `judge round <n>` line
  already in `PROGRESS.md`.

## Do

**1. Run everything again.** Every command in the ticket's exit-condition
block, and the checks and end-to-end command from Conventions (see the
build skill), yourself, in the worktree. Compare each exit code with the
report's table. A claimed pass that fails here is a finding; so is a
command the report does not list.

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

**4. Check coverage.** Every unticked step is a finding. Every ticked
step has a test named for its proves clause, or a line under Not tested
with a reason you accept. Every invariant under Invariants this touches
has an end-to-end test with a screenshot where a frontend exists. Every
line under Not tested is a real reason, not a way out.

**5. Read the built thing as a user.** Walk the flow the ticket delivers
in a browser or at the command line, once, without the tests. Something
on screen that no step names and no test checks is a finding, tied to
the spec line it breaks or the words "nobody asked for this".

**6. The verdict.**

- **Pass**: nothing found. Write one paragraph to `validation/verdict.md`
  and commit it: what was checked, what the commands returned, how many
  screenshots were read. Append `- [x] judge round <n>: pass` to
  `PROGRESS.md` and to the report's Judge rounds — `verdict.md` is
  committed; `PROGRESS.md` is a working file and is not.
- **Findings**: append the same to `validation/verdict.md` and commit it,
  one finding per line, each with: what is wrong, which step, invariant
  or screenshot it is about, and what would satisfy it. Append the same
  findings to `PROGRESS.md` as unticked lines, `- [ ] judge round <n>:
  <finding>`, one each — `verdict.md` is committed; `PROGRESS.md` is a
  working file and is not. The builder works them.

A finding is never "improve", "consider" or "maybe". It names one thing
that is wrong and one thing that would make it right.

## Stop when

- The report is missing or empty: that is the only finding this round.
- A command in the exit conditions cannot run on this machine: say which
  and why; do not pass it.
- You are about to change a file that is not `PROGRESS.md`, the verdict,
  or the report's Judge rounds section: do not. The judge fixes nothing.
- The ticket asks for a person's judgement that is not yours to make, a
  design preference, a credential: say so and stop, for a person to
  decide.

## Attribution

"Checking the checks" and the judge as a second reader are this
project's own, from [agentic-engineering: anthrazit.md](https://github.com/SaschaKubisch/agentic-engineering/blob/main/masters/anthrazit.md):
a check softened to make something pass hides inside a green result. The rest is ours: run again
rather than trust, the screenshot read as an image against its claim,
the finding as one wrong thing and one right thing, and the findings as
appended steps so the loop needs no other channel.

Licence: MIT, see `LICENSE` beside this folder.
