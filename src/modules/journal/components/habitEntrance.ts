/**
 * The habit grid assembling itself.
 *
 * This was a set of CSS rules gated on an `is-entering` class, and it did not
 * work in the app — the marks stood there fully drawn while the bars grew
 * around them. Debugging it from the stylesheet meant guessing at three things
 * at once: whether the class was on the element at the frame that mattered,
 * whether `animation-fill-mode: backwards` was really holding the from-state
 * through a computed delay, and whether React had reused an element that had
 * already played. None of that is observable from the source.
 *
 * So the sequence is driven from script instead. `Element.animate` applies the
 * first keyframe for the whole of its delay (`fill: 'backwards'`), it outranks
 * every stylesheet declaration, and it starts exactly when it is called —
 * which the caller can pin to the moment the panel is actually on screen. The
 * timings below are the same ones the approved mockup used.
 */

/** Milliseconds between one habit row starting and the next. */
const ROW_STEP = 70;
/** Milliseconds between one day column and the next, within a row. */
const DAY_STEP = 12;

const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
const EASE_BACK = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

/**
 * When each kind of element starts, relative to its row and column.
 *
 * Days that recorded something come last and take longest. A real month is
 * mostly empty rings — a hundred and twenty faint circles and eight filled
 * ones — and animating all of them identically spends the whole sequence on
 * the part nobody looks at. The rings wash in early and quickly, the streaks
 * draw themselves, and the marks that mean something land on top, late enough
 * to be the thing you actually see happen.
 */
const OFFSET = { ring: 150, run: 90, mark: 260, head: 240, card: 560 };
const DURATION = { row: 380, run: 560, ring: 260, mark: 420, head: 300, card: 420 };
/** Milliseconds between the summary cards, of which there are at most three. */
const CARD_STEP = 80;
const CARD_COUNT = 3;

/** How long the whole sequence takes, for the caller's "it's over" timer. */
export function entranceDuration(rows: number, days: number): number {
    const lastRow = Math.max(0, rows - 1) * ROW_STEP;
    const lastDay = Math.max(0, days - 1) * DAY_STEP;
    return Math.max(
        lastRow + lastDay + OFFSET.mark + DURATION.mark,
        lastDay + OFFSET.head + DURATION.head,
        OFFSET.card + (CARD_COUNT - 1) * CARD_STEP + DURATION.card
    );
}

const FADE_UP: Keyframe[] = [
    { opacity: 0, transform: 'translateY(6px)' },
    { opacity: 1, transform: 'none' },
];

/** A day that recorded something: lands hard enough to be noticed. */
const POP: Keyframe[] = [
    { opacity: 0, transform: 'scale(0.1)' },
    { opacity: 1, transform: 'scale(1.28)', offset: 0.68 },
    { opacity: 1, transform: 'scale(1)' },
];

/** An empty day: a quiet wash, so it doesn't compete with the marks. */
const RING: Keyframe[] = [
    { opacity: 0, transform: 'scale(0.75)' },
    { opacity: 1, transform: 'scale(1)' },
];

const GROW: Keyframe[] = [
    { opacity: 0, transform: 'scaleX(0)' },
    { opacity: 0.85, transform: 'scaleX(1)' },
];

/** The day index an element sits at, from the attribute the grid writes. */
function columnOf(element: Element): number {
    return Number(element.getAttribute('data-at') ?? 0);
}

/** The habit row it belongs to. Written on the element for the same reason. */
function rowOf(element: Element): number {
    return Number(element.getAttribute('data-row') ?? 0);
}

/** Did this day record anything? Empty days are staged differently. */
function isMarked(element: Element): boolean {
    return element.getAttribute('data-marked') === '1';
}

/**
 * Schedule one element's part, or nothing where the platform can't animate.
 *
 * The capability is asked of the element itself rather than of `Element`, so
 * this module names no browser global and stays testable in a plain node
 * environment.
 */
function run(
    element: Element,
    keyframes: Keyframe[],
    duration: number,
    delay: number,
    easing: string
): Animation | null {
    const node = element as HTMLElement;
    if (typeof node.animate !== 'function') return null;
    return node.animate(keyframes, {
        duration,
        delay,
        easing,
        // Holds the first keyframe through the delay: nothing is on screen
        // before its own moment, which is the whole point of a stagger.
        fill: 'backwards',
    });
}

/**
 * Play the entrance over the grid inside `root`, and return the animations so
 * the caller can cancel them if the view goes away mid-sequence.
 *
 * Safe to call on a browser without `Element.animate` — it simply does
 * nothing, and the grid is drawn in its finished state, which is correct.
 */
