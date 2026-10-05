#!/usr/bin/env bash
# Tests for init-agent-context/scripts/check-agent-context.sh. Each test is one claim.
# Run: bash test/init-agent-context.test.sh
here="$(cd "$(dirname "$0")" && pwd)"
script="$here/../init-agent-context/scripts/check-agent-context.sh"
samples="$here/init-agent-context-samples"
fail=0
out=""
code=0
run() { out="$(bash "$script" "$samples/$1" 2>&1)"; code=$?; }
ok() { echo "PASS  $1"; }
no() { echo "FAIL  $1"; fail=1; }
# expect_fail <sample> <regex>: exits 1 and a line matches the regex
expect_fail() {
  run "$1"
  [ "$code" -eq 1 ] && grep -qE "$2" <<<"$out" && ok "$3" || no "$3: exit $code: $out"
}
expect_green() {
  run "$1"
  [ "$code" -eq 0 ] && [ -z "$out" ] && ok "$2" || no "$2: exit $code: $out"
}

test_green_when_agents_is_real() { expect_green good "${FUNCNAME[0]}"; }
test_green_when_claude_is_real() { expect_green good-reverse "${FUNCNAME[0]}"; }
test_green_with_a_valid_nested_pair() { expect_green good-nested "${FUNCNAME[0]}"; }
test_green_when_a_path_resolves_from_the_files_folder() { expect_green good-path-from-folder "${FUNCNAME[0]}"; }
test_green_for_paths_in_fences_of_any_length_and_indent() { expect_green good-fence-path "${FUNCNAME[0]}"; }
test_green_for_urls_globs_placeholders_and_whole_word_as_of() { expect_green good-prose "${FUNCNAME[0]}"; }

test_pair_two_real_files() { expect_fail bad-pair-plain '^CLAUDE\.md: pair: ' "${FUNCNAME[0]}"; }
test_pair_one_file_alone() { expect_fail bad-pair-missing '^CLAUDE\.md: pair: .*missing' "${FUNCNAME[0]}"; }
test_pair_link_to_another_file() { expect_fail bad-pair-target '^CLAUDE\.md: pair: .*OTHER\.md' "${FUNCNAME[0]}"; }
test_pair_is_checked_in_nested_folders() { expect_fail bad-pair-nested '^docs/(AGENTS|CLAUDE)\.md: pair: ' "${FUNCNAME[0]}"; }
test_path_that_does_not_exist() { expect_fail bad-path '^AGENTS\.md: path: .*docs/missing\.md' "${FUNCNAME[0]}"; }
test_iso_date() { expect_fail bad-date "^AGENTS\.md: date: .*2026-01-02" "${FUNCNAME[0]}"; }
test_as_of() { expect_fail bad-as-of "^AGENTS\.md: date: .*as of" "${FUNCNAME[0]}"; }
test_map_folder_without_a_line() { expect_fail bad-map "^AGENTS\.md: map: .*extra/" "${FUNCNAME[0]}"; }
test_map_line_in_a_fence_does_not_count() { expect_fail bad-map-fence "^AGENTS\.md: map: .*extra/" "${FUNCNAME[0]}"; }
test_map_rule_line_does_not_count() { expect_fail bad-map-rule-line "^AGENTS\.md: map: .*extra/" "${FUNCNAME[0]}"; }
test_map_line_under_a_later_heading_does_not_count() { expect_fail bad-map-section "^AGENTS\.md: map: .*extra/" "${FUNCNAME[0]}"; }

test_a_missing_directory_exits_2_with_no_rule_lines() {
  # from inside a passing sample, so a script that falls back to the caller's directory would exit 0
  out="$(cd "$samples/good" && bash "$script" /nonexistent-dir-for-test 2>&1)"; code=$?
  [ "$code" -eq 2 ] && grep -q 'nonexistent-dir-for-test' <<<"$out" && ! grep -qE ': (pair|path|date|map): ' <<<"$out" && ok "${FUNCNAME[0]}" || no "${FUNCNAME[0]}: exit $code: $out"
}

test_a_file_argument_exits_2() {
  out="$(bash "$script" "$samples/good/AGENTS.md" 2>&1)"; code=$?
  [ "$code" -eq 2 ] && grep -q 'AGENTS.md' <<<"$out" && ok "${FUNCNAME[0]}" || no "${FUNCNAME[0]}: exit $code: $out"
}

test_no_argument_checks_the_current_directory() {
  out="$(cd "$samples/bad-date" && bash "$script" 2>&1)"; code=$?
  [ "$code" -eq 1 ] && grep -q 'date' <<<"$out" && ok "${FUNCNAME[0]}" || no "${FUNCNAME[0]}: exit $code: $out"
}

test_a_folder_with_neither_file_is_named() {
  local t; t="$(mktemp -d)"
  out="$(bash "$script" "$t" 2>&1)"; code=$?
  rm -rf "$t"
  [ "$code" -eq 1 ] && grep -q 'pair' <<<"$out" && ok "${FUNCNAME[0]}" || no "${FUNCNAME[0]}: exit $code: $out"
}

test_map_in_git_uses_tracked_folders_hidden_included_and_not_ignored() {
  local t; t="$(mktemp -d)"
  cp -R "$samples/good/." "$t/"
  mkdir "$t/.hidden" "$t/ignored"; echo x > "$t/.hidden/f"; echo x > "$t/ignored/f"; echo ignored/ > "$t/.gitignore"
  git -C "$t" init -q && git -C "$t" add -A
  out="$(bash "$script" "$t" 2>&1)"; code=$?
  rm -rf "$t"
  [ "$code" -eq 1 ] && grep -q 'map: .*\.hidden/' <<<"$out" && ! grep -q 'ignored/' <<<"$out" && ok "${FUNCNAME[0]}" || no "${FUNCNAME[0]}: exit $code: $out"
}

test_map_in_git_is_green_when_every_tracked_folder_has_a_line() {
  local t; t="$(mktemp -d)"
  cp -R "$samples/good/." "$t/"
  mkdir "$t/.hidden"; echo x > "$t/.hidden/f"
  printf -- '- `.hidden/` hidden things\n' > "$t/line"
  awk -v extra="- \`.hidden/\` hidden things" '{print} /^- `src\/`/ {print extra}' "$samples/good/AGENTS.md" > "$t/AGENTS.md.new"
  mv "$t/AGENTS.md.new" "$t/AGENTS.md"; rm "$t/line"
  git -C "$t" init -q && git -C "$t" add -A
  out="$(bash "$script" "$t" 2>&1)"; code=$?
  rm -rf "$t"
  [ "$code" -eq 0 ] && ok "${FUNCNAME[0]}" || no "${FUNCNAME[0]}: exit $code: $out"
}

test_every_message_names_a_file_and_a_rule() {
  local name bad="" want
  for name in bad-pair-plain:pair bad-pair-missing:pair bad-pair-target:pair bad-path:path bad-date:date bad-as-of:date bad-map:map bad-map-fence:map bad-map-rule-line:map bad-map-section:map; do
    want="${name#*:}"; name="${name%%:*}"
    run "$name"
    [ "$code" -eq 1 ] || bad="$bad $name(exit $code)"
    grep -qE "^[^ ]+: $want: .+" <<<"$out" || bad="$bad $name(no $want line)"
    grep -vqE '^[^ ]+: (pair|path|date|map): .+' <<<"$out" && bad="$bad $name(malformed line)"
  done
  [ -z "$bad" ] && ok "${FUNCNAME[0]}" || no "${FUNCNAME[0]}:$bad"
}

for t in $(declare -F | awk '{print $3}' | grep '^test_'); do "$t"; done
exit $fail
