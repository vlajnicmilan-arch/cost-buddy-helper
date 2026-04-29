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
        <p className="text-muted-foreground mb-2">Verzija 2.0 — Zadnja izmjena: 29. travnja 2026.</p>
        <p className="text-muted-foreground mb-8 text-sm">
          Ova politika opisuje obradu osobnih podataka u skladu s Općom uredbom o zaštiti
          podataka (EU 2016/679 — GDPR) i hrvatskim Zakonom o provedbi Opće uredbe o zaštiti
          podataka (NN 42/2018).
        </p>

        <div className="prose prose-sm max-w-none space-y-8 text-foreground">

          {/* 1. Voditelj obrade */}
          <section>
            <h2 className="text-xl font-semibold mb-3">1. Voditelj obrade podataka</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              Voditelj obrade osobnih podataka u smislu članka 4. stavka 7. GDPR-a je:
            </p>
            <div className="p-4 bg-muted rounded-lg">
              <p className="font-medium">V&M Balance</p>
              <p className="text-muted-foreground">Web: vmbalance.com</p>
              <p className="text-muted-foreground">Email za pitanja o privatnosti: <a href="mailto:privacy@vmbalance.com" className="text-primary hover:underline">privacy@vmbalance.com</a></p>
              <p className="text-muted-foreground">Email za GDPR zahtjeve: <a href="mailto:gdpr@vmbalance.com" className="text-primary hover:underline">gdpr@vmbalance.com</a></p>
            </div>
          </section>

          {/* 2. Podaci koje prikupljamo */}
          <section>
            <h2 className="text-xl font-semibold mb-3">2. Kategorije podataka koje obrađujemo</h2>
            <div className="space-y-4">
              <div>
                <h3 className="font-medium mb-2">2.1 Podaci o računu</h3>
                <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
                  <li>Email adresa</li>
                  <li>Hashirana lozinka (bcrypt, ne pohranjujemo plaintext)</li>
                  <li>Ime ili nadimak (opcionalno)</li>
                  <li>Avatar (opcionalno)</li>
                  <li>Jezik sučelja (HR/EN/DE)</li>
                  <li>Vrijeme posljednje prijave i IP adresa (sigurnosni log, 90 dana)</li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium mb-2">2.2 Financijski i poslovni podaci</h3>
                <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
                  <li>Transakcije (iznos, datum, kategorija, opis, način plaćanja)</li>
                  <li>Računi/fakture (slike i ekstrahirani podaci)</li>
                  <li>Budžeti, projekti, ponavljajuće transakcije, podsjetnici</li>
                  <li>Podaci o poslovanju (OIB tvrtke, naziv) — samo Business plan</li>
                  <li>Evidencija radnog vremena i radnika — samo Business plan</li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium mb-2">2.3 Tehnički i dijagnostički podaci</h3>
                <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
                  <li>Tip uređaja, OS verzija, browser</li>
                  <li>Push notification token (samo ako date dozvolu)</li>
                  <li>Stack trace grešaka (Sentry — bez osobnih podataka)</li>
                  <li>Verzija aplikacije</li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium mb-2">2.4 Podaci o naplati (samo plaćeni planovi)</h3>
                <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
                  <li>Stripe customer ID, status pretplate, datum isteka</li>
                  <li>Podaci o kartici <strong>obrađuje isključivo Stripe</strong> — mi ih nikad ne vidimo niti pohranjujemo</li>
                </ul>
              </div>
            </div>
          </section>

          {/* 3. Pravne osnove */}
          <section>
            <h2 className="text-xl font-semibold mb-3">3. Pravne osnove obrade (čl. 6. GDPR)</h2>
            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-2">
              <li><strong>Izvršenje ugovora (čl. 6/1/b)</strong> — kreiranje računa, pružanje usluge, obrada plaćanja</li>
              <li><strong>Legitimni interes (čl. 6/1/f)</strong> — sigurnosni logovi, sprečavanje zlouporabe, dijagnostika grešaka</li>
              <li><strong>Privola (čl. 6/1/a)</strong> — push notifikacije, AI asistent, opcionalna sinkronizacija u cloud</li>
              <li><strong>Zakonska obveza (čl. 6/1/c)</strong> — čuvanje računovodstvene dokumentacije po Zakonu o računovodstvu</li>
            </ul>
          </section>

          {/* 4. SUB-PROCESORI - GLAVNI DIO */}
          <section>
            <h2 className="text-xl font-semibold mb-3">4. Sub-procesori (treće strane)</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              U svrhu pružanja usluge koristimo sljedeće provjerene sub-procesore. Sa svima
              je sklopljen ugovor o obradi podataka (DPA — Data Processing Agreement) i
              odgovarajuće mjere zaštite za prijenos podataka.
            </p>

            <div className="space-y-4">
              {/* Supabase */}
              <div className="p-4 border border-border rounded-lg">
                <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
                  <h3 className="font-semibold">Supabase (preko Lovable Cloud)</h3>
                  <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded">EU (Frankfurt, Njemačka)</span>
                </div>
                <p className="text-sm text-muted-foreground mb-2"><strong>Svrha:</strong> Baza podataka, autentikacija, pohrana datoteka, pozadinske funkcije</p>
                <p className="text-sm text-muted-foreground mb-2"><strong>Podaci:</strong> Svi vaši podaci o računu i transakcijama, slike računa</p>
                <p className="text-sm text-muted-foreground"><strong>DPA:</strong> <a href="https://supabase.com/legal/dpa" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">supabase.com/legal/dpa</a> · GDPR & SOC 2 Type II compliant</p>
              </div>

              {/* Lovable AI / Google Gemini */}
              <div className="p-4 border border-border rounded-lg">
                <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
                  <h3 className="font-semibold">Lovable AI Gateway (Google Gemini)</h3>
                  <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded">EU/SAD</span>
                </div>
                <p className="text-sm text-muted-foreground mb-2"><strong>Svrha:</strong> Financijski AI asistent, OCR računa, prepoznavanje kategorija</p>
                <p className="text-sm text-muted-foreground mb-2"><strong>Podaci:</strong> Tekst vaših pitanja asistentu, slike računa koje skenirate, opis transakcija. <strong>Podaci se NE koriste za treniranje modela.</strong></p>
                <p className="text-sm text-muted-foreground"><strong>Pravna osnova prijenosa u SAD:</strong> EU-US Data Privacy Framework + Standardne ugovorne klauzule (SCC)</p>
              </div>

              {/* Stripe */}
              <div className="p-4 border border-border rounded-lg">
                <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
                  <h3 className="font-semibold">Stripe Payments Europe Ltd.</h3>
                  <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded">Irska (EU) / SAD</span>
                </div>
                <p className="text-sm text-muted-foreground mb-2"><strong>Svrha:</strong> Obrada plaćanja pretplata (Pro/Business plan)</p>
                <p className="text-sm text-muted-foreground mb-2"><strong>Podaci:</strong> Email, ime, podaci o kartici (obrađuje isključivo Stripe — mi ne vidimo broj kartice)</p>
                <p className="text-sm text-muted-foreground"><strong>DPA:</strong> <a href="https://stripe.com/legal/dpa" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">stripe.com/legal/dpa</a> · PCI DSS Level 1 · DPF certified</p>
              </div>

              {/* Firebase FCM */}
              <div className="p-4 border border-border rounded-lg">
                <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
                  <h3 className="font-semibold">Firebase Cloud Messaging (Google LLC)</h3>
                  <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded">Globalno (SAD)</span>
                </div>
                <p className="text-sm text-muted-foreground mb-2"><strong>Svrha:</strong> Slanje push notifikacija (samo ako date dozvolu)</p>
                <p className="text-sm text-muted-foreground mb-2"><strong>Podaci:</strong> Device token, sadržaj notifikacije (npr. "Podsjetnik za račun")</p>
                <p className="text-sm text-muted-foreground"><strong>DPA:</strong> <a href="https://firebase.google.com/terms/data-processing-terms" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">firebase.google.com/terms/data-processing-terms</a> · DPF certified</p>
              </div>

              {/* Sentry */}
              <div className="p-4 border border-border rounded-lg">
                <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
                  <h3 className="font-semibold">Sentry (Functional Software, Inc.)</h3>
                  <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded">EU (Frankfurt)</span>
                </div>
                <p className="text-sm text-muted-foreground mb-2"><strong>Svrha:</strong> Praćenje grešaka i stabilnosti aplikacije</p>
                <p className="text-sm text-muted-foreground mb-2"><strong>Podaci:</strong> Stack trace, verzija aplikacije, anonimizirani korisnik ID. <strong>Filtriramo financijske podatke prije slanja.</strong></p>
                <p className="text-sm text-muted-foreground"><strong>DPA:</strong> <a href="https://sentry.io/legal/dpa/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">sentry.io/legal/dpa</a></p>
              </div>

              {/* Firecrawl */}
              <div className="p-4 border border-border rounded-lg">
                <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
                  <h3 className="font-semibold">Firecrawl (Mendable, Inc.)</h3>
                  <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded">SAD</span>
                </div>
                <p className="text-sm text-muted-foreground mb-2"><strong>Svrha:</strong> Dohvaćanje sadržaja s URL-ova koje sami unesete (npr. analiza ponuda)</p>
                <p className="text-sm text-muted-foreground mb-2"><strong>Podaci:</strong> Samo URL koji unesete — bez vaših osobnih podataka</p>
                <p className="text-sm text-muted-foreground"><strong>Pravna osnova prijenosa:</strong> Standardne ugovorne klauzule (SCC)</p>
              </div>

              {/* Sudreg */}
              <div className="p-4 border border-border rounded-lg">
                <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
                  <h3 className="font-semibold">Sudreg (Ministarstvo pravosuđa RH)</h3>
                  <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded">Hrvatska</span>
                </div>
                <p className="text-sm text-muted-foreground mb-2"><strong>Svrha:</strong> Provjera podataka o tvrtkama (samo Business plan)</p>
                <p className="text-sm text-muted-foreground"><strong>Podaci:</strong> Naziv firme ili OIB koji vi sami pretražujete (javni registar)</p>
              </div>
            </div>

            <p className="text-sm text-muted-foreground mt-4 italic">
              Ažurirana lista sub-procesora dostupna je na zahtjev putem <a href="mailto:privacy@vmbalance.com" className="text-primary hover:underline">privacy@vmbalance.com</a>.
            </p>
          </section>

          {/* 5. ROKOVI ČUVANJA */}
          <section>
            <h2 className="text-xl font-semibold mb-3">5. Rokovi čuvanja podataka (retention)</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-3 font-semibold">Kategorija podataka</th>
                    <th className="text-left p-3 font-semibold">Rok čuvanja</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  <tr className="border-t border-border">
                    <td className="p-3">Aktivan korisnički račun i transakcije</td>
                    <td className="p-3">Dok je račun aktivan</td>
                  </tr>
                  <tr className="border-t border-border">
                    <td className="p-3">Nakon brisanja računa — backupi</td>
                    <td className="p-3">30 dana, zatim trajno brisanje</td>
                  </tr>
                  <tr className="border-t border-border">
                    <td className="p-3">Neaktivan besplatan račun (bez prijave)</td>
                    <td className="p-3">24 mjeseca, zatim email upozorenje + brisanje</td>
                  </tr>
                  <tr className="border-t border-border">
                    <td className="p-3">Sigurnosni logovi prijava</td>
                    <td className="p-3">90 dana</td>
                  </tr>
                  <tr className="border-t border-border">
                    <td className="p-3">Dijagnostički logovi (Sentry, app logs)</td>
                    <td className="p-3">7-30 dana</td>
                  </tr>
                  <tr className="border-t border-border">
                    <td className="p-3">Push notification logovi</td>
                    <td className="p-3">30 dana</td>
                  </tr>
                  <tr className="border-t border-border">
                    <td className="p-3">AI chat poruke</td>
                    <td className="p-3">90 dana</td>
                  </tr>
                  <tr className="border-t border-border">
                    <td className="p-3">Računovodstveni podaci (Business plan, fakture)</td>
                    <td className="p-3">11 godina (Zakon o računovodstvu RH)</td>
                  </tr>
                  <tr className="border-t border-border">
                    <td className="p-3">Podaci o naplati (Stripe)</td>
                    <td className="p-3">10 godina (porezni zakoni)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* 6. VAŠA PRAVA - DETALJNO */}
          <section>
            <h2 className="text-xl font-semibold mb-3">6. Vaša prava prema GDPR-u</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Kao ispitanik imate sljedeća prava koja možete ostvariti slanjem zahtjeva
              na <a href="mailto:gdpr@vmbalance.com" className="text-primary hover:underline">gdpr@vmbalance.com</a>.
              Na zahtjev odgovaramo <strong>u roku od 30 dana</strong> (može se produžiti za 60 dana
              u kompleksnim slučajevima — bit ćete obaviješteni).
            </p>

            <div className="space-y-3">
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="font-medium mb-1">📖 Pravo na pristup (čl. 15)</p>
                <p className="text-sm text-muted-foreground">Dobiti kopiju svih podataka koje obrađujemo o vama.</p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="font-medium mb-1">✏️ Pravo na ispravak (čl. 16)</p>
                <p className="text-sm text-muted-foreground">Ispraviti netočne ili dopuniti nepotpune podatke. Većinu možete urediti sami u Postavkama.</p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="font-medium mb-1">🗑️ Pravo na brisanje / "pravo na zaborav" (čl. 17)</p>
                <p className="text-sm text-muted-foreground">Tražiti brisanje vaših podataka. Račun možete obrisati i sami u Postavkama → Zona opasnosti.</p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="font-medium mb-1">⏸️ Pravo na ograničenje obrade (čl. 18)</p>
                <p className="text-sm text-muted-foreground">Privremeno zaustaviti obradu vaših podataka.</p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="font-medium mb-1">📦 Pravo na prenosivost (čl. 20)</p>
                <p className="text-sm text-muted-foreground">Izvesti vaše podatke u strojno čitljivom formatu (JSON/CSV). Dostupno u Postavkama → Izvoz podataka.</p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="font-medium mb-1">✋ Pravo na prigovor (čl. 21)</p>
                <p className="text-sm text-muted-foreground">Prigovoriti obradi temeljenoj na legitimnom interesu.</p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="font-medium mb-1">↩️ Pravo na povlačenje privole (čl. 7)</p>
                <p className="text-sm text-muted-foreground">U bilo kojem trenutku povući privolu (npr. push notifikacije).</p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="font-medium mb-1">⚖️ Pravo na pritužbu nadzornom tijelu (čl. 77)</p>
                <p className="text-sm text-muted-foreground">
                  Podnijeti pritužbu Agenciji za zaštitu osobnih podataka (AZOP), Selska cesta 136, Zagreb.
                  Web: <a href="https://azop.hr" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">azop.hr</a>
                </p>
              </div>
            </div>
          </section>

          {/* 7. Sigurnost */}
          <section>
            <h2 className="text-xl font-semibold mb-3">7. Sigurnosne mjere (čl. 32 GDPR)</h2>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
              <li>TLS 1.3 enkripcija u prijenosu (HTTPS)</li>
              <li>AES-256 enkripcija u pohrani (na razini baze)</li>
              <li>Hashirane lozinke (bcrypt)</li>
              <li>Row-Level Security (RLS) — strogo izolirani podaci po korisniku</li>
              <li>Provjera lozinki protiv baze procurjelih lozinki (HIBP)</li>
              <li>PIN kod / biometrija za pristup aplikaciji (opcionalno)</li>
              <li>Redoviti sigurnosni audit i automatsko skeniranje</li>
              <li>Obavijest o povredi podataka u roku od 72 sata (čl. 33)</li>
            </ul>
          </section>

          {/* 8. Lokalna pohrana */}
          <section>
            <h2 className="text-xl font-semibold mb-3">8. Lokalna pohrana i kolačići</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              Aplikacija koristi <strong>localStorage</strong> i <strong>IndexedDB</strong> isključivo
              za pohranu vaših postavki, sesije i opcionalno lokalnih podataka. Ne koristimo
              marketinške kolačiće, niti pratimo vaše ponašanje izvan aplikacije.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Slike računa koje skenirate u aplikaciji <strong>po defaultu se pohranjuju lokalno</strong> na
              vašem uređaju i nikad ne napuštaju uređaj, osim ako sami eksplicitno ne migrirate u cloud.
            </p>
          </section>

          {/* 9. Djeca */}
          <section>
            <h2 className="text-xl font-semibold mb-3">9. Zaštita djece</h2>
            <p className="text-muted-foreground leading-relaxed">
              Aplikacija nije namijenjena osobama mlađim od 16 godina (čl. 8 GDPR).
              Ne prikupljamo namjerno podatke od maloljetnih osoba. Ako saznate da je
              dijete mlađe od 16 godina pružilo nam podatke bez privole roditelja,
              kontaktirajte nas i odmah ćemo obrisati podatke.
            </p>
          </section>

          {/* 10. Automatsko odlučivanje */}
          <section>
            <h2 className="text-xl font-semibold mb-3">10. Automatizirano odlučivanje i AI</h2>
            <p className="text-muted-foreground leading-relaxed">
              Koristimo AI za prepoznavanje kategorija transakcija i OCR računa, ali to su
              <strong> isključivo prijedlozi koje vi potvrđujete</strong>. Ne donosimo
              automatizirane odluke s pravnim posljedicama za vas (čl. 22 GDPR).
            </p>
          </section>

          {/* 11. Izmjene */}
          <section>
            <h2 className="text-xl font-semibold mb-3">11. Izmjene politike privatnosti</h2>
            <p className="text-muted-foreground leading-relaxed">
              O značajnim izmjenama bit ćete obaviješteni emailom i obavijesti u aplikaciji
              najmanje 30 dana prije stupanja na snagu. Manje izmjene (tipfeleri, dodavanje
              sub-procesora s istim jamstvima zaštite) objavljujemo bez prethodne obavijesti
              uz ažuriranje datuma na vrhu dokumenta.
            </p>
          </section>

          {/* 12. Kontakt */}
          <section>
            <h2 className="text-xl font-semibold mb-3">12. Kontakt</h2>
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <p className="font-medium">V&M Balance</p>
              <p className="text-sm text-muted-foreground">📧 Privatnost: <a href="mailto:privacy@vmbalance.com" className="text-primary hover:underline">privacy@vmbalance.com</a></p>
              <p className="text-sm text-muted-foreground">📧 GDPR zahtjevi: <a href="mailto:gdpr@vmbalance.com" className="text-primary hover:underline">gdpr@vmbalance.com</a></p>
              <p className="text-sm text-muted-foreground">📧 Sigurnost: <a href="mailto:security@vmbalance.com" className="text-primary hover:underline">security@vmbalance.com</a></p>
              <p className="text-sm text-muted-foreground">🌐 Web: <a href="https://vmbalance.com" className="text-primary hover:underline">vmbalance.com</a></p>
            </div>
          </section>

        </div>

        <div className="mt-12 pt-8 border-t border-border text-center text-sm text-muted-foreground">
          <p>© 2026 V&M Balance. Sva prava pridržana.</p>
          <p className="mt-1 text-xs">Verzija dokumenta: 2.0 · 29.04.2026.</p>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
