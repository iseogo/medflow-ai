import { NextResponse } from "next/server";
import { DuplicateCommunicationError } from "@/lib/communication-dedup";
import { DuplicateProposalError } from "@/lib/proposal-dedup";

export function handleApiError(error: unknown) {
  if (error instanceof DuplicateProposalError) {
    return NextResponse.json(
      {
        error: error.message,
        code: "DUPLICATE_PROPOSAL",
        existingId: error.existingId,
      },
      { status: 409 }
    );
  }
  if (error instanceof DuplicateCommunicationError) {
    return NextResponse.json(
      {
        error: error.message,
        code: "DUPLICATE_COMMUNICATION",
        existingId: error.existingId,
        channel: error.channel,
      },
      { status: 409 }
    );
  }
  if (error instanceof Error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}
