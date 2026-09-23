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
  interview record of everything else that settled.
- **write-spec** — turns an interview record into a locked spec: the
  word-for-word statement of what must be true, with a finish line of
  runnable commands.
- **write-tickets** — cuts a spec into tickets: vertical slices sized to
  one run, each with its steps, its exit conditions, and a validation
  report as its last review.
- **build** — the method for working one ticket to done: a branch, one
  test per step, validation from cheapest check to end to end, and a
  self-contained HTML report.
- **judge** — the method for checking a built ticket: runs every check
  again, reads the diff for softened tests, reads every screenshot
  against its claim, and writes a verdict. Fixes nothing itself.
- **implement** — the loop that runs one ticket through the builder and
  the judge until the judge approves, with no round cap but the
  person's own hand.

## The flow

```
specify -> write-spec -> write-tickets -> implement
```

`specify` settles what is meant and writes an interview record.
`write-spec` turns that record into a locked spec. `write-tickets` cuts
the spec into tickets — small enough for one run, each with its own
exit conditions. `implement` then works one ticket at a time: it hands
the ticket to a **builder** agent, which follows the **build** skill to
implement and validate it, and then to a **judge** agent, which follows
the **judge** skill to check the builder's work without fixing anything
itself. While the judge requests changes, the builder works its
findings and the judge checks again — there is no round cap, only the
person's own hand to stop it. `build` and `judge` are not run on their
own in this flow; they are the methods `implement`'s two agents follow.
A person can also type `/build` or `/judge` directly to work or check a
ticket by hand, outside the loop.

## Install

```
./install.sh /path/to/project
```

This copies `specify/`, `write-spec/`, `write-tickets/`, `build/`,
`judge/` and `implement/` into `<project>/.claude/skills/<name>/`,
`LICENSE` into `<project>/.claude/skills/LICENSE`, and
`agents/builder.md` and `agents/judge.md` into
`<project>/.claude/agents/`. It replaces files with the same names and
touches nothing else in the project.

Without the script, copy the same folders by hand into the same places.

## Conventions

`build`, `write-tickets` and `judge` all read one section of the
project's own `CLAUDE.md` for the facts specific to that project — its
base branch, its checks, how it runs end to end, how it takes
screenshots, and whether a GitHub project mirrors its tickets. Add it
once, or let `write-tickets` propose it the first time it runs:

```
## Conventions
- base branch: main
- checks (cheapest first): npm run lint; npx tsc --noEmit; npm test; npm run build
- end to end: npx playwright test
- screenshots: Playwright, 1280x800 and 390x844, saved per test
- github project: <name, or none>
```

If the section is missing, the skills detect what they can from the
project (`package.json`, a `Makefile`, CI config) and write it in, so
later tickets do not detect it again.

## Licence

MIT, see `LICENSE`. It also credits the methods these skills adapt from
Matt Pocock's skills and Geoffrey Huntley's Ralph loop; see each skill's
own `## Attribution` section for what came from where.

## Related

[anthrazit](https://github.com/SaschaKubisch/anthrazit), a Rust TUI and
bash harness, ships its own derived copies of these skills, adapted to
its harness. They started from this repo and are free to diverge from
it.
