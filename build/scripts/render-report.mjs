#!/usr/bin/env node
// render-report.mjs — renders the validation report, agent-report.html,
// from validation/report.json, in the order and by the rules of
// build/SKILL.md's "The validation report". Node ESM, no dependencies.
//
//   node build/scripts/render-report.mjs <ticket-folder>
//
// Where the HTML goes depends on the project's workflow config
// (.claude/workflow.yml, read through lib/workflow.mjs):
//   report: false                        no rendered report is due
//   report_scope: ticket                 <ticket>/validation/agent-report.html
//   report_scope: item                   due only for the ticket that empties
//                                        its item's backlog; written to
//                                        items/<item>/validation/agent-report.html
//                                        and merges every ticket of the item
// When no report is due the script prints one line and exits 0.
//
// The page is self-contained: the layout, the style and the small client
// script sit in build/scripts/report/ and are inlined; screenshots and
// videos are linked by relative path; the diagram renderer (Mermaid, from
// the CDN) is the one external asset.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname, basename, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  findProjectRoot,
  loadConfig,
  inScope,
  outputDir,
  itemFolder,
  itemTicketFolders,
  readTicket,
  clauseInvariantIds,
  invariantLabel,
  invariantTitles,
  normalizeInvariantId,
} from "./lib/workflow.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const assetDir = join(here, "report");

// ---------------------------------------------------------------- helpers

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

// A relative file path as an attribute value: each segment URL-encoded,
// then HTML-escaped.
function href(path) {
  return esc(String(path).split("/").map(encodeURIComponent).join("/"));
}

const posix = (p) => p.split(sep).join("/");
const arr = (v) => (Array.isArray(v) ? v : []);

const ICONS = {
  check: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.6l3.2 3.2L13 4.8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  cross: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  warn: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.2l6.2 11H1.8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8 6.6v3.1M8 11.7v.1" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
};

const VERDICTS = {
  ready: { label: "Ready", icon: "check", rank: 0 },
  ready_with_notes: { label: "Ready with notes", icon: "warn", rank: 1 },
  not_ready: { label: "Not ready", icon: "cross", rank: 2 },
};

function formatTime(s) {
  if (!s) return "";
  return String(s).slice(0, 16).replace("T", " ") + (String(s).endsWith("Z") ? " UTC" : "");
}

