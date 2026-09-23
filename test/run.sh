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

if [[ "$fail" -eq 0 ]]; then
  echo "PASS: install.sh copies every file byte-identical, refuses a bad target"
fi

exit "$fail"
