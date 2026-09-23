---
name: specify
description: >-
  Interview the user about a brief, a feature or a whole product until
  nothing is left silently assumed, one question at a time through the
  answer form, up to two proposed options, one of them recommended, then
  always "I don't understand", which earns a plain explanation with
  examples before the question is asked again; the user can always
  answer in their own words instead. Three entries: the general
  interview on an empty repository; the goal interview, scoped to one
  roadmap goal; the item interview, reading items/<slug>/brief.md.
  Writes the project's vocabulary into CONTEXT.md and its hard decisions
  into docs/adr/ as they settle, and everything else it settled into an
  interview record — context/<topic>.md, or
  items/<slug>/context/<slug>.md for an item — at the close. Draws the
  settled thing as diagrams at the close, in the record, for the user to
  correct. Offered afterward, drafts headings and After lines into
  roadmap.md, only once the user says yes, and nothing under goals/ or
  items/. What the user cannot settle is recorded as an open decision,
  in their words. Writes no spec — write-spec does that next, from the
  record. Type it; the model never starts it on its own.
disable-model-invocation: true
---

# Specify

Interview the user until the two of you share one understanding of the
thing, and leave a paper trail in the repository while you do it: the
project's own words in `CONTEXT.md`, its hard decisions in `docs/adr/`,
and everything else it settled in an interview record, `context/<topic>.md`,
for `write-spec` to read.

Two rules run through everything below:

- **Finding facts is your job. Deciding is the user's.** Never ask for
  what you could look up. Never decide what you could ask.
- **Never record an assumption. If you don't know, ask.** If the user
  does not know either, write the question down as an open decision, in
  their words. The word "assumed" appears nowhere.

## Argument

Free text: what to interview about, or which of the three entries below
to run.

```
/specify brief.md
/specify prices and tax on the guest menu
/specify
/specify R-01
/specify items/table-ordering/brief.md
/specify R-01: let guests filter dishes by allergen
```

A file path under `items/` — `items/<slug>/brief.md` — is the **item
interview**: read the brief in full, then interview about that item
alone. Any other file path is read in full before the first question. A
phrase naming an existing roadmap heading, or a bare goal ID (`R-01`), is
the **goal interview**, scoped to that heading. A goal ID together with a
new capability or feature idea — not the heading's own words, something
that is not yet a candidate item under that goal — is a **proposal for a
new item**: say so, agree a short slug with the user the same way any
other slug is agreed (say it before the first question, the user can
change it), write `items/<slug>/brief.md` in the user's own words —
nothing added beyond what they just said, the same rule as everywhere
else in this skill — and continue at once into the item interview against
that brief, without a further invocation. Any other phrase is the topic
of a plain interview. Nothing, in a repository that already has a
`roadmap.md`, also means the goal interview, for a new heading not yet on
the roadmap — see "Look first". Nothing in a repository with no
`roadmap.md` is the **general interview**: read the
repository itself, then interview the user about what it is and what it
is for.

The argument also names the record this skill writes at the close: the
general interview writes `context/system.md`; a plain topic writes
`context/<slug>.md`, the slug made from the phrase (`prices and tax on
the guest menu` becomes `pricing-tax`); the item interview writes
`items/<slug>/context/<slug>.md`, named after the item, not the topic.
The goal interview writes no interview record of its own under
`context/` — its record is `goals/<ID>.md`, part of its close, below. Say
the slug or ID before the first question; the user can change it.

## Look first

Detect, do not assume. Read what is already here:

- Code, or an empty folder?
- A `roadmap.md`? Its headings are goals; one with no matching
  `goals/<ID>.md` is a draft — a heading proposed but never interviewed.
  If the argument names one of these, or names nothing and the user
  means to add a new one, this is the goal interview.
- A `CONTEXT.md`? A `CONTEXT-MAP.md`? Every term already there is settled
  unless the user reopens it.
- A `docs/adr/`? A recorded decision is a fact, not a question.
- Planning documents — a brief, a requirements file, anything under
  `specs/`? What they settle is settled; what they leave open is the
  interview. A document that already lists invariants settles them: say
  so, copy them into the record as they stand, and do not ask them again.
