import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Trash2, RotateCcw, AlertTriangle, Loader2, FileText, FolderKanban, Receipt, FileCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { listTrash, restoreTrashItem, restoreExpenseFull, purgeTrashItem, type TrashItem, type TrashEntity } from '@/lib/softDelete';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { hr, enUS, de } from 'date-fns/locale';

const ICON_BY_ENTITY: Record<TrashEntity, typeof FileText> = {
  expense: Receipt,
  project: FolderKanban,
  invoice: FileText,
  estimate: FileCheck,
};

export default function Trash() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const dateLocale = i18n.language === 'hr' ? hr : i18n.language === 'de' ? de : enUS;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listTrash();
      setItems(data);
    } catch (e: any) {
      toast({ title: t('common.error', 'Greška'), description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [t, toast]);

  useEffect(() => { load(); }, [load]);

  const grouped = useMemo(() => {
    const g: Record<TrashEntity, TrashItem[]> = { expense: [], project: [], invoice: [], estimate: [] };
    items.forEach((it) => { g[it.entity_type].push(it); });
    return g;
  }, [items]);

  const handleRestore = async (item: TrashItem) => {
    setBusyId(item.id);
    try {
      if (item.entity_type === 'expense') {
        await restoreExpenseFull(item.id);
      } else {
        await restoreTrashItem(item.entity_type, item.id);
      }
      toast({ title: t('trash.restored', 'Vraćeno') });
      await load();
    } catch (e: any) {
      toast({ title: t('common.error', 'Greška'), description: e.message, variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const handlePurge = async (item: TrashItem) => {
    setBusyId(item.id);
    try {
      await purgeTrashItem(item.entity_type, item.id);
      toast({ title: t('trash.purged', 'Trajno obrisano') });
      await load();
    } catch (e: any) {
      toast({ title: t('common.error', 'Greška'), description: e.message, variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const groupLabels: Record<TrashEntity, string> = {
    expense: t('trash.groups.expense', 'Transakcije'),
    project: t('trash.groups.project', 'Projekti'),
    invoice: t('trash.groups.invoice', 'Fakture'),
    estimate: t('trash.groups.estimate', 'Ponude'),
  };

  return (
    <div className="min-h-dvh bg-background pb-20">
      <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label={t('common.back', 'Natrag')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Trash2 className="w-6 h-6 text-primary" />
              {t('trash.title', 'Koš za smeće')}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t('trash.autoPurgeInfo', 'Stavke se automatski trajno brišu nakon 30 dana.')}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Trash2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>{t('trash.empty', 'Koš je prazan')}</p>
          </div>
        ) : (
          <div className="space-y-6">
            {(Object.keys(grouped) as TrashEntity[]).map((entity) => {
              const list = grouped[entity];
              if (list.length === 0) return null;
              const Icon = ICON_BY_ENTITY[entity];
              return (
                <section key={entity}>
                  <h2 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                    <Icon className="w-4 h-4" />
                    {groupLabels[entity]} ({list.length})
                  </h2>
                  <div className="space-y-2">
                    {list.map((item) => (
                      <div key={`${item.entity_type}:${item.id}`} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{item.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {t('trash.deletedAgo', 'Obrisano')}{' '}
                            {formatDistanceToNow(new Date(item.deleted_at), { addSuffix: true, locale: dateLocale })}
                            {item.deleter_name && ` · ${item.deleter_name}`}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRestore(item)}
                          disabled={busyId === item.id}
                          className="gap-1.5"
                        >
                          <RotateCcw className="w-4 h-4" />
                          {t('trash.restore', 'Vrati')}
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" disabled={busyId === item.id} aria-label={t('trash.purge', 'Obriši trajno')}>
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle className="flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5 text-destructive" />
                                {t('trash.purgeConfirmTitle', 'Trajno obrisati?')}
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                {t('trash.purgeConfirmDesc', 'Ova radnja se ne može poništiti.')}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{t('common.cancel', 'Odustani')}</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => handlePurge(item)}
                              >
                                {t('trash.purge', 'Obriši trajno')}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
