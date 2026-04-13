

# Plan: Optimizacija performansi — kompresija slika, lazy loading, fontovi

## Trenutno stanje
- **3.3 MB slika** u `src/assets/` — ulaze u JS bundle
- `ai-avatar.png` = 2.1 MB (najveći krivac)
- `app-mockup-dashboard.png` = 462 KB, `app-mockup-budget.png` = 414 KB
- JetBrains Mono font se učitava zajedno s Interom iako se rijetko koristi

## Koraci

### 1. Kompresija slika u WebP (očekivano smanjenje ~90%)
Konvertirati sve velike PNG/JPG u WebP koristeći `cwebp`:

| Slika | Trenutno | Cilj |
|---|---|---|
| `ai-avatar.png` | 2.1 MB | ~100 KB |
| `app-mockup-dashboard.png` | 462 KB | ~60 KB |
| `app-mockup-budget.png` | 414 KB | ~60 KB |
| `cards-floating.png` | 49 KB | ~15 KB |
| `hero-receipt-scan.jpg` | 69 KB | ~25 KB |
| `vm_balance_ghost_avatar_enhanced_224.png` | 84 KB | ~20 KB |
| `vm_balance_avatar.png` | 64 KB | ~15 KB |

Ažurirati sve importove u 11 datoteka da koriste `.webp` umjesto `.png/.jpg`.

### 2. Lazy loading za FinancialAssistantDialog
- `FinancialAssistantDialog.tsx` importira `ai-avatar.png` (2.1 MB) — lazy loadati komponentu ako već nije
- Na `Landing.tsx` dodati `loading="lazy"` na `<img>` tagove za mockup slike

### 3. Font optimizacija
- Razdvojiti JetBrains Mono u zaseban neblokirajući link (učitava se samo kad je potreban)
- Inter ostaje s postojećom preload strategijom

### Datoteke za promjenu

| Datoteka | Promjena |
|---|---|
| `src/assets/*` | Kompresija u WebP format |
| `src/pages/Landing.tsx` | WebP importi + `loading="lazy"` |
| `src/components/FinancialAssistantDialog.tsx` | WebP import |
| `src/components/PageHeader.tsx` | WebP import (logo ostaje PNG — mali) |
| `src/pages/Auth.tsx`, `Install.tsx`, `Onboarding.tsx`, `Paywall.tsx`, `ResetPassword.tsx`, `StorageSetup.tsx` | WebP import za logo ako se komprimira |
| `src/components/home/HomeHeader.tsx`, `LockScreen.tsx` | WebP import |
| `index.html` | Razdvojiti JetBrains Mono font |

### Očekivani rezultat
- Bundle manji za ~3 MB
- Značajno bolji LCP i FCP
- Viši Lighthouse score na mobilnim uređajima

