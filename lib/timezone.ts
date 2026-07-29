/**
 * Single source of truth for the "everything in Master Grid runs on Eastern
 * Time" decision. Using the IANA zone "America/New_York" instead of a fixed
 * "EST" offset means this automatically tracks US Eastern Daylight/Standard
 * Time transitions - it'll correctly show/label EDT in summer and EST in
 * winter, which is what "Eastern Time" actually means day to day. Labeling
 * something "EST" year-round would be wrong for roughly 8 months of the year.
 */
export const EASTERN_TZ = "America/New_York";

/**
 * Converts a wall-clock date+time that's meant to represent Eastern Time
 * (e.g. a mentor typing "2:30 PM" into a plain <input type="time">) into a
 * true UTC ISO string, correctly accounting for EST vs EDT on that specific
 * date. Without this, `new Date(`${date}T${time}`)` would interpret the
 * typed time in whatever timezone the mentor's *browser* happens to be in -
 * which breaks the "everyone sees the same, unambiguous time" goal the
 * moment a mentor or student is outside the Eastern timezone.
 *
 * Standard trick (no date library needed): interpret the typed digits as if
 * they were UTC, see what wall-clock time that instant displays as in
 * America/New_York, and use the difference to correct the guess.
 */
export function nyWallTimeToUtcIso(dateStr: string, timeStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  const guessMs = Date.UTC(y, m - 1, d, hh, mm, 0);

  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(new Date(guessMs))) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  const hour = parts.hour === "24" ? 0 : Number(parts.hour);
  const nyGuessMs = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    hour,
    Number(parts.minute),
    Number(parts.second)
  );

  const offsetMs = guessMs - nyGuessMs;
  return new Date(guessMs + offsetMs).toISOString();
}

/** Today's calendar date in Eastern Time, as "YYYY-MM-DD". Used by the
 *  midnight-ET cron to find "today's" bookings regardless of what UTC date
 *  the server clock thinks it is. */
export function easternDateStringNow(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: EASTERN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date()); // en-CA formats as YYYY-MM-DD
}
