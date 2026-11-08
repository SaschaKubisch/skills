#!/usr/bin/env bash
# Tests for run-ticket/run-ticket.sh. Run: bash test/run-ticket.test.sh
# Each case prints "ok <name>" when it passes and "not ok <name>: <why>" when
# it fails; the script exits non-zero if any case fails.
# Every case runs the loop in a temporary git repository with a fake worker, a
# small script named in RUN_TICKET_WORKER. No real model, no network.

here="$(cd "$(dirname "$0")/.." && pwd)"
script="$here/run-ticket/run-ticket.sh"
tmp="$(mktemp -d)"
trap 'chmod -R u+w "$tmp" 2>/dev/null; rm -rf "$tmp"' EXIT

# newrepo <column>: a repository holding ticket 0001-demo in that column.
# Sets $base (the case folder) and $repo (the checkout).
newrepo() {
  base="$(mktemp -d "$tmp/case.XXXXXX")"
  repo="$base/repo"
  local d="$repo/items/system/tickets/$1/0001-demo"
  mkdir -p "$d" "$repo/specs"
  cat > "$d/ticket.md" <<'EOF'
# 0001 Demo

Summary: A ticket for the tests.
Parent: specs/system.md
Kind: code

## Steps

1. Step one
2. Step two
3. Step three

## Completion conditions

```
test -f done.flag
```
EOF
  echo "the spec" > "$repo/specs/system.md"
  echo "protect me" > "$repo/protect-me.txt"
  git -C "$repo" init -q
  git -C "$repo" config user.email t@example.com
  git -C "$repo" config user.name tester
  git -C "$repo" config commit.gpgsign false
  git -C "$repo" add -A
  git -C "$repo" commit -q -m "Start"
}

# mkworker <body>: write the fake worker and name it in RUN_TICKET_WORKER.
# It saves the prompt it reads on standard input. work makes a commit that does
# not satisfy the completion conditions; finish makes the commit that does.
mkworker() {
  {
    echo 'cat > "$OUT/prompt-$RUN_TICKET_ITERATION.txt"'
    echo 'work() { echo x > "work-$RUN_TICKET_ITERATION.txt"; git add "work-$RUN_TICKET_ITERATION.txt"; git commit -q -m "work $RUN_TICKET_ITERATION"; }'
    echo 'finish() { : > done.flag; git add done.flag; git commit -q -m "done"; }'
    echo "$1"
  } > "$base/worker.sh"
  export OUT="$base" RUN_TICKET_WORKER="bash $base/worker.sh"
}

# run_loop <options>: start the loop in $repo on $ticketarg; sets $code.
run_loop() {
  ( cd "$repo" && bash "$script" "${ticketarg:-0001-demo}" "$@" ) > "$base/out" 2> "$base/err"
  code=$?
}

rundir() { ls -d "$repo"/.run-ticket/0001-demo-* 2>/dev/null | head -1; }
field() { sed -n "s/^$1=//p" "$(rundir)/result" 2>/dev/null; }

problems=""
is() { [ "$1" = "$2" ] || problems="$problems [$3: got '$1', want '$2']"; }
has() { grep -qF -- "$2" "$1" 2>/dev/null || problems="$problems [$1 lacks '$2']"; }
yes() { [ -e "$1" ] || problems="$problems [missing $1]"; }
verdict() {
  if [ -z "$problems" ]; then echo "ok $1"; else echo "not ok $1:$problems"; return 1; fi
}

t1() {
  newrepo backlog; mkworker 'finish'
  run_loop --turn-limit 3 --strikes 2
  is "$code" 0 "exit code"; is "$(field status)" passed status; is "$(field iterations)" 1 iterations
  verdict "passes in iteration 1"
}

t2() {
  newrepo backlog; mkworker 'if [ "$RUN_TICKET_ITERATION" = 2 ]; then finish; else work; fi'
  run_loop --turn-limit 5 --strikes 2
  is "$code" 0 "exit code"; is "$(field iterations)" 2 iterations
  is "$(ls "$(rundir)" | grep -c '^iter-[0-9]*-worker.log$')" 2 "worker logs"
  verdict "passes in iteration 2"
}

