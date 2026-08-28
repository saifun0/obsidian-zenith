import { App, Modal, Notice } from 'obsidian';
import { useZenithStore } from '../../store';
import type { ZenithSettings } from '../../store';
import { getVaultImages, resolveMediaSrc, mediaLabel } from './mediaService';
import { translateNow } from '../../core/i18n';

/**
 * MediaPickerModal — choose the banner image/GIF shown above the file explorer.
 *
 * Sources: a URL or vault path (quick add), a saved/pinned list, and every image
 * in the vault (searchable). Selection persists in settings (`mediaSelected`),
 * saved refs in `mediaSaved`.
 */
export class MediaPickerModal extends Modal {
    private query = '';
    private gridsEl!: HTMLElement;
    private currentValueEl!: HTMLElement;

    constructor(app: App) {
        super(app);
    }

    private get settings() {
        return useZenithStore.getState().settings;
    }

    private update(partial: Partial<ZenithSettings>) {
        useZenithStore.getState().updateSettings(partial);
    }

    onOpen(): void {
        const { contentEl, titleEl } = this;
        titleEl.setText('GIF / Image Picker');
        contentEl.addClass('zenith-media-picker');
        this.modalEl.addClass('zenith-media-picker-modal');

        // ── Currently selected ──
        const cur = contentEl.createDiv('zenith-media-picker__current');
        cur.createEl('div', { cls: 'zenith-media-picker__eyebrow', text: 'Currently selected' });
        this.currentValueEl = cur.createEl('div', { cls: 'zenith-media-picker__current-value' });
        this.renderCurrent();

        // ── Quick add ──
        const quick = contentEl.createDiv('zenith-media-picker__quick');
        quick.createEl('div', { cls: 'zenith-media-picker__section-label', text: 'Quick add' });
        quick.createEl('div', {
            cls: 'zenith-media-picker__hint',
            text: 'Image/GIF URL, or a path inside the vault.',
        });
        const quickRow = quick.createDiv('zenith-media-picker__quick-row');
        const quickInput = quickRow.createEl('input', {
            type: 'text',
            cls: 'zenith-media-picker__input',
            attr: { placeholder: 'https://… or path/to/image.png' },
        });
        const addBtn = quickRow.createEl('button', {
            cls: 'zenith-media-picker__add-btn',
            text: 'Add & select',
        });
        const submitQuick = () => {
            const ref = quickInput.value.trim();
            if (!ref) return;
            this.selectRef(ref, true);
        };
        addBtn.addEventListener('click', submitQuick);
        quickInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                submitQuick();
            }
        });

        // ── Search ──
        const searchInput = contentEl.createEl('input', {
            type: 'text',
            cls: 'zenith-media-picker__search',
            attr: { placeholder: 'Search by name or path…' },
        });
        searchInput.addEventListener('input', () => {
            this.query = searchInput.value.trim().toLowerCase();
            this.renderGrids();
        });

        // ── Grids ──
        this.gridsEl = contentEl.createDiv('zenith-media-picker__grids');
        this.renderGrids();
    }

    onClose(): void {
        this.contentEl.empty();
    }

    // ── Rendering ───────────────────────────────────────────────────────────

    private renderCurrent(): void {
        const sel = this.settings.mediaSelected;
        this.currentValueEl.setText(sel || 'Nothing selected');
        this.currentValueEl.toggleClass('is-empty', !sel);
    }

    private renderGrids(): void {
        this.gridsEl.empty();

        const saved = this.settings.mediaSaved;
        if (saved.length > 0) {
            this.renderSection(`Saved (${saved.length})`, saved, true);
        }

        const images = getVaultImages(this.app).filter((img) => {
            if (!this.query) return true;
            return (
                img.name.toLowerCase().includes(this.query) ||
                img.path.toLowerCase().includes(this.query)
            );
        });
        this.renderSection(`From vault (${images.length})`, images.map((i) => i.path), false);
    }

    private renderSection(label: string, refs: string[], saved: boolean): void {
        this.gridsEl.createEl('div', { cls: 'zenith-media-picker__section-label', text: label });
        const grid = this.gridsEl.createDiv('zenith-media-picker__grid');
        if (refs.length === 0) {
            grid.createEl('div', { cls: 'zenith-media-picker__empty', text: 'No images found.' });
            return;
        }
        for (const ref of refs) this.renderCard(grid, ref, saved);
    }

    private renderCard(grid: HTMLElement, ref: string, saved: boolean): void {
        const isSelected = ref === this.settings.mediaSelected;
        const card = grid.createDiv({
            cls: `zenith-media-card ${isSelected ? 'is-selected' : ''}`,
        });

        const thumb = card.createDiv('zenith-media-card__thumb');
        const src = resolveMediaSrc(this.app, ref);
        if (src) {
            const img = thumb.createEl('img', { cls: 'zenith-media-card__img' });
            img.loading = 'lazy';
            img.src = src;
            img.addEventListener('error', () => {
                thumb.addClass('is-broken');
                img.remove();
            });
        } else {
            thumb.addClass('is-broken');
        }

        card.createEl('div', { cls: 'zenith-media-card__name', text: mediaLabel(ref), attr: { title: ref } });
        card.createEl('div', { cls: 'zenith-media-card__path', text: ref, attr: { title: ref } });

        const actions = card.createDiv('zenith-media-card__actions');
        const selectBtn = actions.createEl('button', {
            cls: 'zenith-media-card__btn zenith-media-card__btn--select',
            text: isSelected ? 'Selected' : 'Select',
        });
        selectBtn.disabled = isSelected;
        selectBtn.addEventListener('click', () => this.selectRef(ref, false));

        if (saved) {
            const removeBtn = actions.createEl('button', {
                cls: 'zenith-media-card__btn zenith-media-card__btn--danger',
                text: 'Remove',
            });
            removeBtn.addEventListener('click', () => {
                this.update({ mediaSaved: this.settings.mediaSaved.filter((r) => r !== ref) });
                this.renderGrids();
            });
        } else {
            const isSaved = this.settings.mediaSaved.includes(ref);
            const saveBtn = actions.createEl('button', {
                cls: 'zenith-media-card__btn',
                text: isSaved ? 'Saved' : 'Save',
            });
            saveBtn.disabled = isSaved;
            saveBtn.addEventListener('click', () => {
                if (!this.settings.mediaSaved.includes(ref)) {
                    this.update({ mediaSaved: [...this.settings.mediaSaved, ref] });
                }
                this.renderGrids();
            });
        }
    }

    // ── Actions ─────────────────────────────────────────────────────────────

    /** Select a reference (optionally pinning it to the saved list first). */
    private selectRef(ref: string, pin: boolean): void {
        const partial: { mediaSelected: string; mediaSaved?: string[] } = { mediaSelected: ref };
        if (pin && !this.settings.mediaSaved.includes(ref)) {
            partial.mediaSaved = [...this.settings.mediaSaved, ref];
        }
        this.update(partial);
        new Notice(translateNow('notice.bannerUpdated'));
        this.close();
    }
}
