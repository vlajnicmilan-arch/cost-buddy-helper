# Plan: GDPR usklađenost za projekte sa suradnicima

Tri sloja zaštite koji jasno pozicioniraju V&M Balance kao **interni alat za upravljanje projektima**, a ne službenu evidenciju, te omogućuju Business korisnicima da budu GDPR-compliant kad unose podatke radnika/suradnika.

---

## Sloj 1 — Disclaimer "nije službena evidencija"

Cilj: pravno odvojiti app od službenih evidencija (Zakon o radu, Zakon o računovodstvu, Porezna).

**1.1 Terms of Service (`src/pages/TermsOfService.tsx` + `i18n/locales/*.json`)**
- Nova sekcija `tos.s9` "Namjena usluge i ograničenja" (HR/EN/DE):
  - App je alat za interno upravljanje projektima i osobne/poslovne financije
  - Podaci NISU službena evidencija u smislu Zakona o radu, Zakona o računovodstvu, Zakona o porezu na dohodak/dobit, niti se mogu koristiti pred Poreznom upravom, Inspektoratom rada ili sudom kao primarni dokaz
  - Korisnik je dužan voditi službene evidencije u ovlaštenim sustavima

**1.2 Modal pri prvom dodavanju radnika/suradnika**
- Novi `WorkerDataDisclaimerDialog` komponent
- Prikazuje se jednom (localStorage flag `workerDisclaimerAccepted`) pri prvom otvaranju forme za dodavanje u:
  - `project_workers` (komponenta koja koristi `useProjectWorkers`)
  - `project_collaborators` (komponenta koja koristi `useProjectCollaborators`)
- Tekst: "Unosom osobnih podataka treće osobe potvrđujete da imate pravnu osnovu (privola, ugovor) i da ste tu osobu informirali o obradi. Podaci se koriste isključivo za interno praćenje projekta i ne predstavljaju službenu evidenciju."
- Checkbox "Razumijem i prihvaćam" + "Nastavi"

**1.3 Footer u PDF/Excel izvozima**
- `src/lib/projectReportExport.ts`, `src/lib/workRecordsExport.ts`, `src/lib/reportExport.ts`
- Dodati footer liniju: "Generirano iz V&M Balance — interni alat. Nije službena evidencija po Zakonu o radu/računovodstvu."

---

## Sloj 2 — DPA Lite PDF (Data Processing Agreement)

Cilj: pokriti čl. 28 GDPR-a kad Business korisnik (controller) unosi podatke svojih radnika/suradnika koje V&M Balance (processor) pohranjuje.

**2.1 Generator PDF-a (`supabase/functions/generate-dpa/index.ts`)**
- Nova edge funkcija koja generira pre-popunjeni DPA PDF na jeziku korisnika (HR/EN/DE)
- Koristi `pdf-lib` (već dostupno u Deno preko esm.sh) ili HTML→PDF kroz `puppeteer`-alternative — preferirati `pdf-lib` za jednostavnost
- Ulaz: `userId`, `companyName`, `companyOib`, `companyAddress`, `email`, `language`
- Izlaz: PDF buffer s pre-popunjenim podacima

**2.2 Sadržaj DPA Lite (3-4 stranice)**
1. **Strane**: Voditelj obrade (korisnik, popunjeno) + Obrađivač (V&M Balance, fiksno)
2. **Predmet**: pohranjivanje i obrada osobnih podataka u kontekstu upravljanja projektima (imena, kontakti, sati rada, iznosi)
3. **Trajanje**: dok traje pretplata + 30 dana grace period
4. **Vrste podataka**: identifikacijski (ime/prezime/firma), kontakt (email/telefon), profesionalni (pozicija, sati, satnica)
5. **Kategorije ispitanika**: zaposlenici, suradnici, podizvođači korisnika
6. **Sub-procesori**: Lovable Cloud (Supabase, EU regija), Stripe (plaćanja), Resend (emailovi), Google FCM (push notifikacije)
7. **Sigurnosne mjere**: RLS, šifriranje u tranzitu (TLS), enkripcija u mirovanju (Supabase managed), 2FA opcija, brisanje računa GDPR
8. **Prava ispitanika**: korisnik je odgovoran odgovoriti na zahtjeve; V&M Balance pruža alate (export, brisanje)
9. **Obavijest o povredi**: 72h rok od V&M Balance prema korisniku
10. **Završne odredbe**: pravo HR-a, Općinski sud u Zagrebu (mjesto sjedišta)

**2.3 Settings UI**
- Nova sekcija u `Settings` → "Pravna dokumentacija" (samo za Business tier kroz `useFeatureAccess`)
- Forma: ime tvrtke, OIB, sjedište (auto-popunjava iz business profile)
- Button "Generiraj DPA" → poziva edge funkciju → download PDF
- Linkovi na Privacy Policy, ToS, i Privacy Notice template (Sloj 3)

