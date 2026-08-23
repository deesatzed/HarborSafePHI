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
