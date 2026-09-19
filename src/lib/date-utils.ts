/**
 * Date and deadline normalization, parsing, and formatting utilities.
 */

/**
 * Normalizes user-entered date strings into a reliable timestamp in milliseconds.
 * Supports:
 * - ISO string / YYYY-MM-DD format
 * - Date string format (e.g., "Nov 14, 2026", "2026-10-24")
 * - Natural text (e.g., "Oct 24, 2026 4:00 PM")
 * Returns null if the date cannot be parsed.
 */
export function parseDateTimestamp(dateStr?: string | null): number | null {
  if (!dateStr || !dateStr.trim()) return null;
  const trimmed = dateStr.trim();

  // If format is YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    // End of day in local time for deadline
    const [year, month, day] = trimmed.split("-").map(Number);
    const d = new Date(year, month - 1, day, 23, 59, 59, 999);
    return isNaN(d.getTime()) ? null : d.getTime();
  }

  // If format is YYYY-MM-DDTHH:mm
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed)) {
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d.getTime();
  }

  const parsed = Date.parse(trimmed);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Formats a date into a clean, human-readable display string (e.g. "Nov 14, 2026").
 */
export function formatDisplayDate(dateStr?: string | null): string {
  if (!dateStr || !dateStr.trim()) return "TBD";
  const trimmed = dateStr.trim();

  const timestamp = parseDateTimestamp(trimmed);
  if (timestamp === null) {
    return trimmed;
  }

  try {
    const d = new Date(timestamp);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return trimmed;
  }
}

/**
 * Checks if a task is overdue relative to `now`.
 */
export function isOverdue(dateStr?: string | null, now: Date = new Date()): boolean {
  const ts = parseDateTimestamp(dateStr);
  if (ts === null) return false;
  return ts < now.getTime();
}

/**
 * Checks if a deadline is approaching (within the next 48 hours).
 */
export function isApproachingDeadline(dateStr?: string | null, now: Date = new Date()): boolean {
  const ts = parseDateTimestamp(dateStr);
  if (ts === null) return false;
  const nowMs = now.getTime();
  const fortyEightHoursMs = 48 * 60 * 60 * 1000;
  return ts >= nowMs && ts <= nowMs + fortyEightHoursMs;
}
