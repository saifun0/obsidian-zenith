import React, { useRef, useState, type FC } from 'react';
import { Pipette } from 'lucide-react';
import { Popover, usePopover } from '../../shared/Popover';
import { useTranslation } from '../../../core/i18n';
import { hexToHsv, hsvToHex, normalizeHex, type Hsv } from './colorMath';
import { isCoarsePointer } from './pointer';

export interface ColorFieldProps {
    /** `#rrggbb`, or `''` for none. */
    value: string;
    onChange: (value: string) => void;
    /** What the swatch shows while `value` is empty. */
    fallback?: string;
    /** Offer a way back to empty — to the theme's own colour, usually. */
    resetLabel?: string;
    disabled?: boolean;
    className?: string;
    id?: string;
    title?: string;
    'aria-label'?: string;
    'aria-labelledby'?: string;
    'aria-describedby'?: string;
}

/**
 * The choices offered before anyone drags anything. Stored values, like the
 * built-in content types' colours, not styling — which is why they are hex
 * here rather than theme variables: a colour saved into a note or a setting
 * has to mean the same thing under the next theme too.
 */
export const COLOR_PRESETS: readonly string[] = [
    '#ef4444',
    '#f97316',
    '#f59e0b',
    '#eab308',
    '#84cc16',
    '#22c55e',
    '#10b981',
    '#14b8a6',
    '#06b6d4',
    '#3b82f6',
    '#6366f1',
    '#7c6cff',
    '#8b5cf6',
    '#a855f7',
    '#ec4899',
    '#6b7280',
];

/** Where nothing else says what to start from. */
const START = '#7c6cff';

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Chromium's screen colour sampler; absent on iOS and Android WebViews. */
type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> };

/**
 * A colour, picked the way colour pickers work everywhere else.
 *
 * `<input type="color">` opens the operating system's own picker: a Windows
 * dialog from 1995 on one machine, a sheet with three tabs on an iPhone, and a
 * swatch drawn differently by every WebView before it is even opened. This is
 * one picker for all of them — a saturation/brightness square, a hue strip, the
 * code, a screen sampler where the platform has one, and a row of presets.
 *
 * A drag previews on the swatch and commits when the finger or the button
 * comes up, so a setting is written once per gesture rather than sixty times a
 * second. The keyboard commits as it goes: every arrow press is a decision.
 */
export const ColorField: FC<ColorFieldProps> = ({
    value,
    onChange,
    fallback,
    resetLabel,
    disabled,
    className = '',
    id,
    title,
    ...aria
}) => {
    const t = useTranslation();
    const pop = usePopover<HTMLButtonElement>();
    // The colour under the finger while a drag is under way; null otherwise.
    const [preview, setPreview] = useState<string | null>(null);
    const shown = preview ?? (value || fallback || '');
    const coarse = isCoarsePointer();

    const commit = (hex: string) => {
        setPreview(null);
        if (hex !== value) onChange(hex);
    };

    return (
        <>
            <button
                ref={pop.anchorProps.ref}
                type="button"
                id={id}
                title={title ?? (shown || undefined)}
                className={`zenith-input zenith-colorfield ${className}`.trim()}
                aria-haspopup="dialog"
                aria-expanded={pop.open}
                aria-label={aria['aria-label'] ?? t('fields.color.pick')}
                aria-labelledby={aria['aria-labelledby']}
                aria-describedby={aria['aria-describedby']}
                disabled={disabled}
                onClick={pop.toggle}
            >
                <span
                    className={`zenith-colorfield__chip${shown ? '' : ' is-empty'}`}
                    style={{ '--zenith-chip': shown } as React.CSSProperties}
                />
            </button>

            <Popover
                anchor={pop.anchor}
                open={pop.open}
                onClose={() => {
                    setPreview(null);
                    pop.close();
                }}
                width={coarse ? 288 : 264}
                height={(coarse ? 452 : 330) + (resetLabel ? (coarse ? 50 : 38) : 0)}
                role="dialog"
                label={aria['aria-label'] ?? t('fields.color.pick')}
                className="zenith-colorpick"
            >
                <ColorPicker
                    start={normalizeHex(value) ?? normalizeHex(fallback ?? '') ?? START}
                    selected={normalizeHex(value)}
                    placeholder={fallback}
                    resetLabel={resetLabel}
                    onPreview={setPreview}
                    onCommit={commit}
                    onReset={() => {
                        setPreview(null);
                        onChange('');
                        pop.close();
                        pop.anchor?.focus();
                    }}
                    onDone={() => {
                        pop.close();
                        pop.anchor?.focus();
                    }}
                />
            </Popover>
        </>
    );
};

