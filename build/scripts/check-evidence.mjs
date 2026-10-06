#!/usr/bin/env node
// check-evidence.mjs — checks a ticket's evidence against its own claims.
// Node ESM, no dependencies.
//
//   node build/scripts/check-evidence.mjs <ticket-folder>
//
// Reads validation/report.json, the ticket's Exit conditions and
// Invariants this touches, the project's Conventions screenshot sizes and
// the project's workflow config (.claude/workflow.yml, or every default).
// Prints one line per problem, "<rule>: <message>", and exits 1; prints
// one PASS line and exits 0 when there is nothing to report.
//
// See build/SKILL.md's "## The validation report" and "## Report schema"
// sections for what each rule means and the report.json schema this script
// reads.

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, basename, relative } from "node:path";
import {
  findProjectRoot,
  loadConfig,
  inScope,
  outputDir,
  otherOutputDir,
  readConventions,
  testScope,
  checkCommands,
  screenshotSizes,
  readTicket,
  normalizeInvariantId,
} from "./lib/workflow.mjs";

const VERDICTS = ["ready", "ready_with_notes", "not_ready"];
const RISKS = ["high", "medium", "low"];

// A folder as the messages show it: relative to the project root.
let projectRoot;
const shown = (dir) => relative(projectRoot, dir) || ".";

function words(text) {
  return String(text ?? "").trim().split(/\s+/).filter(Boolean);
}

function sentences(text) {
  return String(text ?? "").trim().split(/(?<=[.!?])\s+/).filter(Boolean);
}

function isText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

// A command as written, with its runs of whitespace collapsed, so the
// report's table and the ticket's block compare equal.
function normalizeCommand(command) {
  return String(command ?? "").trim().replace(/\s+/g, " ");
}

function main() {
  const ticketFolder = process.argv[2];
  if (!ticketFolder) {
    console.error("usage: node build/scripts/check-evidence.mjs <ticket-folder>");
    process.exit(2);
  }

  const problems = [];
  const reportPath = join(ticketFolder, "validation", "report.json");
  if (!existsSync(reportPath)) {
    console.error("evidence: validation/report.json is missing.");
    process.exit(1);
  }

  let report;
  try {
    report = JSON.parse(readFileSync(reportPath, "utf8"));
  } catch (err) {
    console.error(`evidence: validation/report.json is not valid JSON (${err.message}).`);
    process.exit(1);
  }

  projectRoot = findProjectRoot(ticketFolder);
  const conventions = readConventions(projectRoot);
  const sizes = screenshotSizes(conventions);

  let config;
  try {
    config = loadConfig(projectRoot);
  } catch (err) {
    console.error(`config: ${err.message}`);
    process.exit(1);
  }
  const validation = config.validation;

  const ticket = readTicket(ticketFolder);
  const screenshotsDir = join(ticketFolder, "validation", "screenshots");
  const actualFiles = existsSync(screenshotsDir) ? readdirSync(screenshotsDir) : [];

  // Rule: an exit-NN-* screenshot with no exit condition NN.
  for (const file of actualFiles) {
    const m = /^exit-(\d+)-/.exec(file);
    if (!m) continue;
    const n = Number(m[1]);
    if (n < 1 || n > ticket.exitConditionCount) {
      problems.push(
        `exit-evidence: ${file} names exit condition ${n}, but the ticket's Exit conditions block has ${ticket.exitConditionCount} command(s).`,
      );
    }
  }

  // Rule: an invariant-NN-* screenshot with no touched invariant NN.
  for (const file of actualFiles) {
    const m = /^invariant-([A-Za-z0-9]+)-/.exec(file);
    if (!m) continue;
    const id = normalizeInvariantId(m[1]);
    if (!ticket.invariantIds.has(id)) {
      problems.push(
        `invariant-evidence: ${file} names invariant ${m[1]}, which is not under the ticket's Invariants this touches.`,
      );
    }
  }

  // Build the set of filenames the report names, and check each entry's
  // declared sizes cover every size this ticket requires for it.
  const named = new Set();
  for (const entry of report.screenshots || []) {
    const entrySizes = entry.sizes || [];
    for (const size of entrySizes) {
      named.add(`${entry.file}-${size}.png`);
    }
    for (const size of sizes) {
      const filename = `${entry.file}-${size}.png`;
      const declared = entrySizes.includes(size);
      const onDisk = actualFiles.includes(filename);
      if (!declared || !onDisk) {
        problems.push(
          `screenshot-size: ${entry.file} has no file at ${size} (a declared size).`,
        );
      }
    }
  }

  // Rule: any screenshot file the report does not name.
  for (const file of actualFiles) {
    if (!named.has(file)) {
      problems.push(
        `unnamed-screenshot: ${file} exists under validation/screenshots/ but no entry in validation/report.json's screenshots names it.`,
      );
    }
  }

  // Rule: a commands table without a whole-suite run on the final commit.
  // The final commit is the commit the last recorded command ran on.
  const commands = report.commands || [];
  // Under `test scope: feature` (the default) no whole-suite run is owed;
  // the commands recorded are the checks, the exit conditions and the specs
  // covering touched shared files. Under `full` the whole-suite run is owed.
  const scope = testScope(conventions);
  let hasWholeSuite = scope !== "full";
  if (commands.length === 0) {
    problems.push(`${scope === "full" ? "whole-suite" : "commands"}: validation/report.json has no commands recorded.`);
  } else if (scope === "full") {
    const finalCommit = commands[commands.length - 1].commit;
    hasWholeSuite = commands.some(
      (c) => c.commit === finalCommit && c.whole_suite === true,
    );
    if (!hasWholeSuite) {
      problems.push(
        `whole-suite: no command in validation/report.json's commands is marked whole_suite for commit ${finalCommit}.`,
      );
    }
  }

  // Rule: only an unrelated spec may be deferred. A Conventions check or
  // one of the ticket's exit conditions marked `deferred: true` is refused,
  // and its failure counts as a failure.
  const owed = new Set(
    [...checkCommands(conventions), ...ticket.exitConditions].map(normalizeCommand),
  );
  const mayDefer = (c) =>
    scope === "feature" && c.deferred === true && !owed.has(normalizeCommand(c.command));
  for (const c of commands) {
    if (c.deferred === true && owed.has(normalizeCommand(c.command))) {
      problems.push(
        `deferred: "${c.command}" is a Conventions check or one of the ticket's exit conditions; only an unrelated spec may be deferred.`,
      );
    }
  }

  checkVerdict(report, commands, hasWholeSuite, mayDefer, problems);
  checkSummary(report, problems);
  checkJourneys(report, validation, actualFiles, sizes, problems);
  checkChanges(report, problems);
  checkProblemsFixed(report, problems);
  checkNotTested(report, problems);
  checkVideos(report, validation, ticketFolder, problems);
  checkTraces(report, validation, ticketFolder, problems);
  checkCoverage(report, validation, problems);
  checkRenderedReport(report, validation, ticketFolder, problems);

  if (problems.length > 0) {
    for (const p of problems) console.error(p);
    process.exit(1);
  }

  console.log(`PASS: ${basename(ticketFolder)}'s evidence matches its ticket and report.`);
  process.exit(0);
}

