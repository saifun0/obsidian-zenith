import { describe, expect, it } from 'vitest';
import { isNewer, parseLatest } from '../src/core/updateCheck';

describe('comparing versions', () => {
    it('sees a later patch, minor or major', () => {
        expect(isNewer('0.2.8', '0.2.7')).toBe(true);
        expect(isNewer('0.3.0', '0.2.9')).toBe(true);
        expect(isNewer('1.0.0', '0.9.9')).toBe(true);
    });

    it('compares numbers, not text', () => {
        expect(isNewer('0.2.10', '0.2.9')).toBe(true);
        expect(isNewer('0.2.9', '0.2.10')).toBe(false);
    });

    it('offers nothing for the same or an older version', () => {
        expect(isNewer('0.2.7', '0.2.7')).toBe(false);
        expect(isNewer('0.2.6', '0.2.7')).toBe(false);
    });

    it('offers nothing for a version it cannot read', () => {
        expect(isNewer('0.2.6a', '0.2.5')).toBe(false);
        expect(isNewer('latest', '0.2.5')).toBe(false);
        expect(isNewer('0.2.8', 'dev')).toBe(false);
    });
});

describe('reading the published manifest', () => {
    it('takes the version and what Obsidian it needs', () => {
        expect(parseLatest({ id: 'zenith', version: '0.2.8', minAppVersion: '1.8.7' })).toEqual({
            version: '0.2.8',
            minAppVersion: '1.8.7',
        });
    });

    it('treats a missing Obsidian version as none needed', () => {
        expect(parseLatest({ version: '0.2.8' })?.minAppVersion).toBe('0.0.0');
    });

    it('is no answer when the version is missing or unreadable', () => {
        expect(parseLatest(null)).toBeNull();
        expect(parseLatest('0.2.8')).toBeNull();
        expect(parseLatest({ version: 8 })).toBeNull();
        expect(parseLatest({ version: 'next' })).toBeNull();
    });
});
