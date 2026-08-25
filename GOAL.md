# GOAL.md — Finish Harbor PHI Removal and Optional Summary

Date: 2026-08-24

Status: active mitigation goal

Repository: `/Volumes/WS4TB/Harboredactor`

## Outcome

Finish Harbor as a usable medical-document redaction and summarization feature:

1. a user selects a text-bearing PDF or DOCX;
2. Harbor extracts the text locally in the browser;
3. Harbor identifies candidate PHI using curated deterministic rules plus the
   pinned local OpenMed model when available;
4. the user reviews, adds, rejects, and approves redactions;
5. the user can manually download the approved redacted record without using
   any external AI service;
6. as a separate optional action, the user can send exactly the approved,
   displayed redacted payload to OpenRouter and receive a constrained clinical
   summary; and
7. the user can download a versioned artifact containing the approved redacted
   text and, when requested successfully, its summary.

Raw documents and unredacted extracted text remain ephemeral browser state.
They are not uploaded to Harbor, OpenRouter, Fly, M-Vault, or eMedGen.

Harbor remains a de-identification aid requiring human review. This goal does
not claim HIPAA certification, perfect real-world recall, clinical validation,
or suitability for unattended processing.

## Why this goal exists

The prior implementation sequence hardened intake, runtime state, approval
fingerprints, deployment, and provenance before establishing the central proof:
that the shipped browser workflow reliably redacts a defined synthetic PHI
corpus and can run the real OpenMed model.

This goal corrects that sequence. Redaction efficacy and consent boundaries are
P0. Rich integration and deployment remain deferred until those gates pass.

## Source-of-truth relationship

This file is the active execution contract. The approved design in
`docs/plans/2026-08-22-harbor-local-redaction-summary-design.md` remains valid
except where this goal narrows or reorders work. The older implementation plan
is historical guidance, not permission to continue Tasks 4–8 automatically.

Before implementation, read in this order when present:

1. `GOAL.md`
2. `STANDARDS.md`
3. `IMPLEMENT.md`
4. `DECISIONS.md`
5. `PROGRESS.md`
6. `TASK_QUEUE.md`

Record verified results in `PROGRESS.md`. Record only durable architectural or
privacy decisions in `DECISIONS.md`.

## Verified baseline

- Local `main` currently ends at `6d018f7` and is 13 commits ahead of
  `origin/main`.
- PDF/DOCX extraction, input limits, unreadable-document rejection, and
  no-automatic-summary behavior are implemented.
- OpenMed is configured WebGPU-first with WASM fallback and deterministic-only
  degraded mode. Runtime state and concurrency behavior are unit tested.
- A review approval fingerprint and guards before summary/copy/download are
  implemented.
- The last recorded committed verification passed 245 tests, typecheck, lint,
  and production build.
- Real browser OpenMed inference has not been proven.
- No curated synthetic PHI evaluation report or release threshold exists.
- The current v1 export includes the raw source filename.
- The shipped UI still exposes an original extractor-comparison download.
- The summary path currently attempts an unauthenticated owner-funded server
  endpoint before falling back to a browser-supplied OpenRouter key.
- Task 3 is not quality-approved because important privacy, stale-state,
  payload, and provider-error findings remain open.
- GitHub push, Fly deployment, DNS, and M-Vault integration are not part of
  this mitigation run.

Do not silently absorb the existing uncommitted six-file platform diff or
screenshots. Classify and stage every hunk deliberately.

## Non-negotiable privacy invariants

1. Source files and unredacted extracted text never leave the browser.
2. Detection and redaction complete without OpenRouter, a Harbor server, or
   M-Vault.
3. Summary generation is never automatic.
4. The exact payload shown to and approved by the user is the payload sent to
   OpenRouter. Trimming, date conversion, normalization, or truncation must
   happen before display, fingerprinting, and approval.
5. Any change to source, findings, accepted flags, added redactions, date mode,
   or canonical summary payload invalidates approval and any prior summary.
6. Redacted export remains available when OpenMed or OpenRouter fails.
7. No raw filename, original PHI surface text, API key, provider response body,
   or unredacted debugging extract appears in downloads, logs, errors, or
   telemetry.
8. Deterministic-only operation is visibly labeled as degraded. Availability
   detection or mocked inference is not proof of real OpenMed execution.
9. Only synthetic fixtures may be committed or used for automated/browser
   verification.
