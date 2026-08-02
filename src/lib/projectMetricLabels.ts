/**
 * Korak F — jedan pomoćnik odlučuje SVE natpise oko „preostalog".
 *
 * Do koraka F broj `(osnovica − potrošeno)` zvao se „Marža" / „Zarada", iako
 * na otvorenom projektu to nije zarada nego neutrošeni dio osnovice. Natpis se
 * mijenja, ali s njim moraju ići i svi prateći tekstovi — semafor, statusna
 * riječ, AI upozorenje i rečenica ispod kartice. Inače bi kartica pisala
 * „Preostalo 90 %" a odmah ispod „marža zdrava".
 *
 * Zato nijedna komponenta ne bira natpis sama: sve prolazi kroz ovaj modul.
 * Na završenom projektu (`completed`) broj JEST ostvarena marža i natpisi se
 * vraćaju na „Ostvarena marža" / „Zarada".
 */
import type { RemainderLevel } from './projectCostBaseline';

export type RemainderContext = 'open' | 'realized';

export interface LabelSpec {
  key: string;
  fallback: string;
}

export function getRemainderContext(
  status: string | null | undefined,
): RemainderContext {
  return status === 'completed' ? 'realized' : 'open';
}

export interface RemainderLabels {
  context: RemainderContext;
  isRealized: boolean;
  /** Natpis uz postotak ("Preostalo" / "Ostvarena marža"). */
  pct: LabelSpec;
  /** Verzija velikim slovima za centralni KPI na kartici. */
  pctUpper: LabelSpec;
  /** Natpis uz iznos ("Neutrošeno" / "Zarada"). */
  amount: LabelSpec;
}

const OPEN_LABELS: Omit<RemainderLabels, 'context' | 'isRealized'> = {
  pct: { key: 'projects.remainder.remainingPct', fallback: 'Preostalo' },
  pctUpper: { key: 'projects.remainder.remainingPctUpper', fallback: 'PREOSTALO' },
  amount: { key: 'projects.remainder.unspent', fallback: 'Neutrošeno' },
};

const REALIZED_LABELS: Omit<RemainderLabels, 'context' | 'isRealized'> = {
  pct: { key: 'projects.remainder.realizedMarginPct', fallback: 'Ostvarena marža' },
  pctUpper: { key: 'projects.remainder.realizedMarginPctUpper', fallback: 'OSTVARENA MARŽA' },
  amount: { key: 'projects.remainder.realizedProfit', fallback: 'Zarada' },
};

export function getRemainderLabels(
  status: string | null | undefined,
): RemainderLabels {
  const context = getRemainderContext(status);
  const base = context === 'realized' ? REALIZED_LABELS : OPEN_LABELS;
  return { context, isRealized: context === 'realized', ...base };
}

/** Statusna riječ uz semafor ("Zdrav" / "Pažnja" / "Kritično" / "—"). */
export function getRemainderStatusLabel(level: RemainderLevel): LabelSpec {
  switch (level) {
    case 'healthy':
      return { key: 'projects.remainder.status.healthy', fallback: 'Zdrav' };
    case 'attention':
      return { key: 'projects.remainder.status.attention', fallback: 'Pažnja' };
    case 'critical':
      return { key: 'projects.remainder.status.critical', fallback: 'Kritično' };
    default:
      return { key: 'projects.remainder.status.neutral', fallback: '—' };
  }
}

/**
 * Rečenica semafora. Namjerno BEZ brojeva: prag ovisi o osnovici
 * (planirani trošak 80/100 vs ugovoreno 30/10), pa bi fiksni postotak u
 * tekstu bio netočan na polovici projekata.
 */
export function getRemainderTrafficLabel(
  status: string | null | undefined,
  level: RemainderLevel,
): LabelSpec | null {
  if (level === 'neutral') return null;
  const realized = getRemainderContext(status) === 'realized';
  if (realized) {
    switch (level) {
      case 'healthy':
        return { key: 'projects.remainder.traffic.realized.healthy', fallback: 'Zdravo: projekt završen s maržom' };
      case 'attention':
        return { key: 'projects.remainder.traffic.realized.attention', fallback: 'Pažnja: niska ostvarena marža' };
      default:
        return { key: 'projects.remainder.traffic.realized.critical', fallback: 'Kritično: projekt završen u minusu' };
    }
  }
  switch (level) {
    case 'healthy':
      return { key: 'projects.remainder.traffic.open.healthy', fallback: 'Zdravo: potrošnja unutar plana' };
    case 'attention':
      return { key: 'projects.remainder.traffic.open.attention', fallback: 'Pažnja: potrošnja blizu granice' };
    default:
      return { key: 'projects.remainder.traffic.open.critical', fallback: 'Kritično: potrošnja prelazi plan' };
  }
}

/** Upozorenje s postotkom ({{pct}}). `null` kad nema što upozoriti. */
export function getRemainderWarningLabel(
  status: string | null | undefined,
  level: RemainderLevel,
): LabelSpec | null {
  if (level === 'healthy' || level === 'neutral') return null;
  const realized = getRemainderContext(status) === 'realized';
  if (realized) {
    return level === 'critical'
      ? { key: 'projects.remainder.warning.realized.critical', fallback: 'Projekt završen u minusu · {{pct}}%' }
      : { key: 'projects.remainder.warning.realized.attention', fallback: 'Niska ostvarena marža · {{pct}}%' };
  }
  return level === 'critical'
    ? { key: 'projects.remainder.warning.open.critical', fallback: 'Prekoračenje plana · preostalo {{pct}}%' }
    : { key: 'projects.remainder.warning.open.attention', fallback: 'Malo preostalo · {{pct}}% — smanji troškove' };
}

/** Napomena o djelomičnom pokriću planirane marže. */
export const PLANNED_MARGIN_COVERAGE_LABEL: LabelSpec = {
  key: 'projects.remainder.plannedCoverage',
  fallback: 'temeljeno na {{withBoth}} od {{total}} faza',
};

export const PLANNED_MARGIN_LABEL: LabelSpec = {
  key: 'projects.remainder.plannedMargin',
  fallback: 'Planirana marža',
};

export const UNCLASSIFIED_CONTRACT_LABEL: LabelSpec = {
  key: 'projects.remainder.unclassified',
  fallback: 'Ugovoreno {{contract}} · po fazama razvrstano {{phases}} · nerazvrstano {{diff}}',
};

/**
 * Djelomično pokriće — namjerno BEZ ijednog iznosa. Razlika
 * `ugovoreno − Σ faza` u ovom stanju ne govori o ugovoru nego o
 * neupisanim cijenama, pa se ne prikazuje.
 */
export const PHASE_PRICE_COVERAGE_LABEL: LabelSpec = {
  key: 'projects.remainder.phasePriceCoverage',
  fallback: 'Cijene upisane na {{withPrice}} od {{total}} faza',
};
