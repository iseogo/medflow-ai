const EMERGENCY_PATTERNS = [
  /\bchest\s+pain\b/i,
  /\bcan'?t\s+breathe\b/i,
  /\bcannot\s+breathe\b/i,
  /\bstroke\b/i,
  /\bheart\s+attack\b/i,
  /\bunconscious\b/i,
  /\bnot\s+breathing\b/i,
  /\bsevere\s+bleeding\b/i,
  /\bsuicid(e|al)\b/i,
  /\bkill\s+myself\b/i,
  /\b911\b/,
  /\bemergency\b/i,
  /\burgent\s+help\b/i,
  /\blife\s+threatening\b/i,
];

export type EmergencyDetectionResult = {
  isEmergency: boolean;
  matchedTerms: string[];
};

export function detectEmergencyLanguage(text: string): EmergencyDetectionResult {
  const matchedTerms: string[] = [];
  for (const pattern of EMERGENCY_PATTERNS) {
    const match = text.match(pattern);
    if (match) matchedTerms.push(match[0]);
  }
  return {
    isEmergency: matchedTerms.length > 0,
    matchedTerms,
  };
}
