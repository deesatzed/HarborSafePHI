import assert from "node:assert/strict";
import test from "node:test";
import {
  formatExtractorCompare,
  reconstructPageText,
  scoreExtract,
  snapshotExtractors,
  type PdfTextSpan,
} from "./pdf-text.ts";

function span(str: string, x: number, y: number, width: number, extra: Partial<PdfTextSpan> = {}): PdfTextSpan {
  return { str, x, y, width, height: 10, ...extra };
}

const CHART_ITEMS: PdfTextSpan[] = [
  span("Patient:", 36, 700, 48),
  span("John", 92, 700, 26),
  span("Smith", 126, 700, 32),
  span("Philadelph", 36, 680, 58),
  span("ia", 94, 680, 12),
  span("1", 36, 660, 6),
  span("N", 50, 660, 8),
  span("BROAD", 66, 660, 40),
  span("ST", 114, 660, 16),
  span("Progress Notes", 36, 600, 90, { hasEOL: true }),
  span("PVC burden 12%.", 36, 580, 88, { hasEOL: true }),
];

test("layout inserts X-gap spaces and does not split mid-word glyphs", () => {
  const text = reconstructPageText(CHART_ITEMS, "layout");
  assert.match(text, /Patient: John Smith/);
  assert.match(text, /Philadelphia/);
  assert.doesNotMatch(text, /Philadelph ia/);
  assert.match(text, /1 N BROAD ST/);
  assert.match(text, /Progress Notes/);
});

test("hasEOL (unpdf) glues items on a line when pdf.js omits spaces and hasEOL", () => {
  const text = reconstructPageText(CHART_ITEMS, "haseol");
  assert.match(text, /Patient:JohnSmith/);
  assert.match(text, /Philadelphia/);
  assert.match(text, /1NBROADST/);
  assert.match(text, /Progress Notes\nPVC burden 12%\./);
});

test("naive join (pdf-parse) spaces mid-word splits", () => {
  const text = reconstructPageText(CHART_ITEMS, "naive");
  assert.match(text, /Patient: John Smith/);
  assert.match(text, /Philadelph ia/);
  assert.match(text, /1 N BROAD ST/);
});

test("legacy Harbor glues after punctuation and splits mid-word runs", () => {
  const text = reconstructPageText(CHART_ITEMS, "legacy");
  assert.match(text, /Patient:John Smith/);
  assert.match(text, /Philadelph ia/);
  assert.match(text, /1 N BROAD ST/);
});

test("layout has fewer glued-camel artifacts than hasEOL on this chart", () => {
  const layout = scoreExtract(reconstructPageText(CHART_ITEMS, "layout"));
  const haseol = scoreExtract(reconstructPageText(CHART_ITEMS, "haseol"));
  assert.equal(layout.camelGlue, 0);
  assert.ok(haseol.letterDigitGlue >= layout.letterDigitGlue);
});

test("snapshotExtractors returns four full documents from the same items", () => {
  const rows = snapshotExtractors([CHART_ITEMS]);
  assert.equal(rows.length, 4);
  assert.deepEqual(
    rows.map((row) => row.id),
    ["layout", "haseol", "naive", "legacy"],
  );
  const packed = formatExtractorCompare(rows);
  assert.match(packed, /===== Layout \(layout\) =====/);
  assert.match(packed, /unpdf and pdf-parse are not different engines/);
  assert.match(packed, /Patient: John Smith/);
});
