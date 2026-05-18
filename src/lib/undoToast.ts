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
 */
export function showUndoToast({ message, undoLabel, onUndo, duration = 10000 }: UndoToastOptions): void {
  toast(message, {
    duration,
    action: {
      label: undoLabel,
      onClick: () => {
        Promise.resolve(onUndo()).catch((e) => console.error('[UndoToast] onUndo failed:', e));
      },
    },
  });
}
