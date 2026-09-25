import React, { useEffect, useState, type FC } from 'react';
import { Check, Minus, Plus } from 'lucide-react';
import { useTranslation } from '../../../core/i18n';
import { Popover, usePopover } from '../../../components/shared';

interface ProgressPopoverProps {
    title: string;
    /** Where the item is now, and how far it goes. `null` total is open-ended. */
    current: number;
    total: number | undefined;
    /** The user's own word — "ep", "стр.", "ch". Never built into a sentence. */
    unit: string;
    /** The item's type colour, for the one accent in the menu. */
    color: string;
    /** `row` is the compact control; `spot` is the larger one. */
    variant: 'row' | 'spot';
    /** Applies a delta. The card clamps and writes; see `bumpProgress`. */
    onBump: (delta: number) => void | Promise<void>;
}

const MENU_W = 212;
/** Tall enough to decide whether the menu has to open upwards. */
const MENU_H = 150;

/**
 * Quick jumps, largest first so the row reads as a scale.
 *
 * Three is the whole list on purpose. The point of the menu is to stop a
 * fifteen-episode evening costing fifteen clicks, and beyond about ten the
 * honest control is the number field beside them — a "+50" chip is a guess
 * dressed as a shortcut.
 */
const JUMPS = [1, 5, 10];

/**
 * The progress control, as a menu rather than a single "+1".
 *
 * The card used to advance an item by exactly one per click, which is right
 * for the commonest case and useless for every other one: three episodes is
 * three clicks with a write and a re-parse behind each, and "I am on page 212"
 * could not be said at all without opening the library.
 *
 * So the control opens, the way a task's checkbox opens its statuses — same
 * mechanics, same manners. Inside: a stepper with the exact number in the
 * middle, three quick jumps, and "finished" when there is a total to finish
 * to. Everything is one action; nothing needs two.
 *
 * Rendered through a portal with fixed positioning, because every ancestor it
 * has clips: the rows area, the card body, the grid cell. Dismissed by a click
 * outside, by Escape, and by any scroll — a menu anchored to a row that has
 * moved is pointing at the wrong thing.
 */
export const ProgressPopover: FC<ProgressPopoverProps> = ({
    title,
    current,
    total,
    unit,
    color,
    variant,
    onBump,
}) => {
    const t = useTranslation();
    const pop = usePopover();
    /** What the number field is showing while it is being typed into. */
    const [draft, setDraft] = useState('');

    useEffect(() => {
        if (!pop.open) return;
        setDraft(String(current));
    }, [pop.open, current]);

    const step = (delta: number) => {
        if (delta !== 0) void onBump(delta);
    };

    /** Commit whatever is in the number field, as the delta it amounts to. */
    const commitDraft = () => {
        const n = Math.round(Number(draft));
        if (!Number.isFinite(n) || n < 0) {
            setDraft(String(current));
            return;
        }
        const capped = total ? Math.min(n, total) : n;
        setDraft(String(capped));
        step(capped - current);
    };

    const left = total ? total - current : undefined;
    const canFinish = total !== undefined && current < total;

    return (
        <>
            <button
                {...pop.anchorProps}
                type="button"
                className={`zenith-cw__bump zenith-cw__bump--${variant} ${pop.open ? 'is-open' : ''}`}
                aria-label={t('content.progress.edit', { title })}
                title={t('content.progress.edit', { title })}
                onClick={pop.toggle}
            >
                <Plus size={variant === 'spot' ? 15 : 13} strokeWidth={2.5} />
            </button>

            <Popover
                anchor={pop.anchor}
                open={pop.open}
                onClose={pop.close}
                width={MENU_W}
                height={MENU_H}
                // The control sits at the right edge of its row, so a menu hung
                // from its left corner reaches past the card and gets pushed
                // back every time.
                align="end"
                role="dialog"
                label={t('content.progress.edit', { title })}
                className="zenith-cwp"
            >
                <div onClick={(e) => e.stopPropagation()}>
                        <div className="zenith-pop__title" title={title}>
                            {title}
                        </div>

                        <div className="zenith-cwp__stepper">
                            <button
                                type="button"
                                className="zenith-cwp__step"
                                aria-label={t('content.progress.less', { unit })}
                                disabled={current <= 0}
                                onClick={() => step(-1)}
                            >
                                <Minus size={14} />
                            </button>

                            <span className="zenith-cwp__value">
                                <input
                                    className="zenith-input zenith-input--sm zenith-cwp__num"
                                    type="number"
                                    inputMode="numeric"
                                    min={0}
                                    max={total}
                                    aria-label={t('content.progress.done', { unit })}
                                    value={draft}
                                    onChange={(e) => setDraft(e.target.value)}
                                    onBlur={commitDraft}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            commitDraft();
                                        }
                                    }}
                                />
                                <span className="zenith-cwp__of">
                                    {total ? `/ ${total}` : ''} {unit}
                                </span>
                            </span>

                            <button
                                type="button"
                                className="zenith-cwp__step"
                                aria-label={t('content.progress.more', { unit })}
                                disabled={total !== undefined && current >= total}
                                onClick={() => step(1)}
                            >
                                <Plus size={14} />
                            </button>
                        </div>

                        {/* A jump past the end is not offered rather than
                            offered and refused: `bumpProgress` would return
                            null and the click would do nothing, which reads as
                            a broken button. */}
                        <div className="zenith-cwp__jumps">
                            {JUMPS.filter((n) => left === undefined || n <= left).map((n) => (
                                <button
                                    key={n}
                                    type="button"
                                    className="zenith-cwp__jump"
                                    style={{ ['--cwp-color' as string]: color }}
                                    onClick={() => step(n)}
                                >
                                    +{n}
                                </button>
                            ))}
                        </div>

                        {canFinish && (
                            <button
                                type="button"
                                className="zenith-cwp__finish"
                                onClick={() => step((total) - current)}
                            >
                                <Check size={13} />
                                {t('content.progress.finished')}
                            </button>
                        )}
                </div>
            </Popover>
        </>
    );
};
