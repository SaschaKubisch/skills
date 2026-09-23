---
name: implement
description: The loop for one ticket, typed by a person — pick it up, start the builder (Sonnet, the build method), then the judge (Opus, the judge method), and while the judge requests changes start the builder again on the appended steps, then the judge; no round cap, only the person's hand. Ends with an approved verdict, the report's path opened in the browser and, if a publishing tool is available, published as a private page, and the one move left to the person: merge the branch.
disable-model-invocation: true
---

# Implement

Run one ticket through the builder and the judge until the judge
approves. The person types it, watches, and can stop it at any moment;
there is no round cap — only the person stops it.

```
/implement 0007-prices
```

## Look first

- The ticket, its column, its Blocked by: every blocker in `done/`, or
  stop and say which is not.
- `.claude/agents/builder.md` and `.claude/agents/judge.md` exist, and
  `.claude/skills/build` and `.claude/skills/judge` beside the other
  skills. Missing: say so and stop.
- The verdict always lives in `validation/verdict.md`; there is no pull
  request.

## Do

1. **Pick up.** If the ticket's folder is not already in its item's
   `tickets/in-progress/`, move it there — `git mv` and a commit — then
   follow the build method's branch rule: never work on the base branch;
   on it, create `<kind>/<slug>`; on any other branch, stay. Say the
   working copy's path.
2. **Build.** Start the `builder` agent on the working copy with the
   ticket and one instruction: follow the build method to the hand-back.
   Wait. Read what came back: the branch, the report's path, the steps
   ticked, what was not tested.
3. **Judge.** Start the `judge` agent on the same working copy with the
   ticket and one instruction: follow the judge method and give a
   verdict. Wait.
4. **Loop.** While the verdict requests changes: start the builder again
   with the round number and the appended steps, wait, then the judge.
   Say after each round what was found and what changed. There is no
   round cap; only the person stops it.
5. **Close.** On approval: run every line of the ticket's exit-conditions
   block yourself, in order. Move the ticket's folder to its item's
   `tickets/done/` — `git mv` and a commit — on the ticket's branch, so it
   reaches the base branch with the merge. Print the report's path and
   open it in the browser. If a tool for publishing a private page is
   available, publish `validation/agent-report.html` with its screenshots
   that way and print the link; otherwise say so. Say the one move left:
   merge the branch — how is the person's move, not this loop's.

## Stop when

- A blocker is not done: stop before pickup.
- The builder stopped on a check it believes is wrong: show the report's
  line and stop. A person edits specs and tests, not this loop.
- The builder or the judge asks for a person: relay the question and stop.
- The person stops it: stop wherever the loop is, and say where the
  ticket stands.

## Attribution

Ours. The loop is the improvement loop of
[agentic-engineering: anthrazit.md](https://github.com/SaschaKubisch/agentic-engineering/blob/main/masters/anthrazit.md),
done by two agents instead of one person and one agent, with the verdict
as its visible form.

Licence: MIT, see `LICENSE` beside this folder.
