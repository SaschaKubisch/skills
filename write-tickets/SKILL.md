---
name: write-tickets
description: Cut a spec into tickets — vertical slices sized to one run, each with a Summary line of at most two sentences under its title, a Parent line, its blocking edges, AFK or HITL, its ordered Steps, and exit conditions that are runnable commands. Names no implementing method; the tickets can be worked by any. Writes them as files under items/<item>/tickets/backlog/, never in-progress/, and mirrors them to GitHub issues when a project is configured. Use after write-spec.
disable-model-invocation: true
---

# Write tickets

Cut one spec into tickets: complete instructions a fresh context can carry
out without asking anyone, each one a vertical slice, each with the
ordered steps that build it and the commands that decide whether it is
done.

A ticket is one run's unit of work. Its Steps become the working
checklist; its exit conditions decide done. A ticket a loop cannot grade
is not finished; a ticket without steps cannot be run.

Tickets are folders: `items/<item>/tickets/<status>/NNNN-<slug>/`, holding
`ticket.md` and, once worked, whatever the method that worked it left
beside it. The status folder is the column — `backlog`,
`in-progress`, `done`; `<item>` is the item's slug, or
`system` for tickets cut from `specs/system.md`. A ticket moves by moving
its folder (`git mv`), by a tool or by a person, and
everything in it moves with it. This skill writes into `backlog/` only.

## Argument

A spec path. Default `specs/system.md`.

```
/write-tickets
/write-tickets specs/pricing-tax.md
/write-tickets items/table-ordering/specs/table-ordering.md
```

Read it in full. Read `specs/system.md` too if it is not the argument — a
per-topic or per-item spec is one slice of the standing spec, and every
ticket still obeys all of it. Read the spec's interview record —
`context/<same name>.md`, `goals/<ID>.md` for a goal's spec, or
`items/<slug>/context/<slug>.md` for an item's spec — if it exists: its Settled list says why each decision went
the way it did. Read `CONTEXT.md`: the tickets use the glossary's words.

Every spec cuts tickets into `items/<item>/tickets/backlog/`: an item's
spec (`items/<slug>/specs/<slug>.md`) uses its own slug, the same item
folder its brief and record live under; `specs/system.md` and every other
standing spec uses `system`.

## Look first

Detect, do not assume:

- Code, or an empty folder? The build, typecheck, lint and test commands —
  from `package.json`, a `Makefile`, CI config? Run them: green or red? A
  database? A UI, and a design system under it (tokens, base components)?
  Which items in the spec are already true in the code?
- Existing tickets: every `items/*/tickets/*/` folder and the highest
  number across all of them.
- The branch checked out, and the base branch from the project's
  CLAUDE.md `## Conventions` section (see Conventions below). Not on the
  base branch: say so, and ask (see Asking) whether to switch to it
  before writing — tickets are claimed from the base branch, and a ticket
  committed elsewhere is not there to claim. Not a git repository: say
  so; the ticket files are written but nothing is committed, and no gate
  that checks version control can move them until they are.
- The mirror: `gh auth status`, and a `github project` line under the
  project's CLAUDE.md `## Conventions` section (see Conventions below).
  Configured, or not — absent means the mirror is off.

Say what you found before cutting a slice. Every step and every exit
condition below depends on it.

## Asking

> Every question to the person goes through the session's question form — in Claude Code the AskUserQuestion tool — with a header of at most 12 characters, 2–4 options, the recommended one first and marked `(Recommended)`, each with a one-line description; the person can always answer in their own words. Independent questions may share one call, at most four; a question that depends on another waits for its answer. A question with no sensible options (a name, a list of sentences) is asked as plain text. Where the session has no question form, ask the same question as text with the options numbered, one question at a time, and wait.

## Do

**1. Prefactoring first.** Explore the code for changes that would make
the real change easy — a shared type, a module boundary, a column. "Make
the change easy, then make the easy change." Any such change is the first
ticket, and it blocks the rest. On an empty folder there is none.

The same rule applies to design. When the spec has a user interface and
the repository has no design system yet, the first UI ticket builds it:
the tokens (colour, type, spacing, radius, motion), the base components,
and the accessibility, layout and states checks the design invariants
need. It blocks every other UI ticket.

