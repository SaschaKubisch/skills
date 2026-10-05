#!/usr/bin/env node
// render-pdf.mjs — prints the rendered validation report to
// agent-report.pdf beside agent-report.html, with a headless Chromium.
// Node ESM, no dependencies of its own: Playwright is resolved from the
// PROJECT (its package.json and node_modules), never from the skills.
//
//   node build/scripts/render-pdf.mjs <ticket-folder> [--project <root>]
//
// The project root is found from the ticket folder (the nearest ancestor
// with CLAUDE.md, AGENTS.md or .git); --project, or the environment
// variable REPORT_PROJECT_ROOT, names another one.
//
// Does nothing, with one printed line and exit 0, when validation.report_pdf
// is false or no rendered report is due. When Playwright or Chromium is
// missing, or the page does not finish rendering within the timeout
// (REPORT_PDF_TIMEOUT_MS, default 60000), it does not fail: it writes
// {"skipped": "<reason>"} to report.json's pdf, renders the HTML again so
// the skip shows under Not tested, prints the reason and exits 0.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { findProjectRoot } from "./lib/workflow.mjs";
import { planReport, renderReportFor } from "./render-report.mjs";

function usage() {
  console.error("usage: node build/scripts/render-pdf.mjs <ticket-folder> [--project <root>]");
  process.exit(2);
}

// Playwright's chromium launcher, resolved from the project, or null.
function loadChromium(projectRoot) {
  const require = createRequire(join(projectRoot, "package.json"));
  for (const name of ["playwright", "playwright-core", "@playwright/test"]) {
    try {
      const mod = require(name);
      if (mod && mod.chromium) return mod.chromium;
    } catch {
      // try the next package
    }
  }
  return null;
}

function firstLine(err) {
  return String((err && err.message) || err).split("\n").map((l) => l.trim()).find(Boolean) || "unknown error";
}

function setPdf(ticketFolder, value) {
  const reportPath = join(ticketFolder, "validation", "report.json");
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  const before = JSON.stringify(report.pdf ?? null);
  if (before === JSON.stringify(value)) return;
  if (value === null) delete report.pdf;
  else report.pdf = value;
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
}

async function print(chromium, htmlPath, pdfPath, timeoutMs) {
  let browser;
  try {
    browser = await chromium.launch();
  } catch (err) {
    return { skipped: `Chromium could not be started (${firstLine(err)})` };
  }
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    await page.emulateMedia({ colorScheme: "light", media: "print" });
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load", timeout: timeoutMs });
    // lazy images below the fold would never finish loading in a print
    await page.evaluate(() => document.querySelectorAll("img").forEach((i) => (i.loading = "eager")));
    try {
      await page.waitForFunction(
        () =>
          window.__reportReady === true &&
          [...document.querySelectorAll(".mermaid")].every((m) => m.querySelector("svg")) &&
          [...document.images].every((i) => i.complete),
        null,
        { timeout: timeoutMs },
      );
    } catch {
      return {
        skipped: `the diagrams and images did not finish rendering within ${Math.round(timeoutMs / 1000)} s (is the diagram renderer reachable?)`,
      };
    }
    await page.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
    await page.pdf({ path: pdfPath, format: "A4", printBackground: true, preferCSSPageSize: true });
    return { written: pdfPath };
  } catch (err) {
    return { skipped: `the page could not be printed (${firstLine(err)})` };
  } finally {
    await browser.close().catch(() => {});
  }
}

async function main() {
  const args = process.argv.slice(2);
  let ticketFolder = null;
  let projectArg = process.env.REPORT_PROJECT_ROOT || null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--project") projectArg = args[++i];
    else if (!ticketFolder) ticketFolder = args[i];
    else usage();
  }
  if (!ticketFolder) usage();

  let plan;
  try {
    plan = planReport(ticketFolder);
  } catch (err) {
    console.error(`config: ${err.message}`);
    process.exit(1);
  }
  if (!plan.validation.report_pdf) {
    console.log("No PDF is due: validation.report_pdf is false.");
    return;
  }
  if (!plan.due) {
    console.log(`No PDF is due: no rendered report is due (${plan.reason}).`);
    return;
  }
  if (!existsSync(join(plan.folder, "validation", "report.json"))) {
    console.error("render-pdf: validation/report.json is missing.");
    process.exit(1);
  }

  let projectRoot = projectArg ? resolve(projectArg) : plan.projectRoot;
  if (!projectRoot) {
    try {
      projectRoot = findProjectRoot(plan.folder);
    } catch {
      projectRoot = plan.folder;
    }
  }

  const timeoutMs = Number(process.env.REPORT_PDF_TIMEOUT_MS) || 60000;
  const pdfPath = join(plan.outDir, "agent-report.pdf");
  let outcome;
  const chromium = loadChromium(projectRoot);
  if (!chromium) {
    outcome = { skipped: `Playwright is not installed in the project (${projectRoot})` };
  } else {
    // the HTML must be current before it is printed
    setPdf(plan.folder, null);
    renderReportFor(plan.folder);
    mkdirSync(plan.outDir, { recursive: true });
    outcome = await print(chromium, plan.htmlPath, pdfPath, timeoutMs);
  }

  if (outcome.skipped) {
    setPdf(plan.folder, { skipped: outcome.skipped });
    renderReportFor(plan.folder);
    console.log(`PDF skipped: ${outcome.skipped}`);
    return;
  }
  console.log(outcome.written);
}

main().catch((err) => {
  console.error(`render-pdf: ${err.message}`);
  process.exit(1);
});
