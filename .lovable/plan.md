# Krug Transaction RLS / Visibility Plan v1.1

## Status

Nije implementacijski plan.

Ovaj dokument prevodi semantiku iz `Krug Transaction Semantics Schema Plan v1.3` u visibility model za transakcije unutar Kruga.

Ne uvodi SQL policy sintaksu, RPC potpise, RLS klauzule, UI tokove, API granice ni rollout korake. Ne uvodi nove presete, ne vraća `Family`, ne uvodi `majority` i ne otvara novi product scope.

## 1. Visibility načela

### 1.1 Ownership ≠ vidljivost ≠ pravo djelovanja

Tri pojma su strogo odvojena:

- Ownership transakcije: tko je autor i čiji saldo/wallet redak dira. Izvodi se iz `user_id` retka.
- Vidljivost transakcije: tko smije pročitati taj redak u kontekstu Kruga.
- Pravo djelovanja nad retkom: tko ga smije predložiti kao zajedničkog, potvrditi, odbiti, mijenjati `krug_privacy`, povezati s splitom itd.

Ovaj dokument govori samo o ownershipu i vidljivosti. Pravo djelovanja nad retkom (governance, approval, billing, takeover, mutation paths) ostaje u već zaključanim dokumentima `Krug Governance / Mutation Path Plan v1.1`, `Krug Access Matrix v1.3` i budućim `Mutation Path` / `Approval Enforcement` planovima.

Autor uvijek vidi vlastitu transakciju, neovisno o `krug_privacy`, neovisno o presetu i neovisno o lifecycle stanju Kruga (osim hard-delete koji se rješava zasebno u §6).

### 1.2 Što odlučuje vidljivost

Vidljivost prema drugim članovima Kruga izvodi se iz tri ulazna izvora:

1. Sam redak: `krug_id`, `krug_privacy`, `krug_shared_status`.
2. Preset Kruga: `Supružnik / partner`, `Su-roditelj`, `Cimer`.
3. Tip članstva čitatelja u Krugu: owner, punopravni član, ordinary member, non-member.

Pravilo o smjeru utjecaja:

- `private` na razini retka uvijek sužava vidljivost prema svim drugim članovima Kruga, bez obzira na preset i bez obzira na tip članstva.
- `shared` na razini retka uvijek otvara vidljivost svim članovima Kruga (vidi §2.3 i §5).
- Preset definira default vidljivost `personal` transakcija među punopravnim članovima. Preset ne smije snižavati vidljivost ordinary memberu ispod onoga što je za njega već zaključano (§5.3).

### 1.3 Što dolazi iz preseta, a što iz retka

- Preset definira default razinu dijeljenja `personal` transakcija među punopravnim članovima Kruga.
- Redak preko `krug_privacy = private` može eksplicitno zaključati nevidljivost prema svim drugim članovima, neovisno o presetu i neovisno o tipu članstva.
- Redak preko `krug_privacy = shared` ulazi u zaseban shared approval tok i ima vlastiti visibility minimum opisan u §2.3.

### 1.4 Što se nikad ne smije prepustiti samo UI-u

Sljedeće tvrdnje moraju biti enforce-ane na razini podataka (RLS / service), nikada samo u UI-u:

- `private` transakcija ne smije biti čitljiva ni jednom drugom članu Kruga osim autora, neovisno o tipu članstva.
- Non-member ne smije vidjeti niti jednu transakciju s `krug_id IS NOT NULL`, neovisno o `krug_privacy` ili `krug_shared_status`.
- Ordinary member ne smije izgubiti vidljivost koja mu je zaključana (§5.3) kroz konfiguraciju preseta ili UI fallbacke.
- Nakon hard-delete Kruga, ni jedan čitatelj osim autora ne smije više vidjeti tu transakciju kroz Krug kontekst, jer Krug kontekst više ne postoji.

## 2. Visibility po `krug_privacy`

### 2.1 `personal`

`personal` znači: osobna transakcija autora; ne ulazi u shared approval tok ni u split.

