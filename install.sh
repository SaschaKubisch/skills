#!/usr/bin/env bash
# install.sh — copy the skills, LICENSE and agent definitions into a project.
#
#   ./install.sh /path/to/project
#   ./install.sh --planning /path/to/project
#
# Without --planning: copies specify/, write-spec/, write-tickets/,
# init-agent-context/, build/, judge/ and implement-ticket/ into <project>/.claude/skills/<name>/,
# LICENSE into <project>/.claude/skills/LICENSE, agents/builder.md and
# agents/judge.md into <project>/.claude/agents/, and the default
# workflow.yml into <project>/.claude/workflow.yml — only when the
# project has none there yet; an existing one is never overwritten.
# With --planning: copies only the planning skills specify/, write-spec/
# and write-tickets/, plus init-agent-context/, into
# <project>/.claude/skills/<name>/ and LICENSE into
# <project>/.claude/skills/LICENSE; no agents and no workflow.yml are
# copied, since none of these four skills reads them.
# Existing files or folders with the same names are replaced; nothing
# else under the target is touched.
# Licence: MIT, see LICENSE.

set -euo pipefail

usage="usage: $0 [--planning] /path/to/project"

planning=0
target=""
for arg in "$@"; do
  case "$arg" in
    --planning)
      planning=1
      ;;
    -*)
      echo "$usage" >&2
      exit 1
      ;;
    *)
      target="$arg"
      ;;
  esac
done

[[ -n "$target" ]] || { echo "$usage" >&2; exit 1; }
[[ -d "$target" ]] || { echo "install: no such directory: $target" >&2; exit 1; }

here="$(cd "$(dirname "$0")" && pwd)"

if [[ "$planning" -eq 1 ]]; then
  skills=(specify write-spec write-tickets init-agent-context)
else
  skills=(specify write-spec write-tickets init-agent-context build judge implement-ticket)
fi

mkdir -p "$target/.claude/skills"
for s in "${skills[@]}"; do
  rm -rf "$target/.claude/skills/$s"
  cp -R "$here/$s" "$target/.claude/skills/$s"
done
cp "$here/LICENSE" "$target/.claude/skills/LICENSE"

if [[ "$planning" -eq 0 ]]; then
  mkdir -p "$target/.claude/agents"
  for a in builder judge; do
    cp "$here/agents/$a.md" "$target/.claude/agents/$a.md"
  done
  if [[ ! -e "$target/.claude/workflow.yml" ]]; then
    cp "$here/workflow.yml" "$target/.claude/workflow.yml"
  fi
fi

if [[ "$planning" -eq 1 ]]; then
  cat <<EOF
installed into $target:
  .claude/skills/specify, write-spec, write-tickets, init-agent-context, LICENSE
EOF
else
  cat <<EOF
installed into $target:
  .claude/skills/specify, write-spec, write-tickets, init-agent-context, build, judge, implement-ticket, LICENSE
  .claude/agents/builder, judge
  .claude/workflow.yml (only if the project had none)
EOF
fi
