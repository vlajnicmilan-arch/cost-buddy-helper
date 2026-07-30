/**
 * Guard against Radix menu "click-through" on touch devices.
 *
 * Radix opens a DropdownMenu on `pointerdown` of the trigger
 * (@radix-ui/react-dropdown-menu Trigger -> onPointerDown -> onOpenToggle).
 * The menu content renders immediately, only `sideOffset` px away from the
 * finger. When the finger lifts, `pointerup` is delivered to whatever element
 * is now under that point — often the first menu item. Radix MenuItem then does:
 *
 *   onPointerUp: if (!isPointerDownRef.current) event.currentTarget?.click()
 *
 * which selects that item even though the user never chose it. On mouse this is
 * the intended press-drag-release behaviour; on touch it silently fires actions.
 *
 * Fix: a menu item may only be activated by a pointer gesture that STARTED
 * inside the menu content. A non-mouse `pointerup` (and its synthetic `click`)
 * that has no matching `pointerdown` inside the content is swallowed.
 */

export const MENU_TOUCH_GUARD_WINDOW_MS = 700;

export interface MenuPointerUpContext {
  /** PointerEvent.pointerType — 'mouse' | 'touch' | 'pen' | '' */
  pointerType: string;
  /** Timestamp (ms) when the menu content mounted / opened. */
  openedAt: number;
  /** Current timestamp (ms). */
  now: number;
  /** Whether a `pointerdown` for this gesture landed inside the menu content. */
  hadPointerDownInside: boolean;
}

/**
 * Returns true when the activation (pointerup or the click itself) must be
 * suppressed because it is a leftover of the gesture that OPENED the menu.
 *
 * `pointerType` must be the pointerType of the LAST pointerdown seen while the
 * menu was open (falling back to the event's own pointerType). Ghost clicks on
 * Android arrive with no pointerup and an empty `pointerType`, so relying on
 * the click event alone is not enough.
 */
export const shouldSuppressMenuActivation = ({
  pointerType,
  openedAt,
  now,
  hadPointerDownInside,
}: MenuPointerUpContext): boolean => {
  if (hadPointerDownInside) return false;
  // Mouse press-drag-release over a menu item stays supported.
  if (pointerType === 'mouse') return false;
  if (!openedAt) return false;
  return now - openedAt < MENU_TOUCH_GUARD_WINDOW_MS;
};

/** @deprecated use shouldSuppressMenuActivation */
export const shouldSuppressMenuPointerUp = shouldSuppressMenuActivation;

