# Shared Resources Link — Structural Choice v1

Zatvara **B-1** iz `Reuse / Refactor / Rebuild Plan v1`: tehnička struktura sloja koji povezuje `Krug` s dijeljenim resursima (budgets, payment sources, projekti, ciljevi, dokumenti, …).

Bez SQL-a, bez migracijskih koraka, bez UI plana. Cilj: izabrati **jedan** od tri kandidatska smjera (a / b / c iz plana §1.4) i obrazložiti zašto.

---

## 1. Što je već zaključano (ulazi u odluku)

- **Domain potreba B-1**: Krug mora moći "sadržavati" dijeljene resurse i imati ih dostupne svim punopravnim članovima. *(Domain Model v1.1 §2.7)*
- **Foundation pravilo**: transakcija ostaje korisniku, ne Krugu. Resurs (budget, source, projekt) je **zaseban entitet** koji ima vlastito vlasništvo i može biti dijeljen.
- **Post-delete pravilo** (Patch v1.1): kad Krug nestane, Krug-specifična metadata se briše. To znači: link Krug↔resurs mora moći nestati **bez da ubije sam resurs**.
- **Postojeće stanje u kodu** (provjereno iz mem indexa): `family_shared_sources` već postoji kao per-resource link tablica + triggeri sinkroniziraju `payment_source_members` (auto-limited). Family Module Phase 1 koristi `useFamilyBudgetTally` (GROUP BY budget×user) — nema centralnog `family_shared_budgets`, već se dijeljenje izvodi iz transakcijskih atributa.
- **Multi-resurs realnost**: trenutno postoji **samo jedna** strukturirana shared-resource tablica (`family_shared_sources`). Budgets/projekti/ciljevi nikad nisu dobili svoj `family_shared_*` ekvivalent.

---

## 2. Tri kandidatska smjera

### Smjer (a) — Jedinstvena generička link tablica

`KrugSharedResourceLink(krug_id, resource_type, resource_id, …)` koja generalizira sve resurse jednom tablicom.

**Plus:**
- Jedan kod-put za sve resurse (jedna RPC obitelj, jedan trigger, jedna RLS familija).
- Trivijalno dodavanje novog resursa u budućnosti (samo novi `resource_type`).
- Post-delete čišćenje je jedan `DELETE WHERE krug_id = X`.

**Minus:**
- Polimorfne reference: `resource_id` ne može biti pravi FK ni na jednu specifičnu tablicu. Mora se simulirati trigerima ili `CHECK + UNION` viewovima. Postgres to ne voli i RLS postaje neugodan jer per-resource provjera vlasništva traži `CASE resource_type` u policy-ju.
- Indeksiranje per-resource queryja postaje skupo (`WHERE resource_type='budget' AND resource_id=X` — kompozitni indeks ide, ali svaki upit mora navesti tip).
- Cijela arhitektura postojećeg koda (`family_shared_sources`, `payment_source_members` trigger sinkronizacija) bi se **morala raspisati od nule**.
- Performance regresija na hot pathu (payment source lookup je čest, prelazak preko polimorfne tablice je 1 join više vs danas).

### Smjer (b) — Per-resource link tablice, samo rename + standardizacija konvencije

`family_shared_sources` → `krug_shared_sources`, novi `krug_shared_budgets`, `krug_shared_projects`, … — svaki je svoja tablica s vlastitim FK na resurs i na Krug.

**Plus:**
- Pravi FK na obje strane: `krug_shared_sources.payment_source_id REFERENCES payment_sources(id)`. Cascade i constraint enforcement na razini baze.
- RLS po tablici je jednostavna: per-resource policy zna točno na koji tip pristupa.
- **Postojeća `family_shared_sources` infrastruktura ostaje funkcionalna** — samo rename + dodavanje `krug_id` umjesto `family_group_id`.
- Indeksiranje je nativno.
- Triggeri za auto-sync (`payment_source_members`) ostaju razumljivi i per-tablica fokusirani.

