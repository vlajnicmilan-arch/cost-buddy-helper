/**
 * Project Health Score
 * Combines margin, budget, timeline and milestone signals into a single
 * 0–100 score with traffic-light color.
 *
 * Scoring rules (lower is worse):
 * - 80–100: green ("on_track")
 * - 50–79:  yellow ("at_risk")
 * - 0–49:   red   ("critical")
 *
 * Components:
 *  marginScore    — based on (contract − spent) / contract; only when contract_value > 0
 *  budgetScore    — 100 if spent <= 80% budget, scales down to 0 at 130%+
 *  timelineScore  — 100 if within timeline; degrades when % time used > % budget used
 *  milestoneScore — % of completed milestones (with overdue penalty)
 *
 * Weights (when contract_value > 0):  Margin 40% / Budget 30% / Timeline 20% / Milestone 10%
 * Fallback (no contract_value):       Budget 40% / Timeline 35% / Milestone 25%
 */

export type HealthLevel = 'on_track' | 'at_risk' | 'critical' | 'unknown';

export interface ProjectHealthInput {
  spent: number;
  budget: number;
  /** Contracted value with the client. When > 0 enables Margin component & EAC. */
  contractValue?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  milestones?: Array<{
    status: 'pending' | 'in_progress' | 'completed' | 'overdue';
    due_date?: string | null;
  }>;
}

export interface ProjectHealthResult {
  score: number;          // 0–100
  level: HealthLevel;
  daysRemaining: number | null;
  totalDays: number | null;
  timeProgressPct: number | null;   // 0–100
  budgetUsedPct: number;            // 0–unbounded
  reason: string;                   // dominant cause: margin | budget | timeline | milestones | on_track
  /** Margin % vs contract (contract − spent) / contract × 100. null when no contract. */
  marginPct: number | null;
  /** Margin amount in currency (contract − spent). null when no contract. */
  marginAmount: number | null;
  /** Estimated cost At Completion. Projects current spend rate onto full timeline. */
  eac: number | null;
  /** True when contract_value not set — UI should prompt to enter it. */
  marginUnknown: boolean;
}

const clamp = (v: number, min = 0, max = 100) => Math.max(min, Math.min(max, v));

/** Margin score from margin % (0–100 input). */
const marginScoreFromPct = (pct: number): number => {
  if (pct < 0) return 0;
  if (pct < 5) return 25;
  if (pct < 15) return 50;
  if (pct < 30) return 80;
  return 100;
};

