import * as React from "react";

import { cn } from "@/lib/utils";
import { capitalizeNewChar } from "@/lib/textCase";

export interface InputProps extends React.ComponentProps<"input"> {
  /**
   * Opt-in: mekana rečenična kapitalizacija (prvo slovo + nakon .!?).
   * Native `autoCapitalize="sentences"` za mobilne + lagani JS fallback za desktop.
   * Ignorira se za type=email/password/url/tel/number.
   */
  sentenceCase?: boolean;
}

const NO_CAP_TYPES = new Set(["email", "password", "url", "tel", "number"]);

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      type,
      sentenceCase,
      onChange,
      onCompositionStart,
      onCompositionEnd,
      autoCapitalize,
      ...props
    },
    ref,
  ) => {
    const lastCappedIdx = React.useRef<number | null>(null);
    const composingRef = React.useRef(false);
    const prevValueRef = React.useRef<string>(
      typeof props.value === "string"
        ? props.value
        : typeof props.defaultValue === "string"
          ? props.defaultValue
          : "",
    );

    // Kad je controlled i vrijednost se promijeni izvana, sinkroniziraj prevRef.
    React.useEffect(() => {
      if (typeof props.value === "string") prevValueRef.current = props.value;
    }, [props.value]);

    const enabled = !!sentenceCase && !NO_CAP_TYPES.has(type ?? "text");

    const handleChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
      if (!enabled || composingRef.current) {
        prevValueRef.current = e.target.value;
        onChange?.(e);
        return;
      }
      const prev = prevValueRef.current;
      const next = e.target.value;
      const { value, cappedIdx } = capitalizeNewChar(prev, next, lastCappedIdx.current);
      lastCappedIdx.current = cappedIdx;

      if (value !== next) {
        const el = e.target;
        const selStart = el.selectionStart;
        const selEnd = el.selectionEnd;
        el.value = value;
        try {
          if (selStart !== null && selEnd !== null) el.setSelectionRange(selStart, selEnd);
        } catch {
          /* no-op */
        }
      }
      prevValueRef.current = value;
      onChange?.(e);
    };

    const resolvedAutoCap = autoCapitalize ?? (enabled ? "sentences" : undefined);

    return (
      <input
        type={type}
        autoCapitalize={resolvedAutoCap}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background transition-all duration-200 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:border-primary focus-visible:bg-card hover:border-muted-foreground/30 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
        onChange={handleChange}
        onCompositionStart={(e) => {
          composingRef.current = true;
          onCompositionStart?.(e);
        }}
        onCompositionEnd={(e) => {
          composingRef.current = false;
          prevValueRef.current = (e.target as HTMLInputElement).value;
          onCompositionEnd?.(e);
        }}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
