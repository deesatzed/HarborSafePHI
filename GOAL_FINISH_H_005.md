# Finish H-005 — Close Every Raw-PHI Output and Error Path

## Objective

Finish and prove H-005 in the active Harbor checkout. This goal is limited to
closing raw-PHI output, source-label, provider-error, and browser-key exposure
paths. Do not implement H-006 summarization redesign, H-007 export v2, H-008
release work, deployment, DNS, or M-Vault integration.

## Required behavior

- The Complex-mode extractor comparison is view-only; no original extractor
  download handler or button is shipped.
- Copy and download actions require current approval and use only the canonical
  approved payload or a summary derived from it.
- Artifact filenames use a generated Harbor artifact ID, never the source
  filename.
- Exported JSON and Markdown exclude the source filename, original finding
  surface text, raw source text, API keys, and provider response bodies.
- Provider HTTP errors, refusals, malformed responses, and network failures
  become bounded Harbor-owned messages. Response bodies and submitted text are
  never reproduced in user-facing errors.
- Browser-supplied OpenRouter keys remain in page memory only. They are not
  persisted, logged, exported, or included in thrown errors.

## Verification gate

1. Add or retain focused red/green tests for export contents, generated names,
   extractor-download removal, provider/refusal/network error sanitization,
   and browser-key non-persistence.
2. Run `npm test`.
3. Run `npm run typecheck`.
4. Run `npm run lint`.
5. Run `npm run build`.
6. Run the built-browser proof with seeded synthetic PHI and inspect downloads,
   browser logs, and network requests for source labels or unredacted text.
7. Run `git diff --check`.

H-005 is complete only when all required commands and browser evidence are
green after the final code change. Synthetic evidence must not be described as
arbitrary-document recall or clinical acceptance.

## Stop rules

Stop and report if verification requires real PHI, credentials, production
deployment, external publication, or a product decision that changes the scope
above.

## Handoff

After completion, update `PROGRESS.md` with exact commands/results and leave
H-006, H-007, and H-008 in `TASK_QUEUE.md` as deferred work.

## Completion evidence — 2026-08-25

- Focused H-005 tests: 10/10 passed.
- `npm test`: 258 tests passed (161 script, 97 application).
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed. Existing chunk-size and ineffective-dynamic-import
  warnings remain informational.
- `npm run test:phi-eval`: 2/2 fixtures, 16/16 required surfaces, zero misses,
  zero protected-clinical false positives.
- `npm run test:openmed-browser`: real pinned OpenMed WASM inference marked 23
  spans, observed 20 model requests, zero sensitive egress, zero same-origin
  mutations, no browser errors, and two generated-ID artifacts with no seeded
  PHI or source filename.
- `git diff --check`: passed.

H-005 is complete on its bounded raw-output, export, provider-error, and
browser-key criteria. H-006, H-007, and H-008 remain deferred in
`TASK_QUEUE.md`.
