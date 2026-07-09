/**
 * KrugSelector — WS1 (Expense Entry → Krug v1).
 *
 * Semantics Lock v1:
 *  - Personal-only. Ne renderira se u business kontekstu (roditelj to filtrira).
 *  - Privacy izbor je isključivo `personal` | `shared`. `private` NIJE UI izbor.
 *  - Odabir Kruga upisuje se izravno u `expenses.krug_id`.
 *  - `shared` = zajednički trag + approval workflow. Bez izračuna dugova (nema settlementa).
 *
 * Legacy tretman: ako je postojeći trošak imao `krug_privacy='private'`,
 * roditelj taj slučaj mapira u UI kao `personal` i preserva izvornu vrijednost
 * u bazi dok korisnik ne promijeni izbor.
 */
import { Users, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useMyKrugs } from '@/hooks/useKrug';

export type KrugSelectorPrivacy = 'personal' | 'shared';

interface KrugSelectorProps {
  krugId: string | null;
  privacy: KrugSelectorPrivacy;
  onChange: (next: { krugId: string | null; privacy: KrugSelectorPrivacy }) => void;
  disabled?: boolean;
  /** True kad je postojeći trošak imao legacy `krug_privacy='private'`. UI ga prikazuje kao `personal`. */
  legacyPrivate?: boolean;
}

export const KrugSelector = ({
  krugId,
  privacy,
  onChange,
  disabled = false,
  legacyPrivate = false,
}: KrugSelectorProps) => {
  const { t } = useTranslation();
  const { data: krugs = [], isLoading } = useMyKrugs();

  // Ne prikazujemo selector ako korisnik nema nijedan Krug — nema što ponuditi.
  if (!isLoading && krugs.length === 0) return null;

  const handleKrugChange = (value: string) => {
    if (value === 'none') {
      onChange({ krugId: null, privacy: 'personal' });
    } else {
      onChange({ krugId: value, privacy: privacy });
    }
  };

  const handlePrivacyChange = (next: KrugSelectorPrivacy) => {
    onChange({ krugId, privacy: next });
  };

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium flex items-center gap-2">
        <Users className="w-4 h-4" />
        {t('krug.selector.label', 'Krug')}
      </Label>

      <Select
        value={krugId ?? 'none'}
        onValueChange={handleKrugChange}
        disabled={disabled || isLoading}
      >
        <SelectTrigger className="h-12 rounded-xl bg-background">
          <SelectValue placeholder={t('krug.selector.placeholder', 'Bez Kruga')} />
        </SelectTrigger>
        <SelectContent className="bg-popover z-50">
          <SelectItem value="none">
            <span className="text-muted-foreground">
              {t('krug.selector.none', 'Bez Kruga')}
            </span>
          </SelectItem>
          {krugs.map((k) => (
            <SelectItem key={k.id} value={k.id}>
              <span className="flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                <span className="truncate">{k.name}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {krugId && (
        <>
          <div className="flex gap-2 p-1 bg-muted rounded-xl">
            <button
              type="button"
              disabled={disabled}
              onClick={() => handlePrivacyChange('personal')}
              className={cn(
                'flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5',
                privacy === 'personal'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <User className="w-4 h-4" />
              {t('krug.selector.personal', 'Moje')}
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => handlePrivacyChange('shared')}
              className={cn(
                'flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5',
                privacy === 'shared'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Users className="w-4 h-4" />
              {t('krug.selector.shared', 'Za Krug')}
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {privacy === 'shared'
              ? t(
                  'krug.selector.hintShared',
                  'Šalje se ostalim članovima Kruga na potvrdu. Krug bilježi zajednički trag potrošnje — ne obračunava dugove.',
                )
              : t(
                  'krug.selector.hintPersonal',
                  'Ostaje vidljivo samo tebi. Ne ide na potvrdu Krugu.',
                )}
          </p>
          {legacyPrivate && privacy === 'personal' && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 leading-relaxed">
              {t(
                'krug.selector.legacyPrivateHint',
                'Ovaj je trošak izvorno bio označen kao „Skriveno od Kruga". U novoj verziji prikazuje se kao „Moje". Promjena izbora zamijenit će izvornu oznaku.',
              )}
            </p>
          )}
        </>
      )}
    </div>
  );
};
