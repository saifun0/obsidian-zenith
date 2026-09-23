import { describe, it, expect } from 'vitest';
import {
    distinctMethods,
    localTimesFor,
    matchSetups,
    scoreSetup,
    withMadhab,
    type MatchSample,
    type MatchSetup,
} from '../src/modules/prayer/prayerMatch';
import { prayerTimes } from '../src/modules/prayer/prayerTimes';

const STAVROPOL = { lat: 45.0428, lon: 41.9734 };
/** Moscow time all year, so the tests do not depend on the machine's zone. */
const MSK = 180;
const at = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
};

/** What the plugin shipped with: the Russian muftiate's angles and a Hanafi asr. */
const DEFAULTS: MatchSetup = {
    method: 'russia',
    asrMadhab: 'hanafi',
    highLatRule: 'angleBased',
    rounding: 'nearest',
};

/**
 * The case that started this: IslamApp in Stavropol on 23 September 2026,
 * against which Zenith's defaults were twelve minutes out at fajr and fifty at
 * asr.
 */
const ISLAMAPP: MatchSample = {
    date: '2026-09-23',
    times: {
        fajr: at('04:21'),
        dhuhr: at('12:04'),
        asr: at('15:27'),
        maghrib: at('18:08'),
        isha: at('19:41'),
    },
};

const timesFor = localTimesFor(STAVROPOL, { tzOffsetMinutes: MSK });

describe('matchSetups — the Stavropol case', () => {
    const ranking = matchSetups([ISLAMAPP], { current: DEFAULTS, tzOffsetMinutes: MSK }, timesFor);
    const best = ranking[0];

    it('finds the Muslim World League with the standard asr', () => {
        expect(best.setup).toMatchObject({ method: 'mwl', asrMadhab: 'standard' });
    });

    it('keeps the settings the times do not depend on as they were', () => {
        // At 45° in September no rule is needed, and rounding to the nearest
        // minute fits better than dropping the seconds — which fixes dhuhr but
        // moves fajr, asr and isha a minute early.
        expect(best.setup).toMatchObject({ highLatRule: 'angleBased', rounding: 'nearest' });
    });

    it('closes the last minute at dhuhr with an adjustment', () => {
        expect(best.residuals[0]).toEqual({ fajr: 0, dhuhr: -1, asr: 0, maghrib: 0, isha: 0 });
        expect(best.adjustments).toEqual({ dhuhr: -1 });
        expect(Object.values(best.after[0]).every((v) => v === 0)).toBe(true);
    });

    it('prefers a named method to the same angles set by hand', () => {
        expect(ranking.some((r) => r.setup.method === 'custom' && r.error <= best.error)).toBe(
            false
        );
    });

    it('offers the other madhab for the same method, with its cost in view', () => {
        const hanafi = withMadhab(ranking, best, 'hanafi');
        expect(hanafi?.setup.method).toBe('mwl');
        expect(hanafi?.residuals[0].asr).toBeLessThan(-40);
        // Too large to be hidden behind an adjustment.
        expect(hanafi?.adjustments.asr).toBeUndefined();
    });

    it('lists each method once among the alternatives', () => {
        const methods = distinctMethods(ranking, 4).map((r) => r.setup.method);
        expect(new Set(methods).size).toBe(methods.length);
        expect(methods[0]).toBe('mwl');
    });
});

