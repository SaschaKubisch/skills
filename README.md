# Skills

A set of Claude Code skills for taking a piece of work from a vague idea
to a merged, verified change: an interview that settles what is meant, a
locked spec, tickets cut into vertical slices, and two methods —
building and judging — that a person or an agent can follow to carry a
ticket to done.

Nothing here depends on any particular project, language or harness.
Drop the skills into any repository's `.claude/skills/` and they work
from a plain, interactive Claude Code session.

## The skills

- **specify** — interviews the user about a brief, a feature or a whole
  product, one question at a time, until nothing is left silently
  assumed; writes the project's vocabulary, its hard decisions, and an
  interview record of everything else that settled. When the thing has a
  user interface, the design is a required branch of the interview, and
  the record gains a Design section and design invariants (D1, D2, ...).
- **write-spec** — turns an interview record into a locked spec: the
  word-for-word statement of what must be true, with a finish line of
  runnable commands. It carries a Design section: the design decisions,
  the design invariants and the method that builds the screens.
- **write-tickets** — cuts a spec into tickets: vertical slices sized to
  one run, each with its steps and its exit conditions. Each ticket that
  builds a screen starts with a design brief, and the first UI ticket
  builds the design system where there is none. Names no implementing
  method; any can work the tickets.
- **init-agent-context** — sets up the standing instruction file every
  agent session in a project reads: `AGENTS.md` as the real file and
  `CLAUDE.md` as a link to it. It writes structure and no rules: a short
  description, a Map of the top-level folders, the exact Commands, and
  the Conventions section the other skills read. In a project that has
  the file, it adds only the missing sections and never rewrites text.
  Ships `scripts/check-agent-context.sh`, which finds a broken pair, a
  path that does not exist, a date that goes stale and a folder missing
  from the Map. Typed on its own, `/init-agent-context`; not part of
  the planning or building flow.
- **build** — the method for working one ticket to done: a branch, one
  test per step, validation from cheapest check to end to end, and a
  visual validation report for the engineer who accepts the ticket: the
  verdict first, then the walkthrough storyboard, the journeys, what
  changed with a risk tier per module, and the traceability grid of
  invariants against tests. A script checks it against the ticket before
  hand-back.
- **judge** — the method for checking a built ticket: runs the ticket's checks
  again (the whole end-to-end suite only under `test scope: full`), reads the diff for softened tests, reads every screenshot
  against its claim, reads the report's storyboard and video frames
  against the flow, and writes a verdict. Fixes nothing itself.
- **implement-ticket** — claims one ticket, builds it with the **builder**
  agent and, with `--judge`, checks it with the **judge** agent in
  rounds; opens the validation report (or, when none is due, prints a
  summary in the chat) and lets the person accept it — merged and marked
  done — request changes, or stop.

## The flow

```
planning:  specify -> write-spec -> write-tickets
building:  implement-ticket (build, judge)
```

The planning skills know nothing of the building skills. `specify` and
`write-spec` each close by asking the person one question and, on yes,
read the next skill's `SKILL.md` at its installed path and follow it:
`specify` settles what is meant and writes an interview record, then
asks whether to write the spec now. When the thing has a user interface,
that includes its design and its design invariants. `write-spec` turns
the record into a locked spec, with a Design section, then asks whether
to cut it into tickets now. `write-tickets` cuts the spec into tickets —
small enough for one run, each with its own exit conditions, and each
screen ticket starting from a design brief — names the first one, and
stops. Any of the three also works typed on its own — `/specify`,
`/write-spec`, `/write-tickets` — outside the chain.

The person then starts the building side. `/implement-ticket <slug>
[--judge]` works one ticket: it claims it
(moving its folder from `backlog/` to `in-progress/`, applying the ready
gate first), creates or switches to its branch,
and hands the working copy to a **builder** agent, which follows the
**build** skill to implement and validate it. With `--judge`, it then
hands the same working copy to a **judge** agent, which follows the
**judge** skill to check the builder's work without fixing anything
itself; while the judge requests changes, the builder works a review
round on its findings and the judge checks again — no round cap, though
every judge round from the third on that still has findings stops to
ask the person how to proceed. `build` and `judge` are not run on their own in this
flow; they are the methods `implement-ticket`'s two agents follow. A person can
also type `/build` or `/judge` directly to work or check a ticket by
hand, outside the loop.

`implement-ticket` opens the validation report, prints its verdict line
and asks the person to accept it; when the config says no rendered report
is due, it prints a summary in the chat instead and asks the same.
Accepting merges the ticket's branch into the base branch with
`--no-ff`, moves the ticket's folder to `done/`, and offers the next
ticket on the frontier. The person can instead ask for changes — another
builder round, and another judge round with `--judge` — or stop without
accepting, which leaves the ticket in `in-progress/` for `/implement-ticket
<slug>` to resume later.

## Where things land

The first interview is about the whole product, and its files sit at the
root: `context/system.md`, `specs/system.md`, and its tickets under
`items/system/tickets/`. Everything specified after that asks one
question first — a new item, or a refinement of the system?

