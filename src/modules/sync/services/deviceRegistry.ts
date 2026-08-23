import { Platform } from 'obsidian';
import type ZenithPlugin from '../../../main';
import { isSafeDeviceId, type DevicePlatform, type DeviceRecord } from '../syncTypes';

/**
 * This device's identity.
 *
 * The id must be unique per device and must NEVER travel — two devices sharing
 * an id would each read the other's outbox as their own and quietly stop
 * syncing. That rules out a file in the plugin folder, since the whole point of
 * that folder is that it syncs. Obsidian's local storage is scoped to the vault
 * on this machine and is never part of the vault's contents, which is exactly
 * the property needed.
 */

const ID_KEY = 'zenith:sync:deviceId';
const NAME_KEY = 'zenith:sync:deviceName';

function detectPlatform(): DevicePlatform {
    if (Platform.isIosApp) return 'ios';
    if (Platform.isAndroidApp) return 'android';
    if (Platform.isMobileApp) return 'mobile';
    if (Platform.isDesktopApp) return 'desktop';
    return 'unknown';
}

/**
 * A readable default name, so the device list means something before the user
 * renames anything. Two phones will collide on this — which is why the name is
 * editable and the id, not the name, is what identifies a device.
 */
function defaultName(platform: DevicePlatform): string {
    switch (platform) {
        case 'ios':
            return 'iPhone / iPad';
        case 'android':
            return 'Android';
        case 'mobile':
            return 'Mobile';
        case 'desktop':
            return 'Desktop';
        default:
            return 'Unknown device';
    }
}

/**
 * A random id, using the platform's CSPRNG where there is one.
 *
 * Uniqueness is all that matters here — this is not a secret — but
 * `Math.random()` alone is seeded predictably enough on some mobile webviews
 * that two devices set up in the same minute could collide, and a collision
 * here is silent and permanent.
 */
function generateId(): string {
    const bytes = new Uint8Array(8);
    const c = globalThis.crypto;
    if (c && typeof c.getRandomValues === 'function') {
        c.getRandomValues(bytes);
    } else {
        for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `d${hex}`;
}

export class DeviceRegistry {
    private cachedId: string | null = null;

    constructor(private readonly plugin: ZenithPlugin) {}

    /**
     * This device's id, generated and stored on first call.
     *
     * A stored value that fails validation is replaced rather than trusted: it
     * becomes a filename, and local storage is editable from the developer
     * console like anything else in the renderer.
     */
    get id(): string {
        if (this.cachedId) return this.cachedId;

        const stored = this.plugin.app.loadLocalStorage(ID_KEY);
        if (isSafeDeviceId(stored)) {
            this.cachedId = stored;
            return stored;
        }

        const fresh = generateId();
        this.plugin.app.saveLocalStorage(ID_KEY, fresh);
        this.cachedId = fresh;
        return fresh;
    }

    get name(): string {
        const stored = this.plugin.app.loadLocalStorage(NAME_KEY);
        if (typeof stored === 'string' && stored.trim()) return stored.trim();
        return defaultName(detectPlatform());
    }

    /** Rename this device. Empty restores the platform default. */
    setName(name: string): void {
        const trimmed = name.trim();
        this.plugin.app.saveLocalStorage(NAME_KEY, trimmed || null);
    }

    /** This device's record, as published in its outbox. */
    record(now: number): DeviceRecord {
        return {
            id: this.id,
            name: this.name,
            platform: detectPlatform(),
            pluginVersion: this.plugin.manifest.version,
            lastSeenAt: now,
        };
    }
}
