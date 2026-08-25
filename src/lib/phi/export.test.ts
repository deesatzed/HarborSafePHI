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
    redactedText: "Canonical approved extract",
    artifactId: "artifact-test-123",
  });

  assert.equal(result.json.source.pageCount, null);
  assert.equal(result.json.artifactId, "artifact-test-123");
  assert.match(result.markdown, /Artifact ID: artifact-test-123 · Pages: Unknown/);
  assert.match(result.markdown, /Text extraction: Mammoth/);
  assert.doesNotMatch(result.markdown, /PDF text:/);
  assert.doesNotMatch(result.markdown, /null pages?/i);
  assert.doesNotMatch(JSON.stringify(result.json), /synthetic\.docx/);
  assert.doesNotMatch(result.markdown, /synthetic\.docx/);
});

test("buildExport uses the approved canonical payload verbatim", () => {
  const extracted: ExtractedDocument = {
    kind: "docx",
    fileName: "synthetic.docx",
    pageCount: null,
    text: "Original private text",
    pages: [{ pageNumber: 1, text: "Original private text" }],
    hasTextLayer: true,
  };

  const result = buildExport({
    extracted,
    spans: [],
    dateMode: "keep",
    detectors: ["regex"],
    redactedText: "Canonical approved extract",
    artifactId: "artifact-test-456",
  });

  assert.equal(result.redacted, "Canonical approved extract");
  assert.equal(result.json.text, "Canonical approved extract");
  assert.match(result.markdown, /Canonical approved extract/);
});

test("buildExport generates a safe artifact id when the caller does not provide one", () => {
  const extracted: ExtractedDocument = {
    kind: "pdf",
    fileName: "patient-name.pdf",
    pageCount: 1,
    text: "Original private text",
    pages: [{ pageNumber: 1, text: "Original private text" }],
    hasTextLayer: true,
  };

  const result = buildExport({
    extracted,
    spans: [],
    dateMode: "relative",
    detectors: ["regex"],
    redactedText: "Canonical approved extract",
  });

  assert.match(result.json.artifactId, /^artifact-[a-z0-9-]+$/);
  assert.doesNotMatch(JSON.stringify(result.json), /patient-name\.pdf/);
});
