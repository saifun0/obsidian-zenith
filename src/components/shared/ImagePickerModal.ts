import {
    SuggestModal,
    TFile,
    prepareFuzzySearch,
    renderResults,
    type App,
    type SearchResult,
} from 'obsidian';
import { IMAGE_EXTENSIONS } from '../../core/imageSource';

interface Hit {
    file: TFile;
    result: SearchResult | null;
}

/**
 * Pick a picture out of the vault.
 *
 * A path typed by hand is how the folder settings work, and it is fine there
 * because a wrong folder announces itself. A wrong image path does nothing at
 * all — the surface simply stays empty — so this offers the list instead, and
 * the list only ever contains files that really are pictures.
 *
 * Shared rather than owned by the settings page: the same choice is made from
 * the back of a picture card, where there is no settings form to be a row of.
 *
 * Exported for the debug page's modal catalogue, which has to hold an unopened
 * instance; everything else goes through {@link pickVaultImage}.
 */
export class ImagePickerModal extends SuggestModal<Hit> {
    constructor(
        app: App,
        placeholder: string,
        private readonly onPick: (path: string) => void
    ) {
        super(app);
        this.setPlaceholder(placeholder);
        this.limit = 50;
    }

    private images(): TFile[] {
        return this.app.vault
            .getFiles()
            .filter((f) => IMAGE_EXTENSIONS.includes(f.extension.toLowerCase()));
    }

    getSuggestions(query: string): Hit[] {
        const files = this.images();
        const trimmed = query.trim();
        if (!trimmed) {
            // Newest first with no query: the picture someone is looking for is
            // usually the one they just saved.
            return files
                .slice()
                .sort((a, b) => b.stat.mtime - a.stat.mtime)
                .map((file) => ({ file, result: null }));
        }
        const match = prepareFuzzySearch(trimmed);
        const hits: Array<Hit & { score: number }> = [];
        for (const file of files) {
            const result = match(file.path);
            if (result) hits.push({ file, result, score: result.score });
        }
        return hits.sort((a, b) => b.score - a.score).map(({ score: _score, ...hit }) => hit);
    }

    renderSuggestion(hit: Hit, el: HTMLElement): void {
        const row = el.createDiv({ cls: 'zenith-imgpick__row' });
        const thumb = row.createEl('img', { cls: 'zenith-imgpick__thumb' });
        thumb.src = this.app.vault.getResourcePath(hit.file);
        const text = row.createDiv({ cls: 'zenith-imgpick__text' });
        const name = text.createDiv({ cls: 'zenith-imgpick__name' });
        if (hit.result) renderResults(name, hit.file.path, hit.result);
        else name.setText(hit.file.path);
    }

    onChooseSuggestion(hit: Hit): void {
        this.onPick(hit.file.path);
    }
}

/** Open the vault's picture list and hand back the path that was chosen. */
export function pickVaultImage(
    app: App,
    placeholder: string,
    onPick: (path: string) => void
): void {
    new ImagePickerModal(app, placeholder, onPick).open();
}
