# Harbor Integration and Operating Contract

Status: current implementation summary, verified against the `codex/harbor-phi-mitigation` checkout on 2026-08-26.

Harbor is a standalone, browser-first PHI de-identification application. It
accepts a text-bearing MyChart/Epic-style PDF or DOCX, extracts and redacts it
locally, requires human review and approval, and can then copy, download, or
optionally summarize the approved de-identified text.

Harbor is a de-identification aid. It is not HIPAA certification, a guarantee
of perfect PHI recall, clinical validation, OCR, or unattended processing.

## Integration boundary

Harbor is integrated as an independent application, not as an eMedGen, SNP,
M-Vault, or shared database feature.

- UI entry point: `src/routes/index.tsx` → `src/components/harbor-app.tsx`
- Local PHI pipeline: `src/lib/phi/`
- Optional summary integration: `src/lib/openrouter.ts` and `src/lib/report.ts`
- Production packaging target: Nitro `node-server` on port 8080; Fly app
  configuration is in `fly.toml` and `Dockerfile`.
- Authentication and database persistence are off for the Harbor workflow.
- Source files and extracted source text are held as ephemeral browser state.

The current mitigation goal does not authorize deployment, DNS, M-Vault, or
eMedGen integration work. Those boundaries must not be inferred from the
presence of server or hosting support in the repository.

## End-to-end workflow

```text
PDF/DOCX selected by user
        │
        ▼
Browser-local extraction and safety checks
        │
        ▼
OpenMed locally (WebGPU fp16 → WASM int8)
        │                    └─ failure → deterministic-only degraded mode
        ▼
Deterministic rules + optional known-identity seed
        │
        ▼
Redacted review view and editable findings
        │
        ▼
Canonical payload → explicit human approval
        ├── copy approved clean text
        ├── download approved JSON + Markdown artifact
        └── explicit summary request → OpenRouter → displayed summary
```

### 1. Intake and extraction

The user drops a file, selects it, or chooses Harbor's synthetic sample.
Accepted document types are:

- PDF with a readable text layer, extracted with `pdfjs-dist`.
- DOCX, read locally with Mammoth after a ZIP-structure inspection.

Current limits are:

- file size: 20 MB;
- DOCX archive entries: 2,048;
- DOCX declared uncompressed content: 64 MB;
- extracted text: 2,000,000 characters;
- minimum readable text: 20 non-whitespace characters.

Scanned/image-only PDFs are rejected because Harbor does not currently OCR
them. Unsupported files, unreadable DOCX content, oversized archives, and
documents with too little text stop before detection or external calls.

PDF extraction also records a local comparison of four text assembly methods.
The comparison is diagnostic UI state only; cloud extractors are intentionally
not used.

### 2. Local detection and redaction

Harbor attempts the pinned OpenMed model locally, then merges its spans with
curated deterministic detectors. The deterministic pass covers identity,
contact, address, date, account/record, network, and related identifier
categories. A user may add known identity values in Complex mode and rescan.

OpenMed is pinned to:

- model: `OpenMed/OpenMed-PII-ClinicalE5-Small-33M-v1-onnx-android`;
- revision: `79f7db205869b1be4be23ac4f42aa95bdedc5aee`;
- runtime: OpenMed `2.1.0`;
- loader variants: WebGPU/`fp16`, then WASM/`int8`.

The model is downloaded into the browser runtime cache as needed. Harbor's
loader passes the root-level model graph and explicit dtype so the pinned
revision uses `model_fp16.onnx` or `model_int8.onnx` rather than an inferred
quantized/subfolder path.

If OpenMed cannot load or inference fails, Harbor clears the unusable runtime,
shows a deterministic-only degraded message, and continues with local rules.
The UI does not treat model availability or a mocked engine as proof of real
inference.

Dates can be represented as relative days, year-only values, or retained
clinical dates. The chosen date policy is part of the approval identity.

### 3. Review and approval

The Redacted view is the working output. The Original view is available for
human comparison/editing in the current browser tab. Findings can be toggled
between `Redacting` and `Kept`; the date policy and optional identity seed can
also be changed.

Before approval, Harbor creates one canonical payload by:

1. normalizing line endings and trimming;
2. removing the specifically recognized administrative/noise sections;
3. bounding the payload at 120,000 characters, preserving head and tail with
   an explicit omission marker when necessary.

The review UI discloses the canonical character count and whether bounding
occurred. The exact canonical text shown for approval is the text used for
summary transmission and export.

Approval is not a visual flag alone. Harbor hashes and binds:

- the extracted source text;
- the accepted/rejected finding set;
- the date policy; and
- the canonical redacted payload.

Changing any of those values invalidates approval, prior summary state, and
copy/download eligibility. Generation and request tokens also prevent stale
intake, approval, or summary responses from overwriting newer review state.

