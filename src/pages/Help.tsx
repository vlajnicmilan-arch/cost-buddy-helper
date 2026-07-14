import { useState, useMemo, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import {
  ArrowLeft, Search, Mail, HelpCircle, BookOpen, Receipt, Users,
  CreditCard, Shield, Smartphone, Database, Sparkles, Settings as SettingsIcon,
  X, Clock,
} from 'lucide-react';
import { ContactSupportDialog } from '@/components/support/ContactSupportDialog';

// --- FAQ data --------------------------------------------------------------
// Each entry: stable slug (URL anchor), translation keys for question & answer.
// Categories drive grouping + section icons.

interface FaqEntry {
  slug: string;
  qKey: string;
  aKey: string;
  qFallback: string;
  aFallback: string;
}

interface FaqCategory {
  id: string;
  titleKey: string;
  titleFallback: string;
  icon: React.ComponentType<{ className?: string }>;
  entries: FaqEntry[];
}

const FAQ: FaqCategory[] = [
  {
    id: 'getting-started',
    titleKey: 'faq.cat.gettingStarted',
    titleFallback: 'Početak rada',
    icon: BookOpen,
    entries: [
      {
        slug: 'add-transaction',
        qKey: 'faq.q.addTransaction',
        aKey: 'faq.a.addTransaction',
        qFallback: 'Kako dodati transakciju?',
        aFallback: 'Kliknite gumb "+" u gornjem desnom kutu početne stranice. Odaberite vrstu (Prihod, Rashod ili Transfer), unesite iznos, opis, kategoriju i datum. Za rashode možete priložiti fotografiju računa koja će biti automatski analizirana.',
      },
      {
        slug: 'payment-sources',
        qKey: 'faq.q.paymentSources',
        aKey: 'faq.a.paymentSources',
        qFallback: 'Što su izvori plaćanja i kako ih kreirati?',
        aFallback: 'Izvori plaćanja predstavljaju vaše stvarne račune (bankovni račun, gotovina, Revolut, kreditna kartica…). Kreirajte ih u sekciji "Izvori plaćanja" na početnoj stranici. Saldo svakog izvora se automatski ažurira sa svakom transakcijom.',
      },
      {
        slug: 'categories',
        qKey: 'faq.q.categories',
        aKey: 'faq.a.categories',
        qFallback: 'Kako radi kategorizacija?',
        aFallback: 'Aplikacija dolazi s 96 ugrađenih kategorija rashoda i 32 prihoda. Možete kreirati i vlastite kategorije s prilagođenom ikonom i bojom. AI asistent automatski predlaže kategoriju na temelju opisa transakcije.',
      },
      {
        slug: 'simple-mode',
        qKey: 'faq.q.simpleMode',
        aKey: 'faq.a.simpleMode',
        qFallback: 'Mogu li sakriti napredne značajke?',
        aFallback: 'Da. U Postavkama uključite "Jednostavni način rada" — to skriva projekte, budžete, rate i poslovni način, ostavljajući samo praćenje prihoda i rashoda.',
      },
    ],
  },
  {
    id: 'receipts',
    titleKey: 'faq.cat.receipts',
    titleFallback: 'Skeniranje računa',
    icon: Receipt,
    entries: [
      {
        slug: 'scan-receipt',
        qKey: 'faq.q.scanReceipt',
        aKey: 'faq.a.scanReceipt',
        qFallback: 'Kako skenirati račun?',
        aFallback: 'Pri dodavanju rashoda kliknite ikonu kamere. Na mobilnoj aplikaciji otvara se kamera; u browseru možete učitati fotografiju iz galerije. AI prepoznaje iznos, trgovinu i datum te automatski popunjava polja.',
      },
      {
        slug: 'business-receipt-vat',
        qKey: 'faq.q.businessReceiptVat',
        aKey: 'faq.a.businessReceiptVat',
        qFallback: 'Mogu li skenirati R-1 račune za PDV?',
        aFallback: 'Da, u poslovnom načinu rada AI prepoznaje neto iznos, PDV i ukupno. Datum izdavanja i naziv izdavatelja su obavezni za R-1 račune.',
      },
      {
        slug: 'receipt-storage',
        qKey: 'faq.q.receiptStorage',
        aKey: 'faq.a.receiptStorage',
        qFallback: 'Gdje se čuvaju fotografije računa?',
        aFallback: 'Po defaultu lokalno na vašem uređaju. U Postavkama možete uključiti cloud sinkronizaciju — tada se računi sigurno čuvaju u oblaku i dostupni su sa svih uređaja.',
      },
    ],
  },
  {
    id: 'budgets-projects',
    titleKey: 'faq.cat.budgetsProjects',
    titleFallback: 'Budžeti i projekti',
    icon: Sparkles,
    entries: [
      {
        slug: 'create-budget',
        qKey: 'faq.q.createBudget',
        aKey: 'faq.a.createBudget',
        qFallback: 'Kako kreirati budžet?',
        aFallback: 'U sekciji "Budžeti" kliknite "+ Novi budžet". Postavite naziv, period (tjedni/mjesečni/godišnji), ukupni iznos i opcionalno limite po kategorijama. Primat ćete obavijesti kada se približite limitu.',
      },
      {
        slug: 'share-budget',
        qKey: 'faq.q.shareBudget',
        aKey: 'faq.a.shareBudget',
        qFallback: 'Kako podijeliti budžet s drugim korisnikom?',
        aFallback: 'Otvorite budžet i kliknite ikonu članova (👥). Pošaljite pozivnicu putem email adrese. Pozvani korisnik prima email i obavijest unutar aplikacije; nakon prihvaćanja može pratiti i dodavati transakcije pod tim budžetom.',
      },
      {
        slug: 'project-vs-budget',
        qKey: 'faq.q.projectVsBudget',
        aKey: 'faq.a.projectVsBudget',
        qFallback: 'Razlika između projekta i budžeta?',
        aFallback: 'Budžet je mjesečni/tjedni limit potrošnje po kategorijama. Projekt je samostalna jedinica s vlastitim budžetom, fazama (milestones), radnim satima i članovima tima — koristi se za renovacije, događaje, freelance poslove, itd.',
      },
      {
        slug: 'project-pl',
        qKey: 'faq.q.projectPL',
        aKey: 'faq.a.projectPL',
        qFallback: 'Kako pratim profitabilnost projekta?',
        aFallback: 'Svaki projekt ima P&L analizu — automatski sumira prihode i rashode pripisane projektu, prikazuje neto rezultat, postotak iskorištenosti budžeta i napredak po fazama.',
      },
    ],
  },
  {
    id: 'collaboration',
    titleKey: 'faq.cat.collaboration',
    titleFallback: 'Suradnja i obitelj',
    icon: Users,
    entries: [
      {
        slug: 'shared-wallet',
        qKey: 'faq.q.sharedWallet',
        aKey: 'faq.a.sharedWallet',
        qFallback: 'Kako dijeliti račun s partnerom/obitelji?',
        aFallback: 'Aktivirajte obiteljski način u Postavkama. Pozovite članove putem emaila. Svaki član može imati Limited Access (samo dijeljeni izvori) ili Full Access (svi podaci grupe).',
      },
      {
        slug: 'roles',
        qKey: 'faq.q.roles',
        aKey: 'faq.a.roles',
        qFallback: 'Koje uloge postoje za suradnike?',
        aFallback: 'Vlasnik (puna kontrola, ne može se ukloniti), Voditelj (upravlja članovima i postavkama), Član (dodaje i pregledava transakcije). Uloge se postavljaju po izvoru/budžetu/projektu.',
      },
    ],
  },
  {
    id: 'data',
    titleKey: 'faq.cat.data',
    titleFallback: 'Podaci, izvoz i sigurnost',
    icon: Database,
    entries: [
      {
        slug: 'export-data',
        qKey: 'faq.q.exportData',
        aKey: 'faq.a.exportData',
        qFallback: 'Kako izvesti svoje podatke?',
        aFallback: 'Otvorite Postavke → Izvoz podataka. Možete preuzeti sve transakcije u CSV ili JSON formatu, te generirati PDF izvještaje po datumu, kategoriji ili projektu. Na mobilnoj aplikaciji datoteka se sprema u Downloads.',
      },
      {
        slug: 'import-bank',
        qKey: 'faq.q.importBank',
        aKey: 'faq.a.importBank',
        qFallback: 'Mogu li uvesti CSV iz banke?',
        aFallback: 'Da. Na početnoj stranici kliknite "Bankovna poveznica" i odaberite CSV izvod. Aplikacija prepoznaje formate većih hrvatskih banaka (Zagrebačka, PBZ, OTP, Erste, Raiffeisen) i automatski kategorizira transakcije.',
      },
      {
        slug: 'backup',
        qKey: 'faq.q.backup',
        aKey: 'faq.a.backup',
        qFallback: 'Kako napraviti backup?',
        aFallback: 'U cloud načinu rada podaci su automatski sigurnosno kopirani. U lokalnom načinu, koristite "Izvoz svih podataka" iz Postavki za ručni JSON backup koji možete kasnije uvesti na drugom uređaju.',
      },
      {
        slug: 'data-security',
        qKey: 'faq.q.dataSecurity',
        aKey: 'faq.a.dataSecurity',
        qFallback: 'Kako su moji podaci zaštićeni?',
        aFallback: 'Svi podaci su šifrirani u prijenosu (HTTPS/TLS) i u mirovanju. Pristup je ograničen RLS politikama na razini baze — samo vi (i izričito pozvani članovi) možete vidjeti svoje podatke. Hostano u EU.',
      },
    ],
  },
  {
    id: 'subscription',
    titleKey: 'faq.cat.subscription',
    titleFallback: 'Pretplata i naplata',
    icon: CreditCard,
    entries: [
      {
        slug: 'plans',
        qKey: 'faq.q.plans',
        aKey: 'faq.a.plans',
        qFallback: 'Koji su dostupni planovi?',
        aFallback: 'Free (osnovne značajke s limitima), Pro (neograničeno transakcija, projekata i budžeta) i Business (poslovni način, R-1 računi, više profila, naprednije izvještavanje). Detalji u Postavke → Pretplata.',
      },
      {
        slug: 'cancel-subscription',
        qKey: 'faq.q.cancelSubscription',
        aKey: 'faq.a.cancelSubscription',
        qFallback: 'Kako otkazati pretplatu?',
        aFallback: 'Otvorite Postavke → Pretplata → "Upravljaj pretplatom". Otvara se Stripe Customer Portal gdje možete otkazati ili pauzirati pretplatu u dva klika. Ostajete Pro do kraja plaćenog perioda, nakon čega prelazite na Free plan — vaši podaci ostaju netaknuti.',
      },
      {
        slug: 'refund',
        qKey: 'faq.q.refund',
        aKey: 'faq.a.refund',
        qFallback: 'Mogu li dobiti povrat novca?',
        aFallback: 'Pišite nam na support@vmbalance.com s razlogom unutar 14 dana od plaćanja. Razmatramo svaki zahtjev pojedinačno u skladu s EU pravilima o potrošačkim ugovorima.',
      },
      {
        slug: 'change-plan',
        qKey: 'faq.q.changePlan',
        aKey: 'faq.a.changePlan',
        qFallback: 'Kako promijeniti plan (upgrade/downgrade)?',
        aFallback: 'Iz Postavke → Pretplata kliknite na željeni plan. Upgrade je trenutan s proporcionalnom naplatom razlike; downgrade stupa na snagu na kraju trenutnog billing perioda.',
      },
    ],
  },
  {
    id: 'privacy-gdpr',
    titleKey: 'faq.cat.privacyGdpr',
    titleFallback: 'Privatnost i GDPR',
    icon: Shield,
    entries: [
      {
        slug: 'gdpr-delete',
        qKey: 'faq.q.gdprDelete',
        aKey: 'faq.a.gdprDelete',
        qFallback: 'Kako trajno obrisati svoj račun (GDPR)?',
        aFallback: 'Postavke → Račun → "Obriši račun". Slijedi 30-dnevni grace period — primit ćete email potvrdu, a ako se prijavite unutar 30 dana brisanje se automatski otkazuje. Nakon isteka roka brišu se trajno: sve transakcije, projekti, proračuni, dokumenti, postavke i auth račun. Akcija je nepovratna.',
      },
      {
        slug: 'data-portability',
        qKey: 'faq.q.dataPortability',
        aKey: 'faq.a.dataPortability',
        qFallback: 'Imam li pravo na prenosivost podataka?',
        aFallback: 'Da. U skladu s GDPR čl. 20 možete bilo kada izvesti sve svoje podatke u CSV/JSON formatu kroz Postavke → Izvoz podataka — bez čekanja i bez naplate.',
      },
      {
        slug: 'cookies',
        qKey: 'faq.q.cookies',
        aKey: 'faq.a.cookies',
        qFallback: 'Koje kolačiće (cookies) koristite?',
        aFallback: 'Samo nužne kolačiće za rad aplikacije po defaultu. Analitiku, performance monitoring (Sentry) i ostalo aktiviramo isključivo nakon vašeg pristanka kroz cookie banner — možete promijeniti odabir bilo kada u Postavkama.',
      },
    ],
  },
  {
    id: 'mobile-pwa',
    titleKey: 'faq.cat.mobilePwa',
    titleFallback: 'Mobilna aplikacija',
    icon: Smartphone,
    entries: [
      {
        slug: 'install-android',
        qKey: 'faq.q.installAndroid',
        aKey: 'faq.a.installAndroid',
        qFallback: 'Kako instalirati na Android?',
        aFallback: 'Posjetite vmbalance.com/install i preuzmite APK, ili koristite browser opciju "Instaliraj aplikaciju" iz menija. Trebate omogućiti instalaciju iz nepoznatih izvora (samo prvi put).',
      },
      {
        slug: 'install-ios',
        qKey: 'faq.q.installIos',
        aKey: 'faq.a.installIos',
        qFallback: 'Kako instalirati na iPhone?',
        aFallback: 'Otvorite vmbalance.com u Safariju → tapnite Share (⬆) → "Add to Home Screen". App radi kao native PWA s push notifikacijama i offline podrškom.',
      },
      {
        slug: 'offline',
        qKey: 'faq.q.offline',
        aKey: 'faq.a.offline',
        qFallback: 'Radi li aplikacija offline?',
        aFallback: 'Da, osnovne funkcije (pregled, dodavanje transakcija) rade offline u native aplikaciji. Promjene se sinkroniziraju automatski čim se ponovo spojite na internet.',
      },
    ],
  },
  {
    id: 'ai',
    titleKey: 'faq.cat.ai',
    titleFallback: 'AI asistent',
    icon: Sparkles,
    entries: [
      {
        slug: 'ai-assistant',
        qKey: 'faq.q.aiAssistant',
        aKey: 'faq.a.aiAssistant',
        qFallback: 'Što može AI asistent?',
        aFallback: 'Odgovara na pitanja o vašim financijama prirodnim jezikom: "Koliko sam potrošio na hranu prošli mjesec?", "Predviđanje cashflow-a", "Gdje mogu uštedjeti?". Analizira trendove, predlaže kategorizacije i prepoznaje recurring uzorke.',
      },
      {
        slug: 'ai-privacy',
        qKey: 'faq.q.aiPrivacy',
        aKey: 'faq.a.aiPrivacy',
        qFallback: 'Šaljete li moje podatke trećoj strani za AI?',
        aFallback: 'AI obrađuje samo agregate i opise transakcija (ne PII) preko sigurnih EU endpoint-a. Razgovori s asistentom se ne pohranjuju za treniranje modela. AI možete potpuno isključiti u Postavkama.',
      },
    ],
  },
  {
    id: 'troubleshooting',
    titleKey: 'faq.cat.troubleshooting',
    titleFallback: 'Rješavanje problema',
    icon: SettingsIcon,
    entries: [
      {
        slug: 'forgot-password',
        qKey: 'faq.q.forgotPassword',
        aKey: 'faq.a.forgotPassword',
        qFallback: 'Zaboravio/la sam lozinku, što sad?',
        aFallback: 'Na ekranu prijave kliknite "Zaboravljena lozinka". Unesite email i pošaljemo vam link za resetiranje (vrijedi 1h). Ako koristite Google login, pristupite kroz "Sign in with Google".',
      },
      {
        slug: 'wrong-balance',
        qKey: 'faq.q.wrongBalance',
        aKey: 'faq.a.wrongBalance',
        qFallback: 'Saldo izvora plaćanja nije točan — što da radim?',
        aFallback: 'Otvorite izvor plaćanja → "Korekcija salda". Unesite stvarni iznos i razlog — sustav kreira korektivnu transakciju koja izjednačava saldo bez utjecaja na povijest.',
      },
      {
        slug: 'sync-issues',
        qKey: 'faq.q.syncIssues',
        aKey: 'faq.a.syncIssues',
        qFallback: 'Podaci se ne sinkroniziraju između uređaja.',
        aFallback: 'Provjerite jeste li prijavljeni s istim računom na svim uređajima. Pull-to-refresh na početnoj stranici ručno aktivira sinkronizaciju. Ako problem traje, kontaktirajte podršku.',
      },
      {
        slug: 'contact',
        qKey: 'faq.q.contact',
        aKey: 'faq.a.contact',
        qFallback: 'Kako kontaktirati podršku?',
        aFallback: 'Email: support@vmbalance.com — odgovaramo unutar 24 sata. Možete koristiti i kontakt formu na ovoj stranici (gumb "Kontaktirajte podršku" ispod) — dobit ćete trenutnu email potvrdu.',
      },
    ],
  },
];

const totalCount = FAQ.reduce((sum, c) => sum + c.entries.length, 0);

const Help = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [showSupport, setShowSupport] = useState(false);

  // SEO meta
  useEffect(() => {
    const prevTitle = document.title;
    const title = `${t('faq.metaTitle', 'Pomoć i česta pitanja (FAQ)')} • Centar`;
    document.title = title.length > 60 ? title.slice(0, 60) : title;

    const metaDesc = document.querySelector('meta[name="description"]');
    const desc = t('faq.metaDescription', 'Odgovori na česta pitanja o Centar: skeniranje računa, dijeljenje budžeta, izvoz podataka, otkazivanje pretplate, GDPR brisanje računa.');
    const prevDesc = metaDesc?.getAttribute('content') || '';
    if (metaDesc) metaDesc.setAttribute('content', desc.slice(0, 160));

    // JSON-LD FAQPage
    const ld = document.createElement('script');
    ld.type = 'application/ld+json';
    ld.id = 'faq-jsonld';
    ld.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQ.flatMap((cat) =>
        cat.entries.map((e) => ({
          '@type': 'Question',
          name: t(e.qKey, e.qFallback),
          acceptedAnswer: {
            '@type': 'Answer',
            text: t(e.aKey, e.aFallback),
          },
        })),
      ),
    });
    document.head.appendChild(ld);

    return () => {
      document.title = prevTitle;
      if (metaDesc && prevDesc) metaDesc.setAttribute('content', prevDesc);
      document.getElementById('faq-jsonld')?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  // Filter
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FAQ;
    return FAQ.map((cat) => ({
      ...cat,
      entries: cat.entries.filter((e) => {
        const question = t(e.qKey, e.qFallback).toLowerCase();
        const answer = t(e.aKey, e.aFallback).toLowerCase();
        return question.includes(q) || answer.includes(q);
      }),
    })).filter((cat) => cat.entries.length > 0);
  }, [query, t]);

  const matchCount = useMemo(
    () => filtered.reduce((sum, c) => sum + c.entries.length, 0),
    [filtered],
  );

  // Anchor scroll on hash
  useEffect(() => {
    if (window.location.hash) {
      const id = window.location.hash.slice(1);
      const el = document.getElementById(id);
      if (el) {
        setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
      }
    }
  }, []);

  return (
    <div className="min-h-dvh bg-background">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/60 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
            className="gap-2 -ml-2"
            aria-label={t('common.back', 'Natrag')}
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">{t('common.back', 'Natrag')}</span>
          </Button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <HelpCircle className="w-5 h-5 text-primary shrink-0" />
            <h1 className="font-semibold truncate">
              {t('faq.title', 'Pomoć i česta pitanja')}
            </h1>
          </div>
          <Link
            to="/"
            className="text-xs text-muted-foreground hover:text-foreground hidden sm:inline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-2 py-1"
          >
            vmbalance.com
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 sm:py-10">
        {/* Hero */}
        <section className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary mb-2">
            {t('faq.eyebrow', 'Centar pomoći')}
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold mb-2">
            {t('faq.heading', 'Kako vam možemo pomoći?')}
          </h2>
          <p className="text-muted-foreground text-sm sm:text-base">
            {t('faq.subheading', `${totalCount}+ odgovora na najčešća pitanja. Ne pronalazite što tražite? Pišite nam direktno — odgovaramo unutar 24h.`)}
          </p>
        </section>

        {/* Search */}
        <div className="relative mb-8">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('faq.searchPlaceholder', 'Pretraži pitanja… npr. "skenirati", "GDPR", "pretplata"')}
            className="pl-10 pr-10 h-12 text-base"
            aria-label={t('faq.searchAriaLabel', 'Pretraži FAQ')}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t('common.clear', 'Očisti')}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Category quick nav (only when no search) */}
        {!query && (
          <nav
            className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-10"
            aria-label={t('faq.categoriesNav', 'Kategorije')}
          >
            {FAQ.map((cat) => {
              const Icon = cat.icon;
              return (
                <a
                  key={cat.id}
                  href={`#${cat.id}`}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-border/60 bg-card hover:bg-muted/60 hover:border-primary/40 transition-colors text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Icon className="w-4 h-4 text-primary shrink-0" />
                  <span className="truncate">{t(cat.titleKey, cat.titleFallback)}</span>
                </a>
              );
            })}
          </nav>
        )}

        {/* Search result count */}
        {query && (
          <p className="text-sm text-muted-foreground mb-4">
            {matchCount === 0
              ? t('faq.noResults', `Nema rezultata za "${query}". Pokušajte drugi pojam ili nas kontaktirajte direktno.`)
              : t('faq.resultsCount', `${matchCount} ${matchCount === 1 ? 'rezultat' : 'rezultata'} za "${query}"`)}
          </p>
        )}

        {/* FAQ accordions per category */}
        <div className="space-y-10">
          {filtered.map((cat) => {
            const Icon = cat.icon;
            return (
              <section key={cat.id} id={cat.id} aria-labelledby={`${cat.id}-title`} className="scroll-mt-20">
                <h3
                  id={`${cat.id}-title`}
                  className="flex items-center gap-2 text-lg font-semibold mb-3"
                >
                  <span className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-primary" />
                  </span>
                  {t(cat.titleKey, cat.titleFallback)}
                  <span className="text-xs font-normal text-muted-foreground/70">
                    ({cat.entries.length})
                  </span>
                </h3>

                <Accordion type="multiple" className="space-y-2">
                  {cat.entries.map((entry) => (
                    <AccordionItem
                      key={entry.slug}
                      value={entry.slug}
                      id={entry.slug}
                      className="border border-border/60 rounded-lg px-4 bg-card scroll-mt-20"
                    >
                      <AccordionTrigger className="text-left hover:no-underline py-4 text-sm sm:text-base font-medium">
                        {t(entry.qKey, entry.qFallback)}
                      </AccordionTrigger>
                      <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-4 whitespace-pre-line">
                        {t(entry.aKey, entry.aFallback)}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </section>
            );
          })}
        </div>

        {/* Contact CTA */}
        <section className="mt-12 rounded-2xl bg-gradient-to-br from-primary/15 via-primary/8 to-primary/5 border border-primary/20 p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
              <Mail className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-base mb-1">
                {t('faq.ctaTitle', 'Niste pronašli odgovor?')}
              </h3>
              <p className="text-sm text-muted-foreground mb-3 sm:mb-0">
                {t('faq.ctaBody', 'Naš tim odgovara unutar 24 sata na svaki upit, a najčešće i puno brže.')}
              </p>
            </div>
            <Button
              onClick={() => setShowSupport(true)}
              size="lg"
              className="w-full sm:w-auto"
            >
              <Mail className="w-4 h-4 mr-2" />
              {t('faq.ctaButton', 'Kontaktirajte podršku')}
            </Button>
          </div>
          <div className="mt-4 pt-4 border-t border-primary/15 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> {t('faq.ctaResponseTime', 'Odgovor unutar 24h')}
            </span>
            <span>•</span>
            <a
              href="mailto:support@vmbalance.com"
              className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
              support@vmbalance.com
            </a>
          </div>
        </section>

        {/* Footer links */}
        <footer className="mt-10 pt-6 border-t border-border/40 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
          <Link to="/privacy-policy" className="hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
            {t('common.privacyPolicy', 'Pravila privatnosti')}
          </Link>
          <Link to="/terms-of-service" className="hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
            {t('common.termsOfService', 'Uvjeti korištenja')}
          </Link>
          <Link to="/refund-policy" className="hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
            {t('common.refundPolicy', 'Politika povrata')}
          </Link>
          <Link to="/impressum" className="hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
            Impressum
          </Link>
        </footer>
      </main>

      <ContactSupportDialog open={showSupport} onOpenChange={setShowSupport} />
    </div>
  );
};

export default Help;
