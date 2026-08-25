# DECISIONS.md

## 2026-08-21 — Repository and hosting boundary

- The standalone Git repository root is this application directory (`Harbor1/Harboredactor`), not the dirty parent eMedGen checkout.
- Harbor deploys as the independent Fly app `harbor-safe-phi`.
- “Sub website” is implemented as `harbor.dnasedlongevity.com`, preserving the existing eMedGen deployment and root domains unchanged.
- Vercel remains the default local/export target; Fly opts into Nitro `node-server` during the Docker build.
- No sign-in, server database, or server-side PHI storage is introduced.

## 2026-08-23 — Reproducible OpenMed model pin

- The implementation plan's placeholder `OpenMed/OpenMed-NER-ONNX` is not a publicly resolvable Hugging Face repository and cannot be honestly pinned or tested.
- Harbor retains the public clinical PII model already used by the checkout: `OpenMed/OpenMed-PII-ClinicalE5-Small-33M-v1-onnx-android`.
- Harbor pins that model to immutable revision `79f7db205869b1be4be23ac4f42aa95bdedc5aee`, verified through Hugging Face's model API on 2026-08-23.
- The model card identifies both WebGPU and WebAssembly support and supplies `model_fp16.onnx` and `model_int8.onnx`, matching Harbor's WebGPU-first and WASM-fallback variants.
- This is a deliberate correction to a stale plan constant, not a broader model-selection change. Any future model change requires a new verified public revision and updated runtime proof.

## 2026-08-24 — OpenMed root-graph loader contract

- The pinned model revision exposes `model_fp16.onnx` and `model_int8.onnx` at the repository root.
- `openmed@2.1.0` maps its `int8` variant to the base name `model_int8`, while Transformers.js 4.2.0 appends the selected dtype suffix. Leaving WASM dtype selection implicit therefore requests `model_int8_quantized.onnx`; its metadata path also assumes `onnx/`.
- Harbor now passes base `model`, explicit dtype matching the logical attempt (`fp16` or `int8`), and an empty root subfolder while retaining the logical variant/device provenance. This produced a real built-browser WASM inference on the pinned revision.
- H-003 is complete on bounded synthetic evidence: 23 OpenMed spans, 20 model-related requests, zero sensitive egress, and zero same-origin mutations. This does not claim real-world recall, HIPAA certification, or unattended processing.

## 2026-08-25 — Canonical payload is the approval boundary

- Harbor treats the normalized, administrative-noise-filtered, bounded redacted text as the canonical payload. It is computed before approval and is the only payload representation shown in review, fingerprinted, transmitted, and exported.
- Approval fingerprints canonical payload text together with the source hash, date policy, and findings. Report validation rejects any approved input whose text is not already canonical, preventing a later trim, line-ending, filtering, or truncation drift.
- The canonicalizer preserves a bounded head and tail with an explicit marker when the model-input limit is exceeded. The review UI discloses the exact transmitted character count and whether bounding occurred.
- This is an integrity boundary, not a claim that the local redactor has arbitrary-document recall or that downstream summary/export/deployment gates are complete.

## 2026-08-25 — H-005 output boundary

- The extractor comparison remains an in-tab diagnostic view only; it cannot
  produce a raw download.
- Harbor artifact names use generated artifact IDs. v1 JSON and Markdown no
  longer include the source filename or original finding surface text.
- Provider errors, refusals, malformed responses, and network failures are
  mapped to bounded Harbor-owned messages without parsing or returning provider
  response bodies. Browser-supplied keys are memory-only.
- H-005 is complete on the tested synthetic/browser boundary. This does not
  claim arbitrary-document PHI recall, clinical acceptance, or completion of
  H-006 through H-008.