t3() {
  newrepo backlog
  mkworker 'echo "The ticket is done. <promise>COMPLETE</promise>"; work'
  run_loop --turn-limit 3 --strikes 3
  is "$code" 3 "exit code"; is "$(field status)" turn-limit status; is "$(field iterations)" 3 iterations
  has "$(rundir)/iter-1-worker.log" "<promise>COMPLETE</promise>"
  verdict "a claim of done does not stop the loop"
}

t4() {
  newrepo backlog; mkworker 'work'
  run_loop --turn-limit 4 --strikes 2
  is "$code" 3 "exit code"; is "$(field status)" turn-limit status; is "$(field iterations)" 4 iterations
  is "$(ls "$(rundir)" | grep -c '^iter-[0-9]*-worker.log$')" 4 "worker logs"
  verdict "turn limit"
}

t5() {
  newrepo backlog; mkworker 'echo "no commit"'
  run_loop --turn-limit 10 --strikes 3
  is "$code" 4 "exit code"; is "$(field status)" circuit-breaker-no-progress status
  is "$(field iterations)" 3 "iterations at the third strike"
  newrepo backlog; mkworker 'if [ $((RUN_TICKET_ITERATION % 2)) = 1 ]; then work; fi'
  run_loop --turn-limit 6 --strikes 2
  is "$code" 3 "exit code with alternating progress"; is "$(field iterations)" 6 "alternating iterations"
  verdict "circuit breaker, no progress"
}

t6() {
  newrepo backlog
  mkworker 'grep -v "Step two" PROGRESS.md > p.tmp; mv p.tmp PROGRESS.md; work'
  run_loop --turn-limit 5 --strikes 5
  is "$code" 5 "exit code, line deleted"; is "$(field status)" circuit-breaker-progress-file status
  newrepo backlog
  mkworker 'if [ "$RUN_TICKET_ITERATION" = 1 ]; then sed "s/^- \[ \] Step one/- [x] Step one/" PROGRESS.md > p.tmp; else sed "s/^- \[x\] /- [ ] /" PROGRESS.md > p.tmp; fi; mv p.tmp PROGRESS.md; work'
  run_loop --turn-limit 5 --strikes 5
  is "$code" 5 "exit code, box unticked"; is "$(field iterations)" 2 "iterations, box unticked"
  newrepo backlog
  mkworker 'if [ "$RUN_TICKET_ITERATION" = 1 ]; then sed "s/^- \[ \] Step one/- [x] Step one/" PROGRESS.md > p.tmp; else sed -e "s/^- \[x\] Step one/- [ ] Step one/" -e "s/^- \[ \] Step two/- [x] Step two/" PROGRESS.md > p.tmp; fi; mv p.tmp PROGRESS.md; work'
  run_loop --turn-limit 5 --strikes 5
  is "$code" 5 "exit code, one box unticked and another ticked"
  verdict "circuit breaker, progress file"
}

t7() {
  if [ "$(id -u)" -eq 0 ]; then
    echo "ok protected paths (skipped: running as root, which a file mode does not bind)"; return
  fi
  newrepo backlog
  mkworker '{ echo x >> "$RUN_TICKET_FILE"; echo "ticket=$?"; echo x >> specs/system.md; echo "spec=$?"; echo x >> protect-me.txt; echo "protect=$?"; } > "$OUT/attempts" 2>/dev/null
echo ok > new-test.txt; git add new-test.txt; git commit -q -m "new test"; finish'
  run_loop --turn-limit 2 --strikes 2 --protect protect-me.txt --protect no-such-file
  is "$code" 0 "exit code"
  is "$(tr '\n' ' ' < "$base/attempts")" "ticket=1 spec=1 protect=1 " "the appends fail"
  local wt; wt="$(field worktree)"
  cmp -s "$wt/items/system/tickets/in-progress/0001-demo/ticket.md" \
    <(git -C "$repo" show HEAD:items/system/tickets/backlog/0001-demo/ticket.md) || problems="$problems [ticket changed]"
  cmp -s "$wt/specs/system.md" "$repo/specs/system.md" || problems="$problems [spec changed]"
  cmp -s "$wt/protect-me.txt" "$repo/protect-me.txt" || problems="$problems [protected path changed]"
  is "$(git -C "$wt" ls-files new-test.txt)" new-test.txt "a new test file stays writable"
  verdict "protected paths"
}

