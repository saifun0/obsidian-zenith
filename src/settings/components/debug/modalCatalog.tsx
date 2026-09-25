import React, { useMemo } from 'react';
import type { App, Modal as ObsidianModal } from 'obsidian';
import type ZenithPlugin from '../../../main';
import { useZenithStore } from '../../../store';
import type { ContentItem } from '../../../store/contentSlice';
import type { SubTask } from '../../../store/taskSlice';
import { translateNow as t, useTranslation } from '../../../core/i18n';
import { effectiveContentTypes, resolveContentType } from '../../../core/contentTypes';
import { getTodayString, toLocalIsoDate } from '../../../core/dateUtils';
import { IMAGE_EXTENSIONS } from '../../../core/imageSource';
import { preferredPlace } from '../../../services/geocode';
import { IconPickerModal } from '../../../core/IconPickerModal';
import { PromptModal } from '../../../core/PromptModal';
import { VaultScaffoldModal } from '../../../core/VaultScaffoldModal';
import { ImagePickerModal } from '../../../components/shared/ImagePickerModal';
import { QuickAddTaskModal } from '../../../modules/tasks/QuickAddTaskModal';
import { TaskEditorModal } from '../../../modules/tasks/components/TaskEditorModal';
import { SubtaskEditorModal } from '../../../modules/tasks/components/SubtaskEditorModal';
import { ImageLightbox } from '../../../modules/tasks/components/ImageLightbox';
import type { TaskAttachment } from '../../../modules/tasks/services/taskDetails';
import { ContentDetailModal } from '../../../modules/content/components/ContentDetailModal';
import { ContentForm } from '../../../modules/content/components/ContentForm';
import { ContentImportModal } from '../../../modules/content/components/ContentImportModal';
import { ProjectFormModal } from '../../../modules/projects/ProjectFormModal';
import { PrayerModal } from '../../../modules/prayer/PrayerModal';
import { SyncQuickModal } from '../../../modules/sync/SyncQuickModal';
import { MediaPickerModal } from '../../../modules/media/MediaPickerModal';
import { WeatherExpanded } from '../../../modules/weather/components/WeatherExpanded';
import { getCachedWeather } from '../../../modules/weather/weatherService';
import type {
    DailyForecast,
    HourlyForecast,
    WeatherData,
} from '../../../modules/weather/weatherTypes';

/**
 * Every dialog Zenith can put on screen, and how to build each one cold.
 *
 * Most of them are only reachable from one place, and some of those places need
 * a module switched on, a note with subtasks in it or a cached forecast. So each entry says how to make its dialog
 * without any of that: from the real data when there is some — a dialog showing
 * your own library is the better test — and from a made-up specimen when there
 * is none, flagged as such so a strange title is not mistaken for a bug.
 *
 * The two kinds are built differently because they are opened differently: an
 * Obsidian `Modal` is an object you construct and `open()`, a React dialog is an
 * element you render. The gallery handles both; this file only knows how to
 * make them.
 */

export interface CatalogContext {
    app: App;
    plugin: ZenithPlugin;
    /**
     * Where a dialog's answer goes — the icon picked, the name typed, the
     * consent given. A notice for a dialog that was really opened; nowhere for
     * a specimen, which cannot be answered anyway.
     */
    report: (value: unknown) => void;
}

interface EntryBase {
    /** Stable id, and the tail of its description key: `debug.modals.desc.<id>`. */
    id: string;
    /** The class or component as the code spells it — so never translated. */
    name: string;
    /** `core`, or the id of the module that owns the dialog. */
    owner: string;
    /** Confirming it changes notes, files or settings. */
    writes?: boolean;
    /** True while there is nothing real to show, so it is showing a specimen. */
    sample?: (ctx: CatalogContext) => boolean;
}

export interface NativeModalEntry extends EntryBase {
    kind: 'obsidian';
    create: (ctx: CatalogContext) => ObsidianModal;
    /** For a dialog whose answer only comes back through its own opener. */
    open?: (ctx: CatalogContext) => void;
}

export interface ReactModalEntry extends EntryBase {
    kind: 'react';
    render: (ctx: CatalogContext, onClose: () => void) => React.ReactElement;
}

