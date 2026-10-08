#!/usr/bin/env node
// test/scripts.test.mjs — exercises build/scripts/check-evidence.mjs and
// build/scripts/render-report.mjs and render-pdf.mjs against the fixtures under
// test/fixtures/tickets/. Run by test/run.sh; exits 1 on any failure.

import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, cpSync, readFileSync, existsSync, rmSync, renameSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const checkEvidence = join(repoRoot, "build", "scripts", "check-evidence.mjs");
const renderReport = join(repoRoot, "build", "scripts", "render-report.mjs");
const renderPdf = join(repoRoot, "build", "scripts", "render-pdf.mjs");
const fixturesDir = join(repoRoot, "test", "fixtures", "tickets");

let fail = 0;

function run(script, arg) {
  try {
    const out = execFileSync("node", [script, arg], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
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
  // no `test scope` key, so the default `feature`: the commands carry no
  // whole-suite run and the ticket still passes.
  "passing-feature-scope",
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

// Test scope. `full` (fail-whole-suite) owes a whole-suite run; `feature`
// (the default) does not, but still fails on a failed command of its own.
{
  const tmp = mkdtempSync(join(tmpdir(), "workflow-config-testscope-"));
  const variant = (change, scope) => {
    rmSync(tmp, { recursive: true, force: true });
    cpSync(join(fixturesDir, "passing-feature-scope"), tmp, { recursive: true });
    if (scope) {
      const claude = join(tmp, "CLAUDE.md");
      writeFileSync(claude, readFileSync(claude, "utf8").replace("- end to end: npx playwright test", `- end to end: npx playwright test\n- test scope: ${scope}`));
    }
    const reportPath = join(tmp, "ticket", "validation", "report.json");
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    change(report);
    writeFileSync(reportPath, JSON.stringify(report));
    return run(checkEvidence, join(tmp, "ticket"));
  };
  const unrelated = { command: "npx playwright test e2e/unrelated.spec.ts", exit_code: 1, commit: "abc1234", whole_suite: false, deferred: true };
  const withNotes = { builder: "ready_with_notes", reasons: ["One spec failed and was deferred."], judge: null };
  try {
    // An unrelated spec that failed and was deferred does not fail the
    // ticket; the verdict is ready_with_notes.
    let r = variant((rep) => {
      rep.commands.push({ ...unrelated });
      rep.verdict = { ...withNotes };
    });
    check(r.code === 0, `feature scope should not fail a ticket for a deferred unrelated spec; got:\n${r.err}`);
    // The same failure claimed as ready is refused.
    r = variant((rep) => {
      rep.commands.push({ ...unrelated });
    });
    check(r.code === 1 && reports(r.err, "verdict:"), `a deferred failure should cap the verdict at ready_with_notes; got:\n${r.err}`);
    // A failed command that is not deferred (an exit condition, or a spec
    // covering a touched shared file) still fails the ticket.
    r = variant((rep) => {
      rep.commands.push({ command: "npx playwright test e2e/shared.spec.ts", exit_code: 1, commit: "abc1234", whole_suite: false });
    });
    check(r.code === 1 && reports(r.err, "verdict:"), `feature scope should still fail a command that is not deferred; got:\n${r.err}`);
    r = variant((rep) => {
      rep.commands[3].exit_code = 1;
    });
    check(r.code === 1 && reports(r.err, "verdict:"), `feature scope should still fail a failed exit-condition command; got:\n${r.err}`);
    // Only an unrelated spec may be deferred: an exit condition or a
    // Conventions check marked deferred is refused and still fails.
    r = variant((rep) => {
      rep.commands[3].exit_code = 1;
      rep.commands[3].deferred = true;
      rep.verdict = { ...withNotes };
    });
    check(r.code === 1 && reports(r.err, "deferred:") && reports(r.err, "verdict:"), `a deferred exit condition should be refused; got:\n${r.err}`);
    r = variant((rep) => {
      rep.commands[0].exit_code = 1;
      rep.commands[0].deferred = true;
      rep.verdict = { ...withNotes };
    });
    check(r.code === 1 && reports(r.err, "deferred:") && reports(r.err, "verdict:"), `a deferred Conventions check should be refused; got:\n${r.err}`);
    // A reworded exit condition (same test file, an extra flag) marked
    // deferred is refused too.
    r = variant((rep) => {
      rep.commands.push({ command: "npx playwright test e2e/widget.spec.ts --reporter=line", exit_code: 1, commit: "abc1234", whole_suite: false, deferred: true });
      rep.verdict = { ...withNotes };
    });
    check(r.code === 1 && reports(r.err, "deferred:") && reports(r.err, "verdict:"), `a deferred rewording of an exit condition should be refused; got:\n${r.err}`);
    // Under feature every check and exit condition is owed a run on the
    // final commit: one left out, or run only on an earlier commit, fails.
    r = variant((rep) => {
      rep.commands = rep.commands.slice(0, 1);
    });
    check(r.code === 1 && reports(r.err, "owed:"), `feature scope should owe a run of every exit condition; got:\n${r.err}`);
    r = variant((rep) => {
      rep.commands[0].commit = "0000000";
    });
    check(r.code === 1 && reports(r.err, "owed:"), `feature scope should owe each run on the final commit; got:\n${r.err}`);
    // Under full a deferral is not honoured: with the whole-suite run
    // recorded, the deferred failure still makes the ticket not ready.
    r = variant((rep) => {
      rep.commands[3].whole_suite = true;
      rep.commands.push({ ...unrelated });
      rep.verdict = { ...withNotes };
    }, "full");
    check(r.code === 1 && reports(r.err, "verdict:") && !reports(r.err, "whole-suite:"), `test scope: full should not honour a deferral; got:\n${r.err}`);
    // Under full the whole-suite run is owed.
    r = variant(() => {}, "full");
    check(r.code === 1 && reports(r.err, "whole-suite:"), `test scope: full should owe a whole-suite run; got:\n${r.err}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// prove failing first: a bug-fix test needs the old-code proof under the
// default; every test needs it under `always`.
{
  const tmp = mkdtempSync(join(tmpdir(), "workflow-config-prove-"));
  const variant = (mode, change) => {
    rmSync(tmp, { recursive: true, force: true });
    cpSync(join(fixturesDir, "passing-feature-scope"), tmp, { recursive: true });
    if (mode) {
      const claude = join(tmp, "CLAUDE.md");
      writeFileSync(claude, readFileSync(claude, "utf8").replace("- end to end: npx playwright test", `- end to end: npx playwright test\n- prove failing first: ${mode}`));
    }
    const reportPath = join(tmp, "ticket", "validation", "report.json");
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    change(report);
    writeFileSync(reportPath, JSON.stringify(report));
    return run(checkEvidence, join(tmp, "ticket"));
  };
  try {
    let r = variant(null, () => {});
    check(r.code === 0, `bug-fixes (default) should not ask new-feature tests for the old-code proof; got:\n${r.err}`);
    r = variant(null, (rep) => { rep.tests[0].bug_fix = true; });
    check(r.code === 1 && reports(r.err, "proved-failing:"), `bug-fixes should ask a bug-fix test for the proof; got:\n${r.err}`);
    r = variant(null, (rep) => { rep.tests[0].bug_fix = true; rep.tests[0].proved_failing = true; });
    check(r.code === 0, `a bug-fix test with the proof should pass; got:\n${r.err}`);
    // A Kind: fix ticket owes the proof even when no test is marked bug_fix.
    const fixTicket = () => {
      const ticketPath = join(tmp, "ticket", "ticket.md");
      writeFileSync(ticketPath, readFileSync(ticketPath, "utf8").replace("Kind: feat", "Kind: fix"));
      return run(checkEvidence, join(tmp, "ticket"));
    };
    variant(null, () => {});
    r = fixTicket();
    check(r.code === 1 && reports(r.err, "proved-failing:"), `a Kind: fix ticket with no proved test should fail; got:\n${r.err}`);
    variant(null, (rep) => { rep.tests[0].bug_fix = true; rep.tests[0].proved_failing = true; });
    r = fixTicket();
    check(r.code === 0, `a Kind: fix ticket with a proved test should pass; got:\n${r.err}`);
    r = variant("always", () => {});
    check(r.code === 1 && reports(r.err, "proved-failing:"), `always should ask every test for the proof; got:\n${r.err}`);
    r = variant("always", (rep) => { rep.tests.forEach((t) => { t.proved_failing = true; }); });
    check(r.code === 0, `always with every proof should pass; got:\n${r.err}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
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

// `app` is due and placed exactly like `item`: only for the ticket that
// empties its item's backlog, in the item's root. Only the story differs.
const setVideoScope = (tmp, scope) => {
  const f = join(tmp, ".claude", "workflow.yml");
  writeFileSync(f, readFileSync(f, "utf8").replace(/video_scope: \w+/, `video_scope: ${scope}`));
};
{
  const { code, err } = withCopy("passing-item-last", (tmp) => setVideoScope(tmp, "app"));
  check(code === 0, `video_scope app with the video in the item's root should pass (got ${code}):\n${err}`);
}
{
  const { code, err } = withCopy("passing-item-scope", (tmp) => setVideoScope(tmp, "app"));
  check(code === 0, `video_scope app should owe no video from a ticket that does not empty its item's backlog (got ${code}):\n${err}`);
}
{
  const { code, err } = withCopy("passing-item-scope", (tmp) => {
    setVideoScope(tmp, "app");
    rmSync(join(tmp, "items", "alpha", "tickets", "backlog"), { recursive: true });
  });
  check(code === 1 && reports(err, "video:"), `the last ticket at video_scope app should owe the video (got ${code}):\n${err}`);
}
{
  const { code, err } = withCopy("passing-item-last", (tmp, ticket) => {
    setVideoScope(tmp, "app");
    renameSync(join(tmp, "items", "alpha", "validation", "walkthrough.mp4"), join(ticket, "validation", "walkthrough.mp4"));
  });
  check(code === 1 && reports(err, "video-place:"), `an app-scope video in the ticket's folder should be refused (got ${code}):\n${err}`);
}

// ---- render-report.mjs and render-pdf.mjs ----

// A copy of a fixture to render into, so the checked-in one stays clean.
function copyFixture(fixture) {
  const tmp = mkdtempSync(join(tmpdir(), "workflow-config-render-"));
  cpSync(join(fixturesDir, fixture), tmp, { recursive: true });
  return tmp;
}

// True when every marker appears in the html, in the order given.
function inOrder(html, markers) {
  let at = -1;
  for (const m of markers) {
    const found = html.indexOf(m, at + 1);
    if (found === -1) return m;
    at = found;
  }
  return null;
}

// A ticket-scope report, from the fully switched-on fixture: the sections
// come in the order "The validation report" gives, and the storyboard has
// every journey step's screenshot at every size, the before screen and the
// video with its chapters.
{
  const tmp = copyFixture("passing-full");
  try {
    const ticket = join(tmp, "ticket");
    const { code, out } = run(renderReport, ticket);
    check(code === 0, `render-report.mjs should exit 0 on passing-full (got ${code})`);
    const reportPath = join(ticket, "validation", "agent-report.html");
    check(out.trim().endsWith("agent-report.html"), "render-report.mjs should print the report's path");
    check(existsSync(reportPath), "render-report.mjs should write validation/agent-report.html");
    const html = existsSync(reportPath) ? readFileSync(reportPath, "utf8") : "";

    const missing = inOrder(html, [
      'id="verdict"',
      "Ready with notes",
      'id="tiles"',
      'class="summary"',
      'id="storyboard"',
      'id="journeys"',
      'id="changes"',
      'class="risk high"',
      'class="bar"',
      'id="grid"',
      'id="cards"',
      'class="nt"',
      'class="pf"',
      'id="details"',
      "<details",
    ]);
    check(missing === null, `the rendered report should hold its parts in order; stuck at ${missing}`);
    check((html.match(/<details/g) || []).length >= 4, "the report should fold at least four details blocks");
    check(!/<details[^>]*\bopen\b/.test(html), "every details block should start folded");

    for (const size of ["1280x800", "390x844"]) {
      for (const file of ["walkthrough-01-widget", "before-walkthrough-01-widget"]) {
        check(
          html.includes(`<img loading="lazy" src="screenshots/${file}-${size}.png"`),
          `the storyboard should show ${file} at ${size}`,
        );
      }
    }
    check(html.includes("Open the page and see the widget"), "the storyboard should carry the step caption");
    check(html.includes('class="mermaid"') && html.includes("flowchart LR"), "the journeys should be a Mermaid flowchart");
    check(html.includes('href="#st0r0n1"'), "the journeys should link back to the storyboard steps");
    check(html.includes('id="st0r0n1"'), "the storyboard step should carry the anchor the journey links to");
    check(html.includes('<video controls') && html.includes('href="walkthrough.mp4#t=0"'), "the video should come with its chapter links");
    check(html.includes("widget-reload.spec.ts") && html.includes("flaky") && html.includes("traces/widget-reload.zip"), "the grid or table should mark the flaky test and link its trace");
    check(html.includes("no headless browser was found"), "a skipped PDF should show under Not tested");
    check(html.includes("87.5"), "the changed-line coverage tile should show");
    check(html.includes("@media print") && html.includes("prefers-color-scheme: dark"), "the report should style print and dark mode");
    check(html.includes("cdn.jsdelivr.net/npm/mermaid"), "Mermaid should come from the CDN");
    check(!/<link[^>]+rel=["']stylesheet/.test(html) && !/<script[^>]+src=/.test(html), "the report should load no stylesheet or script file");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// Text is escaped, wherever it comes from.
{
  const tmp = copyFixture("passing-full");
  try {
    const ticket = join(tmp, "ticket");
    const reportPath = join(ticket, "validation", "report.json");
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    report.title = "<script>alert(1)</script>";
    report.summary = "Sum <b>bold</b> & more.";
    report.journeys[0].steps[0].caption = '"><img src=x onerror=alert(2)>';
    report.not_tested = [{ what: "<i>what</i>", reason: "because </pre><script>x()</script>" }];
    report.problems[0].problem = "a < b && c > d";
    report.diagrams = [{ title: "T <u>", text: "flowchart LR\n  a[\"</pre><script>y()</script>\"] --> b" }];
    writeFileSync(reportPath, JSON.stringify(report));
    const { code } = run(renderReport, ticket);
    check(code === 0, "render-report.mjs should render a report whose text holds markup");
    const html = readFileSync(join(ticket, "validation", "agent-report.html"), "utf8");
    for (const raw of ["<script>alert(1)", "<img src=x", "<b>bold</b>", "<i>what</i>", "<script>x()", "<script>y()", "<u>"]) {
      check(!html.includes(raw), `the report should not carry the raw markup ${raw}`);
    }
    check(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"), "the title should be escaped");
    check(html.includes("&quot;&gt;&lt;img src=x onerror=alert(2)&gt;"), "a caption should be escaped");
    check(html.includes("a &lt; b &amp;&amp; c &gt; d"), "a problem card should be escaped");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// Item scope: the ticket that empties its item's backlog renders one report
// into the item's validation folder, merging every ticket of the item.
{
  const tmp = copyFixture("passing-item-last");
  try {
    const item = join(tmp, "items", "alpha");
    const last = join(item, "tickets", "in-progress", "0001-sample");
    const first = join(item, "tickets", "done", "0000-first");
    // the earlier ticket's own evidence: its report.json and screenshots
    const lastReport = JSON.parse(readFileSync(join(last, "validation", "report.json"), "utf8"));
    const firstReport = {
      ...lastReport,
      ticket: "0000-first",
      title: "First ticket",
      summary: "The first ticket built the page.",
      verdict: { builder: "ready_with_notes", reasons: ["One test was retried."], judge: null },
      journeys: [{ role: "visitor", steps: [{ n: 1, caption: "Visit the first page", screenshot: "walkthrough-01-widget", before: null }] }],
      videos: [],
    };
    mkdirSync(join(first, "validation"), { recursive: true });
    writeFileSync(join(first, "validation", "report.json"), JSON.stringify(firstReport));
    cpSync(join(last, "validation", "screenshots"), join(first, "validation", "screenshots"), { recursive: true });

    const { code, out } = run(renderReport, last);
    check(code === 0, `render-report.mjs should exit 0 on the item's last ticket (got ${code})`);
    const itemHtml = join(item, "validation", "agent-report.html");
    check(out.trim() === itemHtml || out.trim().endsWith(join("items", "alpha", "validation", "agent-report.html")), "the item report's path should be printed");
    check(!existsSync(join(last, "validation", "agent-report.html")), "an item report should not be written into the ticket's folder");
    const html = readFileSync(itemHtml, "utf8");
    check(html.includes("Visit the first page") && html.includes("Open the page and see the widget"), "the item report should hold both tickets' storyboards");
    check(
      html.includes("../tickets/done/0000-first/validation/screenshots/walkthrough-01-widget-1280x800.png") &&
        html.includes("../tickets/in-progress/0001-sample/validation/screenshots/walkthrough-01-widget-1280x800.png"),
      "an item report should link each ticket's screenshots by relative path",
    );
    check(html.indexOf("Visit the first page") < html.indexOf("Open the page and see the widget"), "the storyboards should follow the tickets' order");
    check((html.match(/class="ticket-head"/g) || []).length === 2, "each ticket's storyboard should carry a ticket header");
    check(html.includes('href="walkthrough.mp4#t=0"'), "the item's video should link from the item's validation folder");
    check(html.includes("tickets/") && html.includes("2 tickets"), "the item report should say where the item's tickets live");
    check(html.includes("Ready with notes"), "the item's verdict should be the worst of its tickets");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// Item scope, re-rendered after the move to done/: the last ticket now sits
// in done/ and nothing is left in backlog/ or in-progress/. The report is
// still due, and its links carry the new column folder.
{
  const tmp = copyFixture("passing-item-last");
  try {
    const item = join(tmp, "items", "alpha");
    const moved = join(item, "tickets", "done", "0001-sample");
    renameSync(join(item, "tickets", "in-progress", "0001-sample"), moved);
    const { code, out } = run(renderReport, moved);
    check(code === 0, `render-report.mjs should exit 0 on the item's last ticket in done/ (got ${code})`);
    check(!/^No rendered report is due/.test(out), `an item report should be due for the last ticket in done/; got:\n${out}`);
    const itemHtml = join(item, "validation", "agent-report.html");
    check(existsSync(itemHtml), "the item report should be written into the item's validation folder");
    const html = existsSync(itemHtml) ? readFileSync(itemHtml, "utf8") : "";
    check(
      html.includes("../tickets/done/0001-sample/validation/screenshots/walkthrough-01-widget-1280x800.png") &&
        !html.includes("in-progress/0001-sample"),
      "the re-rendered item report should link the evidence under done/",
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// Not due: item scope on a ticket that does not empty its item's backlog,
// and the report switched off. One line, exit 0, nothing written.
{
  const tmp = copyFixture("passing-item-scope");
  try {
    const ticket = join(tmp, "items", "alpha", "tickets", "in-progress", "0001-sample");
    const { code, out } = run(renderReport, ticket);
    check(code === 0, `render-report.mjs should exit 0 when no report is due (got ${code})`);
    check(/^No rendered report is due: /.test(out) && out.trim().split("\n").length === 1, `a not-due run should print one line; got:\n${out}`);
    check(!existsSync(join(tmp, "items", "alpha", "validation")), "a not-due run should not create the item's validation folder");
    check(!existsSync(join(ticket, "validation", "agent-report.html")), "a not-due run should not write a report");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
{
  const tmp = copyFixture("passing");
  try {
    mkdirSync(join(tmp, ".claude"), { recursive: true });
    writeFileSync(join(tmp, ".claude", "workflow.yml"), "validation:\n  report: false\n");
    const ticket = join(tmp, "ticket");
    const htmlPath = join(ticket, "validation", "agent-report.html");
    writeFileSync(htmlPath, "untouched");
    const { code, out } = run(renderReport, ticket);
    check(code === 0 && /^No rendered report is due: validation\.report is false/.test(out), `report: false should print the not-due line; got ${code}: ${out}`);
    check(readFileSync(htmlPath, "utf8") === "untouched", "report: false should write no report");
    const pdf = run(renderPdf, ticket);
    check(pdf.code === 0 && /^No PDF is due/.test(pdf.out), `report: false should leave no PDF due; got ${pdf.code}: ${pdf.out}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// render-pdf.mjs: nothing to do with report_pdf false or no report due; with
// no Playwright in the project it skips, records why, and shows it.
{
  const tmp = copyFixture("passing");
  try {
    const ticket = join(tmp, "ticket");
    const before = readFileSync(join(ticket, "validation", "report.json"), "utf8");
    const { code, out } = run(renderPdf, ticket);
    check(code === 0 && /^No PDF is due: validation\.report_pdf is false/.test(out), `report_pdf false should print one line and exit 0; got ${code}: ${out}`);
    check(readFileSync(join(ticket, "validation", "report.json"), "utf8") === before, "render-pdf.mjs should leave report.json alone with report_pdf false");
    check(!existsSync(join(ticket, "validation", "agent-report.pdf")), "report_pdf false should write no PDF");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
{
  const tmp = copyFixture("passing-item-scope");
  try {
    const ticket = join(tmp, "items", "alpha", "tickets", "in-progress", "0001-sample");
    const { code, out } = run(renderPdf, ticket);
    check(code === 0 && /^No PDF is due/.test(out), `no PDF should be due when the item's report is not; got ${code}: ${out}`);
    check(!existsSync(join(tmp, "items", "alpha", "validation")), "a not-due PDF run should write nothing");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
{
  const tmp = copyFixture("passing-full");
  try {
    const ticket = join(tmp, "ticket");
    const reportPath = join(ticket, "validation", "report.json");
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    delete report.pdf;
    writeFileSync(reportPath, JSON.stringify(report));
    // the project (this copy) has no node_modules, so Playwright cannot be found
    const { code, out } = run(renderPdf, ticket);
    check(code === 0, `render-pdf.mjs should exit 0 without Playwright (got ${code})`);
    check(/^PDF skipped: /.test(out), `render-pdf.mjs should print the reason; got:\n${out}`);
    const after = JSON.parse(readFileSync(reportPath, "utf8"));
    check(after.pdf && typeof after.pdf.skipped === "string" && after.pdf.skipped.length > 0, "report.json's pdf.skipped should hold the reason");
    check(!existsSync(join(ticket, "validation", "agent-report.pdf")), "a skipped PDF should write no file");
    const html = readFileSync(join(ticket, "validation", "agent-report.html"), "utf8");
    check(html.includes(after.pdf.skipped.replace(/&/g, "&amp;")), "the re-rendered report should show the skip reason");
    const again = run(checkEvidence, ticket);
    check(again.code === 0, `check-evidence.mjs should accept the skipped PDF; got:\n${again.err}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (fail === 0) {
  console.log(
    "PASS: check-evidence.mjs passes the passing fixtures and fails each fixture on its own rule only, and puts an item's outputs in the item's root; render-report.mjs renders the visual report in its order, escapes its text, merges an item's tickets and says when none is due; render-pdf.mjs does nothing when no PDF is due and records a skip without Playwright.",
  );
}

process.exit(fail);
