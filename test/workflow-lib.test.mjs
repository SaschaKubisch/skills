#!/usr/bin/env node
// test/workflow-lib.test.mjs — unit tests for build/scripts/lib/workflow.mjs's
// grouped YAML reader and loadConfig's merge. Run by test/run.sh; exits 1
// on any failure.

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { parseYaml, loadConfig, validate, defaultConfig } from "../build/scripts/lib/workflow.mjs";

let fail = 0;
function check(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    fail = 1;
  }
}

// A top-level `name:` line with no value opens a group; its indented
// lines parse into a nested object.
{
  const config = parseYaml(`review:\n  evidence: judge\n  reuse_suite_run: false\n`);
  check(
    JSON.stringify(config.review) === JSON.stringify({ evidence: "judge", reuse_suite_run: false }),
    `a group should parse into a nested object; got ${JSON.stringify(config.review)}`,
  );
}

// Comments and blank lines are ignored, inside and outside a group.
{
  const config = parseYaml(
    `# a leading comment\n\nreview:\n  # a group comment\n\n  evidence: judge   # trailing comment\n`,
  );
  check(
    config.review && config.review.evidence === "judge",
    `comments and blank lines should be ignored; got ${JSON.stringify(config.review)}`,
  );
}

// A quoted scalar, inside a group, has its quotes stripped.
{
  const config = parseYaml(`models:\n  builder: "opus"\n  judge: 'sonnet'\n`);
  check(
    JSON.stringify(config.models) === JSON.stringify({ builder: "opus", judge: "sonnet" }),
    `quoted values should have their quotes stripped; got ${JSON.stringify(config.models)}`,
  );
}

// Booleans and integers are typed, not left as strings.
{
  const config = parseYaml(`parallel:\n  tickets: 1\n  e2e_workers: 4\nreview:\n  reuse_suite_run: true\n`);
  check(
    config.parallel.tickets === 1 && config.parallel.e2e_workers === 4,
    `integers should be typed as numbers; got ${JSON.stringify(config.parallel)}`,
  );
  check(
    config.review.reuse_suite_run === true,
    `a boolean should be typed, not the string "true"; got ${JSON.stringify(config.review.reuse_suite_run)}`,
  );
}

// A top-level scalar (no group) still parses on its own.
{
  const config = parseYaml(`standalone: value\n`);
  check(
    config.standalone === "value",
    `a top-level scalar outside any group should still parse; got ${JSON.stringify(config.standalone)}`,
  );
}