Vidljivost:

- Autor: uvijek vidi.
- Owner Kruga: vidi tuđe `personal` ako preset to dopušta među punopravnim članovima; ne automatski.
- Punopravni član Kruga: vidi tuđe `personal` ako preset to dopušta među punopravnim članovima; ne automatski.
- Ordinary member Kruga: vidi sva tuđa `personal` u Krugu jer ordinary member po zaključanom pravilu vidi sve transakcije Kruga (§5.3). Ovo se ne sužava presetom.
- Non-member: nikad ne vidi.

Zabranjeno:

- Tretirati `personal` kao implicitno `shared`. `personal` ne ulazi u split ni u shared approval listu.
- Tretirati `personal` kao implicitno `private`. `personal` ne zaključava vidljivost; vidljivost prema drugim punopravnim članovima određuje preset, a prema ordinary memberu vrijedi pravilo iz §5.3.

### 2.2 `private`

`private` znači: osobna transakcija autora u Krug kontekstu koju drugi članovi Kruga ne vide, neovisno o presetu i neovisno o tipu članstva.

Vidljivost:

- Autor: uvijek vidi.
- Owner Kruga: ne vidi.
- Punopravni član Kruga: ne vidi.
- Ordinary member Kruga: ne vidi. Ovo je jedina iznimka od pravila „ordinary member vidi sve transakcije Kruga” i postavljena je svjesno, jer je sama svrha `private` zaključavanje nevidljivosti prema svima drugima.
- Non-member: nikad ne vidi.

Zabranjeno:

- Bilo kakvo proširenje vidljivosti `private` retka kroz preset.
- Otkrivanje postojanja `private` retka drugim članovima kroz agregate, brojače ili sume na razini Kruga koji bi indirektno otkrili njegovu vrijednost ili autora.

### 2.3 `shared`

`shared` znači: transakcija u Krug kontekstu koja je ušla u shared approval tok.

Vidljivost:

- Autor: uvijek vidi.
- Owner Kruga: vidi.
- Punopravni član Kruga: vidi, jer sudjeluje u shared approval kontekstu.
- Ordinary member Kruga: vidi, jer ordinary member po zaključanom pravilu vidi sve transakcije Kruga (§5.3). Ordinary member nema pravo predlagati, potvrđivati niti odbijati shared transakcije — to je domena governance pravila iz `Krug Governance / Mutation Path Plan v1.1`.
- Non-member: nikad ne vidi.

Zabranjeno:

- Skrivanje `shared` retka pred bilo kojim članom Kruga (uključujući ordinary membera).
- Otkrivanje `shared` retka non-memberu pod bilo kojim uvjetom.

## 3. Utjecaj `krug_shared_status`

`krug_shared_status` ne mijenja tko smije čitati `shared` transakciju. Mijenja samo značenje tog retka u shared approval kontekstu.

Pravilo: vidljivost `shared` retka određuje `krug_privacy = shared` u kombinaciji s tipom članstva (§2.3, §5). Approval status samo dodaje semantičku oznaku koju čitatelji koji već imaju pravo vidjeti redak moraju vidjeti zajedno s retkom.

### 3.1 `predložena`

- Ne mijenja krug čitatelja.
- Svi koji prema §2.3 vide `shared` redak (autor, owner, punopravni član, ordinary member) moraju vidjeti i to da je status `predložena`.
- Tko smije reagirati na `predložena` (potvrditi, odbiti) regulira governance, ne visibility.

### 3.2 `potvrđena`

- Ne mijenja krug čitatelja.
- Svi koji prema §2.3 vide `shared` redak moraju vidjeti i to da je status `potvrđena`.

### 3.3 `nepotvrđena`

- Ne mijenja krug čitatelja.
- Svi koji prema §2.3 vide `shared` redak moraju vidjeti i to da je status `nepotvrđena`.
- Posebno: `nepotvrđena` se ne smije skrivati pred ostalim članovima Kruga kako bi se „očistila lista”. Approval ishod ostaje vidljiv jer je on dokaz da je tok proveden.