- An earlier record for this topic under `context/`, or for this item
  under `items/<slug>/context/`? Its settled decisions stand unless the
  user reopens them; its open decisions are the first questions of this
  interview.

Say what you found before the first question, and which entry you are
running and why.

## Asking

> Every question to the person goes through the session's question form — in Claude Code the AskUserQuestion tool — with a header of at most 12 characters, 2–4 options, the recommended one first and marked `(Recommended)`, each with a one-line description; the person can always answer in their own words. Independent questions may share one call, at most four; a question that depends on another waits for its answer. A question with no sensible options (a name, a list of sentences) is asked as plain text. Where the session has no question form, ask the same question as text with the options numbered, one question at a time, and wait.

## Do

**1. Map the thing as a design tree and ask one question at a time.**
Every decision branches into the smaller decisions that depend on it. The
**frontier** is every decision whose prerequisites are already settled —
the questions you can ask now without guessing at an answer you have not
heard yet. Pick one question from the frontier and ask it (see Asking,
above), in the question format below: up to two proposed options, the
recommended one first and marked `(Recommended)`, each with a one-line
description of what it means, and after them always "I don't
understand" — the form's own free-text answer already covers the
user's own words. When the user picks "I don't understand", explain the
question again before anything else, as to someone who has never done
this: what the thing is in one sentence, then one short scene from
their day for each option, what they would see and what would change
for them. No project words without a plain gloss. Then ask the same
question again. One question per call, never several bundled into one
form: Asking allows independent questions to share a call, but the
frontier changes with every answer, so only one question here is ever
independent at a time. Then stop and wait. When the answer is in, recompute the frontier
and ask the next question. A question whose answer depends on another
still open waits until that answer is in; asking it now forces a guess,
and a guessed answer is worse than an unasked question. Order the
frontier from the root of the tree outwards: vocabulary and entities
first, then lifecycles, then screens, then technology, then environment
facts. The interview is done when the frontier is empty.

Before the first question, say how many questions the frontier holds
right now, so the user knows the shape of the interview. Every question
carries a short title so the record can point at it.

**The goal interview is the same tree, scoped and steered by the goal,
without dogma.** No fixed template of questions every goal must answer —
the frontier still comes from what this particular goal needs settled,
starting from why it exists and what it changes for whoever it serves.
A capability or a feature that comes up while working the tree is not a
new branch to interrogate here: note it as a **candidate item**, one
line, under the goal record's own heading for them (see the record
format below), and move on. An item earns its own interview later,
against its own brief — that is the item interview's job, not this one.

The form always offers "Other" for free text; a free-text answer is the
user's decision like any other. A question with no sensible options — a
name, a URL, an address, a list of sentences — is asked in plain text
instead of the form, still one at a time.

One question is required in every interview, asked in plain text once the
entities are settled: **"What must always be true? One sentence each,
written so a test could check it."** Group the answers as the user groups
them and number them. These are the invariants; `write-spec` copies them
verbatim and the loop's checks are written against them. Skip it only
when a source document already carried them.

**2. Find facts yourself.** When a question needs a fact from the
environment — what the code does today, what a file contains, what a
library supports — start a subagent to find it. Do not block on it: only
the questions downstream of that fact wait; keep asking the rest of the
frontier meanwhile.

**3. While interviewing:**

- **Sharpen fuzzy words.** "You say account — the Customer or the User?
  They are different things." Propose one canonical term and ask.
- **Challenge against the glossary.** If the user uses a word that
  `CONTEXT.md` defines differently, say so at once and ask which is meant.
- **Test relationships with scenarios.** Invent concrete edge cases that
  force the boundary between two concepts to be stated.
- **Cross-check with the code.** If the user says how something works and
  the code disagrees, show the line and ask which is right.
- **Ask where a behaviour is observed from.** Its seam: the point outside
  the code where a test can see it. Prefer a seam that already exists,
  the highest one that reaches the behaviour, and as few as possible.
  `write-spec` writes the answer down; it does not decide it.

**4. Write the paper trail as things settle.** Three kinds of thing come
out of a session, and they land in three places:

