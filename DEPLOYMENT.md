# Deployment

Production deployment for MedFlow AI is documented in **`README-DEPLOYMENT.md`** (Docker + Traefik on VPS, `MOCK_MODE`, database, n8n separation).

This file exists so CI/CD templates and onboarding docs that reference `DEPLOYMENT.md` resolve correctly.

- **Do not** change the live VPS stack without following the phased checklist in `README-DEPLOYMENT.md`.
- **Optional** Dockerfile hardening ideas: see **`DOCKERFILE-RECOMMENDATIONS.md`** (does not modify the working `Dockerfile`).
