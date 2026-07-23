/**
 * Krug list — moji krugovi (owner ili član).
 *
 * Empty state CTA i header CTA otvaraju `CreateKrugDialog`. Po uspjehu
 * roditeljska stranica preuzima i otvara detail screen za novi Krug.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, AlertCircle, Sparkles } from 'lucide-react';
import { KrugBrandIcon } from './KrugBrandIcon';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useMyKrugs } from '@/hooks/useKrug';
import { clickableProps } from '@/lib/a11y';
import { CreateKrugDialog } from './CreateKrugDialog';
import { KrugLifecycleBadge } from './KrugLifecycleBadge';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { useModuleGate } from '@/hooks/useModuleGate';

interface Props {
  onSelect: (krugId: string) => void;
}

export function KrugListScreen({ onSelect }: Props) {
  const { t } = useTranslation();
  const { data: krugs = [], isLoading, isError, refetch } = useMyKrugs();
  const [createOpen, setCreateOpen] = useState(false);
  const { hasModuleAccess } = useFeatureAccess();
  const { requestModule } = useModuleGate();
  const canCreate = hasModuleAccess('krug');

  // Svaki entry (header CTA, empty state CTA) mora ići kroz jedinstveni
  // gate. Za korisnike bez prava — otvori upgrade dijalog, NIKAD ne otvaraj
  // CreateKrugDialog koji bi na submitu bacio sirovu RLS grešku.
  const openCreateOrUpgrade = () => {
    requestModule('krug', { onGranted: () => setCreateOpen(true) });
  };

  return (
    <div className="space-y-3">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-module">{t('krug.title', 'Krug')}</h1>
        {krugs.length > 0 && (
          <Button size="sm" variant="module" onClick={openCreateOrUpgrade}>
            {canCreate ? <Plus className="w-4 h-4 mr-1" /> : <Sparkles className="w-4 h-4 mr-1" />}
            {canCreate
              ? t('krug.create.cta', 'Novi Krug')
              : t('krug.unlockCta', 'Otključaj Krug')}
          </Button>
        )}
      </header>

      {isLoading ? (
        <Card className="p-6 text-sm text-muted-foreground">
          {t('common.loading', 'Učitavanje…')}
        </Card>
      ) : isError ? (
        <Card className="p-6 space-y-3 border-destructive/30">
          <div className="flex items-center gap-2 text-sm font-medium text-destructive">
            <AlertCircle className="w-4 h-4" />
            {t('krug.loadError.title', 'Krug se ne može učitati')}
          </div>
          <p className="text-xs text-muted-foreground">
            {t(
              'krug.loadError.body',
              'Provjeri internetsku vezu i pokušaj ponovo. Ako se ponavlja, javi nam.',
            )}
          </p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            {t('common.retry', 'Pokušaj ponovo')}
          </Button>
        </Card>
      ) : krugs.length === 0 ? (
        <Card className="p-8 text-center space-y-3">
          <KrugBrandIcon size={40} className="mx-auto" />
          <h2 className="font-medium">{t('krug.emptyTitle', 'Još nemaš Krug')}</h2>
          <p className="text-sm text-muted-foreground">
            {t(
              'krug.emptyBody',
              'Krug je tvoj zajednički kontekst s drugima. Pridruži se preko poziva ili otvori novi.',
            )}
          </p>
          <Button variant="module" onClick={openCreateOrUpgrade} className="mt-2">
            {canCreate ? <Plus className="w-4 h-4 mr-1" /> : <Sparkles className="w-4 h-4 mr-1" />}
            {canCreate
              ? t('krug.create.cta', 'Novi Krug')
              : t('krug.unlockCta', 'Otključaj Krug')}
          </Button>
        </Card>
      ) : (
        <div className="space-y-2">
          {krugs.map((k) => (
            <Card
              key={k.id}
              {...clickableProps(() => onSelect(k.id))}
              className="p-4 hover:bg-accent/40 cursor-pointer transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="space-y-1 min-w-0">
                  <div className="font-medium truncate text-[hsl(25_95%_53%)]">{k.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {t(`krug.preset.${k.preset}`, k.preset)}
                  </div>
                </div>
                <KrugLifecycleBadge state={k.lifecycle_state} />
              </div>
            </Card>
          ))}
        </div>
      )}

      <CreateKrugDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => onSelect(id)}
      />
    </div>
  );
}
