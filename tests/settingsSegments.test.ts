import { describe, it, expect } from 'vitest';
import { segment } from '../src/settings/schema/SettingsForm';
import { groupNeedsAttention } from '../src/settings/schema/helpers';
import type { SettingField, SettingsGroup } from '../src/settings/schema/types';

/**
 * Where one card ends and the next begins.
 *
 * This is the rule the settings page's whole vertical rhythm now rests on. The
 * separator under a row and the space after a group are both drawn with
 * `:last-child`, and `:last-child` is only true of the markup if the markup
 * actually groups the rows — which, before the card, it did not.
 */

const row = (key: string): SettingField => ({
    type: 'toggle',
    key,
    labelKey: `l.${key}`,
    default: false,
});

const heading = (key: string): SettingField => ({ type: 'heading', key, labelKey: `h.${key}` });

const panel = (key: string): SettingField => ({
    type: 'custom',
    key,
    render: () => null,
});

const customRow = (key: string): SettingField => ({
    type: 'custom',
    key,
    row: true,
    render: () => null,
});

const shape = (fields: SettingField[]) =>
    segment(fields).map((s) => `${s.kind}:${s.fields.map((f) => f.key).join(',')}`);

describe('fields are cut into cards', () => {
    it('keeps a run of rows together', () => {
        expect(shape([row('a'), row('b'), row('c')])).toEqual(['rows:a,b,c']);
    });

    /** A heading is a new subject, and therefore a new card. */
    it('starts a new card at a heading', () => {
        expect(shape([row('a'), heading('h'), row('b')])).toEqual([
            'rows:a',
            'heading:h',
            'rows:b',
        ]);
    });

    /**
     * A panel draws its own surface — the sync record, the content-type table.
     * Nesting one inside a card would frame it twice.
     */
    it('leaves a self-drawing custom field on its own', () => {
        expect(shape([row('a'), panel('p'), row('b')])).toEqual(['rows:a', 'custom:p', 'rows:b']);
    });

    /**
     * The other kind of custom field is one ordinary row with bespoke innards —
     * a place picker, an image chooser. Those belong in the card with their
     * neighbours, or they float between carded groups looking like mistakes.
     */
    it('keeps a row-shaped custom field in the card', () => {
        expect(shape([row('a'), customRow('c'), row('b')])).toEqual(['rows:a,c,b']);
    });

    it('never merges two headings into one card', () => {
        expect(shape([heading('x'), heading('y')])).toEqual(['heading:x', 'heading:y']);
    });

    it('handles a group that is nothing but a panel', () => {
        expect(shape([panel('p')])).toEqual(['custom:p']);
    });

    it('survives an empty group', () => {
        expect(segment([])).toEqual([]);
    });

    /**
     * The shape that produced the original bug: a run of rows followed by
     * something else. The last row of the run has to be the last child of its
     * own container, not merely the last row before a label.
     */
    it('makes the final row of a run the last child of its card', () => {
        const segs = segment([row('a'), row('b'), heading('h'), row('c')]);
        const firstCard = segs[0];
        expect(firstCard.kind).toBe('rows');
        expect(firstCard.fields[firstCard.fields.length - 1].key).toBe('b');
    });
});

/**
 * Whether a fold opens holding its own bad news.
 *
 * The three folds at the foot of sync are exactly where a page can hide the
 * reason it is not working: encryption is switched on with no password, and
 * the switch that says so is two clicks away behind a chevron. So the same
 * question decides the mark on the header and the state the fold arrives in —
 * and it has to notice both kinds of wrong, the one a group declares about
 * itself and the one a field declares about its own value.
 */
describe('a fold knows when it is holding a problem', () => {
    const group = (over: Partial<SettingsGroup>): SettingsGroup => ({
        id: 'g',
        fields: [],
        ...over,
    });

    it('is quiet when nothing is wrong', () => {
        expect(groupNeedsAttention(group({ fields: [row('a')] }), { a: false })).toBe(false);
    });

    it('notices a group that declares itself unhappy', () => {
        const g = group({ alertIf: (v) => v.on === true });
        expect(groupNeedsAttention(g, { on: true })).toBe(true);
        expect(groupNeedsAttention(g, { on: false })).toBe(false);
    });

    it('notices a field that fails its own validation', () => {
        const g = group({
            fields: [
                {
                    type: 'text',
                    key: 'password',
                    labelKey: 'l.password',
                    default: '',
                    validate: (value) => (String(value ?? '') ? null : 'required'),
                },
            ],
        });

        expect(groupNeedsAttention(g, { password: '' })).toBe(true);
        expect(groupNeedsAttention(g, { password: 'hunter2' })).toBe(false);
    });

    /**
     * A field `showIf` has taken off the page is not something anybody can go
     * and fix, so it cannot be the reason a fold springs open. This holds
     * because the caller passes groups from `visibleGroups`, which is the only
     * place that knows what is on screen.
     */
    it('is told what is visible rather than working it out', () => {
        const hidden: SettingsGroup = {
            id: 'g',
            fields: [
                {
                    type: 'text',
                    key: 'password',
                    labelKey: 'l.password',
                    default: '',
                    showIf: () => false,
                    validate: () => 'required',
                },
            ],
        };

        expect(groupNeedsAttention({ ...hidden, fields: [] }, {})).toBe(false);
        expect(groupNeedsAttention(hidden, {})).toBe(true);
    });
});
