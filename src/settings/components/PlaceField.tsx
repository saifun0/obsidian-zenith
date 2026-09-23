import React, { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Crosshair, MapPin, X } from 'lucide-react';
import { useZenithStore } from '../../store';
import { resolveLocale, useTranslation } from '../../core/i18n';
import {
    devicePosition,
    placeLabel,
    placeRegion,
    reverseGeocode,
    searchPlaces,
} from '../../services/geocode';
import type { GeoPlace, PlaceCandidate } from '../../services/geocode';
import { foldName } from '../../services/placeNames';
import type { ZenithSettings } from '../../store/settingsSlice';

/** Let the typing settle before spending a request on it. */
const DEBOUNCE_MS = 300;

type Status = 'idle' | 'searching' | 'locating' | 'empty' | 'failed' | 'denied';

/** Settings keys that hold a place, so the factory can't be pointed at a number. */
type PlaceKey = {
    [K in keyof ZenithSettings]: ZenithSettings[K] extends GeoPlace | null ? K : never;
}[keyof ZenithSettings];

export interface PlaceFieldConfig {
    /** Which setting this picker writes. */
    settingsKey: PlaceKey;
    labelKey: string;
    descKey: string;
    /**
     * Written alongside the place. The weather module clears its legacy
     * free-text city here, so choosing a place can't be undone by the one-time
     * migration that re-resolves it.
     */
    extraPatch?: Partial<ZenithSettings>;
    /**
     * This picker is a module's override of the plugin-wide location, so an
     * empty value means "the global one" rather than "work it out". Saying
     * which place that actually is matters: an override left empty is the
     * normal state, and a row reading "Automatic" under a city set two screens
     * away describes nothing.
     */
    inheritsGlobal?: boolean;
}

/**
 * A city picker bound to one setting.
 *
 * This replaces a free-text city box that fed a `count=1` geocode: whatever the
 * provider ranked first won, silently, with no way to tell one Stavropol from
 * another — and no way at all to type a name in Russian, since the lookup was
 * pinned to English. Here the candidates are shown and the user picks, and the
 * choice is stored as coordinates so it can never be re-resolved differently.
 *
 * A factory rather than a component because `CustomField.render` takes no
 * configuration of its own: the key has to be baked in at schema-definition
 * time, which is also where it can still be typechecked against `ZenithSettings`.
 */
