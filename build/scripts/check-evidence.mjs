#!/usr/bin/env node
// check-evidence.mjs — checks a ticket's evidence against its own claims.
// Node ESM, no dependencies.
//
//   node build/scripts/check-evidence.mjs <ticket-folder>
//
// Reads validation/report.json, the ticket's Exit conditions and
// Invariants this touches, and the project's Conventions screenshot
// sizes and workflow config. Prints one line per problem and exits 1;
// prints one PASS line and exits 0 when there is nothing to report.
//
// See build/SKILL.md's "## Evidence" section for what each rule means
// and the report.json schema this script reads.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import {
  findProjectRoot,
  loadConfig,
  readConventions,
  screenshotSizes,
  readTicket,
  normalizeInvariantId,
} from "./lib/workflow.mjs";

function globToRegExp(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
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

  const projectRoot = findProjectRoot(ticketFolder);
  const config = loadConfig(projectRoot);
  const conventions = readConventions(projectRoot);
  const sizes = screenshotSizes(conventions);
  const phoneOnlyGlobs = (config.screenshot_sizes_phone_only_for || []).map(globToRegExp);
  const phoneSize = sizes[sizes.length - 1];

  const ticket = readTicket(ticketFolder);
  const screenshotsDir = join(ticketFolder, "validation", "screenshots");
  const actualFiles = existsSync(screenshotsDir) ? readdirSync(screenshotsDir) : [];

  function requiredSizesFor(entry) {
    const screen = entry.screen || entry.file || "";
    const isPhoneOnly = phoneOnlyGlobs.some((re) => re.test(screen));
    return isPhoneOnly && phoneSize ? [phoneSize] : sizes;
  }

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
    for (const size of requiredSizesFor(entry)) {
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
  if (commands.length === 0) {
    problems.push("whole-suite: validation/report.json has no commands recorded.");
  } else {
    const finalCommit = commands[commands.length - 1].commit;
    const hasWholeSuite = commands.some(
      (c) => c.commit === finalCommit && c.whole_suite === true,
    );
    if (!hasWholeSuite) {
      problems.push(
        `whole-suite: no command in validation/report.json's commands is marked whole_suite for commit ${finalCommit}.`,
      );
    }
  }

  if (problems.length > 0) {
    for (const p of problems) console.error(p);
    process.exit(1);
  }

  console.log(`PASS: ${basename(ticketFolder)}'s evidence matches its ticket and report.`);
  process.exit(0);
}

main();
