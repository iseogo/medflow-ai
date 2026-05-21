import { NextRequest } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { handleChangePassword } from "@/lib/auth/change-password-handler";
import { getRequestMeta } from "@/lib/request-meta";

export async function POST(request: NextRequest) {
  const { error, user } = await requireSession();
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  return handleChangePassword(user!.id, body, getRequestMeta(request));
}
