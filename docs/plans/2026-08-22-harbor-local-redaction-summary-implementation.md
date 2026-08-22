# Harbor Local Redaction and Summary Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Finish Harbor as a local PDF/DOCX medical-document redactor with WebGPU-first OpenMed, mandatory human approval before optional OpenRouter summarization, and a provenance-rich portable export.

**Architecture:** Harbor keeps raw documents and unredacted text in browser memory, combines local OpenMed with deterministic detectors, and requires approval of a specific redacted representation before summary generation or final export. The only M-Vault-facing surface is a versioned downloaded JSON artifact; this plan does not modify eMedGen, build SNP processing, or implement a M-Vault endpoint.

**Tech Stack:** React 19, TanStack Start, TypeScript, Vite/Nitro, OpenMed ONNX via `@huggingface/transformers`, WebGPU/WASM, PDF.js, Mammoth, OpenRouter, Node test runner, Playwright smoke tests, Fly.io.

---

## Working-tree rule

The canonical checkout already contains uncommitted DOCX, OpenMed-loader, and deployment repairs. Do not reset, replace, or stage the tree wholesale. Tasks 1 and 2 first turn the relevant existing work into bounded commits. Unrelated screenshots and medical input/output artifacts remain untracked. No file under eMedGen is touched.

Before every commit run:

```bash
git status --short
git diff --check
git diff --cached --stat
```

The cached diff must contain only the files named by that task.

### Task 1: Checkpoint and verify browser-local DOCX intake

**Files:**
- Create: `src/lib/phi/extract-document.ts`
- Create: `src/lib/phi/extract-document.test.ts`
- Create: `scripts/document-intake-contract.test.mjs`
- Modify: `src/components/harbor-app.tsx`
- Modify: `src/lib/phi/types.ts`
- Modify: `src/lib/phi/extract-pdf.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Step 1: Confirm the focused tests are collected**

Run:

```bash
node --experimental-strip-types --test src/lib/phi/extract-document.test.ts
node --test scripts/document-intake-contract.test.mjs
```

Expected: both commands pass. If either fails, do not proceed to staging; repair only the files listed above.

**Step 2: Verify the implementation is browser-local**

Confirm `extractDocumentText()` dispatches PDF to `extractPdfText()` and DOCX to a dynamic browser import of Mammoth:

```ts
export async function extractDocumentText(file: File, options: ExtractDocumentOptions = {}) {
  const kind = documentKind(file);
  if (kind === "pdf") return extractPdfText(file);
  if (kind !== "docx") throw new Error("Choose a PDF or DOCX file.");

  const readDocx = options.readDocx ?? (async (buffer: ArrayBuffer) => {
    const mammoth = await import("mammoth");
    return mammoth.extractRawText({ arrayBuffer: buffer });
  });
  // Normalize text and return Harbor's existing extracted-document shape.
}
```

Expected: no server function, upload, filesystem write, or raw document persistence is introduced. Retain `import("mammoth")`; the installed package's browser mapping is what Vite resolves. Do not change it to the non-resolving `mammoth/mammoth.browser` subpath.

Extend the extracted-document contract rather than continuing to call every input an `ExtractedPdf`:

```ts
export type ExtractedDocument = {
  kind: "pdf" | "docx";
  fileName: string;
  pageCount: number | null;
  text: string;
  pages: { pageNumber: number; text: string }[];
  hasTextLayer: boolean;
  extractor?: ExtractorId;
  extractors?: ExtractorSnapshot[];
};
```

PDF extraction sets `kind: "pdf"` and its real page count. DOCX sets `kind: "docx"` and `pageCount: null`; do not invent a one-page count for a format Mammoth does not paginate.

Add bounded input checks before model loading:

- reject files above a documented maximum size before reading them;
- reject empty or too-short extracted text before calling OpenMed;
- clear all prior derived state on rejection;
- add a test proving an unreadable document causes no OpenMed or report call;
- add a browser/build proof that the real Mammoth browser chunk handles a small synthetic DOCX, because the injected unit reader alone does not prove bundling.

**Step 3: Run the Harbor test suite**

Run:

```bash
npm test
npm run typecheck
npm run lint
```

Expected: 214 or more tests pass; typecheck and lint exit 0.

**Step 4: Stage only DOCX-related changes**

Stage the new extractor/tests, extracted-document type changes, the DOCX UI changes, and Mammoth dependency changes. Use partial staging for `package.json` so the unrelated `start` script remains for Task 6:

```bash
git add src/lib/phi/extract-document.ts src/lib/phi/extract-document.test.ts scripts/document-intake-contract.test.mjs src/components/harbor-app.tsx src/lib/phi/types.ts src/lib/phi/extract-pdf.ts
git add -p package.json
```

Stage the package name, Mammoth dependency, and test-list addition; do not stage the `start` script yet. Do not stage the current lockfile wholesale until it has been reproduced from a clean copy of `HEAD` plus only the intended package-name/Mammoth changes, and `npm ci` succeeds against that regenerated lockfile. Then stage the verified lockfile.

**Step 5: Inspect the staged diff**

Run:

```bash
git diff --cached --check
git diff --cached --stat
git diff --cached
```

Expected: no OpenMed, auth, PWA, Nitro, screenshot, or eMedGen changes.

**Step 6: Commit**

```bash
git commit -m "feat: add browser-local DOCX intake"
```

### Task 2: Implement WebGPU-first OpenMed with tested WASM fallback

**Files:**
- Modify: `src/lib/phi/openmed.ts`
- Modify: `scripts/openmed-loader-contract.test.mjs`
- Create: `src/lib/phi/openmed-device.test.ts`
- Modify: `package.json`

**Step 1: Write failing behavioral device-order tests**

Test the actual attempt runner through an injected loader, not only an array helper:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { runOpenMedAttempts } from "./openmed.ts";

test("WebGPU success does not try WASM", async () => {
  const seen = [];
  const result = await runOpenMedAttempts(true, async (attempt) => {
    seen.push(attempt);
    return { engine: {}, attempt };
  });
  assert.deepEqual(seen, [{ device: "webgpu", variant: "fp16" }]);
  assert.equal(result.attempt.device, "webgpu");
});

test("WebGPU failure falls back to WASM", async () => {
  const seen = [];
  const result = await runOpenMedAttempts(true, async (attempt) => {
    seen.push(attempt);
    if (attempt.device === "webgpu") throw new Error("unsupported");
    return { engine: {}, attempt };
  });
  assert.deepEqual(seen.map(({ device }) => device), ["webgpu", "wasm"]);
  assert.equal(result.attempt.variant, "int8");
});

test("no WebGPU tries WASM only", async () => {
  const seen = [];
  const result = await runOpenMedAttempts(false, async (attempt) => {
    seen.push(attempt);
    return { engine: {}, attempt };
  });
  assert.deepEqual(seen, [{ device: "wasm", variant: "int8" }]);
  assert.equal(result.attempt.device, "wasm");
});

test("both failures surface a degraded runtime", async () => {
  await assert.rejects(
    runOpenMedAttempts(true, async () => { throw new Error("cannot load"); }),
    /cannot load/,
  );
});
```

