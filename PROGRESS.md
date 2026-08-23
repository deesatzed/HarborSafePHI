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
