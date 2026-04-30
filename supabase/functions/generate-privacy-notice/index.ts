import { PDFDocument, rgb } from 'https://esm.sh/pdf-lib@1.17.1';
import fontkit from 'https://esm.sh/@pdf-lib/fontkit@1.1.1';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PnInput {
  companyName: string;
  companyOib?: string;
  companyAddress?: string;
  contactEmail?: string;
  language?: 'hr' | 'en' | 'de';
}

interface I18nPn {
  title: string;
  intro: (c: string) => string;
  whoTitle: string;
  who: (c: string, oib: string, addr: string) => string;
  whatTitle: string;
  what: string;
  purposeTitle: string;
  purpose: string;
  basisTitle: string;
  basis: string;
  whoSeesTitle: string;
  whoSees: string;
  storageTitle: string;
  storage: string;
  retentionTitle: string;
  retention: string;
  rightsTitle: string;
  rights: string;
  contactTitle: string;
  contact: (email: string) => string;
  generated: string;
  footer: string;
}

const I18N: Record<string, I18nPn> = {
  hr: {
    title: 'OBAVIJEST O OBRADI OSOBNIH PODATAKA',
    intro: (c) =>
      `Ova obavijest opisuje kako tvrtka ${c} obrađuje vaše osobne podatke kada radite na našim projektima. Cilj je biti transparentan o tome koje podatke prikupljamo, zašto i koja su vaša prava.`,
    whoTitle: '1. Tko obrađuje vaše podatke (Voditelj obrade)',
    who: (c, oib, addr) => `${c}${oib ? `, OIB: ${oib}` : ''}${addr ? `, ${addr}` : ''}.`,
    whatTitle: '2. Koje podatke obrađujemo',
    what:
      'Ime i prezime, kontakt podaci (email i/ili telefon), pozicija/uloga na projektu, evidencija odrađenih sati po danu, ugovorena satnica ili honorar, kratke bilješke o obavljenom poslu (dnevnik rada).',
    purposeTitle: '3. Svrha obrade',
    purpose:
      'Interno praćenje napretka projekata, planiranje rada, obračun naknada za obavljeni rad i komunikacija u kontekstu projekta. Podaci se NE koriste za marketing.',
    basisTitle: '4. Pravna osnova',
    basis:
      'Ugovor o radu, ugovor o djelu/suradnji ili legitimni interes Voditelja obrade za vođenje vlastitog poslovanja (čl. 6. st. 1. točka b ili f Opće uredbe o zaštiti podataka — GDPR).',
    whoSeesTitle: '5. Tko može vidjeti vaše podatke',
    whoSees:
      'Samo članovi tima projekta unutar naše firme s pravima pristupa. Tehnički, podaci su pohranjeni u alatu V&M Balance koji djeluje kao Obrađivač (Processor) prema GDPR-u. Podaci se ne dijele s trećim stranama u marketinške svrhe.',
    storageTitle: '6. Gdje se podaci pohranjuju',
    storage: 'Na poslužiteljima u Europskoj uniji.',
    retentionTitle: '7. Koliko dugo čuvamo podatke',
    retention:
      'Tijekom trajanja vaše suradnje s nama te dodatno onoliko koliko nas obvezuju zakonski rokovi (npr. porezni i računovodstveni propisi). Nakon toga se podaci brišu.',
    rightsTitle: '8. Vaša prava',
    rights:
      'Pravo na pristup vlastitim podacima, ispravak netočnih podataka, brisanje, ograničenje obrade, prenosivost i pravo na prigovor. Imate i pravo podnijeti pritužbu Agenciji za zaštitu osobnih podataka (AZOP).',
    contactTitle: '9. Kontakt za zahtjeve',
    contact: (email) => `Za bilo koje pitanje ili ostvarivanje prava javite se na: ${email || '[email firme]'}.`,
    generated: 'Generirano:',
    footer: 'Generirano kroz V&M Balance — interna evidencija. Nije službeni knjigovodstveni dokument.',
  },
  en: {
    title: 'PRIVACY NOTICE — PROCESSING OF YOUR PERSONAL DATA',
    intro: (c) =>
      `This notice describes how ${c} processes your personal data when you work on our projects. Our goal is to be transparent about what we collect, why, and what your rights are.`,
    whoTitle: '1. Who processes your data (Controller)',
    who: (c, oib, addr) => `${c}${oib ? `, ID: ${oib}` : ''}${addr ? `, ${addr}` : ''}.`,
    whatTitle: '2. What data we process',
    what:
      'Name and surname, contact details (email/phone), position/role on the project, hours worked per day, agreed hourly rate or fee, brief work log notes.',
    purposeTitle: '3. Purpose',
    purpose:
      'Internal project tracking, work planning, fee calculation and project-related communication. Data is NOT used for marketing.',
    basisTitle: '4. Legal basis',
    basis:
      'Employment contract, service contract, or legitimate interest of the Controller (Art. 6(1)(b) or (f) GDPR).',
    whoSeesTitle: '5. Who can see your data',
    whoSees:
      'Only project team members within our company with access rights. Data is technically stored in V&M Balance which acts as a Processor under GDPR. Data is not shared with third parties for marketing.',
    storageTitle: '6. Where data is stored',
    storage: 'On servers within the European Union.',
    retentionTitle: '7. How long we keep data',
    retention:
      'For the duration of your engagement with us plus any additional period required by law (e.g. tax and accounting). After that, data is deleted.',
    rightsTitle: '8. Your rights',
    rights:
      'Access, rectification, erasure, restriction, portability, and objection. You also have the right to lodge a complaint with the supervisory authority.',
    contactTitle: '9. Contact for requests',
    contact: (email) => `For any question or exercising your rights contact: ${email || '[company email]'}.`,
    generated: 'Generated:',
    footer: 'Generated via V&M Balance — internal record. Not an official accounting document.',
  },
  de: {
    title: 'DATENSCHUTZHINWEIS — VERARBEITUNG IHRER PERSONENBEZOGENEN DATEN',
    intro: (c) =>
      `Diese Mitteilung beschreibt, wie ${c} Ihre personenbezogenen Daten verarbeitet, wenn Sie an unseren Projekten arbeiten.`,
    whoTitle: '1. Verantwortlicher',
    who: (c, oib, addr) => `${c}${oib ? `, ID: ${oib}` : ''}${addr ? `, ${addr}` : ''}.`,
    whatTitle: '2. Welche Daten wir verarbeiten',
    what:
      'Vor- und Nachname, Kontaktdaten (E-Mail/Telefon), Position/Rolle, geleistete Stunden pro Tag, vereinbarter Stundensatz oder Honorar, kurze Arbeitsnotizen.',
    purposeTitle: '3. Zweck',
    purpose:
      'Interne Projektverfolgung, Arbeitsplanung, Honorarabrechnung und projektbezogene Kommunikation. KEINE Marketingnutzung.',
    basisTitle: '4. Rechtsgrundlage',
    basis:
      'Arbeitsvertrag, Dienstvertrag oder berechtigtes Interesse des Verantwortlichen (Art. 6 Abs. 1 lit. b oder f DSGVO).',
    whoSeesTitle: '5. Wer Ihre Daten sehen kann',
    whoSees:
      'Nur Projektteammitglieder unseres Unternehmens mit Zugriffsrechten. Technisch werden die Daten in V&M Balance gespeichert (Auftragsverarbeiter gemäß DSGVO).',
    storageTitle: '6. Speicherort',
    storage: 'Auf Servern in der Europäischen Union.',
    retentionTitle: '7. Speicherdauer',
    retention:
      'Während der Dauer der Zusammenarbeit zuzüglich gesetzlich erforderlicher Aufbewahrungsfristen.',
    rightsTitle: '8. Ihre Rechte',
    rights:
      'Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch. Beschwerderecht bei der Aufsichtsbehörde.',
    contactTitle: '9. Kontakt',
    contact: (email) => `Für Fragen oder zur Ausübung Ihrer Rechte: ${email || '[Firmen-E-Mail]'}.`,
    generated: 'Erstellt am:',
    footer: 'Erstellt mit V&M Balance — interne Aufzeichnung. Kein offizielles Buchhaltungsdokument.',
  },
};

