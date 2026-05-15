"use client";

import { LogOut } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { ROLE_LABELS } from "@/lib/constants";

export function Header({ title }: { title: string }) {
  const { data: session } = useSession();
  const role = session?.user?.role;

  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-8">
      <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-sm font-medium text-slate-900">
            {session?.user?.name}
          </p>
          <p className="text-xs text-slate-500">
            {role ? ROLE_LABELS[role] ?? role : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="medflow-btn-secondary gap-2"
          aria-label="Sign out"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </header>
  );
}
