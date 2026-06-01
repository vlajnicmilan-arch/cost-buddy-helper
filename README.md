# V&M Balance

Mobile-first PWA + Capacitor Android app za osobne i poslovne financije: transakcije, budžeti, projekti, AI uvidi, dijeljeni novčanici i open banking sync.

**Live:** https://vmbalance.com  
**Lovable projekt:** https://lovable.dev/projects/8a8fc612-0ac2-4902-a82e-29b5b800bc32

## Stack

- React 18 + TypeScript 5 + Vite 5
- Tailwind CSS v3 + shadcn/ui (Lucide ikone)
- TanStack Query + React Context
- Lovable Cloud (Supabase: Postgres + RLS + Edge Functions + Storage + Auth)
- Lovable AI Gateway (Gemini Flash Lite / Pro)
- Capacitor 8 (Android): Camera, Haptics, StatusBar, Browser, Filesystem, FCM v1 push
- i18n: hr (primary), en, de — sve UI tekstove ide kroz `t()`
- Stripe (BYOK trenutno) za pretplate

## Razvoj

Preduvjeti: Node 18+ i npm.

```sh
npm install --legacy-peer-deps
npm run dev        # Vite dev server
npm test           # Vitest (pure helperi i hookovi)
```

### Android (Capacitor)

```sh
npm run build
npx cap sync android
npx cap open android
```

Svaka native promjena zahtijeva bump `public/version.json` + `android/app/build.gradle` u istom commitu (update checker se oslanja na to).

## Backend (Lovable Cloud)

Cijeli backend je u `supabase/`:
- `migrations/` — SQL migracije (RLS, RPC, triggeri, cron jobovi)
- `functions/` — Deno edge funkcije, dijeljeni kod u `functions/_shared/`
- `config.toml` — projektne i per-funkcijske postavke

Edge funkcije se deployaju automatski. Tajne se postavljaju kroz Lovable Cloud UI (nikad u `.env`).

## Sigurnost

- RLS uključen na svim public tablicama
- Uloge isključivo u `user_roles` tablici + `has_role()` security definer funkcija
- Svaka `CREATE TABLE public.*` migracija MORA imati eksplicitne `GRANT`ove
- Soft delete (`deleted_at`) s 30d retention + cron purge
- Account deletion GDPR flow (30d grace period)

## Konvencije

Detaljne konvencije, dizajn-sistem, i18n pravila i bug-fix strategija su u [`PROJECT_KNOWLEDGE.md`](./PROJECT_KNOWLEDGE.md).

Kratko:
- camelCase varijable, PascalCase komponente
- Teal primarna boja HSL `172 66% 40%`, mobile-first 384px breakpoint
- Min touch target 44px, BottomNav obavezan
- Bez hardkodiranih UI stringova, bez patcha s guardovima/timeoutima
- Bug u pure logici → ekstrahiraj helper → napiši vitest

## Deploy

Lovable → Share → Publish. Custom domena kroz Project Settings → Domains.