/**
 * Pointer handling shared by the square and the strip: capture on press, so a
 * drag that leaves the box keeps steering it, and report the position as
 * fractions of the box. `touch-action: none` in the stylesheet stops the page
 * scrolling under the finger instead.
 */
function useDrag(onMove: (x: number, y: number, done: boolean) => void) {
    const active = useRef(false);
    // Where the pointer last was, for a cancel — which reports no position.
    const last = useRef<[number, number]>([0, 0]);
    const at = (e: React.PointerEvent<HTMLElement>, done: boolean) => {
        const box = e.currentTarget.getBoundingClientRect();
        last.current = [
            clamp01((e.clientX - box.left) / box.width),
            clamp01((e.clientY - box.top) / box.height),
        ];
        onMove(last.current[0], last.current[1], done);
    };
    return {
        onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            e.currentTarget.focus({ preventScroll: true });
            active.current = true;
            at(e, false);
        },
        onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
            if (active.current) at(e, false);
        },
        onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
            if (!active.current) return;
            active.current = false;
            at(e, true);
        },
        onPointerCancel: () => {
            if (!active.current) return;
            active.current = false;
            onMove(last.current[0], last.current[1], true);
        },
    };
}

/**
 * The picker itself. Mounted only while the popover is open, so it starts from
 * the field's current colour every time.
 */
