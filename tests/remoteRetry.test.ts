import { describe, it, expect } from 'vitest';
import type { Http, HttpRequest, HttpResponse } from '../src/modules/sync/services/remotes/http';
import { WebdavRemote } from '../src/modules/sync/services/remotes/webdavRemote';
import { S3Remote } from '../src/modules/sync/services/remotes/s3Remote';
import { OneDriveRemote } from '../src/modules/sync/services/remotes/onedriveRemote';
import type { TokenStore } from '../src/modules/sync/services/remotes/oauthSession';

/**
 * Every backend rides out a throttled or briefly broken server.
 *
 * Only Dropbox used to: WebDAV, S3 and OneDrive sent each request once, so a
 * single 429 or 503 in the middle of a run was a failed file — and OneDrive
 * throttles a busy drive as a matter of course.
 */

/** Answers with each status in turn, then 200 for ever. */
function flaky(statuses: number[], headers: Record<string, string> = {}) {
    const sent: HttpRequest[] = [];
    const http: Http = async (req) => {
        sent.push(req);
        const status = statuses.shift() ?? 200;
        const res: HttpResponse = {
            status,
            headers: status === 200 ? {} : headers,
            text: '',
            arrayBuffer: new ArrayBuffer(0),
        };
        return res;
    };
    return { http, sent };
}

/** No real waiting; the backoff itself is covered in httpRetry.test.ts. */
const retry = { sleep: async () => {}, random: () => 1 };

const TOKENS: TokenStore = {
    read: () => ({ accessToken: 'tok', refreshToken: 'ref', expiresAt: Date.now() + 3_600_000 }),
    write: () => {},
    clear: () => {},
};

describe('retrying a throttled server', () => {
    it('WebDAV tries again after a 503', async () => {
        const fake = flaky([503, 503]);
        const remote = new WebdavRemote(
            { kind: 'webdav', url: 'https://dav.example', username: 'u', password: 'p', remoteDir: 'vault' },
            { http: fake.http, retry }
        );

        await remote.remove('a.md');

        expect(fake.sent).toHaveLength(3);
        expect(fake.sent.every((r) => r.method === 'DELETE')).toBe(true);
    });

    it('S3 tries again after a 429, resending the same signed request', async () => {
        const fake = flaky([429]);
        const remote = new S3Remote(
            {
                kind: 's3',
                endpoint: 'https://s3.example',
                region: 'eu-central-1',
                bucket: 'notes',
                accessKeyId: 'AKIA',
                secretAccessKey: 'secret',
                prefix: '',
                forcePathStyle: true,
            },
            { http: fake.http, retry }
        );

        await remote.remove('a.md');

        expect(fake.sent).toHaveLength(2);
        expect(fake.sent[1].headers).toEqual(fake.sent[0].headers);
    });

    it('OneDrive waits out a 429 with Retry-After', async () => {
        const waits: number[] = [];
        const fake = flaky([429], { 'retry-after': '2' });
        const remote = new OneDriveRemote(
            { kind: 'onedrive', clientId: 'app', folder: 'vault' },
            TOKENS,
            undefined,
            { http: fake.http, retry: { ...retry, sleep: async (ms) => void waits.push(ms) } }
        );

        await remote.remove('a.md');

        expect(fake.sent).toHaveLength(2);
        expect(waits).toEqual([2000]);
    });

    it('still reports a server that keeps failing', async () => {
        const fake = flaky([500, 500, 500, 500, 500, 500]);
        const remote = new WebdavRemote(
            { kind: 'webdav', url: 'https://dav.example', username: 'u', password: 'p', remoteDir: '' },
            { http: fake.http, retry }
        );

        await expect(remote.remove('a.md')).rejects.toThrow(/500/);
        expect(fake.sent).toHaveLength(5);
    });
});
