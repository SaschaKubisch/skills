#!/usr/bin/env bash
# Checks the rules of a project's standing instruction files that a machine can check.
# Usage: check-agent-context.sh [dir]   (default: the current directory)
# Exit 0: no rule broken. Exit 1: each line on stderr is "<file>: <rule>: <message>".
# Exit 2: the argument is not a directory.
# Rules: pair, path, date, map.
set -u
target="${1:-.}"
if [ ! -d "$target" ]; then
  printf 'check-agent-context: %s: not a directory\n' "$target" >&2
  exit 2
fi
root="$(cd "$target" && pwd)"
cd "$root" || exit 2
status=0

report() { # file, rule, message
  printf '%s: %s: %s\n' "$1" "$2" "$3" >&2
  status=1
}

# Prints the lines of a file that are outside fenced blocks. A fence opens
# with three or more backticks or tildes, indented or not, and closes with
# the same character at least as long, with nothing after it.
unfenced() {
  awk '
    {
      line = $0
      stripped = line
      sub(/^[ \t]+/, "", stripped)
      if (match(stripped, /^(`{3,}|~{3,})/)) {
        ch = substr(stripped, 1, 1)
        len = RLENGTH
        rest = substr(stripped, len + 1)
        if (!fence) { fence = 1; fch = ch; flen = len; next }
        if (ch == fch && len >= flen && rest ~ /^[ \t]*$/) { fence = 0 }
        next
      }
      if (!fence) print line
    }' "$1"
}

# Folders that hold an instruction file.
dirs=()
while IFS= read -r d; do dirs+=("$d"); done < <(
  find . \( -name .git -o -name node_modules \) -prune -o \( -name AGENTS.md -o -name CLAUDE.md \) \( -type f -o -type l \) -print \
    | while IFS= read -r p; do dirname "$p"; done | sort -u
)

# The root has to hold the pair too, so the map has a home.
case " ${dirs[*]-} " in
  *" . "*) ;;
  *) dirs=(. "${dirs[@]+"${dirs[@]}"}") ;;
esac

# content_file <dir>: the real file whose text is checked, or nothing.
content_file() {
  local d="$1"
  if [ -f "$d/AGENTS.md" ] && [ ! -L "$d/AGENTS.md" ]; then
    echo "$d/AGENTS.md"
  elif [ -f "$d/CLAUDE.md" ] && [ ! -L "$d/CLAUDE.md" ]; then
    echo "$d/CLAUDE.md"
  fi
}

shown() { local p="${1#./}"; printf '%s' "$p"; }

for d in "${dirs[@]}"; do
  a="$d/AGENTS.md"; c="$d/CLAUDE.md"
  a_here=0; c_here=0
  { [ -e "$a" ] || [ -L "$a" ]; } && a_here=1
  { [ -e "$c" ] || [ -L "$c" ]; } && c_here=1
  if [ "$a_here" -eq 0 ] && [ "$c_here" -eq 0 ]; then
    report "$(shown "$a")" pair "no AGENTS.md or CLAUDE.md in this folder; one must be a real file and the other a link to it"
  elif [ "$a_here" -eq 0 ]; then
    report "$(shown "$a")" pair "missing; AGENTS.md and CLAUDE.md must be one real file and one link to it"
  elif [ "$c_here" -eq 0 ]; then
    report "$(shown "$c")" pair "missing; AGENTS.md and CLAUDE.md must be one real file and one link to it"
  elif [ -L "$a" ] && [ -L "$c" ]; then
    report "$(shown "$c")" pair "AGENTS.md and CLAUDE.md are both links; one must be the real file"
  elif [ ! -L "$a" ] && [ ! -L "$c" ]; then
    report "$(shown "$c")" pair "AGENTS.md and CLAUDE.md are both real files; one must be a link to the other"
  elif [ -L "$a" ] && [ "$(readlink "$a")" != CLAUDE.md ]; then
    report "$(shown "$a")" pair "is a link to '$(readlink "$a")'; it must point to CLAUDE.md"
  elif [ -L "$c" ] && [ "$(readlink "$c")" != AGENTS.md ]; then
    report "$(shown "$c")" pair "is a link to '$(readlink "$c")'; it must point to AGENTS.md"
  fi
done

for d in "${dirs[@]}"; do
  f="$(content_file "$d")"
  [ -n "$f" ] || continue
  name="$(shown "$f")"

  # Rule path: every path named in backticks exists. A named path is a word
  # inside a backtick span, outside fences, that holds a slash. Skipped: URLs,
  # hostnames, ~ and absolute paths, placeholders, globs and variables.
  # It resolves from the root or from the folder of the file that names it.
  while IFS= read -r word; do
    [ -n "$word" ] || continue
    p="${word#./}"
    p="${p%[.,:;)]}"
    if [ ! -e "$p" ] && [ ! -e "$d/$p" ] && [ ! -L "$p" ] && [ ! -L "$d/$p" ]; then
      report "$name" path "names '$word', which does not exist"
    fi
  done < <(unfenced "$f" | awk '
    {
      line = $0
      while (match(line, /`[^`]+`/)) {
        span = substr(line, RSTART + 1, RLENGTH - 2)
        line = substr(line, RSTART + RLENGTH)
        n = split(span, w, /[ \t]+/)
        for (i = 1; i <= n; i++) {
          x = w[i]
          if (x !~ /\//) continue
          if (x ~ /[<>*?$\{\}|=]/ || x ~ /:\/\// || x ~ /^[~\/-]/ || x ~ /\.\.\./) continue
          if (x ~ /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*\.(com|org|io|dev|net)\//) continue
          print x
        }
      }
    }')

  # Rule date: no ISO date and no whole words "as of", fences included.
  while IFS= read -r hit; do
    [ -n "$hit" ] || continue
    report "$name" date "holds '$hit', a date that goes stale"
  done < <(grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' "$f"; grep -oiw 'as of' "$f")
done

# Rule map: every top-level folder has a line under "## Map" in the root file.
# A map line is a plain list line outside fences that starts with the folder in
# backticks, as "- `folder/` what it holds". The map ends at the next "## "
# heading. In a git root the folders are the ones git tracks, hidden or not;
# elsewhere, the directories present.
rootfile="$(content_file .)"
if [ -n "$rootfile" ]; then
  if [ "$(git rev-parse --show-toplevel 2>/dev/null)" = "$(pwd -P)" ]; then
    folders="$(git ls-files | grep / | cut -d/ -f1 | sort -u)"
  else
    folders="$(find . -mindepth 1 -maxdepth 1 -type d -not -name .git | sed 's|^\./||' | sort)"
  fi
  mapped="$(unfenced "$rootfile" | awk '
    /^## / { inmap = ($0 ~ /^##[ \t]+Map[ \t]*$/); next }
    inmap && match($0, /^[ \t]*[-*+][ \t]+`[^`]+`/) {
      s = substr($0, RSTART, RLENGTH); sub(/^[^`]*`/, "", s); sub(/`$/, "", s); print s
    }')"
  while IFS= read -r folder; do
    [ -n "$folder" ] || continue
    grep -qxF "$folder/" <<<"$mapped" || report "$(shown "$rootfile")" map "the Map has no line for top-level folder '$folder/'"
  done <<<"$folders"
fi

exit $status
