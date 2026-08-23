import { describe, it, expect } from 'vitest';
import { sanitizeIconSvg, describeSvgProblem, MAX_ICON_BYTES } from '../src/core/icons/iconSvg';

const ok = (raw: string, opts?: Parameters<typeof sanitizeIconSvg>[1]) => {
    const result = sanitizeIconSvg(raw, opts);
    if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.problem)}`);
    return result.svg;
};

const problem = (raw: string) => {
    const result = sanitizeIconSvg(raw);
    if (result.ok) throw new Error(`expected a problem, got ${result.svg}`);
    return result.problem;
};

describe('accepts real icons', () => {
    it('keeps a lucide-shaped outline icon intact', () => {
        const svg = ok(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ' +
                'stroke="currentColor" stroke-width="2"><path d="M5 12h14"/></svg>'
        );
        expect(svg).toContain('viewBox="0 0 24 24"');
        expect(svg).toContain('stroke="currentColor"');
        expect(svg).toContain('<path d="M5 12h14"/>');
    });

    it('keeps a filled multi-colour logo', () => {
        const svg = ok(
            '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" fill="#7c6cf5"/>' +
                '<path d="M10 10L38 38" stroke="#fff"/></svg>'
        );
        expect(svg).toContain('fill="#7c6cf5"');
        expect(svg).toContain('stroke="#fff"');
    });

    it('survives an attribute value containing ">"', () => {
        // A regex tag scan cuts this in half and leaks the tail as text.
        const svg = ok('<svg viewBox="0 0 24 24"><path d="M0 0L1 1" class="a>b"/></svg>');
        expect(svg).toContain('d="M0 0L1 1"');
        expect(svg).not.toContain('b"/>b');
    });

    it('handles single-quoted and unquoted attribute values', () => {
        const svg = ok("<svg viewBox='0 0 24 24'><rect x=1 y=2 width=3 height=4/></svg>");
        expect(svg).toContain('viewBox="0 0 24 24"');
        expect(svg).toContain('x="1"');
        expect(svg).toContain('height="4"');
    });

    it('accepts a self-closing root', () => {
        expect(ok('<svg viewBox="0 0 1 1"/>')).toBe('<svg viewBox="0 0 1 1"/>');
    });
});

describe('rejects what an icon must not do', () => {
    it('refuses inline script', () => {
        expect(problem('<svg viewBox="0 0 1 1"><script>alert(1)</script></svg>')).toEqual({
            kind: 'forbidden-element',
            name: 'script',
        });
    });

    it('refuses a namespaced script', () => {
        expect(problem('<svg viewBox="0 0 1 1"><svg:script>x</svg:script></svg>')).toEqual({
            kind: 'forbidden-element',
            name: 'script',
        });
    });

    it('refuses <image>, which fetches from the network on render', () => {
        expect(
            problem('<svg viewBox="0 0 1 1"><image href="https://tracker.example/p.png"/></svg>')
        ).toEqual({ kind: 'forbidden-element', name: 'image' });
    });

    it('refuses <style>, which escapes the icon and restyles the app', () => {
        expect(problem('<svg viewBox="0 0 1 1"><style>body{display:none}</style></svg>')).toEqual({
            kind: 'forbidden-element',
            name: 'style',
        });
    });

    it('refuses <foreignObject> and links', () => {
        expect(problem('<svg viewBox="0 0 1 1"><foreignObject><b>x</b></foreignObject></svg>').kind)
            .toBe('forbidden-element');
        expect(problem('<svg viewBox="0 0 1 1"><a href="http://x"><path d="M0 0"/></a></svg>').kind)
            .toBe('forbidden-element');
    });

    it('refuses anything that is not an svg', () => {
        expect(problem('<div>hello</div>').kind).toBe('not-svg');
        expect(problem('just text').kind).toBe('not-svg');
        expect(problem('').kind).toBe('empty');
    });

    it('refuses a file past the size cap', () => {
        const huge = `<svg viewBox="0 0 1 1"><path d="${'M0 0'.repeat(MAX_ICON_BYTES)}"/></svg>`;
        expect(problem(huge).kind).toBe('too-large');
    });

    it('refuses an unterminated quoted attribute', () => {
        expect(problem('<svg viewBox="0 0 1 1"><path d="M0 0 />').kind).toBe('unclosed-tag');
    });
});

describe('strips what is unsafe but not worth refusing over', () => {
    it('drops event handlers', () => {
        const svg = ok('<svg viewBox="0 0 1 1"><path d="M0 0" onload="alert(1)" onclick="x()"/></svg>');
        expect(svg).not.toContain('onload');
        expect(svg).not.toContain('onclick');
        expect(svg).toContain('d="M0 0"');
    });

    it('drops javascript: values wherever they hide', () => {
        const svg = ok('<svg viewBox="0 0 1 1"><path d="M0 0" fill="javascript:alert(1)"/></svg>');
        expect(svg).not.toContain('javascript:');
    });

    it('drops an external href but keeps a local one', () => {
        const external = ok('<svg viewBox="0 0 1 1"><use href="https://evil.example/x.svg#a"/></svg>');
        expect(external).not.toContain('evil.example');

        const local = ok('<svg viewBox="0 0 1 1"><use href="#glyph"/></svg>');
        expect(local).toContain('href="#glyph"');
    });

    it('drops url() out of a style attribute', () => {
        const svg = ok('<svg viewBox="0 0 1 1"><path d="M0 0" style="fill:url(//evil.example/x)"/></svg>');
        expect(svg).not.toContain('evil.example');
        expect(svg).not.toContain('style=');
    });

    it('drops comments, doctype and XML prologs', () => {
        const svg = ok(
            '<?xml version="1.0"?><!DOCTYPE svg><!-- <script>alert(1)</script> -->' +
                '<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>'
        );
        expect(svg).not.toContain('<!');
        expect(svg).not.toContain('<?');
        expect(svg).not.toContain('alert');
        expect(svg.startsWith('<svg')).toBe(true);
    });

    it('drops editor cruft together with its subtree', () => {
        const svg = ok(
            '<svg viewBox="0 0 1 1"><metadata><rdf:RDF>junk</rdf:RDF></metadata>' +
                '<sodipodi:namedview id="base"/><path d="M0 0"/></svg>'
        );
        expect(svg).not.toContain('metadata');
        expect(svg).not.toContain('junk');
        expect(svg).not.toContain('namedview');
        expect(svg).toContain('<path d="M0 0"/>');
    });

    it('drops the root width/height so the caller controls the size', () => {
        // A 512px logo must not get to decide the layout.
        const svg = ok('<svg width="512" height="512" viewBox="0 0 512 512"><path d="M0 0"/></svg>');
        expect(svg).not.toContain('width="512"');
        expect(svg).not.toContain('height="512"');
        expect(svg).toContain('viewBox="0 0 512 512"');
    });

    it('keeps width/height on inner shapes', () => {
        const svg = ok('<svg viewBox="0 0 24 24"><rect width="10" height="10"/></svg>');
        expect(svg).toContain('width="10"');
    });
});

describe('id namespacing', () => {
    it('prefixes ids and the references that point at them', () => {
        const svg = ok(
            '<svg viewBox="0 0 24 24"><defs><linearGradient id="g"><stop offset="0"/></linearGradient></defs>' +
                '<path d="M0 0" fill="url(#g)"/></svg>',
            { idPrefix: 'zi-acme-logo' }
        );
        expect(svg).toContain('id="zi-acme-logo-g"');
        expect(svg).toContain('fill="url(#zi-acme-logo-g)"');
        expect(svg).not.toMatch(/url\(#g\)/);
    });

    it('prefixes local href references too', () => {
        const svg = ok('<svg viewBox="0 0 1 1"><use href="#a"/></svg>', { idPrefix: 'p' });
        expect(svg).toContain('href="#p-a"');
    });

    it('keeps ids untouched when no prefix is given', () => {
        const svg = ok('<svg viewBox="0 0 1 1"><path id="a" d="M0 0" fill="url(#a)"/></svg>');
        expect(svg).toContain('id="a"');
        expect(svg).toContain('url(#a)');
    });

    it('sanitises a prefix that is not id-safe', () => {
        const svg = ok('<svg viewBox="0 0 1 1"><path id="a" d="M0 0"/></svg>', {
            idPrefix: 'zi:acme/my logo',
        });
        expect(svg).toContain('id="zi-acme-my-logo-a"');
    });
});

describe('describeSvgProblem', () => {
    it('names the offending element so the author can fix it', () => {
        expect(describeSvgProblem({ kind: 'forbidden-element', name: 'script' })).toContain('script');
    });

    it('reports sizes in KB', () => {
        expect(describeSvgProblem({ kind: 'too-large', bytes: 131072, limit: 65536 })).toContain('128 KB');
    });
});