t8() {
  newrepo in-progress; mkworker 'finish'
  echo later > "$repo/later.txt"; git -C "$repo" add later.txt; git -C "$repo" commit -q -m "Later"
  local head prev; head="$(git -C "$repo" rev-parse HEAD)"; prev="$(git -C "$repo" rev-parse HEAD~1)"
  ticketarg=items/system/tickets/in-progress/0001-demo
  run_loop --turn-limit 2 --strikes 2 --commit HEAD~1
  local wt br; wt="$(field worktree)"; br="$(field branch)"
  is "$code" 0 "exit code"
  is "$(git -C "$repo" merge-base HEAD "$br")" "$prev" "the run branch starts at --commit"
  case "$br" in run/0001-demo-*) ;; *) problems="$problems [branch name $br]" ;; esac
  is "$(git -C "$wt" rev-parse --abbrev-ref HEAD)" "$br" "the worktree is on its own branch"
  [ ! -e "$wt/later.txt" ] || problems="$problems [the worktree has a file from after --commit]"
  is "$(git -C "$repo" rev-parse HEAD)" "$head" "the original HEAD"
  is "$(git -C "$repo" status --porcelain)" "" "the original tree is clean"
  yes "$wt"; is "$(git -C "$repo" worktree list | wc -l | tr -d ' ')" 2 "the worktree is still there"
  verdict "throwaway worktree"
}

t9() {
  newrepo backlog; mkworker 'echo "hello from the worker"; echo "and its stderr" >&2
if [ "$RUN_TICKET_ITERATION" = 2 ]; then finish; else work; fi'
  run_loop --turn-limit 4 --strikes 2
  local r; r="$(rundir)"
  for f in iter-1-worker.log iter-2-worker.log iter-1-conditions.log iter-2-conditions.log diff.patch result run.log; do yes "$r/$f"; done
  has "$r/iter-1-worker.log" "hello from the worker"; has "$r/iter-1-worker.log" "and its stderr"
  has "$r/iter-1-conditions.log" "test -f done.flag"; has "$r/iter-1-conditions.log" "exit code 1"
  has "$r/iter-2-conditions.log" "exit code 0"
  has "$r/diff.patch" "done.flag"
  has "$r/result" "status=passed"
  has "$base/out" "$r/iter-2-worker.log"
  verdict "evidence"
}