**2. Cut vertical slices.**

- Each slice cuts a narrow but complete path through every layer the
  repository has — schema, server, UI, checks. Not one layer.
- A finished slice can be shown working, or verified, on its own.
- Each slice is sized to one run: a fresh context reads it, works its
  steps, and passes its exit conditions. If that takes two runs, split it.
- Many thin slices, not a few thick ones.
- The first slice is the simplest end-to-end path. On an empty
  repository that is the walking skeleton: every check passes with
  nothing built yet.
- Later slices add breadth: edge cases, the remaining behaviour, polish.
- The plan is the delta: a spec item the code already satisfies gets no
  slice and no step. Say which items you skipped and why.

Why vertical: a slice that ships one layer works only once every other
layer has landed, so its exit conditions have to reach into work another
ticket owns, and nothing can be verified alone. A vertical slice contains
everything its own exit conditions test.

**The exception: a wide refactor.** One mechanical change — rename a
column, retype a shared symbol — whose blast radius covers the codebase,
so no single slice can land green. Sequence it expand–contract: **expand**
(add the new form beside the old; nothing breaks), **migrate** (move the
callers in batches sized by blast radius, each batch a ticket blocked by
the expand, checks green batch to batch because the old form still
exists), **contract** (delete the old form once nothing calls it; blocked
by every batch). Where even a batch cannot stay green alone, keep the
sequence but put the batches on one integration branch that all block a
final integrate-and-verify ticket; green is promised only there, and each
batch says so.

**3. Classify each ticket on two axes, and give it a kind.** The kind
names the change in the branch and the commits: `feat` for new
behaviour, `fix` for a defect, `chore` for tooling, `refactor` for a
change with no behaviour change, `docs`, `test`. One word on the `Kind:`
line; this skill always writes it — a ticket without one is not ready to
work.

*Who runs it.* **AFK** — a loop runs it with nobody watching; everything
it needs is written down. **HITL** — a person is in the loop, and the work
only resolves through that exchange: a decision, a preference, a
credential, eyes on something visual, an action only a person can take.
The agent never stands in for the person's side. If unsure, mark it HITL:
an AFK ticket that needed a person burns a run and returns a confident
guess.

*What blocks it.* The tickets that must be done before this one starts. A
blocking edge is real only if this ticket needs code or schema the other
introduces, or both change the same modules, or this ticket depends on a
decision or interface the other settles.

**Name the test each edge passes, in the ticket, in one clause.** Write
`- 0003-menu — Menu (needs the MenuItem schema)`, not `- 0003-menu — Menu`.
An edge whose clause you cannot write is not an edge: delete it. The
default is no edge. Ordering tickets by their number, or by the order you
happened to cut them, is not a dependency.

**Then say how wide the plan is.** Group the tickets into rounds: round one
is every ticket with no blocker, round two is every ticket whose blockers
are all in round one, and so on. Report the rounds and the widest one. A
plan whose rounds are all one ticket wide is a single chain and will take
as long as the sum of its parts; say so, and say which edges you would
revisit first if that is too slow. A chain is sometimes right — each slice
really does build on the last — but it should be a finding, not an
accident.

**4. Write each ticket's Steps** — the ordered work one run does, aiming
for 4 to 6 steps per ticket, each a meaningful slice. Everything a step needs is already decided; where
ordering or granularity is a judgement call, make it, say why in one
line, and ask about it in step 6.

- **The first step makes the checks pass from iteration one.** Every
  later step is graded by the build, typecheck, lint and test commands.
  Empty folder: a walking skeleton — scaffold the app and an empty test
  suite so all four pass with zero tests, and nothing more; if the slice
  needs a database, scaffold a separate test database too, and make the
  test setup refuse any database whose name does not say it is a test
  database. Existing repository, green: confirm the baseline — run the
  four, record that they pass. Red: make them green, and nothing else. If
  nothing can make the checks pass until step four, the order is wrong,
  not the check.
- **Prefactoring next**, if this ticket is the one that carries it.
- **A ticket that builds or changes a screen** writes the design brief
  for its screens (purpose, device, states). Under `per-ticket extras: end`
  (default) the brief is folded into the first work step, not a step of
  its own; under `per-step` it is its own first work step after the
  checks-pass step. Its later steps say they are worked with the design
  method the spec names under Design.
