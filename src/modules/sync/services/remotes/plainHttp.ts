/**
 * Whether an address sends credentials and notes across the open internet
 * unencrypted.
 *
 * `http://` to a public host is that: the WebDAV password travels in every
 * request header, an S3 request can be replayed, and without encrypted sync
 * the notes themselves go as they are. `http://` to this machine or to the
 * home network is a different matter — a NAS on the LAN is a common and
 * reasonable setup — so those are let through without a warning.
 */
export function isPlainHttpToInternet(address: string): boolean {
    let url: URL;
    try {
        url = new URL(address.trim());
    } catch {
        return false;
    }
    if (url.protocol !== 'http:') return false;
    return !isLocalHost(url.hostname.replace(/^\[|\]$/g, '').toLowerCase());
}

function isLocalHost(host: string): boolean {
    if (host === 'localhost' || host.endsWith('.localhost')) return true;
    // mDNS and the names home routers hand out.
    if (host.endsWith('.local') || host.endsWith('.lan') || host.endsWith('.home.arpa')) return true;
    if (!host.includes('.') && !host.includes(':')) return true;

    const v4 = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(host);
    if (v4) {
        const [a, b] = [Number(v4[1]), Number(v4[2])];
        return (
            a === 127 ||
            a === 10 ||
            (a === 192 && b === 168) ||
            (a === 172 && b >= 16 && b <= 31) ||
            (a === 169 && b === 254) ||
            // Carrier-grade NAT, which is where Tailscale puts its addresses.
            (a === 100 && b >= 64 && b <= 127)
        );
    }
    // Loopback, unique local and link-local IPv6.
    return host === '::1' || /^f[cd][0-9a-f]{2}:/.test(host) || /^fe[89ab][0-9a-f]:/.test(host);
}
