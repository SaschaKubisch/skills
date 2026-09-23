---
name: write-spec
description: Turn an interview record (context/<topic>.md, or items/<slug>/context/<slug>.md for an item) and the sources it names into a spec — specs/system.md for the whole product, specs/<topic>.md for one topic, items/<slug>/specs/<slug>.md for an item — the locked, word-for-word record of what must be true, with a finish line of commands. Pass the record, or source files; with nothing, it finds the sources by reading. Looks at the repository first and uses its names; never overwrites a locked spec. No interview, no invention: copies the brief, entities and invariants verbatim, proposes the exit-condition commands from the sources' criteria and asks once, and stops rather than guesses when something is missing. Use after specify, before write-tickets.
disable-model-invocation: true
---

# Write spec

Turn an interview record and the sources it names into a spec: the
canonical record of what must be true, read by every agent that works a
ticket cut from it and never edited by one. Copy; never paraphrase; never invent.
Anything this document asserts that no source said is a defect, not a
convenience.

## Argument

The record, or source files.

```
/write-spec context/system.md
/write-spec context/pricing-tax.md
/write-spec brief.md invariants.md
/write-spec
```

`context/X.md` writes `specs/X.md`. The record's Settled list is what the
spec is made from; the files it lists under Sources are read too.
`context/system.md` writes `specs/system.md`, the one spec for the whole
product; any other record writes a per-topic spec beside it with
`Parent: specs/system.md`. The loop reads `specs/*` and treats all of them
as locked; it does not care which is which.

`items/<slug>/context/<slug>.md` — an item's record — writes
`items/<slug>/specs/<slug>.md`, beside the record, with `Parent:
goals/<ID>.md` naming the item's own goal (its `Goal:` or `Outcome:` line
in `items/<slug>/brief.md`), or `Parent: None yet` if the brief names
none. It is a per-topic spec in every other respect: read `specs/system.md`
too, and respect its invariants.

Source files without a record write `specs/system.md`. No argument: find
the sources by reading — a brief, a requirements file, a list of
invariants — not by guessing filenames.

The conversation is a secondary source. If a `specify` interview ran in
this window, its record already holds what it settled. With no record and
no files, a conversation that settled things is enough; say so. A question
the user left open is an open decision, not a requirement.

## Look first

Detect, do not assume:

- The record, every file it lists under Sources, and every file given.
  Read all of them in full.
- The repository: the code, its README, `CONTEXT.md`, `docs/adr/`. Use
  its vocabulary — if the code calls a thing a `TableSession`, so does the
  spec. Respect its ADRs — a recorded decision is a fact the spec must not
  contradict. The codebase is a source of facts and names, never of
  requirements: nothing goes into the spec because the code already does
  it. The spec is the target state, not what exists. An empty folder is a
  finding too.
- The output file: `ls -l` on it. No write bit means locked.

Say which sources you use and what role each plays, and what you found in
the repository, before writing.

## Do

**1. Extract, do not paraphrase.**

- **The parent.** The roadmap outcome this spec serves, if a source names
  one. Otherwise `None yet`. Never invent one.
- **The brief.** What the product is, who uses it, what it must do. Carry
  the source's own wording; tighten only for redundancy, never for meaning.
- **Out of scope.** What the source explicitly excludes, one line each —
  copied, not inferred. An undocumented gap is a bug; a documented gap is a
  decision.
- **The entities.** Every noun the system stores as a row, with the fields
  that matter to correctness — the fields an invariant or an acceptance
  criterion actually touches, not a full schema.
- **The invariants.** Copied **verbatim** from the record's Invariants, or
  from the source that carried them — numbered and grouped as they are
  there. Renaming a group label is fine; rewording an invariant's sentence
  is not — a test is written against that exact sentence later.
- **The exit conditions.** The finish line, as commands: one fenced block,
  one runnable command per line, cheapest first, each exiting non-zero
  while its criterion is not met. Propose them from the criteria the
  sources give — a numbered "done" list, a "without a reload", a number.
  On an empty folder the commands name tests that do not exist yet; that
  is expected — the tickets' steps create them, and the loop cannot finish
  until they pass. A criterion no command can check goes under
  `NOT CHECKED` with the reason; one only a person can judge goes under
  `HUMAN CHECK`, with what to look at. Do not invent a criterion the
  sources never gave. Prose is something a loop can claim to have
  satisfied; a command is something it cannot.
