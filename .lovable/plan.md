
# Kritika plana dovršavanja Kruga (read-only)

Ovo NIJE implementacijski plan. Ovo je kritički osvrt na predloženi redoslijed od 11 workstreamova. Ništa se ne mijenja.

---

## 1. Gdje je predloženi redoslijed pogrešan

Kratko i bez uljepšavanja: **redoslijed je pogrešan na najvažnijem mjestu — stavlja UI ulaz (WS1: expense entry → Krug) ispred semantičkog zatvaranja (WS2: Krug expense semantics i WS3: split/settlement).** To je klasična greška "gradimo lijevak prije nego znamo što se u posudu smije natočiti".

Konkretno:

- **WS1 prije WS2 je inverzija.** Ne možeš dizajnirati entry surface za nešto čija semantika nije zaključana. Ako korisnik iz `AddExpenseDialog` odabere Krug, sustav mora u tom trenutku odlučiti: postaje li to odmah `shared+predlozena`, ide li u `personal` s `krug_id`, tko je autor u smislu A-akata, kako se ponaša ako izvor nije shared, što se događa s `krug_privacy`. Svaki od tih odgovora živi u WS2. Graditi WS1 sada znači kodirati privremene odluke koje će WS2 poništiti.

- **WS3 (split/settlement) prije WS2 je nemoguće**, pa je red WS2 → WS3 formalno točan, ali WS3 je stavljen prerano u odnosu na cijeli ostatak. Split/settlement je najveća semantička odluka u modulu (i danas nedokumentirana — audit je to eksplicitno naznačio). Dok se ne odluči **je li Krug alat za saldiranje ili samo za zajednički trag**, sve iza toga (notifikacije, lifecycle, approval UX) gradi se u magli. WS3 nije "treći korak", to je **preduvjet svemu ostalom osim delete flow-a i pure decision helpera koji su već gotovi.**

- **WS4 (invite) je prerano.** Nema smisla dovoditi neregistrirane članove u modul čija semantika sudjelovanja (tko što potvrđuje, tko što vidi, tko što duguje) nije zatvorena. Invite se radi kad je jasno u što pozivaš.

- **WS5 (lifecycle operationalization) je stavljen prekasno i istovremeno prerano.** Prekasno jer lifecycle prijelaze (`early_signal`, `ugrozen`, `continuity_window`, `read_only`) direktno ovise o događajima koje generiraju WS1/WS2/WS3 (nema aktivnosti → `early_signal`; jedini punopravni ode → `ugrozen`; itd.). Prerano jer bez WS10 (notifikacije) lifecycle prijelazi su nevidljivi korisniku pa nemaju operativni smisao.

- **WS6 (shared source unification) je skriveni preduvjet za WS1, ne posljedica.** Danas je Krug u praksi dostupan **samo** transakcijama koje su u njega dospjele preko shared izvora (audit). To znači da je shared source jedini živi ulaz. Ako se WS1 gradi prije WS6, dobiješ dva paralelna, potencijalno nekonzistentna ulaza u Krug (ručni odabir vs. auto-attach preko izvora) bez arbitraže između njih.

- **WS7 (approval visibility) i WS10 (notifikacije) su umjetno razdvojeni.** Approval badge na BottomNav-u i push "netko je predložio trošak Krugu" su ista stvar iz dvije perspektive (in-app vs. out-of-app). Cijepanje ih čini oba pola-gotovima.

- **WS8 (delete flow integration) je već gotov end-to-end** (audit: najzreliji dio modula, 19 vitest testova, cron purge). Kao workstream ne postoji; ako postoji, to je maksimalno "provjeri da lifecycle=deleted skriva Krug iz svih preostalih surfacea" — ne cijeli WS.

- **WS9 (governance UX cleanup) nije workstream, to je poliranje.** Stavljanje u numerirani red daje mu težinu koju nema.

**Skrivene ovisnosti koje plan ne priznaje:**

1. **Autorstvo troška.** Tko je "autor" u Krug smislu — `user_id` na expensu, ili osoba koja je izvršila attach na Krug, ili onaj tko je vlasnik izvora s kojeg je plaćeno? Bez ovoga A3 (autor retract) i attribution u split modelu nisu definirani. Ovo mora biti odluka prije WS1.
2. **Odnos `krug_privacy` (personal/private/shared) i split modela.** Ako Krug ima settlement, ulazi li `private` u obračun? Ako ne, koji je smisao `private` uopće?
3. **Odnos `krug_id` na expensu i shared payment source atačmenta.** Danas su to dvije istine koje mogu divergirati (expense veže Krug X, izvor veže Krug Y). Bez arbitraže WS1 udvostručuje problem.
4. **Currency u multi-member Krugu.** Ako članovi imaju izvore u različitim valutama, split model mora znati u kojoj se valuti saldira. Nije spomenuto.
5. **Odnos Kruga i business/personal mode.** BottomNav skriva Krug u business kontekstu, ali expense entry surface u business modu nije reguliran prema Krugu. Sudar postoji.

