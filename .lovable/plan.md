# Shared Resources Link — Structural Choice v1.1

Zatvara **B-1** iz `Reuse / Refactor / Rebuild Plan v1`: koja je **strukturna paradigma** sloja koji povezuje `Krug` s dijeljenim resursima (budgets, payment sources, projekti, ciljevi, dokumenti, …).

Ovaj dokument bira **smjer**, ne schemu. Bez naziva tablica, kolona, FK pravila, RLS politika, trigger strategije. To pripada kasnijem data/schema dokumentu.

---

## 1. Što je već zaključano (ulazi u odluku)

- **Domain potreba B-1**: Krug mora moći "sadržavati" dijeljene resurse dostupne punopravnim članovima. *(Domain Model v1.1 §2.7)*
- **Foundation pravilo**: transakcija ostaje korisniku, ne Krugu. Resurs je **zaseban entitet** s vlastitim vlasništvom, koji može biti dijeljen.
- **Post-delete pravilo** (Patch v1.1): kad Krug nestane, Krug-specifična metadata se briše. Link Krug↔resurs mora moći nestati **bez da ubije sam resurs**.
- **Postojeće stanje**: `family_shared_sources` već postoji kao per-resource link tablica. Budgets/projekti/ciljevi nikad nisu dobili svoj `family_shared_*` ekvivalent.

---

## 2. Tri kandidatska smjera

### Smjer (a) — Jedinstvena generička link tablica

Jedna polimorfna tablica koja generalizira sve resurse (tip + id resursa).

**Plus:**
- Jedan kod-put za sve resurse.
- Trivijalno dodavanje novog tipa resursa u budućnosti.
- Post-delete čišćenje je jedna operacija po Krugu.

**Minus:**
- Polimorfne reference nemaju pravi FK ni na jednu specifičnu tablicu — moraju se simulirati trigerima ili viewovima. U Postgresu uz RLS to postaje neugodno jer per-resource provjera vlasništva traži grananje po tipu resursa unutar policy-ja.
- Postojeća infrastruktura (`family_shared_sources` + sinkronizacija na nižim slojevima) bi se morala raspisati od nule.
- Performance regresija na hot pathu (svaki upit ide kroz polimorfni sloj umjesto direktno).

### Smjer (b) — Per-resource link tablice, rename + standardizacija konvencije

Svaki tip resursa ima vlastitu link tablicu (postojeća `family_shared_sources` se renameira, novi tipovi dobivaju vlastite). Sve dijele istu konvenciju i shape, ali su fizički odvojene.

**Plus:**
- Pravi FK enforcement na razini baze (link zna točno na koji tip resursa pokazuje).
- RLS po tablici je jednostavna i fokusirana — ne mora granati po tipu.
- **Postojeća `family_shared_sources` infrastruktura ostaje funkcionalna** — rename + zamjena reference na Krug umjesto na obitelj.
- M:N između Kruga i resursa je prirodno očuvan (isti resurs može biti dijeljen u više Krugova).

**Minus:**
- N tablica umjesto 1. Više boilerplatea pri dodavanju novog tipa resursa.
- Konvencija mora biti **strogo standardizirana** preko svih per-resource tablica, inače model degenerira u "skupinu sličnih tablica s različitim ponašanjem".
- Kod-put nije sasvim DRY — trebaju per-resource hookovi, ali to je već stvarnost u app-u.

### Smjer (c) — Pripadnost Krugu direktno na resursu, bez link tablice

Resurs sam nosi referencu na Krug kojem pripada (umjesto zasebne link tablice).

**Minus — fatalni za naš model:**
- **Resurs može biti dijeljen u najviše jednom Krugu istovremeno.** Korisnik koji je u dvije obitelji ne može isti resurs dijeliti u oba Kruga. M:N je izgubljen.
- **Vlasništvo se miješa s dijeljenjem** — semantika "tko ovo posjeduje" postaje dvosmislena kad se Krug briše.
- **Post-delete** traži pisanje po samim resursima pri brisanju Kruga — širi blast radius i odstupa od foundation pravila "Krug je kontekst, ne vlasnik".

---

## 3. Odluka

**Smjer (b) — per-resource link tablice s rename + standardizacijom konvencije.**

### Razlozi

1. **Najmanje rizika za već radeći kod.** Postojeća infrastruktura je zaključana i testirana; rename je deterministička transformacija, ne arhitekturno prepisivanje.
2. **Pravi FK enforcement** na razini baze. Polimorfne reference (smjer a) su poznata anti-paterna u Postgresu uz RLS.
3. **Foundation poštivanje.** Resurs ostaje svoj entitet. Link tablica je čista posrednica koja se može ukloniti bez dodirivanja resursa — što post-delete pravilo i traži.
4. **M:N je očuvan.** Isti resurs može biti dijeljen u više Krugova. Smjer (c) to ne dopušta; smjer (a) dopušta uz polimorfnu cijenu.
5. **Postupnost.** Smjer (b) dopušta da se najprije migrira samo postojeća link tablica, dok se ostali tipovi resursa dodaju tek kad ih stvarno zatreba prvi feature. Smjer (a) traži cijeli sloj od dana 1.

