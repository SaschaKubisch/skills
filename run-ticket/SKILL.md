---
name: run-ticket
description: The loop for one ticket, typed by a person in a terminal. A short bash script claims the ticket, works it in a throwaway git worktree, starts a fresh worker for each iteration, runs the ticket's completion conditions itself after every iteration, stops on a pass, at the turn limit or when the circuit breaker fires, keeps the evidence of the run, and leaves the change for Review.
disable-model-invocation: true
---

# Run ticket

Work one ticket with a program outside the model. The program claims the
ticket, starts a worker, runs the ticket's completion conditions, stops on
a pass or on a limit, and leaves the result for a person to accept. It is
a script of under 150 lines, `run-ticket.sh`, that can be read in full.

Typed by a person in a terminal. It is not part of the planning flow
(`specify`, `write-spec`, `write-tickets`) and does not replace
`implement-ticket`, which works a ticket inside a Claude Code session.

```
bash .claude/skills/run-ticket/run-ticket.sh 0007-prices --turn-limit 8 --strikes 3
```

If the person types `/run-ticket <arguments>` in a Claude Code session,
run that same command once with the arguments they gave, show its output,
and do nothing else: never work the ticket in the session itself.

## Terms

- **The loop** — this program: it claims one ticket, starts a worker, runs
  the completion conditions after every iteration, stops on a pass or a
  limit, and leaves the result for a person.
- **Ticket** — one unit of work, a folder `items/<item>/tickets/<column>/<slug>/`
  holding `ticket.md`. The slug is the folder name.
- **Worker** — the agent that does the ticket's work. Claude Code in its
  print mode is the default; the command is replaceable.
- **Run** — one attempt at one ticket, from the claim to the point where
  the completion conditions pass or the run stops.
- **Iteration** — one pass inside a run: one fresh worker process, one
  unit of work (the next unticked step in the progress file), one commit.
- **Completion condition** — a command that must exit 0 before a run may
  report success. They sit in a fenced block under `## Completion
  conditions` in `ticket.md`, one command per line. Only the loop decides
  that they pass; the worker's report never does.
- **Turn limit** — the hard maximum number of iterations in a run.
- **Circuit breaker** — stops a run that is not getting anywhere, in two
  ways: strikes, and the progress-file stop (both below).
- **Protected paths** — files the worker may not change; the loop makes
  them read-only before the first iteration.
- **Progress file** — `PROGRESS.md` at the worktree root. Its first line
  is `ticket: <slug>`, then one `- [ ] <step>` line for each numbered step
  under `## Steps`. It stays uncommitted, as in the `build` skill.
- **Throwaway worktree** — a git worktree made for one run from a fixed
  commit, on its own branch.
- **Evidence** — what a run keeps in its run folder (below).
- **Review** — the stage after the work, where a person reads the finished
  change and accepts or refuses it.

## Starting a run

```
bash run-ticket.sh <ticket> --turn-limit N --strikes N [--commit <rev>] [--protect <path>]...
```

- `<ticket>`: a slug, or the path of a ticket folder. It is looked up in
  the current checkout, under `items/*/tickets/`.
- `--turn-limit N`: the most iterations the run may use. Required.
- `--strikes N`: how many iterations in a row may add no commit before the
  run stops. Required.
- `--commit <rev>`: the commit the worktree is made from. Default `HEAD`.
- `--protect <path>`: one more protected path, relative to the repository
  root; repeat the option for more.

`N` is a positive integer. There are no defaults for the turn limit and
the strikes: a missing or non-numeric value exits with code 2 and the
usage line. Read the right values off a dry run on a real ticket.

### The worker command