10. No eMedGen, SNP, M-Vault backend, authentication, database, Fly, DNS, or
    production changes are authorized by this goal.

## Credential decision for this goal

The public Harbor build must not expose an unauthenticated, owner-funded
OpenRouter endpoint.

For this mitigation run, optional summaries use a key explicitly supplied by
the user in the browser. The key must remain in memory for the current page
unless the user explicitly chooses a separately reviewed persistence option;
it must not be written to local storage, exported, logged, or sent to Harbor.

Remove or disable the owner-funded server summary path in the public build. If
direct browser-to-OpenRouter requests cannot be proven to work, stop and record
the blocker. Do not silently restore the public server-funded route. A future
owner-funded service requires a separately approved access-control, rate-limit,
abuse, and budget design.

## Assumptions to verify

### A-001 — The pinned OpenMed model can execute in a supported browser

- Source: model metadata and current loader configuration.
- Risk: high; model metadata and mocked loader tests do not prove runtime use.
- Status: unverified.
- Verification: H-003 real built-browser inference through WebGPU or WASM.

### A-002 — Direct browser-to-OpenRouter summary calls are supported

- Source: the current Complex-mode fallback implementation.
- Risk: high; browser policy or provider behavior could make the safe
  user-funded path unusable.
- Status: unverified.
- Verification: H-006 browser network test using a user-supplied test key or a
  provider-compatible controlled endpoint without exposing the credential.

### A-003 — Synthetic evidence is an appropriate bounded release gate

- Source: repository privacy rule forbidding real patient data and the need for
  reproducible expected spans.
- Risk: medium; synthetic success can overstate real-world performance.
- Status: accepted only as bounded engineering evidence.
- Verification: H-002 reports per-category results and all user-facing/release
  language retains mandatory human review and known limitations.

### A-004 — Manual download is sufficient for current app integration

- Source: approved Harbor design and the user's decision to limit integration
  to the M-Vault artifact boundary.
- Risk: low; a later consumer may require an adapter or schema change.
- Status: accepted for this goal.
- Verification: H-007 round-trip parsing of the v2 JSON artifact without an
  M-Vault endpoint.

## Known process failures and controls

- E-001 — Scope expansion before core proof. Control: finish all P0 evidence
  gates before export enrichment, deployment, or integration work.
- E-002 — Structural or mocked tests mistaken for runtime proof. Control: real
  built-browser inference and network observation are explicit completion
  gates.
- E-003 — Repeated review/correction loops. Control: one spec review, one
  quality/security review, and at most two bounded correction passes per task.
- E-004 — Dirty-tree staging risk. Control: partial staging and cached-diff
  inspection before every commit; never stage the repository wholesale.
- E-005 — External workspace permission stalls. Control: run the implementation
  session with Harbor as the writable workspace root when possible. Otherwise
  batch bounded Harbor operations and stop after repeated tool-boundary stalls
  instead of retrying indefinitely.
- E-006 — Documentation/runtime contradiction. Control: README, UI disclosure,
  code path, tests, `DECISIONS.md`, and `PROGRESS.md` must name the same
  credential and data-flow architecture before completion.

## Mitigation task queue

Tasks execute in ID order unless a dependency explicitly permits otherwise.
P0 tasks must all pass before P1 work starts.

### H-001 — Freeze and reconcile the Harbor baseline

- Priority: P0
- Category: governance / correctness
- Owner: Codex
- Source finding: local branch is ahead 13 commits and the worktree contains a
  separate uncommitted platform/UX diff and screenshots.
- Affected surfaces: git state, `PROGRESS.md`, `DECISIONS.md` when required.
- Acceptance criteria:
  - record HEAD, branch divergence, and exact dirty files before editing;
  - classify each existing hunk as prior Harbor work, unrelated user work, or
    mitigation-owned work;
  - preserve unrelated changes and never stage the whole worktree;
  - confirm no file outside this repository changes.
- Verification:
  - `git status --short --branch`
  - `git diff --check`
  - inspect `git diff --cached` before every commit.
- Dependency: none.
- Safety/rollback: documentation and partial staging only; do not reset,
  checkout, clean, or delete user work.

### H-002 — Create the curated synthetic PHI evaluation corpus

- Priority: P0
- Category: correctness / tests / data
- Owner: Codex
- Source finding: no quantitative evidence currently shows what PHI the
  combined detector misses or over-redacts.
