---
name: implement-ticket
description: The loop for one ticket — `<slug> [--judge]`, typed by a person. Claims it, applying the ready gate as it moves the ticket from backlog to in-progress; creates or switches to its branch; starts the builder agent (the build method, on the model the project's workflow config names, sonnet by default) and, only with --judge, the judge agent (the judge method, opus by default) afterward — while the judge requests changes the builder works a review round on the findings, then the judge again, no round cap but a question after each judge round from the third on that still has findings. Opens the validation report, then asks the person to accept it (merge --no-ff, move the ticket to done, offer the next frontier ticket), request changes (another builder round), or stop without accepting.
disable-model-invocation: true
---

# Implement ticket

Run one ticket: claim it, build it with the builder agent, judge it with
the judge agent when asked to, and let the person accept it — merged and
marked done — or send it back. Typed by a person; it never starts itself.

```
/implement-ticket 0007-prices
/implement-ticket 0007-prices --judge
```

Without `--judge`, the builder alone works the ticket and the person
reads the report directly. With it, the judge checks the builder's work
first, in rounds, before the report reaches the person.

## Look first

- The ticket, and its column.
- `.claude/agents/builder.md` (model: sonnet) and `.claude/agents/judge.md`
  (model: opus) exist, and `.claude/skills/build` and `.claude/skills/judge`
  beside the other skills. Missing: say so and stop.
- The working tree: clean apart from a possible leftover `PROGRESS.md`.
  Anything else uncommitted: stop and say so.
- The base branch, from the project's CLAUDE.md `## Conventions` section
  (see the build skill; default `main`). The default names a branch that
  does not exist: ask which branch is the base, write the answer into
  Conventions, and commit that file alone (`git commit -- CLAUDE.md`,
  `Conventions: base branch`) before claiming.
- A `PROGRESS.md` whose first line is not `ticket: <slug>` for this
  ticket: it belongs to another ticket, or to none. Ask (see Asking)
  whether to remove it or stop; never start the builder on it — the
  builder skips every step it sees ticked.
- The verdict, with `--judge`, always lives in `validation/verdict.md`;
  there is no pull request.
- The project's workflow config (see the build skill's Conventions
  section): `.claude/workflow.yml`, or every default when it and the
  `workflow config` key are both absent. This loop reads `models`,
  `judge_findings`, `evidence_recheck` and `parallel_tickets` from it.

## Asking

> Every question to the person goes through the session's question form — in Claude Code the AskUserQuestion tool — with a header of at most 12 characters, 2–4 options, the recommended one first and marked `(Recommended)`, each with a one-line description; the person can always answer in their own words. Independent questions may share one call, at most four; a question that depends on another waits for its answer. A question with no sensible options (a name, a list of sentences) is asked as plain text. Where the session has no question form, ask the same question as text with the options numbered, one question at a time, and wait.

## Do

**1. Claim.** This happens on the base branch, before the ticket has its
own: if the ticket is not already in `in-progress/` and the working copy
is not on the base branch, `git switch <base>` first; a dirty tree stops
the skill here — say so. Find the ticket's folder under
`items/<item>/tickets/`, wherever it currently sits.

Apply the ready gate, reading the ticket as text: a `Kind:` line; a
`Summary:` line of at most two sentences; at least one command under
`## Exit conditions`; at least one numbered step under `## Steps`; every
slug under `## Blocked by` has a folder in `items/*/tickets/done/`. Any
of these missing: stop and say which.

In `backlog/`: `git mv` its folder to `in-progress/`, commit `Pick up
<slug>` — one commit, the claim. Already in `in-progress/`: no commit —
this is a resume.