- **The seams — per-topic specs only.** A seam is the point where a
  behaviour can be observed and tested from outside. For each invariant
  the topic touches: the seam it is observed from and the module that owns
  it, as the interview settled them. Existing seams before new ones; the
  highest seam that reaches the behaviour; fewer is better, and the ideal
  number is one. An invariant with no seam or no owning module is a gap:
  list it under Open decisions.
- **The open decisions.** Every question the sources or the interview
  raised that the user could not or would not settle — in the user's own
  words, one line each, with what depends on it. Copied from the record's
  Open decisions where there is a record. A required section: if empty,
  say so and why; never delete the heading.

**2. Show the exit conditions and, for a per-topic spec, the seams, and
ask the user to confirm them.** One message, one answer. It is the one
question this skill asks: the commands are the finish line every ticket
cut from this spec inherits, so they are confirmed here, once.

**3. Write the spec** with the template below: `specs/<record name>.md`,
or `specs/system.md` when there is no record, or `items/<slug>/specs/<slug>.md`
when the record is an item's. Create the parent folder if needed. For a
per-topic or per-item spec, "What this is" describes the one topic or
item, not the product.

**4. State the lock at the top of the file; do not apply it.** Whatever
runs the ticket applies it, in its own working copy, after a person has
read it.

**5. Commit the spec.** `git add` the file just written and commit it:
`Spec: <name>` — the same name the file is written under (`system`, a
plain topic's slug, or the item's slug). A committed spec is what leaves
the tree clean for whatever cuts tickets next.

## Stop when

- A section has no source: no product description, no invariants, or
  nothing anywhere that says what finished means. Say which, name what you
  read and where you looked. Point at `specify`. A spec missing a section
  is an honest gap; a spec with a guessed section is a landmine.
- The output file is locked: a run holds it. Refuse to overwrite it.
  Changing a spec under a run is a person's decision, made by stopping the
  run first.
- The output file exists and is writable: say it will be replaced, then
  continue.
- The conversation holds a settled decision the record does not: the
  record is incomplete. Say so; it is what a later session will read.
- A source contradicts an ADR: say so. Do not pick a side.
- You are about to ask anything other than the one confirmation: you do
  not interview. Point at `specify`.

## The template

```markdown
# <project name> — what must be true

Parent: <the roadmap outcome this spec serves — `None yet` is a legal value>

**Locked while a run holds it. No agent working a ticket edits this file.
To change a requirement: stop the run, edit, cut the tickets again.**

## What this is

<the brief, in the source's own words, tightened for redundancy only>

## Out of scope

<what the source explicitly excludes, one line each — copied, not inferred>

## Entities

<one short block per entity: its name, and the fields an invariant or an
exit condition actually touches>

## Invariants

<verbatim from the source, numbered and grouped as the source has them>

## Exit conditions

<one fenced block, one command per line, cheapest first — what must pass
for this spec to count as finished. Tickets cut from this spec inherit
from it>

NOT CHECKED
- <criterion no command checks>, because <reason>

HUMAN CHECK
- <what a person must look at, and what they are looking for>

## Seams and testing

<per-topic specs only; leave out of specs/system.md. For each invariant
above: the seam it is observed from, and the module that owns it. Which
tests already exist nearby. External behaviour only, never implementation
detail>

## Open decisions

<required. Every question the user could not or would not settle, in
their words, one line each, with what depends on it. If empty, say so and
why — never delete the heading. An assumption recorded here as an open
decision is a specification; an assumption recorded anywhere else as a
fact is a landmine>
```

## Attribution

The verbatim-not-paraphrased rule, the "stop rather than invent" rule, and
the one-spec-then-siblings shape are this project's own, arrived at
because an agentic loop treats `specs/*` as locked ground truth — see
[agentic-engineering: ralph-loop-setup.md](https://github.com/SaschaKubisch/agentic-engineering/blob/main/masters/ralph-loop-setup.md)
§3.4 and §3.7: "the loop can rewrite the
requirements to match what it built... the same failure as an agent
editing a test to make it pass." The file layout is Geoffrey Huntley's
(`specs/*`, [ghuntley.com/ralph](https://ghuntley.com/ralph/)); the name
`system.md` for the first spec is the reference setup's own. The finish
line as commands rather than prose is this project's own rule. Exploring the
codebase first, using its vocabulary and respecting its ADRs, the spec as
what survives the end of a context window, and the seam discipline
(existing seams first, the highest one, as few as possible) are from the
`to-spec` skill in [mattpocock/skills](https://github.com/mattpocock/skills)
(MIT); the method, not the text.

Licence: MIT, see `LICENSE` beside this folder.
