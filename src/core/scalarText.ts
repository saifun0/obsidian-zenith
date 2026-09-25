/**
 * The text of a value read from somewhere untyped — frontmatter, `data.json`,
 * a form. Strings, numbers and booleans as they read; anything else (an object,
 * a list, nothing) as an empty string, never as "[object Object]".
 */
export function scalarText(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
        return String(value);
    }
    return '';
}
