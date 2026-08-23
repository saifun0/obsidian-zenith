import React, { type FC } from 'react';
import { Columns3, RotateCcw, Rows3, MoveHorizontal, Maximize2 } from 'lucide-react';
import {
    CANVAS_WIDTHS,
    DEFAULT_GRID_CONFIG,
    GRID_LIMITS,
    normalizeGridConfig,
    stepCanvasWidth,
    type GridConfig,
} from '../grid/gridTypes';
import { useTranslation } from '../../../core/i18n';

interface GridSettingsBarProps {
    config: GridConfig;
    /** The narrow one-column layout — column count has no effect there. */
    stacked: boolean;
    onChange: (next: GridConfig) => void;
}

interface StepperProps {
    icon: React.ReactNode;
    label: string;
    value: string | number;
    limits: readonly [number, number, number];
    current: number;
    disabled?: boolean;
    hint?: string;
    onStep: (next: number) => void;
}

const Stepper: FC<StepperProps> = ({
    icon,
    label,
    value,
    limits,
    current,
    disabled,
    hint,
    onStep,
}) => {
    const [min, max, step] = limits;
    return (
        <div className={`zenith-gridbar__control ${disabled ? 'is-disabled' : ''}`} title={hint}>
            <span className="zenith-gridbar__label">
                {icon}
                {label}
            </span>
            <div className="zenith-gridbar__stepper">
                <button
                    type="button"
                    aria-label={`− ${label}`}
                    disabled={disabled || current <= min}
                    onClick={() => onStep(current - step)}
                >
                    −
                </button>
                <span className="zenith-gridbar__value">{value}</span>
                <button
                    type="button"
                    aria-label={`+ ${label}`}
                    disabled={disabled || current >= max}
                    onClick={() => onStep(current + step)}
                >
                    +
                </button>
            </div>
        </div>
    );
};

/**
 * GridSettingsBar — the grid's own geometry, adjustable while arranging.
 *
 * This lives on the dashboard rather than in the settings tab because every
 * knob here is judged by eye: you change the column count and immediately see
 * the widgets re-flow. Values are normalised on the way out, so a stepper can
 * never write a column count the layout engine would divide by.
 */
export const GridSettingsBar: FC<GridSettingsBarProps> = ({ config, stacked, onChange }) => {
    const t = useTranslation();
    const set = (patch: Partial<GridConfig>) => onChange(normalizeGridConfig({ ...config, ...patch }));
    const isDefault =
        config.columns === DEFAULT_GRID_CONFIG.columns &&
        config.rowHeight === DEFAULT_GRID_CONFIG.rowHeight &&
        config.gap === DEFAULT_GRID_CONFIG.gap &&
        config.maxWidth === DEFAULT_GRID_CONFIG.maxWidth;

    return (
        <div className="zenith-gridbar">
            <div className="zenith-gridbar__title">{t('dashboard.grid')}</div>

            <div className="zenith-gridbar__controls">
                <Stepper
                    icon={<Columns3 size={13} />}
                    label={t('dashboard.grid.columns')}
                    value={stacked ? '1' : config.columns}
                    limits={GRID_LIMITS.columns}
                    current={config.columns}
                    disabled={stacked}
                    hint={t(stacked ? 'dashboard.grid.stackedHint' : 'dashboard.grid.columnsHint')}
                    onStep={(columns) => set({ columns })}
                />
                <Stepper
                    icon={<Rows3 size={13} />}
                    label={t('dashboard.grid.rowHeight')}
                    value={`${config.rowHeight}px`}
                    limits={GRID_LIMITS.rowHeight}
                    current={config.rowHeight}
                    hint={t('dashboard.grid.rowHeightHint')}
                    onStep={(rowHeight) => set({ rowHeight })}
                />
                <Stepper
                    icon={<MoveHorizontal size={13} />}
                    label={t('dashboard.grid.gap')}
                    value={`${config.gap}px`}
                    limits={GRID_LIMITS.gap}
                    current={config.gap}
                    hint={t('dashboard.grid.gapHint')}
                    onStep={(gap) => set({ gap })}
                />
                {/* Walks a fixed list of widths ending in "Full", so the index —
                    not the pixel value — is what the ±  buttons move. */}
                <Stepper
                    icon={<Maximize2 size={13} />}
                    label={t('dashboard.grid.canvas')}
                    value={config.maxWidth === 0 ? t('dashboard.grid.full') : `${config.maxWidth}px`}
                    limits={[0, CANVAS_WIDTHS.length - 1, 1]}
                    current={CANVAS_WIDTHS.indexOf(config.maxWidth)}
                    hint={t('dashboard.grid.canvasHint')}
                    onStep={(index) =>
                        set({
                            maxWidth: stepCanvasWidth(
                                config.maxWidth,
                                index > CANVAS_WIDTHS.indexOf(config.maxWidth) ? 1 : -1
                            ),
                        })
                    }
                />
            </div>

            <button
                type="button"
                className="zenith-gridbar__reset"
                onClick={() => onChange({ ...DEFAULT_GRID_CONFIG })}
                disabled={isDefault}
                title={t('dashboard.grid.resetHint')}
            >
                <RotateCcw size={13} /> {t('dashboard.grid.reset')}
            </button>
        </div>
    );
};
