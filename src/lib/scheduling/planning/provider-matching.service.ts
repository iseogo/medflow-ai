/**
 * PLANNING ONLY — Phase 9 provider matching service interface.
 * No runtime implementation. Do not import from API routes or services yet.
 *
 * @see docs/phase9/SERVICE-INTERFACES.md
 */

import type {
  ProviderMatchInput,
  ProviderMatchResult,
  ProviderProfileView,
} from "./interfaces";

/**
 * Ranks nurses/providers by skills, specialty, urgency, gender preference, and load.
 * Does not check calendar slots — use availability-checking.service for that.
 */
export interface IProviderMatchingService {
  listActiveProviders(clinicLocationId: string): Promise<ProviderProfileView[]>;

  match(input: ProviderMatchInput): Promise<ProviderMatchResult>;

  explainMatch(
    providerProfileId: string,
    input: ProviderMatchInput
  ): Promise<{ reasonCodes: string[]; score: number }>;
}

/** Future implementation path: src/services/scheduling/provider-matching.service.ts */
