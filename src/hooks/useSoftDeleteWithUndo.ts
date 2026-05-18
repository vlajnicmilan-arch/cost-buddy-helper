import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { showUndoToast } from '@/lib/undoToast';
import { restoreTrashItem, restoreExpenseFull, type TrashEntity } from '@/lib/softDelete';

interface UseSoftDeleteWithUndoOptions {
  onRestored?: () => void;
}

/**
 * Wrappa soft-delete akciju u UNDO toast (10s).
 * Za 'expense' entitet automatski pri restore reaplicira balance side-effect.
 * Koristi se isključivo na glavnim listama (Dashboard, Wallet, Projects, Invoices, Estimates).
 */
export function useSoftDeleteWithUndo(opts?: UseSoftDeleteWithUndoOptions) {
  const { t } = useTranslation();

  return useCallback(
    async <T,>(
      deleteFn: () => Promise<T>,
      entity: TrashEntity,
      id: string
    ): Promise<T> => {
      const result = await deleteFn();
      showUndoToast({
        message: t('trash.undoToast.message', 'Premješteno u koš'),
        undoLabel: t('trash.undoToast.undo', 'Poništi'),
        onUndo: async () => {
          try {
            if (entity === 'expense') {
              await restoreExpenseFull(id);
            } else {
              await restoreTrashItem(entity, id);
            }
            opts?.onRestored?.();
          } catch (e) {
            console.error('[useSoftDeleteWithUndo] restore failed:', e);
          }
        },
      });
      return result;
    },
    [t, opts]
  );
}
