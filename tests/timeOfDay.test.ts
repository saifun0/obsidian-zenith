import { describe, expect, it } from 'vitest';
import { parseTimeOfDay } from '../src/components/ui/fields/TimeField';

/**
 * The time field is a plain text box now, typed into from whatever keypad the
 * platform offers — which on a Russian phone has a comma and no colon.
 */
describe('parseTimeOfDay', () => {
    it('reads the ways a time gets typed', () => {
        for (const raw of ['9:30', '09:30', '930', '0930', '9.30', '9,30', '9 30']) {
            expect(parseTimeOfDay(raw)).toBe('09:30');
        }
        expect(parseTimeOfDay('9')).toBe('09:00');
        expect(parseTimeOfDay('23:59')).toBe('23:59');
    });

    it('treats an empty box as no time', () => {
        expect(parseTimeOfDay('')).toBe('');
        expect(parseTimeOfDay('   ')).toBe('');
    });

    it('refuses what is not a time', () => {
        for (const raw of ['24:00', '9:60', 'noon', '12345', '9:3:0']) {
            expect(parseTimeOfDay(raw)).toBeNull();
        }
    });
});
