import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_DOCUMENT_BYTES,
  MAX_DOCX_ENTRIES,
  MAX_DOCX_UNCOMPRESSED_BYTES,
  MAX_EXTRACTED_CHARACTERS,
  MIN_DOCUMENT_TEXT_CHARACTERS,
  documentKind,
  extractDocumentText,
} from "./extract-document.ts";
import type { ExtractedDocument } from "./types.ts";

test("documentKind recognizes PDF and DOCX by MIME type or extension", () => {
  assert.equal(documentKind({ name: "chart.bin", type: "application/pdf" }), "pdf");
  assert.equal(documentKind({ name: "chart.PDF", type: "" }), "pdf");
  assert.equal(
    documentKind({
      name: "chart.bin",
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
    "docx",
  );
  assert.equal(documentKind({ name: "chart.DOCX", type: "" }), "docx");
  assert.equal(documentKind({ name: "chart.txt", type: "text/plain" }), "unsupported");
});

test("extractDocumentText maps browser-local DOCX text into Harbor's document shape", async () => {
  const file = new File([new Uint8Array([1, 2, 3])], "chart.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });

  const result = await extractDocumentText(file, {
    inspectDocx: async () => ({ entries: 3, totalUncompressedBytes: 100 }),
    readDocx: async (arrayBuffer) => {
      assert.equal(arrayBuffer.byteLength, 3);
      return { value: "  Patient summary\n\n\nMedication list  ", messages: [] };
    },
  });

  assert.equal(result.fileName, "chart.docx");
  assert.equal(result.kind, "docx");
  assert.equal(result.pageCount, null);
  assert.equal(result.text, "Patient summary\n\nMedication list");
  assert.deepEqual(result.pages, [{ pageNumber: 1, text: result.text }]);
  assert.equal(result.hasTextLayer, true);
  assert.deepEqual(result.warnings, []);
});

test("extractDocumentText retains safe Mammoth warnings and rejects fatal messages", async () => {
  const file = new File([new Uint8Array([1])], "warning.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  const options = {
    inspectDocx: async () => ({ entries: 3, totalUncompressedBytes: 100 }),
    readDocx: async () => ({
      value: "Synthetic document text long enough for review.",
      messages: [{ type: "warning", message: "Unsupported drawing was skipped." }],
    }),
  };
  const result = await extractDocumentText(file, options);
  assert.deepEqual(result.warnings, ["Unsupported drawing was skipped."]);

  await assert.rejects(
    () => extractDocumentText(file, {
      ...options,
      readDocx: async () => ({
        value: "Synthetic document text long enough for review.",
        messages: [{ type: "error", message: "Document structure is incomplete." }],
      }),
    }),
    /could not be extracted completely/i,
  );
});

test("extractDocumentText dispatches PDF files to the PDF extractor", async () => {
  const file = new File(["synthetic"], "chart.pdf", { type: "application/pdf" });
  const expected: ExtractedDocument = {
    kind: "pdf",
    fileName: file.name,
    pageCount: 3,
    text: "Synthetic PDF content long enough for local processing.",
    pages: [{ pageNumber: 1, text: "Synthetic PDF content long enough for local processing." }],
    hasTextLayer: true,
  };
  let calls = 0;

  const result = await extractDocumentText(file, {
    extractPdf: async (received) => {
      calls += 1;
      assert.equal(received, file);
      return expected;
    },
  });

  assert.equal(calls, 1);
  assert.deepEqual(result, expected);
});

test("extractDocumentText rejects oversized input before reading it", async () => {
  let reads = 0;
  const file = {
    name: "oversized.docx",
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    size: MAX_DOCUMENT_BYTES + 1,
    arrayBuffer: async () => {
      reads += 1;
      return new ArrayBuffer(0);
    },
  } as unknown as File;

  await assert.rejects(() => extractDocumentText(file), /larger than Harbor's 20 MB local limit/);
  assert.equal(reads, 0);
});

test("extractDocumentText rejects unreadable DOCX text before downstream processing", async () => {
  const file = new File([new Uint8Array([1, 2, 3])], "unreadable.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });

  await assert.rejects(
    () =>
      extractDocumentText(file, {
        inspectDocx: async () => ({ entries: 3, totalUncompressedBytes: 100 }),
        readDocx: async () => ({ value: "x".repeat(MIN_DOCUMENT_TEXT_CHARACTERS - 1), messages: [] }),
      }),
    /too little readable text/i,
  );
});

test("extractDocumentText bounds DOCX archive expansion before Mammoth", async () => {
  const file = new File([new Uint8Array([1])], "expanded.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  let reads = 0;
  const readDocx = async () => {
    reads += 1;
    return { value: "must not run", messages: [] };
  };
  await assert.rejects(
    () => extractDocumentText(file, {
      inspectDocx: async () => ({ entries: MAX_DOCX_ENTRIES + 1, totalUncompressedBytes: 1 }),
      readDocx,
    }),
    /too many internal entries/i,
  );
  await assert.rejects(
    () => extractDocumentText(file, {
      inspectDocx: async () => ({ entries: 1, totalUncompressedBytes: MAX_DOCX_UNCOMPRESSED_BYTES + 1 }),
      readDocx,
    }),
    /expands beyond Harbor's local limit/i,
  );
  assert.equal(reads, 0);
});

test("extractDocumentText rejects excessive extracted text before downstream processing", async () => {
  const file = new File([new Uint8Array([1])], "long.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  await assert.rejects(
    () => extractDocumentText(file, {
      inspectDocx: async () => ({ entries: 3, totalUncompressedBytes: 100 }),
      readDocx: async () => ({ value: "x".repeat(MAX_EXTRACTED_CHARACTERS + 1), messages: [] }),
    }),
    /too much extracted text/i,
  );
});

test("extractDocumentText rejects unsupported local files", async () => {
  const file = new File(["notes"], "notes.txt", { type: "text/plain" });
  await assert.rejects(() => extractDocumentText(file), /Choose a PDF or DOCX file/);
});
