import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

/**
 * VIDLJIVOST U OBA STANJA JE TVRDO PRAVILO — NEOVISNO O TEMI.
 *
 * v0 (nevidljivo): staza `bg-input` + proziran rub, klizač `bg-background`.
 * v1 (i dalje nevidljivo u osobnoj tamnoj temi): staza `bg-muted` + rub
 * `border-border` — oba su AMBIJENTALNI tokeni (u .dark: muted 14% L,
 * border 17% L na pozadini 5% L), pa je razlika matematička, a ne vidljiva.
 *
 * v2: isključena staza i njezin rub izvedeni su iz FOREGROUND tokena
 * (`muted-foreground`), koji je po definiciji na suprotnom kraju ljestvice od
 * pozadine u svakoj temi — u tamnim temama svijetlosiva staza na tamnoj
 * podlozi, u svijetloj tamnosiva na bijeloj. Klizač je `bg-background`, pa je
 * uvijek u suprotnosti sa svojom stazom. Uključeno stanje ostaje `bg-primary`
 * s `primary-foreground` klizačem.
 * Čuvar `src/test/switchVisibility.test.ts` brani povratak ambijentalnih staza.
 */
const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 transition-colors data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=unchecked]:bg-muted-foreground/40 data-[state=unchecked]:border-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-5 w-5 rounded-full shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=checked]:bg-primary-foreground data-[state=unchecked]:translate-x-0 data-[state=unchecked]:bg-background",
      )}
    />


  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