### Što ova odluka **NE** propisuje (svjesno izvan razine ovog dokumenta)

- točne nazive pojedinih tablica
- točan shape kolona, indekse, UNIQUE constraintove
- FK pravila (CASCADE / SET NULL / RESTRICT)
- konkretne RLS policy-je
- trigger strategiju i sinkronizaciju s nižim slojevima
- migracijski redoslijed i backfill strategiju
- redoslijed kojim se per-resource tablice grade

Sve gore navedeno pripada kasnijem **data/schema dokumentu**, ne ovoj structural-choice razini.

---

## 4. Standardizacijska načela za smjer (b)

Da smjer (b) ne propadne u "N različitih tablica s različitim konvencijama", kasniji schema dokument mora poštivati ova **načela** (ne konkretna pravila):

1. **Jedinstvena konvencija naziva** za sve per-resource link tablice (točan oblik bira schema dokument).
2. **Zajednički minimum shape-a** preko svih tablica — link uvijek povezuje točno jedan Krug s točno jednim resursom, plus standardna audit metadata. Konkretne kolone i constraintovi su pitanje schema dokumenta.
3. **Per-resource proširenja su dopuštena**, ali ne smiju kršiti zajednički minimum.
4. **Post-delete usklađenost je obavezna**: brisanje Kruga mora ukloniti pripadajuće linkove bez dodirivanja resursa. Mehanizam (CASCADE, trigger, RPC) je pitanje schema dokumenta.
5. **Sinkronizacija s nižim slojevima** (npr. derivacija članstva iz dijeljenja) ostaje per-tablica i ne smije se generalizirati prije nego stvarno postoji 2+ tablice s identičnim ponašanjem.

---

## 5. Otvorena pitanja (preporuke, ne zaključane odluke)

Sljedeće je **smisleno razmotriti** u kasnijim dokumentima, ali **nije ovdje zaključano**:

- **Tko smije čitati shared resource link.** Intuitivno: punopravni članovi Kruga. Ali foundation još nije eksplicitno definirao access matrix za shared resurse po statusu članstva (`punopravni` / `read_only` / itd.). Ovo se rješava ili u foundation dopuni ili u schema dokumentu — ovdje se ostavlja kao **preporuka, ne pravilo**.
- **Tko smije kreirati / ukloniti link.** Intuitivno: vlasnik resursa. Isto pitanje access matrixa — preporuka, ne pravilo.
- **Role na samom linku** (viewer / editor na razini Kruga) vs. role na nižem sloju članstva resursa — odluka po pojedinoj tablici, ne foundation pitanje.
- **Unificirani query view** preko svih per-resource link tablica — query/UI layer, ne struktura.

---

## 6. Kritički osvrt

**Snaga:** poklapa se s realnim stanjem koda. Najmanja udaljenost između "danas radi" i "sutra radi za Krug". Ortogonalno post-delete pravilu.

**Slabost:** dodavanje novog tipa resursa u budućnosti traži novu tablicu + novi hook. Više boilerplatea od smjera (a). Prihvatljivo jer se novi tipovi resursa dodaju rijetko.

**Rizik:** ako se standardizacijska načela iz §4 ne provedu strogo, model degenerira. Mitigacija je odgovornost schema dokumenta, ne ovoga.

---

## 7. Status

- **B-1 zatvoren.** Izabran smjer **(b)**. Konkretizacija (nazivi, kolone, RLS, triggeri) prepuštena kasnijem data/schema dokumentu.
- **B-2 zatvoren** (Patch v1.1).
- **Reuse / Refactor / Rebuild Plan v1** više nema blocked stavki. `KrugSharedResourceLink` iz Domain Model v1.1 §2.7 sada je klasificiran kao **Refactor (per-resource rename + standardizacija)**, ne kao novi generički entitet.

---

## 8. Što slijedi (preporuka, ne odluka)

Sljedeći logičan dokument je **`Krug Implementation Order v1`** — prevodi zaključani Reuse / Refactor / Rebuild Plan + ovaj structural choice u redoslijed izgradnje.

Alternative na foundation razini:
- **`Krug Access Matrix v1`** — eksplicitno tko što smije po statusu članstva (zatvara otvorena pitanja iz §5)
- **`Krug Naming & Migration Strategy v1`** — kad i kako `family_*` postaje `krug_*` u kodu i UI-u
- **`Krug i18n Namespace v1`** — strukturni plan za `krug.*` ključeve

Reci "prihvaćam v1.1" pa idemo dalje, ili javi korekcije.
