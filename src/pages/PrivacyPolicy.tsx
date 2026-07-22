import { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

type Lang = 'hr' | 'en' | 'de';

interface RetentionRow {
  category: string;
  period: string;
}

interface SubProcessor {
  name: string;
  region: string;
  lines: Array<{ label: string; value: string }>;
}

interface PolicyContent {
  back: string;
  title: string;
  version: string;
  intro: string;

  s1Title: string;
  s1Intro: string;
  controllerName: string;
  controllerWeb: string;
  controllerPrivacy: string;
  controllerGdpr: string;

  s2Title: string;
  s2_1Title: string;
  s2_1: string[];
  s2_2Title: string;
  s2_2: string[];
  s2_3Title: string;
  s2_3: string[];
  s2_4Title: string;
  s2_4: string[];

  s3Title: string;
  s3: Array<{ label: string; text: string }>;

  s4Title: string;
  s4Intro: string;
  subProcessors: SubProcessor[];
  s4Outro: string;

  s5Title: string;
  s5ColCategory: string;
  s5ColPeriod: string;
  retention: RetentionRow[];

  s6Title: string;
  s6Intro: string;
  s6: Array<{ label: string; text: string }>;

  s7Title: string;
  s7: string[];

  s8Title: string;
  s8p1: string;
  s8p2: string;

  s9Title: string;
  s9p1: string;

  s10Title: string;
  s10p1: string;

  s11Title: string;
  s11p1: string;

  s12Title: string;
  contactPrivacy: string;
  contactGdpr: string;
  contactSecurity: string;
  contactWeb: string;

  footer: string;
}

const HR: PolicyContent = {
  back: 'Natrag',
  title: 'Politika privatnosti',
  version: 'Verzija 2.1 — Zadnja izmjena: 22. srpnja 2026.',
  intro:
    'Ova politika opisuje obradu osobnih podataka u skladu s Općom uredbom o zaštiti podataka (EU 2016/679 — GDPR) i hrvatskim Zakonom o provedbi Opće uredbe o zaštiti podataka (NN 42/2018).',

  s1Title: '1. Voditelj obrade podataka',
  s1Intro: 'Voditelj obrade osobnih podataka u smislu članka 4. stavka 7. GDPR-a je:',
  controllerName: 'Tactura j.d.o.o. (pružatelj usluge Centar)',
  controllerWeb: 'Web: vmbalance.com',
  controllerPrivacy: 'Email za pitanja o privatnosti:',
  controllerGdpr: 'Email za GDPR zahtjeve:',

  s2Title: '2. Kategorije podataka koje obrađujemo',
  s2_1Title: '2.1 Podaci o računu',
  s2_1: [
    'Email adresa',
    'Hashirana lozinka (bcrypt, ne pohranjujemo plaintext)',
    'Ime ili nadimak (opcionalno)',
    'Avatar (opcionalno)',
    'Jezik sučelja (HR/EN/DE)',
    'Vrijeme posljednje prijave i IP adresa (sigurnosni log, 90 dana)',
  ],
  s2_2Title: '2.2 Financijski i poslovni podaci',
  s2_2: [
    'Transakcije (iznos, datum, kategorija, opis, način plaćanja)',
    'Računi/fakture (slike i ekstrahirani podaci)',
    'Budžeti, projekti, ponavljajuće transakcije, podsjetnici',
    'Podaci o poslovanju (OIB tvrtke, naziv) — samo Biznis modul',
    'Evidencija radnog vremena i radnika — samo Biznis modul',
  ],
  s2_3Title: '2.3 Tehnički i dijagnostički podaci',
  s2_3: [
    'Tip uređaja, OS verzija, browser',
    'Push notification token (samo ako date dozvolu)',
    'Stack trace grešaka (Sentry — bez osobnih podataka)',
    'Verzija aplikacije',
  ],
  s2_4Title: '2.4 Podaci o naplati (samo plaćeni planovi)',
  s2_4: [
    'Paddle customer ID, status pretplate, datum isteka, adresa za PDV',
    'Podatke o kartici obrađuje isključivo Paddle kao trgovac na papiru (Merchant of Record) — mi ih nikad ne vidimo niti pohranjujemo',
  ],

  s3Title: '3. Pravne osnove obrade (čl. 6. GDPR)',
  s3: [
    { label: 'Izvršenje ugovora (čl. 6/1/b)', text: 'kreiranje računa, pružanje usluge, obrada plaćanja' },
    { label: 'Legitimni interes (čl. 6/1/f)', text: 'sigurnosni logovi, sprečavanje zlouporabe, dijagnostika grešaka' },
    { label: 'Privola (čl. 6/1/a)', text: 'push notifikacije, AI asistent, opcionalna sinkronizacija u cloud' },
    { label: 'Zakonska obveza (čl. 6/1/c)', text: 'čuvanje računovodstvene dokumentacije po Zakonu o računovodstvu' },
  ],

  s4Title: '4. Sub-procesori (treće strane)',
  s4Intro:
    'U svrhu pružanja usluge koristimo sljedeće provjerene sub-procesore. Sa svima je sklopljen ugovor o obradi podataka (DPA — Data Processing Agreement) i odgovarajuće mjere zaštite za prijenos podataka.',
  subProcessors: [
    {
      name: 'Supabase (preko Lovable Cloud)',
      region: 'EU (Frankfurt, Njemačka)',
      lines: [
        { label: 'Svrha', value: 'Baza podataka, autentikacija, pohrana datoteka, pozadinske funkcije' },
        { label: 'Podaci', value: 'Svi vaši podaci o računu i transakcijama, slike računa' },
        { label: 'DPA', value: 'supabase.com/legal/dpa · GDPR & SOC 2 Type II compliant' },
      ],
    },
    {
      name: 'Google LLC (Gemini API)',
      region: 'EU/SAD',
      lines: [
        { label: 'Svrha', value: 'Financijski AI asistent, OCR računa, prepoznavanje kategorija, analiza bankovnih izvoda' },
        { label: 'Podaci', value: 'Tekst vaših pitanja asistentu, slike računa koje skenirate, sadržaj izvoda koje uvozite, opis transakcija. Podaci se NE koriste za treniranje modela.' },
        { label: 'Pravna osnova prijenosa u SAD', value: 'EU-US Data Privacy Framework + Standardne ugovorne klauzule (SCC)' },
        { label: 'DPA', value: 'cloud.google.com/terms/data-processing-addendum' },
      ],
    },
    {
      name: 'Paddle.com Market Ltd.',
      region: 'UK / EU / SAD',
      lines: [
        { label: 'Svrha', value: 'Obrada plaćanja pretplata kao Merchant of Record (Paddle je trgovac koji izdaje račun i provodi povrate)' },
        { label: 'Podaci', value: 'Email, ime, adresa za PDV, podaci o kartici (obrađuje isključivo Paddle — mi ne vidimo broj kartice)' },
        { label: 'DPA', value: 'paddle.com/legal/dpa · PCI DSS Level 1' },
      ],
    },
    {
      name: 'Firebase Cloud Messaging (Google LLC)',
      region: 'Globalno (SAD)',
      lines: [
        { label: 'Svrha', value: 'Slanje push notifikacija (samo ako date dozvolu)' },
        { label: 'Podaci', value: 'Device token, sadržaj notifikacije' },
        { label: 'DPA', value: 'firebase.google.com/terms/data-processing-terms · DPF certified' },
      ],
    },
    {
      name: 'Sentry (Functional Software, Inc.)',
      region: 'EU (Frankfurt)',
      lines: [
        { label: 'Svrha', value: 'Praćenje grešaka i stabilnosti aplikacije' },
        { label: 'Podaci', value: 'Stack trace, verzija aplikacije, anonimizirani korisnik ID. Filtriramo financijske podatke prije slanja.' },
        { label: 'DPA', value: 'sentry.io/legal/dpa' },
      ],
    },
    {
      name: 'Firecrawl (Mendable, Inc.)',
      region: 'SAD',
      lines: [
        { label: 'Svrha', value: 'Dohvaćanje sadržaja s URL-ova koje sami unesete (npr. analiza ponuda)' },
        { label: 'Podaci', value: 'Samo URL koji unesete — bez vaših osobnih podataka' },
        { label: 'Pravna osnova prijenosa', value: 'Standardne ugovorne klauzule (SCC)' },
      ],
    },
    {
      name: 'Sudreg (Ministarstvo pravosuđa RH)',
      region: 'Hrvatska',
      lines: [
        { label: 'Svrha', value: 'Provjera podataka o tvrtkama (samo Biznis modul)' },
        { label: 'Podaci', value: 'Naziv firme ili OIB koji vi sami pretražujete (javni registar)' },
      ],
    },
  ],
  s4Outro: 'Ažurirana lista sub-procesora dostupna je na zahtjev putem privacy@vmbalance.com.',

  s5Title: '5. Rokovi čuvanja podataka (retention)',
  s5ColCategory: 'Kategorija podataka',
  s5ColPeriod: 'Rok čuvanja',
  retention: [
    { category: 'Aktivan korisnički račun i transakcije', period: 'Dok je račun aktivan' },
    { category: 'Nakon brisanja računa — backupi', period: '30 dana, zatim trajno brisanje' },
    { category: 'Neaktivan besplatan račun (bez prijave)', period: '24 mjeseca, zatim email upozorenje + brisanje' },
    { category: 'Sigurnosni logovi prijava', period: '90 dana' },
    { category: 'Dijagnostički logovi (Sentry, app logs)', period: '7–30 dana' },
    { category: 'Push notification logovi', period: '30 dana' },
    { category: 'AI chat poruke', period: '90 dana' },
    { category: 'Računovodstveni podaci (Biznis modul, fakture)', period: '11 godina (Zakon o računovodstvu RH)' },
    { category: 'Podaci o naplati (Paddle)', period: '10 godina (porezni zakoni)' },
  ],

  s6Title: '6. Vaša prava prema GDPR-u',
  s6Intro:
    'Kao ispitanik imate sljedeća prava koja možete ostvariti slanjem zahtjeva na gdpr@vmbalance.com. Na zahtjev odgovaramo u roku od 30 dana (može se produžiti za 60 dana u kompleksnim slučajevima — bit ćete obaviješteni).',
  s6: [
    { label: 'Pravo na pristup (čl. 15)', text: 'Dobiti kopiju svih podataka koje obrađujemo o vama.' },
    { label: 'Pravo na ispravak (čl. 16)', text: 'Ispraviti netočne ili dopuniti nepotpune podatke.' },
    { label: 'Pravo na brisanje / "pravo na zaborav" (čl. 17)', text: 'Tražiti brisanje vaših podataka.' },
    { label: 'Pravo na ograničenje obrade (čl. 18)', text: 'Privremeno zaustaviti obradu.' },
    { label: 'Pravo na prenosivost (čl. 20)', text: 'Izvesti podatke u strojno čitljivom formatu.' },
    { label: 'Pravo na prigovor (čl. 21)', text: 'Prigovoriti obradi temeljenoj na legitimnom interesu.' },
    { label: 'Pravo na povlačenje privole (čl. 7)', text: 'U bilo kojem trenutku povući privolu.' },
    { label: 'Pravo na pritužbu nadzornom tijelu (čl. 77)', text: 'Agenciji za zaštitu osobnih podataka (AZOP), Selska cesta 136, Zagreb, azop.hr.' },
  ],

  s7Title: '7. Sigurnosne mjere (čl. 32 GDPR)',
  s7: [
    'TLS 1.3 enkripcija u prijenosu (HTTPS)',
    'AES-256 enkripcija u pohrani (na razini baze)',
    'Hashirane lozinke (bcrypt)',
    'Row-Level Security (RLS) — strogo izolirani podaci po korisniku',
    'Provjera lozinki protiv baze procurjelih lozinki (HIBP)',
    'PIN kod / biometrija za pristup aplikaciji (opcionalno)',
    'Redoviti sigurnosni audit i automatsko skeniranje',
    'Obavijest o povredi podataka u roku od 72 sata (čl. 33)',
  ],

  s8Title: '8. Lokalna pohrana i kolačići',
  s8p1:
    'Aplikacija koristi localStorage i IndexedDB isključivo za pohranu vaših postavki, sesije i opcionalno lokalnih podataka. Ne koristimo marketinške kolačiće, niti pratimo vaše ponašanje izvan aplikacije.',
  s8p2:
    'Slike računa koje skenirate u aplikaciji po defaultu se pohranjuju lokalno na vašem uređaju i nikad ne napuštaju uređaj, osim ako sami eksplicitno ne migrirate u cloud.',

  s9Title: '9. Zaštita djece',
  s9p1: 'Aplikacija nije namijenjena osobama mlađim od 16 godina (čl. 8 GDPR). Ne prikupljamo namjerno podatke od maloljetnih osoba.',

  s10Title: '10. Automatizirano odlučivanje i AI',
  s10p1:
    'Koristimo AI za prepoznavanje kategorija transakcija, OCR računa i analizu bankovnih izvoda, ali to su isključivo prijedlozi koje vi potvrđujete. Ne donosimo automatizirane odluke s pravnim posljedicama za vas (čl. 22 GDPR).',

  s11Title: '11. Izmjene politike privatnosti',
  s11p1: 'O značajnim izmjenama bit ćete obaviješteni emailom i obavijesti u aplikaciji najmanje 30 dana prije stupanja na snagu.',

  s12Title: '12. Kontakt',
  contactPrivacy: 'Privatnost:',
  contactGdpr: 'GDPR zahtjevi:',
  contactSecurity: 'Sigurnost:',
  contactWeb: 'Web:',

  footer: '© 2026 Tactura j.d.o.o. · Centar · vmbalance.com',
};

const EN: PolicyContent = {
  back: 'Back',
  title: 'Privacy Policy',
  version: 'Version 2.1 — Last updated: 22 July 2026',
  intro:
    'This policy describes the processing of personal data in accordance with the General Data Protection Regulation (EU 2016/679 — GDPR) and the Croatian Act on the Implementation of the General Data Protection Regulation (Official Gazette NN 42/2018).',

  s1Title: '1. Data Controller',
  s1Intro: 'The controller of personal data within the meaning of Article 4(7) GDPR is:',
  controllerName: 'Tactura j.d.o.o. (provider of the Centar service)',
  controllerWeb: 'Web: vmbalance.com',
  controllerPrivacy: 'Privacy inquiries:',
  controllerGdpr: 'GDPR requests:',

  s2Title: '2. Categories of Data We Process',
  s2_1Title: '2.1 Account data',
  s2_1: [
    'Email address',
    'Hashed password (bcrypt; we never store plaintext)',
    'Name or nickname (optional)',
    'Avatar (optional)',
    'Interface language (HR/EN/DE)',
    'Last login time and IP address (security log, 90 days)',
  ],
  s2_2Title: '2.2 Financial and business data',
  s2_2: [
    'Transactions (amount, date, category, description, payment method)',
    'Receipts/invoices (images and extracted data)',
    'Budgets, projects, recurring transactions, reminders',
    'Business data (company tax ID/OIB, name) — Biznis module only',
    'Working-time and worker records — Biznis module only',
  ],
  s2_3Title: '2.3 Technical and diagnostic data',
  s2_3: [
    'Device type, OS version, browser',
    'Push notification token (only with your permission)',
    'Error stack traces (Sentry — without personal data)',
    'Application version',
  ],
  s2_4Title: '2.4 Billing data (paid plans only)',
  s2_4: [
    'Paddle customer ID, subscription status, expiry date, VAT address',
    'Card details are processed exclusively by Paddle as Merchant of Record — we never see or store them',
  ],

  s3Title: '3. Legal Bases for Processing (Art. 6 GDPR)',
  s3: [
    { label: 'Performance of a contract (Art. 6(1)(b))', text: 'account creation, provision of the service, payment processing' },
    { label: 'Legitimate interest (Art. 6(1)(f))', text: 'security logs, abuse prevention, error diagnostics' },
    { label: 'Consent (Art. 6(1)(a))', text: 'push notifications, AI assistant, optional cloud synchronisation' },
    { label: 'Legal obligation (Art. 6(1)(c))', text: 'retention of accounting records under the Croatian Accounting Act' },
  ],

  s4Title: '4. Sub-processors (Third Parties)',
  s4Intro:
    'To provide the service we use the following vetted sub-processors. A Data Processing Agreement (DPA) and appropriate safeguards for data transfers are in place with each of them.',
  subProcessors: [
    {
      name: 'Supabase (via Lovable Cloud)',
      region: 'EU (Frankfurt, Germany)',
      lines: [
        { label: 'Purpose', value: 'Database, authentication, file storage, background functions' },
        { label: 'Data', value: 'All your account and transaction data, receipt images' },
        { label: 'DPA', value: 'supabase.com/legal/dpa · GDPR & SOC 2 Type II compliant' },
      ],
    },
    {
      name: 'Google LLC (Gemini API)',
      region: 'EU/USA',
      lines: [
        { label: 'Purpose', value: 'Financial AI assistant, receipt OCR, category recognition, bank statement analysis' },
        { label: 'Data', value: 'The text of your questions to the assistant, receipt images you scan, the contents of statements you import, transaction descriptions. Data is NOT used for model training.' },
        { label: 'Legal basis for US transfers', value: 'EU-US Data Privacy Framework + Standard Contractual Clauses (SCC)' },
        { label: 'DPA', value: 'cloud.google.com/terms/data-processing-addendum' },
      ],
    },
    {
      name: 'Paddle.com Market Ltd.',
      region: 'UK / EU / USA',
      lines: [
        { label: 'Purpose', value: 'Subscription payment processing as Merchant of Record (Paddle is the seller of record that issues invoices and handles refunds)' },
        { label: 'Data', value: 'Email, name, VAT address, card details (processed exclusively by Paddle — we never see the card number)' },
        { label: 'DPA', value: 'paddle.com/legal/dpa · PCI DSS Level 1' },
      ],
    },
    {
      name: 'Firebase Cloud Messaging (Google LLC)',
      region: 'Global (USA)',
      lines: [
        { label: 'Purpose', value: 'Sending push notifications (only with your permission)' },
        { label: 'Data', value: 'Device token, notification content' },
        { label: 'DPA', value: 'firebase.google.com/terms/data-processing-terms · DPF certified' },
      ],
    },
    {
      name: 'Sentry (Functional Software, Inc.)',
      region: 'EU (Frankfurt)',
      lines: [
        { label: 'Purpose', value: 'Error and stability monitoring' },
        { label: 'Data', value: 'Stack traces, application version, anonymised user ID. Financial data is filtered out before sending.' },
        { label: 'DPA', value: 'sentry.io/legal/dpa' },
      ],
    },
    {
      name: 'Firecrawl (Mendable, Inc.)',
      region: 'USA',
      lines: [
        { label: 'Purpose', value: 'Fetching content from URLs you enter yourself (e.g. offer analysis)' },
        { label: 'Data', value: 'Only the URL you enter — none of your personal data' },
        { label: 'Legal basis for transfers', value: 'Standard Contractual Clauses (SCC)' },
      ],
    },
    {
      name: 'Sudreg (Croatian Ministry of Justice)',
      region: 'Croatia',
      lines: [
        { label: 'Purpose', value: 'Company data verification (Biznis module only)' },
        { label: 'Data', value: 'The company name or tax ID (OIB) you search for yourself (public register)' },
      ],
    },
  ],
  s4Outro: 'An up-to-date list of sub-processors is available on request via privacy@vmbalance.com.',

  s5Title: '5. Data Retention Periods',
  s5ColCategory: 'Data category',
  s5ColPeriod: 'Retention period',
  retention: [
    { category: 'Active user account and transactions', period: 'While the account is active' },
    { category: 'After account deletion — backups', period: '30 days, then permanent deletion' },
    { category: 'Inactive free account (no login)', period: '24 months, then email warning + deletion' },
    { category: 'Login security logs', period: '90 days' },
    { category: 'Diagnostic logs (Sentry, app logs)', period: '7–30 days' },
    { category: 'Push notification logs', period: '30 days' },
    { category: 'AI chat messages', period: '90 days' },
    { category: 'Accounting records (Biznis module, invoices)', period: '11 years (Croatian Accounting Act)' },
    { category: 'Billing data (Paddle)', period: '10 years (tax law)' },
  ],

  s6Title: '6. Your Rights under the GDPR',
  s6Intro:
    'As a data subject you have the following rights, which you can exercise by sending a request to gdpr@vmbalance.com. We respond within 30 days (extendable by 60 days in complex cases — you will be informed).',
  s6: [
    { label: 'Right of access (Art. 15)', text: 'Receive a copy of all data we process about you.' },
    { label: 'Right to rectification (Art. 16)', text: 'Correct inaccurate or complete incomplete data.' },
    { label: 'Right to erasure / "right to be forgotten" (Art. 17)', text: 'Request deletion of your data.' },
    { label: 'Right to restriction of processing (Art. 18)', text: 'Temporarily suspend processing.' },
    { label: 'Right to data portability (Art. 20)', text: 'Export your data in a machine-readable format.' },
    { label: 'Right to object (Art. 21)', text: 'Object to processing based on legitimate interest.' },
    { label: 'Right to withdraw consent (Art. 7)', text: 'Withdraw consent at any time.' },
    { label: 'Right to lodge a complaint with a supervisory authority (Art. 77)', text: 'the Croatian Personal Data Protection Agency (AZOP), Selska cesta 136, Zagreb, azop.hr.' },
  ],

  s7Title: '7. Security Measures (Art. 32 GDPR)',
  s7: [
    'TLS 1.3 encryption in transit (HTTPS)',
    'AES-256 encryption at rest (database level)',
    'Hashed passwords (bcrypt)',
    'Row-Level Security (RLS) — strictly isolated per-user data',
    'Password checks against breached-password databases (HIBP)',
    'PIN code / biometrics for app access (optional)',
    'Regular security audits and automated scanning',
    'Data breach notification within 72 hours (Art. 33)',
  ],

  s8Title: '8. Local Storage and Cookies',
  s8p1:
    'The application uses localStorage and IndexedDB exclusively to store your settings, session, and optionally local data. We use no marketing cookies and do not track your behaviour outside the application.',
  s8p2:
    'Receipt images you scan in the application are stored locally on your device by default and never leave your device unless you explicitly migrate them to the cloud.',

  s9Title: '9. Protection of Children',
  s9p1: 'The application is not intended for persons under 16 years of age (Art. 8 GDPR). We do not knowingly collect data from minors.',

  s10Title: '10. Automated Decision-Making and AI',
  s10p1:
    'We use AI for transaction category recognition, receipt OCR and bank statement analysis, but these are strictly suggestions that you confirm. We make no automated decisions with legal effects concerning you (Art. 22 GDPR).',

  s11Title: '11. Changes to this Privacy Policy',
  s11p1: 'You will be notified of significant changes by email and in-app notification at least 30 days before they take effect.',

  s12Title: '12. Contact',
  contactPrivacy: 'Privacy:',
  contactGdpr: 'GDPR requests:',
  contactSecurity: 'Security:',
  contactWeb: 'Web:',

  footer: '© 2026 Tactura j.d.o.o. · Centar · vmbalance.com',
};

const DE: PolicyContent = {
  back: 'Zurück',
  title: 'Datenschutzerklärung',
  version: 'Version 2.1 — Zuletzt geändert: 22. Juli 2026',
  intro:
    'Diese Erklärung beschreibt die Verarbeitung personenbezogener Daten gemäß der Datenschutz-Grundverordnung (EU 2016/679 — DSGVO) und dem kroatischen Gesetz zur Durchführung der Datenschutz-Grundverordnung (NN 42/2018).',

  s1Title: '1. Verantwortlicher',
  s1Intro: 'Verantwortlicher für die Verarbeitung personenbezogener Daten im Sinne von Art. 4 Nr. 7 DSGVO ist:',
  controllerName: 'Tactura j.d.o.o. (Anbieter des Dienstes Centar)',
  controllerWeb: 'Web: vmbalance.com',
  controllerPrivacy: 'Datenschutzanfragen:',
  controllerGdpr: 'DSGVO-Anfragen:',

  s2Title: '2. Kategorien der verarbeiteten Daten',
  s2_1Title: '2.1 Kontodaten',
  s2_1: [
    'E-Mail-Adresse',
    'Gehashtes Passwort (bcrypt; Klartext wird nie gespeichert)',
    'Name oder Spitzname (optional)',
    'Avatar (optional)',
    'Sprache der Benutzeroberfläche (HR/EN/DE)',
    'Zeitpunkt der letzten Anmeldung und IP-Adresse (Sicherheitsprotokoll, 90 Tage)',
  ],
  s2_2Title: '2.2 Finanz- und Geschäftsdaten',
  s2_2: [
    'Transaktionen (Betrag, Datum, Kategorie, Beschreibung, Zahlungsart)',
    'Belege/Rechnungen (Bilder und extrahierte Daten)',
    'Budgets, Projekte, wiederkehrende Transaktionen, Erinnerungen',
    'Geschäftsdaten (Steuernummer/OIB des Unternehmens, Firmenname) — nur Biznis-Modul',
    'Arbeitszeit- und Mitarbeitererfassung — nur Biznis-Modul',
  ],
  s2_3Title: '2.3 Technische und Diagnosedaten',
  s2_3: [
    'Gerätetyp, Betriebssystemversion, Browser',
    'Push-Benachrichtigungs-Token (nur mit Ihrer Erlaubnis)',
    'Fehler-Stacktraces (Sentry — ohne personenbezogene Daten)',
    'App-Version',
  ],
  s2_4Title: '2.4 Abrechnungsdaten (nur kostenpflichtige Tarife)',
  s2_4: [
    'Paddle-Kunden-ID, Abonnementstatus, Ablaufdatum, Adresse für die Umsatzsteuer',
    'Kartendaten werden ausschließlich von Paddle als Merchant of Record verarbeitet — wir sehen und speichern sie niemals',
  ],

  s3Title: '3. Rechtsgrundlagen der Verarbeitung (Art. 6 DSGVO)',
  s3: [
    { label: 'Vertragserfüllung (Art. 6 Abs. 1 lit. b)', text: 'Kontoerstellung, Bereitstellung des Dienstes, Zahlungsabwicklung' },
    { label: 'Berechtigtes Interesse (Art. 6 Abs. 1 lit. f)', text: 'Sicherheitsprotokolle, Missbrauchsprävention, Fehlerdiagnose' },
    { label: 'Einwilligung (Art. 6 Abs. 1 lit. a)', text: 'Push-Benachrichtigungen, KI-Assistent, optionale Cloud-Synchronisierung' },
    { label: 'Rechtliche Verpflichtung (Art. 6 Abs. 1 lit. c)', text: 'Aufbewahrung von Buchhaltungsunterlagen nach dem kroatischen Rechnungslegungsgesetz' },
  ],

  s4Title: '4. Subunternehmer (Dritte)',
  s4Intro:
    'Zur Bereitstellung des Dienstes setzen wir die folgenden geprüften Auftragsverarbeiter ein. Mit allen bestehen ein Auftragsverarbeitungsvertrag (DPA — Data Processing Agreement) sowie geeignete Garantien für Datenübermittlungen.',
  subProcessors: [
    {
      name: 'Supabase (über Lovable Cloud)',
      region: 'EU (Frankfurt, Deutschland)',
      lines: [
        { label: 'Zweck', value: 'Datenbank, Authentifizierung, Dateispeicherung, Hintergrundfunktionen' },
        { label: 'Daten', value: 'Alle Ihre Konto- und Transaktionsdaten, Belegbilder' },
        { label: 'DPA', value: 'supabase.com/legal/dpa · DSGVO- & SOC 2 Type II-konform' },
      ],
    },
    {
      name: 'Google LLC (Gemini API)',
      region: 'EU/USA',
      lines: [
        { label: 'Zweck', value: 'Finanz-KI-Assistent, Beleg-OCR, Kategorieerkennung, Analyse von Kontoauszügen' },
        { label: 'Daten', value: 'Der Text Ihrer Fragen an den Assistenten, gescannte Belegbilder, Inhalte importierter Kontoauszüge, Transaktionsbeschreibungen. Die Daten werden NICHT zum Training von Modellen verwendet.' },
        { label: 'Rechtsgrundlage für Übermittlungen in die USA', value: 'EU-US Data Privacy Framework + Standardvertragsklauseln (SCC)' },
        { label: 'DPA', value: 'cloud.google.com/terms/data-processing-addendum' },
      ],
    },
    {
      name: 'Paddle.com Market Ltd.',
      region: 'UK / EU / USA',
      lines: [
        { label: 'Zweck', value: 'Abwicklung von Abonnementzahlungen als Merchant of Record (Paddle ist der Händler, der die Rechnung stellt und Erstattungen durchführt)' },
        { label: 'Daten', value: 'E-Mail, Name, Adresse für die Umsatzsteuer, Kartendaten (ausschließlich von Paddle verarbeitet — wir sehen die Kartennummer nie)' },
        { label: 'DPA', value: 'paddle.com/legal/dpa · PCI DSS Level 1' },
      ],
    },
    {
      name: 'Firebase Cloud Messaging (Google LLC)',
      region: 'Weltweit (USA)',
      lines: [
        { label: 'Zweck', value: 'Versand von Push-Benachrichtigungen (nur mit Ihrer Erlaubnis)' },
        { label: 'Daten', value: 'Geräte-Token, Benachrichtigungsinhalt' },
        { label: 'DPA', value: 'firebase.google.com/terms/data-processing-terms · DPF-zertifiziert' },
      ],
    },
    {
      name: 'Sentry (Functional Software, Inc.)',
      region: 'EU (Frankfurt)',
      lines: [
        { label: 'Zweck', value: 'Überwachung von Fehlern und Stabilität der App' },
        { label: 'Daten', value: 'Stacktraces, App-Version, anonymisierte Nutzer-ID. Finanzdaten werden vor dem Senden herausgefiltert.' },
        { label: 'DPA', value: 'sentry.io/legal/dpa' },
      ],
    },
    {
      name: 'Firecrawl (Mendable, Inc.)',
      region: 'USA',
      lines: [
        { label: 'Zweck', value: 'Abruf von Inhalten von URLs, die Sie selbst eingeben (z. B. Angebotsanalyse)' },
        { label: 'Daten', value: 'Nur die von Ihnen eingegebene URL — keine Ihrer personenbezogenen Daten' },
        { label: 'Rechtsgrundlage für Übermittlungen', value: 'Standardvertragsklauseln (SCC)' },
      ],
    },
    {
      name: 'Sudreg (Justizministerium der Republik Kroatien)',
      region: 'Kroatien',
      lines: [
        { label: 'Zweck', value: 'Überprüfung von Unternehmensdaten (nur Biznis-Modul)' },
        { label: 'Daten', value: 'Der Firmenname oder die Steuernummer (OIB), die Sie selbst abfragen (öffentliches Register)' },
      ],
    },
  ],
  s4Outro: 'Eine aktuelle Liste der Subunternehmer ist auf Anfrage über privacy@vmbalance.com erhältlich.',

  s5Title: '5. Speicherfristen',
  s5ColCategory: 'Datenkategorie',
  s5ColPeriod: 'Speicherfrist',
  retention: [
    { category: 'Aktives Benutzerkonto und Transaktionen', period: 'Solange das Konto aktiv ist' },
    { category: 'Nach Kontolöschung — Backups', period: '30 Tage, danach endgültige Löschung' },
    { category: 'Inaktives kostenloses Konto (ohne Anmeldung)', period: '24 Monate, danach E-Mail-Warnung + Löschung' },
    { category: 'Sicherheitsprotokolle der Anmeldungen', period: '90 Tage' },
    { category: 'Diagnoseprotokolle (Sentry, App-Logs)', period: '7–30 Tage' },
    { category: 'Push-Benachrichtigungsprotokolle', period: '30 Tage' },
    { category: 'KI-Chat-Nachrichten', period: '90 Tage' },
    { category: 'Buchhaltungsunterlagen (Biznis-Modul, Rechnungen)', period: '11 Jahre (kroatisches Rechnungslegungsgesetz)' },
    { category: 'Abrechnungsdaten (Paddle)', period: '10 Jahre (Steuerrecht)' },
  ],

  s6Title: '6. Ihre Rechte nach der DSGVO',
  s6Intro:
    'Als betroffene Person haben Sie die folgenden Rechte, die Sie durch eine Anfrage an gdpr@vmbalance.com ausüben können. Wir antworten innerhalb von 30 Tagen (in komplexen Fällen um 60 Tage verlängerbar — Sie werden informiert).',
  s6: [
    { label: 'Auskunftsrecht (Art. 15)', text: 'Eine Kopie aller Daten erhalten, die wir über Sie verarbeiten.' },
    { label: 'Recht auf Berichtigung (Art. 16)', text: 'Unrichtige Daten berichtigen oder unvollständige vervollständigen.' },
    { label: 'Recht auf Löschung / „Recht auf Vergessenwerden" (Art. 17)', text: 'Löschung Ihrer Daten verlangen.' },
    { label: 'Recht auf Einschränkung der Verarbeitung (Art. 18)', text: 'Verarbeitung vorübergehend aussetzen.' },
    { label: 'Recht auf Datenübertragbarkeit (Art. 20)', text: 'Daten in einem maschinenlesbaren Format exportieren.' },
    { label: 'Widerspruchsrecht (Art. 21)', text: 'Widerspruch gegen Verarbeitung auf Grundlage berechtigten Interesses.' },
    { label: 'Recht auf Widerruf der Einwilligung (Art. 7)', text: 'Einwilligung jederzeit widerrufen.' },
    { label: 'Beschwerderecht bei einer Aufsichtsbehörde (Art. 77)', text: 'bei der kroatischen Datenschutzbehörde (AZOP), Selska cesta 136, Zagreb, azop.hr.' },
  ],

  s7Title: '7. Sicherheitsmaßnahmen (Art. 32 DSGVO)',
  s7: [
    'TLS-1.3-Verschlüsselung bei der Übertragung (HTTPS)',
    'AES-256-Verschlüsselung im Ruhezustand (auf Datenbankebene)',
    'Gehashte Passwörter (bcrypt)',
    'Row-Level Security (RLS) — streng isolierte Daten pro Benutzer',
    'Passwortprüfung gegen Datenbanken kompromittierter Passwörter (HIBP)',
    'PIN-Code / Biometrie für den App-Zugriff (optional)',
    'Regelmäßige Sicherheitsaudits und automatisches Scannen',
    'Meldung von Datenschutzverletzungen innerhalb von 72 Stunden (Art. 33)',
  ],

  s8Title: '8. Lokale Speicherung und Cookies',
  s8p1:
    'Die App verwendet localStorage und IndexedDB ausschließlich zur Speicherung Ihrer Einstellungen, Ihrer Sitzung und optional lokaler Daten. Wir verwenden keine Marketing-Cookies und verfolgen Ihr Verhalten außerhalb der App nicht.',
  s8p2:
    'Belegbilder, die Sie in der App scannen, werden standardmäßig lokal auf Ihrem Gerät gespeichert und verlassen Ihr Gerät nie, es sei denn, Sie migrieren sie ausdrücklich selbst in die Cloud.',

  s9Title: '9. Schutz von Kindern',
  s9p1: 'Die App ist nicht für Personen unter 16 Jahren bestimmt (Art. 8 DSGVO). Wir erheben wissentlich keine Daten von Minderjährigen.',

  s10Title: '10. Automatisierte Entscheidungsfindung und KI',
  s10p1:
    'Wir nutzen KI zur Erkennung von Transaktionskategorien, für Beleg-OCR und die Analyse von Kontoauszügen — dies sind jedoch ausschließlich Vorschläge, die Sie bestätigen. Wir treffen keine automatisierten Entscheidungen mit rechtlicher Wirkung für Sie (Art. 22 DSGVO).',

  s11Title: '11. Änderungen dieser Datenschutzerklärung',
  s11p1: 'Über wesentliche Änderungen werden Sie per E-Mail und In-App-Benachrichtigung mindestens 30 Tage vor Inkrafttreten informiert.',

  s12Title: '12. Kontakt',
  contactPrivacy: 'Datenschutz:',
  contactGdpr: 'DSGVO-Anfragen:',
  contactSecurity: 'Sicherheit:',
  contactWeb: 'Web:',

  footer: '© 2026 Tactura j.d.o.o. · Centar · vmbalance.com',
};

const CONTENT: Record<Lang, PolicyContent> = { hr: HR, en: EN, de: DE };

const resolveLang = (raw: string | undefined): Lang => {
  const code = (raw ?? '').toLowerCase().split('-')[0];
  if (code === 'en') return 'en';
  if (code === 'de') return 'de';
  return 'hr';
};

const PrivacyPolicy = () => {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const [lang, setLang] = useState<Lang>(() => resolveLang(i18n.language));

  useEffect(() => {
    setLang(resolveLang(i18n.language));
  }, [i18n.language]);

  const c = CONTENT[lang];

  const langButtons: Array<{ code: Lang; label: string }> = [
    { code: 'hr', label: 'HR' },
    { code: 'en', label: 'EN' },
    { code: 'de', label: 'DE' },
  ];

  return (
    <div className="min-h-dvh bg-background">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6 gap-2 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            {c.back}
          </Button>
          <div className="inline-flex rounded-lg border border-border overflow-hidden" role="group" aria-label="Language">
            {langButtons.map((b, i) => (
              <button
                key={b.code}
                type="button"
                onClick={() => setLang(b.code)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium transition-colors',
                  i > 0 && 'border-l border-border',
                  lang === b.code
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
                aria-pressed={lang === b.code}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>

        <h1 className="text-3xl font-bold text-foreground mb-2">{c.title}</h1>
        <p className="text-muted-foreground mb-2">{c.version}</p>
        <p className="text-muted-foreground mb-8 text-sm">{c.intro}</p>

        <div className="prose prose-sm max-w-none space-y-8 text-foreground">
          <section>
            <h2 className="text-xl font-semibold mb-3">{c.s1Title}</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">{c.s1Intro}</p>
            <div className="p-4 bg-muted rounded-lg space-y-1">
              <p className="font-medium">{c.controllerName}</p>
              <p className="text-muted-foreground">{c.controllerWeb}</p>
              <p className="text-muted-foreground">
                {c.controllerPrivacy}{' '}
                <a href="mailto:privacy@vmbalance.com" className="text-primary hover:underline">
                  privacy@vmbalance.com
                </a>
              </p>
              <p className="text-muted-foreground">
                {c.controllerGdpr}{' '}
                <a href="mailto:gdpr@vmbalance.com" className="text-primary hover:underline">
                  gdpr@vmbalance.com
                </a>
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{c.s2Title}</h2>
            {[
              { title: c.s2_1Title, items: c.s2_1 },
              { title: c.s2_2Title, items: c.s2_2 },
              { title: c.s2_3Title, items: c.s2_3 },
              { title: c.s2_4Title, items: c.s2_4 },
            ].map((sub) => (
              <div key={sub.title} className="mb-4">
                <h3 className="text-base font-semibold mb-2">{sub.title}</h3>
                <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
                  {sub.items.map((it, i) => <li key={i}>{it}</li>)}
                </ul>
              </div>
            ))}
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{c.s3Title}</h2>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
              {c.s3.map((row, i) => (
                <li key={i}><strong className="text-foreground">{row.label}</strong> — {row.text}</li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{c.s4Title}</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">{c.s4Intro}</p>
            <div className="space-y-4">
              {c.subProcessors.map((sp) => (
                <div key={sp.name} className="p-4 bg-muted rounded-lg">
                  <p className="font-medium text-foreground">
                    {sp.name} <span className="text-muted-foreground font-normal">— {sp.region}</span>
                  </p>
                  <div className="mt-2 space-y-1">
                    {sp.lines.map((ln, i) => (
                      <p key={i} className="text-muted-foreground text-sm">
                        <strong className="text-foreground">{ln.label}:</strong> {ln.value}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-muted-foreground text-sm italic mt-4">{c.s4Outro}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{c.s5Title}</h2>
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{c.s5ColCategory}</TableHead>
                    <TableHead>{c.s5ColPeriod}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {c.retention.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-muted-foreground">{row.category}</TableCell>
                      <TableCell className="text-muted-foreground">{row.period}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{c.s6Title}</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">{c.s6Intro}</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
              {c.s6.map((row, i) => (
                <li key={i}><strong className="text-foreground">{row.label}</strong> — {row.text}</li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{c.s7Title}</h2>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
              {c.s7.map((it, i) => <li key={i}>{it}</li>)}
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{c.s8Title}</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">{c.s8p1}</p>
            <p className="text-muted-foreground leading-relaxed">{c.s8p2}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{c.s9Title}</h2>
            <p className="text-muted-foreground leading-relaxed">{c.s9p1}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{c.s10Title}</h2>
            <p className="text-muted-foreground leading-relaxed">{c.s10p1}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{c.s11Title}</h2>
            <p className="text-muted-foreground leading-relaxed">{c.s11p1}</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{c.s12Title}</h2>
            <div className="p-4 bg-muted rounded-lg space-y-1">
              <p className="font-medium">{c.controllerName}</p>
              <p className="text-muted-foreground">
                {c.contactPrivacy}{' '}
                <a href="mailto:privacy@vmbalance.com" className="text-primary hover:underline">privacy@vmbalance.com</a>
              </p>
              <p className="text-muted-foreground">
                {c.contactGdpr}{' '}
                <a href="mailto:gdpr@vmbalance.com" className="text-primary hover:underline">gdpr@vmbalance.com</a>
              </p>
              <p className="text-muted-foreground">
                {c.contactSecurity}{' '}
                <a href="mailto:security@vmbalance.com" className="text-primary hover:underline">security@vmbalance.com</a>
              </p>
              <p className="text-muted-foreground">
                {c.contactWeb}{' '}
                <a href="https://vmbalance.com" className="text-primary hover:underline">vmbalance.com</a>
              </p>
            </div>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-border text-center text-sm text-muted-foreground">
          <p>{c.footer}</p>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
