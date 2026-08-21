import assert from "node:assert/strict";
import test from "node:test";
import { applyManualRedaction, findLikeThis } from "./manual.ts";
import { supplementWithLocalPhi } from "./detect.ts";
import { redactText } from "./redact.ts";
import type { PhiSpan } from "./types.ts";

test("findLikeThis returns every case-insensitive occurrence", () => {
  const hits = findLikeThis("Jane saw jane. JANE stayed.", "Jane");
  assert.equal(hits.length, 3);
});

test("applyManualRedaction this-occurrence only marks one span", () => {
  const text = "Alice called Alice.";
  const spans = applyManualRedaction({
    text,
    spans: [],
    range: { start: 0, end: 5, text: "Alice" },
    category: "name",
    others: false,
  });
  const accepted = spans.filter((span) => span.accepted && span.category === "name");
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0]?.start, 0);
});

test("applyManualRedaction others like this marks every match", () => {
  const text = "Alice called Alice from the desk.";
  const spans = applyManualRedaction({
    text,
    spans: [],
    range: { start: 0, end: 5, text: "Alice" },
    category: "name",
    others: true,
  });
  const accepted = spans.filter((span) => span.accepted && span.category === "name");
  assert.equal(accepted.length, 2);
  const { redacted } = redactText(text, spans, "relative");
  assert.equal(redacted.includes("Alice"), false);
  assert.match(redacted, /\[NAME\] called \[NAME\]/);
});

test("OpenMed spans win overlapping regex/label spans", () => {
  const text = "Patient: ALICE SMITH MRN: 15938472";
  const openMed: PhiSpan[] = [
    {
      id: "om-1",
      start: text.indexOf("ALICE SMITH"),
      end: text.indexOf("ALICE SMITH") + "ALICE SMITH".length,
      text: "ALICE SMITH",
      category: "name",
      source: "openmed",
      confidence: 0.96,
      accepted: true,
    },
  ];
  const merged = supplementWithLocalPhi(text, openMed);
  const name = merged.find((span) => span.category === "name" && span.text.includes("ALICE"));
  assert.equal(name?.source, "openmed");
  const mrn = merged.find((span) => span.category === "mrn");
  assert.equal(mrn?.text, "15938472");
});
