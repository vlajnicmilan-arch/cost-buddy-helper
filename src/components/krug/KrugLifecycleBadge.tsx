/**
 * KrugLifecycleBadge — colored status badge + optional explanatory line.
 *
 * Zaključanih 6 lifecycle stanja (vidi `krug.lifecycle.*` i18n):
 *  - active            → neutralan/uspjeh ton (default badge)
 *  - early_signal      → tihi warning
 *  - ugrozen           → snažan warning (amber)
 *  - continuity_window → info ton
 *  - read_only         → muted + zaključano
 *  - deleted           → destruktivan ton (rijetko prikazujemo)
 *
 * `paused` i `terminated` NISU dio Krug lifecycle modela i ne smiju se
 * pojaviti ni kao display, ni kao fallback, ni kao enum varijanta.
 */
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { ShieldAlert, AlertTriangle, Lock, Hourglass } from 'lucide-react';

type Lifecycle =
  | 'active'
  | 'early_signal'
  | 'ugrozen'
  | 'continuity_window'
  | 'read_only'
  | 'deleted';

interface Props {
  state: string | null | undefined;
  className?: string;
  withNote?: boolean;
}

const TONE: Record<Lifecycle, string> = {
  active: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  early_signal: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30',
  ugrozen: 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40',
  continuity_window: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
  read_only: 'bg-muted text-muted-foreground border-border',
  deleted: 'bg-destructive/15 text-destructive border-destructive/40',
};

export function KrugLifecycleBadge({ state, className, withNote }: Props) {
  const { t } = useTranslation();
  if (!state) return null;
  const key = (state as Lifecycle) in TONE ? (state as Lifecycle) : null;
  if (!key) return null; // nepoznata stanja se ne renderiraju (npr. legacy paused/terminated)
  const tone = TONE[key];

  const Icon =
    key === 'ugrozen' ? ShieldAlert
      : key === 'early_signal' ? AlertTriangle
      : key === 'read_only' ? Lock
      : key === 'continuity_window' ? Hourglass
      : null;

  const label = t(`krug.lifecycle.${key}`, key);
  const note = withNote && key !== 'active'
    ? t(`krug.lifecycleNote.${key}`, { defaultValue: '' })
    : '';

  return (
    <div className={className}>
      <Badge variant="outline" className={`text-[10px] uppercase border ${tone} inline-flex items-center gap-1`}>
        {Icon && <Icon className="w-3 h-3" />}
        {label}
      </Badge>
      {note && (
        <p className="text-[11px] text-muted-foreground mt-1.5">{note}</p>
      )}
    </div>
  );
}