describe('matchSetups — reproducing a known setup', () => {
    /** A day computed with a setup, read back as if typed from another app. */
    const sampleOf = (setup: MatchSetup, date: string, lat = STAVROPOL.lat): MatchSample => {
        const [y, m, d] = date.split('-').map(Number);
        const day = prayerTimes({ lat, lon: STAVROPOL.lon }, new Date(y, m - 1, d), {
            ...setup,
            tzOffsetMinutes: MSK,
        });
        const { fajr, sunrise, dhuhr, asr, maghrib, isha } = day.times;
        return { date, times: { fajr, sunrise, dhuhr, asr, maghrib, isha } };
    };

    it('finds custom angles no named method has', () => {
        const setup: MatchSetup = { ...DEFAULTS, method: 'custom', fajrAngle: 13.5, ishaAngle: 19 };
        const samples = [sampleOf(setup, '2026-03-10'), sampleOf(setup, '2026-12-01')];
        const best = matchSetups(samples, { current: DEFAULTS, tzOffsetMinutes: MSK }, timesFor)[0];
        expect(best.setup).toMatchObject({ method: 'custom', fajrAngle: 13.5, ishaAngle: 19 });
        expect(best.error).toBe(0);
    });

    it('tells the roundings apart over enough days', () => {
        const setup: MatchSetup = { ...DEFAULTS, method: 'mwl', rounding: 'floor' };
        const samples = ['2026-01-15', '2026-04-15', '2026-07-15', '2026-10-15'].map((d) =>
            sampleOf(setup, d)
        );
        const best = matchSetups(samples, { current: DEFAULTS, tzOffsetMinutes: MSK }, timesFor)[0];
        expect(best.setup).toMatchObject({ method: 'mwl', rounding: 'floor', asrMadhab: 'hanafi' });
        expect(best.error).toBe(0);
    });

    it('finds the high-latitude rule where it matters', () => {
        // St Petersburg in June: 18° is never reached, so fajr and isha exist
        // only by a rule, and each rule gives a different answer.
        const spb = { lat: 59.94, lon: 30.31 };
        const setup: MatchSetup = { ...DEFAULTS, method: 'mwl', highLatRule: 'seventhOfNight' };
        const [y, m, d] = [2026, 6, 20];
        const day = prayerTimes(spb, new Date(y, m - 1, d), { ...setup, tzOffsetMinutes: MSK });
        const sample: MatchSample = {
            date: '2026-06-20',
            times: { fajr: day.times.fajr, isha: day.times.isha, asr: day.times.asr },
        };
        const best = matchSetups(
            [sample],
            { current: DEFAULTS, tzOffsetMinutes: MSK },
            localTimesFor(spb, { tzOffsetMinutes: MSK })
        )[0];
        expect(best.setup.highLatRule).toBe('seventhOfNight');
        expect(best.error).toBe(0);
    });
});

describe('scoreSetup', () => {
    it('reads an isha after midnight as the same minute, not a day apart', () => {
        const result = scoreSetup(
            [{ date: '2026-06-20', times: { isha: at('00:30') } }],
            DEFAULTS,
            () => ({ isha: 1470 })
        );
        expect(result.residuals[0].isha).toBe(0);
    });

    it('takes the median across days, so one mistyped day does not skew the rest', () => {
        const result = scoreSetup(
            [
                { date: '2026-01-01', times: { dhuhr: 700 } },
                { date: '2026-01-02', times: { dhuhr: 700 } },
                { date: '2026-01-03', times: { dhuhr: 709 } },
            ],
            DEFAULTS,
            () => ({ dhuhr: 702 })
        );
        expect(result.adjustments).toEqual({ dhuhr: -2 });
        expect(result.after.map((r) => r.dhuhr)).toEqual([0, 0, 9]);
    });

    it('counts a time the setup cannot produce as a full miss', () => {
        const result = scoreSetup([{ date: '2026-06-20', times: { fajr: 120 } }], DEFAULTS, () => ({
            fajr: NaN,
        }));
        expect(result.error).toBe(1440);
        expect(result.adjustments).toEqual({});
    });

    it('does not dress a wrong method up as a correction', () => {
        const result = scoreSetup([{ date: '2026-01-01', times: { asr: 900 } }], DEFAULTS, () => ({
            asr: 950,
        }));
        expect(result.adjustments).toEqual({});
    });
});

describe('matchSetups — nothing to go on', () => {
    it('returns nothing when no time was typed', () => {
        expect(
            matchSetups([{ date: '2026-01-01', times: {} }], { current: DEFAULTS }, timesFor)
        ).toEqual([]);
    });
});
