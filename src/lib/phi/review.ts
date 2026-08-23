import type { DateMode, DetectorSource, PhiCategory } from "./types.ts";

export type ReviewedFinding = {
  start: number;
  end: number;
  category: PhiCategory;
  accepted: boolean;
  source: DetectorSource;
};

export type ReviewedRepresentation = {
  sourceTextSha256: string;
  dateMode: DateMode;
  redactedText: string;
  findings: readonly ReviewedFinding[];
};

export type ReviewApproval = {
  approvedAt: string;
  dateMode: DateMode;
  redactedSha256: string;
  reviewSha256: string;
};

export type ApprovedReportInput = {
  redactedText: string;
  redactedSha256: string;
  dateMode: DateMode;
  model?: string;
};

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

function canonicalFindings(findings: readonly ReviewedFinding[]) {
  return findings
    .map(({ start, end, category, accepted, source }) => ({
      start,
      end,
      category,
      accepted,
      source,
    }))
    .sort(
      (left, right) =>
        left.start - right.start ||
        left.end - right.end ||
        left.category.localeCompare(right.category) ||
        Number(left.accepted) - Number(right.accepted) ||
        left.source.localeCompare(right.source),
    );
}

export async function reviewFingerprint(
  input: ReviewedRepresentation,
): Promise<string> {
  const redactedSha256 = await sha256Hex(input.redactedText);
  return sha256Hex(
    JSON.stringify({
      sourceTextSha256: input.sourceTextSha256,
      dateMode: input.dateMode,
      redactedSha256,
      findings: canonicalFindings(input.findings),
    }),
  );
}

export async function approveReview(
  input: ReviewedRepresentation,
  now = new Date(),
): Promise<ReviewApproval> {
  const [redactedSha256, reviewSha256] = await Promise.all([
    sha256Hex(input.redactedText),
    reviewFingerprint(input),
  ]);
  return {
    approvedAt: now.toISOString(),
    dateMode: input.dateMode,
    redactedSha256,
    reviewSha256,
  };
}

export async function reviewIsCurrent(
  approval: ReviewApproval | null,
  input: ReviewedRepresentation,
): Promise<boolean> {
  if (!approval || approval.dateMode !== input.dateMode) return false;
  const [redactedSha256, reviewSha256] = await Promise.all([
    sha256Hex(input.redactedText),
    reviewFingerprint(input),
  ]);
  return (
    approval.redactedSha256 === redactedSha256 &&
    approval.reviewSha256 === reviewSha256
  );
}

function isDateMode(value: unknown): value is DateMode {
  return value === "relative" || value === "year" || value === "keep";
}

export async function validateApprovedReportInput(
  input: ApprovedReportInput,
): Promise<ApprovedReportInput> {
  if (!input || typeof input.redactedText !== "string") {
    throw new Error("Missing de-identified text.");
  }
  if (typeof input.redactedSha256 !== "string") {
    throw new Error("Missing approved redacted-text fingerprint.");
  }
  if (!isDateMode(input.dateMode)) {
    throw new Error("Invalid date mode.");
  }
  if ((await sha256Hex(input.redactedText)) !== input.redactedSha256) {
    throw new Error("Approved redacted-text fingerprint mismatch.");
  }
  return {
    redactedText: input.redactedText,
    redactedSha256: input.redactedSha256,
    dateMode: input.dateMode,
    ...(typeof input.model === "string" ? { model: input.model } : {}),
  };
}

export function describeOpenRouterDateDisclosure(dateMode: DateMode): string {
  if (dateMode === "relative") {
    return "OpenRouter receives relative-day text (for example, Day 0 and Day +N).";
  }
  if (dateMode === "year") {
    return "OpenRouter receives years only; month and day are removed.";
  }
  return "OpenRouter receives retained clinical dates exactly as shown in the approved redacted text.";
}
