/**
 * Session timeout policy (HIPAA-conscious defaults — tune per organization).
 */

const DEFAULT_MAX_AGE_SEC = 8 * 60 * 60;
const HIPAA_RECOMMENDED_MAX_AGE_SEC = 30 * 60;

export function sessionMaxAgeSeconds(): number {
  const raw = process.env.SESSION_MAX_AGE_SECONDS?.trim();
  if (!raw) return DEFAULT_MAX_AGE_SEC;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_AGE_SEC;
}

export function sessionUpdateAgeSeconds(): number {
  const raw = process.env.SESSION_UPDATE_AGE_SECONDS?.trim();
  if (!raw) return Math.min(15 * 60, sessionMaxAgeSeconds());
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 15 * 60;
}

export const SESSION_POLICY = {
  defaultMaxAgeSec: DEFAULT_MAX_AGE_SEC,
  hipaaRecommendedMaxAgeSec: HIPAA_RECOMMENDED_MAX_AGE_SEC,
  /** Production: set SESSION_MAX_AGE_SECONDS=1800 for 30-minute sessions */
  envKeys: ["SESSION_MAX_AGE_SECONDS", "SESSION_UPDATE_AGE_SECONDS"] as const,
};
