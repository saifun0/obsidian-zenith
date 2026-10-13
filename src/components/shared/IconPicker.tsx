import React, { useMemo, useState, type FC } from 'react';
import { getIconIds } from 'obsidian';
import { Modal } from './Modal';
import { DynamicIcon } from './DynamicIcon';
import { SearchField } from '../ui/fields';
import { useTranslation } from '../../core/i18n';
import { iconRegistry } from '../../core/icons';
import { iconLabel, iconPickerView } from '../../core/iconPickerView';

/** A row of icons to choose from. The one in use is marked. */
const Grid: FC<{ ids: readonly string[]; current?: string; onChoose: (id: string) => void }> = ({
    ids,
    current,
    onChoose,
}) => (
    <div className="zenith-icons__grid">
        {ids.map((id) => (
            <button
                key={id}
                type="button"
                className={`zenith-icons__item${id === current ? ' is-current' : ''}`}
                title={iconLabel(id)}
                aria-label={iconLabel(id)}
                aria-pressed={id === current}
                onClick={() => onChoose(id)}
            >
                <DynamicIcon name={id} size={20} />
            </button>
        ))}
    </div>
);

/**
 * Choosing an icon: every one Zenith can draw — those installed from packs and
 * modules first, then Obsidian's own set — in a grid, with a line to find one
 * by name.
 */
export const IconPicker: FC<{
    current?: string;
    onChoose: (iconId: string) => void;
    onClose: () => void;
}> = ({ current, onChoose, onClose }) => {
    const t = useTranslation();
    const [query, setQuery] = useState('');
    // De-duplicated and sorted once, for a grid that does not reshuffle.
    const builtInIds = useMemo(() => Array.from(new Set(getIconIds())).sort(), []);
    const sources = useMemo(() => iconRegistry.listSources(), []);
    const view = useMemo(() => iconPickerView(query, sources, builtInIds), [query, sources, builtInIds]);

    const choose = (id: string) => {
        onChoose(id);
        onClose();
    };
    const nothing = view.custom.length === 0 && view.builtIn.length === 0;

    return (
        <Modal title={t('icons.picker.title')} onClose={onClose} size="md" className="zenith-icon-dialog">
            <div className="zenith-icons">
                <SearchField
                    value={query}
                    onChange={setQuery}
                    placeholder={t('icons.picker.search')}
                    onKeyDown={(e) => {
                        // Enter takes the one icon a search has come down to.
                        const found = [...view.custom.flatMap((g) => g.ids), ...view.builtIn];
                        if (e.key === 'Enter' && query.trim() && found.length === 1) {
                            e.preventDefault();
                            choose(found[0]);
                        }
                    }}
                />

                {view.custom.map((group) => (
                    <section key={group.label}>
                        <h3 className="zenith-icons__heading">
                            {group.label}
                            {group.author && <span>{group.author}</span>}
                        </h3>
                        <Grid ids={group.ids} current={current} onChoose={choose} />
                    </section>
                ))}

                {view.builtIn.length > 0 && (
                    <section>
                        {/* Named only when there is something to tell it from. */}
                        {view.custom.length > 0 && (
                            <h3 className="zenith-icons__heading">{t('icons.picker.builtIn')}</h3>
                        )}
                        <Grid ids={view.builtIn} current={current} onChoose={choose} />
                        {view.more > 0 && (
                            <p className="zenith-icons__note">
                                {t('icons.picker.more', { count: view.more })}
                            </p>
                        )}
                    </section>
                )}

                {nothing && (
                    <p className="zenith-icons__note">
                        {t('icons.picker.empty', { query: query.trim() })}
                    </p>
                )}
            </div>
        </Modal>
    );
};
