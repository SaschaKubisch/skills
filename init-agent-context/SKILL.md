---
name: init-agent-context
description: >-
  Set up the standing instruction file every agent session in a project
  reads. AGENTS.md is the real file and CLAUDE.md is a link to it, so
  Claude Code and other agents read the same text. Writes structure and
  no rules: a short description of the project, a Map of the top-level
  folders, the exact Commands, and the Conventions section other skills
  read. In a project that already has the file, adds only the sections
  that are missing and never rewrites existing text. Asks every question
  through the answer form, up to two proposed options, then "I don't
  understand". Ships a check script that finds a broken pair, a path that
  does not exist, a date that goes stale, and a folder missing from the
  Map. Type it; the model never starts it on its own.
disable-model-invocation: true
---

# Init agent context

Give a project the one file every agent session reads first. It holds what
an agent cannot find out by reading the code: where things are, which
commands to run, and the project's own facts. It stays short.

The file is `AGENTS.md`. `CLAUDE.md` is a symlink to it. Claude Code reads
`CLAUDE.md`; Codex and most other agents read `AGENTS.md`. One text, two
names.

This skill writes structure and ships no rules. Rules are the project's to
write.

Two rules run through everything below:

- **Finding facts is your job. Deciding is the user's.** Never ask for
  what you can look up. Never decide what you could ask.
- **Never rewrite what is there.** An existing file keeps every word. You
  add the sections it lacks.

## Argument

None. The skill works on the project in the current directory.

```
/init-agent-context
```

## Look first

Detect, do not assume:

- `AGENTS.md` and `CLAUDE.md` at the project root. For each: absent, a real
  file, or a symlink, and where a symlink points.
- Both real files with different text: stop. See Stop when.
- A git repository? The branch checked out, the base branch (`git
  symbolic-ref refs/remotes/origin/HEAD`, else the branch names `main` and
  `master`), and the folders git tracks at the top level, hidden ones
  included. Not a git repository: say so; the files are written and
  nothing is committed. Outside git, the folders present are the top
  level.
- `README.md` and the manifest (`package.json`, `Cargo.toml`,
  `pyproject.toml`, `go.mod`): what the project says it is.
- The commands: the scripts in the manifest, `Makefile` targets, CI config.
  Run none of them here.
- `gh auth status`, and the GitHub projects of the repository, for the
  `github project` line.
- Which sections the existing file already has: the
  description, `## Map`, `## Commands`, `## Conventions`.

Say what you found before the first question.

## Asking

> Every question to the person goes through the session's question form — in Claude Code the AskUserQuestion tool — with a header of at most 12 characters, 2–4 options, the recommended one first and marked `(Recommended)`, each with a one-line description; the person can always answer in their own words. Independent questions may share one call, at most four; a question that depends on another waits for its answer. A question with no sensible options (a name, a list of sentences) is asked as plain text. Where the session has no question form, ask the same question as text with the options numbered, one question at a time, and wait.

In this skill no question goes as plain text. Every question below has
drafted options, and the person's own words go in the form's free-text
answer.

## Do

**1. Settle which file is real.** Ask only when `CLAUDE.md` is a real file
and `AGENTS.md` does not exist. Otherwise the answer is already known:
`AGENTS.md` is real when it exists or neither exists; the other name is a
link. Ask (see Asking), header `Real file`: "Which file keeps the text?",
options "Move the text to AGENTS.md and link CLAUDE.md to it (Recommended)"
/ "Keep CLAUDE.md as the real file and link AGENTS.md to it" / "I don't
understand".

**2. Propose the description.** Only when the file has none. Draft two
short versions of what the project is, one paragraph each, from the
README and the manifest, and ask (see Asking), header `Project`, with the
two drafts as options and then "I don't understand". The paragraph says
what the project is and who uses it. Own words go in the form's free-text
answer. Nothing to draft from, as in an empty folder: draft one option
from the folder's name and the files present, offer it, then "I don't
understand"; the person writes the real sentence in the free-text answer.

**3. Propose the Map.** Only when `## Map` is missing. One line per
top-level folder, from the Look first list, hidden folders included. Each
line is a plain list line that starts with the folder in backticks:

```
- `src/` what it holds
```

Derive "what it holds" from the folder's contents and the README. Show the
drafted lines in the question text and ask, header `Map`: "Use the map as
drafted? (Recommended)" / "Change it" / "I don't understand".

