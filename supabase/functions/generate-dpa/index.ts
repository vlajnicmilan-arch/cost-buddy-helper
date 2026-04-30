import { PDFDocument, rgb } from 'https://esm.sh/pdf-lib@1.17.1';
import fontkit from 'https://esm.sh/@pdf-lib/fontkit@1.1.1';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DpaInput {
  companyName: string;
  companyOib?: string;
  companyAddress?: string;
  contactEmail?: string;
  language?: 'hr' | 'en' | 'de';
}

const PROCESSOR = {
  legal: 'V&M Balance (operator aplikacije)',
  email: 'legal@vmbalance.app',
  region: 'Europska unija (EU regija — Lovable Cloud / Supabase)',
};

interface SubProc {
  name: string;
  purpose: { hr: string; en: string; de: string };
  region: string;
}

const SUB_PROCESSORS: SubProc[] = [
  {
    name: 'Lovable Cloud (Supabase)',
    purpose: { hr: 'pohrana baze i autentifikacija', en: 'database storage and authentication', de: 'Datenbankspeicherung und Authentifizierung' },
    region: 'EU',
  },
  {
    name: 'Stripe',
    purpose: { hr: 'obrada plaćanja pretplate', en: 'subscription payment processing', de: 'Zahlungsabwicklung für Abonnements' },
    region: 'EU/Global',
  },
  {
    name: 'Resend',
    purpose: { hr: 'slanje transakcijskih emailova', en: 'transactional email delivery', de: 'Versand transaktionaler E-Mails' },
    region: 'EU',
  },
  {
    name: 'Google FCM',
    purpose: { hr: 'isporuka push notifikacija', en: 'push notification delivery', de: 'Zustellung von Push-Benachrichtigungen' },
    region: 'Global',
  },
];

interface I18n {
  title: string;
  parties: string;
  controllerLabel: string;
  processorLabel: string;
  subject: string;
  subjectBody: string;
  duration: string;
  durationBody: string;
  dataTypes: string;
  dataTypesBody: string;
  dataSubjects: string;
  dataSubjectsBody: string;
  subProcessors: string;
  security: string;
  securityBody: string;
  rights: string;
  rightsBody: string;
  breach: string;
  breachBody: string;
  final: string;
  finalBody: string;
  signatures: string;
  controllerSig: string;
  processorSig: string;
  date: string;
  generated: string;
  footer: string;
}

