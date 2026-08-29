import { describe, it, expect } from 'vitest';
import {
    backgroundAddress,
    backgroundClasses,
    backgroundStyle,
    cssUrl,
    isImagePath,
    type DashboardBgSettings,
} from '../src/modules/dashboard/dashboardBackground';

const base: DashboardBgSettings = {
    dashboardBgSource: 'none',
    dashboardBgUrl: '',
    dashboardBgPath: '',
    dashboardBgFit: 'cover',
    dashboardBgDim: 45,
    dashboardBgBlur: 0,
    dashboardCardOpacity: 72,
    dashboardBgMobile: true,
};

const settings = (over: Partial<DashboardBgSettings>): DashboardBgSettings => ({
    ...base,
    ...over,
});

/** Stands in for Obsidian's resolver. */
const resolve = (path: string) => `app://local/vault/${path}?1700000000`;

describe('cssUrl', () => {
    it('wraps an ordinary address', () => {
        expect(cssUrl('https://example.com/a.jpg')).toBe('url("https://example.com/a.jpg")');
    });

    it('accepts the four schemes a picture can arrive by', () => {
        for (const url of [
            'http://example.com/a.png',
            'https://example.com/a.png',
            'app://local/C:/vault/a.png',
            'capacitor://localhost/a.png',
            'data:image/png;base64,iVBORw0KGgo=',
        ]) {
            expect(cssUrl(url), url).not.toBe('');
        }
    });

    it('refuses a scheme that is not a picture', () => {
        // The one that matters: a settings field is a string a person can be
        // talked into pasting, and there is no correct way to render this.
        expect(cssUrl('javascript:alert(1)')).toBe('');
        expect(cssUrl('data:text/html,<script>')).toBe('');
        expect(cssUrl('vbscript:msgbox')).toBe('');
        expect(cssUrl('  ')).toBe('');
        expect(cssUrl('')).toBe('');
    });

    it('cannot be closed early to start a declaration of its own', () => {
        const out = cssUrl('https://e.com/a.png"); background: red; --x: url("');
        // The words survive inside the address — the point is that they stay
        // inside it. One opening quote, one closing, and between them nothing
        // that could have ended the function early.
        expect(out.startsWith('url("https://e.com/a.png')).toBe(true);
        expect(out.endsWith('")')).toBe(true);
        expect(out.match(/"/g)).toHaveLength(2);
        expect(out.slice(5, -2)).not.toMatch(/["'()\\\s]/);
    });

    it('encodes brackets and backslashes without mangling a real path', () => {
        expect(cssUrl('app://local/C:/My Vault/a b.png')).toBe(
            'url("app://local/C:/My%20Vault/a%20b.png")'
        );
        expect(cssUrl('https://e.com/a(1).png')).toBe('url("https://e.com/a%281%29.png")');
    });

    it('leaves an address that is already encoded alone', () => {
        expect(cssUrl('https://e.com/a%20b.png')).toBe('url("https://e.com/a%20b.png")');
    });
});

describe('isImagePath', () => {
    it('knows a picture from a note', () => {
        expect(isImagePath('a/b/wall.PNG')).toBe(true);
        expect(isImagePath('wall.gif')).toBe(true);
        expect(isImagePath('wall.avif')).toBe(true);
        expect(isImagePath('notes/today.md')).toBe(false);
        expect(isImagePath('noextension')).toBe(false);
    });
});

describe('backgroundAddress', () => {
    it('takes the link when the source is a link', () => {
        expect(
            backgroundAddress(
                settings({ dashboardBgSource: 'url', dashboardBgUrl: ' https://e.com/a.png ' }),
                resolve
            )
        ).toBe('https://e.com/a.png');
    });

    it('resolves a vault path through the caller’s resolver', () => {
        expect(
            backgroundAddress(
                settings({ dashboardBgSource: 'vault', dashboardBgPath: 'Att/a.png' }),
                resolve
            )
        ).toBe('app://local/vault/Att/a.png?1700000000');
    });

    it('refuses a vault path that is not a picture', () => {
        // A stylesheet pointed at a note fails silently, which looks exactly
        // like the setting being ignored.
        expect(
            backgroundAddress(
                settings({ dashboardBgSource: 'vault', dashboardBgPath: 'notes/today.md' }),
                resolve
            )
        ).toBe('');
    });

    it('ignores whichever field the source did not choose', () => {
        const both = { dashboardBgUrl: 'https://e.com/a.png', dashboardBgPath: 'Att/a.png' };
        expect(backgroundAddress(settings({ ...both, dashboardBgSource: 'none' }), resolve)).toBe('');
        expect(backgroundAddress(settings({ ...both, dashboardBgSource: 'url' }), resolve)).toBe(
            'https://e.com/a.png'
        );
    });
});

describe('backgroundStyle', () => {
    const url = (over: Partial<DashboardBgSettings> = {}) =>
        backgroundStyle(
            settings({ dashboardBgSource: 'url', dashboardBgUrl: 'https://e.com/a.png', ...over }),
            resolve
        ) as Record<string, string> | null;

    it('is null when there is nothing to show', () => {
        expect(backgroundStyle(base, resolve)).toBeNull();
        expect(
            backgroundStyle(settings({ dashboardBgSource: 'url', dashboardBgUrl: '' }), resolve)
        ).toBeNull();
        // A refused scheme has to end up as "no wallpaper", not as a broken one.
        expect(
            backgroundStyle(
                settings({ dashboardBgSource: 'url', dashboardBgUrl: 'javascript:alert(1)' }),
                resolve
            )
        ).toBeNull();
    });

    it('maps the three fits onto size and repeat', () => {
        expect(url({ dashboardBgFit: 'cover' })!['--zenith-dash-bg-size']).toBe('cover');
        expect(url({ dashboardBgFit: 'contain' })!['--zenith-dash-bg-size']).toBe('contain');

        const tile = url({ dashboardBgFit: 'tile' })!;
        expect(tile['--zenith-dash-bg-size']).toBe('auto');
        expect(tile['--zenith-dash-bg-repeat']).toBe('repeat');
        expect(url({ dashboardBgFit: 'cover' })!['--zenith-dash-bg-repeat']).toBe('no-repeat');
    });

    it('states the scrim as a fraction', () => {
        expect(url({ dashboardBgDim: 45 })!['--zenith-dash-bg-dim']).toBe('0.45');
        expect(url({ dashboardBgDim: 0 })!['--zenith-dash-bg-dim']).toBe('0');
    });

    it('states the card fill as a percentage for color-mix', () => {
        expect(url({ dashboardCardOpacity: 72 })!['--zenith-card-opacity']).toBe('72%');
        expect(url({ dashboardCardOpacity: 100 })!['--zenith-card-opacity']).toBe('100%');
        expect(url({ dashboardCardOpacity: 5 })!['--zenith-card-opacity']).toBe('30%');
        expect(url({ dashboardCardOpacity: 400 })!['--zenith-card-opacity']).toBe('100%');
    });

    it('clamps values a hand-edited config could carry', () => {
        // `data.json` is a file the user can edit, and a blur of 4000 would
        // take the app down rather than look wrong.
        expect(url({ dashboardBgDim: 500 })!['--zenith-dash-bg-dim']).toBe('0.9');
        expect(url({ dashboardBgDim: -20 })!['--zenith-dash-bg-dim']).toBe('0');
        expect(url({ dashboardBgBlur: 4000 })!['--zenith-dash-bg-blur']).toBe('24px');
        expect(url({ dashboardBgBlur: NaN })!['--zenith-dash-bg-blur']).toBe('0px');
    });
});

describe('backgroundClasses', () => {
    it('says nothing while there is no wallpaper', () => {
        expect(backgroundClasses(settings({}), false)).toBe('');
    });

    it('names only what the stylesheet has to act on', () => {
        expect(backgroundClasses(settings({}), true)).toBe('has-bg has-bg-glass');
    });

    it('drops the glass once the cards are solid', () => {
        // At a hundred there is nothing to see through, and no reason to pay
        // for a backdrop filter behind every card.
        expect(backgroundClasses(settings({ dashboardCardOpacity: 100 }), true)).toBe('has-bg');
        expect(backgroundClasses(settings({ dashboardCardOpacity: 98 }), true)).toContain(
            'has-bg-glass'
        );
        // A hand-edited config cannot get past the clamp either.
        expect(backgroundClasses(settings({ dashboardCardOpacity: 400 }), true)).toBe('has-bg');
    });

    it('asks for the filter only when it would do something', () => {
        expect(backgroundClasses(settings({ dashboardBgBlur: 0 }), true)).not.toContain('has-bg-blur');
        expect(backgroundClasses(settings({ dashboardBgBlur: 8 }), true)).toContain('has-bg-blur');
    });

    it('marks a wallpaper the phone should not load', () => {
        expect(backgroundClasses(settings({ dashboardBgMobile: false }), true)).toContain(
            'no-bg-mobile'
        );
        expect(backgroundClasses(settings({ dashboardBgMobile: true }), true)).not.toContain(
            'no-bg-mobile'
        );
    });
});