**2.4 Database**
- Nova tablica `dpa_requests` (audit trail):
  - `id`, `user_id`, `company_name`, `company_oib`, `language`, `generated_at`, `download_count`
  - RLS: korisnik vidi/kreira samo svoje; admin vidi sve
- Nije obavezno za pravnu valjanost ali korisno za praćenje

---

## Sloj 3 — Privacy Notice template za radnike/suradnike

Cilj: dati Business korisniku gotov dokument koji **on** može dati svojim radnicima/suradnicima da ispuni svoju obavezu informiranja po čl. 13/14 GDPR-a.

**3.1 Generator (`supabase/functions/generate-privacy-notice/index.ts`)**
- Slično kao DPA generator, generira PDF
- Pre-popunjen tvrtkom korisnika
- Tekst u prvom licu firme korisnika ("Naša tvrtka [X] koristi alat V&M Balance za interno upravljanje projektima...")

**3.2 Sadržaj (1-2 stranice, jasno i čitljivo, bez pravnog žargona)**
- Tko obrađuje podatke (firma korisnika)
- Koji se podaci obrađuju (ime, kontakt, sati rada, plaća/honorar po satu)
- Svrha (interno praćenje projekta i obračuna)
- Pravna osnova (ugovor o radu / ugovor o suradnji / legitimni interes)
- Tko može vidjeti (samo članovi projekta unutar firme korisnika + V&M Balance kao processor)
- Gdje se čuvaju (EU regija)
- Koliko dugo (trajanje suradnje + zakonski rokovi)
- Prava (pristup, ispravak, brisanje, prenosivost, prigovor)
- Kontakt za zahtjeve (email firme korisnika)

**3.3 Settings UI**
- Pored "Generiraj DPA" — button "Generiraj Privacy Notice za radnike"
- Dostupno svim Business korisnicima

---

## Tehnički detalji

**i18n ključevi za dodati (HR/EN/DE):**
- `tos.s9.*` (5 ključeva za novu ToS sekciju)
- `disclaimer.workerData.*` (modal: title, body, accept, cancel)
- `settings.legal.*` (new sekcija: title, dpaButton, privacyNoticeButton, companyInfoForm, language)
- `exports.footer.notOfficial` (footer string)

**Edge funkcije** (oba: `verify_jwt = true`, JSON odgovor s base64 PDF-om):
- `supabase/functions/generate-dpa/index.ts`
- `supabase/functions/generate-privacy-notice/index.ts`
- Koriste `pdf-lib` iz esm.sh
- Standard CORS headers

**Migracija:**
```sql
CREATE TABLE public.dpa_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name text NOT NULL,
  company_oib text,
  company_address text,
  language text NOT NULL DEFAULT 'hr',
  generated_at timestamptz NOT NULL DEFAULT now(),
  download_count integer NOT NULL DEFAULT 1
);
ALTER TABLE public.dpa_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_select_own_dpa" ON public.dpa_requests FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_insert_own_dpa" ON public.dpa_requests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admins_select_all_dpa" ON public.dpa_requests FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
```

**Komponente za dodati:**
- `src/components/legal/WorkerDataDisclaimerDialog.tsx`
- `src/components/settings/LegalDocumentsSection.tsx` (rendera se uvjetno za Business tier)

**Komponente za izmijeniti:**
- Forma za `project_workers` (potraga: `useProjectWorkers` consumer) — wrap u disclaimer guard
- Forma za `project_collaborators` (potraga: `useProjectCollaborators` consumer) — wrap u disclaimer guard
- `src/pages/TermsOfService.tsx` — dodati sekciju s9
- `src/lib/projectReportExport.ts`, `workRecordsExport.ts`, `reportExport.ts` — footer string
- `Settings` stranica — dodati LegalDocumentsSection

---

## Što plan ne uključuje (svjesno)

- Punu DPA verziju (s dodatkom za posebne kategorije podataka po čl. 9 GDPR-a) — nepotrebno jer app ne obrađuje zdravstvene/biometrijske/itd. podatke
- DPIA proceduru — opseg premali
- Multi-controller scenarije (više firmi dijeli podatke) — pokriveno postojećim DPA tekstom dovoljno
- Automatsko slanje DPA potpisanog ugovora kroz DocuSign/sl. — korisnik download i potpiše ručno/elektronički

---

## Redoslijed izvedbe

1. Sloj 1 (disclaimer) — najmanje riskantno, najviše efekta odmah
2. Migracija + edge funkcija za DPA
3. Settings UI za Sloj 2
4. Edge funkcija + UI za Sloj 3
5. i18n prijevodi (HR primarni, EN i DE paralelno)
6. Test: Business korisnik generira oba PDF-a, otvori, provjeri popunjenost
