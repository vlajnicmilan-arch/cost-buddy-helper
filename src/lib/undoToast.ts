import { toast } from 'sonner';

interface UndoToastOptions {
  message: string;
  undoLabel: string;
  onUndo: () => void | Promise<void>;
  duration?: number;
}

/**
 * Prikazuje toast s UNDO gumbom (default 10s) nakon soft delete-a.
 * Koristi se SAMO na glavnim listama (Dashboard, Wallet, Projects, Invoices, Estimates).
 *
 * `action` se renderira kao JSX node (umjesto sonner default {label,onClick}) da
 * E2E testovi mogu pronaći `data-testid="undo-toast-button"` element.
 */
export function showUndoToast({ message, undoLabel, onUndo, duration = 10000 }: UndoToastOptions): void {
  const id = toast(message, {
    duration,
    action: (
      <button
        type="button"
        data-testid="undo-toast-button"
        onClick={() => {
          Promise.resolve(onUndo()).catch((e) => console.error('[UndoToast] onUndo failed:', e));
          toast.dismiss(id);
        }}
        className="rounded-md bg-foreground/10 px-2.5 py-1 text-xs font-medium text-foreground hover:bg-foreground/20"
      >
        {undoLabel}
      </button>
    ),
  });
}
