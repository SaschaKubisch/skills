#!/usr/bin/env node
// baseline-known-green.mjs — is the base branch's head still safely
// covered by the last judge round's recorded baseline?
// Node ESM, no dependencies.
//
//   node .claude/skills/build/scripts/baseline-known-green.mjs [<repo-root>]
//
// Prints one line, "yes: <reason>" or "no: <reason>", and exits 0 for
// yes, 1 for no. Reads .claude/last-judged.json (see build/SKILL.md's
// "The whole-suite record" section) and the project's Conventions base
// branch (default "main"). Says yes when the base branch's current head
// is exactly the recorded commit, or when every commit since it changed
// only paths under items/ or .claude/ — a ticket claim, a ticket move,
// or a skill reinstall, none of which can have broken the baseline a
// judge round already checked.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { findProjectRoot, readConventions } from "./lib/workflow.mjs";

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function say(yes, reason) {
  console.log(`${yes ? "yes" : "no"}: ${reason}`);
  process.exit(yes ? 0 : 1);
}

function main() {
  const start = process.argv[2] || process.cwd();
  const projectRoot = findProjectRoot(start);
  const recordedPath = join(projectRoot, ".claude", "last-judged.json");

  if (!existsSync(recordedPath)) {
    say(false, "no .claude/last-judged.json is recorded");
    return;
  }

  let recorded;
  try {
    recorded = JSON.parse(readFileSync(recordedPath, "utf8")).commit;
  } catch (err) {
    say(false, `.claude/last-judged.json is not valid JSON (${err.message})`);
    return;
  }
  if (!recorded) {
    say(false, ".claude/last-judged.json names no commit");
    return;
  }

  const conventions = readConventions(projectRoot);
  const base = conventions["base branch"] || "main";

  let baseHead;
  try {
    baseHead = git(["rev-parse", base], projectRoot);
  } catch {
    say(false, `could not resolve the base branch ${base}`);
    return;
  }

  if (recorded === baseHead) {
    say(true, `${base}'s head is the recorded commit ${recorded}`);
    return;
  }

  try {
    git(["merge-base", "--is-ancestor", recorded, baseHead], projectRoot);
  } catch {
    say(
      false,
      `the recorded commit ${recorded} is not an ancestor of ${base}'s head ${baseHead}`,
    );
    return;
  }

  let changed;
  try {
    changed = git(["diff", "--name-only", `${recorded}..${baseHead}`], projectRoot)
      .split("\n")
      .filter(Boolean);
  } catch (err) {
    say(false, `git diff failed (${err.message})`);
    return;
  }

  const outside = changed.filter((p) => !/^(items\/|\.claude\/)/.test(p));
  if (outside.length > 0) {
    say(
      false,
      `${base} has changed outside items/ and .claude/ since ${recorded}: ${outside[0]}`,
    );
    return;
  }

  say(
    true,
    `every commit on ${base} since ${recorded} only touched items/ or .claude/`,
  );
}

main();
