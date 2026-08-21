# RISK_NOTES.md

## Risks

| Risk | Severity | Why It Matters | Mitigation |
|---|---|---|---|
| Residual PHI after automated detection | Critical | External AI disclosure could expose sensitive information | Require visible review and explicit send; retain the existing non-certification warning |
| Secrets or generated output committed | High | A public repository would permanently expose them or bloat history | Ignore env files, build outputs, local data, and metadata; inspect the staged tree before commit |
| Wrong Nitro deployment preset | High | Vercel output will not run as a standalone Fly Node service | Select `node-server` only in the Docker build and test the generated server locally |
| OpenMed dependency advisories | High | `npm audit` reports `sharp`, `onnxruntime-node`, and `adm-zip` advisories through `@huggingface/transformers` | Do not apply npm's breaking `openmed@0.0.1` downgrade; generated server tracing excludes these Node-only packages; track upstream fixes |
| Parent eMedGen dirty state included | High | Unrelated work could be published | Initialize Git at the Harbor application root only |
| DNS not controlled from this checkout | Medium | The Fly hostname can work while the custom subdomain remains pending | Deploy first, request Fly certificate, and record the exact DNS target |

## Safe Next Step

Inspect the exact Git staging set for secrets and generated output before the first commit.