- **Every step is a meaningful slice**: a narrow slice through every
  layer, shown working on its own. Under `context: per-ticket` (default)
  a step need not fit one fresh context window, so cut 4 to 6 steps per
  ticket, not many tiny ones. Under `context: per-step` keep each step to
  one iteration's work, done and verified inside one fresh context
  window; two iterations' worth is two steps.
- **Each test sits directly after the step that builds what it proves.**
  Not a testing phase at the end.
- **Every "without a reload" criterion gets its own step**, verified with
  two browser contexts: act in one, watch the change arrive in the other.
  A passing API test and a broken live update look identical to every
  other check.
- **Cover every page and route the slice implies**, including the ones
  the spec does not mention. Nothing is left showing whatever the
  framework put there by default.
- **The end-to-end test is the last step**: the full-visit browser
  test where there is a UI; the outermost seam — API, CLI — where there is
  none.
- **No file paths and no code snippets** in a step — they go stale and say
  how instead of what — except a prototype snippet that states a decision
  more precisely than prose can, trimmed to the decision.
- Each step names what it proves: `— proves: <criterion or invariant>`.
  A design invariant is named by its id and spec: `— proves: D2 of
  specs/system.md`.

**5. Write exit conditions as commands.** Every exit condition is a
runnable command that exits non-zero when it is not satisfied. Prose is
something a loop can claim to have satisfied; a command is something it
cannot. A ticket's commands are the ones from its parent spec that decide
this slice, plus any the slice introduces.

```
npm run build
npx tsc --noEmit
npm test -- order-total
npx playwright test qr-flow
```

Each line begins with the command that decides it. Cheapest first: they
are a gate chain, and the expensive ones run only on work that cleared the
cheap ones. Every invariant this slice touches, design invariants
included, appears here, or under `NOT CHECKED` with the reason — an
unchecked invariant is a decision, but only once it is written down. What
only a person can judge is listed under `HUMAN CHECK` with what to look
at; never dress a human check up as a command.

**6. Present the breakdown, then ask.** A numbered list. Per ticket:
title; AFK or HITL; blocked by (or "nothing — can start now"); what it
delivers, end to end; its steps; its exit conditions. If the project's
CLAUDE.md has no `## Conventions` section, propose one in the same round
— in the format under Conventions below — from what "Look first"
detected (checks, end-to-end command, base branch, test scope, github project), with the defaults given there for whatever
detection came up empty. Print this reading checklist beside the
breakdown, for the user to check the plan against before answering:

- Does the granularity feel right — too coarse, too fine?
- Are the blocking edges real? Each one names the test it passes; does
  any clause read as invented order?
- The plan is N rounds, the widest R tickets. Is that width worth having,
  or should I revisit an edge to widen it?
- Is anything marked AFK that needs you?
- Should any be merged or split?
- Is the first slice really the simplest end-to-end path?
- Does the first step of each ticket really make the checks pass?
- Does every ticket that builds a screen start, after the checks, with
  its design brief, and does the first UI ticket build the design system
  where there is none?
- Is there anything in the spec with no step that traces to it, and any
  step that traces to nothing?
- Does the proposed Conventions section look right, where one was proposed?

Then ask, one call (see Asking), up to two questions: "Approve this
breakdown?", options "Approve and write the tickets (Recommended)" /
"Too coarse" / "Too fine"; and, only when this round proposed a
Conventions section, "Use the proposed Conventions section?", options
"Yes, as proposed (Recommended)" / "Change it". Iterate on anything but
approval.

**7. Write the ticket files**, blockers first, from the template below:
`items/<item>/tickets/backlog/NNNN-<slug>/ticket.md`, the item from the
spec (`system` for `specs/system.md`) — `NNNN` the highest number found
across every `items/*/tickets/*/` folder plus one, so numbering stays one
sequence across the whole repository regardless of item or column.
Folders created when first needed. `Blocked by` names slugs
(`0003-tax-line`), never issue numbers, since a slug is resolved wherever
it currently sits. A ticket is unblocked when every folder it names is in
`done/`.

