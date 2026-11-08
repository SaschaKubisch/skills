#!/usr/bin/env bash
# run-ticket.sh: the loop. It works one ticket in a throwaway git worktree.
#
#   bash run-ticket/run-ticket.sh <ticket> --turn-limit N --strikes N \
#        [--commit <rev>] [--protect <path>]...
#
# <ticket> is a slug or the path of a ticket folder. Each iteration starts a
# fresh worker with run-ticket/prompt.md on its standard input; the worker
# command is $RUN_TICKET_WORKER. After every iteration this script, not the
# worker, runs the ticket's completion conditions. It stops on a pass, at the
# turn limit, or when the circuit breaker fires. It never merges, pushes,
# removes the worktree or moves the ticket to done.
# Exit codes: 0 passed, 2 usage, 3 turn limit, 4 circuit breaker (no progress),
# 5 circuit breaker (progress file), 6 refused to start.

here=$(cd "$(dirname "$0")" && pwd)
usage="usage: bash run-ticket.sh <ticket> --turn-limit N --strikes N [--commit <rev>] [--protect <path>]..."
worker=${RUN_TICKET_WORKER:-claude -p --dangerously-skip-permissions --output-format stream-json --verbose}
die() { echo "run-ticket: $2" >&2; exit "$1"; }
bad() { echo "run-ticket: $1" >&2; echo "$usage" >&2; exit 2; }
posint() { case $1 in ''|*[!0-9]*) return 1 ;; esac; [ "$1" -gt 0 ]; }

# 1. Read the arguments.
ticket=; limit=; strikes=; rev=HEAD; protect=
while [ $# -gt 0 ]; do
  case $1 in --*) [ $# -ge 2 ] || bad "$1 needs a value" ;; esac
  case $1 in
    --turn-limit) limit=$2 ;;
    --strikes) strikes=$2 ;;
    --commit) rev=$2 ;;
    --protect) protect="$protect$2"$'\n' ;;
    --*) bad "unknown option $1" ;;
    *) ticket=$1; shift; continue ;;
  esac
  shift 2
done
{ [ -n "$ticket" ] && posint "$limit" && posint "$strikes"; } ||
  bad "need a ticket, --turn-limit N and --strikes N, each N a positive integer"

# 2. Refuse to start, with exit code 6 and one line, when something is wrong.
root=$(git rev-parse --show-toplevel 2>/dev/null) || die 6 "not inside a git checkout"
dir=; [ -d "$ticket" ] && dir=$(cd "$ticket" && pwd -P)
cd "$root" && root=$(pwd -P) && cd "$root"
case $dir in
  "$root"/*) dir=${dir#"$root"/} ;;
  *) dir=$(find items -type d -path "*/tickets/*/$ticket" 2>/dev/null | head -1) ;;
esac
[ -n "$dir" ] && [ -f "$dir/ticket.md" ] || die 6 "ticket not found: $ticket"
slug=${dir##*/}; col=$(basename "$(dirname "$dir")")
[ "$col" != done ] || die 6 "$slug is in done"
conds=$(awk '/^## /{s=($0=="## Completion conditions");next} s&&/^```/{if(f)exit;f=1;next} s&&f&&NF&&!/^#/' "$dir/ticket.md")
[ -n "$conds" ] || die 6 "$slug has no ## Completion conditions block"
[ -z "$(git status --porcelain -uno)" ] || die 6 "the checkout has uncommitted changes"
start=$(git rev-parse --verify --quiet "$rev^{commit}") || die 6 "cannot resolve --commit $rev"
git cat-file -e "$start:$dir/ticket.md" 2>/dev/null || die 6 "$slug is not in commit $rev"

# 3. The run folder (the evidence) and the throwaway worktree beside the checkout.
ts=$(date -u +%Y%m%dT%H%M%SZ); run=$root/.run-ticket/$slug-$ts; branch=run/$slug-$ts
wt=$(dirname "$root")/$(basename "$root")-$slug-$ts
mkdir -p "$run" && echo '*' > .run-ticket/.gitignore
git worktree add -q -b "$branch" "$wt" "$start" 2>/dev/null || { rm -rf "$run"; die 6 "cannot make the worktree $wt"; }
log() { echo "$(date -u +%H:%M:%S) $*" | tee -a "$run/run.log"; }
cd "$wt" || exit 6

