import { describe, it, expect } from 'vitest';
import { hrefToKey } from '../src/modules/sync/services/remotes/webdavRemote';

/**
 * `hrefToKey` is the part of the WebDAV client where a mistake is dangerous
 * rather than merely annoying: resolve an href to the wrong key and the engine
 * acts on a file the user never pointed it at.
 *
 * The XML traversal in `parsePropfind` is not covered here — it needs a DOM, and
 * adding jsdom to this project for one parser is not worth the dependency. It is
 * on the manual checklist against a real server instead.
 */

describe('hrefToKey', () => {
    it('handles an absolute URL', () => {
        expect(hrefToKey('https://host/dav/files/me/vault/a.md', 'dav/files/me', 'vault')).toBe(
            'a.md'
        );
    });

    it('handles a bare absolute path, which is what most servers return', () => {
        expect(hrefToKey('/dav/files/me/vault/a.md', 'dav/files/me', 'vault')).toBe('a.md');
    });

    it('decodes percent-encoding', () => {
        expect(hrefToKey('/dav/vault/my%20note.md', 'dav', 'vault')).toBe('my note.md');
        expect(hrefToKey('/dav/vault/%D0%B7%D0%B0%D0%BC%D0%B5%D1%82%D0%BA%D0%B0.md', 'dav', 'vault')).toBe(
            'заметка.md'
        );
    });

    it('survives malformed percent-encoding rather than throwing', () => {
        // Comes off the wire from an arbitrary server; a decode error must not
        // take down the whole listing.
        expect(() => hrefToKey('/dav/vault/bad%zz.md', 'dav', 'vault')).not.toThrow();
    });

    it('keeps nested paths intact', () => {
        expect(hrefToKey('/dav/vault/10 Tasks/inbox.md', 'dav', 'vault')).toBe('10 Tasks/inbox.md');
    });

    it('ignores a trailing slash on a folder', () => {
        expect(hrefToKey('/dav/vault/10 Tasks/', 'dav', 'vault')).toBe('10 Tasks');
    });

    it('maps the root folder itself to an empty key', () => {
        // The folder describes itself in its own Depth:1 listing, and skipping
        // that self-entry is what stops the walk looping.
        expect(hrefToKey('/dav/vault/', 'dav', 'vault')).toBe('');
        expect(hrefToKey('/dav/vault', 'dav', 'vault')).toBe('');
    });

    it('rejects anything outside the configured root', () => {
        // The engine must never act on files the user did not point it at.
        expect(hrefToKey('/dav/other-vault/a.md', 'dav', 'vault')).toBeNull();
        expect(hrefToKey('/somewhere-else/a.md', 'dav', 'vault')).toBeNull();
    });

    it('is not fooled by a sibling folder whose name starts the same way', () => {
        // `vault-backup` starts with `vault`, and a plain prefix test would
        // happily claim its contents.
        expect(hrefToKey('/dav/vault-backup/a.md', 'dav', 'vault')).toBeNull();
    });

    it('works when the server is mounted at the domain root', () => {
        expect(hrefToKey('/vault/a.md', '', 'vault')).toBe('a.md');
    });

    it('returns the whole path when there is no prefix at all', () => {
        expect(hrefToKey('/a.md', '', '')).toBe('a.md');
    });
});
