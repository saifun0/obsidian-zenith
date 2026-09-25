import { App, Modal, getIconIds } from 'obsidian';
import { iconRegistry } from './icons';
import { applyIcon } from './icons/applyIcon';
import type { RegisteredIcon } from './icons';

/**
 * IconPickerModal — searchable grid of every icon Zenith can render: the icons
 * installed from packs and modules first, then Obsidian's built-in (lucide) set.
 *
 * Custom icons lead because there are a handful of them against Obsidian's
 * many hundreds. Sorted the other way they would be unreachable without
 * knowing what to type, which for a logo you just installed is the one thing
 * you are least likely to know the name of.
 */
export class IconPickerModal extends Modal {
    private readonly builtInIds: string[];
    private query = '';
    private gridEl!: HTMLElement;

    constructor(
        app: App,
        private readonly current: string | undefined,
        private readonly onChoose: (iconId: string) => void
    ) {
        super(app);
        // De-duplicate and sort for a stable grid.
        this.builtInIds = Array.from(new Set(getIconIds())).sort();
    }

    onOpen(): void {
        const { contentEl, titleEl } = this;
        titleEl.setText('Pick an icon');
        contentEl.addClass('zenith-icon-picker');

        const search = contentEl.createEl('input', {
            type: 'text',
            cls: 'zenith-input zenith-icon-picker__search',
            attr: { placeholder: 'Search icons…' },
        });
        search.addEventListener('input', () => {
            this.query = search.value.trim().toLowerCase();
            this.renderGrid();
        });

        this.gridEl = contentEl.createDiv('zenith-icon-picker__grid-wrap');
        window.setTimeout(() => search.focus(), 0);
        this.renderGrid();
    }

    /** Matches on the icon's own name and on the pack that supplied it. */
    private matchesCustom(icon: RegisteredIcon): boolean {
        if (!this.query) return true;
        return (
            icon.name.toLowerCase().includes(this.query) ||
            icon.source.toLowerCase().includes(this.query)
        );
    }

    private renderSection(title: string, subtitle: string | undefined, ids: string[]): void {
        if (ids.length === 0) return;

        const header = this.gridEl.createDiv('zenith-icon-picker__section');
        header.createSpan({ cls: 'zenith-icon-picker__section-title', text: title });
        if (subtitle) {
            header.createSpan({ cls: 'zenith-icon-picker__section-sub', text: subtitle });
        }

        const grid = this.gridEl.createDiv('zenith-icon-picker__grid');
        for (const id of ids) {
            // The label is the part a person recognises: "logo", not "zi:acme/logo".
            const label = id.includes('/') ? id.slice(id.indexOf('/') + 1) : id;
            const btn = grid.createEl('button', {
                cls: 'zenith-icon-picker__item',
                attr: { 'aria-label': label, title: label, type: 'button' },
            });
            if (id === this.current) btn.addClass('is-current');
            applyIcon(btn.createSpan(), id);
            btn.addEventListener('click', () => {
                this.onChoose(id);
                this.close();
            });
        }
    }

    private renderGrid(): void {
        this.gridEl.empty();

        let shown = 0;

        for (const source of iconRegistry.listSources()) {
            const matches = source.icons.filter((i) => this.matchesCustom(i));
            if (matches.length === 0) continue;
            shown += matches.length;
            this.renderSection(
                source.label,
                source.author,
                matches.map((i) => i.id)
            );
        }

        const builtIn = (
            this.query
                ? this.builtInIds.filter((id) => id.toLowerCase().includes(this.query))
                : this.builtInIds
        )
            // Capped for performance, as before — but only after the custom
            // icons have had their say, so a pack can never be crowded out.
            .slice(0, 160);
        shown += builtIn.length;
        this.renderSection('Built-in', undefined, builtIn);

        if (shown === 0) {
            this.gridEl.createDiv({ cls: 'zenith-icon-picker__empty', text: 'No icons found.' });
        }
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
