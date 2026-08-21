import { countByCategory } from "./detect";
import { redactText } from "./redact";
import type { DateMode, ExtractedPdf, PhiSpan } from "./types";

export type HarborExport = {
  schema: "harbor-clinical-extract-v1";
  generatedAt: string;
  source: { fileName: string; pageCount: number };
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
  extracted: ExtractedPdf;
  spans: PhiSpan[];
  dateMode: DateMode;
  detectors: string[];
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
    `# De-identified clinical extract`,
    ``,
    `Source file: ${args.extracted.fileName} (${args.extracted.pageCount} page${args.extracted.pageCount === 1 ? "" : "s"})`,
    `Date mode: ${args.dateMode}${redaction.originIso ? ` · index ${redaction.originIso}` : ""}`,
    `Findings accepted: ${redaction.acceptedCount} / ${args.spans.length}`,
    ``,
    `## Report`,
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
