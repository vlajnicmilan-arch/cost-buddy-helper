/**
 * Krug detail — članovi, shared payment sources.
 *
 * V1 skeleton: read-only prikaz. Akcije iznad krug-konteksta (privacy/A-akti)
 * žive na samoj transakciji u TransactionDetailDialog kad bude wirean.
 */
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Crown, User, Users, CreditCard } from 'lucide-react';
import { useKrug, useKrugMembers } from '@/hooks/useKrug';
import { useKrugSharedPaymentSources } from '@/hooks/useKrugSharedPaymentSources';

interface Props {
  krugId: string;
}

export function KrugDetailScreen({ krugId }: Props) {
  const { t } = useTranslation();
  const { data: detail, isLoading } = useKrug(krugId);
  const { data: members = [] } = useKrugMembers(krugId);
  const { data: sharedSources = [] } = useKrugSharedPaymentSources(krugId);

  if (isLoading) {
    return <Card className="p-6 text-sm text-muted-foreground">{t('common.loading', 'Učitavanje…')}</Card>;
  }
  if (!detail) {
    return <Card className="p-6 text-sm text-muted-foreground">{t('krug.notFound', 'Krug ne postoji.')}</Card>;
  }

  const { krug } = detail;

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{krug.name}</h2>
            <p className="text-xs text-muted-foreground">
              {t(`krug.preset.${krug.preset}`, krug.preset)}
            </p>
          </div>
          <Badge variant="outline" className="text-[10px] uppercase">
            {t(`krug.lifecycle.${krug.lifecycle_state}`, krug.lifecycle_state)}
          </Badge>
        </div>
      </Card>

      <section className="space-y-2">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Users className="w-4 h-4" />
          {t('krug.members', 'Članovi')}
          <span className="text-xs text-muted-foreground">({members.length})</span>
        </h3>
        <Card className="divide-y divide-border">
          {members.map((m) => (
            <div key={`${m.user_id}-${m.kind}`} className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                {m.kind === 'owner' ? (
                  <Crown className="w-4 h-4 text-primary" />
                ) : (
                  <User className="w-4 h-4 text-muted-foreground" />
                )}
                <span className="font-mono text-xs text-muted-foreground">
                  {m.user_id.slice(0, 8)}…
                </span>
              </div>
              <Badge variant={m.kind === 'owner' ? 'default' : 'secondary'} className="text-[10px]">
                {t(`krug.role.${m.kind}`, m.kind)}
              </Badge>
            </div>
          ))}
        </Card>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <CreditCard className="w-4 h-4" />
          {t('krug.sharedSources', 'Zajednički izvori')}
          <span className="text-xs text-muted-foreground">({sharedSources.length})</span>
        </h3>
        {sharedSources.length === 0 ? (
          <Card className="p-4 text-xs text-muted-foreground">
            {t('krug.noSharedSources', 'Nema povezanih izvora plaćanja.')}
          </Card>
        ) : (
          <Card className="divide-y divide-border">
            {sharedSources.map((s) => (
              <div key={s.id} className="px-4 py-3 text-sm font-mono text-muted-foreground">
                {s.payment_source_id}
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
