import * as React from "react";

import { cn } from "@/lib/utils";
import { capitalizeNewChar } from "@/lib/textCase";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /**
   * Opt-in: mekana rečenična kapitalizacija (prvo slovo + nakon .!?).
   * Native `autoCapitalize="sentences"` za mobilne + lagani JS fallback za desktop.
   */
  sentenceCase?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      className,
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

    React.useEffect(() => {
      if (typeof props.value === "string") prevValueRef.current = props.value;
    }, [props.value]);

    const enabled = !!sentenceCase;

    const handleChange: React.ChangeEventHandler<HTMLTextAreaElement> = (e) => {
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
      <textarea
        autoCapitalize={resolvedAutoCap}
        className={cn(
          "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
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
          prevValueRef.current = (e.target as HTMLTextAreaElement).value;
          onCompositionEnd?.(e);
        }}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
