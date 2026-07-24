
# Mišljenje: category_source i pouzdanost AI kategorizacije

Ne implementiramo ništa dok ne potvrdiš smjer. Ovo je odgovor na pet pitanja + jedan nalaz iz koda koji mijenja opseg Ture 1.

## Kontekst iz koda (verificirano)

Izvori kategorije koji stvarno postoje danas:
1. **AI** — `supabase/functions/categorize-transaction` (Gemini), okida se iz `useAICategorization` u dijalogu unosa.
2. **Habit (localStorage)** — `useCategoryHabits`: merchant→kategorija, koristi se u `AddExpenseDialog`. Ovo je *već sada* zaseban izvor koji audit nije spomenuo.
3. **User** — ručni odabir u dropdownu.
4. **Import** — `csvParsers` / `importReview/executor` postavljaju kategoriju kod bankovnih uvoza.
5. **Rule** — `import_transfer_rules` reklasificira (danas samo type=`transfer`, ne kategoriju, ali arhitektura je ondje).
6. **Receipt AI** — `parse-receipt` također vraća kategoriju kroz `ai_extracted=true`.

Znači stvarna enum vrijednost trebala bi biti: `ai_suggested | ai_receipt | habit | user | import | rule`. Prijedlog `'ai'` skuplja dva vrlo različita AI puta u jedan bucket i gubi `habit` sasvim.

## Odgovori na pitanja

**1. Ime kolone.** `category_source` je OK, ali predlažem **`category_origin`** — konzistentnije s postojećim `expense_nature` / `submitted_by` i ne miješa se s `payment_source`. Bez jake preferencije, prihvaćam oba.

**2. Vizualni indikator (mobilni UI).**
- Badge = previše vizualnog šuma na listi (već imamo krug badge, shared status, recurring, is_advance).
- Boja/outline na cijelom retku = konflikt s postojećim state bojama (pending/rejected).
- **Preporuka:** mala ikonica ✨ (Sparkles, 12px) pored emojija kategorije, samo kad je `origin ∈ {ai_suggested, ai_receipt}` **i** korisnik još nije potvrdio. Nestaje čim korisnik otvori i spremi transakciju. Isti pattern kao Gmail "Smart Reply".
- Konzistentno s `StatusFeedback` filozofijom (nenametljivo, kratko).

**3. Confidence score korisniku?** **Ne.** Interno da, korisniku ne. Razlozi:
- Gemini u ovoj setup-i vraća samo `content` (jedan token), nema logprobs. Da bismo dobili confidence, trebamo drugi prompt ili drugi model → trošak.
- UX praksa: prikaz "78%" korisniku ne mijenja ponašanje, samo generira nepovjerenje.
- Iznimka: prag ispod kojeg AI *ne predloži ništa* (npr. <0.6) — to je interno pravilo, ne UI.

**4. Što je audit propustio.**
- **`useCategoryHabits`** (localStorage) je samostalan izvor prijedloga koji već postoji i nadjačava AI u `AddExpenseDialog`. Bez `habit` u enumu, retroaktivni backfill će te transakcije pogrešno označiti kao `user`.
- **`parse-receipt`** također postavlja `ai_extracted=true` — treba ga razlikovati od `categorize-transaction` jer je feedback petlja drugačija (kod računa ispravci znače promptu za receipt parser, ne za categorizer).
- **Backfill je nepouzdan:** `ai_extracted=true` znači "AI je *ekstraktirao transakciju s računa*", ne "AI je predložio kategoriju". Postojeće transakcije s `ai_extracted=true` mahom imaju kategoriju koju je *korisnik potvrdio* prije spremanja. Backfill `ai_extracted=true → origin='ai'` bi retroaktivno prikazao ✨ indikator na svemu što je ikad prošlo kroz scan. **Preporuka: backfill svih postojećih redaka u `origin='user'`** (safe default), origin se puni samo za nove zapise. Ovo je važno — inače dobiješ vizualni regres na cijeloj povijesti korisnika.

**5. Launch blocker?** **Ne.** Argumenti:
- Trenutno ponašanje (AI tiho predlaže, korisnik ne zna) radi 6+ mjeseci bez pritužbi u feedbacku.
- Dodavanje kolone + backfill + UI indikator + write-path izmjene u 6+ mjesta (AddExpense, RecategorizeDialog, BulkEdit, importReview/executor, parse-receipt, categorize-transaction, useCategoryHabits, useExpenseCRUD) = realno 1–2 dana rada + regresija.
- 5 tjedana do 28.8. već ima Paddle live, RLS refit, entitlements. Dodavati novi write-path invariant sada = rizik.
- **Prava vrijednost je Tura 2 (feedback petlja).** Tura 1 bez Ture 2 je samo kozmetika. Ako ne stignemo obje, radije preskoči obje do post-launch.

## Preporuka ukupno

**Post-launch, jedan sprint, obje ture zajedno.** Kad ideš:
- Kolona `category_origin` s enumom od 6 vrijednosti (uključi `habit` i razdvoji `ai_suggested`/`ai_receipt`).
- Backfill svega u `'user'` (ne iz `ai_extracted`).
- Write-path: svako mjesto koje postavlja `category` mora postaviti i `origin`; svaki `UPDATE category` od strane korisnika resetira `origin='user'`.
- UI: Sparkles ikona (12px) samo dok origin ostaje AI.
- Interno confidence + telemetrija (AI predložio X, korisnik promijenio u Y) za buduće učenje.

Ako **ipak** želiš prije launcha — samo minimum: kolona + backfill='user' + write-path na 2 mjesta (categorize + user edit), bez UI. UI dolazi post-launch. Ovo je 3–4h rada i nula UI regresije.

## Trebam od tebe

1. `category_source` ili `category_origin`?
2. Enum: 3 vrijednosti (`ai|user|import`) ili 6 (`ai_suggested|ai_receipt|habit|user|import|rule`)?
3. Backfill: `'user'` (safe) ili pokušaj rekonstrukcije iz `ai_extracted` (rizično)?
4. Timing: post-launch pun paket, ili pre-launch minimum bez UI-a?
