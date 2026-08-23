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
