/**
 * KrugSharedSourcesSection — attach/detach UI za zajedničke izvore plaćanja.
 *
 * Backend pravila (strogo se reflektiraju, ne dupliciraju):
 * - RLS `krug_sps_select_member` → svi članovi vide listu (read-only).
 * - RLS `krug_sps_insert_owner_and_source_owner` + `krug_can_manage_shared_source`
 *   → samo owner kruga može linkati, i to samo izvore koje on posjeduje
 *   (custom: → mora biti owner payment source-a; built-in slug → owner kruga je dovoljan).
 * - RLS `krug_sps_delete_owner_and_source_owner` → ista pravila za detach.
 *
 * Klijent pokazuje attach/detach akcije samo za owner kruga; ako backend odbije
 * (npr. izvor nije u njegovom vlasništvu), greška se prikazuje kao showError.
 *
 * Custom payment sources nudimo iz `useCustomPaymentSources` (filter: user.id === owner)
 * — to su jedini koje owner može honestly attachati. Built-in slugove izostavljamo
 * iz UI-a u v1; backend ih i dalje dopušta ako se ručno proslijede.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CreditCard, Trash2, Loader2 } from 'lucide-react';
import { useKrugSharedPaymentSources } from '@/hooks/useKrugSharedPaymentSources';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import { useAuth } from '@/hooks/useAuth';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { useModuleGate } from '@/hooks/useModuleGate';

interface Props {
  krugId: string;
  /** Owner kruga — ima pun administratorski pristup shared-source layeru. */
  isOwner: boolean;
  /** Punopravni član (uključivo owner) — smije dijeliti svoj vlastiti izvor
   *  i ukloniti linkove koje je sam postavio. Ordinary članovi ne smiju ništa. */
  isFullMember: boolean;
}

export function KrugSharedSourcesSection({ krugId, isOwner, isFullMember }: Props) {

  const { t } = useTranslation();
  const { requestModule } = useModuleGate();
  const { user } = useAuth();
  const {
    data: linked = [],
    displayById,
    linkPaymentSource,
    unlinkPaymentSource,
    isLinking,
    isUnlinking,
  } = useKrugSharedPaymentSources(krugId);
  const { customPaymentSources } = useCustomPaymentSources();

  // Attachable sources = own custom sources not yet linked.
  // Vidljivo samo full memberima (owner ili punopravni); RLS bi ionako odbio insert.
  const linkedIds = useMemo(() => new Set(linked.map((l) => l.payment_source_id)), [linked]);
  const attachable = useMemo(() => {
    if (!isFullMember || !user) return [];
    return (customPaymentSources ?? [])
      .filter((s: any) => s.user_id === user.id)
      .map((s: any) => ({ id: `custom:${s.id}`, name: s.name as string, currency: s.currency as string | undefined }))
      .filter((s) => !linkedIds.has(s.id));
  }, [customPaymentSources, isFullMember, linkedIds, user]);


  // Lookup preferira server-side display resolver (radi i za non-owner članove
  // koji nemaju SELECT na custom_payment_sources), a padne na lokalnu listu
  // vlastitih izvora tek ako RPC još nije stigao.
  const localNameById = useMemo(() => {
    const map = new Map<string, { name: string; currency?: string }>();
    for (const s of customPaymentSources ?? []) {
      map.set(`custom:${(s as any).id}`, { name: (s as any).name, currency: (s as any).currency });
    }
    return map;
  }, [customPaymentSources]);

  const resolveLabel = (paymentSourceId: string): { label: string; currency?: string } => {
    if (paymentSourceId.startsWith('custom:')) {
      const server = displayById.get(paymentSourceId);
      if (server?.name) return { label: server.name, currency: server.currency ?? undefined };
      const local = localNameById.get(paymentSourceId);
      if (local?.name) return { label: local.name, currency: local.currency };
      const tail = paymentSourceId.slice(7, 13);
      return { label: `${t('krug.sharedSource.unknown', 'Izvor')} · ${tail}` };
    }
    // Built-in slug (npr. `cash`, `bank_account`) — pokušaj i18n preko `paymentSources.<slug>`.
    const slugKey = `paymentSources.${paymentSourceId}`;
    const translated = t(slugKey, { defaultValue: '' });
    if (translated && translated !== slugKey) return { label: translated };
    return { label: paymentSourceId };
  };


  const performAttach = async (id: string) => {
    if (!id) return;
    try {
      await linkPaymentSource(id);
      showSuccess(t('krug.sharedSource.attach.success', 'Izvor povezan s Krugom'));
    } catch (e: any) {
      // Backend već odbija nedopuštene slučajeve (RLS / not owner / not source owner).
      showError(
        e?.message?.includes('row-level security')
          ? t('krug.sharedSource.attach.denied', 'Možeš povezati samo izvor koji posjeduješ.')
          : t('krug.sharedSource.attach.error', 'Povezivanje izvora nije uspjelo'),
      );
    }
  };

  const handleAttach = (id: string) => {
    requestModule('krug', { onGranted: () => void performAttach(id) });
  };

  const performDetach = async (rowId: string) => {
    const ok = window.confirm(t('krug.sharedSource.detach.confirm', 'Odvojiti izvor od Kruga?'));
    if (!ok) return;
    try {
      await unlinkPaymentSource(rowId);
      showSuccess(t('krug.sharedSource.detach.success', 'Izvor odvojen'));
    } catch (e: any) {
      showError(
        e?.message?.includes('row-level security')
          ? t('krug.sharedSource.detach.denied', 'Nemaš ovlasti odvojiti ovaj izvor.')
          : t('krug.sharedSource.detach.error', 'Odvajanje nije uspjelo'),
      );
    }
  };

  const handleDetach = (rowId: string) => {
    requestModule('krug', { onGranted: () => void performDetach(rowId) });
  };

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium flex items-center gap-2 text-module-muted">
        <CreditCard className="w-4 h-4 text-module-muted" />
        {t('krug.sharedSources', 'Zajednički izvori')}
        <span className="text-xs text-muted-foreground">({linked.length})</span>
      </h3>

      {isFullMember && (
        <div className="flex items-center gap-2">
          <Select
            value=""
            onValueChange={handleAttach}
            disabled={isLinking || attachable.length === 0}
          >
            <SelectTrigger className="h-9">
              <SelectValue
                placeholder={
                  attachable.length === 0
                    ? t('krug.sharedSource.attach.empty', 'Nemaš dostupnih izvora za povezivanje')
                    : t('krug.sharedSource.attach.placeholder', 'Poveži izvor plaćanja…')
                }
              />
            </SelectTrigger>
            <SelectContent>
              {attachable.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                  {s.currency ? ` · ${s.currency}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isLinking && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />}
        </div>
      )}


      {linked.length === 0 ? (
        <Card className="p-4 text-xs text-muted-foreground">
          {t('krug.noSharedSources', 'Nema povezanih izvora plaćanja.')}
        </Card>
      ) : (
        <Card className="divide-y divide-border">
          {linked.map((s) => {
            const { label, currency } = resolveLabel(s.payment_source_id);
            return (
              <div key={s.id} className="px-4 py-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm truncate">{label}</div>
                  {currency && (
                    <div className="text-[10px] text-muted-foreground">{currency}</div>
                  )}
                </div>
                {(isOwner || (user && s.linked_by === user.id)) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                    disabled={isUnlinking}
                    onClick={() => handleDetach(s.id)}
                    aria-label={t('krug.sharedSource.detach.cta', 'Odvoji izvor')}
                  >
                    {isUnlinking ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </Button>
                )}

              </div>
            );
          })}
        </Card>
      )}
    </section>
  );
}
