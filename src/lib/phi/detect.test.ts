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
