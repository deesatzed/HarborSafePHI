import { countByCategory } from "./detect.ts";
import { canonicalizePayload } from "./packet.ts";
import { redactText } from "./redact.ts";
import type { DateMode, ExtractedDocument, PhiSpan } from "./types.ts";

export type HarborExport = {
  schema: "harbor-clinical-extract-v1";
  artifactId: string;
  generatedAt: string;
  source: { pageCount: number | null };
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
  redactedText: string;
  artifactId?: string;
  report?: string | null;
}): { artifactId: string; json: HarborExport; markdown: string; redacted: string } {
  const redaction = redactText(args.extracted.text, args.spans, args.dateMode);
  const canonical = canonicalizePayload(args.redactedText);
  const artifactId = safeArtifactId(args.artifactId);
  const findings = countByCategory(args.spans);
  const json: HarborExport = {
    schema: "harbor-clinical-extract-v1",
    artifactId,
    generatedAt: new Date().toISOString(),
    source: {
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
    text: canonical.text,
  };

  const markdown = [
    ...(args.report
      ? [`# Clinical summary`, ``, args.report.trim(), ``, `---`, ``]
      : []),
    `# De-identified clinical extract`,
    ``,
    `Artifact ID: ${artifactId} · Pages: ${
      args.extracted.pageCount === null ? "Unknown" : args.extracted.pageCount
    }`,
    `Date mode: ${args.dateMode}${redaction.originIso ? ` · index ${redaction.originIso}` : ""}`,
    `Findings accepted: ${redaction.acceptedCount} / ${args.spans.length}`,
    `Text extraction: ${args.extracted.kind === "docx" ? "Mammoth" : (args.extracted.extractor ?? "layout")}`,
    ``,
    `## De-identified extract`,
    ``,
    canonical.text,
    ``,
  ].join("\n");

  return { artifactId, json, markdown, redacted: canonical.text };
}

function safeArtifactId(input?: string): string {
  const supplied = input?.trim().replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  if (supplied?.startsWith("artifact-") && supplied.length > "artifact-".length) return supplied;
  if (supplied) return `artifact-${supplied}`;
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `artifact-${uuid}`;
  return `artifact-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
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
