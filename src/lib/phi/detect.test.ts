import assert from "node:assert/strict";
import test from "node:test";
import { detectLocalPhi } from "./detect.ts";
import { redactText } from "./redact.ts";
import { SAMPLE_CHART } from "./sample-chart.ts";
import { EMPTY_SEED } from "./types.ts";

test("sample MyChart dump redacts names, MRN, DOB, phone, SSN, email", () => {
  const spans = detectLocalPhi(SAMPLE_CHART, {
    ...EMPTY_SEED,
    fullName: "Jane Quincy Testpatient",
    mrn: "15938472",
    dob: "01/15/1970",
  });
  const { redacted } = redactText(SAMPLE_CHART, spans, "relative");
  assert.doesNotMatch(redacted, /TESTPATIENT/);
  assert.doesNotMatch(redacted, /Jane Q/);
  assert.doesNotMatch(redacted, /15938472/);
  assert.doesNotMatch(redacted, /01\/15\/1970/);
  assert.doesNotMatch(redacted, /555-0142/);
  assert.doesNotMatch(redacted, /123-45-6789/);
  assert.doesNotMatch(redacted, /jane\.q\.testpatient@example\.com/i);
  assert.match(redacted, /HbA1c/);
  assert.match(redacted, /5\.6/);
  assert.match(redacted, /Crohn's disease/);
  assert.match(redacted, /Metformin/);
});

test("does not redact Crohn's as a person name", () => {
  const spans = detectLocalPhi("Assessment: Crohn's disease is quiescent.", EMPTY_SEED);
  assert.equal(
    spans.some((span) => /crohn/i.test(span.text) && span.accepted),
    false,
  );
});

test("labeled fields on the sample chart are found without a seed", () => {
  const spans = detectLocalPhi(SAMPLE_CHART, EMPTY_SEED);
  const accepted = spans.filter((span) => span.accepted).map((span) => `${span.category}:${span.text}`);
  assert.ok(accepted.some((row) => row.includes("mrn:15938472")));
  assert.ok(accepted.some((row) => row.includes("dob:01/15/1970")));
  assert.ok(accepted.some((row) => row.includes("ssn:123-45-6789")));
  assert.ok(accepted.some((row) => row.toLowerCase().includes("email:jane.q.testpatient@example.com")));
  assert.ok(accepted.some((row) => row.includes("phone:") && row.includes("555-0142")));
  const { redacted } = redactText(SAMPLE_CHART, spans, "relative");
  assert.match(redacted, /HbA1c/);
  assert.match(redacted, /Crohn's disease/);
});

test("relative date mode uses Day 0 / Day +N and keeps clinical values", () => {
  const text = "Collected: 03/12/2026\nFollow-up: 03/19/2026\nHbA1c 5.6";
  const spans = detectLocalPhi(text, EMPTY_SEED);
  const { redacted } = redactText(text, spans, "relative");
  assert.match(redacted, /Day 0/);
  assert.match(redacted, /Day \+7/);
  assert.match(redacted, /HbA1c 5\.6/);
});

test("year date mode keeps the calendar year", () => {
  const text = "Collected: 03/12/2026";
  const spans = detectLocalPhi(text, EMPTY_SEED);
  const { redacted } = redactText(text, spans, "year");
  assert.match(redacted, /2026/);
  assert.doesNotMatch(redacted, /03\/12\/2026/);
});

test("city-state-ZIP lines are redacted as addresses", () => {
  const text = "PHILADELPHIA PA 19140\nBENSALEM, PA 19020\nHbA1c 5.6";
  const spans = detectLocalPhi(text, EMPTY_SEED);
  const { redacted } = redactText(text, spans, "relative");
  assert.doesNotMatch(redacted, /PHILADELPHIA/);
  assert.doesNotMatch(redacted, /BENSALEM/);
  assert.doesNotMatch(redacted, /19140/);
  assert.match(redacted, /HbA1c 5\.6/);
});

test("keep dates leaves the original date text", () => {
  const text = "Collected: 03/12/2026";
  const spans = detectLocalPhi(text, EMPTY_SEED);
  const { redacted } = redactText(text, spans, "keep");
  assert.match(redacted, /03\/12\/2026/);
});
