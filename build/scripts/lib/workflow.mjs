// lib/workflow.mjs — shared helpers for the workflow config scripts.
// Node ESM, no dependencies.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname, basename, resolve } from "node:path";

// The defaults from the shipped workflow.yml. A project's file only needs
// to name the groups and keys it changes; every other key takes the
// value here.
export const defaultConfig = {
  models: { builder: "sonnet", judge: "opus", recheck: "sonnet" },
  review: { evidence: "script", evidence_findings: "recheck", reuse_suite_run: true },
  parallel: { tickets: 1, e2e_workers: 1 },
  validation: {
    report: true,
    report_scope: "ticket",
    report_pdf: false,
    video_walkthrough: false,
    video_scope: "ticket",
    video_commit: true,
    video_max_mb: 10,
    before_after: false,
    traces: true,
    changed_line_coverage: false,
  },
};

// Reads the grouped YAML this project's workflow.yml uses: comments after
// "#"; a top-level `key: value` scalar; and one level of block groups —
// a top-level line `name:` with no value opens a group, and the lines
// that follow it, indented by spaces (`  key: value`), belong to that
// group until the next non-indented line. A value is optionally wrapped
// in one matching pair of single or double quotes (stripped on read).
// Not a general YAML reader — it only needs to read the shape
// workflow.yml is written in.
export function parseYaml(text) {
  const config = {};
  let group = null;
  for (const rawLine of text.split("\n")) {
    let line = rawLine;
    const hash = line.indexOf("#");
    if (hash !== -1) line = line.slice(0, hash);
    if (!line.trim()) continue;

    const indented = /^\s/.test(line);
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (!key) continue;

    if (!indented) {
      if (value) {
        group = null;
        config[key] = parseScalar(value);
      } else {
        group = {};
        config[key] = group;
      }
    } else if (group) {
      group[key] = parseScalar(value);
    }
  }
  return config;
}

// Strips one matching pair of surrounding single or double quotes, if
// there is one; otherwise returns the string unchanged.
function stripQuotes(s) {
  if (
    s.length >= 2 &&
    ((s[0] === '"' && s[s.length - 1] === '"') ||
      (s[0] === "'" && s[s.length - 1] === "'"))
  ) {
    return s.slice(1, -1);
  }
  return s;
}

function parseScalar(value) {
  const scalar = stripQuotes(value);
  if (scalar === "true") return true;
  if (scalar === "false") return false;
  if (/^-?\d+$/.test(scalar)) return Number(scalar);
  return scalar;
}

// Walks up from `startPath` looking for the project root: the nearest
// ancestor holding CLAUDE.md, AGENTS.md or a .git entry. Throws when none
// is found before the filesystem root.
export function findProjectRoot(startPath) {
  let dir = resolve(startPath);
  while (true) {
    if (
      existsSync(join(dir, "CLAUDE.md")) ||
      existsSync(join(dir, "AGENTS.md")) ||
      existsSync(join(dir, ".git"))
    ) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(
        `cannot find the project root above ${startPath} (no CLAUDE.md, AGENTS.md or .git)`,
      );
    }
    dir = parent;
  }
}

// Checks the `validation` group's values and throws an Error naming the
// key and the values it allows when one is wrong: the on/off keys must be
// true or false, `report_scope` and `video_scope` must be `ticket` or
// `item`, `video_max_mb` must be a positive whole number. Returns the config unchanged when
// every value is valid, so a valid file behaves as before.
export function validate(config) {
  const group = config.validation;
  if (typeof group !== "object" || group === null) {
    throw new Error(
      `workflow config: "validation" must be a group of keys, not ${JSON.stringify(group)}`,
    );
  }
  for (const key of [
    "report",
    "report_pdf",
    "video_walkthrough",
    "video_commit",
    "before_after",
    "traces",
    "changed_line_coverage",
  ]) {
    if (typeof group[key] !== "boolean") {
      throw new Error(
        `workflow config: validation.${key} must be true or false; got ${JSON.stringify(group[key])}`,
      );
    }
  }
  for (const key of ["report_scope", "video_scope"]) {
    if (group[key] !== "ticket" && group[key] !== "item") {
      throw new Error(
        `workflow config: validation.${key} must be ticket or item; got ${JSON.stringify(group[key])}`,
      );
    }
  }
  if (!Number.isInteger(group.video_max_mb) || group.video_max_mb <= 0) {
    throw new Error(
      `workflow config: validation.video_max_mb must be a positive whole number; got ${JSON.stringify(group.video_max_mb)}`,
    );
  }
  return config;
}

