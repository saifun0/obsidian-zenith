import { Modal, type App } from 'obsidian';
import { translateNow as t } from './i18n';
import { describePermission, samePermissions } from './modulePermissions';

/**
 * Asking before running someone else's code.
 *
 * A plain Obsidian `Modal` rather than a React portal, because it has to be
 * openable from `ensureInstance` — which can run during plugin `onload`, when
 * there is no React tree mounted yet.
 *
 * The tone here is deliberate. Zenith cannot sandbox a module, so the only
 * honest thing to offer is a clear statement of what the user is agreeing to,
 * the complete origin, and the code itself if they want to look. Nothing on
 * this screen may suggest a protection that does not exist.
 */

export interface ConsentRequest {
    manifest: {
        id?: string;
        name: string;
        version: string;
        description: string;
        author?: string;
        notes?: string;
        permissions?: readonly string[];
    };
    /** Complete origin string — never abbreviated. */
    origin: string;
    code: string;
    reason: 'first-install' | 'source-changed' | 'code-changed' | 'permissions-changed';
    /** For `source-changed`: what it used to be. */
    previousOrigin?: string;
    /** What was agreed to last time, to say what changed. */
    previousPermissions?: readonly string[];
}

export class ThirdPartyConsentModal extends Modal {
    private decided = false;

    constructor(
        app: App,
        private readonly request: ConsentRequest,
        private readonly onDecision: (accepted: boolean) => void
    ) {
        super(app);
    }

    onOpen(): void {
        const { contentEl, request } = this;
        contentEl.empty();
        contentEl.addClass('zenith-consent');

        contentEl.createEl('h3', { text: t('consent.title', { name: request.manifest.name }) });

        // The statement, unhedged and first.
        contentEl.createEl('p', {
            cls: 'zenith-consent__warning',
            text: t('consent.warning'),
        });

        if (request.reason === 'code-changed') {
            contentEl.createEl('p', {
                cls: 'zenith-consent__warning',
                text: t('consent.codeChanged'),
            });
        }
        if (request.reason === 'source-changed' && request.previousOrigin) {
            contentEl.createEl('p', {
                cls: 'zenith-consent__warning',
                text: t('consent.sourceChanged', {
                    from: request.previousOrigin,
                    to: request.origin,
                }),
            });
        }

        // What it will do with Zenith, in words. Said as an agreement, because
        // that is all it is: the module could reach further, and the dialog
        // must not suggest otherwise.
        const permissions = request.manifest.permissions ?? [];
        const changed =
            request.previousPermissions !== undefined &&
            !samePermissions(request.previousPermissions, permissions);
        if (request.reason === 'permissions-changed' || changed) {
            contentEl.createEl('p', {
                cls: 'zenith-consent__warning',
                text: t('consent.permissionsChanged'),
            });
        }
        const asks = contentEl.createDiv({ cls: 'zenith-consent__permissions' });
        asks.createEl('p', {
            cls: 'zenith-consent__claimed',
            text: t(permissions.length ? 'consent.permissions' : 'consent.permissions.none'),
        });
        if (permissions.length) {
            const list = asks.createEl('ul');
            for (const permission of permissions) {
                const { key, params } = describePermission(permission);
                const isNew =
                    request.previousPermissions !== undefined &&
                    !request.previousPermissions.includes(permission);
                list.createEl('li', {
                    text: t(key, params) + (isNew ? ` — ${t('consent.permissions.new')}` : ''),
                });
            }
            asks.createEl('p', {
                cls: 'zenith-consent__note',
                text: t('consent.permissions.honest'),
            });
        }

        const facts = contentEl.createDiv({ cls: 'zenith-consent__facts' });
        const fact = (key: string, value: string) => {
            if (!value) return;
            const row = facts.createDiv({ cls: 'zenith-consent__fact' });
            row.createSpan({ cls: 'zenith-consent__fact-key', text: key });
            row.createSpan({ cls: 'zenith-consent__fact-val', text: value });
        };

        // Source is the one fact Zenith actually knows, so it goes first and in
        // full — "from GitHub" would tell the user nothing worth knowing.
        fact(t('consent.fact.source'), request.origin);
        fact(
            t('consent.fact.size'),
            t('consent.size', { kb: Math.max(1, Math.round(request.code.length / 1024)) })
        );

        facts.createEl('p', {
            cls: 'zenith-consent__claimed',
            text: t('consent.claimed'),
        });
        fact(t('consent.fact.author'), request.manifest.author ?? '—');
        fact(t('consent.fact.version'), request.manifest.version);
        fact(t('consent.fact.description'), request.manifest.description || '—');
        if (request.manifest.notes) fact(t('consent.fact.notes'), request.manifest.notes);

        // Offering the code is the difference between informed consent and a
        // dialog people click through.
        const details = contentEl.createEl('details', { cls: 'zenith-consent__code' });
        details.createEl('summary', { text: t('consent.viewCode') });
        details.createEl('pre').createEl('code', { text: request.code });

        const confirmRow = contentEl.createDiv({ cls: 'zenith-consent__confirm' });
        const checkbox = confirmRow.createEl('input', { type: 'checkbox' });
        checkbox.id = 'zenith-consent-understood';
        confirmRow.createEl('label', {
            text: t('consent.understood'),
            attr: { for: checkbox.id },
        });

        const buttons = contentEl.createDiv({ cls: 'zenith-consent__buttons' });
        const cancel = buttons.createEl('button', { text: t('consent.cancel') });
        const accept = buttons.createEl('button', {
            text: t('consent.accept'),
            cls: 'mod-warning',
        });
        accept.disabled = true;

        checkbox.addEventListener('change', () => {
            accept.disabled = !checkbox.checked;
        });
        cancel.addEventListener('click', () => this.decide(false));
        accept.addEventListener('click', () => this.decide(true));

        // Cancel takes focus: the safe answer should be the one a stray Enter
        // lands on.
        cancel.focus();
    }

    private decide(accepted: boolean): void {
        this.decided = true;
        this.onDecision(accepted);
        this.close();
    }

    onClose(): void {
        this.contentEl.empty();
        // Dismissing with Escape or the scrim is a "no", not a silent yes.
        if (!this.decided) this.onDecision(false);
    }
}

/** Promise wrapper, for the linear flow the installer wants. */
export function askConsent(app: App, request: ConsentRequest): Promise<boolean> {
    return new Promise((resolve) => {
        new ThirdPartyConsentModal(app, request, resolve).open();
    });
}
