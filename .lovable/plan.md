
# Admin UX refactor — finalna implementacijska specifikacija (PR1)

Sve točke iz razgovora zaključane. Klikni **Implement plan** da krenem.

## Što se gradi

### Datoteke (planirano)

**Novo:**
- `src/lib/adminAccess.ts` — pure helperi
- `src/lib/__tests__/adminAccess.test.ts` — vitest pokrivenost
- `src/components/admin/AccessTab.tsx` — zamjena za `BillingTab` (file rename + reorganizacija)
- `src/components/admin/access/ModuleAccessOverview.tsx` — 3 kartice (Core/Projects/Business)
- `src/components/admin/access/RecentOverrideActivity.tsx` — read-only feed (10)
- `src/components/admin/users/UserAccessBadges.tsx` — tekstualni `Modul · Izvor` badgevi
- `src/components/admin/users/EffectiveAccessSummary.tsx`
- `src/components/admin/users/UserBillingSection.tsx`
- `src/components/admin/users/UserModuleOverrideSection.tsx` (wrapper oko `AdminModuleGrantForm` + lista + history)

**Izmijenjeno:**
- `src/pages/Admin.tsx` — tab `billing` → `access`, prosljeđivanje `setUserTier` u detalj korisnika
- `src/components/admin/UsersTab.tsx` — novi filter set, novi prikaz pristupa, novi detalj
- `src/i18n/locales/hr.json` / `en.json` / `de.json` — `admin.access.*`, `admin.users.accessBadge.*`, `admin.users.accessSource.*`, `admin.users.filter.*`, `admin.user.*`, `admin.billing.planLabel.*`, `admin.user.layersIndependentNote`

**Obrisano:**
- `src/components/admin/BillingTab.tsx` (preimenovano)

### Helperi (pure, s testovima)

```ts
formatBillingPlanLabel(tier)
// 'free' → 'admin.billing.planLabel.coreOnly'
// 'pro'  → 'admin.billing.planLabel.projects'
// 'business' → 'admin.billing.planLabel.business'

deriveEffectiveAccess(userId, subscriptions, grants)
// → { core: true, projects: { has, sources: ['billing'|'override'] }, business: {...} }

summarizeModuleAccess(users, subscriptions, grants)
// → { projects: { total, billing, override, intersection }, business: {...}, coreTotal }
// Brojevi nedisjunktni; presjek eksplicitno odvojen.

sortGrantsByLatestEvent(grants)
// ORDER BY GREATEST(granted_at, COALESCE(revoked_at, granted_at)) DESC, id DESC
```

Vitest min 6+8+6+4 = 24 case-a.

### UI pravila (zaključana)

- **Korisnički redak**: badge `Modul · Izvor` samo za module gdje ima pristup. Bez `Core` badge-a. Kad nema modula → indikator `Samo Core`. Tekst primarno, ikone (`⚡`, `⏳`) samo kao sekundarni akcent.
- **Detalj korisnika**: `Efektivni pristup` (summary) → `Naplata` (sloj 1) → `Admin override modula` (sloj 2). `layersIndependentNote` kao **neutralni** info-callout (bg-muted, bez ikone alarma).
- **Tab `Pristup`** redoslijed: `Naplata sustava` → `Stanje pristupa po modulima` → `Nedavna override aktivnost`.
- **Kartice modula**: `Ukupno s pristupom` primarni broj; `kroz Naplatu`, `kroz Override`, presjek sekundarno.
- **Recent activity**: strogo read-only, sort po `GREATEST(granted_at, revoked_at)`, bez inline akcija.

### Filter set (zaključan)

`Svi · Admini · Blokirani · Ima Projects · Ima Business · Override aktivan · Samo Core`

(Stari `Pro/Business/Free` filteri uklonjeni.)

### Billing copy (zaključan)

| DB | HR | EN | DE |
|---|---|---|---|
| `free` | `Samo Core` | `Core only` | `Nur Core` |
| `pro` | `Naplata: Projects` | `Billing: Projects` | `Abrechnung: Projects` |
| `business` | `Naplata: Business` | `Billing: Business` | `Abrechnung: Business` |

Izvor-oznaka u badge-u: HR `Naplata`/`Override`, EN `Billing`/`Override`, DE `Abrechnung`/`Override`.

### Bez DB promjena

`user_subscriptions.tier` enum nedirano. `admin_module_grants` i RPC-ovi nedirano. Sve klijentsko.

### Out-of-scope (PR2)

- `Override ističe < 7d`, `Plaća`/`Ne plaća` filteri
- Drill-down liste iz kartica modula
- Filtri u activity feed-u
- Bulk override dodjela
- `Family` modul

## Završni izvještaj nakon implementacije

Vratit ću točno:
1. listu dirnutih datoteka
2. što je implementirano
3. dodane/promijenjene testove
4. eventualne prilagodbe prema specifikaciji
5. follow-up stavke ako ih bude
