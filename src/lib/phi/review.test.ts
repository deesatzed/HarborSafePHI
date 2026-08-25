import assert from "node:assert/strict";
import test from "node:test";
import {
  approveReview,
  describeOpenRouterDateDisclosure,
  reviewFingerprint,
  reviewIsCurrent,
  sha256Hex,
  validateApprovedReportInput,
} from "./review.ts";
import { canonicalizePayload } from "./packet.ts";

const reviewed = {
  sourceTextSha256: "source-hash",
  dateMode: "year" as const,
  redactedText: "[NAME] visited in 2024",
  findings: [
    {
      start: 0,
      end: 10,
      category: "name" as const,
      accepted: true,
      source: "openmed" as const,
      text: "Sensitive Surface",
    },
  ],
};

test("sha256Hex uses the standard SHA-256 digest", async () => {
  assert.equal(
    await sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

test("approval binds to source, date policy, exact redacted text, and findings", async () => {
  const approval = await approveReview(reviewed, new Date("2026-08-22T12:00:00Z"));

  assert.deepEqual(approval, {
    approvedAt: "2026-08-22T12:00:00.000Z",
    dateMode: "year",
    redactedSha256: await sha256Hex(reviewed.redactedText),
    reviewSha256: await reviewFingerprint(reviewed),
  });
  assert.equal(await reviewIsCurrent(approval, reviewed), true);
  assert.equal(await reviewIsCurrent(approval, { ...reviewed, dateMode: "relative" }), false);
  assert.equal(await reviewIsCurrent(approval, { ...reviewed, sourceTextSha256: "other" }), false);
  assert.equal(await reviewIsCurrent(approval, { ...reviewed, redactedText: `${reviewed.redactedText}.` }), false);
  assert.equal(await reviewIsCurrent(approval, { ...reviewed, findings: [] }), false);
});

test("review canonicalization sorts findings and excludes original surfaces", async () => {
  const first = {
    ...reviewed,
    findings: [
      {
        start: 20,
        end: 30,
        category: "date" as const,
        accepted: false,
        source: "regex" as const,
        text: "first private surface",
        confidence: 0.1,
      },
      reviewed.findings[0],
    ],
  };
  const second = {
    ...reviewed,
    findings: [
      { ...reviewed.findings[0], text: "different private surface" },
      {
        start: 20,
        end: 30,
        category: "date" as const,
        accepted: false,
        source: "regex" as const,
        text: "second private surface",
        confidence: 0.99,
      },
    ],
  };

  assert.equal(await reviewFingerprint(first), await reviewFingerprint(second));
  assert.notEqual(
    await reviewFingerprint(first),
    await reviewFingerprint({
      ...second,
      findings: second.findings.map((finding, index) =>
        index === 0 ? { ...finding, accepted: !finding.accepted } : finding,
      ),
    }),
  );
});

test("review fingerprints canonical payload text, not a later prepared variant", async () => {
  const noncanonical = {
    ...reviewed,
    redactedText: `  ${reviewed.redactedText}\r\n`,
  };
  const canonical = {
    ...noncanonical,
    redactedText: canonicalizePayload(noncanonical.redactedText).text,
  };

  assert.equal(await reviewFingerprint(noncanonical), await reviewFingerprint(canonical));
});

test("approval hash equals the displayed and transmitted canonical payload hash", async () => {
  const input = {
    ...reviewed,
    redactedText: "  [NAME] visited\r\n",
  };
  const canonical = canonicalizePayload(input.redactedText).text;
  const approval = await approveReview(input, new Date("2026-08-24T12:00:00Z"));

  assert.equal(approval.redactedSha256, await sha256Hex(canonical));
  assert.deepEqual(
    await validateApprovedReportInput({
      redactedText: canonical,
      redactedSha256: approval.redactedSha256,
      dateMode: input.dateMode,
    }),
    {
      redactedText: canonical,
      redactedSha256: approval.redactedSha256,
      dateMode: input.dateMode,
    },
  );
});

test("server report validation rejects a redacted-text fingerprint mismatch", async () => {
  const redactedText = "[NAME] visited on Day 0 for follow-up.";
  const valid = {
    redactedText,
    redactedSha256: await sha256Hex(redactedText),
    dateMode: "relative" as const,
    model: "example/model",
  };

  assert.deepEqual(await validateApprovedReportInput(valid), valid);
  await assert.rejects(
    validateApprovedReportInput({ ...valid, redactedText: `${redactedText} changed` }),
    /fingerprint mismatch/i,
  );
  await assert.rejects(
    validateApprovedReportInput({ ...valid, dateMode: "invalid" as "relative" }),
    /date mode/i,
  );
});

test("server report validation rejects a noncanonical approved payload", async () => {
  const redactedText = "[NAME] visited on Day 0 for follow-up.";
  const canonical = canonicalizePayload(redactedText).text;
  const valid = {
    redactedText: canonical,
    redactedSha256: await sha256Hex(canonical),
    dateMode: "relative" as const,
  };

  await assert.rejects(
    validateApprovedReportInput({ ...valid, redactedText: ` ${canonical} ` }),
    /canonical/i,
  );
});

test("OpenRouter disclosure matches each approved date representation", () => {
  assert.match(describeOpenRouterDateDisclosure("relative"), /relative-day text/i);
  assert.match(describeOpenRouterDateDisclosure("year"), /years only/i);
  assert.match(describeOpenRouterDateDisclosure("keep"), /retained clinical dates/i);
});