- Affected surfaces: new synthetic fixtures and focused evaluation tests;
  `src/lib/phi/detect.ts` only after failures are demonstrated.
- Acceptance criteria:
  - create versioned, visibly synthetic fixtures for every identifier category
    supported by Harbor's curated rules and OpenMed mapping;
  - include adversarial formatting such as split lines, punctuation, initials,
    mixed case, labels without colons, duplicate identifiers, dates, ages,
    facilities, account/member/record identifiers, phone/email/address data,
    and clinically meaningful near-misses;
  - include expected spans and exact expected redacted output;
  - every seeded identifier is absent from final approved test output;
  - protected clinical terms and numeric values in the negative controls remain
    intact unless explicitly expected;
  - generate a machine-readable evaluation report with counts by category,
    misses, false positives, and engine used;
  - fixtures contain no copied or real patient data.
- Verification:
  - add and pass `npm run test:phi-eval`;
  - scan fixture and result files for forbidden seeded surfaces;
  - independent review confirms fixtures are synthetic and assertions are not
    tautological.
- Dependency: H-001.
- Safety/rollback: rules change only in response to a failing named fixture;
  revert any rule that increases leakage or breaks protected negative controls.

### H-003 — Prove real OpenMed inference in the browser

- Priority: P0
- Category: dependency / correctness / tests
- Owner: Codex
- Source finding: loader and state tests use controlled engines; they do not
  establish successful model download and inference in the shipped browser.
- Affected surfaces: OpenMed loader, browser proof script, synthetic fixture,
  runtime provenance UI.
- Acceptance criteria:
  - execute the immutable pinned OpenMed model through the production browser
    bundle on a synthetic fixture;
  - at least one supported real inference path must complete successfully;
  - attempt WebGPU first and record the actual result; exercise WASM fallback
    when WebGPU is absent or intentionally failed;
  - prove inference returns a candidate span used by the combined detector;
  - record model ID, revision, OpenMed version, device, variant, duration, and
    final status without recording document text;
  - prove model download is the only detection-related network request and no
    document payload is transmitted;
  - retain a prominent deterministic-only warning when all model paths fail.
- Verification:
  - add and pass `npm run test:openmed-browser` on the built application;
  - retain focused WebGPU-first/WASM fallback unit tests;
  - visually inspect the actual engine/status shown by the UI.
- Dependency: H-002 supplies the synthetic input.
- Blocker rule: if the public pinned model cannot execute in a supported
  browser, stop and document the exact failure. A model replacement is a new
  decision requiring a verified public revision and updated proof.
- Safety/rollback: never use a real chart for runtime proof.

### H-004 — Make the approved redacted payload canonical

- Priority: P0
- Category: security / correctness / architecture
- Owner: Codex
- Source findings: current summary code approves raw redacted text but later
  trims/prepares it; asynchronous approval errors may target newer review
  state; payload size is not bounded before server hashing.
- Affected surfaces: `src/lib/phi/review.ts`, `src/lib/phi/packet.ts`,
  `src/components/harbor-app.tsx`, related tests.
- Acceptance criteria:
  - define one pure canonical-payload function used by preview, SHA-256,
    approval, transmission, and export;
  - perform date transformation, normalization, length limits, and any
    truncation before approval;
  - display truncation and exact transmitted character count before approval;
  - bind approval to source hash, findings, date policy, and canonical payload;
  - bound source text, redacted text, findings count, and field lengths before
    hashing or network work;
  - use generation/request identities so stale success and stale failure cannot
    mutate a newer review;
  - approval cannot be activated until its fingerprint is complete;
  - clipboard failures produce a safe bounded message.
- Verification:
  - state-machine tests cover approve, edit, date change, reset, overlapping
    approvals, overlapping summaries, stale success, and stale failure;
  - unit tests prove displayed payload hash equals transmitted payload hash;
  - `npm test` and `npm run typecheck` pass.
- Dependency: H-001.
- Safety/rollback: redacted download must remain possible even if summary-state
  code fails.

### H-005 — Close every raw-PHI output and error path

- Priority: P0
- Category: security / UX
- Owner: Codex
- Source findings: the current Complex UI can download original extractor
  output; v1 export and filenames include the source filename; raw provider
  errors may be surfaced.
- Affected surfaces: `src/components/harbor-app.tsx`,
  `src/components/harbor-panels.tsx`, `src/lib/phi/export.ts`, provider parsing
  and UI error handling.
