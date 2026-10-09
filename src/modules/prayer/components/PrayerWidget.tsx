import { useFeature } from '../../../core/useFeature';
import React, { type FC } from 'react';
import { Maximize2 } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useZenithStore } from '../../../store';
import { useTranslation } from '../../../core/i18n';
import { getTodayString } from '../../../core/dateUtils';
import type { DashboardWidgetProps } from '../../dashboard/widgets';
import { useCardRoom } from '../../dashboard/cardRoom';
import { EXTRA_PRAYERS, PRAYERS, isPerformed, type ExtraPrayerId, type PrayerId } from '../prayerConfig';
import { formatClock, hasEntered, nextPrayer } from '../prayerTimes';
import { useCountdownText } from './useCountdownText';
import { setExtraPrayer, setPrayerStatus, statusForTap } from '../prayerActions';
import { dayOf } from '../prayerStats';
import {
    useDayTimes,
    useNowMinutes,
    usePrayerDays,
    usePrayerExtras,
    usePrayerPlace,
} from '../usePrayer';
import { PrayerMark, markState } from './PrayerMark';
import { PrayerTile } from './PrayerTile';
import { PrayerNoPlace } from './PrayerNoPlace';
import { PrayerWeekStrip } from './PrayerWeekStrip';
import { usePrayerMenu } from './usePrayerMenu';
import { PrayerModal } from '../PrayerModal';

/**
 * The two thresholds are measured, not guessed.
 *
 * A tile needs ~78px before "Магриб" starts being clipped, so five of them plus
 * their gaps need ~430px; the countdown column adds 262px and its gaps another
 * 49. Below 740 the split layout therefore cannot hold both — it puts the
 * countdown on top instead — and below 430 not even the tiles fit, so each
 * prayer becomes a full-width row.
 *
 * The preset alone can't answer this: a `md` widget dragged into a sidebar is
 * narrower than a `sm` one on a wide canvas, and that is exactly the case where
 * five tiles would each be 38px wide and lose their names.
 */
const STACK_WIDTH = 430;
const SPLIT_WIDTH = 740;
/** A card with this much height has room for the week and the voluntary prayers under the day. */
const WEEK_MIN_PX = 330;

/**
 * PrayerWidget — the day's prayers on the dashboard.
 *
 * One question drives the layout: what is next, and how long have I got. The
 * countdown owns the left half at every size that has one; the five prayers sit
 * to the right of a hairline, each a tile you can tap.
 *
 * Four compositions, chosen by the room the card has rather than by the name
 * of its preset (see cardRoom.ts): a line and five rows in a phone's column,
 * the hero over a row of tiles in half a board, the hero beside the tiles in
 * a wide card, and under those — where the card has the height — the week and
 * the voluntary prayers. The card follows its content, so the tall one is as
 * tall as that makes it and no taller: it used to be four rows whatever was
 * in them, with the day at the top, the week at the bottom and nothing
 * between.
 */