Add `src/lib/phi/openmed-device.test.ts` to the `npm test` command.

**Step 2: Run the test to verify it fails**

Run:

```bash
node --experimental-strip-types --test src/lib/phi/openmed-device.test.ts
```

Expected: FAIL because `openMedAttempts` does not exist.

**Step 3: Implement the attempt contract and pinned provenance**

In `src/lib/phi/openmed.ts` add:

```ts
export type OpenMedAttempt = {
  device: OpenMedDevice;
  variant: "fp16" | "int8";
};

export const OPENMED_MODEL = "OpenMed/OpenMed-NER-ONNX";
export const OPENMED_MODEL_REVISION = "<pin exact tested tag or commit>";
export const OPENMED_RUNTIME_VERSION = "<package version from lockfile>";
export const DETERMINISTIC_RULESET_VERSION = "harbor-rules-v1";

export type OpenMedRuntimeState = {
  status: "ready" | "degraded";
  device: OpenMedDevice | null;
  variant: "fp16" | "int8" | null;
  model: string;
  revision: string;
};

export function openMedAttempts(hasWebGpu: boolean): OpenMedAttempt[] {
  return hasWebGpu
    ? [
        { device: "webgpu", variant: "fp16" },
        { device: "wasm", variant: "int8" },
      ]
    : [{ device: "wasm", variant: "int8" }];
}
```

