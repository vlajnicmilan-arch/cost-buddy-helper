## Cilj

Korisnik kad otvori detalje transakcije koja pripada **family shared izvoru plaćanja** vidi:
- **Reakcije** (👍 ❤️ ⚠️ …) – jedan red, klik = toggle
- **Komentare** (kratki, max 280 znakova) – lista + input

Za transakcije koje **nisu** family-shared, dialog ostaje identičan kao danas (nula vizualne promjene).

---

## Što je već gotovo (iz koraka 5)

- `FamilyReactionsBar` komponenta — radi, treba `groupId` + `expenseId`
- `FamilyCommentsInline` komponenta — radi, treba `groupId` + `expenseId`
- `useFamilyReactions` / `useFamilyComments` hookovi + RLS na tablicama
- Push notifikacije (`notify-family-event`) već postoje (korak 6)

Nedostaje **samo wiring**: kako iz transakcije saznati pripada li family grupi i kojoj.

---

## Plan implementacije (1 commit)

### 1. Novi hook `useFamilyGroupForExpense(expense)`

Lokacija: `src/hooks/useFamilyGroupForExpense.ts`

Logika (čisti SELECT, bez novih tablica):
1. Iz `expense.payment_source` ekstraktiraj custom UUID (`custom:<uuid>` ili direktan match na `customPaymentSources`).
2. Query: `family_shared_sources` WHERE `payment_source_id = <uuid>` → vrati `group_id` (ili `null`).
3. Cache preko TanStack Query (`['family-group-for-source', sourceId]`, `staleTime: 5 min`).

Vraća: `{ groupId: string | null, loading: boolean }`.

Edge case: ako transakcija nema custom izvor (cash, generic), helper odmah vraća `null` bez query-a.

### 2. Integracija u `TransactionDetailDialog.tsx`

Pri vrhu komponente pozovi hook. Ako `groupId` postoji, **na dnu dialoga** (ispod postojećih sekcija, prije akcijskih gumba) dodaj novu sekciju:

```
┌─────────────────────────────────┐
│ 👨‍👩‍👧 Obitelj                    │
│                                 │
│ [👍 2] [❤️ 1] [+]               │  ← FamilyReactionsBar
│                                 │
│ Marko: Ovo je za rođendan       │  ← FamilyCommentsInline
│ Ana: 👍                          │
│ [textarea + Pošalji]            │
└─────────────────────────────────┘
```

Naslov sekcije: `t('family.transactionSocial.title', 'Obitelj')` s ikonom `Users`.

### 3. i18n

Dodati u `hr/en/de`:
- `family.transactionSocial.title` = "Obitelj" / "Family" / "Familie"

Reactions/comments stringovi (`family.reactions.*`, `family.comments.*`) već postoje.

### 4. Nema DB migracije

Sve tablice i RLS-ovi su postavljeni u koraku 5. Nema schema promjena.

### 5. Nema native promjena

Web + native (Capacitor) koriste isti React kod. Nema potrebe za version bump u `public/version.json` / `build.gradle`.

---

## Tehnički sažetak

| Stavka | Status |
|---|---|
| Nova tablica | – |
| Migracija | – |
| Edge function | – |
| Novi hook | `useFamilyGroupForExpense` |
| Izmijenjeni file | `src/components/TransactionDetailDialog.tsx` |
| i18n ključ | 1 novi (`family.transactionSocial.title`) |
| Version bump | nije potreban |

## Što NIJE u ovom planu

- Badge na transakcijskoj listi koji pokazuje broj reakcija (može u sljedećoj iteraciji ako se feature koristi)
- Real-time refresh preko `supabase.channel` (TanStack Query refetch je dovoljan za sada)
- Notifikacija "X je reagirao na tvoju transakciju" → već postoji u `notify-family-event` (korak 6)

## Rizici

- Ako `payment_source` ima nestandardni format (legacy `card:` prefix), helper vraća `null` i sekcija se ne prikazuje — fail-safe (ništa se ne razbije).
- Performance: po otvaranju dialoga jedan dodatan SELECT (cached 5 min) — zanemarivo.
