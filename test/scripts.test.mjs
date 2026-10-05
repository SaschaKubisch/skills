#!/usr/bin/env node
// test/scripts.test.mjs — exercises build/scripts/check-evidence.mjs and
// build/scripts/render-report.mjs against the fixtures under
// test/fixtures/tickets/. Run by test/run.sh; exits 1 on any failure.

import { execFileSync } from "node:child_process";
import { mkdtempSync, cpSync, readFileSync, existsSync, rmSync, renameSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const checkEvidence = join(repoRoot, "build", "scripts", "check-evidence.mjs");
const renderReport = join(repoRoot, "build", "scripts", "render-report.mjs");
const fixturesDir = join(repoRoot, "test", "fixtures", "tickets");

let fail = 0;

function run(script, arg) {
  try {
    const out = execFileSync("node", [script, arg], { encoding: "utf8" });
    return { code: 0, out, err: "" };
  } catch (e) {
    return { code: e.status, out: e.stdout || "", err: e.stderr || "" };
  }
}

function check(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    fail = 1;
  }
}

// A fixture's ticket folder: `ticket/` beside its CLAUDE.md, or, for the
// fixtures that test where an item's outputs live, a ticket under
// `items/alpha/tickets/in-progress/`.
function ticketDir(fixture) {
  const flat = join(fixturesDir, fixture, "ticket");
  return existsSync(flat)
    ? flat
    : join(fixturesDir, fixture, "items", "alpha", "tickets", "in-progress", "0001-sample");
}

// True when stderr has a line that starts with the rule's prefix.
function reports(err, prefix) {
  return err.split("\n").some((line) => line.startsWith(prefix));
}

// Every passing fixture exits 0 and says PASS.
const passingFixtures = [
  "passing",
  // an invariant named only in a step's proves clause (not under
  // "## Invariants this touches") still counts as touched.
  "passing-invariant-via-proves",
  // every validation key switched on: a video, before screens, a retried
  // test with its trace, changed-line coverage, a skipped PDF with its reason.
  "passing-full",
  // item scope on a ticket that does not empty its item's backlog: no
  // rendered report, PDF or video is due from it.
  "passing-item-scope",
  // item scope on the ticket that empties it: the item-wide outputs sit
  // in the item's root validation/ folder.
  "passing-item-last",
];

for (const fixture of passingFixtures) {
  const { code, out, err } = run(checkEvidence, ticketDir(fixture));
  check(code === 0, `check-evidence.mjs should exit 0 on ${fixture} (got ${code}):\n${err}`);
  check(out.includes("PASS"), `check-evidence.mjs should print PASS on ${fixture}`);
}

// Each failing fixture exits 1 and names its own rule, no other.
const rules = {
  "fail-exit-evidence": "exit-evidence:",
  "fail-invariant-evidence": "invariant-evidence:",
  "fail-screenshot-size": "screenshot-size:",
  "fail-whole-suite": "whole-suite:",
  "fail-unnamed-screenshot": "unnamed-screenshot:",
  "fail-verdict": "verdict:",
  "fail-summary": "summary:",
  "fail-journeys-empty": "journeys:",
  "fail-journey-screenshot": "journey-screenshot:",
  "fail-journey-caption": "journey-caption:",
  "fail-journey-before": "journey-before:",
  "fail-changes": "changes:",
  "fail-problems": "problems:",
  "fail-not-tested": "not-tested:",
  "fail-video-missing": "video:",
  "fail-video-size": "video-size:",
  "fail-video-place": "video-place:",
  "fail-trace": "trace:",
  "fail-coverage": "coverage:",
  "fail-report-html": "report-html:",
  "fail-report-pdf": "report-pdf:",
};

// A fixture that needs a file too big to commit is run from a temporary
// copy with that file written first; run on its own, the committed fixture
// carries only a placeholder and would pass.
const bigFiles = {
  "fail-video-size": ["validation", "walkthrough.mp4"],
};