export type ModalEntry = NativeModalEntry | ReactModalEntry;

/** Where a specimen claims to live. Nothing is ever written there: every
 *  writer looks the file up first and does nothing when it is not found. */
const SAMPLE_PATH = 'Zenith debug sample.md';

// ── Specimens ────────────────────────────────────────

/** Asked the way the dashboard asks for a layout preset's name. */
function presetPrompt(app: App): PromptModal {
    return new PromptModal(app, {
        title: t('dashboard.presets.saveAs'),
        initial: t('dashboard.presets.defaultName'),
        placeholder: t('dashboard.presets.namePlaceholder'),
        confirmText: t('common.save'),
        cancelText: t('common.cancel'),
    });
}

/** A real library item — one with a cover if there is one, since the poster is
 *  most of that dialog — or a specimen book. */
function contentSubject(): { item: ContentItem; sample: boolean } {
    const items = useZenithStore.getState().contentItems;
    const real = items.find((i) => i.coverImage) ?? items[0];
    if (real) return { item: real, sample: false };
    return {
        sample: true,
        item: {
            id: 'zenith-debug-sample',
            title: 'The Left Hand of Darkness',
            status: 'in-progress',
            rating: 8,
            tags: ['sample'],
            type: 'book',
            filePath: SAMPLE_PATH,
            description:
                'A made-up entry for the debug page. Edits to it go nowhere: there is no note behind it.',
            year: 1969,
            creator: 'Ursula K. Le Guin',
            genres: ['Science fiction'],
            progressCurrent: 120,
            progressTotal: 304,
            started: getTodayString(),
        },
    };
}

/** The first subtask in the vault, or a specimen. */
function subtaskSubject(): { filePath: string; subtask: SubTask; sample: boolean } {
    for (const task of useZenithStore.getState().tasks) {
        const subtask = task.subtasks[0];
        if (subtask) return { filePath: task.filePath, subtask, sample: false };
    }
    return {
        sample: true,
        filePath: SAMPLE_PATH,
        subtask: {
            title: 'Sample subtask',
            status: 'todo',
            completed: false,
            lineNumber: 0,
            subtasks: [],
            dueTime: '09:00',
            timerMinutes: 25,
            description: 'Made up for the debug page.',
        },
    };
}

/** Drawn rather than loaded, so the lightbox has something even in an empty vault. */
const SAMPLE_PICTURE =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="600">' +
            '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
            '<stop offset="0" stop-color="#7c6cff"/><stop offset="1" stop-color="#22c55e"/>' +
            '</linearGradient></defs><rect width="960" height="600" fill="url(#g)"/></svg>'
    );

/** The newest picture in the vault, or a drawn one. */
function pictureSubject(app: App): { attachment: TaskAttachment; src: string; sample: boolean } {
    const newest = app.vault
        .getFiles()
        .filter((f) => IMAGE_EXTENSIONS.includes(f.extension.toLowerCase()))
        .sort((a, b) => b.stat.mtime - a.stat.mtime)[0];
    if (newest) {
        return {
            attachment: { kind: 'image', target: newest.path },
            src: app.vault.getResourcePath(newest),
            sample: false,
        };
    }
    return {
        attachment: { kind: 'image', target: 'sample.png', label: 'Sample picture' },
        src: SAMPLE_PICTURE,
        sample: true,
    };
}

function cachedWeather(): WeatherData | null {
    const { weatherPlace, location } = useZenithStore.getState().settings;
    return getCachedWeather(preferredPlace(weatherPlace, location));
}

/**
 * A plausible day of weather: a temperature that rises and falls with the
 * clock, a shower in the afternoon, a week of forecast. Every field is filled,
 * because every tab of the dialog reads a different handful of them.
 */