---

## 2. Što je pravi prvi workstream

**`expense entry → Krug` NIJE pravi prvi execution workstream.** Pravi prvi workstream je **semantičko zatvaranje**, i on je *ne-UI*.

Zovem ga **WS0: Krug Semantics Lock**. Cilj: donijeti i pisano fiksirati odluke koje sve ostalo koristi kao ulaz. Bez koda, bez migracija — dokument + testovi na pure helperima gdje već postoje (`krugDecisions`, `krugDeletionDecisions`).

Što mora ući u WS0:

- **Namjena Kruga (jednoznačno):** je li Krug (a) zajednički trag potrošnje bez saldiranja, (b) split/settlement alat, ili (c) hibrid s eksplicitnim on/off po Krugu. Bez ovoga svaki daljnji WS je kockanje.
- **Definicija autorstva** za A-akte i za split (ako postoji).
- **Arbitraža između `expenses.krug_id` i `krug_shared_payment_source`** kad se ne slažu.
- **Semantika `krug_privacy` u odnosu na split** (uključivo: smije li se `private` mijenjati u `shared` retroaktivno i što to znači za saldo).
- **Currency pravilo** za multi-member Krug.
- **Lifecycle triggeri kao ugovor:** koji događaj vodi u koje stanje. Danas u repou ne postoji, samo vizualna reprezentacija.
- **Odnos prema business modeu:** je li Krug ikada dopušten u business kontekstu ili ostaje personal-only.

Što **ne** ulazi u WS0: nikakav UI, nikakve nove tablice, nikakva mikro-kopija, nikakav notifikacijski tekst.

Definition of done za WS0: postoji jedan dokument (npr. `docs/KRUG_SEMANTICS.md`) koji sadrži gornje odluke, i svaka odluka je referencirana iz `krugDecisions` / `krugDeletionDecisions` komentara. Tek nakon toga počinje bilo koji execution WS.

Tek nakon WS0, **pravi prvi execution WS je WS3 (split/settlement) ili eksplicitna odluka "Krug v1 nema settlement, i to piše u UI-u"** — jer ta odluka blokira sve iza.

---

## 3. Najmanji ispravan scope za prvi execution workstream

Pretpostavljam da vlasnik ne želi mjesec dana u dokument-mode. Onda: **prvi execution WS mora biti semantički najmanji korak koji ne otvara kaos i ne stvara privremena rješenja.**

Preporuka: **prvi execution WS = "Krug v1 semantika + eksplicitni no-settlement disclosure"**, minimalni scope:

Ulazi:
- Odluka "Krug v1 = zajednički trag, bez saldiranja" (ili obrnuto — bitno je da je odluka jedna i pisana).
- Ta odluka postaje vidljiva u UI-u na točno jednom mjestu (npr. u `CreateKrugDialog` završnom koraku i u `KrugDetailScreen` empty stateu). Jedan i18n ključ, tri jezika.
- Autorstvo troška fiksirano na `expenses.user_id` (jer je to danas jedina konzistentna istina) i to pisano.
- Arbitraža `krug_id` vs. shared source: dokumentirana kao "expense.krug_id je istina, shared source je samo hint za auto-attach". Bez izmjena koda.

Svjesno **ne** ulazi:
- Nikakav entry UI za ručni odabir Kruga na expensu.
- Nikakav split/settlement kod.
- Nikakav invite flow.
- Nikakve lifecycle tranzicije.
- Nikakve notifikacije.

Zašto ovo, a ne "napravimo entry": jer entry bez ovih odluka **kodira privremenu semantiku u UI**, a to je najskuplja vrsta duga u ovom modulu — svaki kasniji semantički shift zahtijeva data migraciju plus retraining korisnika koji su već vidjeli "kako to radi".

---

## 4. Najveći rizici ako se krene krivim redom (tj. po originalnom planu)

**Domain semantika:**
- Ako WS1 (entry) ide prije WS2/WS3, uvodi se ručni "attach na Krug" bez definicije što attach znači za saldo, autorstvo, i vidljivost. Kasnije uvođenje split modela zahtijeva backfill ili amnestiju povijesnih transakcija.
- `krug_privacy` postaje "što god UI toga trenutka misli da znači", jer semantika `private` nije fiksirana u odnosu na (nepostojeći) split.

**Data shape / persistence:**
- Dvije istine (`expenses.krug_id` i shared source atačment) bez arbitraže znače da će queries za "što je u Krugu X" davati različite rezultate ovisno o hooku. To se već sluti u auditu.
- Ako se split doda naknadno, potrebna je tablica ledgera (analogno `project_worker_payouts`). Ako se prije toga korisnici naviknu na "Krug bez ledgera", uvođenje ledger UI-a je breaking UX change.
- Currency: ako se multi-member Krug pusti bez currency pravila, mixed-currency Krugovi u produkciji postaju permanentni tehnički dug.