// Loads the project's workflow config: every default, overridden one
// level deep by whatever .claude/workflow.yml under the project root
// names. A group the project file sets (e.g. `review:`) keeps every key
// it does not mention at its default; a missing file is not an error —
// it means every default applies. Throws, naming the key, when a
// `validation` value is not one of the allowed values (see validate).
export function loadConfig(projectRoot) {
  const path = join(projectRoot, ".claude", "workflow.yml");
  const config = {};
  for (const [key, value] of Object.entries(defaultConfig)) {
    config[key] = typeof value === "object" && value !== null ? { ...value } : value;
  }
  if (existsSync(path)) {
    const overrides = parseYaml(readFileSync(path, "utf8"));
    for (const [key, value] of Object.entries(overrides)) {
      if (
        typeof value === "object" &&
        value !== null &&
        typeof config[key] === "object" &&
        config[key] !== null
      ) {
        Object.assign(config[key], value);
      } else {
        config[key] = value;
      }
    }
  }
  return validate(config);
}

// The item a ticket belongs to: its folder is
// `items/<item>/tickets/<column>/<slug>`, <column> one of backlog,
// in-progress, done. Returns the item's folder, or null for a ticket
// folder that sits anywhere else (it belongs to no item).
export function itemFolder(ticketFolder) {
  const column = dirname(resolve(ticketFolder));
  const tickets = dirname(column);
  if (
    !["backlog", "in-progress", "done"].includes(basename(column)) ||
    basename(tickets) !== "tickets"
  ) {
    return null;
  }
  return dirname(tickets);
}

// Whether this ticket is the one that empties its item's backlog: no other
// ticket of its item sits in `backlog/` or `in-progress/`. A ticket that
// belongs to no item has no other ticket and counts as the last one.
export function emptiesItemBacklog(ticketFolder) {
  const item = itemFolder(ticketFolder);
  if (!item) return true;
  for (const open of ["backlog", "in-progress"]) {
    const dir = join(item, "tickets", open);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== basename(resolve(ticketFolder))) return false;
    }
  }
  return true;
}

// Whether a report or video whose scope key is `scope` ("ticket" or
// "item", `validation.report_scope` or `validation.video_scope`) is due
// for this ticket: always for `ticket`, only for the ticket that empties
// its item's backlog for `item`.
export function inScope(scope, ticketFolder) {
  return scope === "ticket" || emptiesItemBacklog(ticketFolder);
}

// Where the rendered report, its PDF and the video live for a scope:
// scope `ticket` in the ticket's own `validation/`; scope `item` in the
// item's root `validation/`, `items/<item>/validation/`. A ticket that
// belongs to no item keeps everything in its own `validation/`.
export function outputDir(scope, ticketFolder) {
  const item = itemFolder(ticketFolder);
  return scope === "item" && item ? join(item, "validation") : join(ticketFolder, "validation");
}

// The other place the same outputs could have been put by mistake, or
// null when the ticket belongs to no item and there is only one place.
export function otherOutputDir(scope, ticketFolder) {
  if (!itemFolder(ticketFolder)) return null;
  return outputDir(scope === "item" ? "ticket" : "item", ticketFolder);
}

// Reads the project's `## Conventions` section from CLAUDE.md (or
// AGENTS.md for a Codex mirror) as a map of bullet key to value, the way
// build, judge and write-tickets all read it: `- key: value` lines under
// the heading, up to the next heading or the end of the file.
export function readConventions(projectRoot) {
  const path = existsSync(join(projectRoot, "CLAUDE.md"))
    ? join(projectRoot, "CLAUDE.md")
    : join(projectRoot, "AGENTS.md");
  if (!existsSync(path)) return {};
  const lines = readFileSync(path, "utf8").split("\n");
  const conventions = {};
  let inSection = false;
  for (const line of lines) {
    if (/^##\s+Conventions\s*$/.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection && /^##\s+/.test(line)) break;
    if (!inSection) continue;
    const m = /^-\s*([^:]+):\s*(.*)$/.exec(line);
    if (m) conventions[m[1].trim()] = m[2].trim();
  }
  return conventions;
}

// The project's test scope: "feature" (the default when the key is absent
// or not recognised) or "full". See write-tickets/SKILL.md's Conventions.
export function testScope(conventions) {
  const value = String(conventions["test scope"] || "").trim().toLowerCase();
  return value === "full" ? "full" : "feature";
}

// The sizes a project's `screenshots` Conventions line declares, in the
// order written, e.g. "Playwright, 1280x800 and 390x844, saved per test"
// -> ["1280x800", "390x844"]. The first size listed is the desktop size.
export function screenshotSizes(conventions) {
  const line = conventions["screenshots"] || "";
  return line.match(/\d+x\d+/g) || [];
}

// Reads one ticket.md: the count of commands under its fenced Exit
// conditions block, and the set of invariant identifiers listed under
// its "## Invariants this touches" section.
export function readTicket(ticketFolder) {
  const text = readFileSync(join(ticketFolder, "ticket.md"), "utf8");
  return {
    text,
    exitConditionCount: countExitConditions(text),
    invariantIds: touchedInvariantIds(text),
  };
}

function sectionBody(text, heading) {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l.trim() === heading);
  if (start === -1) return "";
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^##\s+/.test(l));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}

function countExitConditions(text) {
  const body = sectionBody(text, "## Exit conditions");
  const fenceStart = body.indexOf("```");
  if (fenceStart === -1) return 0;
  const fenceEnd = body.indexOf("```", fenceStart + 3);
  const inner = fenceEnd === -1 ? body.slice(fenceStart + 3) : body.slice(fenceStart + 3, fenceEnd);
  return inner
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0).length;
}