export const calculateProjectHealth = (input: ProjectHealthInput): ProjectHealthResult => {
  const { spent, budget, contractValue, startDate, endDate, milestones = [] } = input;
  const contract = Number(contractValue || 0);
  const hasContract = contract > 0;

  // --- Margin component ---
  let marginPct: number | null = null;
  let marginAmount: number | null = null;
  let marginScore = 0;
  if (hasContract) {
    marginAmount = contract - spent;
    marginPct = (marginAmount / contract) * 100;
    marginScore = marginScoreFromPct(marginPct);
  }

  // --- Budget component ---
  const budgetUsedPct = budget > 0 ? (spent / budget) * 100 : 0;
  let budgetScore = 100;
  if (budget > 0) {
    if (budgetUsedPct <= 80) budgetScore = 100;
    else if (budgetUsedPct <= 100) budgetScore = 100 - (budgetUsedPct - 80) * 2.5;
    else if (budgetUsedPct <= 130) budgetScore = 50 - (budgetUsedPct - 100) * 1.66;
    else budgetScore = 0;
  }
  budgetScore = clamp(budgetScore);

  // --- Timeline component ---
  let daysRemaining: number | null = null;
  let totalDays: number | null = null;
  let timeProgressPct: number | null = null;
  let timelineScore = 100;
  const now = Date.now();

  if (endDate) {
    const end = new Date(endDate).getTime();
    const start = startDate ? new Date(startDate).getTime() : now;
    totalDays = Math.max(1, Math.round((end - start) / 86400000));
    daysRemaining = Math.round((end - now) / 86400000);
    const used = Math.max(0, now - start);
    timeProgressPct = clamp((used / Math.max(1, end - start)) * 100);

    if (daysRemaining < 0) {
      timelineScore = 0;
    } else if (budget > 0) {
      const drift = budgetUsedPct - timeProgressPct;
      if (drift <= 5) timelineScore = 100;
      else if (drift <= 20) timelineScore = 100 - (drift - 5) * 3.33;
      else if (drift <= 40) timelineScore = 50 - (drift - 20) * 2.5;
      else timelineScore = 0;
    } else {
      const remainingPct = 100 - timeProgressPct;
      timelineScore = clamp(remainingPct * 1.2);
    }
  }
  timelineScore = clamp(timelineScore);

  // --- Milestone component ---
  let milestoneScore = 100;
  if (milestones.length > 0) {
    const completed = milestones.filter(m => m.status === 'completed').length;
    const overdue = milestones.filter(m => {
      if (m.status === 'overdue') return true;
      if (m.status === 'completed') return false;
      if (!m.due_date) return false;
      return new Date(m.due_date).getTime() < now;
    }).length;
    const progressPct = (completed / milestones.length) * 100;
    const overduePenalty = (overdue / milestones.length) * 40;
    milestoneScore = clamp(progressPct + 20 - overduePenalty);
  }

  // --- Composite score ---
  const score = hasContract
    ? Math.round(marginScore * 0.4 + budgetScore * 0.3 + timelineScore * 0.2 + milestoneScore * 0.1)
    : Math.round(budgetScore * 0.4 + timelineScore * 0.35 + milestoneScore * 0.25);

  let level: HealthLevel = 'on_track';
  if (score < 50) level = 'critical';
  else if (score < 80) level = 'at_risk';
  if (!hasContract && budget === 0 && !endDate && milestones.length === 0) level = 'unknown';

  // Dominant reason (only count components that are active)
  const candidates: Array<{ name: string; score: number }> = [];
  if (hasContract) candidates.push({ name: 'margin', score: marginScore });
  if (budget > 0) candidates.push({ name: 'budget', score: budgetScore });
  if (endDate) candidates.push({ name: 'timeline', score: timelineScore });
  if (milestones.length > 0) candidates.push({ name: 'milestones', score: milestoneScore });

  let reason = 'on_track';
  if (candidates.length > 0) {
    const worst = candidates.reduce((a, b) => (a.score <= b.score ? a : b));
    if (worst.score < 80) reason = worst.name;
  }

  // --- EAC (Estimated At Completion) ---
  // Time-based projection: if we've used X% of time, EAC ≈ spent / X.
  // Skip projection when timeline too early (<5%) to avoid wild extrapolation.
  let eac: number | null = null;
  if (hasContract || budget > 0) {
    if (timeProgressPct !== null && timeProgressPct > 5) {
      eac = spent / (timeProgressPct / 100);
    } else {
      eac = spent;
    }
  }

  return {
    score,
    level,
    daysRemaining,
    totalDays,
    timeProgressPct,
    budgetUsedPct,
    reason,
    marginPct,
    marginAmount,
    eac,
    marginUnknown: !hasContract,
  };
};

export const getHealthColor = (level: HealthLevel): string => {
  switch (level) {
    case 'on_track': return 'hsl(var(--income))';
    case 'at_risk': return 'hsl(var(--warning))';
    case 'critical': return 'hsl(var(--destructive))';
    default: return 'hsl(var(--muted-foreground))';
  }
};

export const getHealthBgClass = (level: HealthLevel): string => {
  switch (level) {
    case 'on_track': return 'bg-income/10 text-income border-income/30';
    case 'at_risk': return 'bg-warning/10 text-warning border-warning/30';
    case 'critical': return 'bg-destructive/10 text-destructive border-destructive/30';
    default: return 'bg-muted text-muted-foreground border-border';
  }
};
