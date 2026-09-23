import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, ExternalLink, LogOut } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useTranslation } from '../../../core/i18n';
import { useZenithStore } from '../../../store';
import {
    dropboxClientId,
    DROPBOX_REDIRECT_URI,
    onedriveClientId,
} from '../services/remotes/appIds';
import { randomState } from '../services/remotes/oauthPending';
import { challengeFor, generateVerifier, type DeviceCodeStart } from '../services/remotes/oauth';
import { DropboxRemote } from '../services/remotes/dropboxRemote';
import { OneDriveRemote } from '../services/remotes/onedriveRemote';

/**
 * Connecting a device to Dropbox or OneDrive.
 *
 * Two visibly different flows, because the providers offer different ways in.
 *
 * Dropbox accepts an `obsidian://` redirect, so the browser hands the
 * authorization straight back and there is nothing to copy — on a phone as much
 * as on a desktop, which is what makes it worth preferring. Microsoft does not
 * take one here, so it uses the device grant: a short code typed on any device
 * while the plugin waits.
 *
 * The Dropbox flow keeps its old shape as a fallback. A URL scheme depends on
 * something outside the app agreeing to hand the link over, and when that does
 * not happen there is nothing to debug from inside Obsidian — so the panel
 * offers the copy-the-code path rather than leaving the user at a dead end.
 */

type Provider = 'dropbox' | 'onedrive';

interface Props {
    provider: Provider;
}