t10() {
  newrepo backlog; mkworker 'finish'
  run_loop --turn-limit 2 --strikes 2
  local wt sha; wt="$(field worktree)"
  is "$(git -C "$wt" log --format=%s | grep -c '^Claim ticket 0001-demo$')" 1 "one claim commit"
  sha="$(git -C "$wt" log --format='%H %s' | sed -n 's/^\([0-9a-f]*\) Claim ticket 0001-demo$/\1/p')"
  local changes; changes="$(git -C "$wt" show --name-status --format= "$sha")"
  is "$(echo "$changes" | wc -l | tr -d ' ')" 1 "files in the claim commit"
  case "$changes" in R*backlog/0001-demo/ticket.md*in-progress/0001-demo/ticket.md) ;; *) problems="$problems [claim is not a move: $changes]" ;; esac
  is "$(git -C "$wt" rev-parse "$sha^")" "$(field start_commit)" "the claim sits on the start commit"
  yes "$repo/items/system/tickets/backlog/0001-demo"
  newrepo in-progress; mkworker 'finish'
  run_loop --turn-limit 2 --strikes 2
  is "$(git -C "$(field worktree)" log --format=%s | grep -c '^Claim ticket')" 0 "no claim commit for a ticket in in-progress"
  # the refusals: exit 6, one line on standard error, no worktree, no worker
  refuse() {
    is "$code" 6 "$1: exit code"; is "$(wc -l < "$base/err" | tr -d ' ')" 1 "$1: one line"
    is "$(git -C "$repo" worktree list | wc -l | tr -d ' ')" 1 "$1: no worktree"
    [ ! -e "$base/started" ] || problems="$problems [$1: the worker started]"
  }
  newrepo done; mkworker 'touch "$OUT/started"'
  run_loop --turn-limit 2 --strikes 2; refuse "ticket in done"
  newrepo backlog; mkworker 'touch "$OUT/started"'
  sed '/^## Completion conditions/,$d' "$repo/items/system/tickets/backlog/0001-demo/ticket.md" > "$base/t.md"
  mv "$base/t.md" "$repo/items/system/tickets/backlog/0001-demo/ticket.md"
  git -C "$repo" commit -q -am "No conditions"
  run_loop --turn-limit 2 --strikes 2; refuse "ticket without completion conditions"
  newrepo backlog; mkworker 'touch "$OUT/started"'
  echo more >> "$repo/protect-me.txt"
  run_loop --turn-limit 2 --strikes 2; refuse "dirty checkout"
  newrepo backlog; mkworker 'touch "$OUT/started"'
  run_loop --turn-limit 2 --strikes 2 --commit no-such-rev; refuse "unresolvable --commit"
  ticketarg=9999-none run_loop --turn-limit 2 --strikes 2; refuse "ticket not found"
  verdict "claim and refusals"
}

t11() {
  newrepo backlog; mkworker 'touch "$OUT/started"'
  local a
  for a in "" "--turn-limit 3" "--strikes 2" "--turn-limit x --strikes 2" "--turn-limit 3 --strikes 0" \
           "--turn-limit 2.5 --strikes 1" "--turn-limit -1 --strikes 1" "--turn-limit 3 --strikes"; do
    run_loop $a
    is "$code" 2 "exit code for [$a]"
    grep -q '^usage:' "$base/err" || problems="$problems [no usage line for [$a]]"
  done
  is "$(git -C "$repo" worktree list | wc -l | tr -d ' ')" 1 "no worktree"
  [ ! -e "$base/started" ] || problems="$problems [the worker started]"
  verdict "missing or non-numeric limits"
}

t12() {
  newrepo backlog; mkworker 'finish'
  mkdir "$base/bin"; printf '#!/bin/sh\ntouch "%s/claude-started"\n' "$base" > "$base/bin/claude"; chmod +x "$base/bin/claude"
  PATH="$base/bin:$PATH"
  run_loop --turn-limit 2 --strikes 2
  is "$code" 0 "exit code"
  [ ! -e "$base/claude-started" ] || problems="$problems [the default worker started]"
  yes "$base/prompt-1.txt"; has "$base/prompt-1.txt" "PROGRESS.md"
  has "$base/prompt-1.txt" "items/system/tickets/in-progress/0001-demo/ticket.md"
  verdict "RUN_TICKET_WORKER replaces the worker command"
}

t13() {
  newrepo backlog
  mkdir "$base/bin"
  printf '#!/bin/sh\necho "$@" > "%s/claude-args"\ncat > "%s/claude-prompt"\n: > done.flag; git add done.flag; git commit -q -m done\n' "$base" "$base" > "$base/bin/claude"
  chmod +x "$base/bin/claude"
  PATH="$base/bin:$PATH"; unset RUN_TICKET_WORKER
  run_loop --turn-limit 2 --strikes 2
  is "$code" 0 "exit code"
  has "$base/claude-args" "-p"; has "$base/claude-args" "--dangerously-skip-permissions"
  has "$base/claude-prompt" "PROGRESS.md"
  verdict "the default worker command is Claude Code in print mode"
}

fail=0
for t in t1 t2 t3 t4 t5 t6 t7 t8 t9 t10 t11 t12 t13; do
  out="$( ( problems=""; "$t" ) 2>&1 )"
  echo "$out"
  case "$out" in ok*) ;; *) fail=1 ;; esac
done
exit "$fail"