function duration(start, end) {
  const ms = Date.parse(end) - Date.parse(start);
  if (!(ms > 0)) return "";
  const min = Math.round(ms / 60000);
  return min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min` : `${min} min`;
}

function clock(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function ticketNumber(name) {
  return String(name || "").split("-")[0] || "";
}

// --------------------------------------------------------------- planning

// What the project's config says about this ticket's report: whether a
// rendered report is due, where it goes, and which tickets it covers.
export function planReport(ticketFolder) {
  const folder = resolve(ticketFolder);
  let projectRoot = null;
  try {
    projectRoot = findProjectRoot(folder);
  } catch {
    // no project root above the folder: every default applies
  }
  const config = loadConfig(projectRoot ?? folder);
  const v = config.validation;
  const plan = { folder, projectRoot, config, validation: v };

  if (!v.report) {
    return { ...plan, due: false, reason: "validation.report is false" };
  }
  if (!inScope(v.report_scope, folder)) {
    return {
      ...plan,
      due: false,
      reason: "validation.report_scope is item and this ticket does not empty its item's backlog",
    };
  }
  const outDir = outputDir(v.report_scope, folder);
  const item = v.report_scope === "item" ? itemFolder(folder) : null;
  const folders = item ? itemTicketFolders(item).map((t) => t.folder) : [folder];
  return { ...plan, due: true, outDir, item, ticketFolders: folders, htmlPath: join(outDir, "agent-report.html") };
}

function loadTickets(plan) {
  const tickets = [];
  for (const folder of plan.ticketFolders) {
    const reportPath = join(folder, "validation", "report.json");
    if (!existsSync(reportPath)) continue;
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    let ticketMd = null;
    try {
      ticketMd = readTicket(folder);
    } catch {
      // a ticket folder without ticket.md still has its report
    }
    const base = posix(relative(plan.outDir, join(folder, "validation")));
    tickets.push({
      folder,
      name: basename(folder),
      number: ticketNumber(report.ticket || basename(folder)),
      report,
      ticketMd,
      base: base ? `${base}/` : "",
      current: folder === plan.folder,
    });
  }
  return tickets;
}

// ------------------------------------------------------------------ model

function buildModel(plan, tickets) {
  const multi = tickets.length > 1;
  const last = tickets[tickets.length - 1];

  // verdict: the worst builder verdict; reasons from the worst tickets first
  const known = tickets.filter((t) => VERDICTS[t.report.verdict && t.report.verdict.builder]);
  let verdict = null;
  if (known.length) {
    const worst = Math.max(...known.map((t) => VERDICTS[t.report.verdict.builder].rank));
    verdict = Object.keys(VERDICTS).find((k) => VERDICTS[k].rank === worst);
  }
  const reasons = [];
  for (const t of [...known].sort((a, b) => VERDICTS[b.report.verdict.builder].rank - VERDICTS[a.report.verdict.builder].rank)) {
    for (const r of arr(t.report.verdict.reasons)) reasons.push(multi ? `${t.number}: ${r}` : r);
  }
  const judges = tickets
    .filter((t) => t.report.verdict && t.report.verdict.judge)
    .map((t) => ({ number: t.number, ...t.report.verdict.judge }));

  // tests, with where their evidence and trace sit
  const tests = [];
  for (const t of tickets) {
    for (const test of arr(t.report.tests)) {
      const trace = arr(t.report.traces).find((x) => x.test === test.name);
      tests.push({
        ...test,
        base: t.base,
        number: t.number,
        trace: trace && trace.file ? `${t.base}${trace.file}` : null,
        flaky: Boolean(trace && trace.retried),
      });
    }
  }
  const passed = tests.filter((t) => t.result === "pass").length;
  const failed = tests.length - passed;

  // invariants: touched by the tickets, named by a test, or by a screenshot
  const rows = new Map();
  const row = (id) => {
    if (!rows.has(id)) rows.set(id, { id, title: "", testIdx: [], shots: [] });
    return rows.get(id);
  };
  for (const t of tickets) {
    if (t.ticketMd) {
      const titles = invariantTitles(t.ticketMd.text);
      for (const id of t.ticketMd.invariantIds) {
        const r = row(id);
        if (!r.title && titles.has(id)) r.title = titles.get(id);
      }
    }
    for (const s of arr(t.report.screenshots)) {
      const m = /^invariant-([A-Za-z0-9]+)-/.exec(String(s.file));
      if (m) row(normalizeInvariantId(m[1])).shots.push({ ...s, base: t.base });
    }
  }
  tests.forEach((test, i) => {
    for (const id of clauseInvariantIds(test.proves)) row(id).testIdx.push(i);
  });
  const invRows = [...rows.values()].sort((a, b) => {
    const an = /^\d+$/.test(a.id), bn = /^\d+$/.test(b.id);
    if (an !== bn) return an ? -1 : 1;
    return an ? Number(a.id) - Number(b.id) : a.id.localeCompare(b.id, "en", { numeric: true });
  });
  for (const r of invRows) {
    const results = r.testIdx.map((i) => tests[i].result);
    r.state = !results.length ? "gap" : results.some((x) => x !== "pass") ? "fail" : "pass";
  }
  const columns = [...new Set(invRows.flatMap((r) => r.testIdx))].sort((a, b) => a - b);

  // not tested: every ticket's lines, and the PDF when it was skipped
  const notTested = [];
  for (const t of tickets) {
    for (const n of arr(t.report.not_tested)) notTested.push({ ...n, number: multi ? t.number : "" });
  }
  const current = tickets.find((t) => t.current) || last;
  const pdfSkipped = current && current.report.pdf && current.report.pdf.skipped;
  if (pdfSkipped) notTested.push({ what: "PDF of this report", reason: pdfSkipped, number: "" });

  const problems = [];
  for (const t of tickets) {
    for (const p of arr(t.report.problems)) problems.push({ ...p, number: multi ? t.number : "" });
  }

  const rounds = [];
  for (const t of tickets) for (const r of arr(t.report.rounds)) rounds.push({ ...r, number: multi ? t.number : "" });

  // changes: one row per file over all tickets, files of one module together
  const files = new Map();
  for (const t of tickets) {
    for (const c of arr(t.report.changes)) {
      const old = files.get(c.file);
      if (!old) {
        files.set(c.file, { ...c });
      } else {
        old.added += c.added || 0;
        old.removed += c.removed || 0;
        if (riskRank(c.risk) > riskRank(old.risk)) {
          old.risk = c.risk;
          old.risk_reason = c.risk_reason;
        }
      }
    }
  }
  const modules = new Map();
  for (const c of files.values()) {
    const name = c.module || "other";
    if (!modules.has(name)) modules.set(name, { name, files: [], added: 0, removed: 0, risk: "low", why: "" });
    const m = modules.get(name);
    m.files.push(c);
    m.added += c.added || 0;
    m.removed += c.removed || 0;
    if (riskRank(c.risk) > riskRank(m.risk) || !m.why) {
      if (riskRank(c.risk) >= riskRank(m.risk)) {
        m.risk = c.risk;
        if (c.risk_reason) m.why = c.risk_reason;
      }
    }
  }
  const moduleList = [...modules.values()].sort(
    (a, b) => riskRank(b.risk) - riskRank(a.risk) || b.added + b.removed - (a.added + a.removed),
  );
  const maxLines = Math.max(1, ...[...files.values()].map((c) => (c.added || 0) + (c.removed || 0)));

  // diagrams come from the last ticket that has any
  const withDiagrams = [...tickets].reverse().find((t) => arr(t.report.diagrams).length);
  const diagrams = withDiagrams ? arr(withDiagrams.report.diagrams) : [];

  // videos: each lives where its scope puts it
  const videos = [];
  for (const t of tickets) {
    const dir = outputDir(plan.validation.video_scope, t.folder);
    const base = posix(relative(plan.outDir, dir));
    for (const v of arr(t.report.videos)) {
      videos.push({ ...v, src: `${base ? base + "/" : ""}${v.file}`, number: multi ? t.number : "" });
    }
  }

  const coverages = tickets
    .map((t) => t.report.coverage && t.report.coverage.changed_lines_pct)
    .filter((x) => typeof x === "number");

  return {
    multi,
    tickets,
    last,
    verdict,
    reasons: reasons.slice(0, 3),
    judges,
    tests,
    passed,
    failed,
    invRows,
    columns,
    notTested,
    problems,
    rounds,
    moduleList,
    maxLines,
    diagrams,
    videos,
    steps: tickets.reduce((n, t) => n + arr(t.report.steps).length, 0),
    coverage: coverages.length ? coverages.reduce((a, b) => a + b, 0) / coverages.length : null,
    pdfSkipped,
  };
}

function riskRank(r) {
  return r === "high" ? 2 : r === "medium" ? 1 : 0;
}

// ---------------------------------------------------------------- pieces

function shotMap(ticket) {
  return new Map(arr(ticket.report.screenshots).map((s) => [s.file, s]));
}

function sizeFlex(size) {
  const m = /^(\d+)x(\d+)$/.exec(size);
  return m ? { w: Number(m[1]), h: Number(m[2]), ratio: Number(m[1]) / Number(m[2]) } : null;
}

function shotsHtml(ticket, entry, caption) {
  if (!entry) return "";
  const out = arr(entry.sizes).map((size) => {
    const dims = sizeFlex(size);
    const src = `${ticket.base}screenshots/${entry.file}-${size}.png`;
    const flex = dims ? `${dims.ratio.toFixed(3)} 1 0` : "1 1 0";
    const dimAttr = dims ? ` width="${dims.w}" height="${dims.h}"` : "";
    return `<a class="shot" href="${href(src)}" data-cap="${esc(caption)}, ${esc(size)}" style="flex:${flex}"><img loading="lazy" src="${href(src)}" alt="${esc(caption)}, ${esc(size)}"${dimAttr}><span class="sz">${esc(size)}</span></a>`;
  });
  return `<div class="shots">${out.join("")}</div>`;
}

function stepId(ti, ri, n) {
  return `st${ti}r${ri}n${n}`;
}

function collectRoles(model) {
  const roles = [];
  const byName = new Map();
  model.tickets.forEach((t, ti) => {
    for (const j of arr(t.report.journeys)) {
      const key = String(j.role);
      if (!byName.has(key)) {
        byName.set(key, { role: key, index: roles.length, perTicket: [] });
        roles.push(byName.get(key));
      }
      byName.get(key).perTicket.push({ ti, ticket: t, steps: arr(j.steps) });
    }
  });
  return roles;
}

function renderBanner(model, plan) {
  const v = VERDICTS[model.verdict] || { label: "No verdict", icon: "warn" };
  const reasons = model.reasons.map((r) => `<li>${esc(r)}</li>`).join("");
  const judges = model.judges
    .map((j) => {
      const pass = String(j.result).toLowerCase() === "pass";
      const who = `Judge${model.multi ? ` ${esc(j.number)}` : ""}${j.round ? `, round ${esc(j.round)}` : ""}`;
      return `<div class="judge"><span class="eyebrow">${who}</span><span class="res ${pass ? "pass" : "fail"}">${esc(j.result)}</span><span class="line">${esc(j.line)}</span></div>`;
    })
    .join("");
  const first = model.tickets[0];
  const r = model.last.report;
  const meta = [];
  if (model.multi) {
    const where = plan.projectRoot ? relative(plan.projectRoot, join(plan.item, "tickets")) : join(plan.item, "tickets");
    meta.push(`item ${basename(plan.item)}: ${model.tickets.length} tickets in ${posix(where)}/`);
  } else {
    if (r.branch) meta.push(`branch ${r.branch}`);
    if (r.spec) meta.push(`spec ${r.spec}`);
    const d = duration(r.started, r.ended);
    meta.push(`${formatTime(r.started)} to ${formatTime(r.ended)}${d ? ` (${d})` : ""}`);
    if (r.ended_by) meta.push(`ended by ${r.ended_by}`);
  }
  const heading = model.multi ? `Item ${basename(plan.item)}` : `${first.number} ${first.report.title || first.name}`;
  return `<section class="banner" id="verdict" aria-label="Verdict">
  <div class="banner-main">
    <div class="stamp">${ICONS[v.icon]}</div>
    <div><p class="eyebrow">Verdict &middot; ${esc(heading)}</p><h1 class="verdict-word">${esc(v.label)}</h1></div>
  </div>
  <div class="banner-side">${reasons ? `<ul class="reasons">${reasons}</ul>` : ""}${judges}</div>
  <div class="banner-meta">${meta.map((m) => `<span>${esc(m)}</span>`).join("")}</div>
</section>`;
}

function renderTiles(model) {
  const tile = (cls, num, label, sub = "", viz = "") =>
    `<div class="tile ${cls}"><div class="tile-num">${num}</div><div class="tile-label">${esc(label)}</div>${sub}${viz}</div>`;
  const total = model.passed + model.failed;
  const covered = model.invRows.filter((r) => r.state === "pass").length;
  const numbered = model.invRows.filter((r) => /^\d+$/.test(r.id));
  const design = model.invRows.filter((r) => !/^\d+$/.test(r.id));
  const cov = (list) => list.filter((r) => r.state === "pass").length;
  const tiles = [];
  tiles.push(tile("", String(model.steps), "steps done"));
  tiles.push(
    tile(
      model.failed ? "t-bad" : "t-ok",
      String(model.passed),
      "tests passed",
      `<div class="tile-sub ${model.failed ? "bad" : ""}">${model.failed} failed</div>`,
      total ? `<div class="seg"><i class="g" style="width:${(model.passed / total) * 100}%"></i><i class="r" style="width:${(model.failed / total) * 100}%"></i></div>` : "",
    ),
  );
  const invOk = model.invRows.length > 0 && covered === model.invRows.length;
  tiles.push(
    tile(
      invOk ? "t-ok" : model.invRows.length ? "t-bad" : "",
      `${covered}<small>/${model.invRows.length}</small>`,
      "invariants covered",
      `<div class="tile-sub">${cov(numbered)}/${numbered.length} numbered, ${cov(design)}/${design.length} design</div>`,
      model.invRows.length
        ? `<div class="dots">${model.invRows.map((r) => `<i class="${r.state === "pass" ? "" : "r"} ${/^\d+$/.test(r.id) ? "" : "d"}" title="${esc(invariantLabel(r.id))}"></i>`).join("")}</div>`
        : "",
    ),
  );
  tiles.push(tile(model.notTested.length ? "t-warn" : "t-ok", String(model.notTested.length), "not tested"));
  tiles.push(tile("", String(model.problems.length), "problems fixed"));
  tiles.push(tile("", String(model.rounds.length), "review rounds"));
  if (model.coverage !== null) {
    const pct = Math.max(0, Math.min(100, model.coverage));
    tiles.push(
      tile(
        pct >= 80 ? "t-ok" : "t-warn",
        `${Math.round(pct * 10) / 10}<small>%</small>`,
        "changed lines covered",
        "",
        `<div class="seg"><i class="b" style="width:${pct}%"></i></div>`,
      ),
    );
  }
  const summaries = model.tickets.filter((t) => t.report.summary);
  const summary = summaries.length
    ? `<div class="summary">${summaries.map((t) => `<p>${model.multi ? `<b>${esc(t.number)}</b>` : ""}${esc(t.report.summary)}</p>`).join("")}</div>`
    : "";
  return `<section id="tiles" aria-label="Numbers"><div class="tiles">${tiles.join("")}</div>${summary}</section>`;
}

function secHead(n, title, aside = "") {
  return `<header class="sec-h"><span class="sec-n">${n}</span><h2>${esc(title)}</h2>${aside ? `<div class="aside">${aside}</div>` : ""}</header>`;
}

function renderVideos(model) {
  return model.videos
    .map((v) => {
      const chapters = arr(v.chapters)
        .map((c) => `<a class="chap" href="${href(v.src)}#t=${Number(c.at_s) || 0}" data-t="${Number(c.at_s) || 0}"><span class="t">${clock(c.at_s)}</span>${esc(c.title)}</a>`)
        .join("");
      const label = `${model.multi && v.number ? v.number + " " : ""}${v.claim || v.file}`;
      return `<div class="video">
  <div class="video-h"><span class="vt">${esc(label)}</span>${chapters}</div>
  <video controls preload="metadata" src="${href(v.src)}"></video>
  <p class="video-print">Video: ${esc(v.src)}${v.duration_s ? `, ${esc(clock(v.duration_s))}` : ""}</p>
</div>`;
    })
    .join("\n");
}

function renderStoryboard(model, roles) {
  const withShots = roles.length > 0;
  let body = "";
  if (withShots) {
    model.tickets.forEach((t, ti) => {
      const mine = roles.filter((r) => r.perTicket.some((p) => p.ti === ti));
      if (!mine.length) return;
      if (model.multi) body += `<h3 class="ticket-head"><span class="num">${esc(t.number)}</span>${esc(t.report.title || t.name)}</h3>\n`;
      const map = shotMap(t);
      for (const role of mine) {
        const part = role.perTicket.find((p) => p.ti === ti);
        const cards = part.steps
          .map((s) => {
            const after = shotsHtml(t, map.get(s.screenshot), s.caption);
            const beforeEntry = s.before ? map.get(s.before) : null;
            const before = beforeEntry ? shotsHtml(t, beforeEntry, `Before: ${s.caption}`) : "";
            const groups = before
              ? `<div class="fg fg-before"><span class="fg-l">Before</span>${before}</div><div class="fg fg-after"><span class="fg-l">After</span>${after}</div>`
              : `<div class="fg fg-after">${after}</div>`;
            return `<article class="step${before ? " has-before" : ""}" id="${stepId(ti, role.index, s.n)}" style="--c:var(--role-${role.index % 4})">
  <div class="step-h"><span class="num">${esc(s.n)}</span><h4>${esc(s.caption)}</h4></div>
  <div class="frames">${groups}</div>
</article>`;
          })
          .join("\n");
        body += `<div class="role"><div class="role-h"><span class="role-chip" style="--c:var(--role-${role.index % 4})">${esc(role.role)}</span><span class="cnt">${part.steps.length} steps</span></div><div class="steps">${cards}</div></div>\n`;
      }
    });
  } else {
    // no screens: the command outputs stand in for them
    const cmds = [];
    for (const t of model.tickets) {
      for (const c of arr(t.report.commands)) {
        cmds.push(`<div class="cmd"><code>${esc(c.command)}</code><span class="exit ${c.exit_code === 0 ? "" : "bad"}">exit ${esc(c.exit_code)}</span></div>`);
      }
    }
    body = cmds.length ? `<div class="cmds">${cmds.join("")}</div>` : `<p class="empty">Nothing to show.</p>`;
  }
  const videos = renderVideos(model);
  return `<section class="sec" id="storyboard">${secHead("02", "Walkthrough")}
${videos}
${body}
</section>`;
}

// Mermaid-safe label text (the page escapes it again for the HTML).
function mermaidLabel(text) {
  return String(text ?? "")
    .replace(/#/g, "#35;")
    .replace(/"/g, "#quot;")
    .replace(/</g, "#lt;")
    .replace(/>/g, "#gt;")
    .replace(/[\r\n]+/g, " ");
}

function renderJourneys(model, roles) {
  if (!roles.length) return "";
  const cards = roles
    .map((role) => {
      const nodes = [];
      for (const part of role.perTicket) {
        for (const s of part.steps) {
          const label = model.multi ? `${part.ticket.number}/${s.n} ${s.caption}` : `${s.n} ${s.caption}`;
          nodes.push({ id: stepId(part.ti, role.index, s.n), label, n: model.multi ? `${part.ticket.number}/${s.n}` : String(s.n) });
        }
      }
      const colour = ["#2f5d9e", "#8a4a9e", "#0e7c86", "#a65a2e"][role.index % 4];
      const lines = ["flowchart LR"];
      for (const n of nodes) lines.push(`  ${n.id}(["${mermaidLabel(n.label)}"])`);
      for (let i = 1; i < nodes.length; i++) lines.push(`  ${nodes[i - 1].id} --> ${nodes[i].id}`);
      lines.push(`  classDef role stroke:${colour},stroke-width:2.5px`);
      lines.push(`  class ${nodes.map((n) => n.id).join(",")} role`);
      const jumps = nodes.map((n) => `<a href="#${esc(n.id)}">${esc(n.n)}</a>`).join("");
      return `<div class="jcard"><div class="role-h"><span class="role-chip" style="--c:var(--role-${role.index % 4})">${esc(role.role)}</span><span class="cnt">${nodes.length} steps</span></div>
<div class="chart-scroll journey-chart" style="--n:${nodes.length}"><pre class="mermaid">${esc(lines.join("\n"))}</pre></div>
<nav class="jlinks" aria-label="Steps of ${esc(role.role)}"><span>Go to step</span>${jumps}</nav></div>`;
    })
    .join("\n");
  return `<section class="sec" id="journeys">${secHead("03", "Journeys")}
${cards}
</section>`;
}

function renderChanges(model) {
  const legend = `<div class="legend"><span><i class="ch"></i>changed by this ticket</span><span><i></i>unchanged</span><span><i class="rm"></i>removed</span></div>`;
  const diagrams = model.diagrams.length
    ? `<div class="dgrams${model.diagrams.length === 1 ? " one" : ""}">${model.diagrams
        .map(
          (d) =>
            `<div class="dcard"><h3>${esc(d.title)}</h3><div class="chart-scroll"><pre class="mermaid">${esc(d.text)}</pre></div>${d.caption ? `<p class="note">${esc(d.caption)}</p>` : ""}</div>`,
        )
        .join("")}</div>`
    : "";
  const mods = model.moduleList.length
    ? `<div class="mods">${model.moduleList
        .map((m) => {
          const rows = m.files
            .map((c) => {
              const slash = String(c.file).lastIndexOf("/");
              const dir = slash >= 0 ? c.file.slice(0, slash + 1) : "";
              const name = slash >= 0 ? c.file.slice(slash + 1) : c.file;
              const a = (c.added || 0) / model.maxLines * 100;
              const d = (c.removed || 0) / model.maxLines * 100;
              return `<div class="frow"><span class="fname" title="${esc(c.file)}"><bdi><span class="dir">${esc(dir)}</span>${esc(name)}</bdi></span><span class="bar" role="img" aria-label="${esc(c.added)} added, ${esc(c.removed)} removed"><i class="a" style="width:${a}%"></i><i class="d" style="width:${d}%"></i></span><span class="num2"><span class="a">+${esc(c.added)}</span> <span class="d">-${esc(c.removed)}</span></span></div>`;
            })
            .join("");
          return `<div class="mod"><div class="mod-h"><span class="name">${esc(m.name)}</span><span class="risk ${esc(m.risk)}">${esc(m.risk)} risk</span><span class="why">${esc(m.why)}</span><span class="tot"><span style="color:var(--add)">+${m.added}</span> <span style="color:var(--del)">-${m.removed}</span></span></div>${rows}</div>`;
        })
        .join("")}</div>`
    : `<p class="empty">No files changed.</p>`;
  return `<section class="sec" id="changes">${secHead("04", "What changed", legend)}
${diagrams}
${mods}
</section>`;
}

function renderGrid(model) {
  const aside = `<div class="legend"><span><i style="background:var(--ok);border-color:var(--ok)"></i>test passes</span><span><i style="background:var(--bad);border-color:var(--bad)"></i>fails or not proved</span></div>`;
  if (!model.invRows.length) {
    return `<section class="sec" id="grid">${secHead("05", "Traceability", aside)}<p class="empty">This ticket touches no invariant.</p></section>`;
  }
  const head = model.columns
    .map((i) => `<th scope="col"><div class="colh" title="${esc(model.tests[i].name)}">${esc(model.tests[i].name)}</div></th>`)
    .join("");
  const body = model.invRows
    .map((r) => {
      const design = !/^\d+$/.test(r.id);
      const label = `<th scope="row" class="rowh"><div class="inv"><span class="id${design ? " design" : ""}">${esc(invariantLabel(r.id))}</span><span class="tt">${esc(r.title)}</span></div></th>`;
      if (r.state === "gap") {
        return `<tr class="gap">${label}<td class="gapcell" colspan="${Math.max(1, model.columns.length)}">${ICONS.cross.replace("<svg", '<svg width="12" height="12" style="display:inline;vertical-align:-1px;margin-right:6px"')}No test proves this</td></tr>`;
      }
      const cells = model.columns
        .map((i) => {
          if (!r.testIdx.includes(i)) return `<td><span class="cellbox empty"></span></td>`;
          const t = model.tests[i];
          const ok = t.result === "pass";
          const icon = ok ? ICONS.check : ICONS.cross;
          const extras = t.flaky ? `<span class="flaky">flaky</span>` : "";
          const trace = t.trace ? `<a class="tracelink" href="${href(t.trace)}">trace</a>` : "";
          const ev = t.evidence ? `${t.base}screenshots/${t.evidence}` : null;
          const title = `${t.name}: ${t.result}`;
          if (ev) {
            return `<td><a class="cellbox ${ok ? "ok" : "bad"}" href="${href(ev)}" title="${esc(title)}" aria-label="${esc(title)}">${icon}${extras}<span class="peek"><img loading="lazy" src="${href(ev)}" alt=""></span></a>${trace ? `${trace}` : ""}</td>`;
          }
          return `<td><span class="cellbox ${ok ? "ok" : "bad"}" title="${esc(title)}" aria-label="${esc(title)}">${icon}${extras}</span>${trace ? `${trace}` : ""}</td>`;
        })
        .join("");
      return `<tr>${label}${cells}</tr>`;
    })
    .join("\n");
  return `<section class="sec" id="grid">${secHead("05", "Traceability", aside)}
<div class="grid-wrap"><table class="matrix"><thead><tr><th scope="col"></th>${head}</tr></thead><tbody>
${body}
</tbody></table></div>
</section>`;
}

function renderCards(model) {
  const nt = model.notTested.length
    ? model.notTested.map((n) => `<div class="nt">${n.number ? `<span class="tk">${esc(n.number)}</span>` : ""}<b>${esc(n.what)}</b> ${esc(n.reason)}</div>`).join("")
    : `<p class="none">Nothing is untested.</p>`;
  const pf = model.problems.length
    ? model.problems
        .map(
          (p) =>
            `<div class="pf"><div class="p">${p.number ? `<span class="tk">${esc(p.number)}</span>` : ""}${esc(p.problem)}</div><dl><dt>Cause</dt><dd>${esc(p.cause)}</dd><dt>Fix</dt><dd>${esc(p.fix)}</dd></dl><span class="commit">${esc(p.commit)}</span></div>`,
        )
        .join("")
    : `<p class="none">No problems were found along the way.</p>`;
  return `<section class="sec" id="cards">${secHead("06", "Gaps and fixes")}
<div class="two">
  <div><div class="col-h"><h3>Not tested</h3><span class="c">${model.notTested.length}</span></div><div class="stack">${nt}</div></div>
  <div><div class="col-h"><h3>Problems fixed</h3><span class="c">${model.problems.length}</span></div><div class="stack">${pf}</div></div>
</div>
</section>`;
}

function renderDetails(model) {
  // full test table
  const testRows = model.tests
    .map((t) => {
      const ev = t.evidence ? `<a href="${href(`${t.base}screenshots/${t.evidence}`)}">screenshot</a>` : "";
      const tr = t.trace ? ` <a href="${href(t.trace)}">trace</a>` : "";
      return `<tr><td>${esc(t.kind)}</td><td>${esc(t.name)}${t.flaky ? '<span class="tag">flaky</span>' : ""}</td><td>${esc(t.proves)}</td><td class="r-${t.result === "pass" ? "pass" : "fail"}">${esc(t.result)}</td><td>${ev}${tr}</td></tr>`;
    })
    .join("\n");
  const tests = `<table class="plain"><thead><tr><th>Kind</th><th>Test</th><th>Proves</th><th>Result</th><th>Evidence</th></tr></thead><tbody>${testRows}</tbody></table>`;

  // commands with exit codes
  const cmdBlocks = model.tickets
    .map((t) => {
      const rows = arr(t.report.commands)
        .map((c) => `<tr><td><code>${esc(c.command)}</code>${c.whole_suite ? ' <span class="whole">whole suite</span>' : ""}</td><td><span class="exit ${c.exit_code === 0 ? "" : "bad"}">exit ${esc(c.exit_code)}</span></td><td class="mono">${esc(c.commit)}</td></tr>`)
        .join("");
      return `${model.multi ? `<h4>${esc(t.number)} ${esc(t.report.title || "")}</h4>` : ""}<table class="plain"><thead><tr><th>Command</th><th>Exit</th><th>Commit</th></tr></thead><tbody>${rows}</tbody></table>`;
    })
    .join("");
  const cmdCount = model.tickets.reduce((n, t) => n + arr(t.report.commands).length, 0);

  // review rounds
  const roundItems = model.rounds
    .map((r) => {
      const f = arr(r.findings);
      return `<li>${r.number ? `<span class="mono">${esc(r.number)}</span> ` : ""}<b>${esc(r.round)}</b>${f.length ? `<ul>${f.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ": no findings"}</li>`;
    })
    .join("");
  const judgeLines = model.judges.map((j) => `<li>${model.multi ? esc(j.number) + " " : ""}<b>Judge round ${esc(j.round)}: ${esc(j.result)}</b>. ${esc(j.line)}</li>`).join("");
  const rounds = roundItems || judgeLines ? `<ol class="rounds">${roundItems}${judgeLines}</ol>` : `<p class="none">No review round yet.</p>`;

  // screenshots the grid does not already show
  const shown = new Set();
  for (const i of model.columns) {
    const t = model.tests[i];
    if (t.evidence) shown.add(`${t.base}${t.evidence}`);
  }
  const other = [];
  for (const t of model.tickets) {
    for (const s of arr(t.report.screenshots)) {
      if (!/^(invariant|exit)-/.test(String(s.file))) continue;
      const covered = arr(s.sizes).every((size) => shown.has(`${t.base}${s.file}-${size}.png`));
      if (!covered) other.push({ t, s });
    }
  }
  const gallery = other.length
    ? `<div class="gallery">${other
        .map(({ t, s }) => `<figure>${shotsHtml(t, s, s.claim || s.file)}<figcaption>${esc(s.claim || s.file)}</figcaption></figure>`)
        .join("")}</div>`
    : `<p class="none">The grid shows every invariant and exit screenshot.</p>`;

  // steps
  const stepItems = model.tickets
    .flatMap((t) => arr(t.report.steps).map((s) => `<li>${model.multi ? `<span class="mono">${esc(t.number)}</span> ` : ""}${esc(s.summary)}</li>`))
    .join("");

  const fold = (title, count, inner) =>
    `<details class="fold"><summary>${esc(title)}<span class="c">${esc(count)}</span></summary><div class="fold-body">${inner}</div></details>`;
  return `<section class="sec" id="details">${secHead("07", "Details")}
<div class="folds">
${fold("Full test table", `${model.tests.length} tests`, tests)}
${fold("Commands and exit codes", `${cmdCount} commands`, cmdBlocks)}
${fold("Review rounds", `${model.rounds.length} rounds`, rounds)}
${fold("Other screenshots", `${other.length}`, gallery)}
${fold("Steps built", `${model.steps}`, `<ol class="steplist">${stepItems}</ol>`)}
</div>
</section>`;
}

