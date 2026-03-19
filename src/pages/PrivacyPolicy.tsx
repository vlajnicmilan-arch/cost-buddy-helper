import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const PrivacyPolicy = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-dvh bg-background">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(-1)}
          className="mb-6 gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Natrag
        </Button>

        <h1 className="text-3xl font-bold text-foreground mb-2">Politika privatnosti</h1>
        <p className="text-muted-foreground mb-8">Zadnja izmjena: veljača 2026.</p>

        <div className="prose prose-sm max-w-none space-y-8 text-foreground">

          <section>
            <h2 className="text-xl font-semibold mb-3">1. Uvod</h2>
            <p className="text-muted-foreground leading-relaxed">
              V&M Balance ("aplikacija", "mi", "naš") je aplikacija za upravljanje osobnim financijama.
              Ova politika privatnosti opisuje kako prikupljamo, koristimo i štitimo vaše podatke
              kada koristite našu aplikaciju. Molimo vas da pažljivo pročitate ovaj dokument.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. Podaci koje prikupljamo</h2>
            <div className="space-y-4">
              <div>
                <h3 className="font-medium mb-2">2.1 Podaci koje vi unosite</h3>
                <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
                  <li>Email adresa i lozinka za kreiranje računa</li>
                  <li>Ime ili nadimak (opcionalno)</li>
                  <li>Financijski podaci: transakcije, kategorije, iznosi, datumi</li>
                  <li>Slike računa koje skenirate (opcionalno)</li>
                  <li>Podaci o izvorima plaćanja koje sami definirate</li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium mb-2">2.2 Automatski prikupljeni podaci</h3>
                <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
                  <li>Tehnički podaci o uređaju (vrsta uređaja, operativni sustav)</li>
                  <li>Podaci o korištenju aplikacije (samo u slučaju greške/pada aplikacije)</li>
                  <li>IP adresa pri autentikaciji</li>
                </ul>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. Kako koristimo vaše podatke</h2>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
              <li>Pružanje i unaprjeđenje funkcionalnosti aplikacije</li>
              <li>Sinkronizacija podataka između vaših uređaja (ako koristite cloud pohranu)</li>
              <li>Slanje obavijesti koje ste vi aktivirali (rate, budžeti, ponavljajuće transakcije)</li>
              <li>Dijagnostika tehničkih problema i grešaka</li>
              <li>Osiguranje sigurnosti vašeg računa</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Pohrana podataka</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              Vaši podaci se pohranjuju na sigurnim serverima putem Supabase infrastrukture,
              koja je u skladu s GDPR regulativom. Podaci su kriptirani u prijenosu (TLS/SSL)
              i u pohrani.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Ako odaberete <strong>lokalnu pohranu</strong>, vaši financijski podaci ostaju
              isključivo na vašem uređaju i ne šalju se na naše servere.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Dijeljenje podataka s trećim stranama</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              Mi <strong>ne prodajemo</strong> vaše osobne podatke trećim stranama. Podatke
              dijelimo samo u sljedećim slučajevima:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
              <li><strong>Supabase</strong> — pružatelj cloud infrastrukture za sigurnu pohranu</li>
              <li><strong>Google (AI funkcionalnosti)</strong> — anonimizirana pitanja financijskom asistentu</li>
              <li><strong>Zakonske obaveze</strong> — samo ako to zakon zahtijeva</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Vaša prava (GDPR)</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              U skladu s GDPR regulativom, imate pravo na:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
              <li><strong>Pristup</strong> — pravo uvida u sve podatke koje pohranjujemo o vama</li>
              <li><strong>Ispravak</strong> — pravo ispravka netočnih podataka</li>
              <li><strong>Brisanje</strong> — pravo brisanja računa i svih vaših podataka</li>
              <li><strong>Prenosivost</strong> — pravo izvoza vaših podataka (backup funkcija)</li>
              <li><strong>Prigovor</strong> — pravo prigovora na određenu obradu podataka</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Sigurnost djece</h2>
            <p className="text-muted-foreground leading-relaxed">
              Aplikacija nije namijenjena osobama mlađim od 16 godina. Ne prikupljamo
              namjerno podatke od maloljetnih osoba.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Kolačići i lokalna pohrana</h2>
            <p className="text-muted-foreground leading-relaxed">
              Aplikacija koristi localStorage i IndexedDB isključivo za pohranu vaših
              postavki i podataka na uređaju. Ne koristimo marketinške kolačiće niti
              pratimo vaše aktivnosti izvan aplikacije.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">9. Izmjene politike privatnosti</h2>
            <p className="text-muted-foreground leading-relaxed">
              Zadržavamo pravo izmjene ove politike privatnosti. O značajnim izmjenama
              bit ćete obaviješteni putem aplikacije ili emaila. Datum posljednje izmjene
              naveden je na vrhu ovog dokumenta.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">10. Kontakt</h2>
            <p className="text-muted-foreground leading-relaxed">
              Za sva pitanja vezana uz privatnost i obradu podataka, kontaktirajte nas na:
            </p>
            <div className="mt-3 p-4 bg-muted rounded-lg">
              <p className="font-medium">V&M Balance</p>
              <p className="text-muted-foreground">Email: privacy@vmbalance.app</p>
            </div>
          </section>

        </div>

        <div className="mt-12 pt-8 border-t border-border text-center text-sm text-muted-foreground">
          <p>© 2026 V&M Balance. Sva prava pridržana.</p>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
