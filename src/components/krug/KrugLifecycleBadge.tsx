/**
 * KrugLifecycleBadge — colored status badge + optional explanatory line.
 *
 * Države (vidi `krug.lifecycle.*` i18n):
 *  - active          → neutralan/uspjeh ton (default badge)
 *  - early_signal    → tihi warning
 *  - ugrozen         → snažan warning (amber)
 *  - paused          → muted
 *  - continuity_window → info ton
 *  - read_only       → muted + zaključano
 *  - terminated      → muted
 *  - deleted         → destruktivan ton (rijetko prikazujemo)
 */
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { ShieldAlert, AlertTriangle, Pause, Lock, Hourglass } from 'lucide-react';

type Lifecycle =
  | 'active'
  | 'early_signal'
  | 'ugrozen'
  | 'paused'
  | 'continuity_window'
  | 'read_only'
  | 'terminated'
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
  paused: 'bg-muted text-muted-foreground border-border',
  continuity_window: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
  read_only: 'bg-muted text-muted-foreground border-border',
  terminated: 'bg-muted text-muted-foreground border-border',
  deleted: 'bg-destructive/15 text-destructive border-destructive/40',
};

export function KrugLifecycleBadge({ state, className, withNote }: Props) {
  const { t } = useTranslation();
  if (!state) return null;
  const key = (state as Lifecycle) in TONE ? (state as Lifecycle) : null;
  const tone = key ? TONE[key] : 'bg-muted text-muted-foreground border-border';

  const Icon =
    key === 'ugrozen' ? ShieldAlert
      : key === 'early_signal' ? AlertTriangle
      : key === 'paused' ? Pause
      : key === 'read_only' || key === 'terminated' ? Lock
      : key === 'continuity_window' ? Hourglass
      : null;

  const label = t(`krug.lifecycle.${state}`, state);
  const note = withNote && key && key !== 'active'
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
