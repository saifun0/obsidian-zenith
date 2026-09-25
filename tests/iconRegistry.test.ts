import { describe, it, expect } from 'vitest';
import {
    IconRegistry,
    iconId,
    isCustomIconId,
    isSafeIconName,
} from '../src/core/icons/iconRegistry';

const LOGO = '<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>';

describe('id scheme', () => {
    it('namespaces ids so they cannot collide with lucide', () => {
        expect(iconId('acme', 'logo')).toBe('zi:acme/logo');
        expect(isCustomIconId('zi:acme/logo')).toBe(true);
        // Every built-in id Zenith stores today is a bare lucide name.
        expect(isCustomIconId('book-open')).toBe(false);
        expect(isCustomIconId(undefined)).toBe(false);
    });

    it('rejects names that would not survive being an id', () => {
        expect(isSafeIconName('logo')).toBe(true);
        expect(isSafeIconName('my-logo_2')).toBe(true);
        expect(isSafeIconName('../escape')).toBe(false);
        expect(isSafeIconName('has space')).toBe(false);
        expect(isSafeIconName('-leading')).toBe(false);
        expect(isSafeIconName('a'.repeat(65))).toBe(false);
    });
});

describe('registration', () => {
    it('registers and resolves an icon', () => {
        const registry = new IconRegistry();
        const result = registry.add('acme', 'pack', 'logo', LOGO);

        expect(result.ok).toBe(true);
        expect(registry.has('zi:acme/logo')).toBe(true);
        expect(registry.svg('zi:acme/logo')).toContain('<path');
        expect(registry.size).toBe(1);
    });

    it('sanitizes on the way in, so nothing unsafe is ever stored', () => {
        const registry = new IconRegistry();
        const result = registry.add(
            'acme',
            'pack',
            'bad',
            '<svg viewBox="0 0 1 1"><script>alert(1)</script></svg>'
        );

        expect(result.ok).toBe(false);
        expect(registry.has('zi:acme/bad')).toBe(false);
    });

    it('rejects an unsafe name before it becomes a path', () => {
        const registry = new IconRegistry();
        const result = registry.add('acme', 'pack', '../../evil', LOGO);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.problem.kind).toBe('bad-name');
        expect(registry.size).toBe(0);
    });

    it('namespaces internal ids per icon, so two logos cannot fight', () => {
        const registry = new IconRegistry();
        const gradient =
            '<svg viewBox="0 0 24 24"><defs><linearGradient id="a"><stop offset="0"/></linearGradient>' +
            '</defs><path d="M0 0" fill="url(#a)"/></svg>';

        registry.add('one', 'pack', 'logo', gradient);
        registry.add('two', 'pack', 'logo', gradient);

        const first = registry.svg('zi:one/logo') ?? '';
        const second = registry.svg('zi:two/logo') ?? '';
        expect(first).toContain('id="zi-one-logo-a"');
        expect(second).toContain('id="zi-two-logo-a"');
        expect(first).not.toBe(second);
    });

    it('replaces an icon registered twice rather than duplicating it', () => {
        const registry = new IconRegistry();
        registry.add('acme', 'pack', 'logo', LOGO);
        registry.add('acme', 'pack', 'logo', '<svg viewBox="0 0 9 9"><circle r="1"/></svg>');

        expect(registry.size).toBe(1);
        expect(registry.svg('zi:acme/logo')).toContain('circle');
        expect(registry.listSources()[0].icons).toHaveLength(1);
    });

    it('keeps the canonical camelCase spelling through registration', () => {
        const registry = new IconRegistry();
        registry.add('acme', 'pack', 'grad', LOGO);
        expect(registry.svg('zi:acme/grad')).toContain('viewBox=');
    });
});

describe('sources', () => {
    it('groups icons under their source with its label', () => {
        const registry = new IconRegistry();
        registry.add('acme', 'pack', 'logo', LOGO, { label: 'Acme Icons', author: 'Acme' });
        registry.add('acme', 'pack', 'mark', LOGO);

        const [source] = registry.listSources();
        expect(source.label).toBe('Acme Icons');
        expect(source.author).toBe('Acme');
        expect(source.icons).toHaveLength(2);
    });

    it('records an empty source, because an empty pack is still a fact', () => {
        const registry = new IconRegistry();
        registry.ensureSource('empty', 'pack', 'Empty Pack');
        expect(registry.listSources()).toHaveLength(1);
        expect(registry.listSources()[0].icons).toHaveLength(0);
    });

    it('removes everything a source contributed', () => {
        const registry = new IconRegistry();
        registry.add('acme', 'pack', 'logo', LOGO);
        registry.add('acme', 'pack', 'mark', LOGO);
        registry.add('other', 'pack', 'glyph', LOGO);

        registry.removeSource('acme');

        expect(registry.has('zi:acme/logo')).toBe(false);
        expect(registry.has('zi:acme/mark')).toBe(false);
        expect(registry.has('zi:other/glyph')).toBe(true);
        expect(registry.listSources()).toHaveLength(1);
    });

    it('sorts sources by label so the picker order is stable', () => {
        const registry = new IconRegistry();
        registry.add('z', 'pack', 'a', LOGO, { label: 'Zebra' });
        registry.add('a', 'pack', 'a', LOGO, { label: 'Alpha' });
        expect(registry.listSources().map((s) => s.label)).toEqual(['Alpha', 'Zebra']);
    });
});

describe('change notification', () => {
    it('bumps the revision and notifies on add and remove', () => {
        const registry = new IconRegistry();
        let calls = 0;
        const unsubscribe = registry.subscribe(() => calls++);

        const before = registry.getRevision();
        registry.add('acme', 'pack', 'logo', LOGO);
        registry.removeSource('acme');

        expect(calls).toBe(2);
        expect(registry.getRevision()).toBeGreaterThan(before);

        unsubscribe();
        registry.add('acme', 'pack', 'logo', LOGO);
        expect(calls).toBe(2);
    });

    it('can batch a bulk load into one notification', () => {
        const registry = new IconRegistry();
        let calls = 0;
        registry.subscribe(() => calls++);

        registry.add('acme', 'pack', 'a', LOGO, { silent: true });
        registry.add('acme', 'pack', 'b', LOGO, { silent: true });
        expect(calls).toBe(0);

        registry.emit();
        expect(calls).toBe(1);
    });

    it('survives a listener that throws', () => {
        const registry = new IconRegistry();
        let reached = false;
        registry.subscribe(() => {
            throw new Error('boom');
        });
        registry.subscribe(() => {
            reached = true;
        });

        expect(() => registry.add('acme', 'pack', 'logo', LOGO)).not.toThrow();
        expect(reached).toBe(true);
    });
});
