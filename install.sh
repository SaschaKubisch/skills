#!/usr/bin/env bash
# install.sh — copy the skills, LICENSE and agent definitions into a project.
#
#   ./install.sh /path/to/project
#
# Copies specify/, write-spec/, write-tickets/, build/, judge/ and
# implement/ into <project>/.claude/skills/<name>/, LICENSE into
# <project>/.claude/skills/LICENSE, and agents/builder.md and
# agents/judge.md into <project>/.claude/agents/.
# Existing files or folders with the same names are replaced; nothing
# else under the target is touched.
# Licence: MIT, see LICENSE.

set -euo pipefail

target="${1:-}"
[[ -n "$target" ]] || { echo "usage: $0 /path/to/project" >&2; exit 1; }
[[ -d "$target" ]] || { echo "install: no such directory: $target" >&2; exit 1; }

here="$(cd "$(dirname "$0")" && pwd)"

mkdir -p "$target/.claude/skills"
for s in specify write-spec write-tickets build judge implement; do
  rm -rf "$target/.claude/skills/$s"
  cp -R "$here/$s" "$target/.claude/skills/$s"
done
cp "$here/LICENSE" "$target/.claude/skills/LICENSE"

mkdir -p "$target/.claude/agents"
for a in builder judge; do
  cp "$here/agents/$a.md" "$target/.claude/agents/$a.md"
done

cat <<EOF
installed into $target:
  .claude/skills/specify, write-spec, write-tickets, build, judge, implement, LICENSE
  .claude/agents/builder, judge
EOF
