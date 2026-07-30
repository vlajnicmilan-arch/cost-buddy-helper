import * as React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Check, ChevronRight, Circle } from "lucide-react";

import { cn } from "@/lib/utils";
import { shouldSuppressMenuActivation } from "@/lib/menuTouchGuard";


interface MenuOpenState {
  /** Timestamp of the last real open (onOpenChange(true)), NOT of content mount. */
  openedAtRef: React.MutableRefObject<number>;
  /** pointerType of the last pointerdown seen anywhere in the document. */
  lastPointerTypeRef: React.MutableRefObject<string>;
}

const MenuOpenContext = React.createContext<MenuOpenState | null>(null);

/**
 * Blocks the pointerup/click that belongs to the gesture which OPENED the menu
 * (Radix opens on pointerdown, so on touch the finger lifts over a menu item).
 * See src/lib/menuTouchGuard.ts for the full rationale.
 */
const useMenuTouchGuard = () => {
  const rootState = React.useContext(MenuOpenContext);
  const fallbackOpenedAtRef = React.useRef(0);
  const fallbackPointerTypeRef = React.useRef('');
  const openedAtRef = rootState?.openedAtRef ?? fallbackOpenedAtRef;
  const lastPointerTypeRef = rootState?.lastPointerTypeRef ?? fallbackPointerTypeRef;
  const hadPointerDownInsideRef = React.useRef(false);
  const suppressNextClickRef = React.useRef(false);
  const lastPointerUpRef = React.useRef<{ type: string; at: number }>({ type: '', at: 0 });

  React.useEffect(() => {
    // Content mount is NOT the open anchor anymore (content is recycled on some
    // devices); it only resets per-gesture state.
    if (!rootState) fallbackOpenedAtRef.current = Date.now();
    hadPointerDownInsideRef.current = false;
    suppressNextClickRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const onPointerDownCapture = React.useCallback((event: React.PointerEvent) => {
    // TEMPORARY — REMOVE AFTER BUG DIAGNOSIS
    if (MENU_DEBUG_ENABLED) {
      const now = Date.now();
      logMenuDebug('pointer_down_capture', {
        event_type: event.type,
        pointer_type: event.pointerType,
        opened_delta_ms: now - openedAtRef.current,
        had_pointer_down_inside: hadPointerDownInsideRef.current,
        suppress: false,
        target: describeMenuEventTarget(event.target),
      });
    }
    hadPointerDownInsideRef.current = true;
  }, [openedAtRef]);

  const onPointerUpCapture = React.useCallback((event: React.PointerEvent) => {
    const now = Date.now();
    lastPointerUpRef.current = { type: event.pointerType, at: now };
    const suppress = shouldSuppressMenuActivation({
      pointerType: lastPointerTypeRef.current || event.pointerType,
      openedAt: openedAtRef.current,
      now,
      hadPointerDownInside: hadPointerDownInsideRef.current,
    });
    // TEMPORARY — REMOVE AFTER BUG DIAGNOSIS
    if (MENU_DEBUG_ENABLED) {
      logMenuDebug('pointer_up_capture', {
        event_type: event.type,
        pointer_type: event.pointerType,
        last_pointer_type: lastPointerTypeRef.current,
        opened_delta_ms: now - openedAtRef.current,
        had_pointer_down_inside: hadPointerDownInsideRef.current,
        suppress,
        target: describeMenuEventTarget(event.target),
      });
    }
    // `hadPointerDownInside` is consumed by the click gate, not here — the
    // click of a deliberate tap must still see that the gesture started inside.
    if (!suppress) return;

    suppressNextClickRef.current = true;
    event.preventDefault();
    event.stopPropagation();
  }, [lastPointerTypeRef, openedAtRef]);

  const onClickCapture = React.useCallback((event: React.MouseEvent) => {
    const now = Date.now();
    const nativePointerType = (event.nativeEvent as PointerEvent).pointerType ?? '';
    // Ghost clicks arrive with NO preceding pointerup on the content, so the
    // click gate must evaluate the guard itself.
    const suppress = suppressNextClickRef.current || shouldSuppressMenuActivation({
      pointerType: lastPointerTypeRef.current || nativePointerType,
      openedAt: openedAtRef.current,
      now,
      hadPointerDownInside: hadPointerDownInsideRef.current,
      lastPointerUpType: lastPointerUpRef.current.type,
      lastPointerUpAt: lastPointerUpRef.current.at,
    });
    // TEMPORARY — REMOVE AFTER BUG DIAGNOSIS
    if (MENU_DEBUG_ENABLED) {
      logMenuDebug('click_capture', {
        event_type: event.type,
        pointer_type: nativePointerType,
        last_pointer_type: lastPointerTypeRef.current,
        opened_at_ms: openedAtRef.current,
        opened_at_source: rootState ? 'root_open_change' : 'content_mount_fallback',
        opened_delta_ms: now - openedAtRef.current,
        had_pointer_down_inside: hadPointerDownInsideRef.current,
        suppress_next_click: suppressNextClickRef.current,
        suppress,
        target: describeMenuEventTarget(event.target),
      });
    }
    suppressNextClickRef.current = false;
    hadPointerDownInsideRef.current = false;
    lastPointerUpRef.current = { type: '', at: 0 };
    if (!suppress) return;
    event.preventDefault();
    event.stopPropagation();
  }, [lastPointerTypeRef, openedAtRef, rootState]);

  return { onPointerDownCapture, onPointerUpCapture, onClickCapture };
};

const DropdownMenu = ({
  onOpenChange,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Root>) => {
  const openedAtRef = React.useRef(0);
  const lastPointerTypeRef = React.useRef('');

  React.useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      lastPointerTypeRef.current = event.pointerType;
    };
    window.addEventListener('pointerdown', handlePointerDown, true);
    return () => window.removeEventListener('pointerdown', handlePointerDown, true);
  }, []);

  const handleOpenChange = React.useCallback((open: boolean) => {
    if (open) openedAtRef.current = Date.now();
    // TEMPORARY — REMOVE AFTER BUG DIAGNOSIS
    if (MENU_DEBUG_ENABLED) {
      logMenuDebug('root_open_change', {
        open,
        opened_at_ms: openedAtRef.current,
        last_pointer_type: lastPointerTypeRef.current,
      });
    }
    // Compose with the consumer handler — never swallow it.
    onOpenChange?.(open);
  }, [onOpenChange]);

  const value = React.useMemo<MenuOpenState>(
    () => ({ openedAtRef, lastPointerTypeRef }),
    [],
  );

  return (
    <MenuOpenContext.Provider value={value}>
      <DropdownMenuPrimitive.Root {...props} onOpenChange={handleOpenChange} />
    </MenuOpenContext.Provider>
  );
};
DropdownMenu.displayName = "DropdownMenu";

