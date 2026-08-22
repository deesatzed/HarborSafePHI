# Harbor Local Redaction and Summary Design

Date: 2026-08-22

Status: approved

## 1. Scope and ownership

This effort owns only the standalone Harboredactor application. Harbor remains
focused on local medical-document extraction, PHI detection, human-reviewed
redaction, optional summarization, and portable export.

The following are explicitly outside this effort:

- eMedGen application behavior;
- curated genomic rules or curation pipelines;
- local SNP parsing or matching;
- the SNP-module user experience;
- M-Vault storage, authentication, versioning, or report generation.

Harbor may define a versioned export artifact that M-Vault can consume later.
It does not implement or depend on a M-Vault endpoint in this scope.

## 2. Product flow

1. The user selects a PDF or DOCX medical-history document.
2. Harbor extracts readable text entirely in the browser.
3. Harbor runs OpenMed locally, preferring WebGPU and falling back to WASM.
4. Deterministic local detectors supplement the model output.
5. Harbor presents all candidate identifiers for explicit human review and
   correction.
6. After review, the user may export the redacted document immediately.
7. As a separate, explicit action, the user may send only the reviewed,
   redacted text to OpenRouter for a Portable Clinical Health Summary.
8. Harbor exports Markdown for human use and versioned JSON for later machine
   import.

The raw document and unredacted extracted text are ephemeral browser state.
Harbor does not upload or persist them server-side.

## 3. Local document processing

### Supported inputs

- text-bearing PDF;
- DOCX;
- clearly reported failure for unsupported formats or image-only documents.

OCR is not part of this design. Harbor must tell the user when a document has
too little readable text rather than presenting an apparently successful empty
result.

### OpenMed device selection

Harbor attempts OpenMed in this order:

1. WebGPU with the compatible model variant when WebGPU is available;
2. WASM with the compatible quantized model when WebGPU is unavailable or the
   WebGPU load fails;
3. deterministic local detection only, with a prominent degraded-mode warning,
   if OpenMed cannot run.

The UI records and displays the engine actually used. Availability detection is
not sufficient proof: browser tests must execute a real model inference path or
the limitation must remain explicitly unverified.

## 4. Human review and consent

Human review is a hard gate, not informational UI.

- No OpenRouter request may begin automatically when detection finishes.
- The user can accept, reject, or add redactions before approval.
- Approval applies to a specific redacted-text fingerprint. Editing findings or
  changing date treatment invalidates the approval and any derived summary.
- The UI must distinguish local processing, reviewed readiness, external
  summary generation, and export.

Simple mode may reduce controls, but it may not weaken this consent sequence.

## 5. Optional OpenRouter summary

OpenRouter receives only the approved redacted representation.

- Summary generation is user initiated.
- The date representation sent to OpenRouter matches the approved/exported date
  policy.
- The constrained chart-synthesis prompt remains grounded only in the supplied
  record and must not add diagnoses, treatment recommendations, citations, or
  external medical knowledge.
- A failed, refused, empty, or rate-limited summary never blocks redacted export.
- Harbor records the model identifier, prompt version, request time, and result
  status with the export. It never exports an API key.

Server-configured credentials and the optional browser-provided credential path
may remain, provided the UI accurately describes where the key and redacted
content travel.

## 6. Portable export contract

Harbor continues to provide Markdown and JSON downloads. The JSON contract is
extended without silently changing the meaning of
`harbor-clinical-extract-v1`; use a new schema version when fields or semantics
are incompatible.

The machine-readable artifact includes:

- schema version and stable artifact ID;
- generation time;
- sanitized source label and source-content hash;
- document kind and page count;
- detector names and actual OpenMed device/status;
- date policy;
- reviewed/approved status and approved-text fingerprint;
- finding counts and non-PHI finding provenance;
- reviewed redacted text;
- optional Portable Clinical Health Summary;
- summary model ID, prompt version, creation time, and status.

The raw source filename is not exported by default because filenames can contain
identity. Per-finding exports must not reproduce the original PHI surface text.

Download is the only required integration in this scope. A future M-Vault
adapter must consume the same artifact and must not require Harbor to know
M-Vault's internal record schema.

## 7. Harbor-relevant ideas from `oxthoughts.md`

Only the general invariant discipline applies to Harbor:

1. raw source remains local;
2. external processing receives only explicitly reviewed redacted content;
3. exported artifacts carry versioned, verifiable provenance;
4. unsupported or degraded processing fails visibly rather than silently
   fabricating confidence.

Genomic orientation rules, evidence lattices, rule algebra, signed SNP packs,
clinical examples, and curation-factory proposals are outside Harbor's scope.

## 8. Error handling

- PDF/DOCX extraction failure: preserve no derived state and show a specific
  retry/format message.
- OpenMed download or inference failure: continue only in labeled local-rules
  degraded mode.
- Review changes: invalidate summary and approval fingerprints.
- OpenRouter failure: retain reviewed redacted text and allow export.
- Export failure: preserve in-memory reviewed state and provide a retry.
- M-Vault unavailability is irrelevant to Harbor's core flow because download
  remains complete and independent.

## 9. Verification gates

Before release:

- focused PDF and DOCX extraction tests pass;
- OpenMed loader tests cover WebGPU-first selection and WASM fallback;
- a real browser runtime check verifies the supported OpenMed inference path,
  or the missing proof remains explicitly documented;
- tests prove no OpenRouter call occurs before approval;
- tests prove any finding/date change invalidates approval and summary;
- tests prove summary and export use the same approved text/date policy;
- export-schema tests cover required provenance and exclude raw filenames and
  PHI surfaces;
- all unit tests, typecheck, lint, and production build pass;
- desktop and mobile dev/built browser checks render with no console errors or
  horizontal overflow;
- Fly deployment is verified separately from the custom-domain DNS step;
- no eMedGen, SNP-module, or M-Vault backend files change.

## 10. Change organization

The existing dirty tree must not be staged wholesale. Work is separated into
reviewable commits:

1. preserve and verify DOCX intake;
2. repair and prove OpenMed WebGPU/WASM selection;
3. enforce explicit review before summarization and unify date handling;
4. version and test the portable export contract;
5. reconcile deployment configuration and verify Fly/custom-domain state.

Each commit must preserve the previously verified Harbor flow and must not
include medical input artifacts or unrelated screenshots unless deliberately
selected as non-sensitive release evidence.
