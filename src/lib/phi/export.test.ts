import assert from "node:assert/strict";
import test from "node:test";
import { buildExport } from "./export.ts";
import type { ExtractedDocument } from "./types.ts";

test("buildExport reports an unknown page count for DOCX without inventing pages", () => {
  const extracted: ExtractedDocument = {
    kind: "docx",
    fileName: "synthetic.docx",
    pageCount: null,
    text: "Synthetic document content with enough text for local processing.",
    pages: [
      {
        pageNumber: 1,
        text: "Synthetic document content with enough text for local processing.",
      },
    ],
    hasTextLayer: true,
  };

  const result = buildExport({
    extracted,
    spans: [],
    dateMode: "keep",
    detectors: ["regex"],
  });

  assert.equal(result.json.source.pageCount, null);
  assert.match(result.markdown, /Source file: synthetic\.docx · Pages: Unknown/);
  assert.match(result.markdown, /Text extraction: Mammoth/);
  assert.doesNotMatch(result.markdown, /PDF text:/);
  assert.doesNotMatch(result.markdown, /null pages?/i);
});
