// Modul "Odluke" — Faza 5: PDF izvoz zatvorene odluke.
// Podijeljeno u:
//   1) buildDecisionPdfData — čista funkcija (mapira ProjectDecision u
//      strukturu spremnu za renderiranje). Testira se unit testom.
//   2) generateDecisionPdf — asinkroni renderer koji koristi pdfReportKit,
//      jspdf + autotable te opcionalno umeće thumbnaile priloga (slike).
//
// Prilozi: ODABRANA STRATEGIJA — thumbnaili za slike (max ~28mm širine)
// pored liste; ne-slike (PDF/dokumenti) su samo popisane s imenom, tipom
// i veličinom te napomenom "dostupno u aplikaciji". Ako signed URL ili
// dohvat slike ne uspije, gracefully pada natrag na tekstualnu listu.
import type { jsPDF as JsPDFType } from 'jspdf';
import i18n from '@/i18n';
import { loadJsPdf } from '@/lib/loadJsPdf';
import { applyBrandFont, BRAND_DARK, BRAND_MUTED, BRAND_TEAL } from '@/lib/pdfBranding';
import { drawReportHeader, drawReportFooter, REPORT_MARGIN_X } from '@/lib/pdfReportKit';
import { ensureReportLogo } from '@/lib/reportLogo';
import {
  buildReportFileName,
  formatBrandDate,
  loadLastConfidentiality,
  slugify,
  type ReportBrandOptions,
} from '@/lib/reportDesign';
import { exportPDFDoc, type ExportMode } from '@/lib/fileExport';
import { resolveEffectiveDecisionPrice, type DecisionAction } from '@/lib/projectDecisionStateMachine';
import type { ProjectDecision, DecisionAttachment } from '@/hooks/useProjectDecisions';
import { isImageAttachment } from '@/lib/decisionAttachments';

export type DecisionPdfOutcome = 'approved' | 'rejected' | 'closed';

export interface DecisionPdfAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  isImage: boolean;
}

export interface DecisionPdfStep {
  stepNo: number;
  action: DecisionAction;
  actionLabel: string;
  actorName: string;
  createdAt: string;
  message: string;
  price: number | null;
  attachments: DecisionPdfAttachment[];
}

export interface DecisionPdfData {
  decisionId: string;
  projectName: string;
  title: string;
  outcome: DecisionPdfOutcome;
  outcomeLabel: string;
  ownerName: string;
  investorName: string;
  createdAt: string;
  closedAt: string | null;
  initialDescription: string;
  effectivePrice: number | null;
  hasContractAmendment: boolean;
  steps: DecisionPdfStep[];
  language: 'hr' | 'en' | 'de';
  generatedAt: string;
}

export interface BuildDecisionPdfDataInput {
  decision: ProjectDecision;
  projectName: string;
  ownerName: string;
  investorName: string;
  language: 'hr' | 'en' | 'de';
  /** Prijevodi labela — omogućuje testabilnost bez i18n mock-anja. */
  labels: {
    outcome: { approved: string; rejected: string; closed: string };
    action: Record<DecisionAction, string>;
  };
  /** Trenutak generiranja (default: sada). */
  now?: Date;
}

/**
 * Čista funkcija — mapira ProjectDecision + kontekst u strukturu spremnu za
 * PDF render. Ne dodiruje jsPDF ni bilo kakav I/O.
 */
