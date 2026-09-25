#!/usr/bin/env node
// render-report.mjs — renders validation/agent-report.html from
// validation/report.json, in the layout build/SKILL.md's report
// template lays out. Node ESM, no dependencies.
//
//   node build/scripts/render-report.mjs <ticket-folder>
//
// See build/SKILL.md's "## The report" and "## Report schema" sections
// for what report.json holds and what each field means.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

function screenshotKind(file) {
  if (file.startsWith("walkthrough-")) return "Walkthrough";
  if (file.startsWith("invariant-")) return "Invariants";
  if (file.startsWith("exit-")) return "Exit conditions";
  return "Other";
}

function renderTests(tests) {
  const rows = (tests || [])
    .map((t) => {
      const evidence = t.evidence
        ? `<a href="screenshots/${esc(t.evidence)}">screenshot</a>`
        : "";
      const cls = t.result === "pass" ? "pass" : "fail";
      return `<tr><td>${esc(t.kind)}</td><td>${esc(t.name)}</td><td>${esc(t.proves)}</td><td class="${cls}">${esc(t.result)}</td><td>${evidence}</td></tr>`;
    })
    .join("\n");
  return `<table><tr><th>Kind</th><th>Test</th><th>Proves</th><th>Result</th><th>Evidence</th></tr>\n${rows}\n</table>`;
}

function renderCommands(commands) {
  const lines = (commands || [])
    .map((c) => `${c.command}   exit ${c.exit_code}${c.whole_suite ? "  (whole suite)" : ""}`)
    .join("\n");
  return `<pre>${esc(lines)}</pre>`;
}

function renderNotTested(notTested) {
  const items = (notTested || [])
    .map((n) => `<li>${esc(n.what)}, because ${esc(n.reason)}</li>`)
    .join("\n");
  return `<ul>${items}</ul>`;
}

function renderScreenshots(screenshots) {
  const byKind = { Walkthrough: [], Invariants: [], "Exit conditions": [], Other: [] };
  for (const s of screenshots || []) {
    byKind[screenshotKind(s.file)].push(s);
  }
  let html = "";
  for (const kind of ["Walkthrough", "Invariants", "Exit conditions", "Other"]) {
    const entries = byKind[kind];
    if (entries.length === 0) continue;
    html += `<h3>${kind}</h3>\n`;
    for (const entry of entries) {
      for (const size of entry.sizes || []) {
        html += `<figure><img src="screenshots/${esc(entry.file)}-${esc(size)}.png" alt=""><figcaption>${esc(entry.claim)} (${esc(size)})</figcaption></figure>\n`;
      }
    }
  }
  return html;
}

function renderDiagrams(diagrams) {
  return (diagrams || [])
    .map((d) => `<h3>${esc(d.title)}</h3>\n<pre class="mermaid">${esc(d.text)}</pre>`)
    .join("\n");
}

function renderRounds(rounds) {
  const items = (rounds || [])
    .map((r) => `<li>${esc(r.round)}: ${(r.findings || []).map(esc).join("; ") || "pass"}</li>`)
    .join("\n");
  return `<ol>${items}</ol>`;
}

function renderImplemented(steps) {
  const items = (steps || [])
    .map((s) => `<li>step ${esc(s.n)}: ${esc(s.summary)}</li>`)
    .join("\n");
  return `<ol>${items}</ol>`;
}

function render(report) {
  const ticket = report.ticket || "";
  const number = ticket.split("-")[0] || "NNNN";
  const title = report.title || ticket;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(number)} — ${esc(title)}: validation report</title>
<style>
  body { font: 15px/1.5 system-ui, sans-serif; max-width: 60rem; margin: 2rem auto; padding: 0 1rem; color: #222; }
  table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid #ccc; padding: .3rem .5rem; text-align: left; }
  .pass { color: #1a7f37; } .fail { color: #b3261e; }
  figure { margin: 1rem 0; } figure img { max-width: 100%; border: 1px solid #ccc; } figcaption { font-size: .9em; color: #555; }
  pre { background: #f6f6f6; padding: .5rem; overflow-x: auto; }
</style>
<script type="module">
  import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
  mermaid.initialize({ startOnLoad: true });
</script>
</head>
<body>
<h1>${esc(number)} — ${esc(title)}: validation report</h1>
<p>Ticket <code>${esc(ticket)}</code> · spec <code>${esc(report.spec)}</code> · branch <code>${esc(report.branch)}</code> · run ${esc(report.started)} to ${esc(report.ended)}, ended by ${esc(report.ended_by)}</p>

<h2>Implemented</h2>
${renderImplemented(report.steps)}

<h2>Tests</h2>
${renderTests(report.tests)}
${renderCommands(report.commands)}

<h2>Not tested</h2>
${renderNotTested(report.not_tested)}

<h2>Screenshots</h2>
${renderScreenshots(report.screenshots)}

<h2>Diagrams</h2>
${renderDiagrams(report.diagrams)}

<h2>Rounds</h2>
${renderRounds(report.rounds)}
</body>
</html>
`;
}

function main() {
  const ticketFolder = process.argv[2];
  if (!ticketFolder) {
    console.error("usage: node build/scripts/render-report.mjs <ticket-folder>");
    process.exit(2);
  }
  const reportPath = join(ticketFolder, "validation", "report.json");
  if (!existsSync(reportPath)) {
    console.error("render-report: validation/report.json is missing.");
    process.exit(1);
  }
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  const html = render(report);
  const outPath = join(ticketFolder, "validation", "agent-report.html");
  writeFileSync(outPath, html);
  console.log(outPath);
}

main();
