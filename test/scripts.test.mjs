#!/usr/bin/env node
// test/scripts.test.mjs — exercises build/scripts/check-evidence.mjs and
// build/scripts/render-report.mjs against the fixtures under
// test/fixtures/tickets/. Run by test/run.sh; exits 1 on any failure.

import { execFileSync } from "node:child_process";
import { mkdtempSync, cpSync, readFileSync, existsSync, rmSync } from "node:fs";
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

// Every passing fixture exits 0 and says PASS.
const passingFixtures = [
  "passing",
  // an invariant named only in a step's proves clause (not under
  // "## Invariants this touches") still counts as touched.
  "passing-invariant-via-proves",
  // a screen matching screenshot_sizes_first_only_for needs only the
  // first (desktop) size Conventions lists.
  "passing-first-only-screen",
];

for (const fixture of passingFixtures) {
  const { code, out, err } = run(checkEvidence, join(fixturesDir, fixture, "ticket"));
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
};

for (const [fixture, prefix] of Object.entries(rules)) {
  const { code, err } = run(checkEvidence, join(fixturesDir, fixture, "ticket"));
  check(code === 1, `check-evidence.mjs should exit 1 on ${fixture} (got ${code})`);
  check(
    err.includes(prefix),
    `check-evidence.mjs on ${fixture} should report a "${prefix}" problem; got:\n${err}`,
  );
  for (const [otherFixture, otherPrefix] of Object.entries(rules)) {
    if (otherFixture === fixture) continue;
    check(
      !err.includes(otherPrefix),
      `check-evidence.mjs on ${fixture} should not also report "${otherPrefix}"; got:\n${err}`,
    );
  }
}

// screenshot_sizes_first_only_for only exempts the screen it matches;
// an unmatched screen still needs every size, even with the key set.
{
  const fixture = "fail-first-only-for-unmatched";
  const { code, err } = run(checkEvidence, join(fixturesDir, fixture, "ticket"));
  check(code === 1, `check-evidence.mjs should exit 1 on ${fixture} (got ${code})`);
  check(
    err.includes("screenshot-size:"),
    `check-evidence.mjs on ${fixture} should report a "screenshot-size:" problem; got:\n${err}`,
  );
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
    "PASS: check-evidence.mjs passes the passing fixture and fails each fixture on its own rule only; render-report.mjs renders the passing fixture's report.",
  );
}

process.exit(fail);
