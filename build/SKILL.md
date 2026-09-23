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
- `PROGRESS.md` at the working-tree root: if present, the steps already
  ticked are done; start at the first unticked one. If absent, write it
  from the ticket's Steps, one `- [ ] ` line per step. It is a working
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
- github project: <name, or none>
```

`write-tickets` and `judge` read it the same way this method does. When
it is missing: detect what it would say — `package.json`, a `Makefile`,
CI config for the checks; a UI or not, and which kind, for the
screenshot method — then write it in, so the next ticket does not
detect it again. Defaults when nothing declares it: a web UI gets
Playwright at 1280x800 and 390x844; a terminal UI gets text captures; no
UI gets command output saved as text; the base branch is `main`.

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
and go back to step 3.

With a UI, end to end is mandatory, and three sets of shots exist before
validation counts, each captured by Conventions' screenshot method, at
every size Conventions declares:

- **One full walkthrough** of the flow the ticket delivers, as a user
  would do it, with a shot at every screen it passes, at every declared
  size. Named `walkthrough-<NN>-<screen>.png`.
- **One test per invariant the ticket touches**, named
  `invariant-<NN>-<slug>`, with a shot at the moment the invariant is
  observed. Under Invariants this touches, every line has a test.
- **One test per exit condition a screen can observe**, named
  `exit-<NN>-<slug>`, with its shot.

Save each shot straight into the ticket's `validation/screenshots/`
folder as it is captured.

**5. The report.** `validation/agent-report.html` in the ticket folder,
from the template below, self-contained: screenshots by relative path in
`screenshots/`, no external asset but the diagram renderer. Written for
someone who has not seen the ticket: plain words, every project term
explained once. Sections, in order: implemented, per step; tests by kind
with each result; the commands with exit codes; not tested and why; the
screenshots with one line each on what to look at; the diagrams of the
code as built, whole, with this ticket's changes highlighted; the
rounds — the judge's, and the person's requested changes — appended as
they happen. Regenerated whole after every round; never patched. Commit
the report and `validation/screenshots/` every time they are written —
`<type>(<NNNN>): report` — so the tree is clean for the judge and for
the merge `implement` makes on accept.

**6. Hand back.** Push nothing. How the branch lands is not this
method's job. Run every line of the exit-conditions block yourself, in
order; all exit 0, or stop. The ticket reaches its item's `tickets/done/`
when the person accepts the report: the `implement` skill does the merge
and the move on that accept; working by hand, the person does it — merge,
then `git mv` to `done/`, and a commit. Then hand back: the report's
path, which steps are ticked, what was not tested.

**7. A review round.** Findings arrive as unticked lines appended to
`PROGRESS.md` after the ticket's own steps — `judge round <n>: ...` from
the judge, or `change <n>: ...` from a person's request, through
`implement`'s accept question. Step 3 already works every unticked line
in order, whichever wrote it: test first, one commit each. Regenerate
the report and commit it, as in step 5. A finding you believe is wrong: say why — in the report,
under Not tested — leave the step unticked, and stop; a person decides.
Never argue a finding away in silence.

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
and the never-soften rule, which is the project's oldest: a check that
skips itself when inconvenient is how a test suite becomes decoration.

Licence: MIT, see `LICENSE` beside this folder.
