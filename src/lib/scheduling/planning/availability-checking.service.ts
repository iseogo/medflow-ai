/**
 * PLANNING ONLY — Phase 9 availability checking service interface.
 * No runtime implementation. Do not import from API routes or services yet.
 *
 * @see docs/phase9/SERVICE-INTERFACES.md
 */

import type { AvailabilityQuery, AvailableSlot } from "./interfaces";

/**
 * Validates slots against ProviderAvailability, ClinicHours, existing Appointments,
 * duration, buffers, and ProviderCapacityRule.
 */
export interface IAvailabilityCheckingService {
  findAvailableSlots(query: AvailabilityQuery): Promise<AvailableSlot[]>;

  isSlotBookable(slot: AvailableSlot, query: AvailabilityQuery): Promise<boolean>;

  countProviderLoad(
    providerProfileId: string,
    dateIso: string
  ): Promise<{ appointmentCount: number; atCapacity: boolean }>;
}

/** Future implementation path: src/services/scheduling/availability-checking.service.ts */
