import { extractPdfText } from "./extract-pdf.ts";
import type { ExtractedDocument } from "./types.ts";

// Intake is browser-local, but bounded to avoid large allocations and model inputs.
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
export const MIN_DOCUMENT_TEXT_CHARACTERS = 20;

export type DocumentKind = "pdf" | "docx" | "unsupported";

type DocxReadResult = {
  value: string;
  messages: unknown[];
};

type ExtractDocumentOptions = {
  readDocx?: (arrayBuffer: ArrayBuffer) => Promise<DocxReadResult>;
  extractPdf?: (file: File) => Promise<ExtractedDocument>;
};

function requireReadableText(document: ExtractedDocument): ExtractedDocument {
  if (document.text.replace(/\s/g, "").length < MIN_DOCUMENT_TEXT_CHARACTERS) {
    throw new Error(
      "This document has too little readable text. Harbor cannot OCR scans yet — use a text PDF or DOCX, not a photograph.",
    );
  }
  return { ...document, hasTextLayer: true };
}

export function documentKind(file: Pick<File, "name" | "type">): DocumentKind {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) return "pdf";
  if (
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    /\.docx$/i.test(file.name)
  ) {
    return "docx";
  }
  return "unsupported";
}

export async function extractDocumentText(
  file: File,
  options: ExtractDocumentOptions = {},
): Promise<ExtractedDocument> {
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new Error("This file is larger than Harbor's 20 MB local limit.");
  }

  const kind = documentKind(file);
  if (kind === "pdf") {
    return requireReadableText(await (options.extractPdf ?? extractPdfText)(file));
  }
  if (kind === "unsupported") throw new Error("Choose a PDF or DOCX file.");

  const readDocx =
    options.readDocx ??
    (async (arrayBuffer: ArrayBuffer) => {
      const mammoth = await import("mammoth");
      return mammoth.extractRawText({ arrayBuffer });
    });
  const result = await readDocx(await file.arrayBuffer());
  const text = result.value
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return requireReadableText({
    kind: "docx",
    fileName: file.name,
    pageCount: null,
    text,
    pages: [{ pageNumber: 1, text }],
    hasTextLayer: true,
  });
}