**Minus:**
- N tablica umjesto 1. Više boilerplatea pri dodavanju novog resursa.
- Pravila moraju biti **strogo standardizirana** (svaka tablica ista shape: `id, krug_id, <resource>_id, created_at, created_by`), inače se model raspada.
- Kod-put nije sasvim DRY — trebaju per-resource hookovi (`useKrugSharedSources`, `useKrugSharedBudgets`, …), ali to je već stvarnost u app-u (`useBudgets`, `usePaymentSources`, … su odvojeni).

### Smjer (c) — `krug_id` direktno na resursu, bez link tablice

`payment_sources.krug_id`, `budgets.krug_id`, `projects.krug_id`, … nullable kolona. Resurs "pripada" Krugu ako je `krug_id IS NOT NULL`.

**Plus:**
- Najmanje tablica, najjednostavniji upit ("daj sve resurse ovog Kruga").
- RLS može direktno koristiti `krug_id` na samom resursu.

**Minus — fatalni za naš model:**
- **Resurs može biti dijeljen u najviše jednom Krugu istovremeno**. Korisnik koji je u dvije obitelji (Spouse/Partner s partnerom + Su-roditelj s bivšim) ne može isti budget dijeliti u oba Kruga. To je tvrdo M:1 ograničenje.
- **Vlasništvo resursa se miješa s dijeljenjem.** Trenutno resurs ima `user_id` (vlasnik). Dodavanjem `krug_id` na isti red, semantika "tko ovo posjeduje" postaje dvosmislena pri brisanju Kruga.
- **Post-delete čišćenje** traži `UPDATE` na svaki resurs koji je nekoć bio u Krugu — to je izvedivo, ali znači da se pri brisanju Kruga pišu redovi u `payment_sources`, `budgets`, `projects`, … što širi blast radius operacije brisanja.
- Krši duh "Krug je kontekst, ne vlasnik" iz foundationa.

---

## 3. Preporuka

**Smjer (b) — per-resource link tablice s rename + standardizacija.**

### Razlog

1. **Najmanje rizika za već radeći kod.** `family_shared_sources` + auto-limited triggeri su zaključana, testirana infrastruktura. Rename + zamjena `family_group_id` → `krug_id` je deterministička transformacija, ne arhitekturna prepisivanja.
2. **Pravi FK enforcement** na razini baze. Polimorfne reference (smjer a) su poznata anti-paterna u Postgresu kad postoji RLS — svaki put kad bismo htjeli "budget koji je shared u ovom Krugu", policy mora granati po `resource_type`. To je sporo i lako pogrešno.
3. **Foundation poštivanje.** Resurs ostaje svoj entitet. Link tablica je čista posrednica koja se može obrisati bez ikakvog dodirivanja samog resursa — što je upravo ono što post-delete pravilo traži.
4. **M:N je očuvan.** Korisnik može imati isti payment source dijeljen u više Krugova (jedan red po Krugu u `krug_shared_sources`). Smjer (c) to ne dopušta; smjer (a) dopušta ali uz polimorfnu cijenu.
5. **Postupnost.** Smjer (b) dopušta da se najprije migrira samo `family_shared_sources` → `krug_shared_sources`, dok `krug_shared_budgets`/`krug_shared_projects`/… ostaju nedodirnuti dok ih stvarno ne zatreba prvi feature. Smjer (a) traži cijeli sloj od dana 1.

### Što (b) eksplicitno **NE** propisuje (izvan ovog dokumenta)

- točan naziv pojedinih tablica (samo konvenciju `krug_shared_<resource_plural>`)
- shape kolona izvan minimuma (`id, krug_id, <resource>_id, created_at, created_by`)
- migracijski redoslijed
- koja per-resource link tablica se gradi prva, druga, treća
- backfill strategiju za postojeće `family_shared_sources` redove
- točan trigger kod za sinkronizaciju s `payment_source_members` (već postoji, prilagođava se)

To su domain/migration dokumenti koji dolaze nakon.

---

## 4. Standardizacijska pravila za (b)

Da smjer (b) ne propadne u "N različitih tablica s različitim konvencijama":

