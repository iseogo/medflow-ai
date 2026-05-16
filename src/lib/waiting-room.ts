import type { WaitingRoomState } from "@prisma/client";

/** Shown on /dashboard/waiting-room */
export const ACTIVE_WAITING_ROOM_STATES: WaitingRoomState[] = [
  "CHECKED_IN",
  "WAITING",
  "CALLED",
  "WITH_PROVIDER",
];

/** Hidden from the active waiting room board */
export const TERMINAL_WAITING_ROOM_STATES: WaitingRoomState[] = [
  "COMPLETED",
  "NO_SHOW",
  "WALK_OUT",
];

/**
 * Valid state machine — enforced server-side in physical-client.service.
 * Typical happy path: CHECKED_IN → WAITING → (optional CALLED) → WITH_PROVIDER → COMPLETED.
 */
export const WAITING_ROOM_ALLOWED_TRANSITIONS: Record<
  WaitingRoomState,
  WaitingRoomState[]
> = {
  CHECKED_IN: ["WAITING", "CALLED", "NO_SHOW", "WALK_OUT"],
  WAITING: ["CALLED", "WITH_PROVIDER", "NO_SHOW", "WALK_OUT"],
  CALLED: ["WAITING", "WITH_PROVIDER", "NO_SHOW", "WALK_OUT"],
  WITH_PROVIDER: ["COMPLETED", "WALK_OUT", "NO_SHOW"],
  COMPLETED: [],
  NO_SHOW: [],
  WALK_OUT: [],
};

export function isActiveWaitingRoomState(state: WaitingRoomState) {
  return ACTIVE_WAITING_ROOM_STATES.includes(state);
}

export function isValidWaitingRoomTransition(
  from: WaitingRoomState,
  to: WaitingRoomState
): boolean {
  if (from === to) return true;
  if (TERMINAL_WAITING_ROOM_STATES.includes(from)) return false;
  return WAITING_ROOM_ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertValidWaitingRoomTransition(
  from: WaitingRoomState,
  to: WaitingRoomState
): void {
  if (!isValidWaitingRoomTransition(from, to)) {
    throw new Error(`INVALID_WAITING_ROOM_TRANSITION:${from}→${to}`);
  }
}
