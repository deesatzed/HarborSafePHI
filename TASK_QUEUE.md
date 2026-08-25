# Deferred Harbor Work

These items are intentionally logged for later work. They are not part of the
current H-005 finish pass.

## H-006 — Optional user-funded summarization

- Remove the public client's owner-funded server fallback.
- Keep a browser-supplied key in memory only and clear it on refresh/reset.
- Prove explicit post-approval consent, exactly one request, canonical payload
  binding, safe refusal/network handling, and stale-response rejection.
- Add `npm run test:consent-browser`.

## H-007 — Versioned PHI-safe manual export

- Introduce `harbor-clinical-extract-v2` from one immutable approved snapshot.
- Include sanitized provenance, artifact ID, approval/model/device state, counts,
  date policy, and optional summary provenance.
- Exclude source filename, raw findings, source PHI, API keys, and provider
  bodies. Preserve any required v1 parser compatibility.

## H-008 — Complete local release proof

- Prove PDF and DOCX flows in built desktop and mobile browsers.
- Cover approval, safe copy/download, optional summary, v2 export, unreadable
  input, degraded deterministic-only mode, and zero sensitive egress.
- Reconcile README and progress evidence. Do not deploy, push, change DNS, or
  add M-Vault integration in this mitigation run.