## 4. Visibility po presetima

Presetovi se odnose isključivo na default vidljivost `personal` transakcija među punopravnim članovima Kruga. `private` uvijek presijeca preset (vidi §2.2), `shared` uvijek dobiva minimum iz §2.3, a ordinary member uvijek dobiva vidljivost iz §5.3 bez obzira na preset.

### 4.1 `Supružnik / partner`

Default za osobne transakcije: visok stupanj dijeljenja među dvoje punopravnih članova.

- `personal`: oba punopravna člana se međusobno vide jedan drugome.
- `private`: ne vidi drugi član.
- `shared`: oba člana vide redak i njegov approval status.

Ako se ordinary member nađe u Krugu s ovim presetom, vidljivost ordinary membera ide po §5.3, ne po presetu.

### 4.2 `Su-roditelj`

Default za osobne transakcije: `personal` ne otvara automatski uvid drugom su-roditelju.

- `personal`: drugi punopravni član (drugi su-roditelj) ne vidi automatski, jer preset polazi od pretpostavke odvojenih osobnih financija.
- `private`: drugi su-roditelj ne vidi.
- `shared`: oba su-roditelja vide redak i approval status, jer je tu riječ o zajedničkom kontekstu.

Razlika `personal` ↔ `private` u ovom presetu je u tome tko o vidljivosti odlučuje: kod `personal` o tome odlučuje preset (koji ovdje ne otvara automatsku vidljivost među punopravnim članovima), kod `private` redak eksplicitno zaključava nevidljivost prema svima drugima, neovisno o budućim promjenama preseta.

### 4.3 `Cimer`

Default za osobne transakcije: vrlo nizak stupanj dijeljenja, kao i kod `Su-roditelj`, ali u kontekstu zajedničkog stanovanja.

- `personal`: drugi punopravni član (cimer) ne vidi automatski.
- `private`: drugi cimer ne vidi.
- `shared`: oba cimera vide redak i approval status.

Kao i u §4.2: `personal` ne zaključava nevidljivost prema svima drugima; samo se oslanja na preset koji u ovom slučaju ne otvara vidljivost među punopravnim članovima. `private` zaključava nevidljivost eksplicitno prema svima.

### 4.4 Zašto je `personal` default za `Su-roditelj` i `Cimer`

- Oba preseta polaze od pretpostavke odvojenih osobnih financija dvoje punopravnih članova.
- `personal` je default jer čuva odvojenost prema drugom punopravnom članu po defaultu, bez prisiljavanja korisnika da svaku osobnu transakciju eksplicitno označi kao `private`.
- `private` ostaje dostupan korisniku za one transakcije koje želi zaključati protiv bilo kakve buduće promjene preseta ili buduće promjene pravila Kruga, i koje želi sakriti i od ordinary membera.

### 4.5 Vidljivost ordinary membera kroz preset

Preset ne određuje vidljivost ordinary membera. Vidljivost ordinary membera je zaključana u §5.3 i glasi:

- ordinary member vidi sve transakcije Kruga koje još postoje u Krug kontekstu,
- s jedinom iznimkom `private` retka koji je vidljiv samo autoru (§2.2).

Preset ne smije:

- snižavati vidljivost ordinary memberu ispod tog pravila,
- niti otvarati ordinary memberu išta dodatno na razini governance (predlaganje, potvrda, veto, billing, takeover).

## 5. Visibility po vrstama članova

Sažeti pregled po čitatelju, prema kombinacijama stanja:

### 5.1 Owner

- Vlastite transakcije: uvijek vidi.
- Tuđe `personal`: vidi prema presetu (među punopravnim članovima).
- Tuđe `private`: ne vidi.
- Tuđe `shared` (bilo koji approval status): vidi.

### 5.2 Punopravni član (nije owner)

