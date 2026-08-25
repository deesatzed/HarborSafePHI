# RISK_NOTES.md

## Risks

| Risk | Severity | Why It Matters | Mitigation |
|---|---|---|---|
| Residual PHI after automated detection | Critical | External AI disclosure could expose sensitive information | Require visible review and explicit send; retain the existing non-certification warning |
| Secrets or generated output committed | High | A public repository would permanently expose them or bloat history | Ignore env files, build outputs, local data, and metadata; inspect the staged tree before commit |
| Wrong Nitro deployment preset | High | Vercel output will not run as a standalone Fly Node service | Select `node-server` only in the Docker build and test the generated server locally |
| OpenMed dependency advisories | High | `npm audit` reports `sharp`, `onnxruntime-node`, and `adm-zip` advisories through `@huggingface/transformers` | Do not apply npm's breaking `openmed@0.0.1` downgrade; generated server tracing excludes these Node-only packages; track upstream fixes |
| Transformers.js model-file convention | Medium | OpenMed 2.1.0 names the logical graph `model_int8`, while Transformers.js appends its dtype suffix and otherwise requests nonexistent quantized/subfolder paths | Pass base `model`, explicit `fp16`/`int8` dtype, and root subfolder; keep the loader-contract regression and built-browser proof |
| Parent eMedGen dirty state included | High | Unrelated work could be published | Initialize Git at the Harbor application root only |
| DNS not controlled from this checkout | Medium | The Fly hostname can work while the custom subdomain remains pending | Deploy first, request Fly certificate, and record the exact DNS target |

## Safe Next Step

Proceed to H-004: make the exact approved redacted payload canonical. Keep H-003's built-browser proof as the dependency gate, and inspect the exact Git staging set for secrets/generated output before any commit.
