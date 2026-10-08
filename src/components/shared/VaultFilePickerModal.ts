import { FuzzySuggestModal, type App, type TFile } from 'obsidian';

/**
 * Pick a file out of the vault — a note, or anything at all.
 *
 * The back of a card has room for a path field and no room for a list, and a
 * path typed by hand fails silently: the card simply stays empty. So the field
 * comes with a button, and the button opens this.
 *
 * Its sibling for pictures (`ImagePickerModal`) draws thumbnails; this one has
 * nothing to draw, so it is the plain fuzzy list.
 *
 * Exported for the debug page's modal catalogue, which has to hold an unopened
 * instance; everything else goes through {@link pickVaultFile}.
 */
export class VaultFilePickerModal extends FuzzySuggestModal<TFile> {
    constructor(
        app: App,
        placeholder: string,
        private readonly notesOnly: boolean,
        private readonly onPick: (path: string) => void
    ) {
        super(app);
        this.setPlaceholder(placeholder);
        this.limit = 50;
    }

    getItems(): TFile[] {
        const files = this.notesOnly
            ? this.app.vault.getMarkdownFiles()
            : this.app.vault.getFiles();
        // Newest first with nothing typed: the note someone is after is
        // usually one they just worked on.
        return files.slice().sort((a, b) => b.stat.mtime - a.stat.mtime);
    }

    getItemText(file: TFile): string {
        return file.path;
    }

    onChooseItem(file: TFile): void {
        this.onPick(file.path);
    }
}

/** Open the vault's file list and hand back the path that was chosen. */
export function pickVaultFile(
    app: App,
    placeholder: string,
    onPick: (path: string) => void,
    options: { notesOnly?: boolean } = {}
): void {
    new VaultFilePickerModal(app, placeholder, options.notesOnly === true, onPick).open();
}
