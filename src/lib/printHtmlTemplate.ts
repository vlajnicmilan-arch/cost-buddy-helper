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
  .vmb-logo { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
  .vmb-logo-mark { width: 28px; height: 28px; border-radius: 6px; background: var(--teal); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 11px; letter-spacing: -0.02em; }
  .vmb-logo-word { color: var(--teal-deep); font-weight: 800; font-size: 17px; letter-spacing: -0.01em; }
  .vmb-eyebrow { color: var(--muted); font-size: 11px; font-weight: 600; letter-spacing: 0.08em; margin-bottom: 6px; }
  .vmb-title { font-size: 26px; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 4px; color: var(--ink); }
  .vmb-subtitle { color: var(--muted); font-size: 14px; }
  .vmb-badge { position: absolute; top: 18px; right: 22px; font-size: 10px; font-weight: 800; letter-spacing: 0.08em; padding: 4px 8px; border-radius: 999px; }

  .vmb-body { font-size: 13px; line-height: 1.55; }
  .vmb-body h2 { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--teal-deep); background: var(--teal-tint); display: inline-block; padding: 4px 10px; border-radius: 999px; margin: 22px 0 10px; }
  .vmb-body table { width: 100%; border-collapse: collapse; }
  .vmb-body thead th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); font-weight: 700; padding: 8px 10px; border-bottom: 1px solid var(--hairline); }
  .vmb-body tbody td { padding: 8px 10px; border-bottom: 1px solid var(--hairline); font-size: 12.5px; }
  .vmb-body tbody tr:nth-child(even) td { background: #fafbfc; }
  .vmb-body .num { text-align: right; font-variant-numeric: tabular-nums; }
  .vmb-body .pos { color: #16a34a; }
  .vmb-body .neg { color: #dc2626; }

  .vmb-kpi-strip { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 14px 0 8px; }
  .vmb-kpi { background: #fff; border: 1px solid var(--hairline); border-radius: 8px; padding: 10px 12px; }
  .vmb-kpi-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); font-weight: 700; margin-bottom: 4px; }
  .vmb-kpi-value { font-size: 18px; font-weight: 800; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; color: var(--ink); }

  .vmb-footer { margin-top: 22px; padding-top: 10px; border-top: 1px solid var(--hairline); display: flex; justify-content: space-between; color: var(--muted); font-size: 10.5px; }
  .vmb-intended { font-weight: 600; }

  .vmb-watermark { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; z-index: 0; font-size: 110px; font-weight: 900; color: var(--teal); opacity: 0.07; transform: rotate(-30deg); letter-spacing: 0.12em; }

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
    <div class="vmb-logo-mark">V&amp;M</div>
    <div class="vmb-logo-word">Balance</div>
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

/** Helper to build a KPI strip used in HTML body. */
export const renderHtmlKpiStrip = (kpis: Array<{ label: string; value: string }>): string => {
  const cells = kpis.map(k => `<div class="vmb-kpi"><div class="vmb-kpi-label">${escapeHtml(k.label)}</div><div class="vmb-kpi-value">${escapeHtml(k.value)}</div></div>`).join('');
  return `<div class="vmb-kpi-strip">${cells}</div>`;
};