Implement `runOpenMedAttempts(hasWebGpu, loadAttempt, onProgress?)` around this order, and make the production loader call it. Pass `revision: OPENMED_MODEL_REVISION` to `loadOnnxModel`; the installed OpenMed API supports and forwards that option. Return both the engine and the successful attempt so Harbor can retain device/variant/model/revision provenance.

Only announce a fallback when another attempt remains. If the final attempt fails, report that OpenMed is unavailable and Harbor is continuing in explicitly labeled deterministic-only degraded mode; do not leave the UI saying it is still trying a fallback.

The production shape is:

```ts
const loaded = await runOpenMedAttempts(
  webGpuAvailable(),
  (attempt) => tryLoad(attempt.device, attempt.variant, OPENMED_MODEL_REVISION),
  onProgress,
);
engine = loaded.engine;
runtime = {
  status: "ready",
  device: loaded.attempt.device,
  variant: loaded.attempt.variant,
  model: OPENMED_MODEL,
  revision: OPENMED_MODEL_REVISION,
};
```

Retain the existing lazy `import("openmed")`, runtime-supplied `normalizeLabel`, and removal of invalid `model_file_name`/`dtype` overrides.

**Step 4: Update the structural contract test**

Replace the hardcoded WASM assertion with assertions that the source uses `runOpenMedAttempts(webGpuAvailable(), ...)`, supplies the pinned `revision`, contains both device names, stays lazy-loaded, and does not restore `model_file_name` or explicit `dtype` overrides.

**Step 5: Run focused tests**

Run:

```bash
node --experimental-strip-types --test src/lib/phi/openmed-device.test.ts
node --test scripts/openmed-loader-contract.test.mjs
npm run typecheck
```

Expected: PASS.

**Step 6: Run full local gates**

Run:

```bash
npm test
npm run lint
git diff --check
```

Expected: all pass.

**Step 7: Commit**

Use `git add -p package.json` for only the Task 2 test-list hunk; preserve the Task 6 runtime-script hunk.

```bash
git add src/lib/phi/openmed.ts src/lib/phi/openmed-device.test.ts scripts/openmed-loader-contract.test.mjs
git add -p package.json
git commit -m "fix: prefer OpenMed WebGPU with WASM fallback"
```

### Task 3: Add a mandatory review-approval gate

**Files:**
- Create: `src/lib/phi/review.ts`
- Create: `src/lib/phi/review.test.ts`
- Modify: `src/components/harbor-app.tsx`
- Modify: `src/components/harbor-panels.tsx`
- Modify: `package.json`

**Step 1: Write failing review-state tests**

Create tests for a stable approved representation. Approval is bound to the source identity, selected date policy, exact reviewed text, and normalized accepted findings—not merely the rendered text:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { approveReview, reviewIsCurrent } from "./review.ts";

const reviewed = {
  sourceTextSha256: "source-hash",
  dateMode: "year",
  redactedText: "[NAME] visited in 2024",
  findings: [{ start: 0, end: 10, category: "name", accepted: true, source: "openmed" }],
};

