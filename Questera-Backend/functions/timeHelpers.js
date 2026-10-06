/**
 * Timezone helpers for autopilot scheduling.
 *
 * The autopilot stores wall-clock times ("post at 09:00", "quiet after 22:00")
 * alongside an IANA timezone, but the original implementation compared them
 * against the *server's* local clock. On a UTC production box that silently
 * shifted every user's schedule by their UTC offset. These helpers do the
 * conversion properly using Intl, with no new dependency.
 */

/**
 * Wall-clock parts of an instant, as observed in `timeZone`.
 */
function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
    .formatToParts(date)
    .filter((p) => p.type !== 'literal');

  const out = {};
  for (const p of parts) out[p.type] = Number(p.value);

  return {
    year: out.year,
    month: out.month,
    day: out.day,
    // Intl can report midnight as "24" in some ICU builds.
    hour: out.hour % 24,
    minute: out.minute,
  };
}

/**
 * Minutes since midnight, right now, in `timeZone`.
 */
function minutesOfDayInZone(date, timeZone) {
  const { hour, minute } = zonedParts(date, timeZone);
  return hour * 60 + minute;
}

/**
 * The UTC instant at which the wall clock in `timeZone` reads the given
 * date/time. Iterates twice so it settles correctly across DST boundaries.
 */
function zonedTimeToUtc(year, month, day, hour, minute, timeZone) {
  const target = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let utc = target;

  for (let i = 0; i < 2; i++) {
    const p = zonedParts(new Date(utc), timeZone);
    const observed = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0, 0);
    utc = target - (observed - utc);
  }

  return new Date(utc);
}

/**
 * Next occurrence of "HH:MM" in `timeZone`, strictly after `from`.
 */
function nextOccurrenceOf(timeStr, timeZone, from = new Date()) {
  const [hour, minute] = String(timeStr || '08:00').split(':').map(Number);
  const safeHour = Number.isFinite(hour) ? hour : 8;
  const safeMinute = Number.isFinite(minute) ? minute : 0;

  const today = zonedParts(from, timeZone);
  let next = zonedTimeToUtc(today.year, today.month, today.day, safeHour, safeMinute, timeZone);

  if (next <= from) {
    // Roll to the same wall-clock time tomorrow.
    const tomorrow = zonedParts(new Date(from.getTime() + 24 * 60 * 60 * 1000), timeZone);
    next = zonedTimeToUtc(tomorrow.year, tomorrow.month, tomorrow.day, safeHour, safeMinute, timeZone);
  }

  return next;
}

/**
 * Turn "HH:MM" into a Date for today in `timeZone`, rolling to tomorrow if the
 * slot has already passed. Used to place a planned post on the calendar.
 */
function scheduleSlot(timeStr, timeZone, from = new Date()) {
  return nextOccurrenceOf(timeStr, timeZone, from);
}

function isValidTimeZone(tz) {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch (err) {
    return false;
  }
}

module.exports = {
  zonedParts,
  minutesOfDayInZone,
  zonedTimeToUtc,
  nextOccurrenceOf,
  scheduleSlot,
  isValidTimeZone,
};
