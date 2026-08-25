# PROGRESS.md

## 2026-08-21

- Verified the parent eMedGen checkout is dirty and 216 commits ahead; it is excluded from Harbor publication.
- Verified `deesatzed/HarborSafePHI` exists as an empty public GitHub repository.
- Verified the current Fly site is `emedgen.fly.dev` with `dnasedlongevity.com` and `www.dnasedlongevity.com` certificates.
- Verified `harbor-safe-phi` is available as a Fly app name.
- Assumed the requested sub-website relationship means `harbor.dnasedlongevity.com`; this is isolated and reversible and does not modify the eMedGen app.
- Added a failing deployment contract test before Fly runtime configuration.
- Added standalone Node/Fly packaging and repository hygiene.
- Fixed six pre-existing PWA test-isolation failures and two lint findings without changing product behavior.
- Made browser-smoke output portable while preserving its repository-bound path guard; the red/green contract test passed.
- Verified 177 tests, typecheck, lint, and Nitro `node-server` build.
- Verified development and production renders on desktop and mobile: HTTP 200, no console/page errors, no horizontal overflow, and no baseline divergence.
- `npm audit` reports five high advisories through OpenMed's optional Node-side transformer dependencies. The generated Nitro server does not trace `sharp`, `onnxruntime-node`, or `adm-zip`; npm's only proposed fix is an unsafe breaking downgrade to `openmed@0.0.1`.
- Git publication, Fly deployment, live verification, and custom-subdomain DNS remain pending.

## 2026-08-23 — Harbor document intake

- Kept scope limited to Harbor's medical-document redactor/summarizer and its portable export boundary; no eMedGen or SNP-module files were changed.
- Added browser-local PDF/DOCX intake with compressed-file, archive-entry, expanded-size, raw-text, and readable-text limits.
- Pinned JSZip `3.10.1` because the fail-closed DOCX expansion check depends on that version's declared uncompressed-size metadata.
- Removed automatic report creation from intake. A report is created only after the user selects the explicit action.
- Added stale-generation protection so rejected or superseded intake cannot restore review or report state.
- Proved the in-flight Simple-to-Complex race against the built app: one local model request, zero summary requests, zero same-origin mutations, and zero sensitive egress. The unreadable-DOCX case made zero model, summary, mutation, or sensitive-egress requests.
- Verified 226 tests, typecheck, lint, lockfile dry-run, production build, and the built-browser intake proof.
- Independent quality review classified both remaining recommendations as Accepted: bound warning sanitation work and make the final report instruction explicitly user-triggered. No recommendations were Rejected or left as Needs Investigation.
- Task 1 is complete. OpenMed WebGPU-first selection and WASM fallback remain Task 2; real OpenMed runtime inference is not yet claimed.

## 2026-08-23 — OpenMed device and runtime state

- Added WebGPU-first OpenMed loading with the pinned `fp16` variant and a WASM `int8` fallback.
- Added immutable provenance for the public clinical PII model, its Hugging Face revision, OpenMed runtime `2.1.0`, and deterministic ruleset `harbor-rules-v1`.
- Corrected the stale plan model constant after verifying that its named repository was not publicly resolvable; the rationale and immutable replacement are recorded in `DECISIONS.md`.
- Initialization failures now emit deterministic-only degraded status, clear poisoned state, and allow retry. Concurrent callers share bounded progress notifications.
- Runtime becomes ready only after inference succeeds. Inference failure resets the unusable engine and records degraded state so local-rules fallback cannot inherit false OpenMed-ready provenance.
- Added monotonic inference ownership so stale scans cannot overwrite the state of a newer intake or clobber a newer initialization.
- Quality-review recommendations were all Accepted and implemented across two corrective commits; the final independent re-review found no Critical, Important, or Minor issues.
- Verified 240 tests, typecheck, lint, diff check, and production build. Task 2 is complete.
- Real browser WebGPU/WASM inference remains unproven and must not be described as working until the dedicated runtime proof gate passes.

## 2026-08-24 — PHI mitigation baseline

- Created the isolated branch `codex/harbor-phi-mitigation` from local HEAD
  `6d018f7`; it is 13 commits ahead of `origin/main`.
- Preserved the existing dirty platform/UX files and synthetic screenshots;
  they are not included in the mitigation scope unless a task proves they are
  required.
- Added `GOAL.md` as the active execution contract. The first release gate is
  a synthetic PHI evaluation corpus plus real built-browser OpenMed inference;
  summary, export, deployment, and M-Vault work remain sequenced behind it.

## 2026-08-24 — Synthetic PHI evaluation

- Added two synthetic-only fixtures covering 16 required redaction surfaces
  across names, MRN, DOB/date, phone, email, address, SSN, NPI, plan ID,
  encounter ID, URL, IP, and ZIP categories, plus protected clinical
  near-misses.