export const RemoteAuthPanel: React.FC<Props> = ({ provider }) => {
    const t = useTranslation();
    const settings = useZenithStore((s) => s.settings);
    const updateSettings = useZenithStore((s) => s.updateSettings);

    // The user's own registration when they gave one, Zenith's otherwise. Empty
    // only when this build ships none and none was entered — which is the one
    // case the panel has nothing to offer but an explanation.
    const clientId =
        provider === 'dropbox'
            ? dropboxClientId(settings.syncDropboxClientId)
            : onedriveClientId(settings.syncOnedriveClientId);
    const tokens =
        provider === 'dropbox' ? settings.syncDropboxTokens : settings.syncOnedriveTokens;
    const tokenKey = provider === 'dropbox' ? 'syncDropboxTokens' : 'syncOnedriveTokens';

    const { plugin } = useApp();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    /** Which Dropbox flow is in the air, if either. */
    const [awaiting, setAwaiting] = useState<'redirect' | 'paste' | null>(null);
    // Only the copy-the-code path keeps the verifier here. The redirect path
    // cannot: it finishes in the protocol handler, long after this component
    // may have been unmounted, so the plugin holds that one.
    const verifier = useRef<string | null>(null);
    const [codeDraft, setCodeDraft] = useState('');

    // OneDrive: what the user is being asked to type, and where.
    const [device, setDevice] = useState<DeviceCodeStart | null>(null);
    const cancelled = useRef(false);

    useEffect(
        () => () => {
            // The device poll outlives a render; stop it when the view closes so
            // it is not still hitting Microsoft after the user navigated away.
            cancelled.current = true;
        },
        []
    );

    const disconnect = useCallback(() => {
        updateSettings({ [tokenKey]: null });
        plugin.oauthPending.cancel();
        setDevice(null);
        setAwaiting(null);
        setError(null);
    }, [plugin, tokenKey, updateSettings]);

    // ── Dropbox ──────────────────────────────────────

    /**
     * `viaRedirect` picks the flow. The two differ in one place only — whether
     * a redirect URI is sent — but that one place decides everything after it:
     * with a redirect Dropbox returns the code to the app and there is nothing
     * on screen to copy; without one it shows the code and returns nowhere.
     */
    const startDropbox = async (viaRedirect: boolean) => {
        setError(null);
        setBusy(true);
        try {
            const secret = generateVerifier();
            const challenge = await challengeFor(secret);

            if (!viaRedirect) {
                verifier.current = secret;
                window.open(DropboxRemote.authorizeUrl(clientId, challenge), '_blank');
                setAwaiting('paste');
                return;
            }

            const state = randomState();
            // Registered before the browser opens, not after: on a phone the
            // switch away can be immediate, and a callback that arrives before
            // we are ready to answer it is a callback we reject.
            plugin.oauthPending.begin({
                provider: 'dropbox',
                verifier: secret,
                state,
                clientId,
                redirectUri: DROPBOX_REDIRECT_URI,
            });
            window.open(
                DropboxRemote.authorizeUrl(clientId, challenge, {
                    redirectUri: DROPBOX_REDIRECT_URI,
                    state,
                }),
                '_blank'
            );
            setAwaiting('redirect');
        } catch (err) {
            setError(describe(err));
        } finally {
            setBusy(false);
        }
    };

    const finishDropbox = async () => {
        if (!verifier.current) return;
        setError(null);
        setBusy(true);
        try {
            const result = await DropboxRemote.completeAuthorization({
                clientId,
                code: codeDraft,
                verifier: verifier.current,
            });
            if (!result.ok) {
                setError(result.error.message);
                return;
            }
            updateSettings({ syncDropboxTokens: result.tokens });
            setAwaiting(null);
            setCodeDraft('');
            verifier.current = null;
        } catch (err) {
            setError(describe(err));
        } finally {
            setBusy(false);
        }
    };

    // ── OneDrive ─────────────────────────────────────

    const startOneDrive = async () => {
        setError(null);
        setBusy(true);
        cancelled.current = false;

        try {
            const start = await OneDriveRemote.startDeviceAuth(clientId);
            if ('error' in start) {
                setError(start.error);
                return;
            }
            setDevice(start);
            window.open(start.verificationUri, '_blank');
            await pollUntilGranted(start);
        } catch (err) {
            setError(describe(err));
        } finally {
            setBusy(false);
        }
    };

    /**
     * Wait for the user to approve the code.
     *
     * `slow_down` widens the interval rather than aborting: the provider is
     * asking us to be patient, not telling us the authorization failed. Treating
     * it as an error would cancel something the user is part-way through.
     */
    const pollUntilGranted = async (start: DeviceCodeStart) => {
        let interval = start.intervalMs;

        while (!cancelled.current && Date.now() < start.expiresAt) {
            await sleep(interval);
            if (cancelled.current) return;

            const outcome = await OneDriveRemote.pollDeviceAuth(clientId, start.deviceCode);
            if (outcome.kind === 'pending') continue;
            if (outcome.kind === 'slow_down') {
                interval = outcome.intervalMs;
                continue;
            }
            if (outcome.kind === 'failed') {
                setError(outcome.error.message);
                setDevice(null);
                return;
            }

            updateSettings({ syncOnedriveTokens: outcome.tokens });
            setDevice(null);
            return;
        }

        if (!cancelled.current) {
            setError(t('auth.expired'));
            setDevice(null);
        }
    };

    // ── Render ───────────────────────────────────────

    if (!clientId) {
        return <p className="zenith-sync__hint">{t('auth.needClientId')}</p>;
    }

    if (tokens?.accessToken) {
        return (
            <div className="zenith-sync__auth">
                <p className="zenith-sync__hint">
                    <Check size={14} /> {t('auth.connected')}
                </p>
                <button
                    type="button"
                    className="zenith-sync__btn is-dangerGhost"
                    onClick={disconnect}
                >
                    <LogOut size={13} />
                    {t('auth.disconnect')}
                </button>
            </div>
        );
    }

    return (
        <div className="zenith-sync__auth">
            {error && (
                <p className="zenith-sync__error">
                    <AlertTriangle size={14} />
                    <span>{error}</span>
                </p>
            )}

            {provider === 'onedrive' && device && (
                <div className="zenith-sync__deviceCode">
                    <p className="zenith-sync__hint">{t('auth.device.instructions')}</p>
                    <code className="zenith-sync__userCode">{device.userCode}</code>
                    <button
                        type="button"
                        className="zenith-sync__inboxPath"
                        onClick={() => window.open(device.verificationUri, '_blank')}
                    >
                        {device.verificationUri}
                    </button>
                    <p className="zenith-sync__hint">{t('auth.device.waiting')}</p>
                </div>
            )}

            {provider === 'dropbox' && awaiting === 'redirect' && (
                <div className="zenith-sync__deviceCode">
                    <p className="zenith-sync__hint">{t('auth.redirect.waiting')}</p>
                    <div className="zenith-sync__actions">
                        <button
                            type="button"
                            className="zenith-sync__btn"
                            onClick={() => {
                                plugin.oauthPending.cancel();
                                setAwaiting(null);
                            }}
                        >
                            {t('auth.cancel')}
                        </button>
                        {/* The dead end this avoids: a URL scheme depends on
                            something outside Obsidian agreeing to hand the link
                            over, and when it does not there is nothing here to
                            see. Starting again without a redirect puts the code
                            back on screen where it can be copied. */}
                        <button
                            type="button"
                            className="zenith-sync__btn"
                            onClick={() => void startDropbox(false)}
                            disabled={busy}
                        >
                            {t('auth.redirect.stuck')}
                        </button>
                    </div>
                </div>
            )}

            {provider === 'dropbox' && awaiting === 'paste' && (
                <div className="zenith-sync__row">
                    <label className="zenith-sync__label" htmlFor="zenith-auth-code">
                        {t('auth.paste')}
                    </label>
                    <input
                        id="zenith-auth-code"
                        type="text"
                        className="zenith-input zenith-sync__input"
                        value={codeDraft}
                        onChange={(e) => setCodeDraft(e.target.value)}
                        placeholder={t('auth.paste.placeholder')}
                    />
                    <button
                        type="button"
                        className="zenith-sync__btn is-primary"
                        onClick={() => void finishDropbox()}
                        disabled={busy || !codeDraft.trim()}
                    >
                        {t('auth.finish')}
                    </button>
                </div>
            )}

            {!device && !awaiting && (
                <button
                    type="button"
                    className="zenith-sync__btn is-primary"
                    onClick={() =>
                        void (provider === 'dropbox' ? startDropbox(true) : startOneDrive())
                    }
                    disabled={busy}
                >
                    <ExternalLink size={13} />
                    {t('auth.connect')}
                </button>
            )}
        </div>
    );
};

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function describe(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}