- Vlastite transakcije: uvijek vidi.
- Tuđe `personal`: vidi prema presetu (među punopravnim članovima).
- Tuđe `private`: ne vidi.
- Tuđe `shared` (bilo koji approval status): vidi.

### 5.3 Ordinary member

Zaključano pravilo: ordinary member vidi sve transakcije Kruga koje još postoje u Krug kontekstu. To je samo visibility pravo, ne i pravo djelovanja.

- Vlastite transakcije: uvijek vidi.
- Tuđe `personal`: vidi sve, neovisno o presetu.
- Tuđe `private`: ne vidi. Ovo je jedina iznimka i postoji zato što je svrha `private` zaključavanje vidljivosti prema svima drugima.
- Tuđe `shared` (bilo koji approval status): vidi sve, neovisno o presetu.

Posebno zaključano za ordinary membera (visibility ≠ djelovanje):

- nema governance prava,
- nema prijedloga shared transakcija,
- nema potvrde/odbijanja shared transakcija,
- nema veta,
- nema billing/takeover prava.

Sva ta prava ostaju regulirana izvan ovog dokumenta i ne mogu se izvesti iz činjenice da ordinary member vidi redak.

### 5.4 Non-member

- Sve transakcije s `krug_id IS NOT NULL`: ne vidi, neovisno o `krug_privacy` ili `krug_shared_status`.
- Transakcije s `krug_id IS NULL` koje pripadaju non-memberu kao autoru rješavaju se izvan Krug visibility modela.

## 6. Lifecycle utjecaj

Krug prolazi kroz lifecycle stanja definirana u `Continuity & Billing State Machine v1.3.2` i `Takeover Conditions Spec v1.1`. Visibility model reagira na ta stanja na sljedeći način:

### 6.1 `active`

Visibility radi po §2–§5 bez izmjena.

### 6.2 `early_signal`

Visibility radi po §2–§5 bez izmjena. `early_signal` je samo signal stanja na razini Kruga, ne mijenja tko vidi koju transakciju.

### 6.3 `ugrožen`

Visibility radi po §2–§5 bez izmjena. Isto kao `early_signal`, ovo je stanje konteksta, ne visibility pravilo.

### 6.4 `continuity_window`

Visibility radi po §2–§5 bez izmjena. U ovom prozoru Krug i dalje postoji i transakcije se i dalje gledaju kroz Krug kontekst.

### 6.5 `read_only`

Visibility radi po §2–§5 bez izmjena. `read_only` se odnosi na mutacije, ne na čitanje. Tko je do sada smio vidjeti redak, i dalje ga vidi.

### 6.6 Prije `deleted`

Sve do trenutka hard-delete-a Kruga, čitatelji navedeni u §2–§5 i dalje vide transakcije po istim pravilima. Lifecycle stanja sama po sebi ne uklanjaju vidljivost.

### 6.7 `deleted`

Primjenjuje se post-delete pravilo iz `Post-Delete Behavior Foundation Patch v1.1` koje je već zaključano u `Krug Transaction Semantics Schema Plan v1.3 §7`:

```text
krug_id              → NULL
krug_privacy         shared → personal
krug_shared_status   → NULL
```

Posljedice za visibility:

- Transakcija više nije u Krug kontekstu.
- Krug-based vidljivost (preset, punopravni član, ordinary member) prestaje vrijediti za tu transakciju, jer Krug konteksta više nema.
- Autor i dalje vidi transakciju, sada kao osobnu transakciju izvan Kruga.
- Drugi bivši članovi Kruga (uključujući bivše ordinary membere) je više ne vide kroz Krug kontekst.
- `shared` approval status se briše zajedno s ostatkom Krug konteksta. Nema „shared transakcije bez Kruga”.

## 7. Što je enforcement, a što samo semantika

Ovaj dokument tvrdi sljedeće kao visibility pravila koja MORAJU biti enforce-ana na razini podataka (RLS i/ili service layer), neovisno o UI-u:

