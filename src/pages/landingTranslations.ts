export type LandingLanguage = 'hr' | 'en' | 'de';

interface TranslationTree {
  [key: string]: string | TranslationTree;
}

const translations: Record<LandingLanguage, TranslationTree> = {
  hr: {
    language: {
      label: 'Jezik',
      hr: 'Hrvatski',
      en: 'English',
      de: 'Deutsch',
    },
    alt: {
      logo: 'V&M Balance logo',
      hero: 'Pametni telefon, kalkulator i novčanice na stolu',
      cards: 'Kartice za plaćanje',
      dashboard: 'V&M Balance nadzorna ploča',
      budget: 'V&M Balance budžeti',
    },
    landing: {
      nav: {
        features: 'Značajke',
        pricing: 'Cijene',
        testimonials: 'Recenzije',
        login: 'Prijava',
        getStarted: 'Započni',
      },
      hero: {
        badge: 'Vaš financijski kontrolni centar',
        title: 'Preuzmite kontrolu nad',
        titleHighlight: 'Vašim financijama',
        subtitle: 'Pratite troškove u realnom vremenu, kontrolirajte projekte, generirajte izvještaje za računovođu — sve u jednoj aplikaciji.',
        cta: 'Započni besplatno',
        installApp: 'Instaliraj aplikaciju',
        free: 'Besplatno za početak',
        secure: 'Bankovna sigurnost',
        multilingual: 'Višejezično',
      },
      showcase: {
        title: 'Aplikacija u tvojim rukama',
        subtitle: 'Prekrasno dizajnirana, jednostavna za korištenje i dostupna na svim uređajima.',
      },
      features: {
        title: 'Sve što trebate',
        subtitle: 'Moćni alati za upravljanje svakim aspektom vaših financija',
        tracking: { title: 'Praćenje troškova', desc: 'Automatski kategorizirajte i pratite svaku transakciju uz AI uvide i skeniranje računa.' },
        reports: { title: 'Pametna izvješća', desc: 'Vizualni grafikoni i detaljni pregledi po kategoriji, razdoblju i izvoru plaćanja.' },
        family: { title: 'Poslovni projekti', desc: 'Pratite projekte s budžetima, fazama i izvještajima. Osobno i poslovno na jednom mjestu.' },
        wallet: { title: 'Više novčanika', desc: 'Upravljajte s više računa, kartica i izvora plaćanja na jednom mjestu s ažurnim saldima.' },
        receipts: { title: 'Skener računa', desc: 'Slikajte račun i pustite AI da izvuče sve artikle, iznose i kategorije.' },
        budgets: { title: 'Planiranje budžeta', desc: 'Postavite limite potrošnje po kategoriji, pratite napredak i dobijte upozorenja prije prekoračenja.' },
      },
      pricing: {
        title: 'Jednostavne, transparentne cijene',
        subtitle: 'Započnite besplatno, nadogradite kad trebate više',
        month: 'mj',
        popular: 'Najpopularnije',
        cta: 'Započni',
        free: { name: 'Besplatno', price: '€0', f1: 'Do 30 transakcija/mj', f2: '1 izvor plaćanja', f3: '1 budžet', f4: 'Skeniranje računa (5/mj)' },
        pro: { name: 'Pro', price: '€7,99', f1: 'Sve iz Besplatnog', f2: 'Neograničeni projekti i budžeti', f3: 'AI uvidi i izvještaji', f4: 'Osobno + poslovno praćenje' },
        business: { name: 'Poslovno', price: '€14,99', f1: 'Sve iz Pro', f2: 'Radnici i satnice', f3: 'Timski i višekorisnički pristup', f4: 'Napredni projekti sa suradnicima' },
      },
      testimonials: {
        title: 'Korisnici nas vole',
        subtitle: 'Pogledajte što kažu naši korisnici',
        t1: { name: 'Ana M.', role: 'Freelancer', text: 'Konačno aplikacija koja upravlja i osobnim i poslovnim financijama! Skener računa mi štedi sate svaki mjesec.' },
        t2: { name: 'Marko K.', role: 'Tata obitelji', text: 'Dijelimo obiteljski budžet i svi mogu vidjeti kamo novac odlazi. Promijenilo je igru za naše kućanstvo.' },
        t3: { name: 'Ivan P.', role: 'Vlasnik malog poduzeća', text: 'Praćenje projekata i kontrola troškova su nevjerojatno korisni. Konačno vidim kamo novac odlazi na svakom projektu.' },
      },
      footer: {
        desc: 'Vaš financijski kontrolni centar za osobne i poslovne financije.',
        product: 'Proizvod',
        legal: 'Pravno',
        privacy: 'Pravila privatnosti',
        account: 'Račun',
        rights: 'Sva prava pridržana.',
      },
      apk: {
        title: 'Preuzmi V&M Balance',
        subtitle: 'Tvoj prijatelj ti preporučuje aplikaciju za praćenje financija. Preuzmi, instaliraj i započni!',
        download: 'Preuzmi APK za Android',
        instructions: 'Kako instalirati:',
        step1: 'Preuzmi APK datoteku',
        step2: 'Otvori datoteku na mobitelu',
        step3: 'Dozvoli instalaciju iz nepoznatih izvora',
        step4: 'Instaliraj i otvori aplikaciju',
        referralLabel: 'Tvoj referral kod:',
        referralHint: 'Unesi ovaj kod pri registraciji u aplikaciji',
        webOption: 'Ili se registriraj putem weba:',
      },
    },
  },
  en: {
    language: { label: 'Language', hr: 'Hrvatski', en: 'English', de: 'Deutsch' },
    alt: { logo: 'V&M Balance logo', hero: 'Smartphone, calculator and banknotes on a desk', cards: 'Payment cards', dashboard: 'V&M Balance dashboard', budget: 'V&M Balance budgets' },
    landing: {
      nav: { features: 'Features', pricing: 'Pricing', testimonials: 'Reviews', login: 'Log In', getStarted: 'Get Started' },
      hero: { badge: 'Your Financial Control Center', title: 'Take Control of Your', titleHighlight: 'Financial Life', subtitle: 'Track expenses in real-time, control projects, generate reports for your accountant — all in one app.', cta: 'Start Free', installApp: 'Install App', free: 'Free to start', secure: 'Bank-level security', multilingual: 'Multilingual' },
      showcase: { title: 'The app in your hands', subtitle: 'Beautifully designed, simple to use, and available on every device.' },
      features: {
        title: 'Everything You Need', subtitle: 'Powerful tools to manage every aspect of your finances',
        tracking: { title: 'Expense Tracking', desc: 'Automatically categorize and track every transaction with AI-powered insights and receipt scanning.' },
        reports: { title: 'Smart Reports', desc: 'Visual charts and detailed breakdowns by category, period, and payment source.' },
        family: { title: 'Business Projects', desc: 'Track projects with budgets, milestones and reports. Personal and business in one place.' },
        wallet: { title: 'Multi-Wallet', desc: 'Manage multiple accounts, cards, and payment sources in one place with live balances.' },
        receipts: { title: 'Receipt Scanner', desc: 'Snap a photo of your receipt and let AI extract all items, amounts and categories.' },
        budgets: { title: 'Budget Planning', desc: 'Set spending limits by category, track progress, and get alerts before overspending.' },
      },
      pricing: {
        title: 'Simple, Transparent Pricing', subtitle: 'Start free, upgrade when you need more', month: 'mo', popular: 'Most Popular', cta: 'Get Started',
        free: { name: 'Free', price: '€0', f1: 'Up to 30 transactions/mo', f2: '1 payment source', f3: '1 budget', f4: 'Receipt scanning (5/mo)' },
        pro: { name: 'Pro', price: '€7.99', f1: 'Everything in Free', f2: 'Unlimited projects & budgets', f3: 'AI insights & reports', f4: 'Personal + business tracking' },
        business: { name: 'Business', price: '€14.99', f1: 'Everything in Pro', f2: 'Workers & timesheets', f3: 'Team & multi-user access', f4: 'Advanced projects with collaborators' },
      },
      testimonials: {
        title: 'Loved by Users', subtitle: 'See what our users are saying',
        t1: { name: 'Ana M.', role: 'Freelancer', text: 'Finally an app that handles both personal and business finances! The receipt scanner saves me hours every month.' },
        t2: { name: 'Marko K.', role: 'Family Dad', text: 'We share a family budget and everyone can see where money goes. Game changer for our household.' },
        t3: { name: 'Ivan P.', role: 'Small Business Owner', text: 'Project tracking and expense control are incredibly useful. I finally see where money goes on every project.' },
      },
      footer: { desc: 'Your financial control center for personal and business finances.', product: 'Product', legal: 'Legal', privacy: 'Privacy Policy', account: 'Account', rights: 'All rights reserved.' },
      apk: { title: 'Download V&M Balance', subtitle: 'A friend recommends this finance tracking app. Download, install, and start!', download: 'Download APK for Android', instructions: 'How to install:', step1: 'Download the APK file', step2: 'Open the file on your phone', step3: 'Allow installation from unknown sources', step4: 'Install and open the app', referralLabel: 'Your referral code:', referralHint: 'Enter this code during registration', webOption: 'Or register on the web:' },
    },
  },
  de: {
    language: { label: 'Sprache', hr: 'Hrvatski', en: 'English', de: 'Deutsch' },
    alt: { logo: 'V&M Balance Logo', hero: 'Smartphone, Taschenrechner und Banknoten auf einem Tisch', cards: 'Zahlungskarten', dashboard: 'V&M Balance Dashboard', budget: 'V&M Balance Budgets' },
    landing: {
      nav: { features: 'Funktionen', pricing: 'Preise', testimonials: 'Bewertungen', login: 'Anmelden', getStarted: 'Loslegen' },
      hero: { badge: 'Ihr Finanzkontrollzentrum', title: 'Übernehmen Sie die Kontrolle über', titleHighlight: 'Ihr Finanzleben', subtitle: 'Verfolgen Sie Ausgaben in Echtzeit, kontrollieren Sie Projekte, erstellen Sie Berichte für Ihren Buchhalter — alles in einer App.', cta: 'Kostenlos starten', installApp: 'App installieren', free: 'Kostenlos starten', secure: 'Banksicherheit', multilingual: 'Mehrsprachig' },
      showcase: { title: 'Die App in Ihren Händen', subtitle: 'Schön gestaltet, einfach zu bedienen und auf allen Geräten verfügbar.' },
      features: {
        title: 'Alles was Sie brauchen', subtitle: 'Leistungsstarke Tools zur Verwaltung aller Aspekte Ihrer Finanzen',
        tracking: { title: 'Ausgabenverfolgung', desc: 'Kategorisieren und verfolgen Sie jede Transaktion automatisch mit KI-gestützten Einblicken und Belegscanning.' },
        reports: { title: 'Intelligente Berichte', desc: 'Visuelle Diagramme und detaillierte Aufschlüsselungen nach Kategorie, Zeitraum und Zahlungsquelle.' },
        family: { title: 'Geschäftsprojekte', desc: 'Verfolgen Sie Projekte mit Budgets, Meilensteinen und Berichten. Privat und geschäftlich an einem Ort.' },
        wallet: { title: 'Multi-Wallet', desc: 'Verwalten Sie mehrere Konten, Karten und Zahlungsquellen an einem Ort mit Live-Salden.' },
        receipts: { title: 'Belegscanner', desc: 'Fotografieren Sie Ihren Beleg und lassen Sie KI alle Artikel, Beträge und Kategorien extrahieren.' },
        budgets: { title: 'Budgetplanung', desc: 'Setzen Sie Ausgabenlimits nach Kategorie, verfolgen Sie den Fortschritt und erhalten Sie Warnungen.' },
      },
      pricing: {
        title: 'Einfache, transparente Preise', subtitle: 'Kostenlos starten, upgraden wenn Sie mehr brauchen', month: 'Mo', popular: 'Am beliebtesten', cta: 'Loslegen',
        free: { name: 'Kostenlos', price: '€0', f1: 'Bis zu 30 Transaktionen/Mo', f2: '1 Zahlungsquelle', f3: '1 Budget', f4: 'Quittungsscan (5/Mo)' },
        pro: { name: 'Pro', price: '€7,99', f1: 'Alles aus Kostenlos', f2: 'Unbegrenzte Projekte & Budgets', f3: 'KI-Einblicke & Berichte', f4: 'Privat + geschäftlich' },
        business: { name: 'Business', price: '€14,99', f1: 'Alles aus Pro', f2: 'Mitarbeiter & Zeiterfassung', f3: 'Team- & Mehrbenutzerzugang', f4: 'Erweiterte Projekte mit Mitarbeitern' },
      },
      testimonials: {
        title: 'Von Nutzern geliebt', subtitle: 'Sehen Sie, was unsere Nutzer sagen',
        t1: { name: 'Ana M.', role: 'Freiberuflerin', text: 'Endlich eine App, die sowohl persönliche als auch geschäftliche Finanzen verwaltet! Der Belegscanner spart mir jeden Monat Stunden.' },
        t2: { name: 'Marko K.', role: 'Familienvater', text: 'Wir teilen ein Familienbudget und jeder kann sehen, wohin das Geld fließt. Ein Gamechanger für unseren Haushalt.' },
        t3: { name: 'Ivan P.', role: 'Kleinunternehmer', text: 'Projektverfolgung und Kostenkontrolle sind unglaublich nützlich. Ich sehe endlich, wohin das Geld bei jedem Projekt geht.' },
      },
      footer: { desc: 'Ihr Finanzkontrollzentrum für private und geschäftliche Finanzen.', product: 'Produkt', legal: 'Rechtliches', privacy: 'Datenschutz', account: 'Konto', rights: 'Alle Rechte vorbehalten.' },
      apk: { title: 'V&M Balance herunterladen', subtitle: 'Ein Freund empfiehlt Ihnen die App zur Finanzverfolgung. Herunterladen, installieren und loslegen!', download: 'APK für Android herunterladen', instructions: 'Installation:', step1: 'APK-Datei herunterladen', step2: 'Datei auf dem Smartphone öffnen', step3: 'Installation aus unbekannten Quellen erlauben', step4: 'Installieren und App öffnen', referralLabel: 'Ihr Empfehlungscode:', referralHint: 'Geben Sie diesen Code bei der Registrierung ein', webOption: 'Oder im Web registrieren:' },
    },
  },
};

export const landingLanguages: LandingLanguage[] = ['hr', 'en', 'de'];

export const getInitialLandingLanguage = (): LandingLanguage => {
  const stored = localStorage.getItem('i18nextLng')?.slice(0, 2) as LandingLanguage | undefined;
  if (stored && landingLanguages.includes(stored)) return stored;
  const browser = navigator.language.slice(0, 2) as LandingLanguage;
  return landingLanguages.includes(browser) ? browser : 'hr';
};

export const getLandingTranslation = (language: LandingLanguage, key: string): string => {
  const parts = key.split('.');
  let value: string | TranslationTree | undefined = translations[language];
  for (const part of parts) {
    if (!value || typeof value === 'string') return key;
    value = value[part];
  }
  return typeof value === 'string' ? value : key;
};
