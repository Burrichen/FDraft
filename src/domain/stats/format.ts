/** Formats a minute count as "Xh Ym" (omitting whichever unit is zero), for runtime stat cards. */
export function formatRuntimeMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}
