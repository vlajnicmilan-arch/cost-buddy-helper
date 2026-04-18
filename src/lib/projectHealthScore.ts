/**
 * Project Health Score
 * Combines budget pressure, timeline pressure, and milestone progress
 * into a single 0–100 score with traffic-light color.
 *
 * Scoring rules (lower is worse):
 * - 80–100: green ("on_track")
 * - 50–79:  yellow ("at_risk")
 * - 0–49:   red   ("critical")
 *
 * Components:
 *  budgetScore   — 100 if spent <= 80% budget, scales down to 0 at 130%+
 *  timelineScore — 100 if within timeline; degrades when % time used > % budget used
 *  milestoneScore — % of completed milestones (with overdue penalty)
 */

export type HealthLevel = 'on_track' | 'at_risk' | 'critical' | 'unknown';

export interface ProjectHealthInput {
  spent: number;
  budget: number;
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
  reason: string;                   // dominant cause
}

const clamp = (v: number, min = 0, max = 100) => Math.max(min, Math.min(max, v));

export const calculateProjectHealth = (input: ProjectHealthInput): ProjectHealthResult => {
  const { spent, budget, startDate, endDate, milestones = [] } = input;

  // --- Budget component ---
  const budgetUsedPct = budget > 0 ? (spent / budget) * 100 : 0;
  let budgetScore = 100;
  if (budget > 0) {
    if (budgetUsedPct <= 80) budgetScore = 100;
    else if (budgetUsedPct <= 100) budgetScore = 100 - (budgetUsedPct - 80) * 2.5; // 80→100 = 100→50
    else if (budgetUsedPct <= 130) budgetScore = 50 - (budgetUsedPct - 100) * 1.66; // 100→130 = 50→0
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

    // If past deadline → critical timeline
    if (daysRemaining < 0) {
      timelineScore = 0;
    } else if (budget > 0) {
      // Burn-rate analysis: % time used should not greatly exceed % budget used
      const drift = budgetUsedPct - timeProgressPct;
      if (drift <= 5) timelineScore = 100;
      else if (drift <= 20) timelineScore = 100 - (drift - 5) * 3.33; // 5→20 = 100→50
      else if (drift <= 40) timelineScore = 50 - (drift - 20) * 2.5;  // 20→40 = 50→0
      else timelineScore = 0;
    } else {
      // No budget — score on time remaining only
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
  // Weight: budget 40%, timeline 35%, milestones 25%
  const score = Math.round(budgetScore * 0.4 + timelineScore * 0.35 + milestoneScore * 0.25);

  let level: HealthLevel = 'on_track';
  if (score < 50) level = 'critical';
  else if (score < 80) level = 'at_risk';
  if (budget === 0 && !endDate && milestones.length === 0) level = 'unknown';

  // Dominant reason
  let reason = 'on_track';
  const lowest = Math.min(budgetScore, timelineScore, milestoneScore);
  if (lowest === budgetScore && budgetScore < 80) reason = 'budget';
  else if (lowest === timelineScore && timelineScore < 80) reason = 'timeline';
  else if (lowest === milestoneScore && milestoneScore < 80) reason = 'milestones';

  return {
    score,
    level,
    daysRemaining,
    totalDays,
    timeProgressPct,
    budgetUsedPct,
    reason,
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