```
context/system.md                    specs/system.md
items/system/tickets/<column>/NNNN-<slug>/        the system's tickets
context/<topic>.md, specs/<topic>.md              a refinement; its tickets
                                                  join items/system/tickets/
items/<slug>/brief.md                             a new item: its brief,
items/<slug>/context/<slug>.md                    its record,
items/<slug>/specs/<slug>.md                      its spec (Parent:
                                                  specs/system.md),
items/<slug>/tickets/<column>/NNNN-<slug>/        and its tickets
```

The columns are `backlog/`, `in-progress/` and `done/`.
Ticket numbers are one sequence across every item, so
`/implement-ticket` always offers the lowest-numbered unblocked ticket
next, whichever item it belongs to. An item adds to the system's spec
and never changes it.

## Install

```
./install.sh /path/to/project
```

This copies `specify/`, `write-spec/`, `write-tickets/`,
`init-agent-context/`, `build/`, `judge/` and `implement-ticket/` into `<project>/.claude/skills/<name>/`,
`LICENSE` into `<project>/.claude/skills/LICENSE`,
`agents/builder.md` and `agents/judge.md` into
`<project>/.claude/agents/`, and the default `workflow.yml` into
`<project>/.claude/workflow.yml` — only when the project has none there
yet. It replaces files with the same names, never overwrites a project's
own `workflow.yml`, and touches nothing else in the project.

Without the script, copy the same folders by hand into the same places.

### Planning only

```
./install.sh --planning /path/to/project
```

This copies only the three planning skills `specify/`, `write-spec/` and
`write-tickets/`, plus `init-agent-context/` and `LICENSE`. It copies no
agents and no `workflow.yml`: none of these four skills reads them. Work
the tickets by any method: the exit
conditions under `## Exit conditions` decide done, and the ready gate
described in `write-tickets` decides when a ticket may start.

## Conventions

`build`, `write-tickets` and `judge` all read one section of the
project's own `CLAUDE.md` for the facts specific to that project — its
base branch, its checks, how it runs end to end, how it takes
screenshots, its workflow config, and whether a GitHub project mirrors
its tickets. Add it once, let `init-agent-context` write it, or let
`write-tickets` propose it the first time it runs. The `screenshots` and `workflow config` keys are the
build method's own; `write-tickets` defines the other nine:

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

### Test scope

`test scope` limits how much of the end-to-end suite runs while a ticket
is built. It reads `feature` or `full`.

- `feature` (the default when the key is absent): the end-to-end specs
  that run are the ticket's own and those covering any shared file a step
  touched; when they run is `step gate`'s, below. The judge checks the
  same. **Nothing runs the whole end-to-end suite: not per step, not once
  per ticket, not in the judge, not in the hand-back.** A failure in an
  unrelated spec is noted as deferred, not chased.
- `full`: every check and the whole end-to-end suite on every step,
  whatever `step gate` says, and the judge re-runs everything. This is the
  only way the whole suite runs.

#### Speed keys

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

If the section is missing, the skills detect what they can from the
project (`package.json`, a `Makefile`, CI config) and write it in, so
later tickets do not detect it again.

## Workflow config

`.claude/workflow.yml` tunes how `build`, `judge` and `implement-ticket`
work in a project, its keys grouped under `models:`, `review:`,
`parallel:` and `validation:` — which model each agent runs on, evidence
checking, what follows a judge round whose findings are all evidence,
sharing a recorded whole-suite result (`test scope: full` only), working tickets in parallel, the
end-to-end worker count, and the validation report. `install.sh` copies a starting file, never over
a project's own; every group and key it leaves out takes its default.
See `build/SKILL.md`'s "The workflow config" section for every key, its
default, and what it changes.

### The validation group

`validation:` tunes the validation report. Its evidence, `report.json`
and the screenshots, is always written and checked. The keys:

- `report` (`true`) — `false`: no rendered report; `implement-ticket`
  prints a chat summary instead.
- `report_scope` (`ticket`) — `ticket`: a report for every ticket.
  `item`: one for the whole item, after its last ticket.
- `report_pdf` (`false`) — `true`: also a PDF beside each HTML report.
- `video_walkthrough` (`false`) — `true`: record the key flow as a video
  with chapters, embedded in the report.
- `video_scope` (`ticket`) — `ticket`: every ticket's report gets the
  video. `item`: only the ticket that empties its item's backlog (no other
  ticket of the item left in `backlog/` or `in-progress/`).
- `video_commit` (`true`) — `false`: keep videos git-ignored.
- `video_max_mb` (`10`) — a larger video is re-encoded or shortened; the
  evidence check refuses it if it is still over.
- `before_after` (`false`) — `true`: the walkthrough screens are also
  captured on the base branch and shown side by side.
- `traces` (`true`) — failed and retried tests link to their Playwright
  trace; flaky tests are marked.
- `changed_line_coverage` (`false`) — `true`: a tile with the coverage of
  this ticket's changed lines.

At ticket scope the outputs sit in the ticket's own `validation/` folder.
At item scope they sit in `items/<item>/validation/`, produced by the
ticket that empties its item's backlog; each ticket's `report.json` and
screenshots stay in its own folder.

## Licence

MIT, see `LICENSE`. It also credits the methods these skills adapt from
Matt Pocock's skills and Geoffrey Huntley's Ralph loop; see each skill's
own `## Attribution` section for what came from where.