// ------------------------------------------------------------------ page

export function renderHtml(plan, tickets) {
  const model = buildModel(plan, tickets);
  const roles = collectRoles(model);
  const first = tickets[0];
  const heading = model.multi ? `Item ${basename(plan.item)}` : `${first.number} ${first.report.title || first.name}`;
  const v = VERDICTS[model.verdict];

  const nav = [
    ["storyboard", "Walkthrough"],
    ...(roles.length ? [["journeys", "Journeys"]] : []),
    ["changes", "Changes"],
    ["grid", "Traceability"],
    ["cards", "Gaps"],
    ["details", "Details"],
  ]
    .map(([id, label]) => `<a href="#${id}">${label}</a>`)
    .join("");
  const top = `<header class="top"><div class="wrap"><div class="top-id"><span class="dot" title="${esc(v ? v.label : "No verdict")}"></span><span class="num">${esc(model.multi ? "item" : first.number)}</span><span class="ttl">${esc(model.multi ? basename(plan.item) : first.report.title || first.name)}</span></div><nav aria-label="Sections">${nav}</nav></div></header>`;

  const body = `${top}
<main class="wrap">
${renderBanner(model, plan)}
${renderTiles(model)}
${renderStoryboard(model, roles)}
${renderJourneys(model, roles)}
${renderChanges(model)}
${renderGrid(model)}
${renderCards(model)}
${renderDetails(model)}
<p class="foot">Rendered from validation/report.json${model.multi ? " of each ticket" : ""}.</p>
</main>`;

  const template = readFileSync(join(assetDir, "template.html"), "utf8");
  const css = readFileSync(join(assetDir, "report.css"), "utf8");
  const script = readFileSync(join(assetDir, "client.js"), "utf8");
  const fill = { title: `${esc(heading)}: validation report`, verdict: model.verdict || "none", css, script, body };
  return template.replace(/\{\{(title|verdict|css|script|body)\}\}/g, (_, key) => fill[key]);
}

// Renders the report for a ticket folder. Returns { due: false, reason }
// when none is due, else { due: true, path, plan }.
export function renderReportFor(ticketFolder) {
  const plan = planReport(ticketFolder);
  if (!plan.due) return plan;
  const tickets = loadTickets(plan);
  if (!tickets.some((t) => t.current)) {
    throw new Error("validation/report.json is missing.");
  }
  mkdirSync(plan.outDir, { recursive: true });
  writeFileSync(plan.htmlPath, renderHtml(plan, tickets));
  return { ...plan, path: plan.htmlPath };
}

function main() {
  const ticketFolder = process.argv[2];
  if (!ticketFolder) {
    console.error("usage: node build/scripts/render-report.mjs <ticket-folder>");
    process.exit(2);
  }
  let result;
  try {
    result = renderReportFor(ticketFolder);
  } catch (err) {
    console.error(`render-report: ${err.message}`);
    process.exit(1);
  }
  if (!result.due) {
    console.log(`No rendered report is due: ${result.reason}.`);
    return;
  }
  console.log(result.path);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
