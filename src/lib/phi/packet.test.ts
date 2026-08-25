import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalizePayload,
  dropAdministrativeNoise,
  prepareModelInput,
} from "./packet.ts";

test("dropAdministrativeNoise removes page banners and SDOH blocks", () => {
  const text = [
    "--- Page 1 ---",
    "Housing Insecurity: no",
    "Food Needs: no",
    "Medications",
    "Metformin 1000 mg",
    "Progress Notes",
    "PVC burden 12%.",
  ].join("\n");
  const cleaned = dropAdministrativeNoise(text);
  assert.doesNotMatch(cleaned, /Housing Insecurity/);
  assert.doesNotMatch(cleaned, /--- Page/);
  assert.match(cleaned, /Medications/);
  assert.match(cleaned, /PVC burden 12%\./);
});

test("prepareModelInput keeps head and tail when over the limit", () => {
  const head = "Allergies\nPenicillin\n";
  const middle = "x".repeat(2000);
  const tail = "\nProgress Notes\nOffice Visit 5/13/2026 PVC burden 12%.\n";
  const packed = prepareModelInput(head + middle + tail, 400);
  assert.match(packed, /Allergies/);
  assert.match(packed, /Progress Notes/);
  assert.match(packed, /PVC burden/);
  assert.match(packed, /omitted to preserve visit notes/);
  assert.ok(packed.length <= 400);
});

test("canonicalizePayload normalizes and bounds the exact transmitted text", () => {
  const result = canonicalizePayload(`  Head\r\n${"x".repeat(240)}\r\nTail  `, 120);

  assert.equal(result.text, result.text.replace(/\r/g, ""));
  assert.ok(result.text.length <= 120);
  assert.equal(result.characterCount, result.text.length);
  assert.equal(result.truncated, true);
  assert.match(result.text, /middle administrative pages omitted to preserve visit notes/);
});
