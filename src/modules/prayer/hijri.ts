/**
 * The Islamic date, from the platform's own calendar.
 *
 * `Intl` ships the Umm al-Qura calendar in Electron and on both mobile
 * platforms, so there is nothing to compute and nothing to keep up to date —
 * and no arithmetic approximation of ours to drift against what a user's phone
 * says. If the runtime turns out not to have it, every function here returns
 * null and the UI simply doesn't draw the line, rather than showing a date that
 * quietly fell back to the Gregorian one.
 *
 * The ±days offset exists because the month genuinely begins on different days
 * in different places: Umm al-Qura is a printed calculation, local sighting is
 * an observation, and people follow their own mosque.
 */

export interface HijriDate {
    /** 1–30. */
    day: number;
    /** 1–12, Muharram = 1. */
    month: number;
    year: number;
}

/** Ramadan's index, for the methods that stretch isha during it. */
export const RAMADAN_MONTH = 9;

/**
 * Built once and reused: constructing an `Intl.DateTimeFormat` is expensive
 * enough to matter in a widget that re-renders every second.
 *
 * `undefined` means "not tried yet", `null` means "this runtime has no Islamic
 * calendar" — two states a single nullable couldn't tell apart, which would
 * mean rebuilding the formatter on every call on exactly the devices where it
 * can never work.
 */
let formatter: Intl.DateTimeFormat | null | undefined;

function hijriFormatter(): Intl.DateTimeFormat | null {
    if (formatter !== undefined) return formatter;
    try {
        const candidate = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
            day: 'numeric',
            month: 'numeric',
            year: 'numeric',
        });
        // A runtime without the calendar doesn't throw — it silently resolves
        // to `gregory`, which would hand back today's Gregorian date dressed as
        // a Hijri one. Checking what it actually resolved to is the only way to
        // notice.
        const { calendar } = candidate.resolvedOptions();
        formatter = calendar === 'islamic-umalqura' || calendar === 'islamic' ? candidate : null;
    } catch {
        formatter = null;
    }
    return formatter;
}

/** The Islamic date for a day, or null when the runtime can't say. */
export function hijriDate(date: Date, offsetDays = 0): HijriDate | null {
    const fmt = hijriFormatter();
    if (!fmt) return null;

    // Shifted by calendar field, not by milliseconds. A day is not always
    // 86_400_000 ms long: on the date a DST-observing zone falls back it is an
    // hour longer, so adding a day’s worth of milliseconds to local midnight
    // lands at 23:00 on the SAME date. The offset then silently does nothing,
    // on one day a year, for the users who set it. `addDays` in
    // `core/calendarDates` shifts this way for exactly this reason.
    const shifted = new Date(date.getTime());
    shifted.setDate(shifted.getDate() + offsetDays);
    const parts = fmt.formatToParts(shifted);

    const read = (type: Intl.DateTimeFormatPartTypes): number => {
        const raw = parts.find((p) => p.type === type)?.value ?? '';
        // The year part can carry an era suffix ("1447 AH"); parseInt stops at
        // the first non-digit, which is exactly what we want here.
        return Number.parseInt(raw, 10);
    };

    const day = read('day');
    const month = read('month');
    const year = read('year');
    if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
    return { day, month, year };
}

/** Whether a day falls in Ramadan. False when the calendar is unavailable. */
export function isRamadan(date: Date, offsetDays = 0): boolean {
    return hijriDate(date, offsetDays)?.month === RAMADAN_MONTH;
}

/** i18n key for a Hijri month number, e.g. `hijri.month.9`. */
export function hijriMonthKey(month: number): string {
    return `hijri.month.${month}`;
}
