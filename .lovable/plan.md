## Pregled

Kombiniramo 5 zadataka u jedan plan:
1. **APK signing fix** (iz prošlog dogovora — stabilan release keystore)
2. `.env` u `.gitignore` + `.env.example`
3. Validacija iznosa transakcije: `> 0`
4. Auto-zamjena zareza s točkom + hint ispod polja
5. Budget upozorenje na ≥80% (narančasta + poruka)

---

## 1. Stabilan APK potpis

**Problem:** CI koristi `assembleDebug` → svaki build ima drugačiji debug certifikat → upgrade s 1.0.2 na 1.0.4 puca ("paket u sukobu"). Nema načina da preskočimo deinstalaciju za 1.0.2 — Android to ne dopušta. Ali od **1.0.5 nadalje** svi updatei rade bez deinstalacije.

**Što ti odradiš (ručno, ne mogu ja):**
1. Lokalno generiraj keystore:
   ```
   keytool -genkey -v -keystore vmbalance-release.jks \
     -keyalg RSA -keysize 2048 -validity 10000 -alias vmbalance
   ```
2. Sigurno spremi `.jks` + lozinke (password manager + offline backup — ako se izgubi, gotovi smo zauvijek)
3. Dodaj 4 GitHub Secrets u repo:
   - `ANDROID_KEYSTORE_BASE64` (base64 sadržaj `.jks`)
   - `ANDROID_KEYSTORE_PASSWORD`
   - `ANDROID_KEY_ALIAS`
   - `ANDROID_KEY_PASSWORD`

**Što ja odradim:**
- `android/app/build.gradle`: dodam `signingConfigs.release` (čita iz env), vežem na `buildTypes.release`
- `.github/workflows/android-build.yml`: dekodiram keystore, eksportam env, prebacim `assembleDebug` → `assembleRelease`, putanja APK-a `app/build/outputs/apk/release/app-release.apk`
- Bump na **1.0.5** (`versionCode 6`) u `build.gradle` i `public/version.json`
- U `apkInstaller.ts`: jasna i18n poruka kada Android odbije install zbog signature mismatcha (jednokratna deinstalacija za 1.0.2 korisnike)

---

## 2. `.env` u `.gitignore` + `.env.example`

Trenutni `.gitignore` **ne sadrži** `.env` eksplicitno (samo `*.local`). `.env` postoji u rootu.

**Akcija:**
- Dodam u `.gitignore`:
  ```
  .env
  .env.local
  .env.*.local
  ```
- Kreiram `.env.example` s istim ključevima (bez vrijednosti):
  ```
  VITE_SUPABASE_URL=
  VITE_SUPABASE_PUBLISHABLE_KEY=
  VITE_SUPABASE_PROJECT_ID=
  ```

Napomena: `.env` je auto-managed od strane Lovable Clouda (publishable key je javan), ali commit-anje nije poželjno → ignore je dobra praksa.

---

## 3. Validacija iznosa `> 0`

**Trenutno stanje:** `ManualExpenseForm.tsx` koristi `<Input type="number" min="0" required>` — dozvoljava `0`. Nema zod sheme, validacija se događa ručno na submit.

**Akcija:**
- Kreiram `src/lib/validation/transactionSchema.ts` s zod shemom:
  ```ts
  amount: z.number({ invalid_type_error: t('validation.amountRequired') })
            .positive({ message: t('validation.amountGreaterThanZero') })
  ```
- Validacija u `ManualExpenseForm` na submit + inline error ispod polja iznosa
- Vrijedi za **expense, income, transfer** (sve 3 koriste isti form)
- i18n ključ: `validation.amountGreaterThanZero` → HR: *"Iznos mora biti veći od 0"*, EN/DE varijante

---

## 4. Auto zarez→točka + hint

**Akcija u `ManualExpenseForm.tsx`:**
- Promijenim `<Input type="number">` u `type="text" inputMode="decimal"` (jer `type="number"` ne dopušta zarez nativno na svim browserima)
- U `onAmountChange` parser: `value.replace(',', '.').replace(/[^0-9.]/g, '')` (samo jedna decimalna točka)
- Hint ispod polja: `<p className="text-xs text-muted-foreground">{t('transactions.amountHint')}</p>`
- i18n: `transactions.amountHint` → HR: *"Za decimale koristite točku ili zarez (npr. 150.50)"*

Zadržavam postojeći `parseFloat(props.amount) || 0` na submit — već radi s točkom.

---

## 5. Budget 80% upozorenje

**Trenutno (`BudgetCard.tsx`):**
- `getProgressColor()`: overBudget=destructive, isWarning=warning (yellow), inače primary
- `budget.isWarning` već postoji — treba provjeriti prag

**Akcija:**
- Provjerim gdje se izračunava `isWarning` (vjerojatno `useBudgets` hook). Postavim prag na **≥80% i <100%**.
- Promijenim `bg-warning` (žuta) → narančasta. Dodam u `index.css` semantic token `--warning-strong` ili reuse postojeće `--warning` ako već je narančasta; ako nije, dodam `--budget-warning: 25 95% 53%` (orange-500 HSL).
- Ispod kategorije (u `BudgetCard.tsx` nakon progress bara) prikažem poruku **samo kada je 80% ≤ % < 100%**:
  ```tsx
  {budget.isWarning && !budget.isOverBudget && (
    <p className="text-xs text-warning-strong mt-1">
      {t('budget.nearLimit', { percent: budget.percentage.toFixed(0) })}
    </p>
  )}
  ```
- i18n: `budget.nearLimit` → HR: *"Blizu limita — iskorišteno {{percent}}%"*
- Vidljivo na **stranici Budžeti** (BudgetCard se koristi tamo)
- 100%+ ostaje crveno (već radi)

---

## Redoslijed izvršavanja (kad odobriš plan)

1. `.gitignore` + `.env.example` (najbrže)
2. Validacija + zarez/točka + hint (frontend)
3. Budget 80% upozorenje (frontend + i18n + možda token)
4. APK signing (gradle + workflow + version bump na 1.0.5) — **tek kad potvrdiš da imaš keystore + 4 secrets postavljene u GitHubu**

Ako nemaš još keystore, mogu napraviti 1–3 odmah, pa APK kasnije.