const ColorPicker: FC<{
    start: string;
    selected: string | null;
    placeholder?: string;
    resetLabel?: string;
    onPreview: (hex: string) => void;
    onCommit: (hex: string) => void;
    onReset: () => void;
    onDone: () => void;
}> = ({ start, selected, placeholder, resetLabel, onPreview, onCommit, onReset, onDone }) => {
    const t = useTranslation();
    const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(start) ?? { h: 248, s: 0.58, v: 1 });
    const [code, setCode] = useState(start);
    const hex = hsvToHex(hsv);
    const dropper = (activeWindow as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper;

    const apply = (next: Hsv, done: boolean) => {
        setHsv(next);
        const out = hsvToHex(next);
        setCode(out);
        if (done) onCommit(out);
        else onPreview(out);
    };

    /** Take a whole code from outside the square — a preset, the sampler. */
    const take = (raw: string) => {
        const norm = normalizeHex(raw);
        const next = norm ? hexToHsv(norm) : null;
        if (!norm || !next) return;
        setHsv(next);
        setCode(norm);
        onCommit(norm);
    };

    const square = useDrag((x, y, done) => apply({ ...hsv, s: x, v: 1 - y }, done));
    const strip = useDrag((x, _y, done) => apply({ ...hsv, h: x * 360 }, done));

    const nudge = (e: React.KeyboardEvent, axis: 'sv' | 'h') => {
        const big = e.shiftKey ? 10 : 1;
        const moves: Record<string, () => Hsv> =
            axis === 'sv'
                ? {
                      ArrowLeft: () => ({ ...hsv, s: clamp01(hsv.s - 0.01 * big) }),
                      ArrowRight: () => ({ ...hsv, s: clamp01(hsv.s + 0.01 * big) }),
                      ArrowDown: () => ({ ...hsv, v: clamp01(hsv.v - 0.01 * big) }),
                      ArrowUp: () => ({ ...hsv, v: clamp01(hsv.v + 0.01 * big) }),
                  }
                : {
                      ArrowLeft: () => ({ ...hsv, h: Math.max(0, hsv.h - big) }),
                      ArrowDown: () => ({ ...hsv, h: Math.max(0, hsv.h - big) }),
                      ArrowRight: () => ({ ...hsv, h: Math.min(360, hsv.h + big) }),
                      ArrowUp: () => ({ ...hsv, h: Math.min(360, hsv.h + big) }),
                      Home: () => ({ ...hsv, h: 0 }),
                      End: () => ({ ...hsv, h: 360 }),
                  };
        const move = moves[e.key];
        if (!move) return;
        e.preventDefault();
        apply(move(), true);
    };

    const pct = (n: number) => `${Math.round(n * 100)}%`;

    return (
        <>
            <div
                className="zenith-colorpick__sv"
                style={{ '--zenith-hue': hsv.h } as React.CSSProperties}
                role="slider"
                tabIndex={0}
                aria-label={t('fields.color.area')}
                aria-valuetext={`${pct(hsv.s)}, ${pct(hsv.v)}`}
                onKeyDown={(e) => nudge(e, 'sv')}
                {...square}
            >
                <span
                    className="zenith-colorpick__thumb"
                    style={
                        {
                            left: pct(hsv.s),
                            top: pct(1 - hsv.v),
                            '--zenith-chip': hex,
                        } as React.CSSProperties
                    }
                />
            </div>

            <div
                className="zenith-colorpick__hue"
                role="slider"
                tabIndex={0}
                aria-label={t('fields.color.hue')}
                aria-valuemin={0}
                aria-valuemax={360}
                aria-valuenow={Math.round(hsv.h)}
                onKeyDown={(e) => nudge(e, 'h')}
                {...strip}
            >
                <span
                    className="zenith-colorpick__hue-thumb"
                    style={
                        {
                            left: `${(hsv.h / 360) * 100}%`,
                            '--zenith-hue': hsv.h,
                        } as React.CSSProperties
                    }
                />
            </div>

            <div className="zenith-colorpick__row">
                <span
                    className="zenith-colorpick__preview"
                    style={{ '--zenith-chip': hex } as React.CSSProperties}
                    aria-hidden="true"
                />
                {/* Written as the user types, once it is a whole code. */}
                <input
                    type="text"
                    className="zenith-input zenith-input--sm is-mono"
                    aria-label={t('fields.color.hex')}
                    placeholder={placeholder ?? START}
                    spellCheck={false}
                    autoComplete="off"
                    autoCapitalize="off"
                    maxLength={7}
                    value={code}
                    onChange={(e) => {
                        setCode(e.target.value);
                        const norm = normalizeHex(e.target.value);
                        const next = norm ? hexToHsv(norm) : null;
                        if (norm && next) {
                            setHsv(next);
                            onCommit(norm);
                        }
                    }}
                    onBlur={() => setCode(hex)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            onDone();
                        }
                    }}
                />
                {dropper && (
                    <button
                        type="button"
                        className="zenith-colorpick__tool"
                        aria-label={t('fields.color.eyedropper')}
                        title={t('fields.color.eyedropper')}
                        onClick={() => {
                            new dropper()
                                .open()
                                .then((result) => take(result.sRGBHex))
                                // Escape during sampling rejects; nothing to do.
                                .catch(() => undefined);
                        }}
                    >
                        <Pipette size={15} />
                    </button>
                )}
            </div>

            <div className="zenith-colorpick__grid">
                {COLOR_PRESETS.map((colour) => (
                    <button
                        key={colour}
                        type="button"
                        className={`zenith-colorpick__swatch${colour === selected ? ' is-selected' : ''}`}
                        style={{ '--zenith-chip': colour } as React.CSSProperties}
                        aria-label={colour}
                        aria-pressed={colour === selected}
                        title={colour}
                        onClick={() => take(colour)}
                    />
                ))}
            </div>

            {resetLabel && (
                <button type="button" className="zenith-colorpick__reset" onClick={onReset}>
                    {resetLabel}
                </button>
            )}
        </>
    );
};