const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;


const DropdownMenuGroup = DropdownMenuPrimitive.Group;

const DropdownMenuPortal = DropdownMenuPrimitive.Portal;

const DropdownMenuSub = DropdownMenuPrimitive.Sub;

const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

const DropdownMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger> & {
    inset?: boolean;
  }
>(({ className, inset, children, ...props }, ref) => (
  <DropdownMenuPrimitive.SubTrigger
    ref={ref}
    className={cn(
      "flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[state=open]:bg-accent focus:bg-accent",
      inset && "pl-8",
      className,
    )}
    {...props}
  >
    {children}
    <ChevronRight className="ml-auto h-4 w-4" />
  </DropdownMenuPrimitive.SubTrigger>
));
DropdownMenuSubTrigger.displayName = DropdownMenuPrimitive.SubTrigger.displayName;

const DropdownMenuSubContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>
>(({ className, ...props }, ref) => {
  const touchGuard = useMenuTouchGuard();
  return (
    <DropdownMenuPrimitive.SubContent
      ref={ref}
      className={cn(
        "z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className,
      )}
      {...props}
      {...touchGuard}
    />
  );
});
DropdownMenuSubContent.displayName = DropdownMenuPrimitive.SubContent.displayName;

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => {
  const touchGuard = useMenuTouchGuard();
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          className,
        )}
        {...props}
        {...touchGuard}
      />
    </DropdownMenuPrimitive.Portal>
  );
});

DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;

const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    inset?: boolean;
  }
>(({ className, inset, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50 focus:bg-accent focus:text-accent-foreground",
      inset && "pl-8",
      className,
    )}
    {...props}
  />
));
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;

const DropdownMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
  <DropdownMenuPrimitive.CheckboxItem
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50 focus:bg-accent focus:text-accent-foreground",
      className,
    )}
    checked={checked}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.CheckboxItem>
));
DropdownMenuCheckboxItem.displayName = DropdownMenuPrimitive.CheckboxItem.displayName;

const DropdownMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => (
  <DropdownMenuPrimitive.RadioItem
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50 focus:bg-accent focus:text-accent-foreground",
      className,
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <Circle className="h-2 w-2 fill-current" />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.RadioItem>
));
DropdownMenuRadioItem.displayName = DropdownMenuPrimitive.RadioItem.displayName;

const DropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> & {
    inset?: boolean;
  }
>(({ className, inset, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={cn("px-2 py-1.5 text-sm font-semibold", inset && "pl-8", className)}
    {...props}
  />
));
DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName;

const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator ref={ref} className={cn("-mx-1 my-1 h-px bg-muted", className)} {...props} />
));
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName;

const DropdownMenuShortcut = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => {
  return <span className={cn("ml-auto text-xs tracking-widest opacity-60", className)} {...props} />;
};
DropdownMenuShortcut.displayName = "DropdownMenuShortcut";

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
};
