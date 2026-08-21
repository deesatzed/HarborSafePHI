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
