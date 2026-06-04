/**
 * Krug list — moji krugovi (owner ili član).
 *
 * Skeleton: prazan state s tipiziranim CTA-em koji NE kreira preset (Wave 2).
 */
import { useTranslation } from 'react-i18next';
import { Circle, Plus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useMyKrugs } from '@/hooks/useKrug';
import { clickableProps } from '@/lib/a11y';
import { showSuccess } from '@/hooks/useStatusFeedback';

interface Props {
  onSelect: (krugId: string) => void;
}

export function KrugListScreen({ onSelect }: Props) {
  const { t } = useTranslation();
  const { data: krugs = [], isLoading } = useMyKrugs();

  const handleCreate = () => {
    // Wave 2: preset wizard. Za sada ne uvodimo novu product odluku iz UI sloja.
    showSuccess(t('krug.createSoon', 'Kreiranje Kruga uskoro'));
  };

  return (
    <div className="space-y-3">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t('krug.title', 'Krug')}</h1>
        <Button size="sm" onClick={handleCreate}>
          <Plus className="w-4 h-4 mr-1" />
          {t('krug.create', 'Novi krug')}
        </Button>
      </header>

      {isLoading ? (
        <Card className="p-6 text-sm text-muted-foreground">
          {t('common.loading', 'Učitavanje…')}
        </Card>
      ) : krugs.length === 0 ? (
        <Card className="p-8 text-center space-y-2">
          <Circle className="w-10 h-10 mx-auto text-muted-foreground" strokeWidth={1.5} />
          <h2 className="font-medium">{t('krug.emptyTitle', 'Još nemaš Krug')}</h2>
          <p className="text-sm text-muted-foreground">
            {t(
              'krug.emptyBody',
              'Krug je tvoj zajednički kontekst s drugima. Pridruži se preko poziva ili otvori novi.',
            )}
          </p>
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
    </div>
  );
}
