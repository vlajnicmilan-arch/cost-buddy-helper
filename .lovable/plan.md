
## Cilj
Regresijska zaštita za nedavne popravke u `send-member-invitation` (business statusi vraćaju 200) i `create-checkout` (origin allowlist). Per `mem://architecture/testing-priorities`: ne mockamo Supabase/Stripe chainove — ekstrahiramo pure helpere i njih testiramo.

## Koraci

### 1. `src/lib/invitationOutcome.ts` (novi pure helper)
Funkcija `classifyInvitationOutcome(input)` koja prima već dohvaćene zastavice i vraća jedan od:
- `ok`
- `user_not_found`
- `already_member`
- `already_invited`
- `project_closed`
- `invalid_email`

Input shape:
```ts
{
  type: 'project' | 'budget' | 'payment_source' | 'family';
  invitedEmail: string;
  invitedUserExists: boolean;
  workerId?: string | null;
  sendEmail?: boolean;
  isAlreadyMember: boolean;
  hasPendingInviteByUserId: boolean;
  hasPendingInviteByEmail: boolean;
  project?: { archived: boolean; status: string } | null;
}
```

Pravila (1:1 prema trenutnoj logici u `supabase/functions/send-member-invitation/index.ts`):
- regex email → `invalid_email`
- project + (archived || status in completed/cancelled) → `project_closed`
- !invitedUserExists && !(type==='project' && (workerId||sendEmail)) → `user_not_found`
- invitedUserExists && isAlreadyMember → `already_member`
- invitedUserExists && hasPendingInviteByUserId → `already_invited`
- !invitedUserExists && hasPendingInviteByEmail → `already_invited`
- inače → `ok`

Edge funkcija počinje koristiti taj helper (jedan import, switch na rezultatu) — bez promjene response shape ni statusnih kodova.

### 2. `src/lib/checkoutOrigin.ts` (novi pure helper)
`resolveCheckoutOrigin(requestedOrigin: string | null, allowed: Set<string>, fallback: string)` — vraća requestedOrigin ako je u allowlisti, inače fallback. Edge funkcija importa allowlist iz istog fajla (re-export konstante) da test i runtime dijele istinu.

> Napomena: edge functions (Deno) ne mogu direktno importati `src/`. Rješenje: helperi žive u `supabase/functions/_shared/` (Deno-friendly, plain TS bez React importa) i postoji **shim** u `src/lib/` koji re-exporta isti file kroz path alias — ili jednostavnije, **duplicirati helper kao plain `.ts` u `src/lib/`** i u edge funkciji držati identičnu malu kopiju. Idemo s **jedinstvenom lokacijom u `supabase/functions/_shared/`** i u vitest configu dodati taj direktorij u `include`/`resolve` (već je čisti TS bez Deno-specific importa).

Provjera: `_shared/` već postoji (`sendPushNotification.ts`, `sentry.ts`). Helperi će biti pure TS bez `Deno.*` API → vitest ih može učitati direktno.

### 3. Vitest pokrivenost
`supabase/functions/_shared/__tests__/invitationOutcome.test.ts`:
- invalid email format → `invalid_email`
- project archived → `project_closed`
- project completed/cancelled → `project_closed`
- nepostojeći user, type=budget → `user_not_found`
- nepostojeći user, type=project + workerId → `ok` (email-only invite)
- nepostojeći user, type=project + sendEmail=true → `ok`
- postojeći user, već član → `already_member`
- postojeći user, pending invite po user_id → `already_invited`
- nepostojeći user, pending invite po emailu → `already_invited`
- happy path za sva 4 tipa (project/budget/payment_source/family) → `ok`

`supabase/functions/_shared/__tests__/checkoutOrigin.test.ts`:
- requestedOrigin u allowlisti → vrati ga
- requestedOrigin nije u allowlisti → fallback
- null/empty origin → fallback
- allowlist sadrži sve 4 produkcijske domene (vmbalance.com, www.vmbalance.com, cost-buddy-helper.lovable.app, id-preview…lovable.app)

### 4. Vitest config
Provjeriti da `vitest.config.ts` `include` pokriva `supabase/functions/**/*.test.ts`. Ako ne, proširiti pattern. Bez novih dependencyja.

### 5. CI
`.github/workflows/test.yml` već pokreće `npm test` → novi testovi se izvršavaju automatski. Bez izmjena workflow-a.

## Što se NE dira
- Response shapeovi i HTTP statusi (već popravljeni)
- DB queryji, RLS, RPC
- Frontend (`BudgetMembersTab.tsx` i sl.)
- i18n

## Deliverable
- 2 nova helpera u `supabase/functions/_shared/`
- 2 nova test fajla (~15 testova ukupno)
- Edge funkcije refaktorirane da koriste helpere (manje inline grananja, ista semantika)
- Eventualna mala izmjena `vitest.config.ts` include patterna