export function playHabitEntrance(root: HTMLElement): Animation[] {
    // No `prefers-reduced-motion` check here, deliberately. Zenith has its own
    // switch for this — Settings → Interface → Animations — and a setting the
    // user turned ON in the app is a more specific answer than the operating
    // system's default. Asking both meant a machine with Windows animations
    // off silently discarded the sequence no matter what the plugin said,
    // which is indistinguishable from the feature being broken. The caller
    // gates on the setting; that is the whole gate.
    const scheduled: Array<Animation | null> = [];

    // Every group is one flat query from the panel. Walking into each row and
    // querying within it made the marks and the bars depend on that walk
    // finding anything — one selector away from a sequence that animates the
    // headers and the cards while the part anyone actually looks at sits
    // still, which is a failure that looks exactly like no animation at all.
    root.querySelectorAll('.zenith-hmon__label').forEach((label, row) => {
        scheduled.push(run(label, FADE_UP, DURATION.row, row * ROW_STEP, EASE_OUT));
    });

    root.querySelectorAll('.zenith-hmon__run').forEach((bar) => {
        const element = bar as HTMLElement;
        // Each bar grows from the day it starts on (`transform-origin` in
        // journal.css), so a streak is drawn in the direction it was lived.
        scheduled.push(
            run(
                element,
                GROW,
                DURATION.run,
                rowOf(bar) * ROW_STEP + columnOf(bar) * DAY_STEP + OFFSET.run,
                EASE_OUT
            )
        );
    });

    // Later than the bar beneath it, so the chain reads as being drawn and
    // then studded with its days rather than the two racing each other.
    // Cells AND the chain's discs: they sit on top of each other and have to
    // move as one, so both answer to the same two attributes.
    root.querySelectorAll('.zenith-hmon__cell, .zenith-hmon__blob').forEach((cell) => {
        const marked = isMarked(cell);
        scheduled.push(
            run(
                cell,
                marked ? POP : RING,
                marked ? DURATION.mark : DURATION.ring,
                rowOf(cell) * ROW_STEP +
                    columnOf(cell) * DAY_STEP +
                    (marked ? OFFSET.mark : OFFSET.ring),
                marked ? EASE_BACK : EASE_OUT
            )
        );
    });

    root.querySelectorAll('.zenith-hmon__day, .zenith-hmon__total').forEach((mark) => {
        scheduled.push(
            run(mark, FADE_UP, DURATION.head, columnOf(mark) * DAY_STEP + OFFSET.head, 'ease')
        );
    });

    // The cards restate the month, so they arrive once it is standing. See
    // {@link playStreakGrowth} for what happens when a single day is ticked.
    root.querySelectorAll('.zenith-hcard').forEach((card, i) => {
        scheduled.push(
            run(card, FADE_UP, DURATION.card, OFFSET.card + i * CARD_STEP, EASE_OUT)
        );
    });

    return scheduled.filter((animation): animation is Animation => animation !== null);
}

/** Marks in `row`, by day column — the button and the disc fused under it. */
function marksIn(root: HTMLElement, row: number): Map<number, Element[]> {
    const marks = new Map<number, Element[]>();
    root.querySelectorAll('.zenith-hmon__cell, .zenith-hmon__blob').forEach((cell) => {
        if (rowOf(cell) !== row) return;
        const column = columnOf(cell);
        const at = marks.get(column);
        if (at) at.push(cell);
        else marks.set(column, [cell]);
    });
    return marks;
}

/**
 * One day was just recorded: redraw the streak it belongs to.
 *
 * The same motion as the entrance, scoped to one row. The bar draws itself
 * from the end that did NOT move, and the days on it stay hidden until it
 * reaches them — so what you see is a line being drawn, and the marks landing
 * on it, rather than a chain that was already there twitching.
 *
 * This used to be a CSS rule on a `is-growing` class: 320ms, the bar alone,
 * and the marks sitting on top of it throughout. Half the length of the
 * entrance and none of its point.
 *
 * A day that joins no streak still lands: it gets the mark's own arrival, so
 * ticking a lone Tuesday is never silent.
 */
export function playStreakGrowth(root: HTMLElement, row: number, day: number): Animation[] {
    const scheduled: Array<Animation | null> = [];
    const marks = marksIn(root, row);

    const bar = Array.from(root.querySelectorAll('.zenith-hmon__run')).find((element) => {
        const to = Number(element.getAttribute('data-to') ?? -1);
        return rowOf(element) === row && columnOf(element) <= day && to >= day;
    });

    if (!bar) {
        const lone = marks.get(day) ?? [];
        return lone
            .map((mark) => run(mark, POP, DURATION.mark, 0, EASE_BACK))
            .filter((animation): animation is Animation => animation !== null);
    }

    const from = columnOf(bar);
    const to = Number(bar.getAttribute('data-to') ?? from);
    // The new day is the far end of the bar, so the bar reaches out to it from
    // the end that was already there.
    const fromRight = day === from && day !== to;

    (bar as HTMLElement).style.transformOrigin = fromRight ? 'right center' : 'left center';
    scheduled.push(run(bar, GROW, DURATION.run, 0, EASE_OUT));

    const span = Math.max(to - from, 1);
    for (let column = from; column <= to; column++) {
        // Each mark waits for the bar to arrive under it.
        const reached = (fromRight ? to - column : column - from) / span;
        const delay = 60 + reached * DURATION.run * 0.7;
        for (const mark of marks.get(column) ?? []) {
            scheduled.push(run(mark, POP, DURATION.mark, delay, EASE_BACK));
        }
    }

    return scheduled.filter((animation): animation is Animation => animation !== null);
}
