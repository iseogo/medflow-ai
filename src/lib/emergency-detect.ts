/**
 * High-confidence patterns: immediately halt automation and escalate to staff.
 * These are unambiguously life-threatening or crisis phrases.
 */
const HIGH_CONFIDENCE_PATTERNS = [
  /\bchest\s+pain\b/i,
  /\bcan'?t\s+breathe\b/i,
  /\bcannot\s+breathe\b/i,
  /\bheart\s+attack\b/i,
  /\bunconscious\b/i,
  /\bnot\s+breathing\b/i,
  /\bsevere\s+bleeding\b/i,
  /\bsuicid(?:e|al)\b/i,
  /\bkill\s+myself\b/i,
  /\bhurt\s+myself\b/i,
  /\bend\s+(?:it|my\s+life)\b/i,
  /\bwant\s+to\s+die\b/i,
  /\bcan'?t\s+go\s+on\b/i,
  /\bno\s+reason\s+to\s+live\b/i,
  /\b(?:call\s+)?911\b/i,
  /\blife\s+threatening\b/i,
  /\bstroke\b/i,
];

/**
 * Medium-confidence patterns: flag for orchestrator review but do NOT immediately halt.
 * "emergency" alone is too broad — "emergency appointment", "emergency contact", etc.
 * are common healthcare phrases that should not trigger a full automation halt.
 */
const MEDIUM_CONFIDENCE_PATTERNS = [
  /\bmedical\s+emergency\b/i,
  /\burgent\s+(?:help|care|medical)\b/i,
  /\b(?:please\s+)?(?:help\s+me|need\s+help)\s+(?:now|immediately|urgently)\b/i,
  /\bemergency\s+(?:room|department|care|services|situation)\b/i,
];

export type EmergencyDetectionResult = {
  isEmergency: boolean;
  /** HIGH_CONFIDENCE match — automation must halt immediately */
  isHighConfidence: boolean;
  matchedTerms: string[];
};

export function detectEmergencyLanguage(text: string): EmergencyDetectionResult {
  const matchedTerms: string[] = [];
  let isHighConfidence = false;

  for (const pattern of HIGH_CONFIDENCE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      matchedTerms.push(match[0]);
      isHighConfidence = true;
    }
  }

  for (const pattern of MEDIUM_CONFIDENCE_PATTERNS) {
    const match = text.match(pattern);
    if (match) matchedTerms.push(match[0]);
  }

  return {
    isEmergency: matchedTerms.length > 0,
    isHighConfidence,
    matchedTerms,
  };
}
