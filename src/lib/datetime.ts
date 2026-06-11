/**
 * Patient-facing date/time formatting in the clinic's timezone.
 * Set CLINIC_TIMEZONE (IANA name, e.g. "America/New_York"); defaults to UTC.
 */

function clinicTimeZone(): string {
  const tz = process.env.CLINIC_TIMEZONE?.trim();
  if (!tz) return "UTC";
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

export function formatClinicDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: clinicTimeZone(),
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}
