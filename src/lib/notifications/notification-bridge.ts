import { NotificationSource, WaitingRoomState } from "@prisma/client";
import {
  notificationService,
  type EmitStaffNotificationInput,
  type NotificationActorChannel,
} from "@/services/notification.service";

/** WAITING_ROOM_DELAY threshold (minutes). */
export const WAITING_ROOM_DELAY_MINUTES = 45;

type NotifyInput = Omit<EmitStaffNotificationInput, "actorChannel"> & {
  channel: NotificationActorChannel;
};

export async function notifyStaff(input: NotifyInput) {
  return notificationService.emit({ ...input, actorChannel: input.channel });
}

export function sourceForWaitingRoomState(
  state: WaitingRoomState
): NotificationSource | null {
  switch (state) {
    case "WITH_PROVIDER":
      return "PATIENT_WITH_PROVIDER";
    case "COMPLETED":
      return "APPOINTMENT_COMPLETED";
    case "NO_SHOW":
      return "PATIENT_NO_SHOW";
    default:
      return null;
  }
}

export function titleForWaitingRoomState(state: WaitingRoomState): string {
  switch (state) {
    case "WITH_PROVIDER":
      return "Patient with provider";
    case "COMPLETED":
      return "Appointment completed";
    case "NO_SHOW":
      return "Patient no-show";
    default:
      return `Waiting room: ${state}`;
  }
}
