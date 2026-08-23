import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, ExternalLink, LogOut } from 'lucide-react';
import { useTranslation } from '../../../core/i18n';
import { useZenithStore } from '../../../store';
import { challengeFor, generateVerifier, type DeviceCodeStart } from '../services/remotes/oauth';
import { DropboxRemote } from '../services/remotes/dropboxRemote';
import { OneDriveRemote } from '../services/remotes/onedriveRemote';

/**
 * Connecting a device to Dropbox or OneDrive.
 *
 * Two visibly different flows, because the providers offer different ways to
 * authorize something that cannot receive a redirect — see `oauth.ts`. Dropbox
 * shows a code to paste back; Microsoft has the user type a short code
 * elsewhere while the plugin waits. Both are shaped so they work on a phone,
 * which is the whole point of syncing.
 */

type Provider = 'dropbox' | 'onedrive';

interface Props {
    provider: Provider;
}

export const RemoteAuthPanel: React.FC<Props> = ({ provider }) => {
    const t = useTranslation();
    const settings = useZenithStore((s) => s.settings);
    const updateSettings = useZenithStore((s) => s.updateSettings);

    const clientId = (
        provider === 'dropbox' ? settings.syncDropboxClientId : settings.syncOnedriveClientId
    ).trim();
    const tokens = provider === 'dropbox' ? settings.syncDropboxTokens : settings.syncOnedriveTokens;
    const tokenKey = provider === 'dropbox' ? 'syncDropboxTokens' : 'syncOnedriveTokens';

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Dropbox: the verifier has to survive from opening the browser until the
    // user pastes the code back, which may be a minute later.
    const verifier = useRef<string | null>(null);
    const [codeDraft, setCodeDraft] = useState('');
    const [awaitingPaste, setAwaitingPaste] = useState(false);

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
        setDevice(null);
        setAwaitingPaste(false);
        setError(null);
    }, [tokenKey, updateSettings]);

    // ── Dropbox ──────────────────────────────────────

    const startDropbox = async () => {
        setError(null);
        setBusy(true);
        try {
            verifier.current = generateVerifier();
            const challenge = await challengeFor(verifier.current);
            window.open(DropboxRemote.authorizeUrl(clientId, challenge), '_blank');
            setAwaitingPaste(true);
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
            const result = await DropboxRemote.completeAuthorization(
                clientId,
                codeDraft,
                verifier.current
            );
            if (!result.ok) {
                setError(result.error.message);
                return;
            }
            updateSettings({ syncDropboxTokens: result.tokens });
            setAwaitingPaste(false);
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
                <button type="button" className="zenith-sync__btn" onClick={disconnect}>
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
                    <a
                        className="zenith-sync__inboxPath"
                        onClick={() => window.open(device.verificationUri, '_blank')}
                    >
                        {device.verificationUri}
                    </a>
                    <p className="zenith-sync__hint">{t('auth.device.waiting')}</p>
                </div>
            )}

            {provider === 'dropbox' && awaitingPaste && (
                <div className="zenith-sync__row">
                    <label className="zenith-sync__label" htmlFor="zenith-auth-code">
                        {t('auth.paste')}
                    </label>
                    <input
                        id="zenith-auth-code"
                        type="text"
                        className="zenith-sync__input"
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

            {!device && !awaitingPaste && (
                <button
                    type="button"
                    className="zenith-sync__btn is-primary"
                    onClick={() => void (provider === 'dropbox' ? startDropbox() : startOneDrive())}
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