**UX kontradikcije:**
- Approval queue bez notifikacija = korisnici vide "ništa se ne događa" i modul umire.
- Lifecycle badge koji nikad ne mijenja stanje = korisnici gube povjerenje u statusni sustav.
- Invite neregistriranih prije nego što je jasno u što pozivaš = pozvani član dolazi u prazan/nedefiniran prostor, negativan first-run.

**Approval / shared source / lifecycle sudari:**
- Shared source auto-generira `predlozena` transakcije. Ako WS1 uvede i ručni attach, imaš dva izvora `predlozena` s različitom autorship-semantikom. A3 (autor retract) tada nije jednoznačno definiran.
- Lifecycle `read_only` prijelaz mora znati što s pending approvalima. Bez WS0 odluke, ovo je nedefinirano.
- Delete flow (zreo) pretpostavlja da su `predlozena` samo "in-flight" — ali ako lifecycle uvede `read_only`, `predlozena` u `read_only` Krugu je legal state bez ijedne moguće akcije. Sudar.

---

## 5. Preporuka za WS4 (odnosno: za pravi prvi execution WS)

Kratka verzija — nazvao bih ga **WS-A: Krug Semantics Lock v1**, ne WS4. Numeracija originalnog plana pretpostavlja da je entry pravi prvi execution — ta pretpostavka je pogrešna.

```text
WS-A: Krug Semantics Lock v1

Cilj
  Zaključati domain semantiku Kruga v1 tako da svaki
  kasniji execution WS ima jednoznačan ugovor. Bez UI-a.
  Bez migracija. Deliverable je dokument + minimalan
  vidljivi disclosure na dva mjesta u postojećem UI-u.

Ulazi
  1. Pisana odluka o namjeni: trag vs. settlement vs. hibrid.
     Jedna odluka, jedan dokument.
  2. Definicija autorstva troška u Krug kontekstu
     (preporuka: expenses.user_id, bez iznimki).
  3. Arbitraža izmedju expenses.krug_id i
     krug_shared_payment_source kad divergiraju
     (preporuka: krug_id je istina).
  4. Semantika krug_privacy u odnosu na (ne)postojeci split.
  5. Currency pravilo za multi-member Krug.
  6. Lifecycle ugovor: koji dogadjaj vodi u koje stanje.
     Bez implementacije prijelaza — samo tablica ugovora.
  7. Business/personal mode ugovor: Krug je personal-only
     (ili nije — bitno da je pisano).
  8. Minimalni UI disclosure "Krug v1 ne saldira"
     (ili suprotno) na dva mjesta: CreateKrugDialog zavrsni
     korak + KrugDetailScreen empty state. Jedan i18n
     kljuc, HR/EN/DE.

Svjesno NE ulazi
  - Entry surface za rucni odabir Kruga na expensu.
  - Bilo kakav split/settlement kod ili tablica.
  - Invite flow za neregistrirane.
  - Notifikacije (push ili in-app).
  - Lifecycle tranzicijski engine.
  - Bilo kakva izmjena postojecih RPC-a ili RLS-a.
  - Redizajn shared source UI-a.

Definition of done
  - docs/KRUG_SEMANTICS.md postoji i sadrzi svih 7 odluka.
  - Svaka odluka je referencirana iz komentara u
    krugDecisions.ts i krugDeletionDecisions.ts.
  - Dva UI disclosure mjesta koriste jedan novi i18n kljuc,
    preveden na HR/EN/DE, pokriveno untranslated guardom.
  - tsgo + vitest zeleni; nema novih runtime putanja pa
    nema novih integracijskih testova.
  - Vlasnik je potvrdio odluke pisanim odobrenjem
    (isti mehanizam kao za dosadasnje "ODLUKA VLASNIKA").

Glavni rizici
  - Vlasnik ne zeli donijeti settlement odluku sada:
    mitigacija = eksplicitno "v1 = bez settlementa",
    ali pisano, tako da UI to komunicira i ne stvara
    laznu ekspektaciju.
  - Odluke se kasnije mijenjaju: mitigacija = verzionirati
    dokument (v1, v2), a ne prepisivati.
  - Doziva se raspravu umjesto isporuke: mitigacija =
    fiksni rok (npr. jedan dan) za odluke; ako nema
    odluke, modul ostaje zamrznut umjesto da se gradi
    dalje na krivim pretpostavkama.
```

**Presuda o originalnom planu:** loš je u redoslijedu, ne u sadržaju. Svih 11 stavki eventualno mora biti napravljeno, ali WS1 kao prvi execution je greška. Pravi prvi korak je semantičko zatvaranje. Sve drugo je gradnja na pijesku — i audit je to već implicitno pokazao time što je pet od šest lifecycle stanja mrtvo, a entry surface je rupa: to su simptomi nedostatka semantičkog ugovora, ne simptomi nedostatka UI-a.
