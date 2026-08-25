# Future Ideas

These are candidates for later evaluation, not approved Harbor runtime scope.
They must remain behind synthetic evidence, explicit privacy boundaries, and a
verified deployment path.

## 2026-08-25 — GLiNER2.5 as an offline recall challenger

- Evaluate `fastino/gliner2.5-multi-v1` only as a shadow model against Harbor's
  deterministic rules and pinned OpenMed engine.
- Use the existing synthetic PHI corpus first, then add multilingual synthetic
  fixtures and hard clinical near-misses. Compare category recall, precision,
  false positives, span offsets, latency, and memory use.
- Keep the first adapter outside the browser. The checkpoint is a large
  PyTorch/Python model with safetensors rather than Harbor's current ONNX /
  WebGPU-WASM runtime contract.
- If the model materially improves recall, consider a native macOS/MPS or
  serverless-offline sidecar with user-visible provenance. Do not silently add
  it to the browser redaction path.
- Also compare the directly PII-oriented Fastino checkpoint before selecting a
  general multitask model for privacy work.

## 2026-08-25 — PDFX-inspired privacy-safe evaluator

- Reuse the useful concepts in the local `/Volumes/WS4TB/_aFix_DNA/eMedGen/pdfx.md`:
  page-level processing, structured extraction results, progress reporting,
  interval summaries, and persisted checkpoints.
- Rebuild those concepts as a Harbor developer/evaluation tool that accepts
  synthetic or already-approved redacted text only. It must not send raw chart
  pages to a provider.
- Add atomic checkpoint files, a manifest, bounded page/text sizes, resumable
  page identity, and no destructive output-directory clearing.
- Keep it separate from Harbor's user intake and export path unless it later
  proves a concrete release-gate benefit.

## 2026-08-25 — Model contract and shadow-evaluation seam

- Add a provider-neutral local detector interface so OpenMed, deterministic
  rules, and future challengers can emit the same bounded `PhiSpan` shape with
  model revision, device, and timing provenance.
- Make every candidate model pass the same synthetic PHI gate and browser/native
  resource budget before it can be considered for product use.
- Keep model-manifest inspection and filename/dtype compatibility as a required
  preflight whenever a new Hub checkpoint is proposed.
