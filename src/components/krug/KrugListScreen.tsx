/**
 * Krug list — moji krugovi (owner ili član).
 *
 * Empty state CTA i header CTA otvaraju `CreateKrugDialog`. Po uspjehu
 * roditeljska stranica preuzima i otvara detail screen za novi Krug.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Circle, Plus, AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useMyKrugs } from '@/hooks/useKrug';
import { clickableProps } from '@/lib/a11y';
import { CreateKrugDialog } from './CreateKrugDialog';
import { KrugLifecycleBadge } from './KrugLifecycleBadge';

interface Props {
  onSelect: (krugId: string) => void;
}

export function KrugListScreen({ onSelect }: Props) {
  const { t } = useTranslation();
  const { data: krugs = [], isLoading } = useMyKrugs();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="space-y-3">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t('krug.title', 'Krug')}</h1>
        {krugs.length > 0 && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-1" />
            {t('krug.create.cta', 'Novi Krug')}
          </Button>
        )}
      </header>

      {isLoading ? (
        <Card className="p-6 text-sm text-muted-foreground">
          {t('common.loading', 'Učitavanje…')}
        </Card>
      ) : krugs.length === 0 ? (
        <Card className="p-8 text-center space-y-3">
          <Circle className="w-10 h-10 mx-auto text-muted-foreground" strokeWidth={1.5} />
          <h2 className="font-medium">{t('krug.emptyTitle', 'Još nemaš Krug')}</h2>
          <p className="text-sm text-muted-foreground">
            {t(
              'krug.emptyBody',
              'Krug je tvoj zajednički kontekst s drugima. Pridruži se preko poziva ili otvori novi.',
            )}
          </p>
          <Button onClick={() => setCreateOpen(true)} className="mt-2">
            <Plus className="w-4 h-4 mr-1" />
            {t('krug.create.cta', 'Novi Krug')}
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
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="font-medium">{k.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {t(`krug.preset.${k.preset}`, k.preset)}
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px] uppercase">
                  {t(`krug.lifecycle.${k.lifecycle_state}`, k.lifecycle_state)}
                </Badge>
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