function sampleWeather(): WeatherData {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const dayAt = (offset: number) => {
        const d = new Date(now);
        d.setDate(d.getDate() + offset);
        return toLocalIsoDate(d);
    };
    const today = dayAt(0);

    const hourly: HourlyForecast[] = Array.from({ length: 24 }, (_, i) => {
        const at = new Date(now);
        at.setHours(now.getHours() + i, 0, 0, 0);
        const hour = at.getHours();
        const tempC = 14 + 6 * Math.sin(((hour - 9) / 24) * 2 * Math.PI);
        const shower = hour >= 15 && hour <= 17;
        return {
            time: `${toLocalIsoDate(at)}T${pad(hour)}:00`,
            tempC,
            feelsLikeC: tempC - 1.5,
            code: shower ? 61 : 2,
            isDay: hour >= 7 && hour < 19,
            precipProb: shower ? 65 : 10,
            precipMm: shower ? 0.8 : 0,
            humidity: shower ? 82 : 60,
            dewPointC: 7,
            cloudCover: shower ? 90 : 35,
            pressureHpa: 1016 - i * 0.2,
            visibilityM: shower ? 9000 : 20000,
            windKmh: 12,
            windGustKmh: 26,
            windDir: 220,
            uvIndex: hour >= 10 && hour <= 15 ? 4 : 0,
        };
    });

    const codes = [2, 3, 61, 1, 0, 45, 3];
    const daily: DailyForecast[] = codes.map((code, i) => ({
        date: dayAt(i),
        code,
        tempMaxC: 20 - i * 0.6,
        tempMinC: 9 + (i % 3),
        feelsMaxC: 19 - i * 0.6,
        feelsMinC: 8 + (i % 3),
        precipProb: code === 61 ? 70 : 10,
        precipMm: code === 61 ? 6 : 0,
        rainMm: code === 61 ? 6 : 0,
        snowCm: 0,
        precipHours: code === 61 ? 5 : 0,
        uvIndexMax: 5,
        windMaxKmh: 18,
        windGustMaxKmh: 34,
        windDir: 220,
        sunrise: `${dayAt(i)}T06:40`,
        sunset: `${dayAt(i)}T19:10`,
        daylightSec: 12.5 * 3600,
        sunshineSec: code === 61 ? 3 * 3600 : 8 * 3600,
    }));

    const current = hourly[0];
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return {
        tempC: current.tempC,
        feelsLikeC: current.feelsLikeC,
        humidity: current.humidity,
        windKmh: current.windKmh,
        windGustKmh: current.windGustKmh,
        windDir: current.windDir,
        code: current.code,
        isDay: current.isDay,
        pressureHpa: current.pressureHpa,
        cloudCover: current.cloudCover,
        precipMm: current.precipMm,
        dewPointC: current.dewPointC,
        visibilityM: current.visibilityM,
        uvIndex: current.uvIndex,
        place: { lat: 55.75, lon: 37.62, name: 'Sample', timezone },
        location: 'Sample place',
        timezone,
        fetchedAt: now.getTime(),
        sunrise: `${today}T06:40`,
        sunset: `${today}T19:10`,
        daily,
        hourly,
    };
}

/** The dialog wants a translator, a unit and a clock the way the card hands
 *  them over, and those come from hooks — so it gets a component of its own. */
const WeatherSpecimen: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const translator = useTranslation();
    const settings = useZenithStore((s) => s.settings);
    const data = useMemo(() => cachedWeather() ?? sampleWeather(), []);
    return (
        <WeatherExpanded
            data={data}
            unit={settings.weatherUnit}
            forecastDays={settings.weatherForecastDays}
            showAir={settings.weatherShowAir}
            loading={false}
            now={new Date()}
            t={translator}
            onRefresh={() => undefined}
            onClose={onClose}
        />
    );
};

// ── The catalogue ────────────────────────────────────

