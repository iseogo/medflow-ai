"use client";

import Link from "next/link";

export function ClientPageActions({ canWrite }: { canWrite: boolean }) {
  if (!canWrite) return null;
  return (
    <Link href="/dashboard/clients?action=create" className="medflow-btn-primary">
      + Add client
    </Link>
  );
}
