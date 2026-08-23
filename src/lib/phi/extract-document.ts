import { extractPdfText } from "./extract-pdf.ts";
import type { ExtractedDocument, ExtractedPdf } from "./types.ts";

// Intake is browser-local, but bounded to avoid large allocations and model inputs.
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
export const MAX_DOCX_ENTRIES = 2_048;
export const MAX_DOCX_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;
export const MAX_EXTRACTED_CHARACTERS = 2_000_000;
export const MIN_DOCUMENT_TEXT_CHARACTERS = 20;

export type DocumentKind = "pdf" | "docx" | "unsupported";

type DocxMessage = { type?: string; message?: string };
type DocxReadResult = {
  value: string;
  messages: DocxMessage[];
};

type DocxArchiveSummary = { entries: number; totalUncompressedBytes: number };

type ExtractDocumentOptions = {
  readDocx?: (arrayBuffer: ArrayBuffer) => Promise<DocxReadResult>;
  inspectDocx?: (arrayBuffer: ArrayBuffer) => Promise<DocxArchiveSummary>;
  extractPdf?: (file: File) => Promise<ExtractedPdf>;
};

function requireReadableText(document: ExtractedDocument): ExtractedDocument {
  if (document.text.length > MAX_EXTRACTED_CHARACTERS) {
    throw new Error("This document contains too much extracted text for Harbor's local limit.");
  }
  let readable = 0;
  for (const character of document.text) {
    if (!/\s/u.test(character)) readable += 1;
    if (readable >= MIN_DOCUMENT_TEXT_CHARACTERS) break;
  }
  if (readable < MIN_DOCUMENT_TEXT_CHARACTERS) {
    throw new Error(
      "This document has too little readable text. Harbor cannot OCR scans yet — use a text PDF or DOCX, not a photograph.",
    );
  }
  return { ...document, hasTextLayer: true };
}

async function inspectDocxArchive(arrayBuffer: ArrayBuffer): Promise<DocxArchiveSummary> {
  const { default: JSZip } = await import("jszip");
  const archive = await JSZip.loadAsync(arrayBuffer);
  let totalUncompressedBytes = 0;
  const entries = Object.values(archive.files);
  for (const entry of entries) {
    const data = (entry as typeof entry & { _data?: { uncompressedSize?: number } })._data;
    totalUncompressedBytes += data?.uncompressedSize ?? 0;
    if (totalUncompressedBytes > MAX_DOCX_UNCOMPRESSED_BYTES) break;
  }
  return { entries: entries.length, totalUncompressedBytes };
}

function safeDocxWarnings(messages: DocxMessage[]): string[] {
  if (messages.some((message) => message.type === "error")) {
    throw new Error("This DOCX could not be extracted completely. Save a clean DOCX or use a text PDF.");
  }
  return messages
    .filter((message) => message.type === "warning" && typeof message.message === "string")
    .map((message) => message.message!.replace(/\p{Cc}+/gu, " ").trim().slice(0, 240))
    .filter(Boolean);
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

  const arrayBuffer = await file.arrayBuffer();
  const summary = await (options.inspectDocx ?? inspectDocxArchive)(arrayBuffer);
  if (summary.entries > MAX_DOCX_ENTRIES) {
    throw new Error("This DOCX has too many internal entries for Harbor's local limit.");
  }
  if (summary.totalUncompressedBytes > MAX_DOCX_UNCOMPRESSED_BYTES) {
    throw new Error("This DOCX expands beyond Harbor's local limit.");
  }

  const readDocx =
    options.readDocx ??
    (async (arrayBuffer: ArrayBuffer) => {
      const mammoth = await import("mammoth");
      return mammoth.extractRawText({ arrayBuffer });
    });
  const result = await readDocx(arrayBuffer);
  const warnings = safeDocxWarnings(result.messages);
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
    warnings,
  });
}
