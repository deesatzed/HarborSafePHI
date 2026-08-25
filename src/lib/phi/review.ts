import type { DateMode, DetectorSource, PhiCategory } from "./types.ts";
import { canonicalizePayload } from "./packet.ts";

export const MAX_REVIEW_SOURCE_CHARACTERS = 2_000_000;
export const MAX_REVIEW_FINDINGS = 10_000;
const MAX_REVIEW_HASH_LENGTH = 128;
const MAX_FINDING_FIELD_LENGTH = 64;

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

function canonicalReviewInput(input: ReviewedRepresentation): ReviewedRepresentation {
  if (!input || typeof input.sourceTextSha256 !== "string") {
    throw new Error("Missing source-text fingerprint.");
  }
  if (input.sourceTextSha256.length > MAX_REVIEW_HASH_LENGTH) {
    throw new Error("Source-text fingerprint is too long.");
  }
  if (!isDateMode(input.dateMode)) {
    throw new Error("Invalid date mode.");
  }
  if (typeof input.redactedText !== "string") {
    throw new Error("Missing de-identified text.");
  }
  if (input.redactedText.length > MAX_REVIEW_SOURCE_CHARACTERS) {
    throw new Error("The redacted text exceeds Harbor's local review limit.");
  }
  if (!Array.isArray(input.findings) || input.findings.length > MAX_REVIEW_FINDINGS) {
    throw new Error("The review contains too many findings.");
  }
  for (const finding of input.findings) {
    if (
      !Number.isInteger(finding.start) ||
      !Number.isInteger(finding.end) ||
      finding.start < 0 ||
      finding.end < finding.start ||
      finding.end > MAX_REVIEW_SOURCE_CHARACTERS ||
      typeof finding.category !== "string" ||
      finding.category.length > MAX_FINDING_FIELD_LENGTH ||
      typeof finding.source !== "string" ||
      finding.source.length > MAX_FINDING_FIELD_LENGTH ||
      typeof finding.accepted !== "boolean"
    ) {
      throw new Error("The review contains an invalid finding.");
    }
  }
  return {
    ...input,
    redactedText: canonicalizePayload(input.redactedText).text,
  };
}

export async function reviewFingerprint(
  input: ReviewedRepresentation,
): Promise<string> {
  const canonical = canonicalReviewInput(input);
  const redactedSha256 = await sha256Hex(canonical.redactedText);
  return sha256Hex(
    JSON.stringify({
      sourceTextSha256: canonical.sourceTextSha256,
      dateMode: canonical.dateMode,
      redactedSha256,
      findings: canonicalFindings(canonical.findings),
    }),
  );
}

export async function approveReview(
  input: ReviewedRepresentation,
  now = new Date(),
): Promise<ReviewApproval> {
  const canonical = canonicalReviewInput(input);
  const [redactedSha256, reviewSha256] = await Promise.all([
    sha256Hex(canonical.redactedText),
    reviewFingerprint(canonical),
  ]);
  return {
    approvedAt: now.toISOString(),
    dateMode: canonical.dateMode,
    redactedSha256,
    reviewSha256,
  };
}

export async function reviewIsCurrent(
  approval: ReviewApproval | null,
  input: ReviewedRepresentation,
): Promise<boolean> {
  if (!approval) return false;
  const canonical = canonicalReviewInput(input);
  if (approval.dateMode !== canonical.dateMode) return false;
  const [redactedSha256, reviewSha256] = await Promise.all([
    sha256Hex(canonical.redactedText),
    reviewFingerprint(canonical),
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
  if (input.redactedText.length > MAX_REVIEW_SOURCE_CHARACTERS) {
    throw new Error("The approved redacted text exceeds Harbor's local review limit.");
  }
  if (typeof input.redactedSha256 !== "string") {
    throw new Error("Missing approved redacted-text fingerprint.");
  }
  if (!isDateMode(input.dateMode)) {
    throw new Error("Invalid date mode.");
  }
  const canonical = canonicalizePayload(input.redactedText);
  if (canonical.text !== input.redactedText) {
    throw new Error("Approved payload is not canonical.");
  }
  if ((await sha256Hex(canonical.text)) !== input.redactedSha256) {
    throw new Error("Approved redacted-text fingerprint mismatch.");
  }
  return {
    redactedText: canonical.text,
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
