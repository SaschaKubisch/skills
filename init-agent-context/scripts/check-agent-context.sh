#!/usr/bin/env bash
# Checks the rules of a project's standing instruction files that a machine can check.
# Usage: check-agent-context.sh [dir]   (default: the current directory)
# Exit 0: no rule broken. Exit 1: each line on stderr is "<file>: <rule>: <message>".
# Exit 2: the argument is not a directory (an empty argument included).
# Rules: pair, path, date, map.
set -u
target="${1-.}"
if [ ! -d "$target" ]; then
  printf "check-agent-context: '%s': not a directory\n" "$target" >&2
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

# Folders that hold an instruction file. In a git work tree: the files git
# tracks or would track, so folders git ignores (a virtualenv, a build output)
# are skipped. Elsewhere: every file, skipping .git and node_modules.
candidates() {
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git -c core.quotePath=false ls-files --cached --others --exclude-standard \
      | grep -E '(^|/)(AGENTS|CLAUDE)\.md$'
  else
    find . \( -name .git -o -name node_modules \) -prune -o \( -name AGENTS.md -o -name CLAUDE.md \) -print
  fi
}
dirs=()
while IFS= read -r d; do dirs+=("$d"); done < <(
  candidates | while IFS= read -r p; do dirname "$p"; done | sort -u
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

# target <link>: where a link points, with a leading ./ dropped.
target_of() { local l; l="$(readlink "$1")"; printf '%s' "${l#./}"; }

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
  elif [ -L "$a" ] && [ "$(target_of "$a")" != CLAUDE.md ]; then
    report "$(shown "$a")" pair "is a link to '$(readlink "$a")'; it must point to CLAUDE.md"
  elif [ -L "$c" ] && [ "$(target_of "$c")" != AGENTS.md ]; then
    report "$(shown "$c")" pair "is a link to '$(readlink "$c")'; it must point to AGENTS.md"
  elif [ ! -L "$a" ] && [ ! -f "$a" ]; then
    report "$(shown "$a")" pair "is not a file; the real one of the pair must be a plain file"
  elif [ ! -L "$c" ] && [ ! -f "$c" ]; then
    report "$(shown "$c")" pair "is not a file; the real one of the pair must be a plain file"
  fi
done

for d in "${dirs[@]}"; do
  f="$(content_file "$d")"
  [ -n "$f" ] || continue
  name="$(shown "$f")"

  # Rule path: every path named in backticks exists. A named path is a word
  # inside a backtick span, outside fences, that holds a slash. Skipped: URLs,
  # hostnames, ~ and absolute paths, placeholders, globs and variables.
  # It resolves from the root or from the folder of the file that names it,
  # and a link counts only when what it points to exists. A whole span that
  # exists, as a folder whose name holds a space, needs no word of it checked.
  exists() { # path, folder of the file
    local p="${1#./}"
    p="${p%[.,:;)]}"
    [ -e "$p" ] || [ -e "$2/$p" ]
  }
  while IFS=$'\t' read -r span words; do
    [ -n "$span" ] || continue
    case "$span" in */*) exists "$span" "$d" && continue ;; esac
    read -ra ws <<<"$words"
    for word in "${ws[@]}"; do
      exists "$word" "$d" || report "$name" path "names '$word', which does not exist"
    done
  done < <(unfenced "$f" | awk '
    {
      line = $0
      while (match(line, /`[^`]+`/)) {
        span = substr(line, RSTART + 1, RLENGTH - 2)
        line = substr(line, RSTART + RLENGTH)
        n = split(span, w, /[ \t]+/)
        out = ""
        for (i = 1; i <= n; i++) {
          x = w[i]
          if (x !~ /\//) continue
          if (x ~ /[<>*?$\{\}|=]/ || x ~ /:\/\// || x ~ /^[~\/-]/ || x ~ /\.\.\./) continue
          if (x ~ /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*\.(com|org|io|dev|net)\//) continue
          out = out " " x
        }
        if (out != "") { gsub(/\t/, " ", span); print span "\t" out }
      }
    }')

  # Rule date: no ISO date and no whole words "as of", fences included. The
  # words may be split over a line break, as in wrapped prose.
  while IFS= read -r hit; do
    [ -n "$hit" ] || continue
    report "$name" date "holds '$hit', a date that goes stale"
  done < <(grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' "$f"; tr '\n' ' ' <"$f" | grep -oiwE 'as[[:space:]]+of' | tr -s ' \t' '  ')
done

# Rule map: every top-level folder has a line under "## Map" in the root file.
# A map line is a plain list line outside fences that starts with the folder in
# backticks, as "- `folder/` what it holds". The map ends at the next "## "
# heading. In a git root the folders are the ones git tracks, hidden or not;
# elsewhere, the directories present except .git and node_modules, the folders
# the nested-file search skips too.
rootfile="$(content_file .)"
if [ -n "$rootfile" ]; then
  if [ "$(git rev-parse --show-toplevel 2>/dev/null)" = "$(pwd -P)" ]; then
    # a path with a slash names its first folder; a submodule is a top-level
    # entry of mode 160000 with no slash
    folders="$(git -c core.quotePath=false ls-files --stage | awk -F '\t' '
      { split($1, m, " "); p = $2
        if (index(p, "/")) print substr(p, 1, index(p, "/") - 1)
        else if (m[1] == "160000") print p }' | sort -u)"
  else
    folders="$(find . -mindepth 1 -maxdepth 1 -type d -not -name .git -not -name node_modules | sed 's|^\./||' | sort)"
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
