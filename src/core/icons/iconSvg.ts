/**
 * Turning an arbitrary `.svg` file into markup Zenith is willing to inline.
 *
 * This is deliberately a pure string function with no DOM: it runs while
 * loading packs (before anything is rendered), and it has to be unit-testable
 * under vitest's node environment, where there is no `DOMParser`.
 *
 * On the threat model: an icon pack is just a folder of files a user copied
 * in from the internet, and inlining a
 * stranger's `<svg>` verbatim would hand it script execution, network beacons
 * via `<image href>`, and CSS injection via `<style>`. Failing closed on those
 * costs an author nothing — every one of them is avoidable in a logo.
 */

/** Icons are small. Anything past this is a picture, not an icon. */
export const MAX_ICON_BYTES = 64 * 1024;

export type SvgProblem =
    | { kind: 'empty' }
    | { kind: 'too-large'; bytes: number; limit: number }
    | { kind: 'not-svg' }
    | { kind: 'forbidden-element'; name: string }
    | { kind: 'unclosed-tag' };

export type SvgCheck = { ok: true; svg: string } | { ok: false; problem: SvgProblem };

/**
 * Elements that make an icon do something an icon has no business doing.
 * Rejected by name so the author gets told which one, rather than silently
 * losing part of their artwork.
 */
const FORBIDDEN = new Set([
    'script',
    'style',
    'foreignobject',
    'image',
    'a',
    'handler',
    'iframe',
    'embed',
    'object',
    'video',
    'audio',
    'animate',
    'animatetransform',
    'animatemotion',
    'set',
]);

/**
 * SVG is XML, so its names are CASE-SENSITIVE: a `<linearGradient>` emitted as
 * `<lineargradient>` is an unknown element and simply does not paint, and the
 * same goes for `viewBox`, `stdDeviation` and friends. Matching therefore has to
 * be case-insensitive while the output stays canonical — hence a lowercase
 * lookup key mapping to the spelling actually written out.
 */
const canonical = (names: string[]): ReadonlyMap<string, string> =>
    new Map(names.map((n) => [n.toLowerCase(), n]));

/** The render-safe SVG subset. Anything outside it is dropped quietly. */
const ALLOWED_ELEMENTS = canonical([
    'svg', 'g', 'defs', 'symbol', 'use', 'title', 'desc',
    'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
    'text', 'tspan', 'textPath',
    'linearGradient', 'radialGradient', 'stop',
    'clipPath', 'mask', 'pattern', 'filter',
    'feGaussianBlur', 'feOffset', 'feBlend', 'feColorMatrix', 'feComposite',
    'feFlood', 'feMerge', 'feMergeNode', 'feDropShadow',
]);

/**
 * Attributes worth keeping. Presentation and geometry only — no `on*`, no
 * scripting hooks, and no `href` except the local-reference form handled below.
 */
const ALLOWED_ATTRS = canonical([
    'viewBox', 'xmlns', 'xmlns:xlink', 'fill', 'fill-rule', 'fill-opacity',
    'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray',
    'stroke-dashoffset', 'stroke-opacity', 'stroke-miterlimit',
    'opacity', 'color', 'transform', 'd', 'points',
    'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry',
    'width', 'height', 'offset', 'stop-color', 'stop-opacity',
    'gradientUnits', 'gradientTransform', 'spreadMethod',
    'clip-path', 'clip-rule', 'mask', 'filter', 'patternUnits', 'patternContentUnits',
    'maskUnits', 'clipPathUnits', 'preserveAspectRatio',
    'text-anchor', 'font-size', 'font-family', 'font-weight', 'letter-spacing',
    'dominant-baseline', 'vector-effect', 'paint-order', 'id', 'class',
    'result', 'in', 'in2', 'stdDeviation', 'dx', 'dy', 'mode', 'values', 'type',
    'flood-color', 'flood-opacity', 'operator',
]);

