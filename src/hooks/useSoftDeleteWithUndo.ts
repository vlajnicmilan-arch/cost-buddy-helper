import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { showUndoToast } from '@/lib/undoToast';
import { restoreTrashItem, type TrashEntity } from '@/lib/softDelete';

interface UseSoftDeleteWithUndoOptions {
  onRestored?: () => void;
}

/**
 * Wrappa postojeću delete akciju u sekvencu:
 * 1) izvrši delete (soft delete via postojeći hook)
 * 2) prikaži UNDO toast (10s) — klik na Undo zove restore_trash_item RPC
 *
 * Koristi se isključivo na glavnim listama (Dashboard, Wallet, Projects,
 * Invoices, Estimates). Ostala mjesta brisanja pozivaju delete direktno.
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
            await restoreTrashItem(entity, id);
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
