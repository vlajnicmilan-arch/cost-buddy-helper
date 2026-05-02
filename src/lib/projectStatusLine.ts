import type { TFunction } from 'i18next';
import type { ProjectStatus } from '@/types/project';

export type StatusLineTone = 'info' | 'success' | 'muted' | 'warning';

export interface StatusLineInput {
  status: ProjectStatus;
  start_date?: string | null;
  end_date?: string | null;
  income: number;
  spent: number;
  budget: number;
  margin: number | null;
  txCount: number;
  /** Health from ActiveProjectsStrip — used only to suppress when AI warning will render. */
  health: 'green' | 'yellow' | 'red';
}

export interface StatusLine {
  text: string;
  tone: StatusLineTone;
  /** Lucide icon name to use ('Sparkles' | 'Clock' | 'Pause' | 'Info' | 'AlertCircle'). */
  icon: 'Sparkles' | 'Clock' | 'Pause' | 'Info' | 'AlertCircle';
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Generates a short, deterministic status sentence for a project card on the dashboard.
 *
 * Pure function, no AI / network calls — uses only fields we already have so the text
 * is always factually correct and instant.
 *
 * Returns null when the card already shows an AI warning (yellow / red), to avoid
 * duplicate / competing text.
 */
export function getProjectStatusLine(
  data: StatusLineInput,
  t: TFunction,
): StatusLine | null {
  // 1) Yellow / red are handled by the AI warning row above — skip status line.
  if (data.health !== 'green') return null;

  // 2) Paused
  if (data.status === 'paused') {
    return {
      text: t('projects.statusLine.paused', 'Projekt je pauziran'),
      tone: 'muted',
      icon: 'Pause',
    };
  }

  const now = Date.now();

  // 3) Waiting to start (start_date in the future)
  if (data.start_date) {
    const start = new Date(data.start_date).getTime();
    if (Number.isFinite(start) && start > now) {
      const days = Math.ceil((start - now) / DAY_MS);
      if (days <= 14) {
        return {
          text: t('projects.statusLine.waitingStartSoon', 'Kreće za {{days}} dana', { days }),
          tone: 'info',
          icon: 'Clock',
        };
      }
      const dateStr = new Date(data.start_date).toLocaleDateString();
      return {
        text: t('projects.statusLine.waitingStart', 'Čeka početak · kreće {{date}}', { date: dateStr }),
        tone: 'info',
        icon: 'Clock',
      };
    }
  }

  // 4) End date passed but project still open
  if (data.end_date) {
    const end = new Date(data.end_date).getTime();
    if (Number.isFinite(end) && end < now && data.status !== 'completed' && data.status !== 'cancelled') {
      return {
        text: t('projects.statusLine.overdueOpen', 'Rok prošao — projekt još otvoren'),
        tone: 'warning',
        icon: 'AlertCircle',
      };
    }
  }

  // 5) No activity at all
  if (data.txCount === 0 && data.income === 0 && data.spent === 0) {
    return {
      text: t('projects.statusLine.justStarted', 'Tek započeo — još nema unosa'),
      tone: 'muted',
      icon: 'Info',
    };
  }

  // 6) Healthy with realised income → motivational
  if (data.income > 0 && data.margin !== null && data.margin >= 0.30) {
    return {
      text: t('projects.statusLine.stable', 'Stabilan — bravo!'),
      tone: 'success',
      icon: 'Sparkles',
    };
  }

  // 7-9) Budget-phase descriptors (no income yet, but has budget)
  if (data.budget > 0) {
    const usedPct = Math.max(0, Math.min(100, Math.round((data.spent / data.budget) * 100)));
    const remainingPct = Math.max(0, 100 - usedPct);

    if (usedPct < 30) {
      return {
        text: t('projects.statusLine.prepPhase', 'Pripremna faza · {{pct}}% budžeta', { pct: usedPct }),
        tone: 'info',
        icon: 'Info',
      };
    }
    if (usedPct < 70) {
      return {
        text: t('projects.statusLine.inFullSwing', 'U punom zamahu · {{pct}}% budžeta', { pct: usedPct }),
        tone: 'info',
        icon: 'Sparkles',
      };
    }
    // 70-100% used
    return {
      text: t('projects.statusLine.nearEnd', 'Pred kraj · preostalo {{pct}}%', { pct: remainingPct }),
      tone: 'info',
      icon: 'Clock',
    };
  }

  // 10) Fallback — has some activity but no budget
  return {
    text: t('projects.statusLine.inProgress', 'U tijeku · {{count}} unosa', { count: data.txCount }),
    tone: 'muted',
    icon: 'Info',
  };
}