Every ticket carries a `Summary:` line directly under its title, at most
two sentences, in the user's or the spec's own words: what the finished
slice is, one plain sentence, that the tree can show before the ticket is
opened. A ticket without one, or with a longer one, is not ready to work.

If this round proposed a `## Conventions` section, write it into the
project's CLAUDE.md now.

Then commit the ticket files — and the Conventions section, if this round
proposed one — in one commit, by path (`git commit -- <paths>`, so
nothing already staged rides along), before saying anything else. Every move a
ticket makes is a `git mv` and a commit, so an uncommitted ticket cannot
pass any gate that checks version control. Close by naming the first
ticket with nothing blocking it, by slug (`0001-walking-skeleton`).
Claiming it is not this skill's job: a person or a tool does it.

**8. Mirror to GitHub, if configured.** Blockers first: one issue per
ticket with the file's body, `Mirror: <issue url>` written back into the
file under the title, project Status **Backlog**, and native dependencies
where the repository has them. Then commit the ticket files the
`Mirror:` lines changed, by path: `Mirror: <first>–<last>`.

```bash
# the blocker's database id — not its #number, not its node id
gh api repos/<owner>/<repo>/issues/<n> --jq .id

gh api --method POST \
  repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by \
  -F issue_id=<blocker-db-id>
```

If the mirror is not configured, say so plainly and stop after the files.
The files are the tickets; the issues are a view.

## Stop when

- The user has not approved the breakdown: write nothing.
- A blocking edge has no reason written next to it: it is not an edge.
  Delete it, or write the reason.
- The ticket files are written but not committed: commit them. A ticket
  the gate cannot move is not delivered.
- A ticket would land anywhere but `tickets/backlog/`: it does not. This
  skill never claims a ticket — a person or a tool does that, through
  the ready gate.
- An exit condition is prose: it is not an exit condition.
- A ticket has no `Summary:` line, or one longer than two sentences: fix
  it before writing the file.
- A slice needs two runs: split it. A step needs two iterations: split it.
- Nothing can make the checks pass until a ticket's fourth step: reorder.
- The parent spec would be edited or closed: it is not.

## Conventions

A project's own facts — base branch, checks, end-to-end command, GitHub
project — live in one place: a `## Conventions` section in the
project's CLAUDE.md (or AGENTS.md for a Codex mirror), one bullet per
key:

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
- github project: <name, or none>
```

Any implementing method can read it and add keys of its own. Defaults
when nothing declares a key: the base branch is `main`; the test scope is
`feature`; `context` is `per-ticket`; `step gate` is `changed-tests`;
`prove failing first` is `bug-fixes`; `per-ticket extras` is `end`; the GitHub project is none.

`test scope` is `feature` or `full`. `feature`: the end-to-end specs that
run are the ticket's own and those covering the shared files touched;
when they run is `step gate`'s, below. The whole end-to-end suite never
runs, not per step, not at the end, not in the judge. `full`: every check
and the whole suite on every step, whatever `step gate` says. A ticket's own steps and exit conditions are written the same
under both.

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
  the ticket. `ticket-tests`: every step runs the cheap checks and the
  ticket's exit conditions.
- `prove failing first: bug-fixes | always`. `bug-fixes`: the proof that a
  test fails against the old code is required only for a bug fix (a fix
  ticket or step); tests for new features skip it. `always`: every test
  has it.
- `per-ticket extras: end | per-step`. `end`: the build, the screenshots
  and evidence capture happen once per ticket, at the end, and the design
  brief is folded into the first work step instead of being its own step.
  `per-step`: each of these happens in every step that needs it.


## The ticket template

```markdown
# NNNN — <title>

Summary: <at most two sentences, in plain words: what this ticket makes true>
Parent: <the spec this ticket is cut from — `None yet` is a legal value>
Kind: <feat | fix | chore | refactor | docs | test — names the change in the branch and the commits>
Mirror: <issue url, added by step 8; absent until then>

## Type

AFK | HITL — <one line on why, if HITL>

## What to build

<the end-to-end behaviour this makes work, from the user's side. Not a
layer-by-layer list.>

## Grey box

