import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { BadgeCheck, Loader2, Trash2 } from 'lucide-react';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { useMailImportAccess } from '@/hooks/useMailImportAccess';
import { useIssuerMemory, type IssuerMemoryEntry } from '@/hooks/useIssuerMemory';
import { formatDateHr } from '@/lib/dateFormat';

/**
 * Settings → „Uvoz iz e-maila" → MOJI IZDAVATELJI.
 *
 * Pravila kojima korisnik upravlja: svaki redak je pamćenje koje je NASTALO
 * njegovom vidljivom potvrdom. Zaborav je jedan dodir — bez skrivenih pravila.
 * Cijeli podekran postoji isključivo uz pravo `mail_uvoz`.
 */
export const MyIssuersSection = () => {
  const { t } = useTranslation();
  const { hasAccess, loading: accessLoading } = useMailImportAccess();
  const { entries, loading, working, forgetEntry } = useIssuerMemory(hasAccess);
  const [pending, setPending] = useState<IssuerMemoryEntry | null>(null);

  if (accessLoading || !hasAccess) return null;

  const handleForget = async () => {
    if (!pending) return;
    const ok = await forgetEntry(pending.id);
    setPending(null);
    if (ok) showSuccess(t('issuers.forgotten', 'Pravilo je obrisano'));
    else showError(t('issuers.forgetFailed', 'Brisanje nije uspjelo'));
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        {t('issuers.title', 'Moji izdavatelji')}
      </h3>

      <p className="text-xs text-muted-foreground">
        {t(
          'issuers.description',
          'Pravila nastala tvojim potvrdama. Sljedeći računi tih izdavatelja stižu popunjeni.',
        )}
      </p>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('common.loading', 'Učitavanje...')}
        </div>
      )}

      {!loading && entries.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {t('issuers.empty', 'Još nema zapamćenih izdavatelja.')}
        </p>
      )}

      <div className="space-y-2">
        {entries.map((e) => (
          <div key={e.id} data-testid="issuer-memory-row" className="rounded-lg border p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {e.supplier_name || t('issuers.unnamed', '(bez naziva)')}
                </p>
                <p className="text-xs text-muted-foreground font-mono">{e.supplier_oib || '—'}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="min-h-[44px] min-w-[44px] shrink-0"
                aria-label={t('issuers.forget', 'Zaboravi')}
                disabled={working}
                onClick={() => setPending(e)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1">
                <BadgeCheck className="h-3 w-3" />
                {t('issuers.confirmedCount', 'Potvrđen {{count}}×', { count: e.confirmed_count })}
              </Badge>
              {e.place_label && <Badge variant="outline">{e.place_label}</Badge>}
              {e.known_ibans.length > 0 && (
                <Badge variant="outline" className="font-mono text-[10px]">
                  {e.known_ibans.join(' · ')}
                </Badge>
              )}
            </div>

            <p className="text-[11px] text-muted-foreground">
              {t('issuers.lastSeen', 'Zadnji put viđen')}: {formatDateHr(e.last_seen_at) || '—'}
            </p>
          </div>
        ))}
      </div>

      <AlertDialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('issuers.forgetTitle', 'Zaboraviti izdavatelja?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'issuers.forgetWarning',
                'Novi računi tog izdavatelja više neće stizati popunjeni. Postojeći dokumenti ostaju netaknuti.',
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Odustani')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleForget}>
              {t('issuers.forget', 'Zaboravi')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
