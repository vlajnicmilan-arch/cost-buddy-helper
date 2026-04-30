/**
 * A11y utilities for click-on-div patterns.
 *
 * When you can't use a real <button> (e.g. nested interactive content,
 * styling constraints, or list items with multiple actions), spread
 * `clickableProps()` onto the <div> to make it keyboard-accessible.
 *
 * Usage:
 *   <div {...clickableProps(handleClick, { label: 'Open transaction' })}>
 *     ...
 *   </div>
 *
 * Adds: role="button", tabIndex=0, aria-label, Enter/Space handler,
 * and focus-visible ring classes.
 */

import type { KeyboardEvent } from 'react';

export interface ClickableOpts {
  /** Accessible label. Required if no visible text inside the element. */
  label?: string;
  /** ARIA role override (default: "button"). Use "checkbox" for toggleable items. */
  role?: 'button' | 'checkbox' | 'link' | 'menuitem' | 'tab' | 'option';
  /** For role="checkbox" — current checked state */
  checked?: boolean;
  /** Disable the interaction */
  disabled?: boolean;
  /** Additional className appended after the focus-ring classes */
  className?: string;
}

const FOCUS_CLASSES =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

/**
 * Returns props to spread onto a non-button element to make it keyboard-accessible.
 * Handles Enter and Space keys, sets role/tabIndex, applies focus-visible ring.
 */
export function clickableProps(
  onClick: (() => void) | ((e: React.MouseEvent | KeyboardEvent) => void),
  opts: ClickableOpts = {},
) {
  const { label, role = 'button', checked, disabled, className } = opts;

  return {
    role,
    tabIndex: disabled ? -1 : 0,
    'aria-label': label,
    'aria-disabled': disabled || undefined,
    'aria-checked': role === 'checkbox' ? checked : undefined,
    onClick: disabled ? undefined : (onClick as React.MouseEventHandler),
    onKeyDown: disabled
      ? undefined
      : (e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            (onClick as (e: KeyboardEvent) => void)(e);
          }
        },
    'data-clickable': '',
    className: className ? `${FOCUS_CLASSES} ${className}` : FOCUS_CLASSES,
  };
}