<only when the slice creates or changes a module an invariant runs
through; leave it out otherwise>

MODULE      <name>
INTERFACE   <signature>
OWNS        <what lives inside>
INVARIANTS  <which ones this module is responsible for>
SEAM        <where it is tested from>
MAY USE     <permitted dependencies>
MAY NOT     <the negative constraint — often an invariant in one line>

## Invariants this touches

- <invariant>, checked by <which exit condition>
- D<n> <design invariant>, checked by <which exit condition>

## Steps

1. <the checks pass: walking skeleton, or the baseline confirmed or
   repaired> — proves: <the commands run green>
2. <only under `per-ticket extras: per-step` and when the ticket builds or changes a screen: write the design
   brief for this ticket's screens (purpose, device, states)> — proves:
   <the brief names purpose, device and states for every screen>
3. <a meaningful slice, under the default folding the design brief in for a screen, worked with the design method the spec names,
   where it is a screen> — proves: <criterion or invariant, or `D<n> of
   <spec path>`>
4. ...
N. <the end-to-end test> — proves: <the flow the slice delivers, end
   to end>

## Exit conditions

<one fenced block, one command per line, cheapest first — tools read this
block, so nothing else goes in it>

NOT CHECKED
- <invariant or criterion>, because <reason>

HUMAN CHECK
- <what a person must look at, and what they are looking for>

## Blocked by

- <NNNN-slug> — <title> (<why: the code, schema or interface this ticket
  needs from it, or the module they both change>)

or "Nothing — can start now."

## Out of scope for this slice

<what belongs to a later slice, so nobody widens this one>
```

The `MAY NOT` line is the valuable one in the grey box: "MAY NOT read the
MenuItem table" is a rule a fresh context cannot misread and a grep can
enforce. "Be careful about pricing" is a hope.

The machine-readable contract in `ticket.md`: `## Type`; the `Kind:` line;
the numbered lines under `## Steps` (one box each in the working
checklist); and the fenced block under `## Exit conditions`. The file is
locked for the run.

## Working the frontier

The **frontier** is every ticket in a `tickets/backlog/` folder, in any
item, whose `Blocked by` folders are
all in a `tickets/done/` folder. That is what can run right now.

A ticket passes the **ready gate** before it is claimed:
the ticket read as text has a `Kind:` line, a `Summary:` line of at most
two sentences, at least one command under `## Exit conditions`, at least
one numbered step under `## Steps`, and every slug under `## Blocked by`
has a folder in `items/*/tickets/done/`. Any of these missing: it is
not claimed and stays in `backlog/`. Whoever claims a ticket applies
this gate.

- Claim before working: move the folder from `backlog/` to
  `in-progress/`, first thing, and commit the move — that is the claim. A mirrored ticket's project
  Status follows each move.
- AFK tickets on the frontier can run in parallel, one working copy each.
- HITL tickets wait for a person, however unblocked they are.
- A purely linear chain has a frontier of one; work top to bottom.

Other sessions may be moving tickets at the same time; a move is a commit.

## Attribution

The method is Matt Pocock's, from [mattpocock/skills](https://github.com/mattpocock/skills)
(MIT): vertical slices as tracer bullets, prefactoring as the first ticket,
the three tests for a real blocking edge, expand–contract for wide
refactors, the grey box, working the frontier, sizing work to one context
window, and the no-file-paths rule with its prototype exception are his
`to-tickets`; the AFK/HITL axis is his `wayfinder`. This file is written
from that method in this project's words; none of his text is copied.
Ours: exit conditions as runnable commands rather than prose, the
cheapest-first gate chain, the required `NOT CHECKED` and `HUMAN CHECK`
headings, the `Parent` line, tickets as files with the folder as the
column and GitHub as a mirror, writing to backlog so the gate checks
every ticket before it is claimed, one ticket as one run's unit of work,
and the Steps
inside the ticket — the walking-skeleton-first rule, the separate test
database and the two-browser-context step, each
added after a real run went green while something was silently wrong;
and the ordered steps as a read-only document the loop follows, the
second of three phases: requirements, then a plan, and only the third
phase is a loop.

Licence: MIT, see `LICENSE` beside this folder.
