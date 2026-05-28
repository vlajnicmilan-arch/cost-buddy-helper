
# Obitelj 2.0 — Faza A: Transparentnost

Krećemo s **najmanjim, najsigurnijim korakom**. B (komentari) i C (fair share) dolaze kasnije, **tek nakon što vidimo da se Faza A koristi**.

Cilj Faze A: na svakoj dijeljenoj transakciji odmah se vidi **tko ju je dodao i kada**, plus zaseban kronološki pregled aktivnosti grupe zadnjih 30 dana.

---

## Što se mijenja (UI)

### 1. Atribucija na dijeljenim transakcijama
Kad je transakcija povezana s dijeljenim resursom obitelji (shared payment source / project / budget), u listi transakcija pored iznosa prikazuje se:
- mali **avatar + ime člana** koji je unio
- **relativno vrijeme** ("prije 2h", "jučer u 18:42")

Vidljivo samo u kontekstu gdje resurs pripada family grupi — ne mijenja se ništa za isključivo osobne transakcije.

### 2. Filter "Tko je unio"
U postojeći Filter sheet za transakcije dodaje se nova sekcija **"Član obitelji"** — multi-select chips s avatarima članova trenutnog konteksta. Aktivira se samo kad je view filtriran na dijeljeni resurs.

### 3. Activity Feed tab u Family Group Detail view
Novi tab **"Aktivnost"** unutar `FamilyGroupDetailView` pored postojećih sekcija (Članovi, Dijeljeni resursi). Kronološki feed zadnjih 30 dana:
- transakcije na dijeljenim resursima (tko, koliko, kategorija, kad)
- pridruživanje/odlazak članova
- dodavanje/uklanjanje dijeljenih resursa

Reuse postojećeg `family_activity_log` (već se piše, samo nema UI-a koji ga čita).

---

## Što NE radimo u Fazi A
- ❌ Bez komentara/threada (to je Faza B)
- ❌ Bez fair share matematike (to je Faza C)
- ❌ Bez chata (uklonjeno trajno)
- ❌ Bez push notifikacija za "Ana je dodala trošak" — samo passivna vidljivost u feedu
- ❌ Bez izmjene postojećih RLS pravila ni dijeljenja resursa

---

## Tehnička izvedba

### Tablice — nema novih
Sve već postoji:
- `expenses.user_id` → tko je unio
- `expenses.created_at` → kada
- `family_activity_log` (group_id, user_id, action_type, action_description, created_at) — već se piše, ali UI ne čita

### Frontend datoteke
**Nove:**
- `src/components/family/FamilyActivityFeed.tsx` — tab content (lista + grupiranje po danu)
- `src/hooks/useFamilyActivityLog.ts` — fetch + realtime subscribe (zadnjih 30d, limit 200)
- `src/components/transactions/TransactionAttribution.tsx` — mali avatar+ime+vrijeme chip ispod transakcije

**Mijenjamo:**
- `src/components/family/FamilyGroupDetailView.tsx` — dodati `<Tabs>` (Pregled / Aktivnost), ubaciti `FamilyActivityFeed`
- `src/components/TransactionList.tsx` (ili ekvivalent koji renderira retke) — uvjetno renderirati `TransactionAttribution` ako je transakcija na dijeljenom resursu i `expense.user_id !== currentUser.id`
- `src/components/filters/TransactionFilterSheet.tsx` — dodati "Član obitelji" multi-select (samo kad je kontekst shared)

### Hooks
- `useExpenseFetch` već dohvaća `user_id` — dodati `profiles` join za `display_name` + `avatar_url` (lookup tablica u memoriji, ne per-row join)
- Novi `useFamilyMembersForResource(resourceId, resourceType)` — vraća listu članova s pravom čitanja resursa, za filter chips i avatar lookup

### Backend — minimalno
- Provjera da `family_activity_log` RLS dopušta SELECT za sve `family_members` grupe (ako već ne)
- Možda dodati indeks `(group_id, created_at DESC)` ako ga nema

### i18n keys (nove)
```
family.activity.title
family.activity.empty
family.activity.last30days
family.activity.addedExpense  // "{{name}} je dodao/la trošak"
family.activity.addedIncome
family.activity.joinedGroup
family.activity.leftGroup
family.activity.addedResource
family.activity.removedResource
transactions.attribution.addedBy  // "{{name}}, prije {{time}}"
transactions.filter.byMember
```
HR, EN, DE.

---

## Što ostaje za Fazu B i C (samo podsjetnik, NE radimo sad)

**Faza B (~2-3 dana):** komentari na pojedinu transakciju, nova tablica `transaction_comments`, push notifikacija samo onome tko je unio.

**Faza C (~4-6 dana):** per-grupa setting "Fair share method" (Equal / Income-weighted / Custom %), mjesečna kartica "Pravedan udio ovog mjeseca" na dashboardu kad je grupa aktivna, "Označi izravnato" gumb.

Obje faze čekaju potvrdu da Faza A povećava upotrebu (više dijeljenih resursa, više članova po grupi).

---

## Rizici / odluke koje treba pratiti
- **Privatnost atribucije:** član A vidi da je član B dodao trošak — to je *cilj* (transparentnost), ali znači da nitko ne može diskretno trošiti iz zajedničkog. Smatram to feature-om, ne bug-om.
- **Performance feeda:** limit 30d × 200 stavki + realtime — siguran budžet, neće trošiti baterije.
- **Edge case:** transakcija koju je unio bivši član grupe → prikaži ime iz `profiles` (ostaje), bez avatara ili sa sivim "(bivši član)" sufiksom.

---

## Procjena: ~1-2 radna dana

Spreman za implementaciju kad odobriš.
