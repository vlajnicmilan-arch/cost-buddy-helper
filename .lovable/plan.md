

## Plan: Animirani Ghost Avatar s ekspresijama i okretanjem

Zamjena trenutnog statičnog PNG avatara s novim animiranim SVG ghost avatarom baziranim na priloženoj slici. Ghost će se okretati lijevo-desno, izražavati emocije licem i mijenjati glow po raspoloženju.

### Što se gradi

Potpuno novi `GhostAvatar` SVG komponent koji replicira izgled uploadanog duha (bijelo-plavi ghost s velikim plavim očima, srcolikim ticalom na glavi, prozirnim eterealnim tijelom) — ali kao animirani SVG s:

1. **Okretanje tijela/pogleda** — ghost se polako okreće lijevo-desno (rotacija + blagi perspektivni pomak očiju) koristeći postojeći `useEyeMovement` hook
2. **Ekspresije lica po moodu** — oči, usta i obrve se mijenjaju ovisno o raspoloženju (happy/thinking/worried/proud/neutral)
3. **Dinamički glow** — `filter: drop-shadow()` animacija na cijelom SVG-u mijenja boju i intenzitet po moodu (cijan, narančasta, zlatna)
4. **Treptanje** — koristi postojeći `useBlinking` hook

### Promjene datoteka

| Datoteka | Promjena |
|---|---|
| `src/assets/vm_balance_ghost_avatar_enhanced_224.png` | Kopirati uploadanu sliku (referenca, neće se koristiti u kodu) |
| `src/components/ai-avatar/GhostAvatar.tsx` | **NOVI** — SVG ghost avatar komponenta s animacijama lica, okretanjem tijela, treptanjem |
| `src/components/ai-avatar/FloatingAIAvatar.tsx` | Zamijeniti `<img>` tag s `<GhostAvatar>`, vratiti `useBlinking` i `useEyeMovement` hookove, prilagoditi glow da koristi `filter: drop-shadow` umjesto `boxShadow` |

### GhostAvatar SVG dizajn (baziran na slici)

```text
Elementi:
- Okrugla glava (bijelo-plava, radijalni gradijent)
- Veliko srcoliko/kristalno ticalo na vrhu glave
- Velike plave oči (kawaii stil) s highlightima
- Mali slatki osmijeh
- Eterično tijelo koje se sužava prema dolje (valoviti rub)
- Sparkle/čestice oko tijela
- Cijanozeleni glow oko cijelog lika
```

### Animacije

```text
Okretanje:
- Cijelo tijelo: rotateY simulacija putem scaleX [1, 0.95, 1, 1.05, 1] + translateX
- Oči: pupile prate useEyeMovement pozicije (lijevo/desno/gore/dolje)

Ekspresije po moodu:
- neutral: normalne oči, mali osmijeh
- happy: oči se sužavaju (sretan squint), širi osmijeh, bouncy pokret
- thinking: oči gledaju gore-desno, usta ravna crta, blago nagnut
- worried: oči veće, obrve spuštene, usta u ∪ oblik (tužno)
- proud: oči zatvorene (self-satisfied), širi osmijeh, scale up

Glow po moodu:
- neutral: blagi cijan drop-shadow
- happy: jači cijan, pulsirajući
- thinking: sporiji pulse, tamnije plavi
- worried: narančasto-crvenkasti glow
- proud: zlatni intenzivni glow

Stalno prisutne:
- Floating (y: [0, -4, 0])
- Treptanje (useBlinking)
- Sparkle čestice oko tijela
```

### Tehnički detalji
- SVG viewBox: `0 0 120 160` (vertikalno orijentiran ghost)
- Koristi framer-motion `<motion.path>`, `<motion.ellipse>` za animirane SVG elemente
- Glow se postiže putem animiranog `filter: drop-shadow()` na root SVG elementu — ne boxShadow (jer ghost nije krug)
- Ponovno se aktiviraju `useBlinking` i `useEyeMovement` hookovi u FloatingAIAvatar
- Veličina kontejnera ostaje 112x112px

