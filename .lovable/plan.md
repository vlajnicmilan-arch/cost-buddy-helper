
## Što mijenjamo

Dvije neovisne stvari u istom potezu:

### 1. UX dropdowna obavijesti (`NotificationsDropdown.tsx`)
- Maknuti gumbe **"Označi sve"** i **"Obriši sve"** iz headera dropdowna (preglednije, manje "admin chrome").
- Maknuti per-item ikone ✓ i 🗑 koje sada vise s desne strane (zauzimaju širinu, izgledaju kao desktop UI).
- Dodati **swipe-lijevo → obriši** po obavijesti (native osjećaj, kao Mail/Gmail):
  - Implementacija pure CSS + `pointerdown/move/up` na samoj kartici (bez nove biblioteke; uskladiti s postojećim `clickableProps()` patternom za a11y).
  - Threshold ~80px → odmah brisanje + `StatusFeedback` "Obrisano" (1200ms, bez Undo jer obavijesti nisu kritične).
  - Tap (bez povlačenja) i dalje otvara obavijest kao i sad.
  - Klikom na obavijest ona se automatski označava kao pročitana (već postoji) → potreba za ručnim ✓ nestaje.
- Header dropdowna ostaje samo s naslovom **"Obavijesti"** i (ako ima nepročitanih) malim brojem.

### 2. Duplikati budget obavijesti
Na screenshotu se vidi za isti budžet **"Put u Osijek po radionu"**:
- `budget_alert` (101% prekoračen) ← iz edge funkcije `check-budget-alerts` (thresholdi 80/90/100, jedna obavijest po crossanom thresholdu)
- `budget_burn` (95% pri kraju) ← iz `useIssueReconciler` + `detectBudgetBurn` (threshold 85%, active-issue lifecycle)

Dva neovisna sustava pišu u istu `notifications` tablicu za istu pojavu → korisnik vidi 2 stavke.

Rješenje: **`useIssueReconciler` postaje jedini izvor istine za budget upozorenja u zvonu.** Edge funkcija `check-budget-alerts` više ne kreira `notifications` redak — samo šalje push (jer push ne ide kroz reconciler) i to **samo za threshold 100%** (manje šuma, push se rezervira za kritično). Reconciler i dalje radi 85%/100% s auto-resolve kad potrošnja padne.

Posljedice:
- Jedna budget obavijest po budžetu u zvonu, s auto-resolvom (nestaje sama kad spent padne ispod 85%).
- Push i dalje pršti samo na prekoračenju (100%).
- 80%/90% in-app obavijesti nestaju — pokrivene su `budget_burn` (85%) statusom.

## Tehnički detalji

**Files:**
- `src/components/NotificationsDropdown.tsx` — ukloniti header bulk buttons + per-item action buttons; dodati swipe gesture handler na karticu obavijesti.
- `supabase/functions/check-budget-alerts/index.ts` — ukloniti `supabase.from("notifications").insert(...)` blok; zadržati push samo za `targetThreshold === 100`; zadržati `alerts[]` u responseu (klijent ga ne koristi za UI nego za feedback).
- `src/i18n/locales/{hr,en,de}.json` — ukloniti ključeve `notifications.markAllRead` i `notifications.deleteAll` ako se nigdje drugdje ne koriste (provjeriti `rg`).
- Memorija: kratki update u `mem://index.md` ("Budget alerts unified" — reconciler je jedini izvor in-app, push samo na 100%).

**Bez DB migracije.** `useNotifications.deleteAllNotifications` i `markAllAsRead` ostaju u hooku (mogu zatrebati drugdje), samo se uklanja UI ulaz.

**Swipe ponašanje:**
- `touchAction: 'pan-y'` na karticama da se ne sukobljava sa scrollom dropdowna.
- Tijekom povlačenja ikona 🗑 + crveni background ispod (sliding reveal).
- Otkazivanje povlačenjem natrag < 80px → snap nazad.

## Što NE radimo (sad)
- Bez Undo toasta (obavijesti nisu kritični podatak, ako zatrebaju vidi se cijela povijest u sustavu).
- Bez izmjene `monitor-app-health` / drugih edge funkcija — fokus je samo na duple budget alerte koji su vidljivi na screenshotu.
- Bez batch select moda (swipe je dovoljan; ako se pojavi potreba za 50+ obavijesti, doradit ćemo).