export function createPlaceField(config: PlaceFieldConfig): React.FC {
    const PlaceField: React.FC = () => {
        const t = useTranslation();
        const place = useZenithStore((s) => s.settings[config.settingsKey]) as GeoPlace | null;
        const global = useZenithStore((s) => s.settings.location);
        const language = useZenithStore((s) => s.settings.language);
        const updateSettings = useZenithStore((s) => s.updateSettings);
        const lang = resolveLocale(language);

        /** The place this picker falls back to when it holds nothing itself. */
        const inherited = config.inheritsGlobal ? global : null;

        const [query, setQuery] = useState('');
        const [hits, setHits] = useState<PlaceCandidate[]>([]);
        /** The row the arrow keys are on; Enter takes it. */
        const [active, setActive] = useState(0);
        const [status, setStatus] = useState<Status>('idle');
        /** Guards against an earlier search resolving after a later one. */
        const generation = useRef(0);
        const listId = useId();

        useEffect(() => {
            const term = query.trim();
            // Bumped here too: a request already on the wire when the box was
            // cleared must not land and repopulate the list.
            const mine = ++generation.current;
            if (term.length < 2) {
                setHits([]);
                setStatus('idle');
                return;
            }
            setStatus('searching');
            const timer = window.setTimeout(() => {
                void searchPlaces(term, lang).then((results) => {
                    if (generation.current !== mine) return;
                    setHits(results ?? []);
                    setActive(0);
                    setStatus(results === null ? 'failed' : results.length ? 'idle' : 'empty');
                });
            }, DEBOUNCE_MS);
            return () => window.clearTimeout(timer);
        }, [query, lang]);

        /** Country codes as names — "Россия", not "RU" — in the interface's language. */
        const countries = useMemo(() => {
            try {
                return new Intl.DisplayNames([lang], { type: 'region' });
            } catch {
                return null;
            }
        }, [lang]);
        const countryName = (code: string | undefined): string | undefined => {
            if (!code) return undefined;
            try {
                return countries?.of(code) ?? code;
            } catch {
                return code;
            }
        };

        /**
         * "434 тыс." — enough to tell a city from the village that shares its
         * name. Compact's own rounding: two significant figures, so "5,4 тыс."
         * but never "433,9 тыс.".
         */
        const people = useMemo(() => new Intl.NumberFormat(lang, { notation: 'compact' }), [lang]);

        const clearKey = config.inheritsGlobal
            ? 'settings.place.useGlobal'
            : 'settings.place.clear';

        const choose = (next: GeoPlace | null) => {
            updateSettings({ [config.settingsKey]: next, ...config.extraPatch } as Partial<ZenithSettings>);
            setQuery('');
            setHits([]);
            setStatus('idle');
        };

        /**
         * Arrows to move, Enter to take, Escape to put the list away. Escape
         * is stopped here, or it would also close the settings dialog the
         * picker sits in — two things dismissed for one key.
         */
        const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
            if (!hits.length) return;
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const step = e.key === 'ArrowDown' ? 1 : -1;
                setActive((i) => (i + step + hits.length) % hits.length);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                choose((hits[active] ?? hits[0]).place);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                e.nativeEvent.stopImmediatePropagation();
                setQuery('');
            }
        };

        /** The typed part of a name in bold, when the name begins with it. */
        const highlight = (name: string) => {
            const typed = query.trim();
            if (!typed || !foldName(name).startsWith(foldName(typed))) return name;
            return (
                <>
                    <strong>{name.slice(0, typed.length)}</strong>
                    {name.slice(typed.length)}
                </>
            );
        };

        const detect = async () => {
            const mine = ++generation.current;
            setStatus('locating');
            const fix = await devicePosition();
            if (generation.current !== mine) return;
            if (!fix) {
                setStatus('denied');
                return;
            }
            const named = await reverseGeocode(fix.lat, fix.lon, lang);
            if (generation.current !== mine) return;
            choose({ lat: fix.lat, lon: fix.lon, name: t('settings.place.here'), ...named });
        };

        return (
            <div className="zenith-settings__item zenith-settings__item--stack">
                <div className="zenith-settings__item-info">
                    <span className="zenith-settings__item-name">{t(config.labelKey)}</span>
                    <span className="zenith-settings__item-desc">{t(config.descKey)}</span>
                </div>

                <div className="zenith-wplace__current">
                    <MapPin size={13} />
                    <span className="zenith-wplace__name">
                        {place
                            ? placeLabel(place)
                            : inherited
                              ? placeLabel(inherited)
                              : t('settings.place.auto')}
                    </span>
                    {!place && inherited && (
                        <span className="zenith-wplace__from">{t('settings.place.fromGlobal')}</span>
                    )}
                    {place && (
                        <button
                            className="zenith-settings__inline-btn"
                            onClick={() => choose(null)}
                            aria-label={t(clearKey)}
                            title={t(clearKey)}
                        >
                            <X size={13} />
                        </button>
                    )}
                </div>

                <div className="zenith-settings__item-control">
                    <input
                        type="text"
                        className="zenith-settings__input"
                        value={query}
                        placeholder={t('settings.place.search')}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={onKeyDown}
                        role="combobox"
                        aria-autocomplete="list"
                        aria-expanded={hits.length > 0}
                        aria-controls={listId}
                        aria-activedescendant={hits.length ? `${listId}-${active}` : undefined}
                    />
                    <button
                        className="zenith-settings__inline-btn"
                        onClick={() => void detect()}
                        disabled={status === 'locating'}
                    >
                        <Crosshair size={13} />
                        {t('settings.place.detect')}
                    </button>
                </div>

                {/* Three facts a row, because three is what it takes to tell
                    namesakes apart: the name, where it is (region and
                    country, spelled out), and how big it is — the city of
                    434 thousand and the village beside it no longer read the
                    same. */}
                {hits.length > 0 && (
                    <ul className="zenith-wplace__hits" id={listId} role="listbox">
                        {hits.map(({ place: hit, population }, i) => (
                            <li key={`${hit.lat},${hit.lon}`}>
                                <button
                                    id={`${listId}-${i}`}
                                    className={`zenith-wplace__hit ${i === active ? 'is-active' : ''}`}
                                    role="option"
                                    aria-selected={i === active}
                                    onMouseEnter={() => setActive(i)}
                                    onClick={() => choose(hit)}
                                >
                                    <span className="zenith-wplace__hit-name">
                                        {highlight(hit.name)}
                                    </span>
                                    <span className="zenith-wplace__hit-where">
                                        {[placeRegion(hit), countryName(hit.country)]
                                            .filter(Boolean)
                                            .join(', ')}
                                    </span>
                                    {population !== undefined && (
                                        <span className="zenith-wplace__hit-pop">
                                            {t('settings.place.people', {
                                                count: people.format(population),
                                            })}
                                        </span>
                                    )}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}

                {status === 'searching' && hits.length === 0 && (
                    <div className="zenith-settings__hint">{t('settings.place.searching')}</div>
                )}
                {status === 'empty' && (
                    <div className="zenith-settings__hint">{t('settings.place.none')}</div>
                )}
                {status === 'failed' && (
                    <div className="zenith-settings__hint zenith-settings__hint--warn">
                        {t('settings.place.failed')}
                    </div>
                )}
                {status === 'locating' && (
                    <div className="zenith-settings__hint">{t('settings.place.locating')}</div>
                )}
                {status === 'denied' && (
                    <div className="zenith-settings__hint zenith-settings__hint--warn">
                        {t('settings.place.denied')}
                    </div>
                )}
            </div>
        );
    };

    PlaceField.displayName = `PlaceField(${config.settingsKey})`;
    return PlaceField;
}