- Acceptance criteria:
  - remove original extractor-comparison download from the shipped UI;
  - no raw or unreviewed copy/download action remains;
  - filenames use a generated artifact ID rather than the source filename;
  - exported JSON and Markdown exclude source filename and original finding
    surface text;
  - provider/refusal/network errors map to bounded Harbor-owned messages and
    never reproduce response bodies or submitted text;
  - no API key is included in logs, thrown errors, storage, or export.
- Verification:
  - tests scan JSON, Markdown, filenames, errors, and browser downloads for all
    seeded PHI and source labels;
  - source-level tripwire proves no original-extract download handler is wired;
  - browser network/log inspection finds no unredacted document text.
- Dependencies: H-002 and H-004.
- Safety/rollback: retain developer diagnostics only when they contain metadata
  and counts, never document contents.

### H-006 — Finish optional user-funded summarization

- Priority: P1
- Category: security / correctness / UX
- Owner: Codex
- Source findings: the public owner-funded route is abuseable; consent and
  stale-response behavior are not browser-proven.
- Affected surfaces: OpenRouter client/server path, summary panel, summary
  prompt/parser, consent browser tests, README.
- Acceptance criteria:
  - public summary generation uses only a browser-supplied OpenRouter key;
  - the key is masked, kept in page memory, and cleared on reset/refresh;
  - owner-funded server configuration is not advertised or attempted by the
    public client;
  - no request occurs before current approval and explicit `Create summary`;
  - request body contains exactly the canonical approved payload and selected
    model, with bounded token and character limits;
  - summary prompt instructs the model to summarize only supplied content and
    not add diagnoses, recommendations, citations, or external facts;
  - empty, refused, malformed, rate-limited, network-failed, or stale responses
    do not replace safe state or block redacted export;
  - changing review inputs immediately invalidates the summary;
  - UI clearly states that approved redacted text and the supplied key go
    directly to OpenRouter.
- Verification:
  - add and pass `npm run test:consent-browser`;
  - before approval: zero OpenRouter requests;
  - after one explicit action: exactly one request with the approved hash;
  - race test holds a response, mutates review state, releases it, and proves
    the response is discarded;
  - test safe handling for refusal, raw-body PHI echo, 429, empty output, and
    network failure.
- Dependencies: H-004 and H-005.
- Blocker rule: if direct browser OpenRouter use is not supported, stop and
  report it; do not re-enable an unauthenticated owner-funded proxy.
- Safety/rollback: disable summary while preserving local redaction, review,
  copy, and export.

### H-007 — Ship a PHI-safe versioned manual export

- Priority: P1
- Category: architecture / correctness / integration
- Owner: Codex
- Source finding: the existing v1 artifact leaks raw source labels and lacks the
  completed approval/model/summary provenance contract.
- Affected surfaces: `src/lib/phi/export.ts`, export tests, Harbor UI.
- Acceptance criteria:
  - introduce `harbor-clinical-extract-v2` without changing v1 semantics;
  - include generated artifact ID, generation time, sanitized source hash,
    document kind/page count, detector versions, actual OpenMed status/device,
    date policy, approval hash/time, category counts, approved redacted text,
    and optional summary provenance/status;
  - exclude raw source filename, raw findings, source PHI, API keys, and provider
    response bodies;
  - generate equivalent Markdown and JSON from one immutable approved snapshot;
  - export works with no OpenRouter key and after any summary failure;
  - download remains the complete Harbor-to-M-Vault boundary; no M-Vault API is
    added.
- Verification:
  - exact schema tests and round-trip parsing test;
  - JSON, Markdown, and filenames contain none of the synthetic forbidden
    surfaces;
  - stale approval/export browser race is rejected;
  - `npm test` and `npm run typecheck` pass.
- Dependencies: H-004, H-005, and H-006 summary provenance shape.
- Safety/rollback: retain v1 parser compatibility if one exists; new exports
  default to v2 only after all v2 tests pass.

### H-008 — Prove the complete user workflow and release locally

- Priority: P1
- Category: tests / release readiness / documentation
- Owner: Codex
- Source finding: unit/build evidence exists, but the complete approved
  redaction, optional summary, safe export, and built-browser workflow has not
  been proven end to end.
- Affected surfaces: browser tests, `README.md`, `PROGRESS.md`, and
  `DECISIONS.md` only when required.
