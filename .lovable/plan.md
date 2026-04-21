

## Dijagnoza — zašto Test vidi projekt i u osobnom modu

### Što sam pronašao u bazi za projekt **Duje Grčić**

| Član | Uloga | `member_context` | `member_business_profile_id` |
|---|---|---|---|
| Milan (vlasnik) | manager | personal | — |
| Vinka | member | personal | — |
| **Test** | member | **personal** ❌ | NULL ❌ |

Test je upisan kao **`personal`**, ne kao `business`. Logika u `useProjects.ts` (linije 59–66) precizno filtrira:
- u **osobnom modu** prikazuju se samo članstva s `member_context = 'personal'` → Test ga vidi ✅ (i ne bi trebao)
- u **poslovnom modu** prikazuju se samo članstva s `member_context = 'business'` i istim `business_profile_id` → Test ga **ne** vidi u poslovnom modu (iako bi trebao)

Dakle Test sada ima **suprotno** od onoga što je odabrao pri prihvaćanju.

### Zašto se to dogodilo (uzrok u kodu)

U edge funkciji `accept-project-invitation` (linije 154–187) logika za rezolvaciju konteksta:

1. Ako klijent pošalje `memberContext='business'` **+ valjan `memberBusinessProfileId`** → spremi `business`
2. Ako klijent pošalje `memberContext='personal'` → spremi `personal`
3. **Inače (fallback)** → spremi `personal` (čak i ako je pozivnica imala `suggested_context='business'`)

Test je u UI-ju vjerojatno odabrao "Poslovni mod" **ali bez odabira konkretnog poslovnog profila** (jer Test možda nema svoj poslovni profil, ili ga nije eksplicitno odabrao u dropdown-u). Zato je `memberBusinessProfileId` bio `null`, validacija u koraku 1 nije prošla, i pao je u fallback (korak 3) → upisano kao `personal`.

**Drugi mogući uzrok:** Test nema vlastiti aktivan poslovni profil pa UI nije ni poslao `business` kontekst.

---

## Što ćemo ispraviti

### Korak 1 — popraviti **postojeći zapis** za Testa (jednokratno)
Direktna SQL korekcija na `project_members` redu Testovog članstva u projektu Duje Grčić:
- `member_context` → `'business'`
- `member_business_profile_id` → Testov vlastiti poslovni profil (ako postoji), ili NULL ako Test sluša projekt iz "općeg" poslovnog konteksta

**Pitanje koje moram riješiti pri implementaciji:** Test je *gost* na projektu vlasnika Milana. Dva su moguća modela:
- **A)** Test mora imati vlastiti poslovni profil i veže članstvo na njega → ako Test nema poslovni profil, ne može uopće gledati projekt u "poslovnom" modu
- **B)** `member_business_profile_id` može biti `NULL` kad je `member_context='business'` → projekt se prikazuje uvijek kad je Test u **bilo kojem** poslovnom modu

Predlažem **model B** za guest-članove (pojednostavljuje pridruživanje). Filter u `useProjects.ts` treba prilagoditi:
```ts
return m.member_context === 'business' &&
  (m.member_business_profile_id === null || m.member_business_profile_id === activeBusinessProfileId);
```

### Korak 2 — popraviti **buduće** prihvaćanja pozivnica
U `accept-project-invitation/index.ts` (linije 172–183) promijeniti fallback:
- Ako klijent pošalje `memberContext='business'` ali bez `memberBusinessProfileId` → **i dalje** spremiti kao `business` s `member_business_profile_id = NULL` (umjesto trenutnog tihog pada na `personal`)
- Ako pozivnica ima `suggested_context='business'` i klijent ništa nije poslao → spremiti kao `business` s NULL profile_id

### Korak 3 — popraviti UI prihvaćanja (`JoinProject.tsx`)
Provjeriti šalje li frontend zaista `memberContext='business'` kad korisnik klikne "Pridruži se kao poslovni član". Ako Test nema svoj poslovni profil, trebao bi UI:
- ipak dopustiti odabir "Poslovno" (bez specifičnog profila)
- ili jasno prikazati: "Da bi se pridružio kao poslovni član, prvo aktiviraj poslovni mod u Postavkama"

### Korak 4 — uskladiti filter u `useProjects.ts`
Linije 59–66 prilagoditi tako da projekt koji ima `member_context='business'` **i** `member_business_profile_id IS NULL` bude vidljiv u **svim** poslovnim modovima Testa (ali ne i u osobnom).

---

## Datoteke koje se mijenjaju

| Datoteka | Promjena |
|---|---|
| Migracija (jednokratni UPDATE) | Postaviti Testov red na `member_context='business'`, `member_business_profile_id=NULL` |
| `supabase/functions/accept-project-invitation/index.ts` | Ne padati na `personal` kad klijent eksplicitno traži business — dopustiti NULL profile_id |
| `src/hooks/useProjects.ts` | Filter dopustiti `member_business_profile_id IS NULL` u poslovnom prikazu |
| `src/pages/JoinProject.tsx` (provjera) | Šalje li UI `business` kad treba |

## Što se NE mijenja
- RLS politike (Test već ima pristup čitanju projekta)
- Permissions sustav
- Notifikacije

## Očekivani ishod
- **Test u osobnom modu** → Duje Grčić **NESTAJE** s liste projekata ✅
- **Test u poslovnom modu** (bilo koji profil ili "default" business) → Duje Grčić **JE** vidljiv ✅
- **Buduće pozivnice s odabirom "Poslovno"** → uvijek se točno bilježe kao business kontekst

---

**Reci "Idemo" za potvrdu — ili odaberi:**
- **Samo Korak 1** (brzo: ispraviti samo Testov zapis, ne dirati edge funkciju)
- **Koraci 1+2+3+4** (potpuni popravak — preporučeno, ~15 min)

