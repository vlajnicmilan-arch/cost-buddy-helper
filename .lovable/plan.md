# Krug — „Tko kome" za običnog člana, samo svoje (PLAN, bez izmjena)

## Ključni nalaz (odluka prije gradnje)

Obični član danas **uopće ne sudjeluje u podjeli**, pa nema ni dugova ni potraživanja:
- `krug_settlement_preview` gradi popis sudionika samo od vlasnika i `punopravni` članova. Trošak koji plati obični član ne ulazi u „plaćeno" (`IF r.payer = ANY(v_members)`), a na obične članove se ništa ne dijeli.
- `krug_override_propose` traži da udjeli pokriju točno sve punopravne članove (`shares_must_cover_all_full_members`), pa obični član ne može dobiti udio. U bazi nema nijednog udjela za običnog člana (0).
- `krug_mark_settled_with_source` traži da su obje strane punopravni članovi (`party_not_full_member`).

Samo otvaranje pogleda bi zato običnom članu uvijek pokazalo prazno. Potrebna je vlasnikova odluka:

- **Opcija 1: samo vidljivost.** Radi se samo pravo gledanja, a obični član i dalje ne sudjeluje u podjeli. Ekran mu tada uvijek piše „Nemaš otvorenih odnosa". Posla je malo, ali korisnik od toga nema stvarne koristi.
- **Opcija 2: obični član sudjeluje u podjeli.** Troškovi, udjeli i postotci počinju uključivati i njega. To mijenja „Tko kome" svim postojećim Krugovima s običnim članovima, pa zahtijeva zasebni plan za podjelu (težine, override, prihodovni omjer).
- **Opcija 3 (preporuka): sudjeluje samo kad ga se izričito uključi.** Obični član ulazi u podjelu samo preko prijedloga „Dijeli samo X" / override-a u kojem ima udio. Zadana podjela ostaje među punopravnima. Tada ima stvarne dugove, a postojeći Krugovi se ne mijenjaju.

Plan ispod vrijedi za sve tri opcije, jer je vidljivost ista. Kod opcije 3 dolazi još jedan nalog.

## 1. Tko je „obični član"

- `krug_membership.role = 'obicni'`, a vlasnik je u `krug_ownership`. Tablica nema stupac statusa: bivši član je izbrisan redak.
  - Pravilo „još je član" = postoji redak u `krug_membership` i Krug nije obrisan (`deleted_at IS NULL`), isto kao `krug_is_member`.
- Stanje u bazi: 2 obična člana u 2 Kruga, od kojih je samo 1 Krug aktivan. Za usporedbu: 30 punopravnih u 18 Krugova, a aktivna su 2 Kruga.
- Ledger ima 6 redaka i nijedan ne uključuje običnog člana.

## 2. Ledger (RLS i živi podaci)

- Postojeća politika `ledger_select_full_member` ostaje.
- Nova SELECT politika `ledger_select_own_party` s uvjetom: `krug_is_member(krug_id, auth.uid()) AND auth.uid() IN (from_user, to_user)`.
  - Bivši član nema redak u `krug_membership`, pa ne vidi ništa.
  - Nakon brisanja Kruga, `krug_is_member` za nevlasnika vraća false, pa ni tada ne vidi ništa.
- Živi podaci: `LiveDataProvider` sluša `krug_settlement_ledger`. Realtime poštuje RLS, pa obični član dobiva događaje samo za retke koje smije vidjeti.
  - Događaj ionako služi samo kao oznaka „prljavo", a podaci dolaze novim dohvatom. Izmjena klijenta ne treba.
  - To se potvrđuje čuvarom (vidi točku 6).

## 3. `krug_settlement_preview` — samo moji parovi

Problem: današnji odgovor otkriva sve.
- `members[]` nosi plaćeno, dugovano i neto za svakog člana.
- `transfers[]` je pohlepno zbirno netiranje: tko plaća kome ovisi o saldima svih, pa bi i „moji" prijenosi otkrivali tuđe neto iznose.

Prijedlog:
- Za punopravne i vlasnika funkcija ostaje doslovno ista, a zapisuje se od žive definicije.
- Za običnog člana (član, ali ne punopravni) odgovor se reže na poslužitelju:
  - `members[]` samo s njegovim retkom i bez zbrojeva Kruga;
  - `transfers[]` iz **izravnih parova**: za svaki par (ja, X) neto = (što je X platio za mene) − (što sam ja platio za X). Svota se računa po trošku iz udjela, bez netiranja kroz treće;
  - `settled_transfers[]` samo retci gdje je on `from_user` ili `to_user`;
  - uklanjaju se zastavice koje otkrivaju tuđe stanje (`missing_income_data`) i zbirna polja. Tečaj iz `fx.rates_used` ostaje.