// Rule: the verdict is present and follows the fixed rules.
function checkVerdict(report, commands, hasWholeSuite, mayDefer, problems) {
  const verdict = report.verdict;
  if (!verdict || typeof verdict !== "object") {
    problems.push("verdict: validation/report.json has no verdict.");
    return;
  }
  if (!VERDICTS.includes(verdict.builder)) {
    problems.push(
      `verdict: the builder verdict "${verdict.builder}" is not one of ${VERDICTS.join(", ")}.`,
    );
  }
  if (!Array.isArray(verdict.reasons)) {
    problems.push("verdict: reasons must be a list of at most 3.");
  } else if (verdict.reasons.length > 3) {
    problems.push(`verdict: ${verdict.reasons.length} reasons given; at most 3.`);
  }
  if (!VERDICTS.includes(verdict.builder)) return;

  let expected = "ready";
  let why = "nothing failed, nothing is not tested, no high-risk change, no retried test";
  // Under `feature` scope a failure marked `deferred: true` (a spec that
  // neither belongs to the ticket nor covers a touched file) is noted, not
  // chased: it does not fail the ticket, but it caps the verdict at
  // ready_with_notes. `mayDefer` refuses the flag on a check or an exit
  // condition, and under `full`.
  const failedCommand = commands.some((c) => c.exit_code !== 0 && !mayDefer(c));
  const deferredFailure = commands.some((c) => c.exit_code !== 0 && mayDefer(c));
  const failedTest = (report.tests || []).some((t) => t.result === "fail");
  const pdfSkipped = isText(report.pdf && report.pdf.skipped);
  const retried = (report.traces || []).some((t) => t.retried === true);
  const highRisk = (report.changes || []).some((c) => c.risk === "high");
  if (failedCommand || failedTest || !hasWholeSuite) {
    expected = "not_ready";
    why = failedCommand
      ? "a command failed"
      : failedTest
        ? "a test failed"
        : "the whole-suite run is missing";
  } else if ((report.not_tested || []).length > 0 || pdfSkipped || highRisk || retried || deferredFailure) {
    expected = "ready_with_notes";
    why =
      (report.not_tested || []).length > 0 || pdfSkipped
        ? "something is not tested"
        : highRisk
          ? "a changed module is high risk"
          : deferredFailure
            ? "an unrelated failure was deferred"
            : "a test was retried";
  }
  if (verdict.builder !== expected) {
    problems.push(
      `verdict: the builder verdict is ${verdict.builder}, but the rules give ${expected} (${why}).`,
    );
  }
}

