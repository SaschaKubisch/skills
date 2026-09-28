// lib/workflow.mjs — shared helpers for the workflow config scripts.
// Node ESM, no dependencies.

import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

// The defaults from the shipped workflow.yml. A project's file only needs
// to name the groups and keys it changes; every other key takes the
// value here.
export const defaultConfig = {
  models: { builder: "sonnet", judge: "opus", recheck: "sonnet" },
  review: { evidence: "script", evidence_findings: "recheck", reuse_suite_run: true },
  parallel: { tickets: 1, e2e_workers: 1 },
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

// Loads the project's workflow config: every default, overridden one
// level deep by whatever .claude/workflow.yml under the project root
// names. A group the project file sets (e.g. `review:`) keeps every key
// it does not mention at its default; a missing file is not an error —
// it means every default applies.
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
  return config;
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