const I18N: Record<string, I18n> = {
  hr: {
    title: 'UGOVOR O OBRADI OSOBNIH PODATAKA (DPA)',
    parties: '1. UGOVORNE STRANE',
    controllerLabel: 'Voditelj obrade (Controller)',
    processorLabel: 'Obrađivač (Processor)',
    subject: '2. PREDMET I SVRHA OBRADE',
    subjectBody:
      'Voditelj obrade koristi aplikaciju V&M Balance za interno upravljanje projektima i evidenciju radnih sati, suradnika i troškova. Obrađivač pohranjuje i obrađuje osobne podatke isključivo u svrhu pružanja te usluge.',
    duration: '3. TRAJANJE',
    durationBody:
      'Ovaj ugovor traje dok je na snazi pretplata Voditelja obrade na uslugu, uključujući dodatni grace period od 30 dana nakon brisanja računa, nakon čega se podaci trajno brišu.',
    dataTypes: '4. VRSTE OSOBNIH PODATAKA',
    dataTypesBody:
      '- Identifikacijski podaci: ime, prezime, naziv firme\n- Kontaktni podaci: email, telefon (opcionalno)\n- Profesionalni podaci: pozicija, sati rada, satnica, iznos honorara\n- Tehnički podaci: vrijeme prijave, IP adresa (samo za sigurnost)\n\nObrada NE uključuje posebne kategorije podataka (čl. 9 GDPR-a).',
    dataSubjects: '5. KATEGORIJE ISPITANIKA',
    dataSubjectsBody:
      'Zaposlenici, vanjski suradnici i podizvođači Voditelja obrade čije podatke Voditelj unosi u aplikaciju u kontekstu vlastitih projekata.',
    subProcessors: '6. PODIZVOĐAČI (SUB-PROCESSORS)',
    security: '7. SIGURNOSNE MJERE',
    securityBody:
      '- Šifriranje u tranzitu (TLS 1.2+)\n- Šifriranje u mirovanju\n- Row-Level Security (RLS) na svim tablicama\n- Sustav uloga (RBAC)\n- Opcionalna 2FA / PIN zaštita\n- Redoviti security scanovi\n- GDPR proces brisanja računa (30-dnevni grace period)',
    rights: '8. PRAVA ISPITANIKA',
    rightsBody:
      'Voditelj obrade je odgovoran odgovoriti na zahtjeve ispitanika (pristup, ispravak, brisanje, prenosivost, prigovor). Obrađivač pruža tehničke alate (export podataka, brisanje računa) koji omogućuju ispunjavanje tih zahtjeva.',
    breach: '9. OBAVIJEST O POVREDI PODATAKA',
    breachBody:
      'Obrađivač će obavijestiti Voditelja obrade o povredi osobnih podataka u roku od 72 sata od saznanja, putem emaila na kontaktnu adresu Voditelja.',
    final: '10. ZAVRŠNE ODREDBE',
    finalBody:
      'Na ovaj ugovor primjenjuje se hrvatsko pravo i Uredba (EU) 2016/679 (GDPR). Za sporove je nadležan stvarno nadležan sud prema sjedištu Obrađivača.',
    signatures: 'POTPISI',
    controllerSig: 'Za Voditelja obrade',
    processorSig: 'Za Obrađivača',
    date: 'Datum:',
    generated: 'Generirano:',
    footer: 'Generirano kroz V&M Balance — interna evidencija. Nije službeni knjigovodstveni dokument.',
  },
  en: {
    title: 'DATA PROCESSING AGREEMENT (DPA)',
    parties: '1. PARTIES',
    controllerLabel: 'Controller',
    processorLabel: 'Processor',
    subject: '2. SUBJECT MATTER AND PURPOSE',
    subjectBody:
      'The Controller uses the V&M Balance application for internal project management and tracking of work hours, collaborators, and expenses. The Processor stores and processes personal data solely for the purpose of providing this service.',
    duration: '3. DURATION',
    durationBody:
      'This agreement is in effect while the Controller has an active subscription, including an additional 30-day grace period after account deletion, after which data is permanently deleted.',
    dataTypes: '4. CATEGORIES OF PERSONAL DATA',
    dataTypesBody:
      '- Identification: first name, last name, company name\n- Contact: email, phone (optional)\n- Professional: position, work hours, hourly rate, fees\n- Technical: login timestamps, IP address (security only)\n\nProcessing does NOT include special categories of data (Art. 9 GDPR).',
    dataSubjects: '5. CATEGORIES OF DATA SUBJECTS',
    dataSubjectsBody:
      'Employees, external collaborators, and subcontractors of the Controller whose data the Controller enters into the application in the context of its own projects.',
    subProcessors: '6. SUB-PROCESSORS',
    security: '7. SECURITY MEASURES',
    securityBody:
      '- Encryption in transit (TLS 1.2+)\n- Encryption at rest\n- Row-Level Security (RLS) on all tables\n- Role-Based Access Control (RBAC)\n- Optional 2FA / PIN protection\n- Regular security scans\n- GDPR account deletion (30-day grace period)',
    rights: '8. DATA SUBJECT RIGHTS',
    rightsBody:
      'The Controller is responsible for responding to data subject requests (access, rectification, erasure, portability, objection). The Processor provides technical tools (data export, account deletion) enabling fulfilment of those requests.',
    breach: '9. DATA BREACH NOTIFICATION',
    breachBody:
      'The Processor shall notify the Controller of a personal data breach within 72 hours of becoming aware, via email to the Controller\'s contact address.',
    final: '10. FINAL PROVISIONS',
    finalBody:
      'This agreement is governed by Croatian law and Regulation (EU) 2016/679 (GDPR). Disputes are subject to the court with subject-matter jurisdiction at the seat of the Processor.',
    signatures: 'SIGNATURES',
    controllerSig: 'For the Controller',
    processorSig: 'For the Processor',
    date: 'Date:',
    generated: 'Generated:',
    footer: 'Generated via V&M Balance — internal record. Not an official accounting document.',
  },
  de: {
    title: 'AUFTRAGSVERARBEITUNGSVERTRAG (AVV / DPA)',
    parties: '1. VERTRAGSPARTEIEN',
    controllerLabel: 'Verantwortlicher (Controller)',
    processorLabel: 'Auftragsverarbeiter (Processor)',
    subject: '2. GEGENSTAND UND ZWECK',
    subjectBody:
      'Der Verantwortliche nutzt die Anwendung V&M Balance zur internen Projektverwaltung und Erfassung von Arbeitsstunden, Mitarbeitern und Kosten. Der Auftragsverarbeiter speichert und verarbeitet personenbezogene Daten ausschließlich zum Zweck der Bereitstellung dieses Dienstes.',
    duration: '3. LAUFZEIT',
    durationBody:
      'Dieser Vertrag gilt solange das Abonnement des Verantwortlichen aktiv ist, einschließlich einer 30-tägigen Kulanzfrist nach Kontolöschung. Danach werden die Daten endgültig gelöscht.',
    dataTypes: '4. ARTEN PERSONENBEZOGENER DATEN',
    dataTypesBody:
      '- Identifikation: Vorname, Nachname, Firmenname\n- Kontakt: E-Mail, Telefon (optional)\n- Berufliche Daten: Position, Arbeitsstunden, Stundensatz, Honorare\n- Technische Daten: Anmeldezeit, IP-Adresse (nur Sicherheit)\n\nDie Verarbeitung umfasst KEINE besonderen Kategorien (Art. 9 DSGVO).',
    dataSubjects: '5. KATEGORIEN BETROFFENER PERSONEN',
    dataSubjectsBody:
      'Mitarbeiter, externe Mitarbeiter und Subunternehmer des Verantwortlichen, deren Daten der Verantwortliche im Kontext eigener Projekte in die Anwendung einträgt.',
    subProcessors: '6. UNTERAUFTRAGSVERARBEITER',
    security: '7. SICHERHEITSMASSNAHMEN',
    securityBody:
      '- Verschlüsselung in der Übertragung (TLS 1.2+)\n- Verschlüsselung im Ruhezustand\n- Row-Level Security (RLS) auf allen Tabellen\n- Rollenbasierte Zugriffskontrolle (RBAC)\n- Optionale 2FA / PIN\n- Regelmäßige Sicherheitsscans\n- DSGVO-Kontolöschung (30-Tage-Frist)',
    rights: '8. RECHTE DER BETROFFENEN',
    rightsBody:
      'Der Verantwortliche ist für die Bearbeitung von Anfragen betroffener Personen verantwortlich. Der Auftragsverarbeiter stellt technische Werkzeuge (Datenexport, Kontolöschung) bereit.',
    breach: '9. MELDUNG VON DATENSCHUTZVERLETZUNGEN',
    breachBody:
      'Der Auftragsverarbeiter wird den Verantwortlichen innerhalb von 72 Stunden nach Kenntnisnahme einer Datenschutzverletzung per E-Mail informieren.',
    final: '10. SCHLUSSBESTIMMUNGEN',
    finalBody:
      'Dieser Vertrag unterliegt kroatischem Recht und der Verordnung (EU) 2016/679 (DSGVO).',
    signatures: 'UNTERSCHRIFTEN',
    controllerSig: 'Für den Verantwortlichen',
    processorSig: 'Für den Auftragsverarbeiter',
    date: 'Datum:',
    generated: 'Erstellt am:',
    footer: 'Erstellt mit V&M Balance — interne Aufzeichnung. Kein offizielles Buchhaltungsdokument.',
  },
};