- **A term** — the project's own word for a thing — lands in `CONTEXT.md`
  the moment it settles, in the glossary format below. Not batched at the
  end. One canonical word per concept, the others under `_Avoid_`. Only
  terms specific to this project. `CONTEXT.md` is a glossary and nothing
  else: no implementation detail, no spec, no notes. Create it when the
  first term settles. If a `CONTEXT-MAP.md` lists several contexts, write
  into the one the topic belongs to; if unclear, ask.
- **A decision** lands as an ADR under `docs/adr/`, in the ADR format
  below, only when all three hold: hard to reverse; surprising without
  context; a real trade-off between alternatives. If any is missing, no
  ADR. Most decisions do not qualify; a session with no ADR is normal.
  Offer one; do not write it unasked.
- **Everything else** — every decision the user settled that is neither a
  term nor an ADR — goes into the interview record at the close.

**5. Close when the frontier is empty:**

1. List the **open decisions**: every question the user could not or would
   not settle, in their words, one line each, with what depends on it. If
   the list is empty, say so.
2. Write the **interview record**:
   - The general interview or a plain topic: `context/<topic>.md`, in
     the record format below. Create `context/` if needed.
   - The item interview: `items/<slug>/context/<slug>.md`, named after
     the item.
   - The goal interview: `goals/<ID>.md`, in the goal record format
     below — its candidate items included, its Settled, Invariants and
     Diagrams the same shape as any other record. Also rewrite the
     roadmap heading's own paragraph and `After:` line in `roadmap.md` if
     the interview changed either, in place — the heading and its own
     text are not a separate ask; they are this record's own summary,
     kept in sync with it. This is the one case where the goal interview
     writes into `roadmap.md` on its own, without a further yes: the
     heading already exists, proposed and accepted earlier (by the
     roadmap draft, below, or by the user directly) — the interview only
     sharpens it.

   Any of these replaces an earlier record for the same topic, item or
   goal; it was read at the start.
3. **Draw the settled thing into the record**, under `## Diagrams`, in
   the diagram format below. The diagrams are the interviewer's reading
   of the settled lines, drawn so the user can correct a misunderstanding
   in one look instead of a page. Five kinds, each only when the record
   has the lines for it: the system in its surroundings (who and what
   talks to it), the entities and their relations, one user journey per
   role, one sequence per main flow, the lifecycle of the main entity.
   Every box and arrow traces to a numbered settled line or invariant;
   the sentences under the diagram name the numbers. No modules, layers,
   tables or folders: structure is decided by the code, not here. The one
   exception is a seam or a module an invariant names, drawn as the
   boundary a test runs against and labelled so.
4. **Commit what changed.** `git add` the record just written, the terms
   added to `CONTEXT.md`, any ADR, the item's `brief.md` if this session
   wrote it, and `roadmap.md` if the goal interview rewrote its heading,
   and commit exactly those paths together — `git commit -- <paths>`, so
   nothing the user had already staged rides along: `Record: <name>` —
   the topic, the item's slug, or the goal's ID, whichever named the
   record just written. Say what the commit added: the record, the terms,
   any ADR. Every later write in this close is committed the same way, as
   it happens, so the tree is clean when the chain reaches `implement`.
   Not a git repository: say so and skip every commit in this close.
5. **After the general interview only**, offer to draft the roadmap from
   `context/system.md`: propose one heading per goal the record implies,
   each with its `After:` line where one goal's work depends on
   another's, and one paragraph each — all as a single proposal, through
   the answer form (a yes/no question, see Formats). Write nothing until
   the user says yes. On yes, append the headings, their `After:` lines
   and their paragraphs to `roadmap.md` (creating it if needed) — **and
   nothing else**: no `goals/<ID>.md`, no `items/` — and commit it:
   `Roadmap: draft from <name>`. Each heading is a
   draft until its own goal interview gives it a record. On no, or a
   changed proposal, redraft and ask again; the record itself is
   unchanged either way. Every heading is written **exactly**
   `## <ID> — <title>`, an em dash surrounded by a space on each side
   (see A roadmap heading, under Formats) — the ID is read back out of
   this exact separator, so a heading written any other way (no
   separator, a plain hyphen, a colon) is not read as a goal at all: it
   is drawn as a draft with no title, forever, and `goals/<ID>.md`
   never matches it. This offer, and the handoff below, are about the
   record this interview just wrote — not about the drafted headings
   themselves: a draft heading is interviewed, not specified, before it
   has its own goal record.
