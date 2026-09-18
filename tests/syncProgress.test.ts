import { describe, it, expect } from 'vitest';
import { translatorFor } from '../src/core/i18n';
import {
    countLine,
    doneLine,
    etaSeconds,
    formatBytes,
    progressRatio,
    rateLine,
    transferRate,
} from '../src/modules/sync/progressFormat';
import type { SyncProgress } from '../src/modules/sync/services/SyncEngine';

const t = translatorFor('en');

const START = 1_800_000_000_000;

const progress = (over: Partial<SyncProgress> = {}): SyncProgress => ({
    done: 10,
    total: 40,
    key: 'Notes/one.md',
    bytes: 2 * 1024 * 1024,
    totalBytes: 8 * 1024 * 1024,
    startedAt: START,
    ...over,
});

describe('progressRatio', () => {
    // Files, not bytes: a plan of pure deletions moves nothing at all, and a bar
    // driven by bytes would sit at zero for the whole of it.
    it('measures the run in files', () => {
        expect(progressRatio(progress({ done: 10, total: 40 }))).toBe(0.25);
        expect(progressRatio(progress({ done: 0, total: 3, bytes: 0, totalBytes: 0 }))).toBe(0);
    });

    it('never divides by nothing and never overshoots', () => {
        expect(progressRatio(progress({ done: 0, total: 0 }))).toBe(0);
        expect(progressRatio(progress({ done: 9, total: 4 }))).toBe(1);
    });
});

describe('formatBytes', () => {
    it('climbs to the unit that leaves a readable number', () => {
        expect(formatBytes(4096, t)).toBe('4 kB');
        expect(formatBytes(1024 * 1024 * 9.44, t)).toBe('9.4 MB');
        expect(formatBytes(1024 * 1024 * 128, t)).toBe('128 MB');
        expect(formatBytes(1024 * 1024 * 1024 * 3, t)).toBe('3 GB');
    });

    // One decimal below ten and none above it: "128.4 MB" spends a character on
    // a tenth of a percent.
    it('drops the decimal once the number carries itself', () => {
        expect(formatBytes(1024 * 1024 * 42.7, t)).toBe('43 MB');
    });

    it('has an answer for nothing at all', () => {
        expect(formatBytes(0, t)).toBe('0 kB');
        expect(formatBytes(Number.NaN, t)).toBe('0 kB');
    });
});

describe('transferRate', () => {
    it('averages over the whole run', () => {
        const p = progress({ bytes: 4 * 1024 * 1024 });
        expect(transferRate(p, START + 2000)).toBe(2 * 1024 * 1024);
    });

    // Under a third of a second the divisor does all the work, and the answer is
    // whatever the first file happened to be times three.
    it('says nothing before there is anything to average', () => {
        expect(transferRate(progress(), START + 100)).toBeNull();
        expect(transferRate(progress({ bytes: 0 }), START + 5000)).toBeNull();
    });
});

describe('etaSeconds', () => {
    it('is what is left at the rate so far', () => {
        // 2 MB in two seconds, 6 MB to go.
        const p = progress({ bytes: 2 * 1024 * 1024, totalBytes: 8 * 1024 * 1024 });
        expect(etaSeconds(p, START + 2000)).toBe(6);
    });

    // An estimate is a fiction in exactly three cases, and `Infinity` seconds
    // renders as a bar that says the sync will never end.
    it('refuses to guess where there is nothing to go on', () => {
        expect(etaSeconds(progress({ bytes: 0 }), START + 4000)).toBeNull();
        expect(etaSeconds(progress({ bytes: 999, totalBytes: 0 }), START + 4000)).toBeNull();
        expect(
            etaSeconds(
                progress({ bytes: 8 * 1024 * 1024, totalBytes: 8 * 1024 * 1024 }),
                START + 4000
            )
        ).toBeNull();
    });
});

describe('rateLine', () => {
    it('reads as a rate and a remainder', () => {
        const p = progress({ bytes: 2 * 1024 * 1024, totalBytes: 8 * 1024 * 1024 });
        expect(rateLine(p, START + 2000, t)).toBe('1 MB/s · 6 s left');
    });

    // A run of deletions has a rate of nothing and an estimate of nothing. The
    // line is empty rather than "0 kB/s · ∞".
    it('says nothing rather than something false', () => {
        const p = progress({ bytes: 0, totalBytes: 0 });
        expect(rateLine(p, START + 3000, t)).toBe('');
    });
});

describe('doneLine and countLine', () => {
    it('reports the whole run once it is over', () => {
        const p = progress({ done: 40, total: 40, bytes: 8 * 1024 * 1024 });
        expect(countLine(p)).toBe('40 / 40');
        expect(doneLine(p, START + 9000, t)).toBe('40 files · 8 MB · 9 s');
    });

    // A run over in under a second has no duration worth printing, and a run
    // that only deleted has no size.
    it('leaves out what it has nothing to say about', () => {
        const p = progress({ done: 3, total: 3, bytes: 0 });
        expect(doneLine(p, START + 400, t)).toBe('3 files');
    });
});