// Rule: the summary is at most 3 sentences and 60 words.
function checkSummary(report, problems) {
  if (!isText(report.summary)) {
    problems.push("summary: validation/report.json has no summary.");
    return;
  }
  const nSentences = sentences(report.summary).length;
  const nWords = words(report.summary).length;
  if (nSentences > 3) {
    problems.push(`summary: ${nSentences} sentences; at most 3.`);
  }
  if (nWords > 60) {
    problems.push(`summary: ${nWords} words; at most 60.`);
  }
}

// Rules: with any walkthrough screenshot the journeys exist; each step's
// caption is short and points at a screenshot of the report; with
// before_after every step has its base-branch screen at every size.
function checkJourneys(report, validation, actualFiles, sizes, problems) {
  const journeys = report.journeys;
  const hasWalkthrough =
    actualFiles.some((f) => f.startsWith("walkthrough-")) ||
    (report.screenshots || []).some((s) => String(s.file).startsWith("walkthrough-"));
  if (hasWalkthrough && (!Array.isArray(journeys) || journeys.length === 0)) {
    problems.push(
      "journeys: the report has walkthrough screenshots but validation/report.json's journeys is empty.",
    );
    return;
  }
  if (journeys !== undefined && !Array.isArray(journeys)) {
    problems.push("journeys: journeys must be a list, one entry per role.");
    return;
  }
  const named = new Set((report.screenshots || []).map((s) => s.file));
  for (const journey of journeys || []) {
    for (const step of journey.steps || []) {
      const label = `${journey.role} step ${step.n}`;
      const n = words(step.caption).length;
      if (n === 0 || n > 12) {
        problems.push(
          `journey-caption: ${label} has a caption of ${n} words; one to 12.`,
        );
      }
      if (!named.has(step.screenshot)) {
        problems.push(
          `journey-screenshot: ${label} names screenshot "${step.screenshot}", which no entry in validation/report.json's screenshots has.`,
        );
      }
      if (validation.before_after) {
        if (!isText(step.before)) {
          problems.push(
            `journey-before: ${label} has no before screenshot, and validation.before_after is true.`,
          );
          continue;
        }
        for (const size of sizes) {
          if (!actualFiles.includes(`${step.before}-${size}.png`)) {
            problems.push(
              `journey-before: ${label} has no before file at ${size}: ${step.before}-${size}.png is missing from validation/screenshots/.`,
            );
          }
        }
      }
    }
  }
}

// Rule: changes is present, one entry per changed file, each with an
// allowed risk.
function checkChanges(report, problems) {
  if (!Array.isArray(report.changes)) {
    problems.push("changes: validation/report.json has no changes list (an empty list is allowed).");
    return;
  }
  for (const c of report.changes) {
    if (!isText(c.file) || !isText(c.module)) {
      problems.push(`changes: an entry has no file or no module (${JSON.stringify(c)}).`);
    }
    if (!Number.isInteger(c.added) || !Number.isInteger(c.removed)) {
      problems.push(`changes: ${c.file} needs whole numbers for added and removed.`);
    }
    if (!RISKS.includes(c.risk)) {
      problems.push(`changes: ${c.file} has risk "${c.risk}", not one of ${RISKS.join(", ")}.`);
    }
  }
}

// Rule: problems is present; each card has all four fields, each short.
function checkProblemsFixed(report, problems) {
  if (!Array.isArray(report.problems)) {
    problems.push("problems: validation/report.json has no problems list (an empty list is allowed).");
    return;
  }
  report.problems.forEach((p, i) => {
    for (const field of ["problem", "cause", "fix", "commit"]) {
      if (!isText(p[field])) {
        problems.push(`problems: problem ${i + 1} has no ${field}.`);
      } else if (words(p[field]).length > 25) {
        problems.push(
          `problems: problem ${i + 1}'s ${field} is ${words(p[field]).length} words; at most 25.`,
        );
      }
    }
  });
}

