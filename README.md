# Harbor Safe PHI

Harbor de-identifies text-layer MyChart/Epic PDFs in the browser before a user shares reviewed text with an external AI service.

## Privacy model

- PDF parsing, deterministic detection, redaction, and optional OpenMed inference run in the browser.
- Harbor does not upload the source PDF to its Fly server.
- OpenRouter is optional, uses a key supplied by the user, and receives only the redacted text the user explicitly approves.
- Harbor is a de-identification aid, not a HIPAA certification or a substitute for human review.

Do not commit PHI, API keys, credentials, raw charts, or private exports to this repository.

## Development

```bash
npm ci
npm run dev
```

Verification:

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

## Deployment

The production container uses Nitro's `node-server` preset and listens on port 8080. Fly configuration targets the `harbor-safe-phi` app in `iad`.

Canonical deployment targets:

- Fly hostname: `https://harbor-safe-phi.fly.dev`
- eMedGen sub-site: `https://harbor.dnasedlongevity.com`

No sign-in is enabled; document contents remain ephemeral in the browser.