# 4. Claim the ticket: a ticket in backlog moves to in-progress in one commit.
if [ "$col" = backlog ]; then
  new=$(dirname "$(dirname "$dir")")/in-progress/$slug
  mkdir -p "$(dirname "$new")" && git mv "$dir" "$new" && git commit -q -m "Claim ticket $slug" ||
    die 6 "cannot claim $slug"
  dir=$new
fi
log "run $slug: worktree $wt, branch $branch"

# 5. PROGRESS.md: the first line names the ticket, then one box per step. It stays uncommitted.
{ echo "ticket: $slug"; awk '/^## /{s=($0=="## Steps");next} s&&/^[0-9]+\. /{sub(/^[0-9]+\. /,"- [ ] ");print}' "$dir/ticket.md"; } > PROGRESS.md
ex=$(git rev-parse --git-path info/exclude); mkdir -p "$(dirname "$ex")"
grep -qx PROGRESS.md "$ex" 2>/dev/null || echo PROGRESS.md >> "$ex"

# 6. Protected paths, read-only to the worker: the ticket file, the spec its
# Parent: line names, and each --protect path. A mode stops a plain append; it
# does not stop a worker that changes the mode or replaces the file (SKILL.md).
spec=$(sed -n 's/^Parent: *//p' "$dir/ticket.md" | head -1 | tr -d '`'); spec=${spec%%,*}
printf '%s\n' "$dir/ticket.md" "$spec" "$protect" | while IFS= read -r p; do
  [ -n "$p" ] && [ -e "$p" ] && chmod -R a-w "$p"
done

# 7. The loop. Each iteration: a fresh worker, then the completion conditions.
# The circuit breaker: $strikes iterations in a row with no new commit, or a
# PROGRESS.md that lost a box line or a tick, stops the run.
boxes() { cat PROGRESS.md 2>/dev/null | grep -c '^- \[[ x]\] '; }
n=0; strike=0; status=turn-limit
while [ "$n" -lt "$limit" ]; do
  n=$((n + 1))
  before=$(git rev-list --count "$start"..HEAD); nboxes=$(boxes); ticked=$(grep '^- \[x\] ' PROGRESS.md)
  { cat "$here/prompt.md"; echo; echo "The ticket file is $dir/ticket.md."; } |
    RUN_TICKET_ITERATION=$n RUN_TICKET_FILE=$dir/ticket.md bash -c "$worker" > "$run/iter-$n-worker.log" 2>&1
  log "iteration $n: the worker exited with code $?"
  fails=0; : > "$run/iter-$n-conditions.log"
  while IFS= read -r c; do
    out=$(bash -c "$c" </dev/null 2>&1); rc=$?
    printf '$ %s\nexit code %s\n%s\n\n' "$c" "$rc" "$out" >> "$run/iter-$n-conditions.log"
    [ "$rc" -eq 0 ] || fails=$((fails + 1))
  done <<<"$conds"
  log "iteration $n: $fails completion condition(s) fail"
  [ "$fails" -eq 0 ] && { status=passed; break; }
  if [ "$(git rev-list --count "$start"..HEAD)" -gt "$before" ]; then strike=0; else strike=$((strike + 1)); fi
  lost=0; [ "$(boxes)" -ge "$nboxes" ] || lost=1
  while IFS= read -r l; do
    [ -z "$l" ] || grep -qxF -- "$l" PROGRESS.md 2>/dev/null || lost=1
  done <<<"$ticked"
  [ "$lost" -eq 0 ] || { status=circuit-breaker-progress-file; break; }
  [ "$strike" -lt "$strikes" ] || { status=circuit-breaker-no-progress; break; }
done

# 8. Stop: write the evidence, print where everything is, exit with the status code.
last=$(git rev-parse HEAD)
git diff "$start" "$last" > "$run/diff.patch"
printf 'status=%s\niterations=%s\nstart_commit=%s\nlast_commit=%s\nworktree=%s\nbranch=%s\n' \
  "$status" "$n" "$start" "$last" "$wt" "$branch" > "$run/result"
log "stopped: $status after $n iteration(s)"
cat <<EOF
status:          $status
worktree:        $wt
branch:          $branch
run folder:      $run
last worker log: $run/iter-$n-worker.log
remove the worktree when you are done:
  chmod -R u+w '$wt' && git -C '$root' worktree remove --force '$wt'
EOF
case $status in passed) exit 0 ;; turn-limit) exit 3 ;; circuit-breaker-no-progress) exit 4 ;; *) exit 5 ;; esac
