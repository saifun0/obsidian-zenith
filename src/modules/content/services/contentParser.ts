import { App, TFile } from 'obsidian';
import { VaultService } from '../../../services/vaultService';
import type { ContentItem } from '../../../store/contentSlice';
import { normalizeContentItem } from './contentFormat';

/**
 * ContentParser — parses content items from .md files with YAML frontmatter.
 *
 * Expected .md format:
 * ```
 * ---
 * title: "The Great Gatsby"
 * type: book
 * status: completed
 * rating: 8
 * cover: "covers/gatsby.jpg"
 * tags: [fiction, classic]
 * ---
 * Optional description or notes...
 * ```
 */
export class ContentParser {
    private vaultService: VaultService;

    constructor(app: App) {
        this.vaultService = new VaultService(app);
    }

    async parseContent(folderPath: string): Promise<ContentItem[]> {
        const files = this.vaultService.getMarkdownFiles(folderPath);
        const items: ContentItem[] = [];
        const BATCH = 32;
        for (let i = 0; i < files.length; i += BATCH) {
            const chunk = await Promise.all(
                files.slice(i, i + BATCH).map((file) => this.parseFile(file))
            );
            for (const item of chunk) {
                if (item) items.push(item);
            }
        }
        return items;
    }

    /**
     * Parse one file into a content item, or null if it isn't one.
     *
     * Split out from {@link parseContent} so a vault change can re-read just the
     * file that changed instead of the whole folder — see `DataService`.
     */
    async parseFile(file: TFile): Promise<ContentItem | null> {
        const fm = await this.vaultService.getFrontmatter(file);

        // Skip files without proper frontmatter
        if (!fm.title && !fm.type) return null;

        const content = await this.vaultService.readFileContent(file);
        const body = this.vaultService.getBodyContent(content);

        return normalizeContentItem(fm, file.basename, file.path, body, file.stat);
    }
}
