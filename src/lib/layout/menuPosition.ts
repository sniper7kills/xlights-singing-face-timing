/** The space between a menu, its anchor and the window edge, in pixels. */
export const MENU_GAP_PX = 4

/** The box of the anchor of a menu in the window, in pixels. */
export type AnchorBox = { top: number; bottom: number; left: number; right: number }

/** A width and a height in pixels. */
export type Size = { width: number; height: number }

/**
 * Returns the start of a menu on one axis.
 * The menu goes after the anchor when it fits, else before the anchor when it fits.
 * Else the menu stays inside the window, at the window edge.
 */
function place(after: number, before: number, size: number, view: number): number {
  const last = view - size - MENU_GAP_PX
  if (after <= last) return after
  if (before >= MENU_GAP_PX) return before
  return Math.max(MENU_GAP_PX, last)
}

/**
 * Returns the window position of a menu, so that each menu of the editor follows one rule.
 * The rules:
 * - The menu opens below the anchor, with its left edge at the left edge of the anchor.
 * - With no room on the right, the right edge of the menu goes to the right edge of the anchor.
 * - With no room below, the menu opens above the anchor.
 * - With no room on either side, the menu touches the window edge, and it never leaves the window.
 *   A menu taller than the window starts at the top edge.
 * @param anchor The box of the button or the row that opens the menu.
 * @param size The width and the height of the menu.
 * @param view The width and the height of the window.
 */
export function menuPosition(
  anchor: AnchorBox,
  size: Size,
  view: Size,
): { top: number; left: number } {
  return {
    top: place(
      anchor.bottom + MENU_GAP_PX,
      anchor.top - size.height - MENU_GAP_PX,
      size.height,
      view.height,
    ),
    left: place(anchor.left, anchor.right - size.width, size.width, view.width),
  }
}
