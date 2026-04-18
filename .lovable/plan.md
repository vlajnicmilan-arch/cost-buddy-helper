
Korisnik kaže: iako sam zaključao gumb iza paywalla, korisnik koji ga je već uključio prije (i nema Business pretplatu) ima i dalje uključen poslovni način — jer je `business_mode_enabled = true` u njegovom localStorage.

Trebam dodati **automatsko isključivanje** poslovnog načina kada korisnik nema pristup `business_module`.

## Plan

**1. Auto-disable u `AppStateContext.tsx`**

Dodati `useEffect` koji prati `businessModeEnabled` i poziva `useFeatureAccess`. Ako je `businessModeEnabled === true` ALI `hasAccess('business_module') === false`, automatski:
- Postavi `businessModeEnabled` na `false`
- Obriši `active_business_profile_id` 
- Obriši iz localStoragea

Problem: `AppStateContext` se ne može direktno okačiti na `useFeatureAccess` jer bi stvorio cirkularnu ovisnost (FeatureAccess vjerojatno koristi context). Moram provjeriti.

**Alternativa (sigurnije):** Dodati provjeru u komponentu koja sigurno ima pristup oba — npr. u `App.tsx` ili `Index.tsx` (top-level), kao mali "guard" effect:

```tsx
const { businessModeEnabled, setBusinessModeEnabled } = useAppState();
const { hasAccess } = useFeatureAccess();

useEffect(() => {
  if (businessModeEnabled && !hasAccess('business_module')) {
    setBusinessModeEnabled(false);
  }
}, [businessModeEnabled, hasAccess, setBusinessModeEnabled]);
```

**2. Lokacija guarda**

Najbolje mjesto: novi mali komponent `<BusinessModeGuard />` montiran u `App.tsx` unutar provider stack-a (nakon `AppStateProvider` i `SubscriptionProvider`). Render-a `null`, samo izvršava effect.

**3. Što provjeriti prije implementacije**

- Kako `useFeatureAccess` radi (čeka li loading state subscriptiona?). Ako vraća `false` dok se subscription učitava, mogli bismo greškom isključiti business mode legitimnom Business korisniku. Treba dodati guard: čekati dok subscription nije učitan (`!loading`).

## Izmjene

- **Novi file:** `src/components/guards/BusinessModeGuard.tsx` — null-rendering komponent, isključuje business mode ako nema pristupa, čeka subscription loading
- **Edit:** `src/App.tsx` — montirati `<BusinessModeGuard />` unutar provider tree-a

Nakon odobrenja prebacujem se u default mode i implementiram.
