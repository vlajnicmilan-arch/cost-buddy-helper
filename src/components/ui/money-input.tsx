import * as React from 'react';
import { Input } from '@/components/ui/input';
import { sanitizeMoneyKeystroke } from '@/lib/money';

/**
 * Drop-in replacement for `<Input type="number">` on money fields.
 *
 * Behaviour:
 *   - Renders as `<input type="text" inputMode="decimal">` so mobile keyboards
 *     still show the numeric pad, but users can freely type either `,` or `.`
 *     as the decimal separator (Croatian users overwhelmingly use `,`).
 *   - Sanitises keystrokes to `[0-9 , . -]` with at most one leading minus.
 *   - Never mutates or parses the value itself — callers keep the raw string
 *     in local state and parse it with `parseLocaleAmount` / `parseMoneyStrict`
 *     on submit. This preserves the exact semantics of the previous fields.
 *
 * Do NOT set `type` — the component enforces text mode. `min`, `max`, `step`
 * are ignored (they were UX hints on native number inputs); enforce ranges in
 * your submit validator instead.
 */
export interface MoneyInputProps
  extends Omit<React.ComponentProps<'input'>, 'type' | 'onChange' | 'value'> {
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  allowNegative?: boolean;
}

export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ value, onChange, allowNegative = false, inputMode, ...rest }, ref) => {
    const handleChange = React.useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value;
        let sanitized = sanitizeMoneyKeystroke(raw);
        if (!allowNegative) sanitized = sanitized.replace(/-/g, '');
        if (sanitized !== raw) {
          // Rewrite the event value so downstream setState gets the sanitized string.
          e.target.value = sanitized;
        }
        onChange(e);
      },
      [onChange, allowNegative],
    );

    return (
      <Input
        {...rest}
        ref={ref}
        type="text"
        inputMode={inputMode ?? 'decimal'}
        autoComplete="off"
        value={value}
        onChange={handleChange}
      />
    );
  },
);
MoneyInput.displayName = 'MoneyInput';