export function buildDecisionPdfData(input: BuildDecisionPdfDataInput): DecisionPdfData {
  const { decision, projectName, ownerName, investorName, language, labels } = input;
  const now = input.now ?? new Date();

  const status = decision.current_status;
  let outcome: DecisionPdfOutcome = 'closed';
  if (status === 'approved') outcome = 'approved';
  else if (status === 'rejected') outcome = 'rejected';
  else outcome = 'closed';

  const attByStep = new Map<string, DecisionAttachment[]>();
  for (const a of decision.attachments) {
    if (!a.step_id) continue;
    const arr = attByStep.get(a.step_id) ?? [];
    arr.push(a);
    attByStep.set(a.step_id, arr);
  }

  const sortedSteps = [...decision.steps].sort((a, b) => a.step_no - b.step_no);
  const steps: DecisionPdfStep[] = sortedSteps.map((s) => {
    const atts = attByStep.get((s as any).id) ?? [];
    return {
      stepNo: s.step_no,
      action: s.action,
      actionLabel: labels.action[s.action],
      actorName:
        s.actor_role === 'owner'
          ? ownerName
          : s.actor_role === 'investor'
          ? investorName
          : '',
      createdAt: s.created_at ?? '',
      message: (s.message ?? '').trim(),
      price: s.price == null ? null : Number(s.price),
      attachments: atts.map((a) => ({
        id: a.id,
        fileName: a.file_name,
        mimeType: a.mime_type,
        sizeBytes: a.size_bytes,
        storagePath: a.storage_path,
        isImage: isImageAttachment({ type: a.mime_type }),
      })),
    };
  });

  return {
    decisionId: decision.id,
    projectName,
    title: decision.title,
    outcome,
    outcomeLabel: labels.outcome[outcome],
    ownerName,
    investorName,
    createdAt: decision.created_at,
    closedAt: decision.closed_at,
    initialDescription: decision.initial_description ?? '',
    effectivePrice: resolveEffectiveDecisionPrice(decision.steps),
    hasContractAmendment: !!decision.contract_amendment_id,
    steps,
    language,
    generatedAt: now.toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────
// Formatiranje
// ─────────────────────────────────────────────────────────────

const fmtDate = (iso: string, lang: 'hr' | 'en' | 'de'): string => {
  if (!iso) return '';
  try {
    const locale = lang === 'en' ? 'en-GB' : lang === 'de' ? 'de-DE' : 'hr-HR';
    return new Intl.DateTimeFormat(locale, {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
};

const fmtSignedEur = (amount: number, lang: 'hr' | 'en' | 'de'): string => {
  const sign = amount < 0 ? '−' : '+';
  const abs = Math.abs(amount);
  const locale = lang === 'en' ? 'en-GB' : lang === 'de' ? 'de-DE' : 'hr-HR';
  const s = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(abs);
  return `${sign}${s}`;
};

const fmtBytes = (n: number): string => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

// ─────────────────────────────────────────────────────────────
// Renderer
// ─────────────────────────────────────────────────────────────

export interface GenerateDecisionPdfOptions {
  data: DecisionPdfData;
  mode?: ExportMode;
  /** Dohvat signed URL-a za prilog (za thumbnaile slika). */
  getAttachmentUrl?: (att: { storage_path: string; mime_type: string; file_name: string; id: string; decision_id: string; step_id: string | null; size_bytes: number; uploaded_by: string; created_at: string }) => Promise<string | null>;
  brand?: ReportBrandOptions;
}

const fetchImageAsDataUrl = async (url: string): Promise<string | null> => {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

const detectImgFormat = (mime: string): 'JPEG' | 'PNG' => {
  if (/png/i.test(mime)) return 'PNG';
  return 'JPEG';
};

export async function generateDecisionPdf(opts: GenerateDecisionPdfOptions): Promise<boolean> {
  const { data, mode = 'save', getAttachmentUrl, brand } = opts;
  const { jsPDF, autoTable } = await loadJsPdf();
  await ensureReportLogo();
  const doc = new jsPDF();
  applyBrandFont(doc);
  const t = i18n.t.bind(i18n);
  const lang = data.language;

  // Pre-dohvat slikovnih thumbnaila (paralelno) — samo ako imamo getAttachmentUrl.
  const imgCache = new Map<string, { dataUrl: string; format: 'JPEG' | 'PNG' } | null>();
  if (getAttachmentUrl) {
    const jobs: Promise<void>[] = [];
    for (const step of data.steps) {
      for (const a of step.attachments) {
        if (!a.isImage) continue;
        jobs.push((async () => {
          try {
            const url = await getAttachmentUrl({
              id: a.id, decision_id: data.decisionId, step_id: null,
              storage_path: a.storagePath, file_name: a.fileName, mime_type: a.mimeType,
              size_bytes: a.sizeBytes, uploaded_by: '', created_at: '',
            });
            if (!url) { imgCache.set(a.id, null); return; }
            const dataUrl = await fetchImageAsDataUrl(url);
            imgCache.set(a.id, dataUrl ? { dataUrl, format: detectImgFormat(a.mimeType) } : null);
          } catch {
            imgCache.set(a.id, null);
          }
        })());
      }
    }
    await Promise.all(jobs);
  }

  const fullBrand: ReportBrandOptions = {
    owner: brand?.owner ?? data.ownerName,
    language: lang,
    confidentiality: brand?.confidentiality ?? loadLastConfidentiality(),
    subtitle: brand?.subtitle ?? `${t('projects.project', { defaultValue: 'Projekt' })}: ${data.projectName}`,
  };

  const bodyStartY = drawReportHeader(doc, {
    title: t('projects.decisions.pdf.title', { defaultValue: 'Odluka' }) as string,
    brand: fullBrand,
    confidentialityLabel: {
      internal: t('reportBranding.confidentiality.internal') as string,
      confidential: t('reportBranding.confidentiality.confidential') as string,
    },
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const leftX = REPORT_MARGIN_X;
  const rightX = pageWidth - REPORT_MARGIN_X;
  const contentWidth = rightX - leftX;
  const bottomLimit = pageHeight - 20;

  let y = bodyStartY;

  const ensureSpace = (needed: number) => {
    if (y + needed > bottomLimit) {
      doc.addPage();
      y = 20;
    }
  };

  // Naslov odluke
  doc.setFont('Inter', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(BRAND_DARK[0], BRAND_DARK[1], BRAND_DARK[2]);
  const titleLines = doc.splitTextToSize(data.title, contentWidth);
  doc.text(titleLines, leftX, y);
  y += titleLines.length * 6 + 2;

  // Ishod badge (tekst)
  doc.setFont('Inter', 'bold');
  doc.setFontSize(10);
  const outcomeColor: [number, number, number] =
    data.outcome === 'approved' ? [34, 139, 118] :
    data.outcome === 'rejected' ? [220, 38, 38] : [100, 116, 139];
  doc.setTextColor(outcomeColor[0], outcomeColor[1], outcomeColor[2]);
  doc.text(data.outcomeLabel, leftX, y);
  y += 6;

  // Meta: projekt, datum zatvaranja, strane
  doc.setFont('Inter', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(BRAND_MUTED[0], BRAND_MUTED[1], BRAND_MUTED[2]);
  const metaLines: string[] = [];
  metaLines.push(`${t('projects.project', { defaultValue: 'Projekt' })}: ${data.projectName}`);
  metaLines.push(
    `${t('projects.owner', { defaultValue: 'Vlasnik' })}: ${data.ownerName}  ·  ${t('projectRoles.investor', { defaultValue: 'Investitor' })}: ${data.investorName}`
  );
  metaLines.push(
    `${t('projects.decisions.pdf.createdAt', { defaultValue: 'Otvoreno' })}: ${fmtDate(data.createdAt, lang)}` +
    (data.closedAt ? `   ·   ${t('projects.decisions.pdf.closedAt', { defaultValue: 'Zatvoreno' })}: ${fmtDate(data.closedAt, lang)}` : '')
  );
  for (const line of metaLines) {
    const parts = doc.splitTextToSize(line, contentWidth);
    doc.text(parts, leftX, y);
    y += parts.length * 5;
  }
  y += 3;

  // Opis prijedloga
  ensureSpace(20);
  doc.setFont('Inter', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(BRAND_DARK[0], BRAND_DARK[1], BRAND_DARK[2]);
  doc.text(t('projects.decisions.pdf.initialDescription', { defaultValue: 'Prijedlog' }) as string, leftX, y);
  y += 5;
  doc.setFont('Inter', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(50, 50, 50);
  const descLines = doc.splitTextToSize(data.initialDescription || '—', contentWidth);
  for (const line of descLines) {
    ensureSpace(5);
    doc.text(line, leftX, y);
    y += 4.5;
  }
  y += 3;

  // Konačna cijena + aneks
  if (data.effectivePrice != null) {
    ensureSpace(10);
    doc.setFont('Inter', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(BRAND_DARK[0], BRAND_DARK[1], BRAND_DARK[2]);
    doc.text(t('projects.decisions.pdf.finalPrice', { defaultValue: 'Konačna cijena' }) as string, leftX, y);
    y += 5;
    doc.setFont('Inter', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(50, 50, 50);
    doc.text(fmtSignedEur(data.effectivePrice, lang), leftX, y);
    y += 5;
    if (data.hasContractAmendment && data.outcome === 'approved') {
      doc.setFontSize(9);
      doc.setTextColor(BRAND_MUTED[0], BRAND_MUTED[1], BRAND_MUTED[2]);
      doc.text(
        t('projects.decisions.pdf.amendmentNote', {
          defaultValue: 'Izmjena ugovora: {{signed}}',
          signed: fmtSignedEur(data.effectivePrice, lang),
        }) as string,
        leftX, y,
      );
      y += 5;
    }
    y += 3;
  }

  // Timeline
  ensureSpace(10);
  doc.setFont('Inter', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(BRAND_DARK[0], BRAND_DARK[1], BRAND_DARK[2]);
  doc.text(t('projects.decisions.pdf.timeline', { defaultValue: 'Slijed koraka' }) as string, leftX, y);
  y += 5;
  doc.setDrawColor(226, 232, 240);
  doc.line(leftX, y, rightX, y);
  y += 4;

  for (const step of data.steps) {
    ensureSpace(18);

    // Zaglavlje koraka
    doc.setFont('Inter', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(BRAND_DARK[0], BRAND_DARK[1], BRAND_DARK[2]);
    const header = `${step.stepNo}. ${step.actorName} · ${step.actionLabel}`;
    doc.text(header, leftX, y);

    // Datum desno
    doc.setFont('Inter', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(BRAND_MUTED[0], BRAND_MUTED[1], BRAND_MUTED[2]);
    const dateStr = fmtDate(step.createdAt, lang);
    const dw = doc.getTextWidth(dateStr);
    doc.text(dateStr, rightX - dw, y);
    y += 5;

    // Cijena
    if (step.price != null && step.price !== 0) {
      const priceColor: [number, number, number] = step.price < 0 ? [220, 38, 38] : [34, 139, 118];
      doc.setFont('Inter', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(priceColor[0], priceColor[1], priceColor[2]);
      doc.text(fmtSignedEur(step.price, lang), leftX, y);
      y += 5;
    }

    // Poruka
    if (step.message) {
      doc.setFont('Inter', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(60, 60, 60);
      const msgLines = doc.splitTextToSize(step.message, contentWidth);
      for (const line of msgLines) {
        ensureSpace(5);
        doc.text(line, leftX, y);
        y += 4.5;
      }
    }

    // Prilozi
    if (step.attachments.length > 0) {
      ensureSpace(6);
      doc.setFont('Inter', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(BRAND_MUTED[0], BRAND_MUTED[1], BRAND_MUTED[2]);
      doc.text(
        (t('projects.decisions.pdf.attachments', { defaultValue: 'Prilozi' }) as string) + ':',
        leftX, y,
      );
      y += 4;

      // Thumbnaili slika (redak)
      const images = step.attachments.filter((a) => a.isImage);
      if (images.length > 0) {
        const thumbH = 22; // mm
        const thumbW = 22;
        const gap = 3;
        let x = leftX;
        const rowStartY = y;
        let maxRowH = 0;
        for (const img of images) {
          const cached = imgCache.get(img.id);
          if (!cached) continue;
          if (x + thumbW > rightX) {
            y += thumbH + gap;
            x = leftX;
            ensureSpace(thumbH + gap);
          }
          try {
            doc.addImage(cached.dataUrl, cached.format, x, y, thumbW, thumbH, undefined, 'FAST');
            doc.setDrawColor(226, 232, 240);
            doc.rect(x, y, thumbW, thumbH);
          } catch {
            // ignore render failure — file will still appear in list below
          }
          x += thumbW + gap;
          maxRowH = Math.max(maxRowH, thumbH);
        }
        if (maxRowH > 0) y += maxRowH + 2;
        // upozorenje ako neka slika nije uspjela
        const failed = images.filter((i) => !imgCache.get(i.id)).length;
        if (failed > 0) {
          doc.setFont('Inter', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(BRAND_MUTED[0], BRAND_MUTED[1], BRAND_MUTED[2]);
          doc.text(
            t('projects.decisions.pdf.attachmentsAvailableInApp', {
              defaultValue: 'Neki prilozi dostupni su u aplikaciji.',
            }) as string,
            leftX, y,
          );
          y += 4;
        }
      }

      // Tekstualna lista svih priloga
      doc.setFont('Inter', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(60, 60, 60);
      for (const a of step.attachments) {
        ensureSpace(4.5);
        const line = `• ${a.fileName}  (${a.mimeType || '?'} · ${fmtBytes(a.sizeBytes)})`;
        const parts = doc.splitTextToSize(line, contentWidth - 4);
        doc.text(parts, leftX + 2, y);
        y += parts.length * 4;
      }
    }

    y += 3;
    // Divider
    doc.setDrawColor(240, 244, 248);
    doc.line(leftX, y, rightX, y);
    y += 3;
  }

  // Footer na svim stranicama
  drawReportFooter(doc, {
    brand: fullBrand,
    pageLabel: t('reportBranding.pageXofY', { defaultValue: 'Stranica {{n}} / {{total}}' }) as string,
    disclaimer: t('projects.decisions.pdf.footerDisclaimer', {
      defaultValue: 'Generirano iz aplikacije Centar · {{date}} · ID: {{id}}',
      date: formatBrandDate(new Date(data.generatedAt), lang),
      id: data.decisionId,
    }) as string,
  });

  const fileName = buildReportFileName({
    type: `odluka-${slugify(data.title)}`,
    owner: data.ownerName,
    period: (data.closedAt ?? data.generatedAt).slice(0, 10),
    ext: 'pdf',
  });

  return exportPDFDoc(doc, fileName, mode);
}