The variable `RUN_TICKET_WORKER` holds a shell command. The loop starts it
once per iteration in the worktree and writes the prompt (`prompt.md` and
the path of the ticket file) to its standard input. It also sets
`RUN_TICKET_ITERATION` (the iteration number) and `RUN_TICKET_FILE` (the
ticket file's path in the worktree). The default is

```
claude -p --dangerously-skip-permissions --output-format stream-json --verbose
```

which is Claude Code in print mode with its permission checks off, and a
transcript of every message and tool call in the worker log. The worker
can reach any file and any host that the person can, and the throwaway
worktree is a boundary for git and not for the machine.

## What a run does

1. Refuses to start, with exit code 6 and one line naming the reason, when
   the ticket is not found, is in `done`, has no fenced block under `##
   Completion conditions`, when the checkout has uncommitted changes to
   tracked files, or when `--commit` does not resolve. A refusal leaves no
   worktree and no run folder.
2. Makes the run folder `.run-ticket/<slug>-<UTC timestamp>/` in the
   current checkout (git ignores it), and the worktree beside the checkout
   from `--commit`, on the branch `run/<slug>-<timestamp>`.
3. Claims the ticket in the worktree. A ticket in `backlog/` moves to
   `in-progress/` in one commit, `Claim ticket <slug>`. A ticket already in
   `in-progress/` is continued with no commit.
4. Writes the progress file.
5. Makes the protected paths read-only: the ticket file, the spec that its
   `Parent:` line names (the part before the first comma) when the file
   exists, and each `--protect` path that exists.
6. Reads the completion conditions from the ticket, once. Then, for
   iteration 1 up to the turn limit: starts the worker; when it exits,
   runs each completion condition with `bash -c` in the worktree.
   - All exit 0: the run stops, `passed`.
   - Otherwise it counts progress. An iteration made progress when it added
     at least one commit. After `--strikes` iterations in a row without
     progress the run stops, `circuit-breaker-no-progress`. If the progress
     file has fewer checkbox lines than before the iteration, or a box that
     was ticked is no longer ticked, the run stops,
     `circuit-breaker-progress-file`. The progress-file stop is checked first.
   - The turn limit is reached without a pass: `turn-limit`.
7. On every stop: writes the result and the diff, prints where everything
   is, and exits with the code of the status.

### Exit codes

| Code | Status                          | Meaning                                         |
|------|---------------------------------|-------------------------------------------------|
| 0    | `passed`                        | every completion condition exited 0             |
| 2    | (none)                          | usage: a missing or bad argument                |
| 3    | `turn-limit`                    | the turn limit was reached without a pass       |
| 4    | `circuit-breaker-no-progress`   | `--strikes` iterations in a row added no commit |
| 5    | `circuit-breaker-progress-file` | the progress file lost a line or a tick         |
| 6    | (none)                          | refused to start                                |

## What it keeps

In `.run-ticket/<slug>-<timestamp>/`, in the checkout the loop was started
from:

- `run.log`: one line for each event, also printed while the run goes.
- `iter-N-worker.log`: everything the worker of iteration N printed, the
  transcript for the default worker.
- `iter-N-conditions.log`: each completion condition, its exit code and its
  output, after iteration N.
- `diff.patch`: the diff from the start commit to the last commit.
- `result`: `status`, `iterations`, `start_commit`, `last_commit`,
  `worktree` and `branch`, one `key=value` per line.

The loop prints the status, the worktree path, the branch, the run folder,
the worker log of the last iteration, and the command that removes the
worktree.

## What the protected paths cover

A read-only file mode (`chmod a-w`) stops a plain append or overwrite by
a command such as `echo x >> file`. The ticket file and the spec are
protected because the worker is told not to edit them and the mode makes an
accident fail. Files the worker is meant to write, such as new tests, are
never protected unless named with `--protect`.

The mode does not stop the worker from:

- changing the mode back with `chmod`;
- replacing the file through its directory: writing a new file and
  renaming it over the old one, or `rm` and then a new file. In a test run
  `sed -i`, `perl -i`, `rm` followed by a new file, `mv` over the file and
  a Python script that renames a new file over it each changed a read-only
  ticket file. An editor that saves this way is not stopped either;
- running as another user, or as root, which a file mode does not bind;
- changing any file outside the protected paths, including the files the
  completion conditions run (test files, scripts) unless they are named
  with `--protect`, and including files outside the worktree.

One thing does hold: the completion conditions are read from the ticket
once, before the first iteration. A worker that changes the ticket file
changes no command that the loop runs.

## After a run: Review

The loop never merges, pushes, removes the worktree or moves the ticket to
`done`. The person reads the result in the worktree and `diff.patch`, and
then accepts or refuses it: merges the branch, moves the ticket, and
removes the worktree with the command the loop printed. Removing the
worktree does not delete the branch `run/<slug>-<timestamp>`.

A pass means the completion conditions exited 0 in the worktree as it
stood, including any change the worker left uncommitted. `diff.patch`
shows commits only.

## Not covered

A container or any boundary beyond the worktree; several tickets at once,
a queue, and a loop around `implement-ticket`; the values of the turn limit
and the strikes.

## Attribution

Ours. The shape follows the Ralph loop of Geoffrey Huntley: the same prompt
to a fresh agent, again and again, with progress kept in files. Here the loop
itself runs the checks that stop it.

Licence: MIT, see `LICENSE` beside this folder.