## Expected inputs

### Required

- A user-selected text PDF or DOCX within the local limits above.
- Human review of every proposed redaction, including the Original and
  Redacted views.
- Explicit approval before copy, download, or summary.

### Optional

- A known identity seed in Complex mode: name/aliases, DOB, MRN, phone, email,
  address, and ZIP.
- A date handling choice: relative, year-only, or keep.
- An OpenRouter model selection.
- An OpenRouter API key pasted into Complex mode, when no configured server
  credentials are available. This key is held in page memory and is not written
  to local storage.

The synthetic sample is for flow verification only. It is not evidence of
real-world clinical-document recall.

## Outputs

### Always available after review

- An on-screen canonical redacted text view.
- A local count and category summary of findings.
- A clean-text copy action, gated by current approval.

### Optional summary

`Create summary` is user-triggered and disabled until approval. The summary
prompt instructs the provider to preserve redaction tokens, avoid reconstructing
identity, use only the supplied record, and return a constrained clinician-ready
summary. The result is displayed in the browser and can be copied or included
in a download.

### Manual artifact download

The download action produces two files with a generated `artifact-*` ID:

- JSON schema: `harbor-clinical-extract-v1`;
- Markdown de-identified extract, with the optional summary when one exists.

The artifact contains the canonical redacted text, page count, date policy,
detector names, accepted/total finding counts, category counts, artifact ID,
and generation time. It excludes the source filename, raw finding surface
text, API keys, provider response bodies, and unredacted source text. The
source filename can still be visible in the in-tab review panel; it is not
included in the artifact.

The versioned `harbor-clinical-extract-v2` artifact and downstream M-Vault
adapter are deferred to H-007.

## External integrations and data sent

| Integration | When it runs | Data sent | Current boundary |
| --- | --- | --- | --- |
| Hugging Face model hosting | First uncached OpenMed load | Model assets and runtime metadata | No document text; browser cache is used |
| OpenRouter model catalog | Complex mode when browser model fields are shown | Catalog request only | No document payload |
| OpenRouter summary API | Only after approval and explicit `Create summary` | The canonical approved redacted payload, selected model, and prompt | Direct browser fallback uses the user-supplied key |
| Harbor server function | Summary attempt when server credentials are configured | Canonical approved redacted payload and approved hash/date/model fields | Server validates the canonical payload before forwarding it |

The current code still permits a configured server-side OpenRouter key. That
is an owner-funded path and is not the final public credential design. H-006
must add the separately approved consent/rate-limit/budget boundary before a
public deployment relies on it. Do not describe the current server path as
user-funded merely because a browser fallback also exists.

## Safeguards

- Browser-local extraction, detection, redaction, and OpenMed inference.
- No automatic summary generation.
- Approval required for summary, copy, and download.
- SHA-256 approval fingerprints bind the exact canonical payload and review
  inputs.
- Stale-state and concurrent-request guards for intake, approval, and summary.
- Explicit input, archive, extracted-text, review, and canonical-payload
  limits.
- WebGPU failure falls back to WASM; complete model failure is visibly labeled
  deterministic-only degraded mode.
- Provider errors, refusals, malformed responses, and network failures become
  bounded Harbor-owned messages; provider response bodies are not surfaced.
- Browser-entered API keys are page-memory only; they are not persisted,
  exported, logged, or sent to Harbor.
- Extractor comparison is view-only and cannot create a raw download.
- Generated artifact IDs replace source-derived filenames.
- Automated/browser verification uses synthetic fixtures only and checks for
  seeded PHI leakage, sensitive egress, same-origin mutations, browser errors,
  and safe download contents.

## Verified scope and remaining limitations

The completed local mitigation evidence includes the synthetic PHI evaluator,
real built-browser OpenMed WASM inference, canonical approval binding, bounded
output/error handling, and safe artifact download checks. The latest recorded
proof passed 258 tests, typecheck, lint, build, 2/2 synthetic fixtures with
16/16 required surfaces, and a built-browser run with 23 OpenMed spans, 20
model requests, zero sensitive egress, zero same-origin mutations, and no
browser errors.

Those results are bounded engineering evidence, not arbitrary-document recall
or clinical acceptance. The following remain deferred and must stay visible:

- H-006: explicit user-funded summary consent and race proof;
- H-007: versioned PHI-safe export v2;
- H-008: complete local release proof across PDF/DOCX, desktop/mobile,
  degraded mode, summary, export, and zero-egress paths;
- deployment, DNS, authentication, database, and M-Vault integration.

See [`GOAL.md`](GOAL.md), [`PROGRESS.md`](PROGRESS.md),
[`DECISIONS.md`](DECISIONS.md), and [`TASK_QUEUE.md`](TASK_QUEUE.md) for the
execution contract and current status.