export const PrayerWidget: FC<DashboardWidgetProps> = () => {
    const t = useTranslation();
    const { app, plugin } = useApp();
    const settings = useZenithStore((s) => s.settings);

    const today = getTodayString();
    const day = useDayTimes(today);
    const place = usePrayerPlace();
    const days = usePrayerDays();
    const nowMinutes = useNowMinutes();
    const extras = usePrayerExtras();
    const weekStripOn = useFeature('prayer.weekStrip');
    const openMenu = usePrayerMenu(today);
    const countdownText = useCountdownText(today);

    const room = useCardRoom();
    const width = room.width;

    if (!place || !day) {
        return (
            <div className="zenith-prayer zenith-prayer--widget">
                <PrayerNoPlace />
            </div>
        );
    }

    const { times } = day;
    const record = dayOf(days, today);
    const next = nextPrayer(times, nowMinutes);
    const done = PRAYERS.filter((id) => isPerformed(record.statuses[id])).length;

    const tap = (prayer: PrayerId) => {
        // A second tap clears — the fastest undo, and the only one on a phone.
        const status = record.statuses[prayer];
        void setPrayerStatus(
            app,
            settings,
            today,
            prayer,
            status ? null : statusForTap(times, prayer, nowMinutes)
        );
    };

    const enabledExtras = EXTRA_PRAYERS.filter((id) => extras.includes(id));

    // The way into the full tracker. It rides on the "n of five" line rather
    // than floating in a corner: that line is already the widget's summary of
    // the day, and "0 of 5" is the thing that makes you want the rest.
    //
    // Until a method is chosen it carries a dot and says so: the full view is
    // where the question is asked, and the widget has no room to ask it.
    const chosen = settings.prayerMethodChosen;
    const openLabel = t(chosen ? 'prayer.openFull' : 'prayer.choose.widget');
    const openFull = (
        <button
            type="button"
            className={`zenith-prayer__open${chosen ? '' : ' is-attention'}`}
            onClick={() => new PrayerModal(app, plugin).open()}
            title={openLabel}
            aria-label={openLabel}
        >
            <Maximize2 size={12} />
        </button>
    );

    // Before the first measurement the middle composition is the guess: it
    // is the one that is wrong by least whichever way the card turns out.
    const layout: 'stack' | 'sm' | 'md' | 'lg' =
        width === 0
            ? 'sm'
            : width < STACK_WIDTH
              ? 'stack'
              : width < SPLIT_WIDTH
                ? 'sm'
                : room.height >= WEEK_MIN_PX
                  ? 'lg'
                  : 'md';

    const countdown = next ? countdownText(next) : t('prayer.noTimes');

    const marks = (
        <span className="zenith-prayer__minimarks">
            {PRAYERS.map((id) => (
                <PrayerMark
                    key={id}
                    state={markState(
                        record.statuses[id],
                        hasEntered(times, id, nowMinutes),
                        Number.isFinite(times[id])
                    )}
                    size={11}
                />
            ))}
        </span>
    );

    const tiles = (variant: 'tile' | 'row', markSize: number, showStatus = false) =>
        PRAYERS.map((id) => (
            <PrayerTile
                key={id}
                prayer={id}
                at={times[id]}
                status={record.statuses[id]}
                entered={hasEntered(times, id, nowMinutes)}
                isNext={next?.id === id && !next.tomorrow}
                variant={variant}
                markSize={markSize}
                showStatus={showStatus}
                onTap={tap}
                onMenu={openMenu}
            />
        ));

    // ── One line, then a row per prayer: the phone layout ──
    if (layout === 'stack') {
        return (
            <div className="zenith-prayer zenith-prayer--widget zenith-prayer--stack">
                <div className="zenith-prayer__oneline">
                    <b>
                        {next ? `${t(`prayer.${next.id}`)} ${formatClock(next.at, t.locale)}` : '—'}
                    </b>
                    <span className="zenith-prayer__countdown">{countdown}</span>
                    <span className="zenith-prayer__counter">
                        {t('prayer.done', { done, total: PRAYERS.length })}
                    </span>
                    {openFull}
                </div>
                <div className="zenith-prayer__rows">{tiles('row', 12)}</div>
            </div>
        );
    }

    // ── The hero: kicker, name, time, countdown, and what's been marked ──
    const hero = (
        <div className="zenith-prayer__hero">
            <span className="zenith-prayer__kicker">
                {t('prayer.next')}
                {next?.tomorrow && ` · ${t('prayer.tomorrow')}`}
            </span>
            <span className="zenith-prayer__hero-name">{next ? t(`prayer.${next.id}`) : '—'}</span>
            <span className="zenith-prayer__hero-time">
                {next ? formatClock(next.at, t.locale) : '—'}
            </span>
            <span className="zenith-prayer__countdown">{countdown}</span>
            <div className="zenith-prayer__marked">
                {marks}
                <span>{t('prayer.doneMarked', { done, total: PRAYERS.length })}</span>
                {openFull}
            </div>
        </div>
    );

    if (layout === 'sm') {
        return (
            <div className="zenith-prayer zenith-prayer--widget zenith-prayer--sm">
                <div className="zenith-prayer__hero zenith-prayer__hero--split">
                    <div className="zenith-prayer__hero-text">
                        <span className="zenith-prayer__kicker">
                            {t('prayer.next')}
                            {next?.tomorrow && ` · ${t('prayer.tomorrow')}`}
                        </span>
                        <span className="zenith-prayer__hero-name">
                            {next ? t(`prayer.${next.id}`) : '—'}
                        </span>
                        <span className="zenith-prayer__countdown">{countdown}</span>
                    </div>
                    <span className="zenith-prayer__hero-time">
                        {next ? formatClock(next.at, t.locale) : '—'}
                    </span>
                </div>
                <div className="zenith-prayer__marked">
                    {marks}
                    <span>{t('prayer.done', { done, total: PRAYERS.length })}</span>
                    {openFull}
                </div>
                <div className="zenith-prayer__tiles">{tiles('tile', 11)}</div>
            </div>
        );
    }

    return (
        <div
            className={`zenith-prayer zenith-prayer--widget zenith-prayer--${layout}`}
        >
            <div className="zenith-prayer__split">
                {hero}
                <div className="zenith-prayer__divider" />
                <div className="zenith-prayer__tiles">
                    {tiles('tile', layout === 'lg' ? 15 : 13, layout === 'lg')}
                </div>
            </div>

            {layout === 'lg' && (weekStripOn || enabledExtras.length > 0) && (
                <>
                    <div className="zenith-prayer__rule" />
                    <div className="zenith-prayer__split zenith-prayer__split--bottom">
                        {weekStripOn && <PrayerWeekStrip days={days} today={today} />}
                        {enabledExtras.length > 0 && (
                            <>
                                {weekStripOn && <div className="zenith-prayer__divider" />}
                                <div className="zenith-prayer__extras-panel">
                                    <span className="zenith-prayer__kicker">
                                        {t('prayer.extrasTitle')}
                                    </span>
                                    <div className="zenith-prayer__extras">
                                        {enabledExtras.map((id) => (
                                            <ExtraButton
                                                key={id}
                                                extra={id}
                                                done={!!record.extras[id]}
                                                onToggle={() =>
                                                    void setExtraPrayer(
                                                        app,
                                                        settings,
                                                        today,
                                                        id,
                                                        !record.extras[id]
                                                    )
                                                }
                                            />
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

/**
 * A voluntary prayer: the same mark vocabulary, as a wide toggle.
 *
 * `compact` makes it a chip instead — in the full view these ride in the list's
 * heading line, where a 40px block of its own would announce the optional
 * prayers louder than the obligatory ones below it.
 */
export const ExtraButton: FC<{
    extra: ExtraPrayerId;
    done: boolean;
    disabled?: boolean;
    compact?: boolean;
    onToggle: () => void;
}> = ({ extra, done, disabled = false, compact = false, onToggle }) => {
    const t = useTranslation();
    return (
        <button
            type="button"
            className={`zenith-prayer__extra ${done ? 'is-done' : ''} ${
                compact ? 'is-compact' : ''
            }`}
            disabled={disabled}
            onClick={onToggle}
            aria-pressed={done}
        >
            <PrayerMark state={done ? 'ontime' : 'none'} size={11} />
            <span>{t(`prayer.extra.${extra}`)}</span>
        </button>
    );
};