// An invariant identifier, normalized so "D1", "d1" and "01" (when it is
// purely numeric) all compare equal: lowercased, and a purely numeric id
// has its leading zeros stripped.
export function normalizeInvariantId(raw) {
  const lower = raw.toLowerCase();
  return /^\d+$/.test(lower) ? String(Number(lower)) : lower;
}

// The invariant identifiers this ticket touches: the union of the
// bullets under "## Invariants this touches" and every id named in a
// step's `proves:` clause, since a step may prove a design invariant
// ("proves: D1, D4 of specs/design.md") that section never lists. A
// letter-number token (D1, D4) in a proves clause always counts; a bare
// number only counts there next to the word "invariant"/"invariants"
// ("proves: invariants 6, 11, 14") — a bare number alone is as likely a
// spec line number ("proves: settled lines 6, 22") as an invariant.
function touchedInvariantIds(text) {
  const ids = new Set();

  const section = sectionBody(text, "## Invariants this touches");
  for (const line of section.split("\n")) {
    const m = /^-\s*([A-Za-z]?\d+)[.:,]/.exec(line.trim());
    if (m) ids.add(normalizeInvariantId(m[1]));
  }

  const steps = sectionBody(text, "## Steps");
  for (const line of steps.split("\n")) {
    const m = /proves:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const clause = m[1];
    for (const idm of clause.matchAll(/\b([A-Za-z]\d+)\b/g)) {
      ids.add(normalizeInvariantId(idm[1]));
    }
    const invariantWord = /invariants?\s+([\d,\s]*\d)/i.exec(clause);
    if (invariantWord) {
      for (const n of invariantWord[1].match(/\d+/g) || []) {
        ids.add(normalizeInvariantId(n));
      }
    }
  }

  return ids;
}

// Every ticket folder of an item, across backlog/, in-progress/ and done/,
// as { folder, column } sorted by folder name (the ticket number comes
// first in it, so this is ticket order). Used to merge an item's report.
export function itemTicketFolders(item) {
  const found = [];
  for (const column of ["backlog", "in-progress", "done"]) {
    const dir = join(item, "tickets", column);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) found.push({ folder: join(dir, entry.name), column });
    }
  }
  return found.sort((a, b) => basename(a.folder).localeCompare(basename(b.folder)));
}

// The invariant identifiers a test's `proves` clause names, normalized:
// a letter-number token (D1) always counts; a bare number counts next to
// the word "invariant"/"invariants" ("invariants 6, 11"). The same rule
// as for a step's proves clause in a ticket.
export function clauseInvariantIds(clause) {
  const ids = new Set();
  const text = String(clause ?? "");
  for (const m of text.matchAll(/\b([A-Za-z]\d+)\b/g)) ids.add(normalizeInvariantId(m[1]));
  const word = /invariants?\s+([\d,\s]*\d)/i.exec(text);
  if (word) for (const n of word[1].match(/\d+/g) || []) ids.add(normalizeInvariantId(n));
  return ids;
}

// A normalized invariant id as the report shows it: "4" stays "4", "d2"
// becomes "D2".
export function invariantLabel(id) {
  return /^\d+$/.test(id) ? id : id.toUpperCase();
}

// The one-line titles of the invariants a ticket lists under "## Invariants
// this touches", as a map of normalized id to the bullet's text with its
// number and its trailing explanation cut off ("9. Orders never go
// negative, checked by exit condition 4." -> "Orders never go negative").
export function invariantTitles(ticketText) {
  const titles = new Map();
  const lines = sectionBody(ticketText, "## Invariants this touches").split("\n");
  for (const line of lines) {
    const m = /^-\s*([A-Za-z]?\d+)[.:,]\s*(.*)$/.exec(line.trim());
    if (!m) continue;
    const title = m[2].split(/,\s+(?:checked|proved|proven|see)\b/i)[0].replace(/[.\s]+$/, "");
    if (title) titles.set(normalizeInvariantId(m[1]), title);
  }
  return titles;
}
