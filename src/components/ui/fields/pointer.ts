/**
 * Whether the primary pointer is a finger.
 *
 * Asked at the moment a menu is sized rather than subscribed to: the answer
 * changes when a tablet gains or loses a keyboard cover, and the next menu to
 * open picks that up, which is as soon as it can matter.
 */
export function isCoarsePointer(): boolean {
    return window.matchMedia?.('(pointer: coarse)').matches === true;
}

/**
 * Scroll `el` into view inside `scroller` and nowhere else.
 *
 * `scrollIntoView` walks every scrollable ancestor, the page included, and a
 * popover shuts when the page scrolls under it — so a list that brought its
 * chosen row into view that way could close itself in the act of opening.
 */
export function revealIn(
    scroller: HTMLElement | null,
    el: HTMLElement | null,
    center = false
): void {
    if (!scroller || !el) return;
    // From the boxes on screen rather than offsetTop, which is measured from
    // whichever ancestor happens to be positioned — the popover, not the list.
    const box = scroller.getBoundingClientRect();
    const top = el.getBoundingClientRect().top - box.top - scroller.clientTop + scroller.scrollTop;
    const bottom = top + el.offsetHeight;
    if (center) {
        scroller.scrollTop = top - (scroller.clientHeight - el.offsetHeight) / 2;
    } else if (top < scroller.scrollTop) {
        scroller.scrollTop = top;
    } else if (bottom > scroller.scrollTop + scroller.clientHeight) {
        scroller.scrollTop = bottom - scroller.clientHeight;
    }
}