// loadConfig: a project file that sets only one key of one group keeps
// every other key of that group, and every other group, at its default.
{
  const projectRoot = mkdtempSync(join(tmpdir(), "workflow-lib-test-"));
  try {
    mkdirSync(join(projectRoot, ".claude"), { recursive: true });
    writeFileSync(join(projectRoot, ".claude", "workflow.yml"), `review:\n  evidence: judge\n`);
    const config = loadConfig(projectRoot);
    check(
      config.review.evidence === "judge",
      `loadConfig should apply the project's override; got ${JSON.stringify(config.review)}`,
    );
    check(
      config.review.evidence_findings === defaultConfig.review.evidence_findings &&
        config.review.reuse_suite_run === defaultConfig.review.reuse_suite_run,
      `a partial group override should keep the group's other defaults; got ${JSON.stringify(config.review)}`,
    );
    check(
      JSON.stringify(config.models) === JSON.stringify(defaultConfig.models) &&
        JSON.stringify(config.parallel) === JSON.stringify(defaultConfig.parallel),
      `a partial override of one group should leave every other group at its default; got models=${JSON.stringify(
        config.models,
      )} parallel=${JSON.stringify(config.parallel)}`,
    );
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
}

// loadConfig: no project workflow.yml at all means every default applies.
{
  const projectRoot = mkdtempSync(join(tmpdir(), "workflow-lib-test-"));
  try {
    const config = loadConfig(projectRoot);
    check(
      JSON.stringify(config) === JSON.stringify(defaultConfig),
      `loadConfig with no project file should return the defaults unchanged; got ${JSON.stringify(config)}`,
    );
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
}

// loadConfig on a project file: returns the config, or the error message
// loadConfig threw.
function loadWith(yaml) {
  const projectRoot = mkdtempSync(join(tmpdir(), "workflow-lib-test-"));
  try {
    mkdirSync(join(projectRoot, ".claude"), { recursive: true });
    writeFileSync(join(projectRoot, ".claude", "workflow.yml"), yaml);
    try {
      return { config: loadConfig(projectRoot) };
    } catch (e) {
      return { error: e.message };
    }
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
}

// validation: a project file that leaves the group out gets every default.
{
  const { config, error } = loadWith(`models:\n  builder: opus\n`);
  check(!error, `a file without a validation group should load; got ${error}`);
  check(
    config && JSON.stringify(config.validation) === JSON.stringify(defaultConfig.validation),
    `a missing validation group should take every default; got ${JSON.stringify(config && config.validation)}`,
  );
}

// validation: a partial group keeps the other keys at their defaults.
{
  const { config, error } = loadWith(`validation:\n  report: false\n  report_scope: item\n  video_walkthrough: true\n  video_max_mb: 25\n`);
  check(!error, `a partial validation group should load; got ${error}`);
  check(
    config &&
      JSON.stringify(config.validation) ===
        JSON.stringify({ ...defaultConfig.validation, report: false, report_scope: "item", video_walkthrough: true, video_max_mb: 25 }),
    `a partial validation group should fill the missing keys with defaults; got ${JSON.stringify(
      config && config.validation,
    )}`,
  );
}

// validation: every invalid value is refused, and the error names the key.
{
  const bad = {
    report: "no",
    report_scope: "all",
    report_pdf: "yes",
    video_walkthrough: 1,
    video_scope: "ticket-and-item",
    video_commit: "false-ish",
    video_max_mb: 0,
    before_after: "maybe",
    traces: 2,
    changed_line_coverage: "on",
  };
  for (const [key, value] of Object.entries(bad)) {
    const { error } = loadWith(`validation:\n  ${key}: ${value}\n`);
    check(
      error && error.includes(`validation.${key}`),
      `validation.${key}: ${value} should be refused with the key named; got ${error}`,
    );
  }
  for (const value of ["-5", "2.5", "big"]) {
    const { error } = loadWith(`validation:\n  video_max_mb: ${value}\n`);
    check(
      error && error.includes("validation.video_max_mb") && error.includes("positive whole number"),
      `validation.video_max_mb: ${value} should be refused, naming the allowed values; got ${error}`,
    );
  }
  for (const [key, allowed] of [["report_scope", "ticket or item"], ["video_scope", "ticket, item or app"]]) {
    const { error } = loadWith(`validation:\n  ${key}: both\n`);
    check(
      error && error.includes(`validation.${key}`) && error.includes(allowed),
      `a bad ${key} should name the key and the allowed values; got ${error}`,
    );
  }
  // `app` is a video scope only
  {
    const { error } = loadWith(`validation:\n  report_scope: app\n`);
    check(error && error.includes("validation.report_scope") && error.includes("ticket or item"), `report_scope: app should be refused; got ${error}`);
    const ok = loadWith(`validation:\n  video_scope: app\n`);
    check(!ok.error, `video_scope: app should be accepted; got ${ok.error}`);
  }
  const { error: groupError } = loadWith(`validation: on\n`);
  check(
    groupError && groupError.includes("validation"),
    `validation given as a plain value should be refused; got ${groupError}`,
  );
}

// validate on the defaults returns the config it was given.
{
  check(validate(defaultConfig) === defaultConfig, "validate should accept the defaults and return the config");
}

// The shipped workflow.yml parses to exactly the defaults.
{
  const shipped = join(dirname(fileURLToPath(import.meta.url)), "..", "workflow.yml");
  const parsed = parseYaml(readFileSync(shipped, "utf8"));
  check(
    JSON.stringify(parsed) === JSON.stringify(defaultConfig),
    `the shipped workflow.yml should parse to exactly the defaults; got ${JSON.stringify(parsed)}`,
  );
}

if (fail === 0) {
  console.log(
    "PASS: parseYaml reads groups into nested objects, ignores comments and blank lines, strips quotes, types booleans and integers, loadConfig merges a project's partial group override with every other default kept, the validation group fills its defaults and refuses a bad value naming the key, and the shipped workflow.yml parses to exactly the defaults.",
  );
}
process.exit(fail);
