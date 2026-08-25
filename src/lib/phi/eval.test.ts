import assert from "node:assert/strict";
import test from "node:test";
import { evaluatePhiCorpus, PHI_EVAL_FIXTURES } from "./eval-fixtures.ts";

test("synthetic PHI corpus has no seeded leakage or protected clinical false positives", () => {
  const report = evaluatePhiCorpus();
  assert.equal(report.schema, "harbor-phi-eval-v1");
  assert.equal(report.engine, "deterministic");
  assert.equal(report.passed, true);
  assert.equal(report.fixtureCount, PHI_EVAL_FIXTURES.length);
  assert.equal(report.missingCount, 0);
  assert.equal(report.falsePositiveCount, 0);
  assert.equal(report.passedFixtureCount, report.fixtureCount);
});

test("synthetic evaluation report contains metrics, not source text", () => {
  const report = evaluatePhiCorpus();
  const serialized = JSON.stringify(report);
  for (const fixture of PHI_EVAL_FIXTURES) {
    assert.doesNotMatch(serialized, /SAMPLEPERSON|MRN-2048|avery\.sample@example\.test/);
    assert.equal(serialized.includes(fixture.text), false);
  }
  assert.ok(report.requiredCount >= 10);
  assert.ok(report.matchedCount >= 10);
});