**4. Propose the Commands.** Only when `## Commands` is missing. The exact
commands with their flags, one per line, in one fenced block, detected as
under Look first: install, run, test, lint, build, and the check script
below. Show them in the question text and ask, header `Commands`: "Use the
commands as detected? (Recommended)" / "Change them" / "I don't
understand". The block always holds the check script, at the path it is
installed at:

```
bash .claude/skills/init-agent-context/scripts/check-agent-context.sh   # after editing this file
```

The comment on the line says it runs after the file is edited.

**5. Propose the Conventions.** Only when `## Conventions` is missing.
Write it in the format under Formats, the section other skills read. The
base branch comes from git. The checks come from the detected commands,
cheapest first. The end-to-end command is the one that runs the whole
thing as a user would, or `none` when the project has none. The GitHub
project is the one `gh` shows for the repository, else `none`. Show the
section in the question text and ask, header `Conventions`: "Use the
Conventions as drafted? (Recommended)" / "Change them" / "I don't
understand". Independent questions may share one call.

**6. Write the files.** The real file is the one step 1 settled. When the
user chose to move the text, first `git mv CLAUDE.md AGENTS.md` (plain
`mv` when `CLAUDE.md` is not tracked or outside git). When no real file
exists, create `AGENTS.md` with a title, the description, and the
sections in this order: `## Map`, `## Commands`, `## Conventions`. An
existing real file: append only the missing sections, in that order,
after its last line, and touch no existing line. Then link the other name
to the real file, in the same folder: `ln -s AGENTS.md CLAUDE.md`, or
`ln -s CLAUDE.md AGENTS.md` when `CLAUDE.md` stays the real file. A link
that already points to the real file stays.

**7. Check.** Run the check script at the path it is installed at, as
`bash .claude/skills/init-agent-context/scripts/check-agent-context.sh`.
Fix what it names, in the sections you wrote. A rule broken by text that
was already there is reported to the user and left as it is.

**8. Commit.** In a git repository, commit the files you wrote by path:
`git add -- AGENTS.md CLAUDE.md`, then `git commit -- AGENTS.md CLAUDE.md`
(a new file is unknown to git until added), with a message that names them, for
example `Add AGENTS.md and the CLAUDE.md link to it`. Not a git
repository: say so and skip. Never `git add -A`.

## Stop when

- Both `AGENTS.md` and `CLAUDE.md` are real files with different text: say
  so and stop. Never merge them. The user decides what to do with the two.
- A question needs a fact you could look up: look it up.
- A question depends on an answer you have not heard: it waits.
- More than one question would fit in the form: ask them in one call only
  when they are independent, at most four.
- A third proposed option seems needed: the question is two questions.
  Split it. The standing "I don't understand" is not a proposal.
- The user picks "I don't understand": explain with a plain example
  before asking again. Never move on from a question they did not
  understand.
- The user does not know what the project is: write what the README says
  and nothing more. Never your guess.
- A rule would go into the file: it does not. This skill writes structure
  only.
- A date or the words "as of" would go into the file: leave them out.
- The check script reports a rule broken in a section you wrote: fix it
  before committing.
- Existing text would change: it does not.

## Formats

**The Conventions section.** One `## Conventions` section, one bullet per
key. Other skills read it by these keys, so the keys are written exactly:

```
## Conventions
- base branch: main
- checks (cheapest first): npm run lint; npx tsc --noEmit; npm test; npm run build
- end to end: npx playwright test
- github project: <name, or none>
```

Defaults when a key is unknown: the base branch is `main`; the GitHub
project is `none`.

**The file.**

````markdown
# <project name>

<what the project is, one short paragraph>

## Map

- `<folder>/` <what it holds>

## Commands

```
<command with its flags>
bash .claude/skills/init-agent-context/scripts/check-agent-context.sh   # after editing this file
```

## Conventions
- base branch: <branch>
- checks (cheapest first): <command>; <command>
- end to end: <command, or none>
- github project: <name, or none>
````

## Attribution

Ours, MIT. The design follows the AGENTS.md convention (agents.md): one
plain markdown file at the project root that agents read, with the other
name linked to it. It follows Anthropic's guidance that a CLAUDE.md holds
what the model cannot discover from the code, such as commands and
conventions, and stays short.

Licence: MIT, see `LICENSE` beside this folder.
