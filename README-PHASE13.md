# Phase 13 — VPS deployment setup

Phase 13 adds **deployment artifacts only** — no changes to business logic, orchestration, RBAC, command center, or integration behavior.

## Deliverables

| File | Purpose |
|------|---------|
| `Dockerfile` | Production image (Next.js standalone + Prisma) |
| `docker-compose.yml` | MedFlow app + PostgreSQL + Traefik labels |
| `docker-compose.dev.yml` | Local PostgreSQL-only (dev) |
| `.env.production.example` | Placeholder production env template |
| `docker/entrypoint.sh` | `prisma migrate deploy` then start app |
| `README-DEPLOYMENT.md` | Full VPS runbook |
| `scripts/deployment-audit.ts` | `npm run audit:deployment` |

## Infrastructure

- **App:** https://medflow.smartdeskai.cloud (Traefik → `medflow` service port 3000)
- **n8n:** https://n8n.smartdeskai.cloud (existing container — not modified)
- **MOCK_MODE:** defaults to `true` in `.env.production.example`

## Quick deploy (VPS)

```bash
cp .env.production.example .env
# edit .env with secrets (never commit)
docker network create traefik_public   # if missing
docker compose up -d --build
curl https://medflow.smartdeskai.cloud/api/health
```

## Audit

```bash
npm run audit:deployment
```

## What Phase 13 does not do

- Enable live Twilio, OpenAI, email, or calendar APIs
- Deploy or reconfigure n8n
- Commit real `.env` values
- Change application features or database schema

See [README-DEPLOYMENT.md](./README-DEPLOYMENT.md) for backup, rollback, health checks, and security checklist.
