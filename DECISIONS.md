# DECISIONS.md

## 2026-08-21 — Repository and hosting boundary

- The standalone Git repository root is this application directory (`Harbor1/Harboredactor`), not the dirty parent eMedGen checkout.
- Harbor deploys as the independent Fly app `harbor-safe-phi`.
- “Sub website” is implemented as `harbor.dnasedlongevity.com`, preserving the existing eMedGen deployment and root domains unchanged.
- Vercel remains the default local/export target; Fly opts into Nitro `node-server` during the Docker build.
- No sign-in, server database, or server-side PHI storage is introduced.
