import { describe, it, expect } from 'vitest';
import { parseGithubRef, readEmbeddedManifest } from '../src/core/moduleSources';
import { fnv1a } from '../src/core/hash';

describe('parseGithubRef', () => {
    it('parses owner/repo', () => {
        expect(parseGithubRef('saifun/zenith-mod')).toEqual({
            owner: 'saifun',
            repo: 'zenith-mod',
            ref: undefined,
            subdir: undefined,
        });
    });

    it('parses an explicit tag or branch', () => {
        expect(parseGithubRef('saifun/mod@v1.2.0')).toMatchObject({ ref: 'v1.2.0' });
        expect(parseGithubRef('saifun/mod@develop')).toMatchObject({ ref: 'develop' });
    });

    it('parses a subdirectory', () => {
        expect(parseGithubRef('saifun/mono@main:packages/widget')).toMatchObject({
            owner: 'saifun',
            repo: 'mono',
            ref: 'main',
            subdir: 'packages/widget',
        });
    });

    it('accepts a pasted GitHub URL, since that is what people copy', () => {
        expect(parseGithubRef('https://github.com/saifun/zenith-mod')).toMatchObject({
            owner: 'saifun',
            repo: 'zenith-mod',
        });
        expect(parseGithubRef('https://github.com/saifun/zenith-mod.git')).toMatchObject({
            repo: 'zenith-mod',
        });
    });

    it('rejects anything that is not a repo reference', () => {
        for (const bad of ['', 'saifun', 'saifun/', '/repo', 'a/b/c', 'has space/repo']) {
            expect(parseGithubRef(bad), bad).toBeNull();
        }
    });
});

describe('readEmbeddedManifest', () => {
    it('reads a leading zenith-module header', () => {
        const code = `/* zenith-module
{ "id": "my-module", "name": "My Module", "version": "1.0.0" }
*/
module.exports = class {};`;
        expect(readEmbeddedManifest(code)).toEqual({
            id: 'my-module',
            name: 'My Module',
            version: '1.0.0',
        });
    });

    it('tolerates leading whitespace', () => {
        expect(readEmbeddedManifest('\n\n  /* zenith-module\n{"id":"a","name":"A"}\n*/')).toEqual({
            id: 'a',
            name: 'A',
        });
    });

    it('is null when there is no header', () => {
        expect(readEmbeddedManifest('module.exports = class {};')).toBeNull();
        // A plain comment is not a manifest.
        expect(readEmbeddedManifest('/* just a comment */\nmodule.exports = {};')).toBeNull();
    });

    it('is null rather than throwing on malformed JSON', () => {
        expect(readEmbeddedManifest('/* zenith-module\n{ not json }\n*/')).toBeNull();
    });

    it('only reads a header at the very top', () => {
        // Otherwise a comment buried in the file could claim to be the manifest.
        expect(
            readEmbeddedManifest('const x = 1;\n/* zenith-module\n{"id":"a","name":"A"}\n*/')
        ).toBeNull();
    });
});

describe('fnv1a', () => {
    it('is stable and differs for different input', () => {
        expect(fnv1a('hello')).toBe(fnv1a('hello'));
        expect(fnv1a('hello')).not.toBe(fnv1a('hello '));
    });

    it('always returns eight hex characters', () => {
        for (const input of ['', 'a', 'a much longer string with unicode ✨ in it']) {
            expect(fnv1a(input)).toMatch(/^[0-9a-f]{8}$/);
        }
    });

    it('notices a one-character edit, which is the point', () => {
        const original = 'module.exports = class { run() { return 1; } };';
        const edited = 'module.exports = class { run() { return 2; } };';
        expect(fnv1a(original)).not.toBe(fnv1a(edited));
    });
});
