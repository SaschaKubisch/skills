#!/usr/bin/env bash
# test/run.sh — installs into a temp project directory and checks that
# every file landed byte-identical to its source. Exits nonzero on any
# failure.

set -euo pipefail

here="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

fail=0

check() {
  local src="$1" dst="$2"
  if [[ ! -e "$dst" ]]; then
    echo "FAIL: missing $dst" >&2
    fail=1
  elif ! diff -q "$src" "$dst" >/dev/null 2>&1; then
    echo "FAIL: $dst differs from $src" >&2
    fail=1
  fi
}

project="$tmp/project"
mkdir -p "$project"

"$here/install.sh" "$project" >/tmp/install-output.$$ 2>&1 || {
  echo "FAIL: install.sh exited nonzero on a valid target" >&2
  cat /tmp/install-output.$$ >&2
  rm -f /tmp/install-output.$$
  exit 1
}
rm -f /tmp/install-output.$$

for s in specify write-spec write-tickets build judge implement-ticket; do
  check "$here/$s/SKILL.md" "$project/.claude/skills/$s/SKILL.md"
done
check "$here/LICENSE" "$project/.claude/skills/LICENSE"
check "$here/agents/builder.md" "$project/.claude/agents/builder.md"
check "$here/agents/judge.md" "$project/.claude/agents/judge.md"
check "$here/workflow.yml" "$project/.claude/workflow.yml"

# a second install never overwrites the project's own workflow.yml
echo "# a project's own edit" >> "$project/.claude/workflow.yml"
before="$(cat "$project/.claude/workflow.yml")"
"$here/install.sh" "$project" >/dev/null 2>&1
after="$(cat "$project/.claude/workflow.yml")"
if [[ "$before" != "$after" ]]; then
  echo "FAIL: a second install.sh overwrote the project's own .claude/workflow.yml" >&2
  fail=1
fi

# a missing target directory is refused
if "$here/install.sh" "$tmp/does-not-exist" >/dev/null 2>&1; then
  echo "FAIL: install.sh should refuse a missing target directory" >&2
  fail=1
fi

# a target that is a file, not a directory, is refused
notadir="$tmp/notadir"
: > "$notadir"
if "$here/install.sh" "$notadir" >/dev/null 2>&1; then
  echo "FAIL: install.sh should refuse a non-directory target" >&2
  fail=1
fi

# the shared "Asking" paragraph is byte-identical in specify, write-spec,
# write-tickets and implement-ticket
asking_skills=(specify write-spec write-tickets implement-ticket)
asking_first=""
for s in "${asking_skills[@]}"; do
  line="$(grep -m1 "^> Every question to the person" "$here/$s/SKILL.md" || true)"
  if [[ -z "$line" ]]; then
    echo "FAIL: $s/SKILL.md has no Asking paragraph" >&2
    fail=1
    continue
  fi
  if [[ -z "$asking_first" ]]; then
    asking_first="$line"
  elif [[ "$line" != "$asking_first" ]]; then
    echo "FAIL: $s/SKILL.md's Asking paragraph differs from specify's" >&2
    fail=1
  fi
done

# --planning into a fresh project copies only the three planning skills
# and LICENSE, byte-identical, and no agents
planning_project="$tmp/planning-project"
mkdir -p "$planning_project"

"$here/install.sh" --planning "$planning_project" >/tmp/install-planning-output.$$ 2>&1 || {
  echo "FAIL: install.sh --planning exited nonzero on a valid target" >&2
  cat /tmp/install-planning-output.$$ >&2
  fail=1
}
rm -f /tmp/install-planning-output.$$

for s in specify write-spec write-tickets; do
  check "$here/$s/SKILL.md" "$planning_project/.claude/skills/$s/SKILL.md"
done
check "$here/LICENSE" "$planning_project/.claude/skills/LICENSE"

for s in build judge implement-ticket; do
  if [[ -e "$planning_project/.claude/skills/$s" ]]; then
    echo "FAIL: install.sh --planning copied $s, which it should not" >&2
    fail=1
  fi
done

if [[ -e "$planning_project/.claude/agents" ]]; then
  echo "FAIL: install.sh --planning created .claude/agents, which it should not" >&2
  fail=1
fi

if [[ -e "$planning_project/.claude/workflow.yml" ]]; then
  echo "FAIL: install.sh --planning copied workflow.yml, which it should not" >&2
  fail=1
fi

# an unknown flag is refused
if "$here/install.sh" --bogus "$tmp/does-not-matter" >/dev/null 2>&1; then
  echo "FAIL: install.sh should refuse an unknown flag" >&2
  fail=1
fi

# the fenced Conventions block: build/SKILL.md and README.md carry the
# full block and must be byte-identical to each other; write-tickets/SKILL.md
# carries a subset (it has no `screenshots` key, which is the build method's
# own) so every line of its block must appear verbatim, somewhere, in
# build's block
extract_conventions() {
  awk '
    capture {
      if ($0 == "```") { exit }
      print
      next
    }
    prevfence && $0 == "## Conventions" { capture = 1; print; next }
    { prevfence = ($0 == "```") }
  ' "$1"
}

build_conventions="$(extract_conventions "$here/build/SKILL.md")"
readme_conventions="$(extract_conventions "$here/README.md")"
write_tickets_conventions="$(extract_conventions "$here/write-tickets/SKILL.md")"

if [[ -z "$build_conventions" ]]; then
  echo "FAIL: build/SKILL.md has no fenced Conventions block" >&2
  fail=1
fi
if [[ -z "$readme_conventions" ]]; then
  echo "FAIL: README.md has no fenced Conventions block" >&2
  fail=1
fi
if [[ -z "$write_tickets_conventions" ]]; then
  echo "FAIL: write-tickets/SKILL.md has no fenced Conventions block" >&2
  fail=1
fi

if [[ -n "$build_conventions" && -n "$readme_conventions" \
      && "$readme_conventions" != "$build_conventions" ]]; then
  echo "FAIL: README.md's Conventions block differs from build/SKILL.md's" >&2
  fail=1
fi

if [[ -n "$build_conventions" && -n "$write_tickets_conventions" ]]; then
  while IFS= read -r line; do
    if ! grep -qxF -- "$line" <<<"$build_conventions"; then
      echo "FAIL: write-tickets/SKILL.md's Conventions block has a line not found in build/SKILL.md's: $line" >&2
      fail=1
      break
    fi
  done <<<"$write_tickets_conventions"
fi

if [[ "$fail" -eq 0 ]]; then
  echo "PASS: install.sh copies every file byte-identical, refuses a bad target, --planning copies only the planning skills and refuses unknown flags, workflow.yml lands and is never overwritten, build/SKILL.md and README.md's Conventions blocks match, and write-tickets/SKILL.md's Conventions block is a subset of build's"
fi

# the shared workflow config reader, on its own
node "$here/test/workflow-lib.test.mjs" || fail=1

# the evidence and report scripts, against their fixtures
node "$here/test/scripts.test.mjs" || fail=1

# the baseline-known-green check, against small git repos built on the fly
node "$here/test/baseline-known-green.test.mjs" || fail=1

exit "$fail"
