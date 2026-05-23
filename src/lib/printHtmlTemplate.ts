// HTML equivalent of pdfReportKit — same visual language (Variant B) so
// print-preview output (web) and saved-HTML output (native) match the PDF.
import {
  REPORT_COLORS,
  formatBrandDate,
  type ReportBrandOptions,
} from '@/lib/reportDesign';
import { getReportLogoDataUrl } from '@/lib/reportLogo';

export interface BuildReportHtmlInput {
  title: string;
  brand: ReportBrandOptions;
  bodyHtml: string;
  confidentialityLabel?: { internal: string; confidential: string };
  intendedForLabel?: string;
}

const escapeHtml = (s: string): string =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export const buildReportHtml = (input: BuildReportHtmlInput): string => {
  const owner = (input.brand.owner || '').trim();
  const dateStr = formatBrandDate(new Date(), input.brand.language);
  const eyebrow = [owner.toUpperCase(), dateStr].filter(Boolean).join('  ·  ');
  const level = input.brand.confidentiality || 'none';

  const badge = (() => {
    if (level === 'none' || !input.confidentialityLabel) return '';
    const isConfidential = level === 'confidential';
    const label = isConfidential ? input.confidentialityLabel.confidential : input.confidentialityLabel.internal;
    const bg = isConfidential ? REPORT_COLORS.teal : REPORT_COLORS.badgeSlateBg;
    const fg = isConfidential ? '#ffffff' : REPORT_COLORS.badgeSlate;
    return `<span class="vmb-badge" style="background:${bg};color:${fg}">${escapeHtml(label).toUpperCase()}</span>`;
  })();

  const watermark = level === 'confidential'
    ? `<div class="vmb-watermark" aria-hidden="true">POVJERLJIVO</div>`
    : '';

  const intendedFor = (level !== 'none' && input.intendedForLabel)
    ? `<div class="vmb-intended">${escapeHtml(input.intendedForLabel)}</div>`
    : '';

  return `<!DOCTYPE html><html lang="${input.brand.language || 'hr'}"><head>
<meta charset="utf-8">
<title>${escapeHtml(input.title)}</title>
<style>
  :root {
    --teal: ${REPORT_COLORS.teal};
    --teal-tint: ${REPORT_COLORS.tealTint};
    --teal-deep: ${REPORT_COLORS.tealDeep};
    --ink: ${REPORT_COLORS.ink};
    --muted: ${REPORT_COLORS.muted};
    --hairline: ${REPORT_COLORS.hairline};
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: var(--ink); font-family: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
  body { padding: 24px; max-width: 980px; margin: 0 auto; }

  .vmb-header { position: relative; background: var(--teal-tint); border-radius: 10px; padding: 18px 22px 18px 28px; margin-bottom: 18px; overflow: hidden; }
  .vmb-header::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--teal); border-radius: 6px 0 0 6px; }
  .vmb-logo { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .vmb-logo-img { width: 36px; height: 36px; border-radius: 8px; object-fit: contain; display: block; }
  .vmb-logo-mark { width: 32px; height: 32px; border-radius: 7px; background: var(--teal); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 12px; letter-spacing: -0.02em; }
  .vmb-logo-word { color: var(--teal-deep); font-weight: 800; font-size: 18px; letter-spacing: -0.01em; }
  .vmb-eyebrow { color: var(--muted); font-size: 11px; font-weight: 600; letter-spacing: 0.08em; margin-bottom: 6px; }
  .vmb-title { font-size: 26px; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 4px; color: var(--ink); }
  .vmb-subtitle { color: var(--muted); font-size: 14px; }
  .vmb-badge { position: absolute; top: 18px; right: 22px; font-size: 10px; font-weight: 800; letter-spacing: 0.08em; padding: 4px 8px; border-radius: 999px; }

  .vmb-body { font-size: 13px; line-height: 1.55; }
  .vmb-body h2 { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--teal-deep); margin: 26px 0 12px; padding: 0 0 6px; border-bottom: 1px solid var(--hairline); }
  .vmb-body table { width: 100%; border-collapse: collapse; }
  .vmb-body thead th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); font-weight: 700; padding: 8px 10px; border-bottom: 1.5px solid var(--teal); background: #fff; }
  .vmb-body tbody td { padding: 11px 10px; border-bottom: 1px solid var(--hairline); font-size: 12.5px; background: #fff; }
  .vmb-body tbody tr:last-child td { border-bottom: none; }
  .vmb-body .num { text-align: right; font-variant-numeric: tabular-nums; }
  .vmb-body .pos { color: #16a34a; }
  .vmb-body .neg { color: #dc2626; }

  .vmb-kpi-strip { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 18px 0 14px; }
  .vmb-kpi { background: #fff; border: 1px solid var(--hairline); border-radius: 10px; padding: 16px 16px 18px; }
  .vmb-kpi-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.09em; color: var(--muted); font-weight: 700; margin-bottom: 10px; }
  .vmb-kpi-value { font-size: 24px; font-weight: 800; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; color: var(--ink); line-height: 1.1; }
  .vmb-kpi.is-hero { background: var(--teal-tint); border-color: transparent; }
  .vmb-kpi.is-hero .vmb-kpi-value { font-size: 30px; color: var(--teal-deep); }
  .vmb-kpi.is-pos .vmb-kpi-value { color: #16a34a; }
  .vmb-kpi.is-neg .vmb-kpi-value { color: #dc2626; }

  /* Activity feed — premium "operational" layout for personal transaction exports.
     Each row is a card-like block, not a table cell. */
  .vmb-feed { margin: 4px 0; }
  .vmb-feed-day { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); font-weight: 700; margin: 12px 0 4px; padding-bottom: 3px; border-bottom: 1px solid var(--hairline); }
  .vmb-feed-day:first-child { margin-top: 4px; }
  .vmb-feed-item { display: grid; grid-template-columns: 1fr auto; gap: 4px 14px; padding: 6px 0; border-bottom: 1px solid var(--hairline); align-items: start; page-break-inside: avoid; }
  .vmb-feed-item:last-child { border-bottom: none; }
  .vmb-feed-title { font-size: 12.5px; font-weight: 600; color: var(--ink); line-height: 1.3; letter-spacing: -0.005em; }
  .vmb-feed-meta { font-size: 10.5px; color: var(--muted); margin-top: 2px; line-height: 1.35; }
  .vmb-feed-meta .dot { margin: 0 5px; opacity: 0.5; }
  .vmb-feed-amount { font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; text-align: right; white-space: nowrap; }
  .vmb-feed-amount.pos { color: #16a34a; }
  .vmb-feed-amount.neg { color: var(--ink); }

  .vmb-footer { margin-top: 26px; padding-top: 10px; border-top: 1px solid var(--hairline); display: flex; justify-content: space-between; color: var(--muted); font-size: 9.5px; letter-spacing: 0.02em; }
  .vmb-intended { font-weight: 500; }

  .vmb-watermark { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; z-index: 0; font-size: 110px; font-weight: 900; color: var(--teal); opacity: 0.04; transform: rotate(-30deg); letter-spacing: 0.12em; }

  @media print {
    body { padding: 16mm; max-width: none; }
    .vmb-kpi-strip { grid-template-columns: repeat(4, 1fr); }
    @page { margin: 12mm; }
  }
</style>
</head><body>
${watermark}
<div class="vmb-header">
  <div class="vmb-logo">
    ${getReportLogoDataUrl()
      ? `<img class="vmb-logo-img" src="${getReportLogoDataUrl()}" alt="V&amp;M Balance" />`
      : `<div class="vmb-logo-mark">V&amp;M</div>`}
    <div class="vmb-logo-word">V&amp;M Balance</div>
  </div>
  ${eyebrow ? `<div class="vmb-eyebrow">${escapeHtml(eyebrow)}</div>` : ''}
  <h1 class="vmb-title">${escapeHtml(input.title)}</h1>
  ${input.brand.subtitle ? `<div class="vmb-subtitle">${escapeHtml(input.brand.subtitle)}</div>` : ''}
  ${badge}
</div>
<div class="vmb-body">
${input.bodyHtml}
</div>
<div class="vmb-footer">
  ${intendedFor || '<span></span>'}
  <span>V&amp;M Balance</span>
</div>
</body></html>`;
};