/** Values that must never appear anywhere, whatever attribute carries them. */
const DANGEROUS_VALUE = /javascript:|vbscript:|data:text\/html|expression\s*\(|@import/i;

interface Attr {
    name: string;
    value: string;
    /** Whether the source wrote `name` alone, with no `="value"`. */
    bare: boolean;
}

interface Tag {
    kind: 'open' | 'close' | 'self';
    name: string;
    attrs: Attr[];
}

const isSpace = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';

/**
 * Read one tag starting at `<`.
 *
 * Hand-rolled rather than regex because attribute values may contain `>` —
 * `<path d="M0 0L1 1" data-x="a>b"/>` is legal, and a `/<[^>]*>/` scan would cut
 * it in the middle and leave the tail to be treated as text.
 */
function readTag(src: string, start: number): { tag: Tag; end: number } | null {
    let i = start + 1;
    const kind: 'open' | 'close' = src[i] === '/' ? 'close' : 'open';
    if (kind === 'close') i++;

    const nameStart = i;
    while (i < src.length && !isSpace(src[i]) && src[i] !== '>' && src[i] !== '/') i++;
    const name = src.slice(nameStart, i).toLowerCase();
    if (!name) return null;

    const attrs: Attr[] = [];
    let selfClosing = false;

    while (i < src.length) {
        while (i < src.length && isSpace(src[i])) i++;
        if (i >= src.length) return null;

        if (src[i] === '>') {
            i++;
            break;
        }
        if (src[i] === '/' && src[i + 1] === '>') {
            selfClosing = true;
            i += 2;
            break;
        }

        const attrStart = i;
        while (i < src.length && !isSpace(src[i]) && src[i] !== '=' && src[i] !== '>' && src[i] !== '/') i++;
        const attrName = src.slice(attrStart, i).toLowerCase();

        while (i < src.length && isSpace(src[i])) i++;
        if (src[i] !== '=') {
            if (attrName) attrs.push({ name: attrName, value: '', bare: true });
            continue;
        }

        i++; // '='
        while (i < src.length && isSpace(src[i])) i++;

        let value = '';
        const quote = src[i];
        if (quote === '"' || quote === "'") {
            i++;
            const valueStart = i;
            while (i < src.length && src[i] !== quote) i++;
            if (i >= src.length) return null; // unterminated quote
            value = src.slice(valueStart, i);
            i++;
        } else {
            const valueStart = i;
            while (i < src.length && !isSpace(src[i]) && src[i] !== '>') i++;
            value = src.slice(valueStart, i);
            // `<rect height=4/>` — the slash closes the tag, it is not part of
            // the value. Hand it back so the self-closing check below sees it.
            if (value.endsWith('/') && src[i] === '>') {
                value = value.slice(0, -1);
                i--;
            }
        }

        if (attrName) attrs.push({ name: attrName, value, bare: false });
    }

    return { tag: { kind: selfClosing ? 'self' : kind, name, attrs }, end: i };
}

const escapeAttr = (v: string) =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Rewrite a local id so two icons on the same page can't fight over it.
 *
 * Ids in inline SVG are document-global. Two logos that both ship
 * `<linearGradient id="a">` would silently render as one, whichever mounted
 * last — the classic "why is my icon the wrong colour" bug, and impossible to
 * debug from the outside.
 */
const prefixId = (prefix: string, id: string) => (prefix ? `${prefix}-${id}` : id);

function rewriteUrlRefs(value: string, prefix: string): string {
    if (!prefix) return value;
    return value.replace(/url\(\s*(['"]?)#([^)'"\s]+)\1\s*\)/gi, (_m, q: string, id: string) =>
        `url(${q}#${prefixId(prefix, id)}${q})`
    );
}

/**
 * Sanitize an SVG for inlining.
 *
 * `idPrefix` should be unique per icon (its registry id works); every `id` and
 * every local `url(#…)` / `href="#…"` reference is rewritten through it.
 */
export function sanitizeIconSvg(
    raw: unknown,
    options: { idPrefix?: string; maxBytes?: number } = {}
): SvgCheck {
    const limit = options.maxBytes ?? MAX_ICON_BYTES;
    const prefix = (options.idPrefix ?? '').replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^-+|-+$/g, '');

    if (typeof raw !== 'string') return { ok: false, problem: { kind: 'empty' } };
    const src = raw.trim();
    if (!src) return { ok: false, problem: { kind: 'empty' } };
    if (src.length > limit) {
        return { ok: false, problem: { kind: 'too-large', bytes: src.length, limit } };
    }

    const out: string[] = [];
    /** Names of dropped elements whose subtree we're still skipping. */
    const skipStack: string[] = [];
    let sawSvgRoot = false;
    let depth = 0;
    let i = 0;

    while (i < src.length) {
        const lt = src.indexOf('<', i);
        if (lt < 0) {
            if (skipStack.length === 0 && sawSvgRoot) out.push(src.slice(i));
            break;
        }
        if (lt > i && skipStack.length === 0 && sawSvgRoot) out.push(src.slice(i, lt));

        // Comments, CDATA, doctype and processing instructions carry nothing an
        // icon needs, and `<!--` can hide a payload from a naive tag scan.
        if (src.startsWith('<!--', lt)) {
            const end = src.indexOf('-->', lt);
            i = end < 0 ? src.length : end + 3;
            continue;
        }
        if (src.startsWith('<![CDATA[', lt)) {
            const end = src.indexOf(']]>', lt);
            i = end < 0 ? src.length : end + 3;
            continue;
        }
        if (src.startsWith('<!', lt) || src.startsWith('<?', lt)) {
            const end = src.indexOf('>', lt);
            i = end < 0 ? src.length : end + 1;
            continue;
        }

        const read = readTag(src, lt);
        if (!read) return { ok: false, problem: { kind: 'unclosed-tag' } };
        const { tag } = read;
        i = read.end;

        // Strip a namespace prefix for the safety check, so `<svg:script>` is
        // caught by the same rule as `<script>`.
        const bare = tag.name.includes(':') ? tag.name.slice(tag.name.indexOf(':') + 1) : tag.name;

        if (FORBIDDEN.has(bare)) {
            return { ok: false, problem: { kind: 'forbidden-element', name: bare } };
        }

        const element = ALLOWED_ELEMENTS.get(bare);

        if (tag.kind === 'close') {
            if (skipStack.length > 0) {
                if (skipStack[skipStack.length - 1] === tag.name) skipStack.pop();
                continue;
            }
            if (!element) continue;
            depth--;
            out.push(`</${element}>`);
            continue;
        }

        if (skipStack.length > 0) {
            if (tag.kind === 'open') skipStack.push(tag.name);
            continue;
        }

        if (!element) {
            // Editor cruft (`<metadata>`, `<sodipodi:namedview>`, …). Dropping it
            // quietly is friendlier than refusing an otherwise fine logo.
            if (tag.kind === 'open') skipStack.push(tag.name);
            continue;
        }

        if (bare === 'svg') {
            if (depth > 0) continue; // a nested <svg> is not an icon's business
            sawSvgRoot = true;
        } else if (!sawSvgRoot) {
            // Content before the root element is not part of the icon.
            continue;
        }

        const parts: string[] = [];
        for (const attr of tag.attrs) {
            const name = attr.name;
            if (name.startsWith('on')) continue;
            if (DANGEROUS_VALUE.test(attr.value)) continue;

            if (name === 'href' || name === 'xlink:href') {
                // Local references only: an external href is a network beacon
                // that fires the moment the icon renders.
                if (!attr.value.startsWith('#')) continue;
                parts.push(`${name}="${escapeAttr('#' + prefixId(prefix, attr.value.slice(1)))}"`);
                continue;
            }
            if (name === 'style') {
                // `url()` in a style attribute is the same beacon by another route.
                if (/url\s*\(/i.test(attr.value)) continue;
                parts.push(`style="${escapeAttr(attr.value)}"`);
                continue;
            }
            const attrName = ALLOWED_ATTRS.get(name);
            if (!attrName) continue;

            if (name === 'id') {
                parts.push(`id="${escapeAttr(prefixId(prefix, attr.value))}"`);
                continue;
            }
            // The root's own width/height would override the size the caller
            // asked for — a 512px logo must not decide the layout.
            if (bare === 'svg' && (name === 'width' || name === 'height')) continue;

            const value = attr.bare ? '' : rewriteUrlRefs(attr.value, prefix);
            parts.push(attr.bare ? attrName : `${attrName}="${escapeAttr(value)}"`);
        }

        const attrText = parts.length ? ` ${parts.join(' ')}` : '';
        if (tag.kind === 'self') {
            out.push(`<${element}${attrText}/>`);
        } else {
            depth++;
            out.push(`<${element}${attrText}>`);
        }
    }

    if (!sawSvgRoot) return { ok: false, problem: { kind: 'not-svg' } };

    return { ok: true, svg: out.join('').trim() };
}

/** A human-readable reason, for the settings row and the load warning. */
export function describeSvgProblem(problem: SvgProblem): string {
    switch (problem.kind) {
        case 'empty':
            return 'The file is empty.';
        case 'too-large':
            return `The file is ${Math.round(problem.bytes / 1024)} KB; the limit is ${Math.round(
                problem.limit / 1024
            )} KB.`;
        case 'not-svg':
            return 'No <svg> element found.';
        case 'forbidden-element':
            return `Contains <${problem.name}>, which Zenith does not inline. Flatten it and try again.`;
        case 'unclosed-tag':
            return 'The markup has an unterminated tag.';
    }
}
