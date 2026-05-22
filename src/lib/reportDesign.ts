// Shared design tokens + types for unified report branding (PDF + HTML).
// Variant B — "Dashboard" feel: teal-tinted header card, KPI strip, chip
// section labels, alternating rows, page-numbered footer.

export type ConfidentialityLevel = 'none' | 'internal' | 'confidential';

export const CONFIDENTIALITY_STORAGE_KEY = 'vm:lastConfidentiality';

// HSL 172 66% 40% → RGB (matches BRAND_TEAL in pdfBranding.ts)
export const REPORT_COLORS = {
  teal: '#23aa91',
  tealTint: '#e6f7f3',
  tealDeep: '#178a76',
  ink: '#0f172a',
  muted: '#64748b',
  hairline: '#e2e8f0',
  paper: '#ffffff',
  badgeSlate: '#475569',
  badgeSlateBg: '#f1f5f9',
} as const;

// --- Owner name helpers ---

export const formatOwnerName = (raw?: string | null, fallbackEmail?: string | null): string => {
  const v = (raw || '').trim();
  if (v) return v;
  if (fallbackEmail) {
    const local = fallbackEmail.split('@')[0] || '';
    if (local) return local.charAt(0).toUpperCase() + local.slice(1);
  }
  return '';
};

// --- File name helpers ---

const stripDiacritics = (s: string): string =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[čć]/gi, (c) => (c === c.toLowerCase() ? 'c' : 'C')).replace(/[đ]/gi, (c) => (c === c.toLowerCase() ? 'd' : 'D')).replace(/[š]/gi, (c) => (c === c.toLowerCase() ? 's' : 'S')).replace(/[ž]/gi, (c) => (c === c.toLowerCase() ? 'z' : 'Z'));

export const slugify = (s: string): string =>
  stripDiacritics(String(s || ''))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

export interface BuildFileNameInput {
  type: string;            // e.g. "transakcije", "izvjestaj", "prihodi"
  owner?: string;          // optional owner display name
  period?: string;         // e.g. "2026-05" or "2026-05-22"
  ext: 'pdf' | 'csv' | 'json' | 'html' | 'xlsx';
}

export const buildReportFileName = ({ type, owner, period, ext }: BuildFileNameInput): string => {
  const parts = [slugify(type)];
  const o = owner ? slugify(owner) : '';
  if (o) parts.push(o);
  if (period) parts.push(slugify(period));
  return `${parts.filter(Boolean).join('-')}.${ext}`;
};

// --- Confidentiality persistence ---

export const loadLastConfidentiality = (): ConfidentialityLevel => {
  if (typeof window === 'undefined') return 'none';
  try {
    const v = window.localStorage.getItem(CONFIDENTIALITY_STORAGE_KEY);
    if (v === 'internal' || v === 'confidential' || v === 'none') return v;
  } catch { /* ignore */ }
  return 'none';
};

export const saveLastConfidentiality = (level: ConfidentialityLevel): void => {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(CONFIDENTIALITY_STORAGE_KEY, level); } catch { /* ignore */ }
};

// --- Brand options passed to all report builders ---

export interface ReportBrandOptions {
  owner?: string;                   // eyebrow name
  confidentiality?: ConfidentialityLevel;
  subtitle?: string;                // small line under title (period / scope)
  language?: 'hr' | 'en' | 'de';    // for date formatting
}

export const formatBrandDate = (date: Date, language: ReportBrandOptions['language'] = 'hr'): string => {
  const locale = language === 'en' ? 'en-GB' : language === 'de' ? 'de-DE' : 'hr-HR';
  try {
    return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
};