/** Helper to build a KPI strip used in HTML body. Set `hero: true` on the
 * primary metric (e.g. saldo/profit) for emphasized executive treatment. */
export const renderHtmlKpiStrip = (
  kpis: Array<{ label: string; value: string; hero?: boolean; tone?: 'pos' | 'neg' }>,
): string => {
  const cells = kpis.map(k => {
    const cls = [k.hero ? 'is-hero' : '', k.tone === 'pos' ? 'is-pos' : '', k.tone === 'neg' ? 'is-neg' : ''].filter(Boolean).join(' ');
    return `<div class="vmb-kpi${cls ? ' ' + cls : ''}"><div class="vmb-kpi-label">${escapeHtml(k.label)}</div><div class="vmb-kpi-value">${escapeHtml(k.value)}</div></div>`;
  }).join('');
  return `<div class="vmb-kpi-strip">${cells}</div>`;
};

/** Activity feed renderer — premium "operational" layout for personal
 * transaction exports (alternative to database-style table). Items are
 * grouped by day; each item shows title + meta chips + amount. */
export interface FeedItem {
  date: Date;
  title: string;             // primary line (e.g. description)
  metaParts?: string[];      // small chips joined by · (category, source, project, milestone)
  amount: string;            // already-formatted with sign (e.g. "-34,80 €")
  positive?: boolean;        // true for income/inbound transfer
}

