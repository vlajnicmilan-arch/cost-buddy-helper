import { useState, KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, X, Settings as SettingsIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useFamilySplitSettings, SplitMode, SplitIncomeSource } from '@/hooks/useFamilySplitSettings';

interface Props {
  groupId: string;
  isOwner: boolean;
}

/**
 * Owner-only configuration for the split engine of a family group.
 * Members see the current configuration in read-only mode.
 */
export const FamilySplitSettingsTab = ({ groupId, isOwner }: Props) => {
  const { t } = useTranslation();
  const { settings, loading, saving, save } = useFamilySplitSettings(groupId);
  const [newCategory, setNewCategory] = useState('');

  if (loading || !settings) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const addCategory = () => {
    const v = newCategory.trim();
    if (!v) return;
    if (settings.shared_categories.includes(v)) return;
    save({ shared_categories: [...settings.shared_categories, v] });
    setNewCategory('');
  };

  const removeCategory = (cat: string) => {
    save({ shared_categories: settings.shared_categories.filter((c) => c !== cat) });
  };

  const onCatKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCategory();
    }
  };

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-2">
        <SettingsIcon className="h-4 w-4 text-muted-foreground" />
        <h2 className="font-semibold">{t('family.split.settings.title', 'Postavke podjele')}</h2>
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>

      {/* Split mode */}
      <div className="space-y-2">
        <Label className="text-sm">{t('family.split.settings.mode', 'Način podjele')}</Label>
        <Select
          value={settings.split_mode}
          disabled={!isOwner || saving}
          onValueChange={(v) => save({ split_mode: v as SplitMode })}
        >
          <SelectTrigger className="h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="equal">
              <div className="flex flex-col">
                <span>{t('family.split.settings.modeEqual', 'Jednako')}</span>
                <span className="text-[10px] text-muted-foreground">
                  {t('family.split.settings.modeEqualDesc', 'Svaki član plaća isti dio')}
                </span>
              </div>
            </SelectItem>
            <SelectItem value="proportional_income">
              <div className="flex flex-col">
                <span>{t('family.split.settings.modeProportional', 'Proporcionalno prihodu')}</span>
                <span className="text-[10px] text-muted-foreground">
                  {t('family.split.settings.modeProportionalDesc', 'Tko zarađuje više, plaća više')}
                </span>
              </div>
            </SelectItem>
            <SelectItem value="manual">
              <div className="flex flex-col">
                <span>{t('family.split.settings.modeManual', 'Ručno po transakciji')}</span>
                <span className="text-[10px] text-muted-foreground">
                  {t('family.split.settings.modeManualDesc', 'Bez globalnog pravila; samo per-transaction override')}
                </span>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Income source (only relevant for proportional) */}
      {settings.split_mode === 'proportional_income' && (
        <div className="space-y-2">
          <Label className="text-sm">{t('family.split.settings.incomeSource', 'Izvor prihoda')}</Label>
          <Select
            value={settings.split_income_source}
            disabled={!isOwner || saving}
            onValueChange={(v) => save({ split_income_source: v as SplitIncomeSource })}
          >
            <SelectTrigger className="h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hybrid">
                <div className="flex flex-col">
                  <span>{t('family.split.settings.sourceHybrid', 'Hibrid (preporučeno)')}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {t('family.split.settings.sourceHybridDesc', 'Deklarirano ako postoji, inače auto 3 mj.')}
                  </span>
                </div>
              </SelectItem>
              <SelectItem value="declared">
                <div className="flex flex-col">
                  <span>{t('family.split.settings.sourceDeclared', 'Samo deklarirano')}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {t('family.split.settings.sourceDeclaredDesc', 'Iznos koji član sam unese')}
                  </span>
                </div>
              </SelectItem>
              <SelectItem value="auto_3m">
                <div className="flex flex-col">
                  <span>{t('family.split.settings.sourceAuto', 'Auto 3 mj.')}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {t('family.split.settings.sourceAutoDesc', 'Prosjek priznatih prihoda zadnja 3 mjeseca')}
                  </span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {t(
              'family.split.settings.consentNote',
              'Auto/hibrid računa samo prihode članova koji su dali suglasnost u tabu Tim.'
            )}
          </p>
        </div>
      )}

      {/* Shared categories */}
      <div className="space-y-2">
        <Label className="text-sm">{t('family.split.settings.sharedCategories', 'Kategorije koje se dijele')}</Label>
        <p className="text-[11px] text-muted-foreground">
          {t(
            'family.split.settings.sharedCategoriesHint',
            'Prazno = sve transakcije na dijeljenim računima se dijele. Dodaj kategorije za sužavanje.'
          )}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {settings.shared_categories.map((cat) => (
            <Badge key={cat} variant="secondary" className="gap-1 pl-2 pr-1 py-0.5">
              {cat}
              {isOwner && (
                <button
                  type="button"
                  onClick={() => removeCategory(cat)}
                  disabled={saving}
                  className="ml-0.5 hover:text-destructive transition-colors"
                  aria-label={t('family.split.settings.removeCategory', 'Ukloni')}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
          {settings.shared_categories.length === 0 && (
            <span className="text-xs text-muted-foreground">
              {t('family.split.settings.allCategories', 'Sve kategorije')}
            </span>
          )}
        </div>
        {isOwner && (
          <div className="flex items-center gap-2">
            <Input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyDown={onCatKey}
              placeholder={t('family.split.settings.categoryPlaceholder', 'npr. Hrana')}
              className="h-9 text-sm flex-1"
              disabled={saving}
            />
            <Button type="button" size="sm" variant="outline" onClick={addCategory} disabled={!newCategory.trim() || saving} className="gap-1">
              <Plus className="h-3.5 w-3.5" />
              {t('family.split.settings.add', 'Dodaj')}
            </Button>
          </div>
        )}
      </div>

      {/* Currency (read-only display) */}
      <div className="space-y-1">
        <Label className="text-sm">{t('family.split.settings.currency', 'Valuta podjele')}</Label>
        <p className="text-sm text-muted-foreground">{settings.currency}</p>
      </div>

      {!isOwner && (
        <p className="text-xs text-muted-foreground italic">
          {t('family.split.settings.ownerOnly', 'Samo vlasnik grupe može mijenjati postavke.')}
        </p>
      )}
    </section>
  );
};
