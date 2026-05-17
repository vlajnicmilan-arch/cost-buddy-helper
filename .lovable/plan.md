## Problem

U `NotificationsDropdown` (Bell ikona u headeru) trenutno postoji **samo** gumb "Označi sve kao pročitano", i to **samo kad ima nepročitanih** (`unreadCount > 0`). Nema načina da se sve obavijesti obrišu odjednom — korisnik mora ručno klikati Trash ikonu na svakoj.

To odgovara Vinkinoj prijavi: kad su sve već pročitane, nema niti jedne bulk akcije.

## Rješenje (samo UI/hook, bez DB promjena)

### 1. `src/hooks/useNotifications.ts`
Dodati novu metodu `deleteAllNotifications()`:
- DELETE iz `notifications` WHERE `user_id = user.id`
- Lokalno: `setNotifications([])`, `setUnreadCount(0)`, `setBadge(0)`
- try/catch + `console.error`, vraća success/failure za potrebe toast feedbacka
- Exportati iz hooka uz postojeće metode

### 2. `src/components/NotificationsDropdown.tsx`
- Header dropdowna preraditi tako da prikazuje **dva** gumba kad ima ikakvih obavijesti:
  - **"Označi sve"** (CheckCheck) — vidljiv samo ako `unreadCount > 0` (kao sada)
  - **"Obriši sve"** (Trash2, destructive boja) — vidljiv ako `notifications.length > 0`
- Klik na "Obriši sve" otvara `AlertDialog` potvrdu (`notifications.confirmDeleteAll`) jer je akcija nepovratna
- Nakon potvrde poziva `deleteAllNotifications()`, prikazuje `showSuccess` / `showError`, zatvara dropdown
- Pozicija: kompaktno desno u headeru dropdowna, ikona + kratki tekst, `h-7 text-xs` da stane na 384px viewport

### 3. i18n ključevi (`hr.json`, `en.json`, `de.json`)
Dodati pod `notifications.*`:
- `deleteAll` — "Obriši sve" / "Delete all" / "Alle löschen"
- `confirmDeleteAllTitle` — "Obrisati sve obavijesti?" / "Delete all notifications?" / "Alle Benachrichtigungen löschen?"
- `confirmDeleteAllDesc` — "Sve obavijesti će biti trajno uklonjene. Pozivnice koje su u tijeku neće biti obrisane iz baze poziva." / engleski/njemački ekvivalent
- `allDeleted` — "Sve obavijesti obrisane" / "All notifications deleted" / "Alle Benachrichtigungen gelöscht"

### Napomena o pozivnicama
Brisanje notifikacije **ne briše** zapis u `*_invitations` tablicama — samo skida obavijest. Postojeća pozivnica se i dalje može prihvatiti preko share linka. To je važno spomenuti u tekstu potvrde kako Vinka ne pomisli da je sve nepovratno izgubila.

## Što NE diramo
- DB shema, RLS, edge funkcije
- Push notifikacije / `push_tokens`
- Realtime subscription
- Postojeća logika `markAsRead` / pojedinačnog `deleteNotification`

## Datoteke
- `src/hooks/useNotifications.ts` (dodati metodu)
- `src/components/NotificationsDropdown.tsx` (dodati gumb + AlertDialog)
- `src/i18n/locales/{hr,en,de}.json` (4 nova ključa po jeziku)

Ukupno ~50 redaka koda + i18n.