- §1.4 (autor uvijek vidi vlastito; non-member nikad ne vidi Krug transakcije; `private` ne curi prema drugim članovima — uključujući ordinary membera; ordinary member ne smije biti spušten ispod §5.3).
- §2.1, §2.2, §2.3 (visibility po `krug_privacy`, uključujući da ordinary member vidi `personal` i `shared` bez obzira na preset).
- §3 (`krug_shared_status` ne mijenja krug čitatelja; status mora biti vidljiv onima koji već vide redak).
- §4 (preset odlučuje default vidljivost `personal` među punopravnim članovima; `private` uvijek presijeca preset; `shared` uvijek dobiva minimum iz §2.3; preset ne dira ordinary membera).
- §5 (matrica po tipovima članstva; ordinary member ima zaključano široko visibility pravo, ali nikakvo pravo djelovanja).
- §6.7 (post-delete potpuno gasi Krug-based vidljivost).

Ovaj dokument NE definira:

- SQL policy sintaksu za bilo koju od ovih tvrdnji.
- RPC potpise za approval ili visibility provjere.
- API granice servisa koji posreduju u čitanju.
- Indekse, agregate, materijalizirane prikaze.
- UI tokove i komponente.
- Rollout, migracije postojećih podataka i feature flagove.
- Prava djelovanja nad retkom (governance, approval, billing, takeover) — to ostaje u već zaključanim governance dokumentima i budućim `Mutation Path` / `Approval Enforcement` planovima.

## 8. Najopasnija mjesta

### 8.1 Zamjena vidljivosti i prava djelovanja

Najopasnija konceptualna zamjena u v1.1.

- Činjenica da ordinary member vidi redak ne znači da ga smije predložiti kao shared, potvrditi, odbiti ili mijenjati `krug_privacy`.
- UI koji bi iz „vidim redak” izveo „smijem djelovati nad retkom” otvara governance pukotinu.
- Enforcement djelovanja mora ići kroz governance pravila, ne kroz visibility.

### 8.2 Zamjena `personal` i `private`

- `personal` ne znači „skriveno”. `personal` znači: vidljivost prema drugim punopravnim članovima određuje preset, a prema ordinary memberu vrijedi §5.3.
- `private` znači „skriveno prema svima drugima, neovisno o presetu i neovisno o tipu članstva, uključujući ordinary membera”.
- Tretiranje `personal` kao implicitno `private` (npr. u UI-u koji „za svaki slučaj” sakrije `personal` od ordinary membera) curi suprotno od onoga što je zaključano (§5.3).
- Tretiranje `private` kao samo „jača verzija `personal`” curi prema agregatima na razini Kruga koji bi otkrili sumu ili autora `private` retka.

### 8.3 Ordinary member dobiva premalo ili previše

- Premalo: ordinary member ne smije izgubiti vidljivost `personal` i `shared` transakcija u Krugu zbog konfiguracije preseta ili UI fallbacka. To bi prekršilo §5.3.
- Previše: ordinary member ne smije dobiti pravo djelovanja (predlaganje shared, potvrda, odbijanje, veto, billing, takeover) zato što vidi redak. To bi prekršilo governance pravila.
- Posebno: ordinary member NE smije vidjeti `private` redak punopravnog člana. To je jedina iznimka od §5.3 i mora biti enforce-ana na razini podataka, ne samo UI-a.

### 8.4 Preset curi u pogrešan visibility model

- `Supružnik / partner` ima visok default dijeljenja `personal` transakcija među punopravnim članovima. Taj default ne smije „pobjeći” na `Su-roditelj` ili `Cimer` kroz dijeljeni kod.
- `Su-roditelj` i `Cimer` imaju nizak default dijeljenja `personal` među punopravnim članovima. Taj default ne smije „pobjeći” u stranu otvorenosti zbog generičkog fallbacka „ako preset nije prepoznat, otvori sve”.
- Default za nepoznat ili nedostajući preset MORA biti restriktivan na razini punopravnih članova, dok ordinary member ostaje na §5.3 i autor uvijek vidi svoje.