// Rule: each not-tested line, what and why together, is at most 25 words.
function checkNotTested(report, problems) {
  for (const n of report.not_tested || []) {
    const count = words(n.what).length + words(n.reason).length;
    if (count > 25) {
      problems.push(`not-tested: "${String(n.what).slice(0, 40)}" is ${count} words; at most 25.`);
    }
  }
}

// Rules: with video_walkthrough true and in scope, a video entry whose
// file exists where its scope puts it, has a duration, and is within
// video_max_mb. A ticket-scope video lives in the ticket's validation/,
// an item-scope one in the item's root validation/.
function checkVideos(report, validation, ticketFolder, problems) {
  if (!validation.video_walkthrough || !inScope(validation.video_scope, ticketFolder)) return;
  const videos = report.videos || [];
  if (videos.length === 0) {
    problems.push(
      "video: validation.video_walkthrough is true, but validation/report.json lists no video.",
    );
    return;
  }
  const dir = outputDir(validation.video_scope, ticketFolder);
  const otherDir = otherOutputDir(validation.video_scope, ticketFolder);
  const limit = validation.video_max_mb * 1024 * 1024;
  for (const v of videos) {
    const path = join(dir, v.file || "");
    if (!isText(v.file) || !existsSync(path)) {
      if (isText(v.file) && otherDir && existsSync(join(otherDir, v.file))) {
        problems.push(
          `video-place: ${v.file} is in ${shown(otherDir)}, but validation.video_scope is ${validation.video_scope}, so it belongs in ${shown(dir)}.`,
        );
      } else {
        problems.push(`video: ${v.file} does not exist in ${shown(dir)}.`);
      }
      continue;
    }
    if (!(v.duration_s > 0)) {
      problems.push(`video: ${v.file} has no duration_s above 0 in validation/report.json.`);
    }
    const size = statSync(path).size;
    if (size > limit) {
      problems.push(
        `video-size: ${v.file} is ${(size / 1024 / 1024).toFixed(1)} MB; validation.video_max_mb is ${validation.video_max_mb}.`,
      );
    }
  }
}

// Rule: with traces true, a failed test and a retried test each have a
// trace file under validation/.
function checkTraces(report, validation, ticketFolder, problems) {
  if (!validation.traces) return;
  const traces = report.traces || [];
  const have = (test) => traces.find((t) => t.test === test);
  for (const t of report.tests || []) {
    if (t.result !== "fail") continue;
    const trace = have(t.name);
    if (!trace || !isText(trace.file)) {
      problems.push(`trace: failed test "${t.name}" has no trace in validation/report.json's traces.`);
    }
  }
  for (const trace of traces) {
    if (trace.retried !== true && !(report.tests || []).some((t) => t.name === trace.test && t.result === "fail")) {
      continue;
    }
    if (!isText(trace.file) || !existsSync(join(ticketFolder, "validation", trace.file))) {
      problems.push(`trace: the trace file for "${trace.test}" (${trace.file}) does not exist under validation/.`);
    }
  }
}

// Rule: with changed_line_coverage true, a percentage from 0 to 100.
function checkCoverage(report, validation, problems) {
  if (!validation.changed_line_coverage) return;
  const pct = report.coverage && report.coverage.changed_lines_pct;
  if (typeof pct !== "number" || !(pct >= 0 && pct <= 100)) {
    problems.push(
      "coverage: validation.changed_line_coverage is true, but validation/report.json's coverage.changed_lines_pct is not a number from 0 to 100.",
    );
  }
}

// Rules: the rendered report, and its PDF, exist where report_scope puts
// them, when they are due: report true and in scope. A PDF that was
// skipped says why in report.json's pdf.skipped.
function checkRenderedReport(report, validation, ticketFolder, problems) {
  if (!validation.report || !inScope(validation.report_scope, ticketFolder)) return;
  const dir = outputDir(validation.report_scope, ticketFolder);
  const otherDir = otherOutputDir(validation.report_scope, ticketFolder);
  const where = (file, rule) => {
    if (existsSync(join(dir, file))) return;
    if (otherDir && existsSync(join(otherDir, file))) {
      problems.push(
        `${rule}: ${file} is in ${shown(otherDir)}, but validation.report_scope is ${validation.report_scope}, so it belongs in ${shown(dir)}.`,
      );
    } else {
      problems.push(`${rule}: ${file} does not exist in ${shown(dir)}.`);
    }
  };
  where("agent-report.html", "report-html");
  if (validation.report_pdf) {
    if (!isText(report.pdf && report.pdf.skipped)) where("agent-report.pdf", "report-pdf");
  }
}

main();