**2. Branch.** `<kind>/<slug>` (the `Kind:` line, the ticket's slug):
`git switch <kind>/<slug>` if an earlier round or session already made
it, else `git switch -c <kind>/<slug> <base>` — whatever branch the
working copy is on, a resume included, so a ticket is never built on
another ticket's branch. Say the branch. The
builder then finds itself off the base branch and stays there, as the
build method's own branch rule says.

**3. Build.** Start the `builder` agent, pinned twice over — once in its
own frontmatter, once again in the spawn (in Claude Code: `Agent` with
the `builder` agent type and `model:` the workflow config's
`models.builder`, `sonnet` by default) — with the ticket's path,
the branch, and one instruction: follow the build method to the
hand-back. Wait. Read what came back: the report's path, the steps
ticked, what was not tested. This session writes no code of its own;
from here its only writes are ticket moves, merges, and lines appended
to `PROGRESS.md`.

**4. Judge, only with `--judge`.** Start the `judge` agent, pinned to
the workflow config's `models.judge` (`opus` by default), on the same
working copy, with the ticket and one instruction: follow the judge
method and give a verdict. Wait. It writes `validation/verdict.md`,
committed, and appends `- [x] judge round <n>: pass` or `- [ ] judge
round <n>: <label>: <finding>` lines to `PROGRESS.md`.

Findings, all labelled `evidence` and `judge_findings: split` (default):
start the builder again on the appended lines, then, instead of a full
judge round, an `evidence_recheck: short-pass` (default) — a judge agent
run pinned to `models.evidence` (`sonnet` by default) with one
instruction: run `check-evidence.mjs` and reread only the changed
screenshots and report sections, then give a verdict. Any other finding
mix, or `evidence_recheck: full-round`, or `judge_findings:
all-blocking`: start the builder on the appended lines, then the judge
again, in full. No round cap, but every judge round from the third on
that still has findings is followed by asking (see Asking): "Judge round
<n> still has findings.", options "One more round (Recommended)" / "Show
me the report and let me decide" / "Stop here". The last two both go to
step 5 and stop the judge loop there, for the person to decide from the
report.

**5. Hand back.** Print the report's path —
`items/<item>/tickets/in-progress/<slug>/validation/agent-report.html`
— and a summary of at most five lines: the steps ticked, what was not
tested, anything the loop stopped on, and, with `--judge`, the judge's
result. Open it:

```bash
p="items/<item>/tickets/in-progress/<slug>/validation/agent-report.html"
case "$(uname -s)" in
  Darwin) open "$p" ;;
  *) xdg-open "$p" >/dev/null 2>&1 || true ;;
esac
echo "$p"
```

No bare `open` on Linux — it is not the command there.

**6. Accept.** Ask (see Asking): header "Ticket NNNN" (the ticket's own
number), question "Accept NNNN: merge it and mark it done?", options:

- "Accept and start <next-slug> (Recommended)" — or, when nothing is
  left, "Accept, this was the last ticket" — then step 7, then loop back
  to step 1 with the next ticket, with the same `--judge` setting this
  ticket ran with.
- "Accept and stop" — then step 7, name the next ticket without starting
  it, and stop.
- "Request changes" — a plain-text follow-up, "What should change? One
  line per change."; append each line to `PROGRESS.md` as `- [ ] change
  <n>: <the person's words>`; then step 3 (and step 4, with `--judge`).
  Free text typed as the answer to the accept question itself is treated
  the same way.
- "Stop without accepting" — the ticket stays in `in-progress/`, the
  working copy stays on its branch; say that `/implement-ticket <slug>` resumes
  it.

**7. Accept, in order.** Any failure stops here and says so:

1. `git switch <base>`.
2. `git merge --no-ff -m "Merge <kind>/<slug>" <kind>/<slug>`. A
   conflict: `git merge --abort`, stop, the ticket stays in
   `in-progress/`.
3. `git mv items/<item>/tickets/in-progress/<slug>
   items/<item>/tickets/done/<slug>`, commit `Done: <slug>`.
4. `rm -f PROGRESS.md` — a leftover would mislead the next builder.

Keep the branch; deleting it is the person's call, not this skill's.

**The GitHub mirror.** Every move this skill makes — to `in-progress/`,
`done/` — is followed, for a ticket with a `Mirror:` line, by setting
the issue's project Status to the option of the same name as the column
(`In progress`, `Done`). The project has no
option of that name: say so and leave the Status as it is. The folder
is the ticket's state; the Status only follows it.

**8. Next ticket.** The lowest-numbered ticket across every
`items/*/tickets/backlog/` whose every `Blocked by` slug has a
folder in `done/`. HITL tickets are included — a person is right
here. For a HITL ticket, say which step
needs the person before starting it. With `parallel_tickets` above `1`,
see "Parallel tickets" below before starting only the one.

## Parallel tickets

`parallel_tickets: 1` (default): one ticket at a time, as every step
above describes. Above `1`, and only when the project's Conventions
declare `- isolated test run: <how>` — how each parallel run gets its
own test resources (a database, a port) — this loop may start builders
for more than one ready ticket at once: every AFK ticket on the frontier
(see the write-tickets skill) that shares no blocking edge with another
one already running, each in its own git worktree, each builder told its
own test resources per the Conventions line. Without that Conventions
line, `parallel_tickets` above `1` is ignored and tickets run one at a
time regardless — this loop never invents test isolation a project has
not declared. Judging, accepting and the next-ticket choice still happen
one ticket at a time, in the order each builder finishes.

## Stop when

- A blocker is not done: stop before claiming.
- The builder stops on a check it believes is wrong: show the report's
  line and stop. A person edits specs and tests, not this loop.
- The builder or the judge has a question: relay it and ask it as a
  question in this session (see Asking).
- The person stops: stop wherever the loop is, and say where the ticket
  stands.
- This session has no way to start a separate agent (a harness without
  subagents, Codex among them): stop, and point at the build skill —
  never build the ticket in this session itself.

## Attribution

Ours. The loop is an improvement loop — build, review, build again —
optionally checked by a second agent instead of the person alone, with
the verdict as its visible form when `--judge` runs it.

Licence: MIT, see `LICENSE` beside this folder.