/** In the order the gallery lists them: Zenith's own first, then by module. */
export const MODAL_CATALOG: readonly ModalEntry[] = [
    {
        id: 'prompt',
        name: 'PromptModal',
        owner: 'core',
        kind: 'obsidian',
        create: ({ app }) => presetPrompt(app),
        // The answer only comes back through `ask()`, which also opens it.
        open: ({ app, report }) => void presetPrompt(app).ask().then(report),
    },
    {
        id: 'iconPicker',
        name: 'IconPickerModal',
        owner: 'core',
        kind: 'obsidian',
        create: ({ app, report }) => new IconPickerModal(app, 'sparkles', report),
    },
    {
        id: 'imagePicker',
        name: 'ImagePickerModal',
        owner: 'core',
        kind: 'obsidian',
        create: ({ app, report }) =>
            new ImagePickerModal(app, t('settings.vaultImage.search'), report),
    },
    {
        id: 'scaffold',
        name: 'VaultScaffoldModal',
        owner: 'core',
        kind: 'obsidian',
        writes: true,
        create: ({ app, report }) => new VaultScaffoldModal(app, () => report('done')),
    },
    {
        id: 'quickAddTask',
        name: 'QuickAddTaskModal',
        owner: 'tasks',
        kind: 'obsidian',
        writes: true,
        create: ({ app, report }) =>
            new QuickAddTaskModal(app, useZenithStore.getState().settings, () => report('added')),
    },
    {
        id: 'taskEditor',
        name: 'TaskEditorModal',
        owner: 'tasks',
        kind: 'react',
        writes: true,
        render: ({ report }, onClose) => (
            <TaskEditorModal onClose={onClose} onSaved={() => report('saved')} />
        ),
    },
    {
        id: 'subtaskEditor',
        name: 'SubtaskEditorModal',
        owner: 'tasks',
        kind: 'react',
        writes: true,
        sample: () => subtaskSubject().sample,
        render: ({ report }, onClose) => {
            const { filePath, subtask } = subtaskSubject();
            return (
                <SubtaskEditorModal
                    filePath={filePath}
                    subtask={subtask}
                    onClose={onClose}
                    onSaved={() => report('saved')}
                />
            );
        },
    },
    {
        id: 'lightbox',
        name: 'ImageLightbox',
        owner: 'tasks',
        kind: 'react',
        sample: ({ app }) => pictureSubject(app).sample,
        render: ({ app }, onClose) => {
            const { attachment, src } = pictureSubject(app);
            return <ImageLightbox attachment={attachment} src={src} onClose={onClose} />;
        },
    },
    {
        id: 'contentDetail',
        name: 'ContentDetailModal',
        owner: 'content',
        kind: 'react',
        writes: true,
        sample: () => contentSubject().sample,
        render: (_ctx, onClose) => {
            const { item } = contentSubject();
            const types = effectiveContentTypes(useZenithStore.getState().settings.contentTypes);
            return (
                <ContentDetailModal
                    item={item}
                    type={resolveContentType(types, item.type)}
                    onClose={onClose}
                />
            );
        },
    },
    {
        id: 'contentForm',
        name: 'ContentForm',
        owner: 'content',
        kind: 'react',
        writes: true,
        render: ({ report }, onClose) => (
            <ContentForm onCancel={onClose} onCreated={() => report('created')} />
        ),
    },
    {
        id: 'contentImport',
        name: 'ContentImportModal',
        owner: 'content',
        kind: 'react',
        writes: true,
        render: ({ report }, onClose) => (
            <ContentImportModal onClose={onClose} onImported={() => report('imported')} />
        ),
    },
    {
        id: 'projectForm',
        name: 'ProjectFormModal',
        owner: 'projects',
        kind: 'obsidian',
        writes: true,
        create: ({ app, plugin }) => new ProjectFormModal(app, plugin),
    },
    {
        id: 'prayer',
        name: 'PrayerModal',
        owner: 'prayer',
        kind: 'obsidian',
        writes: true,
        create: ({ app, plugin }) => new PrayerModal(app, plugin),
    },
    {
        id: 'syncQuick',
        name: 'SyncQuickModal',
        owner: 'sync',
        kind: 'obsidian',
        writes: true,
        create: ({ app, plugin }) => new SyncQuickModal(app, plugin),
    },
    {
        id: 'mediaPicker',
        name: 'MediaPickerModal',
        owner: 'media',
        kind: 'obsidian',
        writes: true,
        create: ({ app }) => new MediaPickerModal(app),
    },
    {
        id: 'weather',
        name: 'WeatherExpanded',
        owner: 'weather',
        kind: 'react',
        sample: () => cachedWeather() === null,
        render: (_ctx, onClose) => <WeatherSpecimen onClose={onClose} />,
    },
];