### 8.5 Fantomski shared trag nakon `deleted`

- Nakon hard-delete Kruga, post-delete pravilo (§6.7) postavlja `krug_id = NULL`, `krug_privacy: shared → personal`, `krug_shared_status = NULL`.
- Opasno je ostaviti bilo koji popratni objekt (npr. approval zapis, shared agregat, settlement trag) koji bi nastavio implicirati da je transakcija nekad bila shared u nepostojećem Krugu i kroz njega curila bivšim članovima — uključujući bivše ordinary membere.
- Vidljivost prema svim bivšim članovima nakon hard-delete-a mora biti nula. Autor zadržava transakciju kao osobnu, bez Krug konteksta.

## 9. Zaključak

### 9.1 Je li visibility model za transakcije dovoljno jasan

Da, na razini čitanja transakcija.

Ovaj dokument:

- Zaključava razliku ownership ↔ vidljivost ↔ pravo djelovanja.
- Definira što `personal`, `private`, `shared` znače u kontekstu čitanja.
- Razdvaja ulogu preseta (default vidljivost `personal` među punopravnim članovima) od uloge retka (`private` zaključava, `shared` otvara).
- Razdvaja `krug_shared_status` kao semantičku oznaku koja ne mijenja krug čitatelja.
- Definira vidljivost po tipovima članstva, pri čemu ordinary member ima zaključano široko visibility pravo bez ikakvih prava djelovanja.
- Definira ponašanje kroz lifecycle, uključujući potpuno gašenje Krug-based vidljivosti nakon hard-delete-a.
- Eksplicitno označava najopasnije zamke, uključujući zamjenu vidljivosti i prava djelovanja.

Što ovaj dokument NIJE riješio (svjesno i izvan scope-a):

- Mutacijska pravila („tko smije promijeniti `krug_privacy`” i tko smije inicirati approval tok) na razini governance/approval toka.
- Enforcement approval prijelaza `predložena → potvrđena / nepotvrđena`.
- Konkretne SQL/RLS policy klauzule.
- API i service granice koje će ova pravila operacionalizirati.

### 9.2 Najbolji sljedeći dokument

Preporučeni sljedeći dokument: **`Krug Transaction Mutation Path Plan v1`**.

Razlog: prije nego što opišemo approval enforcement ili service boundary, treba zaključati tko smije inicirati i izvršiti svaku semantičku tranziciju iz `Krug Transaction Semantics Schema Plan v1.3 §5` (npr. `personal → shared / predložena`, `shared / predložena → shared / potvrđena`), oslanjajući se na visibility model iz ovog dokumenta i na governance pravila iz `Krug Governance / Mutation Path Plan v1.1` — i istovremeno potvrditi da ordinary member ostaje na nuli prava djelovanja, iako vidi sve.

Nakon mutation path plana logično slijedi:

1. `Krug Approval Enforcement Plan v1` — kako se `predložena → potvrđena / nepotvrđena` dokazuje na razini podataka.
2. `Krug API / Service Boundary Plan v1` — kako se sve gore navedeno izlaže kroz servisni sloj prije nego se zaključa u SQL/RLS sintaksi.

### 9.3 Sažetak zaključanih ispravaka u v1.1

U odnosu na v1, v1.1 zaključava:

- Ordinary member vidi sve transakcije Kruga koje još postoje u Krug kontekstu (jedina iznimka: `private` retke vidi samo autor).
- Ordinary member nema nikakva governance, approval, billing ni takeover prava — to je strogo odvojeno od visibilityja.
- Preset ne određuje vidljivost ordinary membera; preset određuje samo default vidljivost `personal` među punopravnim članovima.
- §2.1, §2.3, §4.5 i §5.3 usklađeni su s ovim pravilom.
- §1.1 i §1.4 sada eksplicitno razdvajaju vidljivost i pravo djelovanja, a §8.1 ovaj rizik označava kao najopasniju zamjenu.
