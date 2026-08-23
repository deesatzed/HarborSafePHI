import { countByCategory } from "./detect.ts";
import { redactText } from "./redact.ts";
import type { DateMode, ExtractedDocument, PhiSpan } from "./types.ts";

export type HarborExport = {
  schema: "harbor-clinical-extract-v1";
  generatedAt: string;
  source: { fileName: string; pageCount: number | null };
  deid: {
    method: "safe_harbor_plus_review";
    dateMode: DateMode;
    indexDate: string | null;
    detectors: string[];
    accepted: number;
    totalFindings: number;
  };
  findings: { category: string; total: number; accepted: number }[];
  text: string;
};

export function buildExport(args: {
  extracted: ExtractedDocument;
  spans: PhiSpan[];
  dateMode: DateMode;
  detectors: string[];
  report?: string | null;
}): { json: HarborExport; markdown: string; redacted: string } {
  const redaction = redactText(args.extracted.text, args.spans, args.dateMode);
  const findings = countByCategory(args.spans);
  const json: HarborExport = {
    schema: "harbor-clinical-extract-v1",
    generatedAt: new Date().toISOString(),
    source: {
      fileName: args.extracted.fileName,
      pageCount: args.extracted.pageCount,
    },
    deid: {
      method: "safe_harbor_plus_review",
      dateMode: args.dateMode,
      indexDate: redaction.originIso,
      detectors: args.detectors,
      accepted: redaction.acceptedCount,
      totalFindings: args.spans.length,
    },
    findings: findings.map((row) => ({
      category: row.category,
      total: row.total,
      accepted: row.accepted,
    })),
    text: redaction.redacted,
  };

  const markdown = [
    ...(args.report
      ? [`# Clinical summary`, ``, args.report.trim(), ``, `---`, ``]
      : []),
    `# De-identified clinical extract`,
    ``,
    `Source file: ${args.extracted.fileName} · Pages: ${
      args.extracted.pageCount === null ? "Unknown" : args.extracted.pageCount
    }`,
    `Date mode: ${args.dateMode}${redaction.originIso ? ` · index ${redaction.originIso}` : ""}`,
    `Findings accepted: ${redaction.acceptedCount} / ${args.spans.length}`,
    `Text extraction: ${args.extracted.kind === "docx" ? "Mammoth" : (args.extracted.extractor ?? "layout")}`,
    ``,
    `## De-identified extract`,
    ``,
    redaction.redacted.trim(),
    ``,
  ].join("\n");

  return { json, markdown, redacted: redaction.redacted };
}

export function downloadTextFile(filename: string, contents: string, mime: string) {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