function runFixture(fixture) {
  if (!bigFiles[fixture]) return run(checkEvidence, ticketDir(fixture));
  const tmp = mkdtempSync(join(tmpdir(), "workflow-config-big-"));
  try {
    cpSync(join(fixturesDir, fixture), tmp, { recursive: true });
    writeFileSync(join(tmp, "ticket", ...bigFiles[fixture]), Buffer.alloc(1200000));
    return run(checkEvidence, join(tmp, "ticket"));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

for (const [fixture, prefix] of Object.entries(rules)) {
  const { code, err } = runFixture(fixture);
  check(code === 1, `check-evidence.mjs should exit 1 on ${fixture} (got ${code})`);
  check(
    reports(err, prefix),
    `check-evidence.mjs on ${fixture} should report a "${prefix}" problem; got:\n${err}`,
  );
  for (const [otherFixture, otherPrefix] of Object.entries(rules)) {
    if (otherFixture === fixture) continue;
    check(
      !reports(err, otherPrefix),
      `check-evidence.mjs on ${fixture} should not also report "${otherPrefix}"; got:\n${err}`,
    );
  }
}

// A skipped PDF with no reason is not an excuse.
{
  const tmp = mkdtempSync(join(tmpdir(), "workflow-config-pdf-"));
  try {
    cpSync(join(fixturesDir, "passing-full"), tmp, { recursive: true });
    const reportPath = join(tmp, "ticket", "validation", "report.json");
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    report.pdf = { skipped: "" };
    writeFileSync(reportPath, JSON.stringify(report));
    const { code, err } = run(checkEvidence, join(tmp, "ticket"));
    check(code === 1 && reports(err, "report-pdf:"), `a skipped PDF with an empty reason should be refused; got:\n${err}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// Scope, on a copy of an item fixture so the checked-in one stays clean.
function withCopy(fixture, change) {
  const tmp = mkdtempSync(join(tmpdir(), "workflow-config-scope-"));
  try {
    cpSync(join(fixturesDir, fixture), tmp, { recursive: true });
    const ticket = join(tmp, "items", "alpha", "tickets", "in-progress", "0001-sample");
    change(tmp, ticket);
    return run(checkEvidence, ticket);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// An item-scope ticket that is the last one of its item owes the item-wide
// report, PDF and video; none sits in the item's root any more.
{
  const { code, err } = withCopy("passing-item-scope", (tmp) => {
    rmSync(join(tmp, "items", "alpha", "tickets", "backlog"), { recursive: true });
  });
  check(code === 1, `the last ticket of an item at item scope should owe the item-wide outputs (got ${code})`);
  check(reports(err, "report-html:"), `the missing item-wide report should be reported; got:\n${err}`);
  check(reports(err, "report-pdf:"), `the missing item-wide PDF should be reported; got:\n${err}`);
  check(reports(err, "video:"), `the missing item-wide video should be reported; got:\n${err}`);
}

// An item-scope video in the ticket's own folder, not the item's root, is
// in the wrong place; so is the rendered report.
{
  const { code, err } = withCopy("passing-item-last", (tmp, ticket) => {
    const root = join(tmp, "items", "alpha", "validation");
    renameSync(join(root, "walkthrough.mp4"), join(ticket, "validation", "walkthrough.mp4"));
    renameSync(join(root, "agent-report.html"), join(ticket, "validation", "agent-report.html"));
  });
  check(code === 1, `an item-scope video in the ticket's folder should be refused (got ${code})`);
  check(reports(err, "video-place:"), `the misplaced item-scope video should be reported; got:\n${err}`);
  check(reports(err, "report-html:"), `the misplaced item-scope report should be reported; got:\n${err}`);
}

// render-report.mjs renders the passing fixture into agent-report.html,
// from a copy so the checked-in fixture stays clean.
{
  const tmp = mkdtempSync(join(tmpdir(), "workflow-config-render-"));
  const ticketCopy = join(tmp, "ticket");
  cpSync(join(fixturesDir, "passing", "ticket"), ticketCopy, { recursive: true });

  const { code, out } = run(renderReport, ticketCopy);
  check(code === 0, `render-report.mjs should exit 0 on the passing fixture (got ${code})`);

  const reportPath = join(ticketCopy, "validation", "agent-report.html");
  check(existsSync(reportPath), "render-report.mjs should write validation/agent-report.html");
  check(out.trim().endsWith("agent-report.html"), "render-report.mjs should print the report's path");

  if (existsSync(reportPath)) {
    const html = readFileSync(reportPath, "utf8");
    check(html.includes("Sample ticket"), "the rendered report should include the report's title");
    check(html.includes("<h2>Tests</h2>"), "the rendered report should include a Tests section");
    check(
      html.includes('src="screenshots/walkthrough-01-widget-1280x800.png"'),
      "the rendered report should include a figure for each declared screenshot size",
    );
    check(
      html.includes('src="screenshots/walkthrough-01-widget-390x844.png"'),
      "the rendered report should include a figure for the phone size too",
    );
  }

  rmSync(tmp, { recursive: true, force: true });
}

if (fail === 0) {
  console.log(
    "PASS: check-evidence.mjs passes the passing fixtures and fails each fixture on its own rule only, and puts an item's outputs in the item's root; render-report.mjs renders the passing fixture's report.",
  );
}

process.exit(fail);