// EU/ISO date: DD.MM.YYYY
const formatDate = (d: Date) => {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
};

// Fetch a Unicode TTF font that supports Latin Extended (č,ć,š,ž,đ,ä,ö,ü…)
async function fetchFont(url: string): Promise<Uint8Array> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`font fetch failed: ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

const FONT_REGULAR_URL = 'https://github.com/google/fonts/raw/main/ofl/notosans/NotoSans%5Bwdth%2Cwght%5D.ttf';
const FONT_BOLD_URL = 'https://github.com/google/fonts/raw/main/ofl/notosans/NotoSans%5Bwdth%2Cwght%5D.ttf';
// Fallback (smaller, static) if variable font fails:
const FONT_REGULAR_FALLBACK = 'https://cdn.jsdelivr.net/npm/@fontsource/noto-sans@5.0.22/files/noto-sans-latin-ext-400-normal.ttf';
const FONT_BOLD_FALLBACK = 'https://cdn.jsdelivr.net/npm/@fontsource/noto-sans@5.0.22/files/noto-sans-latin-ext-700-normal.ttf';

async function loadFonts() {
  try {
    const [reg, bold] = await Promise.all([fetchFont(FONT_REGULAR_FALLBACK), fetchFont(FONT_BOLD_FALLBACK)]);
    return { reg, bold };
  } catch (_e) {
    const [reg, bold] = await Promise.all([fetchFont(FONT_REGULAR_URL), fetchFont(FONT_BOLD_URL)]);
    return { reg, bold };
  }
}

async function buildDpaPdf(input: DpaInput): Promise<Uint8Array> {
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
  const pages: { page: any }[] = [];
  let page = pdf.addPage([pageWidth, pageHeight]);
  pages.push({ page });
  let y = pageHeight - margin;

  const newPage = () => {
    page = pdf.addPage([pageWidth, pageHeight]);
    pages.push({ page });
    y = pageHeight - margin;
  };

  const writeLine = (text: string, opts: { bold?: boolean; size?: number; color?: [number, number, number] } = {}) => {
    const size = opts.size ?? 10;
    const f = opts.bold ? fontBold : font;
    const lineHeight = size + 4;
    if (y - lineHeight < margin + footerReserve) newPage();

    const words = text.split(' ');
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      const w = f.widthOfTextAtSize(test, size);
      if (w > contentWidth && line) {
        page.drawText(line, {
          x: margin, y, size, font: f,
          color: rgb(opts.color?.[0] ?? 0, opts.color?.[1] ?? 0, opts.color?.[2] ?? 0),
        });
        y -= lineHeight;
        line = word;
        if (y - lineHeight < margin + footerReserve) newPage();
      } else {
        line = test;
      }
    }
    if (line) {
      page.drawText(line, {
        x: margin, y, size, font: f,
        color: rgb(opts.color?.[0] ?? 0, opts.color?.[1] ?? 0, opts.color?.[2] ?? 0),
      });
      y -= lineHeight;
    }
  };

  const writeMultiline = (text: string, opts: { size?: number } = {}) => {
    for (const ln of text.split('\n')) writeLine(ln, opts);
  };

  const writeSection = (title: string, body: string) => {
    y -= 8;
    writeLine(title, { bold: true, size: 11 });
    y -= 2;
    writeMultiline(body);
  };

  // Title
  writeLine(t.title, { bold: true, size: 14 });
  y -= 6;
  writeLine(`${t.generated} ${formatDate(new Date())}`, { size: 9, color: [0.4, 0.4, 0.4] });
  y -= 6;

  // Parties
  writeLine(t.parties, { bold: true, size: 11 });
  y -= 2;
  writeLine(`${t.controllerLabel}:`, { bold: true });
  writeLine(input.companyName);
  if (input.companyOib) writeLine(`OIB: ${input.companyOib}`);
  if (input.companyAddress) writeLine(input.companyAddress);
  if (input.contactEmail) writeLine(`Email: ${input.contactEmail}`);
  y -= 4;
  writeLine(`${t.processorLabel}:`, { bold: true });
  writeLine(PROCESSOR.legal);
  writeLine(`Email: ${PROCESSOR.email}`);
  writeLine(PROCESSOR.region);

  writeSection(t.subject, t.subjectBody);
  writeSection(t.duration, t.durationBody);
  writeSection(t.dataTypes, t.dataTypesBody);
  writeSection(t.dataSubjects, t.dataSubjectsBody);

  // Sub-processors (localized)
  y -= 8;
  writeLine(t.subProcessors, { bold: true, size: 11 });
  y -= 2;
  for (const sp of SUB_PROCESSORS) {
    writeLine(`- ${sp.name} — ${sp.purpose[lang]} (${sp.region})`);
  }

  writeSection(t.security, t.securityBody);
  writeSection(t.rights, t.rightsBody);
  writeSection(t.breach, t.breachBody);
  writeSection(t.final, t.finalBody);

  // Signatures
  y -= 20;
  if (y < margin + footerReserve + 80) newPage();
  writeLine(t.signatures, { bold: true, size: 11 });
  y -= 30;
  const sigY = y;
  page.drawLine({ start: { x: margin, y: sigY }, end: { x: margin + 200, y: sigY }, thickness: 0.5, color: rgb(0, 0, 0) });
  page.drawLine({ start: { x: margin + 280, y: sigY }, end: { x: margin + 480, y: sigY }, thickness: 0.5, color: rgb(0, 0, 0) });
  page.drawText(t.controllerSig, { x: margin, y: sigY - 12, size: 9, font });
  page.drawText(t.processorSig, { x: margin + 280, y: sigY - 12, size: 9, font });
  page.drawText(`${t.date} ____________`, { x: margin, y: sigY - 30, size: 9, font });
  page.drawText(`${t.date} ____________`, { x: margin + 280, y: sigY - 30, size: 9, font });

  // Footer disclaimer on every page
  const total = pages.length;
  pages.forEach((p, idx) => {
    const text = t.footer;
    const size = 8;
    const w = font.widthOfTextAtSize(text, size);
    p.page.drawText(text, {
      x: (pageWidth - w) / 2,
      y: 25,
      size,
      font,
      color: rgb(0.45, 0.45, 0.45),
    });
    const pageLabel = `${idx + 1} / ${total}`;
    p.page.drawText(pageLabel, {
      x: pageWidth - margin - font.widthOfTextAtSize(pageLabel, 8),
      y: 25,
      size: 8,
      font,
      color: rgb(0.45, 0.45, 0.45),
    });
  });

  return await pdf.save();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body: DpaInput = await req.json();
    if (!body.companyName || body.companyName.trim().length < 2) {
      return new Response(JSON.stringify({ error: 'companyName_required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const pdfBytes = await buildDpaPdf(body);

    try {
      await supabase.from('dpa_requests').insert({
        user_id: userData.user.id,
        document_type: 'dpa',
        company_name: body.companyName,
        company_oib: body.companyOib ?? null,
        company_address: body.companyAddress ?? null,
        contact_email: body.contactEmail ?? null,
        language: body.language ?? 'hr',
      });
    } catch (e) {
      console.warn('[generate-dpa] audit insert failed', e);
    }

    // Chunked base64 to avoid call-stack overflow on large PDFs
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < pdfBytes.length; i += chunk) {
      binary += String.fromCharCode(...pdfBytes.subarray(i, i + chunk));
    }
    const base64 = btoa(binary);

    return new Response(
      JSON.stringify({ pdf: base64, filename: `DPA-${body.companyName.replace(/\s+/g, '_')}.pdf` }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error('[generate-dpa] error', e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