- Added the `harbor-phi-eval-v1` report and `npm run test:phi-eval` gate. The
  report contains counts and category metrics without reproducing fixture
  source text.
- Verified 2/2 fixtures, 16/16 required surfaces, zero misses, zero protected
  clinical false positives, and exact expected redacted output.
- Verified `npm run typecheck` after the evaluation harness change.
- This is deterministic-only synthetic evidence. It does not prove OpenMed
  browser execution or arbitrary medical-document recall.

## 2026-08-24 — Crash recovery and H-003 completion

- Recovered the active worktree at `/Volumes/WS4TB/Harboredactor` on `codex/harbor-phi-mitigation`. The parent `/Volumes/WS4TB/_aFix_DNA/eMedGen` checkout remains a separate dirty checkout; no parent files were edited.
- The crash stopped after WebGPU failed and the WASM fallback requested nonexistent `model_int8_quantized.onnx` / `onnx/model_quantized.onnx` paths. Live Hugging Face manifest inspection confirmed the pinned revision contains root-level `model_fp16.onnx` and `model_int8.onnx` only.
- Added the narrow loader-contract fix: Transformers.js receives base `model`, explicit `fp16`/`int8` dtype, and root subfolder; logical attempt and runtime provenance remain unchanged. Added a regression test and updated the stale source-contract assertion and review-label assertion.
- Verification: `npm test` passed 249 tests (159 script, 90 application); `npm run typecheck`; `npm run lint`; `npm run build`; and `npm run test:phi-eval` remained green.
- Built-browser proof passed: `npm run test:openmed-browser` completed real pinned OpenMed inference on WASM, marked 23 spans, showed the redacted review state, observed 20 model requests, zero sensitive egress, zero same-origin mutations, and no browser errors.
- H-003 is complete on its bounded synthetic/browser criteria. The next ordered task is H-004, canonicalization of the exact approved redacted payload. Summary/export/deployment work remains sequenced behind it.

## 2026-08-25 — H-004 canonical approved payload

- Added one bounded canonical-payload function that normalizes line endings, removes administrative noise, applies the model-input limit, and records source/transmitted character counts and truncation.
- The review fingerprint, approval record, server report request, browser fallback, displayed review text, and export now use the same canonical payload. Approval rejects a noncanonical or overlong payload and binds its hash to the exact text transmitted.
- Added bounded validation for source hash, findings, finding fields, and approved payload text. Clipboard failures now remain in the approved view with a bounded user-facing error instead of escaping the state machine.
- Added the review disclosure showing the exact canonical payload character count and whether it was bounded before approval.
- Verification: focused H-004 suite passed 13 tests; `npm test`, typecheck, lint, diff check, and production build passed; `npm run test:openmed-browser` passed with 23 spans, 20 model requests, zero sensitive egress, zero same-origin mutations, and no browser errors.
- H-004 is complete on its canonicalization and bounded-state criteria. H-005 source-view/raw-text comparison and later summary/export/deployment work remain deferred by the active goal.

## 2026-08-25 — H-005 pause and future-candidate assessment

- H-005 implementation work is present in the dirty Harbor checkout, but its
  final broad verification was intentionally interrupted. H-005 is not complete
  or release-ready until `npm test`, typecheck, lint, build, and the required
  browser output/error inspection are rerun after the last hardening patch.
- Remaining ordered work is H-005 raw-output/error closure, H-006 explicit
  user-funded summarization consent and race proof, H-007 versioned PHI-safe
  export, and H-008 complete built-browser release proof. No deployment, push,
  DNS, or M-Vault work is authorized by this mitigation goal.
- Logged `FUTURE_IDEAS.md` for a synthetic-only GLiNER2.5 recall challenger, a
  privacy-safe PDFX-inspired evaluator, and a provider-neutral model contract.
  These are deferred research directions, not product commitments.

## 2026-08-25 — H-005 complete

- Finished H-005 raw-output and error-path closure. The Complex extractor
  comparison is view-only; original extractor downloads and source-derived
  filenames are gone.
- Exports now use generated artifact IDs and exclude source filenames, seeded
  source values, raw finding surfaces, provider response bodies, and API keys.
  Browser-supplied keys are held in page memory only.
- Provider HTTP, refusal, malformed-response, and network failures now map to
  bounded Harbor-owned messages.
- Added the H-005 browser proof for both artifact downloads and seeded-PHI
  inspection. Final verification passed: 258 tests, typecheck, lint, build,
  synthetic PHI evaluation 2/2 and 16/16, rebuilt-browser WASM proof with 23
  spans and 20 model requests, zero sensitive egress, zero same-origin
  mutations, no browser errors, and `git diff --check`.
- H-005 is complete. H-006 optional summarization consent/race proof, H-007
  versioned export, and H-008 complete local release proof are logged in
  `TASK_QUEUE.md` and intentionally deferred.