const formatDate = (d: Date) => {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
};

async function fetchFont(url: string): Promise<Uint8Array> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`font fetch failed: ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

const FONT_URLS = {
  reg: [
    'https://github.com/notofonts/notofonts.github.io/raw/main/fonts/NotoSans/hinted/ttf/NotoSans-Regular.ttf',
    'https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts/NotoSans/hinted/ttf/NotoSans-Regular.ttf',
  ],
  bold: [
    'https://github.com/notofonts/notofonts.github.io/raw/main/fonts/NotoSans/hinted/ttf/NotoSans-Bold.ttf',
    'https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts/NotoSans/hinted/ttf/NotoSans-Bold.ttf',
  ],
};

let CACHED_FONTS: { reg: Uint8Array; bold: Uint8Array } | null = null;

async function tryFetch(urls: string[]): Promise<Uint8Array> {
  let lastErr: unknown;
  for (const u of urls) {
    try { return await fetchFont(u); } catch (e) { lastErr = e; console.warn('[font] failed', u, e); }
  }
  throw lastErr ?? new Error('no font url worked');
}

async function loadFonts() {
  if (CACHED_FONTS) return CACHED_FONTS;
  const [reg, bold] = await Promise.all([tryFetch(FONT_URLS.reg), tryFetch(FONT_URLS.bold)]);
  CACHED_FONTS = { reg, bold };
  return CACHED_FONTS;
}

async function buildPnPdf(input: PnInput): Promise<Uint8Array> {
  const lang = (input.language || 'hr') as keyof typeof I18N;
  const t = I18N[lang] || I18N.hr;

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const fonts = await loadFonts();
  const font = await pdf.embedFont(fonts.reg, { subset: true });
  const fontBold = await pdf.embedFont(fonts.bold, { subset: true });

  const margin = 50;
  const pageWidth = 595;
  const pageHeight = 842;
  const contentWidth = pageWidth - 2 * margin;
  const footerReserve = 40;
  const pages: any[] = [];
  let page = pdf.addPage([pageWidth, pageHeight]);
  pages.push(page);
  let y = pageHeight - margin;

  const newPage = () => {
    page = pdf.addPage([pageWidth, pageHeight]);
    pages.push(page);
    y = pageHeight - margin;
  };

  const writeLine = (text: string, opts: { bold?: boolean; size?: number; color?: [number, number, number] } = {}) => {
    const size = opts.size ?? 10;
    const f = opts.bold ? fontBold : font;
    const lh = size + 4;
    if (y - lh < margin + footerReserve) newPage();
    const words = text.split(' ');
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      const w = f.widthOfTextAtSize(test, size);
      if (w > contentWidth && line) {
        page.drawText(line, { x: margin, y, size, font: f, color: rgb(opts.color?.[0] ?? 0, opts.color?.[1] ?? 0, opts.color?.[2] ?? 0) });
        y -= lh;
        line = word;
        if (y - lh < margin + footerReserve) newPage();
      } else { line = test; }
    }
    if (line) {
      page.drawText(line, { x: margin, y, size, font: f, color: rgb(opts.color?.[0] ?? 0, opts.color?.[1] ?? 0, opts.color?.[2] ?? 0) });
      y -= lh;
    }
  };

  const writeSection = (title: string, body: string) => {
    y -= 8;
    writeLine(title, { bold: true, size: 11 });
    y -= 2;
    writeLine(body);
  };

  writeLine(t.title, { bold: true, size: 14 });
  y -= 6;
  writeLine(`${t.generated} ${formatDate(new Date())}`, { size: 9, color: [0.4, 0.4, 0.4] });
  y -= 6;
  writeLine(t.intro(input.companyName));

  writeSection(t.whoTitle, t.who(input.companyName, input.companyOib || '', input.companyAddress || ''));
  writeSection(t.whatTitle, t.what);
  writeSection(t.purposeTitle, t.purpose);
  writeSection(t.basisTitle, t.basis);
  writeSection(t.whoSeesTitle, t.whoSees);
  writeSection(t.storageTitle, t.storage);
  writeSection(t.retentionTitle, t.retention);
  writeSection(t.rightsTitle, t.rights);
  writeSection(t.contactTitle, t.contact(input.contactEmail || ''));

  const total = pages.length;
  pages.forEach((p, idx) => {
    const text = t.footer;
    const size = 8;
    const w = font.widthOfTextAtSize(text, size);
    p.drawText(text, { x: (pageWidth - w) / 2, y: 25, size, font, color: rgb(0.45, 0.45, 0.45) });
    const pageLabel = `${idx + 1} / ${total}`;
    p.drawText(pageLabel, {
      x: pageWidth - margin - font.widthOfTextAtSize(pageLabel, 8),
      y: 25,
      size: 8, font, color: rgb(0.45, 0.45, 0.45),
    });
  });

  return await pdf.save();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body: PnInput = await req.json();
    if (!body.companyName || body.companyName.trim().length < 2) {
      return new Response(JSON.stringify({ error: 'companyName_required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const pdfBytes = await buildPnPdf(body);

    try {
      await supabase.from('dpa_requests').insert({
        user_id: userData.user.id,
        document_type: 'privacy_notice',
        company_name: body.companyName,
        company_oib: body.companyOib ?? null,
        company_address: body.companyAddress ?? null,
        contact_email: body.contactEmail ?? null,
        language: body.language ?? 'hr',
      });
    } catch (e) {
      console.warn('[generate-privacy-notice] audit insert failed', e);
    }

    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < pdfBytes.length; i += chunk) {
      binary += String.fromCharCode(...pdfBytes.subarray(i, i + chunk));
    }
    const base64 = btoa(binary);

    return new Response(
      JSON.stringify({ pdf: base64, filename: `Privacy-Notice-${body.companyName.replace(/\s+/g, '_')}.pdf` }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error('[generate-privacy-notice] error', e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