test("approval binds to every reviewed input", async () => {
  const approval = await approveReview(reviewed, new Date("2026-08-22T12:00:00Z"));
  assert.equal(await reviewIsCurrent(approval, reviewed), true);
  assert.equal(await reviewIsCurrent(approval, { ...reviewed, dateMode: "relative" }), false);
  assert.equal(await reviewIsCurrent(approval, { ...reviewed, sourceTextSha256: "other" }), false);
  assert.equal(await reviewIsCurrent(approval, { ...reviewed, findings: [] }), false);
});
```

**Step 2: Run the test to verify it fails**

```bash
node --experimental-strip-types --test src/lib/phi/review.test.ts
```

Expected: FAIL because the review module does not exist.

**Step 3: Implement SHA-256 review fingerprints**

Implement:

```ts
export type ReviewApproval = {
  approvedAt: string;
  dateMode: DateMode;
  redactedSha256: string;
  reviewSha256: string;
};

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Canonicalize sourceTextSha256, dateMode, redactedSha256, and findings sorted
// by start/end/category/accepted/source. Never put original finding text in the
// canonical review key or export it.
export async function reviewFingerprint(input: ReviewedRepresentation): Promise<string>;
export async function approveReview(input: ReviewedRepresentation, now = new Date()): Promise<ReviewApproval>;
export async function reviewIsCurrent(approval: ReviewApproval | null, input: ReviewedRepresentation): Promise<boolean>;
```

**Step 4: Wire approval into Harbor**

In `HarborApp`:

- remove the automatic `createReport(true, ...)` call from `runPipeline()`;
- add `approval`, `approvedReviewKey`, and monotonic `summaryRequestId` state;
- calculate the canonical review key defined above;
- invalidate approval, summary, and pending summary identity when the source file/sample, findings, accepted flags, date mode, or redacted text changes or the workflow resets;
- add an explicit `Approve redactions` action;
- prevent copy-clean, `createReport()`, and final export unless approval matches;
- change report input from hardcoded date mode `"keep"` to the selected `dateMode`.

The guard must be present in code, not only represented by a disabled button:

```ts
if (!approval || approvedReviewKey !== reviewKey) {
  setReportError("Review and approve the redactions before creating a summary.");
  return;
}
```

Capture an immutable `{ requestId, reviewSha256 }` immediately before starting a summary. After every `await`, compare both to the current request/approval before committing response or error state. A response for an invalidated review must be discarded.

Pass `{ redactedText, redactedSha256, dateMode }` to the server summary function. The server recomputes SHA-256 over the received redacted text and rejects a mismatch before calling OpenRouter. This is defense-in-depth; the browser remains the primary consent boundary.

**Step 5: Update UI text**

Simple mode must say: add file → review highlights → approve → optionally create summary/download. It must not promise that Harbor automatically writes or sends a report.

The OpenRouter disclosure must describe the selected date behavior precisely: `relative` sends relative-day text, `year` sends years only, and `keep` sends retained clinical dates. Do not always say that clinical dates are sent. Add UI assertions for all three modes.

**Step 6: Run focused and full tests**

```bash
node --experimental-strip-types --test src/lib/phi/review.test.ts
npm test
npm run typecheck
npm run lint
```

Expected: all pass.

**Step 7: Commit**

Use partial staging for the Task 3 test-list hunk in `package.json`.

```bash
git add src/lib/phi/review.ts src/lib/phi/review.test.ts src/components/harbor-app.tsx src/components/harbor-panels.tsx
git add -p package.json
git commit -m "feat: require review before Harbor summary generation"
```

### Task 4: Version the portable Harbor export

**Files:**
- Modify: `src/lib/phi/export.ts`
- Create: `src/lib/phi/export.test.ts`
- Modify: `src/components/harbor-app.tsx`
- Modify: `src/lib/openrouter.ts`
- Modify: `src/lib/report.ts`
- Modify: `package.json`

**Step 1: Define the v2 test fixture and failing assertions**

Create `src/lib/phi/export.test.ts` asserting:

```ts
test("v2 export carries review and summary provenance without source PHI", async () => {
  const result = await buildExport({
    extracted: {
      fileName: "Wayne_Satz_MyChart.docx",
      kind: "docx",
      pageCount: null,
      text: "Wayne Satz visited Example Hospital",
      pages: [{ pageNumber: 1, text: "Wayne Satz visited Example Hospital" }],
      hasTextLayer: true,
    },
    spans: [/* accepted name and organization fixtures */],
    dateMode: "year",
    detectors: ["openmed", "regex"],
    openMed: {
      status: "ready",
      device: "webgpu",
      variant: "fp16",
      model: OPENMED_MODEL,
      revision: OPENMED_MODEL_REVISION,
      runtimeVersion: OPENMED_RUNTIME_VERSION,
    },
    approval,
    summary: {
      status: "generated",
      text: "Portable summary",
      requestedModel: "provider/model",
      actualModel: "provider/model",
      promptVersion: HARBOR_SUMMARY_PROMPT_VERSION,
      requestedAt: "2026-08-22T12:00:30.000Z",
      completedAt: "2026-08-22T12:01:00.000Z",
    },
  }, new Date("2026-08-22T12:02:00.000Z"));

  assert.equal(result.json.schema, "harbor-clinical-extract-v2");
  assert.equal(result.json.review.approved, true);
  assert.equal(result.json.source.kind, "docx");
  assert.equal("fileName" in result.json.source, false);
  assert.doesNotMatch(JSON.stringify(result.json), /Wayne Satz|Example Hospital/);
  assert.doesNotMatch(result.markdown, /Wayne Satz|Example Hospital|MyChart/);
  assert.doesNotMatch(result.fileNames.json, /Wayne|Satz|MyChart/);
  assert.match(result.json.extractId, /^harbor_extract_[a-f0-9]{32,64}$/);
  assert.match(result.json.artifactId, /^harbor_[a-f0-9]{32,64}$/);
});
```

The fixture must use realistic spans so the redacted text contains tokens and no original PHI.

**Step 2: Run the test to verify it fails**

```bash
node --experimental-strip-types --test src/lib/phi/export.test.ts
```

Expected: FAIL because the v2 schema and metadata do not exist.

**Step 3: Version the prompt**

In `src/lib/openrouter.ts` add:

```ts
export const HARBOR_SUMMARY_PROMPT_VERSION = "portable-clinical-summary-v1";
```

Return the actual selected model from both server and browser summary paths so Harbor can store summary provenance. Model failures/refusals must return a safe status envelope rather than keys, raw provider responses, or unrestricted error strings.

**Step 4: Implement `HarborExportV2`**

Use `sha256Hex` from the review module. Make `buildExport()` asynchronous and define a v2 shape containing:

```ts
export type HarborExportV2 = {
  schema: "harbor-clinical-extract-v2";
  extractId: string;
  artifactId: string;
  generatedAt: string;
  source: {
    kind: "pdf" | "docx";
    label: "Imported PDF" | "Imported DOCX";
    pageCount: number | null;
    extractedTextSha256: string;
  };
  deid: {
    method: "safe_harbor_plus_review";
    dateMode: DateMode;
    detectors: string[];
    openMed: {
      status: "ready" | "degraded";
      device: OpenMedDevice | null;
      variant: "fp16" | "int8" | null;
      model: string;
      revision: string;
      runtimeVersion: string;
    };
    deterministicRulesetVersion: string;
    accepted: number;
    totalFindings: number;
  };
  review: {
    approved: true;
    approvedAt: string;
    redactedSha256: string;
  };
  findings: { category: string; total: number; accepted: number }[];
  redactedText: string;
  summary: HarborSummaryExport | null;
};
```

Define the summary envelope for every attempted run:

```ts
type HarborSummaryExport = {
  status: "generated" | "failed" | "refused" | "cancelled";
  requestedAt: string;
  completedAt: string | null;
  requestedModel: string;
  actualModel: string | null;
  promptVersion: string;
  safeErrorCategory?: "network" | "provider" | "refusal" | "invalid_response" | "cancelled";
  text?: string;
};
```

Retain a failure/refusal envelope when a summary was attempted. Never save an API key, request headers, raw provider response, or provider error body.

Derive `extractId` from the schema version, source-text hash, canonical approved review digest, and date policy. Derive the full `artifactId` from `extractId` plus the canonical summary digest/provenance, so two summary runs cannot silently collide. Exclude generation time from the extract identity; inject `now` into `buildExport(input, now = new Date())` so tests are deterministic.

Do not include raw filenames or `PhiSpan.text` values. If a future consumer needs detailed finding provenance, provide detector/category/count information, not original PHI surfaces.

**Step 5: Update every download surface**

Make `exportFiles()` async. It must require a current approval, await `buildExport()`, then download v2 Markdown and JSON using only the artifact identity, for example `harbor_<digest>.json` and `.md`. Raw source filenames must not appear in JSON, Markdown, metadata, or output filenames.

Remove the UI action that downloads the four original extractor outputs for real documents, because those files can retain unredacted PHI. If it remains useful for development, restrict it to an explicit synthetic-data diagnostic build and test that it is absent for imported documents.

**Step 6: Run focused tests**

```bash
node --experimental-strip-types --test src/lib/phi/review.test.ts src/lib/phi/export.test.ts
npm run typecheck
```

Expected: PASS.

**Step 7: Run full gates**

```bash
npm test
npm run lint
git diff --check
```

Expected: all pass.

**Step 8: Commit**

Use partial staging for the Task 4 test-list hunk in `package.json`.

```bash
git add src/lib/phi/export.ts src/lib/phi/export.test.ts src/components/harbor-app.tsx src/lib/openrouter.ts src/lib/report.ts
git add -p package.json
git commit -m "feat: export reviewed Harbor artifacts with provenance"
```

### Task 5: Add browser-level consent and export proof

**Files:**
- Create: `scripts/harbor-review-contract.test.mjs`
- Create: `scripts/harbor-consent-browser.test.mjs`
- Modify: `package.json`
- Modify: `src/components/harbor-app.tsx` only for `data-testid` hooks
- Modify: `src/components/harbor-panels.tsx` only for `data-testid` hooks

**Step 1: Write a failing source-level consent contract**

The contract must verify:

- `runPipeline()` contains no `createReport(true` call;
- summary and export handlers contain current-approval guards;
- report input uses the selected date mode rather than literal `"keep"`;
- buttons expose stable `data-testid` values for browser QA.

This source contract is a regression tripwire, not the only behavioral proof.

**Step 2: Run it to verify it fails**

```bash
node --test scripts/harbor-review-contract.test.mjs
```

Expected: FAIL until the required hooks/guards are present.

**Step 3: Add minimal stable hooks**

Use:

```tsx
data-testid="approve-redactions"
data-testid="create-summary"
data-testid="download-artifact"
data-testid="review-status"
```

Do not restructure the visual system merely to satisfy testing.

**Step 4: Write a failing Playwright consent-race test**

Run Harbor in a managed local dev-server process. In `harbor-consent-browser.test.mjs`:

- use the bundled synthetic sample; abort the OpenMed CDN request so deterministic-only degraded mode is explicit and repeatable;
- intercept both Harbor's server report route and direct `https://openrouter.ai/**` calls, and count requests;
- assert zero report/OpenRouter requests after detection and before approval;
- assert summary, clean-copy, and artifact-download actions are blocked before approval;
- approve, begin a summary, hold the mocked response, then change the date mode or accepted finding;
- release the response and assert that stale summary text is not displayed or exported;
- assert the review status returns to unapproved and requires a new approval;
- reapprove, return a safe mocked summary, download JSON/Markdown, and assert contents and filenames contain no fixture PHI/source filename;
- reset/load another sample and assert approval is cleared.

The browser test is the consent proof. The source-level contract remains only a fast structural tripwire.

**Step 5: Run the focused and full suites**

```bash
node --test scripts/harbor-review-contract.test.mjs
npm run test:consent-browser
npm test
npm run typecheck
npm run lint
```

Expected: all pass.

**Step 6: Commit**

```bash
git add scripts/harbor-review-contract.test.mjs scripts/harbor-consent-browser.test.mjs src/components/harbor-app.tsx src/components/harbor-panels.tsx
git add -p package.json
git commit -m "test: lock Harbor review and consent boundaries"
```

### Task 6: Reconcile deployment and platform cleanup

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Modify: `scripts/grok-pwa-plugin.test.mjs`
- Modify: `src/lib/app-data/client.server.ts`
- Modify: `src/lib/auth/use-current-user.ts`
- Modify: `PROGRESS.md`
- Modify: `DECISIONS.md` only if a new decision is required

**Step 1: Inspect every remaining tracked diff**

Run:

```bash
git status --short
git diff -- package.json vite.config.ts scripts/grok-pwa-plugin.test.mjs src/lib/app-data/client.server.ts src/lib/auth/use-current-user.ts
```

Classify each hunk as one of:

- Fly/Nitro runtime repair owned by this task;
- PWA/auth/typecheck repair with independent evidence and appropriate ownership;
- unrelated pre-existing work that must remain unstaged.

Do not bundle all remaining dirty files simply because the build passes. Inspect the exact cached patch and preserve the provenance of unrelated pending changes.

**Step 2: Verify the Fly runtime contract test**

Run:

```bash
node --test scripts/deployment-contract.test.mjs
```

Expected: PASS with `start` using `.output/server/index.mjs` and Nitro accepting `NITRO_PRESET`.

**Step 3: Run all static gates and build**

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Expected: all exit 0 and the Nitro output exists.

**Step 4: Update project truth**

In `PROGRESS.md`, record:

- exact test count;
- typecheck/lint/build result;
- DOCX support;
- WebGPU-first/WASM fallback implementation status;
- whether real OpenMed inference was proven;
- mandatory review boundary;
- v2 export contract;
- Fly and DNS status as separate facts;
- unresolved dependency advisories.

Do not claim custom-domain completion or real WebGPU inference without direct proof.

**Step 5: Commit the Fly runtime repair separately**

```bash
git add -p package.json vite.config.ts
git add scripts/deployment-contract.test.mjs PROGRESS.md
git diff --cached --check
git commit -m "chore: reconcile Harbor runtime and deployment contract"
```

Only include files/hunks directly necessary for the tested Fly/Nitro contract. If the PWA/auth/typecheck repairs are still needed and demonstrably Harbor-owned, make a second bounded commit with their own focused tests; otherwise leave them untouched. If `DECISIONS.md` changes, stage it only after reviewing that it records a genuinely new decision rather than progress.

### Task 7: Perform local release verification

**Files:**
- Modify: `PROGRESS.md`
- Add screenshots only when they contain synthetic data and are selected deliberately

**Step 1: Start the canonical dev server in a managed session**

Run:

```bash
npm run dev
```

Expected: the specifically captured process serves `http://127.0.0.1:8080/`. Wait for the URL to respond. Do not kill unrelated Node processes; stop only this process after the dev checks.

**Step 2: Run the combined browser smoke**

```bash
node scripts/browser-smoke.mjs http://127.0.0.1:8080/ screenshots/assessment-dev.png
```

Expected: desktop and mobile render visible Harbor content, no page/console errors, no horizontal overflow.

Visually inspect both generated screenshots. A JSON pass alone is insufficient.

**Step 3: Exercise the real Harbor flow with synthetic data**

Verify in a browser:

1. PDF sample reaches review;
2. summary is not sent or created automatically;
3. summary action is blocked before approval;
4. approval enables summary/export;
5. changing a finding or date policy invalidates approval and summary;
6. export JSON is v2, contains no source filename or original PHI, and includes provenance;
7. OpenRouter failure does not block export.

**Step 4: Prove OpenMed runtime honestly**

With network access available, load OpenMed and record the actual device shown by Harbor. If WebGPU fails and WASM succeeds, record that exact outcome. If the model cannot download or inference cannot be completed, keep the release gate explicitly unproven; do not infer success from structural tests.

**Step 5: Verify the built application**

```bash
npm run build
npm run preview -- --host 127.0.0.1 --port 8081
```

Start preview in a second managed background session, wait for `http://127.0.0.1:8081/`, then run:

```bash
node scripts/browser-smoke.mjs http://127.0.0.1:8081/ screenshots/assessment-built.png --baseline screenshots/assessment-dev.json
```

Expected: built output matches the dev baseline without blank rendering, console errors, or material divergence. Stop only the preview process started by this task.

**Step 6: Record and commit release evidence**

Update `PROGRESS.md` with commands and exact results. Do not add screenshots containing real medical content.

```bash
git add PROGRESS.md
git commit -m "docs: record Harbor local release verification"
```

### Task 8: Production deployment checkpoint

**Files:**
- Modify: `PROGRESS.md`

**Step 1: Stop for explicit production authorization**

Fly deployment and DNS changes are external production actions. Present the verified local release evidence and request explicit authorization before running either.

**Step 2: Deploy only after authorization**

```bash
flyctl deploy -a harbor-safe-phi
```

Expected: deployment succeeds and the Fly health/render checks return the newly built Harbor UI.

**Step 3: Verify production without uploading PHI**

Use the synthetic sample only. Confirm HTTP 200, visible content, clean console, PDF/DOCX affordance, mandatory approval, and local OpenMed behavior.

**Step 4: Treat DNS separately**

Verify `harbor.dnasedlongevity.com` only after its DNS record exists. Do not modify the existing eMedGen domains. If DNS access is unavailable, record the exact pending record instead of claiming the subdomain is live.

**Step 5: Record deployment truth**

Update `PROGRESS.md` with Fly app version, verification commands/results, OpenRouter secret status without secret values, and DNS state.

```bash
git add PROGRESS.md
git commit -m "docs: record Harbor production verification"
```

## Final acceptance

Harbor is complete for this scope only when:

- PDF and DOCX work locally;
- OpenMed is WebGPU-first with tested WASM fallback and honestly recorded runtime proof;
- no OpenRouter call can precede explicit approval;
- changing redactions or date policy invalidates approval and summary;
- Markdown and v2 JSON exports remain usable without OpenRouter or M-Vault;
- JSON, Markdown, and download filenames contain provenance identifiers and exclude raw source filenames/PHI surfaces;
- summary failures/refusals retain only the safe provenance envelope;
- tests, typecheck, lint, build, dev smoke, and built smoke pass;
- eMedGen, SNP, and M-Vault backend files remain unchanged;
- production and DNS claims are made only after separate live verification.
