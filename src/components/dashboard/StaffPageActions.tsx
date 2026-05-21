"use client";

import Link from "next/link";

export function StaffPageActions() {
  return (
    <Link href="/dashboard/staff?action=create" className="medflow-btn-primary">
      + Add staff
    </Link>
  );
}