const cleanFeedTitle = (raw: string): string => {
  let s = String(raw || '');
  s = s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '');
  s = s.replace(/\b[0-9a-f]{16,}\b/gi, '');
  s = s.replace(/[,\s]+(?=$|[,\s])/g, ' ');
  s = s.replace(/[\s,–-]+\d{6,}\s*$/g, '');
  s = s.replace(/\s+/g, ' ').replace(/[\s,;:–-]+$/g, '').trim();
  return s;
};

export const renderHtmlActivityFeed = (
  items: FeedItem[],
  opts?: { dateLocale?: 'hr' | 'en' | 'de' },
): string => {
  if (items.length === 0) return '';
  const locale = opts?.dateLocale === 'en' ? 'en-GB' : opts?.dateLocale === 'de' ? 'de-DE' : 'hr-HR';
  const dayFmt = new Intl.DateTimeFormat(locale, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  // Group by yyyy-mm-dd preserving incoming order (caller controls sort)
  const groups: Array<{ key: string; label: string; items: FeedItem[] }> = [];
  const seen = new Map<string, number>();
  for (const it of items) {
    const d = it.date;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    let idx = seen.get(key);
    if (idx === undefined) {
      idx = groups.length;
      seen.set(key, idx);
      groups.push({ key, label: dayFmt.format(d), items: [] });
    }
    groups[idx].items.push(it);
  }

  const parts: string[] = ['<div class="vmb-feed">'];
  for (const g of groups) {
    parts.push(`<div class="vmb-feed-day">${escapeHtml(g.label)}</div>`);
    for (const it of g.items) {
      const metaHtml = (it.metaParts && it.metaParts.length > 0)
        ? `<div class="vmb-feed-meta">${it.metaParts.map(escapeHtml).join('<span class="dot">·</span>')}</div>`
        : '';
      const amtCls = it.positive ? 'pos' : 'neg';
      parts.push(`<div class="vmb-feed-item">
  <div>
    <div class="vmb-feed-title">${escapeHtml(cleanFeedTitle(it.title))}</div>
    ${metaHtml}
  </div>
  <div class="vmb-feed-amount ${amtCls}">${escapeHtml(it.amount)}</div>
</div>`);
    }
  }
  parts.push('</div>');
  return parts.join('');
};
