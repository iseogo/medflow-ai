# MedFlow AI — VPS deployment (Docker + Traefik)

Deploy MedFlow AI on a **Hostinger VPS** behind **Traefik**, separate from the existing **n8n** stack at [https://n8n.smartdeskai.cloud](https://n8n.smartdeskai.cloud).

| Service | URL |
|--------|-----|
| MedFlow AI | https://medflow.smartdeskai.cloud |
| n8n (existing, do not modify) | https://n8n.smartdeskai.cloud |

**Defaults:** `MOCK_MODE=true` — no live SMS, voice, email, or calendar traffic until you deliberately change it.

---

## 1. Prerequisites

- Docker Engine + Docker Compose v2 on the VPS
- Traefik already running with HTTPS (Let’s Encrypt)
- External Docker network for Traefik (commonly `traefik_public`)
- DNS `A` record: `medflow.smartdeskai.cloud` → VPS IP
- Git clone of this repository on the server
- **Do not** stop or reconfigure the existing n8n container

### Traefik network

If the network does not exist yet (adjust name to match your Traefik `docker-compose`):

```bash
docker network create traefik_public
```

Confirm Traefik uses the same network name in its service definition and that `certresolver=letsencrypt` matches your Traefik static config.

---

## 2. Configure environment (server only)

```bash
cd /path/to/MedFlow-AI
cp .env.production.example .env
chmod 600 .env
```

Edit `.env`:

| Variable | Example / notes |
|----------|-----------------|
| `NEXTAUTH_URL` | `https://medflow.smartdeskai.cloud` |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `DATABASE_URL` | `postgresql://postgres:STRONG@postgres:5432/medflow?schema=public` |
| `WEBHOOK_SECRET` | `openssl rand -base64 32` |
| `MOCK_MODE` | `true` (keep until go-live checklist) |
| `N8N_BASE_URL` | `https://n8n.smartdeskai.cloud` |
| `POSTGRES_PASSWORD` | Strong password (must match `DATABASE_URL`) |

Keep `.env` **outside Git**. Back it up to encrypted storage (see §7).

---

## 3. Deploy commands

```bash
# Build and start (app + PostgreSQL)
docker compose up -d --build

# Follow logs
docker compose logs -f medflow

# Restart app only
docker compose restart medflow

# Stop stack (keeps volumes)
docker compose down
```

### External PostgreSQL (optional)

1. Remove the `postgres` service from `docker-compose.yml`.
2. Remove `depends_on` under `medflow`.
3. Set `DATABASE_URL` to your managed/hosted PostgreSQL URL in `.env`.
4. Run `docker compose up -d --build`.

---

## 4. Database: migrate, generate, seed

Migrations run automatically on container start when `RUN_MIGRATIONS_ON_START=true` (default).

Manual commands (if needed):

```bash
# Inside running container
docker compose exec medflow npx prisma migrate deploy
docker compose exec medflow npx prisma generate

# First-time seed (run once; requires network access to DB)
# Option A — from your workstation with DATABASE_URL in .env pointing at prod (via SSH tunnel):
npx prisma generate
npx prisma db seed

# Option B — one-off exec (if tsx available in image context):
docker compose exec medflow npx prisma db seed
```

**Generate** is executed at Docker build time. **Migrate deploy** runs at container start via `docker/entrypoint.sh`.

---

## 5. Production health checks

### HTTP

```bash
curl -fsS https://medflow.smartdeskai.cloud/api/health
```

Expected JSON: `"status":"ok"` and a timestamp.

### Container

```bash
docker compose ps
docker inspect medflow-ai --format '{{.State.Health.Status}}'
```

### Application audits (on build host or CI)

```bash
npm run audit:deployment
npm run audit:production
npm run audit:security
```

---

## 6. Production security checklist

- [ ] `.env` not in Git; permissions `600`
- [ ] `NEXTAUTH_SECRET` and `WEBHOOK_SECRET` are unique random values
- [ ] `MOCK_MODE=true` until integration go-live is approved
- [ ] `MEDFLOW_WEBHOOK_ALLOW_UNAUTHENTICATED` is **not** set
- [ ] PostgreSQL not exposed on public port `5432`
- [ ] Traefik terminates TLS; app not bound to public port `3000`
- [ ] Firewall allows only `80/443` (and SSH from admin IPs)
- [ ] n8n remains on its own stack; only `N8N_BASE_URL` points to it
- [ ] Change default seed admin password after first login
- [ ] Schedule database backups (§7)
- [ ] Review `docs/SECURITY.md` and `docs/HIPAA-CONSCIOUS.md`

---

## 7. Backup plan

### Database

```bash
# Dump (with bundled postgres container)
docker compose exec postgres pg_dump -U postgres medflow > medflow-backup-$(date +%Y%m%d).sql

# Restore example
cat medflow-backup-YYYYMMDD.sql | docker compose exec -T postgres psql -U postgres medflow
```

### Docker volume

```bash
docker run --rm -v medflow-ai_medflow_pg_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/medflow-pg-volume-$(date +%Y%m%d).tar.gz -C /data .
```

### Environment file

```bash
cp .env ~/secure-backups/medflow.env.$(date +%Y%m%d)   # outside repo
```

Store backups off-server (encrypted object storage).

---

## 8. Rollback plan

1. Note current Git commit: `git rev-parse HEAD`
2. Stop stack: `docker compose down`
3. Checkout previous release: `git checkout <previous-tag-or-commit>`
4. Rebuild: `docker compose up -d --build`
5. If schema changed backward-incompatibly, restore database from backup (§7) **before** starting app
6. Verify: `curl https://medflow.smartdeskai.cloud/api/health`

Keep at least one known-good image tag or commit SHA per release.

---

## 9. n8n coordination

- MedFlow **does not** run n8n in this compose file.
- Set `N8N_BASE_URL=https://n8n.smartdeskai.cloud` for outbound webhook URLs when `MOCK_MODE=false`.
- Import workflow JSON from `n8n-workflows/` into your existing n8n instance.
- Configure n8n to call MedFlow webhooks using `WEBHOOK_SECRET` (see Phase 7 docs).

---

## 10. Local development vs production

| Purpose | Command |
|---------|---------|
| Local PostgreSQL only | `docker compose -f docker-compose.dev.yml up -d` |
| Production VPS stack | `docker compose up -d --build` |

See [README-PHASE13.md](./README-PHASE13.md) for phase scope.
