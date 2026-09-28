#!/usr/bin/env node
// test/workflow-lib.test.mjs — unit tests for build/scripts/lib/workflow.mjs's
// flat YAML reader. Run by test/run.sh; exits 1 on any failure.

import { parseYaml } from "../build/scripts/lib/workflow.mjs";

let fail = 0;
function check(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    fail = 1;
  }
}

// An unquoted scalar parses as written.
{
  const config = parseYaml(`evidence_check: judge\n`);
  check(
    config.evidence_check === "judge",
    `an unquoted scalar should parse unchanged; got ${JSON.stringify(config.evidence_check)}`,
  );
}

// A double-quoted scalar has its quotes stripped.
{
  const config = parseYaml(`evidence_check: "judge"\n`);
  check(
    config.evidence_check === "judge",
    `a double-quoted scalar should have its quotes stripped; got ${JSON.stringify(config.evidence_check)}`,
  );
}

// A single-quoted scalar has its quotes stripped.
{
  const config = parseYaml(`evidence_check: 'judge'\n`);
  check(
    config.evidence_check === "judge",
    `a single-quoted scalar should have its quotes stripped; got ${JSON.stringify(config.evidence_check)}`,
  );
}

// Quoted values inside the one inline map have their quotes stripped too.
{
  const config = parseYaml(`models: { builder: "opus", judge: 'sonnet' }\n`);
  check(
    JSON.stringify(config.models) === JSON.stringify({ builder: "opus", judge: "sonnet" }),
    `quoted map values should have their quotes stripped; got ${JSON.stringify(config.models)}`,
  );
}

// Unquoted values inside the inline map still parse as before.
{
  const config = parseYaml(`models: { builder: sonnet, judge: opus }\n`);
  check(
    JSON.stringify(config.models) === JSON.stringify({ builder: "sonnet", judge: "opus" }),
    `unquoted map values should parse unchanged; got ${JSON.stringify(config.models)}`,
  );
}

if (fail === 0) {
  console.log(
    "PASS: parseYaml strips matching quotes from scalar values and inline-map values, and leaves unquoted forms unchanged.",
  );
}
process.exit(fail);
