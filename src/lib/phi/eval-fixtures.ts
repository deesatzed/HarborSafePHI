import { detectLocalPhi } from "./detect.ts";
import { redactText } from "./redact.ts";
import { EMPTY_SEED, type PhiCategory, type PhiSpan } from "./types.ts";

export type PhiEvalRequirement = {
  category: PhiCategory;
  surface: string;
};

export type PhiEvalFixture = {
  id: string;
  text: string;
  expectedRedacted: string;
  required: PhiEvalRequirement[];
  preserve: string[];
};

/** Synthetic-only fixtures. Do not replace these values with real records. */
export const PHI_EVAL_FIXTURES: readonly PhiEvalFixture[] = [
  {
    id: "labeled-identifiers",
    text: `Patient: SAMPLEPERSON, AVERY Q
MRN: MRN-2048
DOB: 04/05/1980
Phone: (212) 555-0117
Fax: (212) 555-0118
Email: avery.sample@example.test
Address: 42 Harbor Lane, Sampletown, NY 10001
SSN: 321-54-9876
NPI: 1234567890
Member ID: PLAN-ABC123
CSN: ENC-7788
FIN: ACCT-9911
Collected: 2026-04-05
`,
    expectedRedacted: `Patient: [NAME]
MRN: [MRN]
DOB: [DOB]
Phone: [PHONE]
Fax: [PHONE]
Email: [EMAIL]
Address: [ADDRESS]
SSN: [SSN]
NPI: [NPI]
Member ID: [PLAN_ID]
CSN: [ACCESSION]
FIN: [ACCESSION]
Collected: 2026
`,
    required: [
      { category: "name", surface: "SAMPLEPERSON, AVERY Q" },
      { category: "mrn", surface: "MRN-2048" },
      { category: "dob", surface: "04/05/1980" },
      { category: "phone", surface: "(212) 555-0117" },
      { category: "email", surface: "avery.sample@example.test" },
      { category: "address", surface: "42 Harbor Lane, Sampletown, NY 10001" },
      { category: "ssn", surface: "321-54-9876" },
      { category: "npi", surface: "1234567890" },
      { category: "plan_id", surface: "PLAN-ABC123" },
      { category: "accession", surface: "ENC-7788" },
      { category: "date", surface: "2026-04-05" },
    ],
    preserve: [],
  },
  {
    id: "network-and-clinical-near-misses",
    text: `Patient Name: SAMPLEPERSON, AVERY Q
Visit date: Apr 5, 2026
Portal: https://portal.example.test/patient/ABC-123
Source IP: 192.0.2.44
ZIP: NY 10002
Assessment: Crohn disease; HbA1c 5.6; Metformin 500 mg.
`,
    expectedRedacted: `Patient Name: [NAME]
Visit date: 2026
Portal: [URL]
Source IP: [IP]
ZIP: NY [ZIP]
Assessment: Crohn disease; HbA1c 5.6; Metformin 500 mg.
`,
    required: [
      { category: "name", surface: "SAMPLEPERSON, AVERY Q" },
      { category: "date", surface: "Apr 5, 2026" },
      { category: "url", surface: "https://portal.example.test/patient/ABC-123" },
      { category: "ip", surface: "192.0.2.44" },
      { category: "zip", surface: "10002" },
    ],
    preserve: ["Crohn disease", "HbA1c 5.6", "Metformin 500 mg"],
  },
];

function matchedRequirement(spans: PhiSpan[], requirement: PhiEvalRequirement): boolean {
  return spans.some(
    (span) => span.category === requirement.category && span.text === requirement.surface,
  );
}

export type PhiEvalResult = {
  id: string;
  engine: "deterministic";
  passed: boolean;
  requiredCount: number;
  matchedCount: number;
  missingCount: number;
  falsePositiveCount: number;
  redactionMatchesExpected: boolean;
  missingCategories: PhiCategory[];
  categoryCounts: Partial<Record<PhiCategory, number>>;
};

export function evaluatePhiFixture(fixture: PhiEvalFixture): PhiEvalResult {
  const spans = detectLocalPhi(fixture.text, EMPTY_SEED);
  const redacted = redactText(fixture.text, spans, "year").redacted;
  const missing = fixture.required.filter(
    (requirement) =>
      !matchedRequirement(spans, requirement) || redacted.includes(requirement.surface),
  );
  const falsePositives = fixture.preserve.filter((value) => !redacted.includes(value));
  const categoryCounts: Partial<Record<PhiCategory, number>> = {};
  for (const span of spans) categoryCounts[span.category] = (categoryCounts[span.category] ?? 0) + 1;

  return {
    id: fixture.id,
    engine: "deterministic",
    passed:
      missing.length === 0 &&
      falsePositives.length === 0 &&
      redacted === fixture.expectedRedacted,
    requiredCount: fixture.required.length,
    matchedCount: fixture.required.length - missing.length,
    missingCount: missing.length,
    falsePositiveCount: falsePositives.length,
    redactionMatchesExpected: redacted === fixture.expectedRedacted,
    missingCategories: [...new Set(missing.map((requirement) => requirement.category))],
    categoryCounts,
  };
}

export type PhiEvalReport = {
  schema: "harbor-phi-eval-v1";
  engine: "deterministic";
  fixtureCount: number;
  passedFixtureCount: number;
  requiredCount: number;
  matchedCount: number;
  missingCount: number;
  falsePositiveCount: number;
  passed: boolean;
  fixtures: PhiEvalResult[];
};

export function evaluatePhiCorpus(
  fixtures: readonly PhiEvalFixture[] = PHI_EVAL_FIXTURES,
): PhiEvalReport {
  const results = fixtures.map(evaluatePhiFixture);
  return {
    schema: "harbor-phi-eval-v1",
    engine: "deterministic",
    fixtureCount: results.length,
    passedFixtureCount: results.filter((result) => result.passed).length,
    requiredCount: results.reduce((total, result) => total + result.requiredCount, 0),
    matchedCount: results.reduce((total, result) => total + result.matchedCount, 0),
    missingCount: results.reduce((total, result) => total + result.missingCount, 0),
    falsePositiveCount: results.reduce((total, result) => total + result.falsePositiveCount, 0),
    passed: results.every((result) => result.passed),
    fixtures: results,
  };
}
