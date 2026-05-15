import type { WaitingRoomState } from "@prisma/client";

/** Shown on /dashboard/waiting-room */
export const ACTIVE_WAITING_ROOM_STATES: WaitingRoomState[] = [
  "CHECKED_IN",
  "WAITING",
  "WITH_PROVIDER",
];

/** Hidden from the active waiting room board */
export const TERMINAL_WAITING_ROOM_STATES: WaitingRoomState[] = [
  "COMPLETED",
  "NO_SHOW",
  "WALK_OUT",
];

export function isActiveWaitingRoomState(state: WaitingRoomState) {
  return ACTIVE_WAITING_ROOM_STATES.includes(state);
}
