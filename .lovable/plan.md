

## Problem

Landing stranica (`src/pages/Landing.tsx`) koristi generičku **Wallet ikonu** s plavo-bijelim gradijentom umjesto pravog loga (`src/assets/logo.png`). To se pojavljuje na **3 mjesta**:

1. **Navigacija** (linija 57-59) - gornji lijevi kut
2. **Footer** (linija 447-449) - donji dio stranice  
3. **APK Download sekcija** (linija 499-501) - velika ikona na sredini

## Plan

### Izmjena: `src/pages/Landing.tsx`

1. Dodati import loga na vrh datoteke:
   ```typescript
   import logo from '@/assets/logo.png';
   ```

2. Zamijeniti sve 3 Wallet ikone s pravom `<img>` oznakom loga:

   - **Nav** (linija 57-59): zamijeniti gradient div + Wallet ikonu s:
     ```tsx
     <div className="w-9 h-9 rounded-xl overflow-hidden">
       <img src={logo} alt="V&M Balance" className="w-full h-full scale-[1.8] object-cover" />
     </div>
     ```

   - **Footer** (linija 447-449): isto, samo manji (w-8 h-8)

   - **APK sekcija** (linija 499-501): isto, samo veći (w-20 h-20, rounded-3xl)

Nikakve druge datoteke se ne mijenjaju. Ovo je ista `<img>` struktura koja se već koristi u `HomeHeader.tsx` i `PageHeader.tsx`.

