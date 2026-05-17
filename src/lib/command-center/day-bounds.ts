/** America/Chicago day window for operational metrics (server local midnight fallback). */
export function getOperationalDayBounds(now = new Date()) {
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  return { todayStart, todayEnd };
}