1. **Naziv tablice**: `krug_shared_<resource_plural>` (npr. `krug_shared_sources`, `krug_shared_budgets`, `krug_shared_projects`).
2. **Obavezne kolone**:
   - `id` (PK)
   - `krug_id` (FK na `Krug`, NOT NULL, ON DELETE CASCADE — jer post-delete pravilo traži uklanjanje linka)
   - `<resource>_id` (FK na resurs, NOT NULL, ON DELETE CASCADE — ako se resurs sam briše, link nema smisla)
   - `created_at`, `created_by`
   - **UNIQUE (`krug_id`, `<resource>_id`)** — isti resurs ne smije biti linkan dvaput na isti Krug
3. **RLS pravilo (kanonsko)**: čitati smiju **punopravni** članovi Kruga (preko `KrugMember`). Pisati (INSERT/DELETE) smije **vlasnik resursa**, ne bilo koji član.
4. **Per-resurs proširenja** (npr. role na linku, kvota): dopuštena, ali samo kao **dodatne kolone na specifičnoj tablici** — nikad ne smiju kršiti minimum iz točke 2.
5. **Trigger sinkronizacija s nižim slojevima** (npr. `payment_source_members` auto-limited) ostaje per-tablica i ne smije se generalizirati prije nego stvarno postoji 2+ tablice koje traže identičan trigger.

---

## 5. Post-delete usklađenost

Smjer (b) je **prirodno usklađen** s Patch v1.1:

- Brisanje Kruga → CASCADE briše sve `krug_shared_*` redove vezane uz njega.
- Resurs (budget, source, projekt) **ostaje** sa svojim vlasnikom, samo više nije "shared u tom Krugu".
- Nema polu-definiranog stanja jer link tablica ili postoji ili ne — nema atributa na samom resursu koji bi mogao ostati "zaboravljen".

Atomarnost (iz Patch v1.1 §5) je trivijalna jer je sve unutar jedne transakcije brisanja Kruga.

---

## 6. Kritički osvrt

**Snaga preporuke:** poklapa se s realnim stanjem koda. Najmanja udaljenost između "danas radi" i "sutra radi za Krug". Pravi FK + jednostavna RLS + ortogonalno post-delete.

**Slabost:** dodavanje novog tipa resursa u budućnosti traži novu tablicu + novi hook + novu RLS. To je više boilerplatea od smjera (a). Prihvatljivo jer se novi resursi dodaju rijetko (godišnje, ne mjesečno), a kad se dodaju, dolaze s vlastitom logikom koja ionako ne stane u generičku tablicu.

**Rizik:** ako se konvencija iz §4 ne provede strogo, model degenerira u "skupinu sličnih tablica s različitim ponašanjem". Mitigacija: prva nova tablica nakon `krug_shared_sources` mora biti napravljena kao **referentni primjerak**, s eksplicitnim komentarom da svaka sljedeća prati istu shape.

**Otvoreno (svjesno izvan scope-a):**
- Treba li link tablica imati `role` kolonu (npr. `viewer` / `editor` na razini linka) ili to ostaje na nižem sloju (`payment_source_members`)? — odluka po pojedinoj tablici, ne foundation pitanje.
- Treba li postojati view koji unificira sve `krug_shared_*` u jedinstveni pogled za UI? — to je query layer, ne struktura.

---

## 7. Status

- B-1 zatvoren. Izabran smjer **(b)** s eksplicitnim standardizacijskim pravilima.
- B-2 već zatvoren (Patch v1.1).
- **Reuse / Refactor / Rebuild Plan v1** više nema blocked stavki. `KrugSharedResourceLink` iz Domain Model v1.1 §2.7 sada se klasificira kao **Refactor (per-resource rename + standardizacija)**, ne kao novi generički entitet.

---

## 8. Što slijedi (preporuka, ne odluka)

Sljedeći logičan dokument je **`Krug Implementation Order v1`** — prevodi sad-zaključani Reuse / Refactor / Rebuild Plan + ovaj structural choice u konkretan redoslijed izgradnje (koji entitet prvi, što blokira što, gdje su granice prvog deployable kostura).

Alternative ako želiš ostati na foundation razini:
- **`Krug Naming & Migration Strategy v1`** — kad i kako `family_*` postaje `krug_*` u kodu i UI-u
- **`Krug i18n Namespace v1`** — strukturni plan za `krug.*` ključeve i prijevode

Reci "prihvaćam v1" pa idemo na sljedeći dokument, ili javi korekcije.
