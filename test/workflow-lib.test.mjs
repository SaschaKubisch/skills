#!/usr/bin/env node
// test/workflow-lib.test.mjs — unit tests for build/scripts/lib/workflow.mjs's
// grouped YAML reader and loadConfig's merge. Run by test/run.sh; exits 1
// on any failure.

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseYaml, loadConfig, defaultConfig } from "../build/scripts/lib/workflow.mjs";

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

if (fail === 0) {
  console.log(
    "PASS: parseYaml reads groups into nested objects, ignores comments and blank lines, strips quotes, types booleans and integers, and loadConfig merges a project's partial group override with every other default kept.",
  );
}
process.exit(fail);
