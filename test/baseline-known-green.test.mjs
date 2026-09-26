#!/usr/bin/env node
// test/baseline-known-green.test.mjs — exercises
// build/scripts/baseline-known-green.mjs against small git repos built on
// the fly. Run by test/run.sh; exits 1 on any failure.

import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const script = join(repoRoot, "build", "scripts", "baseline-known-green.mjs");

let fail = 0;
function check(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    fail = 1;
  }
}

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function run(cwd) {
  try {
    const out = execFileSync("node", [script, cwd], { encoding: "utf8" });
    return { code: 0, out: out.trim() };
  } catch (e) {
    return { code: e.status, out: (e.stdout || "").trim() + (e.stderr || "").trim() };
  }
}

// A fresh repo with a CLAUDE.md Conventions section (base branch: main),
// one commit, on a branch literally named "main" regardless of the
// machine's init.defaultBranch.
function newRepo() {
  const dir = mkdtempSync(join(tmpdir(), "baseline-known-green-"));
  git(["init", "-q"], dir);
  git(["symbolic-ref", "HEAD", "refs/heads/main"], dir);
  git(["config", "user.email", "test@example.com"], dir);
  git(["config", "user.name", "Test"], dir);
  writeFileSync(
    join(dir, "CLAUDE.md"),
    "# Fixture project\n\n## Conventions\n- base branch: main\n",
  );
  git(["add", "CLAUDE.md"], dir);
  git(["commit", "-q", "-m", "Initial commit"], dir);
  return dir;
}

function writeLastJudged(dir, commit) {
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(join(dir, ".claude", "last-judged.json"), JSON.stringify({ commit }));
}

function commitFile(dir, path, message) {
  const full = join(dir, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, "x");
  git(["add", path], dir);
  git(["commit", "-q", "-m", message], dir);
}

// No .claude/last-judged.json at all: no.
{
  const dir = newRepo();
  const { code, out } = run(dir);
  check(code === 1, `no last-judged.json should exit 1 (got ${code})`);
  check(out.startsWith("no:"), `no last-judged.json should say no; got: ${out}`);
  rmSync(dir, { recursive: true, force: true });
}

// The recorded commit is exactly the base's head: yes.
{
  const dir = newRepo();
  const head = git(["rev-parse", "HEAD"], dir);
  writeLastJudged(dir, head);
  const { code, out } = run(dir);
  check(code === 0, `an exact match should exit 0 (got ${code}): ${out}`);
  check(out.startsWith("yes:"), `an exact match should say yes; got: ${out}`);
  rmSync(dir, { recursive: true, force: true });
}

// Every commit since the recorded one only touches items/ or .claude/: yes.
{
  const dir = newRepo();
  const recorded = git(["rev-parse", "HEAD"], dir);
  writeLastJudged(dir, recorded);
  commitFile(dir, "items/system/tickets/backlog/0002-x/ticket.md", "Pick up 0002-x");
  commitFile(dir, ".claude/skills/build/SKILL.md", "Reinstall skills");
  const { code, out } = run(dir);
  check(code === 0, `items/.claude-only changes should exit 0 (got ${code}): ${out}`);
  check(out.startsWith("yes:"), `items/.claude-only changes should say yes; got: ${out}`);
  rmSync(dir, { recursive: true, force: true });
}

// A commit since the recorded one touches a file outside items/ and
// .claude/: no.
{
  const dir = newRepo();
  const recorded = git(["rev-parse", "HEAD"], dir);
  writeLastJudged(dir, recorded);
  commitFile(dir, "items/system/tickets/backlog/0002-x/ticket.md", "Pick up 0002-x");
  commitFile(dir, "src/app.js", "Some unrelated project change");
  const { code, out } = run(dir);
  check(code === 1, `a change outside items/.claude should exit 1 (got ${code}): ${out}`);
  check(out.startsWith("no:"), `a change outside items/.claude should say no; got: ${out}`);
  check(out.includes("src/app.js"), `the reason should name the offending path; got: ${out}`);
  rmSync(dir, { recursive: true, force: true });
}

// A recorded commit that isn't even an ancestor of the base's head: no.
{
  const dir = newRepo();
  const stray = git(["commit-tree", git(["rev-parse", "HEAD^{tree}"], dir), "-m", "Stray"], dir);
  writeLastJudged(dir, stray);
  commitFile(dir, "items/system/tickets/backlog/0002-x/ticket.md", "Pick up 0002-x");
  const { code, out } = run(dir);
  check(code === 1, `a non-ancestor recorded commit should exit 1 (got ${code}): ${out}`);
  check(out.startsWith("no:"), `a non-ancestor recorded commit should say no; got: ${out}`);
  rmSync(dir, { recursive: true, force: true });
}

if (fail === 0) {
  console.log(
    "PASS: baseline-known-green.mjs says yes on an exact match or items/.claude-only changes since, and no otherwise, with a reason either way.",
  );
}
process.exit(fail);