6. **Close with the handoff.** Invite the user to read the record and
   correct the diagrams, then ask (see Asking): "Write the spec now?",
   options "Yes, the record is right; write the spec (Recommended)" /
   "Something in the record is wrong" / "Stop here" / "I don't
   understand" — the last explains, in plain words, what a spec is and
   what `write-spec` will do with the record, then asks again. "Something in the
   record is wrong" gets a plain-text follow-up — what is wrong — then
   the record is fixed, the fix committed (`Record: <name>, corrected`),
   and the same question asked again; the interview
   is not otherwise reopened. "Stop here" ends the skill; the record
   stands as written. On yes: read `.claude/skills/write-spec/SKILL.md`
   — the write-spec skill beside this one, at its installed path — in
   full, and follow it, with the record as its argument (an item's
   record for the item interview, a goal's for the goal interview).
   write-spec's own handoff carries the chain on to write-tickets.

## Stop when

- A question needs a fact you could look up: look it up. Never ask the
  user for it.
- A question depends on an answer you have not heard: it waits until
  that answer is in.
- More than one question would fit in the form: ask one, wait, then the
  next. Never bundle.
- A third proposed option seems needed in the interview: the question is two questions,
  so split it, or the third way is one sentence in the question text.
  The standing "I don't understand" option is not a proposal and does
  not count.
- The user picks "I don't understand": explain, with scenes, before
  asking anything. Never move on from a question the user did not
  understand.
- The user does not know: it becomes an open decision, in their words.
  Never your answer.
- Something would go into `CONTEXT.md` that is not a term: it goes into
  the record instead.
- The handoff question has not been answered "yes": do not read
  `write-spec`, and do not act further on the interview.
- The roadmap draft has not had an explicit yes: write nothing to
  `roadmap.md`. A changed mind after yes is a new proposal, asked again.
- A feature or capability comes up mid-goal-interview: note it as a
  candidate item and continue the goal's own frontier. Do not open an
  item interview for it in the same session.

## Formats

**A question** — one call of the answer form (see Asking):

```
header:   <title, at most 12 characters>
question: <the question, one or two sentences, ending in a question mark>
options:
  1. <recommended answer> (Recommended)
     <one line: what it means, and why it is recommended>
  2. <alternative>
     <one line: what it means, and its cost>
  3. I don't understand
     Always present, always last: the question is explained again in
     plain words with a scene per option, then asked again.
```

In the interview, two proposed options at most (the close's handoff
question is exempt); "I don't understand" is always last — the
form's own free-text answer already stands in for "my own answer", so
it is not a listed option. The recommended option is always first. A yes/no question offers "Yes, as proposed (Recommended)"
and "No, differently", and the user says how under Other. The question
text carries the proposal in full; the options do not repeat it.

**A roadmap heading** — one line in `roadmap.md`, an em dash between the
ID and the title, a space on each side of it:

```
## R-01 — Behaviour under test
```

Not `## R-01 Behaviour under test` (no separator), not `## R-01: ...`
(a colon), not `## R-01 - ...` (a plain hyphen is read too, but the em
dash is this project's own convention — write it). The part before the
separator is read back out verbatim as the ID everything else refers
to: `goals/<ID>.md`, an `After:` line naming it, the item interview's
own goal argument.

**`CONTEXT.md`:**

```markdown
# <context name>

<one or two sentences: what this context is and why it exists>

## Language

**Order**:
<one or two sentences. What it is, not what it does.>
_Avoid_: purchase, transaction

**TableSession**:
<...>
_Avoid_: visit, sitting
```

Group under subheadings when natural clusters appear; a flat list is fine
otherwise.

**An ADR** — `docs/adr/NNNN-slug.md`, numbered from the highest existing
number plus one, the folder created when the first one is needed:

```markdown
# <short title of the decision>

<one to three sentences: the context, what was decided, and why.>
```

Optional, only when they earn their place: a `status:` line (proposed,
accepted, deprecated, superseded by NNNN), the options considered, the
consequences.

**A diagram** — one fenced `mermaid` block, one of four types that every
mermaid since version 8 renders: `flowchart` for the surroundings and the
journeys, `erDiagram` for the entities, `sequenceDiagram` for a flow,
`stateDiagram-v2` for a lifecycle. No other type. Under it, at most five
sentences, each naming the settled lines or invariants it draws, by
number. Parse every block before closing: the agentic-engineering
repository's `scripts/check-mermaid.js` does it; without a checker, say
so. A diagram that does not parse renders as an error box in front of
the reader.

**The interview record:**

```markdown
# <topic> — interview record

Written by `specify` on <date>. Read by `write-spec`. Not a spec: a
record of what the user settled and what they left open, in their words.

## Sources

- <each file read before the first question, one line each>
- CONTEXT.md terms in force: <names>
- ADRs in force: <numbers and titles>

## Settled

1. <one decision, in the user's words — not paraphrased into requirements>
2. ...

## Invariants

<numbered, grouped as the user grouped them, one sentence each, verbatim.
If a source document carried them, copied from it as they stand>

## Diagrams

The interviewer's reading of the lines above, drawn. Correct a diagram
and the line behind it changes with it. Nothing here is a requirement
the lines above do not carry.

### <kind>: <what it shows>

```mermaid
<one diagram>
```

<at most five sentences: what the diagram shows and which settled lines
or invariants each part traces to, by number>

## Open decisions

- <question, in the user's words> — depends on it: <what>

## Written to disk this session

- CONTEXT.md: <terms added or changed>
- docs/adr/<NNNN-slug>.md: <title> (or "none")
```

Every line under Settled and Invariants is something the user said or
confirmed, numbered in the order it settled. Nothing there is inferred.
The record does not restate the glossary or the ADRs; it points at them.

The item interview writes this same shape to `items/<slug>/context/<slug>.md`,
titled `# <slug> — interview record`, its Sources including
`items/<slug>/brief.md`.

**A brief written by this skill**, when a new item is proposed straight
from a goal (see Argument) rather than handed to it ready-made,
`items/<slug>/brief.md`:

```markdown
# <slug>

<the ask, in the user's own words, exactly as given — nothing added>

Goal: <ID>
```

Nothing else. The item interview that follows is where everything else
gets settled.

**The goal record**, `goals/<ID>.md` — the goal interview's close:

```markdown
# <ID> — <heading, matching roadmap.md verbatim>

Written by `specify` on <date>. Read by `write-spec`.

## Sources

- <each file read before the first question, one line each>

## Settled

1. <one decision, in the user's words>
2. ...

## Invariants

<copied as they stand from the source that carried them, numbered and
grouped as there, or confirmed by the user in this interview; `None
settled.` if there are none — never delete the heading>

## Candidate items

- <a capability or feature named while working the tree, in the user's
  own words, one line — not interviewed here; each earns its own item
  interview later, from its own brief>

## Diagrams

<same format as any other record's Diagrams, when the goal has lines
that earn one>

## Open decisions

- <question, in the user's words> — depends on it: <what>
```

`Candidate items` may be empty; say so rather than omitting the heading.
None of the entries here become `items/` on their own — an item exists
once someone writes its brief and the item interview runs against it.

## Attribution

The method is Matt Pocock's, from [mattpocock/skills](https://github.com/mattpocock/skills)
(MIT): the design tree worked breadth-first in rounds, the frontier, and
facts-are-the-agent's-job are his `grilling`; the glossary in `CONTEXT.md`
with an avoid list, the three-gate rule for ADRs and their one-paragraph
form are his `domain-modeling`; pairing the two in one interview is his
`grill-with-docs`. This file is written from that method in this project's
words; none of his text is copied. Ours: the never-record-an-assumption
rule, the open-decisions list at the close, the look at the repository
before the first question, the interview record under `context/` — his
docs say what is neither a term nor an ADR is lost when the window ends;
ours writes it down — and the hand-off to `write-spec`.

Licence: MIT, see `LICENSE` beside this folder.