- Zašto izravni parovi: iznos para ovisi samo o troškovima u kojima sam ja sudionik, pa se iz njega ne mogu izvesti tuđi saldi ni zbroj Kruga.
  - Posljedica: zbroj mojih izravnih parova jednak je mom neto saldu, ali pojedini prijenos može se razlikovati od onoga što punopravni vidi u zbirnom netiranju. To se mora prihvatiti.
  - Alternativa bi bila vratiti samo moj neto, bez druge strane, ali tada se ne zna kome platiti.
- Kod opcije 1 izravni parovi su uvijek prazni.

## 4. Podmirenje

Što RPC-ovi danas provjeravaju:
- `krug_mark_settled_with_source`: da je pozivatelj punopravni član, da je pozivatelj dužnik (`only_debtor_can_settle`) i da su obje strane punopravni članovi. Obični član danas ne smije podmiriti.
- `krug_confirm_settlement_receipt`: samo da je pozivatelj primatelj (`only_recipient_can_confirm`), bez provjere članstva. Sada to nije rupa, jer redak nastaje samo između punopravnih članova.

Prijedlog (vrijedi uz opciju 3):
- `mark_settled`: umjesto „punopravni član" traži se „član Kruga", a dužnik i dalje mora biti sam pozivatelj. Druga strana mora biti član Kruga.
- `confirm_receipt`: dodaje se provjera `krug_is_member` za primatelja, jer bivši član ne smije potvrditi.
- Ostala pravila ostaju ista: idempotentnost, izvor, valuta, obavijest kroz outbox.

## 5. Ekran

- `KrugSettlementSection` danas vraća `null` za običnog člana (`if (!isFullMember) return null`).
- Obični član će vidjeti:
  - „Duguješ" i „Duguju tebi", po osobi;
  - gumb „Podmiri" samo na svom dugu;
  - povijest samo s podmirenjima u kojima je on strana, s potvrdom primitka kad je on primatelj;
  - tekst „Prikazuju se samo tvoji odnosi u Krugu".
- Skriva se:
  - popis svih članova sa saldima;
  - tuđi prijenosi;
  - zbrojevi Kruga;
  - zamrzavanje tečaja (snapshot);
  - izvoz podmirenja (`excelWorkbook`/`exportRegistry` ostaju samo za punopravne).
- Prijevodi na hr/en/de.

## 6. Nalozi, migracije i testovi

| Nalog | Sadržaj | Migracija |
|---|---|---|
| 1 | RLS politika na ledgeru + rezani preview za običnog člana + SQL čuvari | da (1) |
| 2 | Ekran „samo svoje" + povijest + vitest | ne |
| 3 (samo opcija 3) | Obični član u override udjelima + `mark_settled`/`confirm` za članove | da (1) |

SQL paket `krug_member_view` (čuvari):
- obični član vidi u ledgeru samo retke gdje je strana, a tuđe ne vidi (A↔B, gdje on nije ni A ni B);
- bivši član (izbrisan redak) i član obrisanog Kruga vide 0 redaka;
- preview za običnog člana ne sadrži tuđe `user_id` u `members[]`, tuđe parove u `transfers[]`/`settled_transfers[]` ni zbirna polja;
- iz dvaju različitih stanja Kruga s istim troškovima običnog člana dobiva se identičan odgovor (dokaz da se tuđe ne može izvesti);
- preview za punopravnog člana nakon migracije je bit-identičan kao prije (regresija);
- realtime: obični član ima SELECT samo na svoje retke. Provjera ide kroz `SET ROLE authenticated` + `request.jwt.claims`, jer realtime koristi RLS;
- (nalog 3) obični član podmiruje svoj dug; ne smije podmiriti tuđi; bivši član ne smije potvrditi primitak.

Zeleni moraju ostati: krug_settle, krug_shared_amount, krug_notify_outbox, worker_payout_* i balance.

vitest:
- ekran običnog člana ne prikazuje tuđe osobe ni zbrojeve;
- „Podmiri" postoji samo na vlastitom dugu;
- povijest je filtrirana;
- punopravni član vidi isto kao danas.

## Tehnički detalji

- `krug_settlement_preview` i RPC-ovi za podmirenje pišu se od `pg_get_functiondef`. Isti potpis, prava i REVOKE ostaju.
- Nova politika je dodatna (OR s postojećom). `krug_is_member` je SECURITY DEFINER, pa nema rekurzije.
- Saldo i motor salda se ne diraju. Podmirenje i dalje knjiži samo dužnik (`expense_nature='krug_settlement'`).

## Otvoreno pitanje za vlasnika

Opcija 1, 2 ili 3? Bez te odluke nalog 1 daje ekran koji je za obične članove uvijek prazan.
