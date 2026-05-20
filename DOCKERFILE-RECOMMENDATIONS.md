# Dockerfile — optional improvements (do not apply blindly)

The repository **`Dockerfile`** is tuned for the current VPS (Next.js `standalone`, Prisma, `entrypoint.sh`, healthcheck). **Do not replace it** unless you have validated a full deploy.

If you iterate later, consider (non-blocking):

1. **Multi-stage cache:** separate `npm ci` layer keys on `package-lock.json` only when lockfile changes.
2. **Non-root runtime:** `runner` already uses `su-exec` to `nextjs`; avoid running migrations as root in production unless your ops standard requires it.
3. **Distroless (advanced):** smaller final image possible, but harder with Prisma native engines — test thoroughly.
4. **SBOM / scan:** attach `docker scout` or Trivy in CI without failing the pipeline until baselines exist.

These are suggestions only; the committed `Dockerfile` remains the source of truth for production.