- Acceptance criteria:
  - complete PDF and DOCX synthetic flows in desktop and mobile browsers;
  - prove local extraction, combined detection, manual correction, approval,
    redacted copy/download, optional summary, and v2 export;
  - prove unreadable/image-only input fails clearly without summary/network
    activity;
  - prove deterministic-only mode remains usable and visibly degraded;
  - inspect the built application, not only the dev server;
  - reconcile README with the user-supplied-key architecture;
  - update progress with exact commands, counts, model/device result, known
    limitations, and unresolved advisories;
  - no screenshot or fixture contains real medical information;
  - no production deploy, push, DNS change, or M-Vault implementation occurs.
- Verification commands that must pass:
  - `npm run test:phi-eval`
  - `npm run test:openmed-browser`
  - `npm run test:consent-browser`
  - `npm test`
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build`
  - dev desktop/mobile browser smoke
  - built desktop/mobile browser smoke
  - `git diff --check`
- Dependencies: H-002 through H-007.
- Safety/rollback: production remains unchanged. Present the local release
  evidence and ask for separate authorization before push or deployment.

## Proof of done

This goal is complete only when all of the following are true:

1. Every H-001 through H-008 acceptance criterion is evidenced in
   `PROGRESS.md`.
2. The curated synthetic corpus has zero seeded-PHI leakage in every expected
   final redacted output and export. Misses and false positives are reported by
   category rather than hidden in an aggregate score.
3. A real OpenMed inference completes in the built browser through at least one
   supported device path, with the exact result recorded. If this cannot be
   achieved, the goal remains blocked rather than being relabeled complete.
4. The combined deterministic/OpenMed workflow is usable when OpenRouter is
   absent.
5. The user can review, edit, approve, copy, and manually download redacted
   output without external transmission.
6. No external summary request can occur before explicit approval and explicit
   summary action.
7. The request sent to OpenRouter is byte-for-byte the canonical payload shown
   before approval, aside from the fixed prompt wrapper whose version is
   recorded.
8. The user-supplied key is not persisted, logged, exported, or sent to Harbor.
9. Summary failures and stale responses never block or contaminate redacted
   export.
10. v2 JSON, Markdown, filenames, logs, errors, screenshots, and test artifacts
    contain no seeded PHI, raw source filename, raw finding text, or API key.
11. All automated, type, lint, build, dev-browser, and built-browser gates pass.
12. The final diff changes only Harbor-owned files and preserves unrelated dirty
    work.
13. `PROGRESS.md` distinguishes automated/synthetic evidence from real-world or
    clinical claims and lists remaining limitations honestly.

Passing this goal proves a bounded, human-reviewed Harbor workflow against its
versioned synthetic evidence. It does not prove that arbitrary medical records
are free of PHI without human review.

## Execution discipline and token/time controls

- Work one task ID at a time. Do not start the next task until its acceptance
  criteria and focused tests pass.
- Use test-first changes for every defect or privacy invariant.
- Keep one orchestrator responsible for the shared review/payload/export state
  machine. Delegate only independent fixture creation or read-only review after
  interfaces are fixed.
- Perform one specification review and one quality/security review per task.
  A second correction pass is allowed; after two failed passes, stop, document
  the recurring blocker, and reassess rather than continuing an open-ended
  loop.
- Report a checkpoint after all P0 tasks before beginning P1 work.
- Do not add deployment, authentication, server storage, M-Vault integration,
  OCR, new model selection, visual redesign, or unrelated platform cleanup.
- Never claim progress from a mocked model path, structural test, HTTP 200, or
  build alone.
- Commit in bounded slices and inspect the staged patch before each commit.

## Stop conditions

Stop and report the exact blocker if any of these occurs:

- a task requires real PHI or a user medical record for testing;
- the pinned model cannot be downloaded or execute through any supported
  browser path after bounded diagnosis;
- direct browser OpenRouter use cannot be proven;
- a requested fix would require an unauthenticated owner-funded API endpoint;
- a privacy invariant fails after two correction passes;
- a dependency/model change would alter architecture or evidence meaning;
- credentials, production deployment, DNS, GitHub push, destructive cleanup,
  or files outside Harbor are required;
- legal/compliance interpretation beyond the existing human-review aid
  positioning is required.

## Post-goal checkpoint

After local completion, report the evidence and wait. GitHub push, Fly
deployment, custom-domain DNS, and any M-Vault adapter require separate user
authorization and separate live verification.
