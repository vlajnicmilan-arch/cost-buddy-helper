## 1. Uzrok (točne datoteke/linije)

Nije bug u logici Novčanika — riječ je o **Radix pointer "click-through"** ponašanju na touch uređajima.

Relevantna mjesta:

- `src/components/custom-payment-sources/CustomPaymentSourcesPanel.tsx:416-453` — kartica računa; `DropdownMenuTrigger` (gumb ⋮/MoreHorizontal, linije 417-428) i `DropdownMenuContent` (429) čija je **prva stavka** `toggleHidden(source.id)` (430-435).
- `node_modules/@radix-ui/react-dropdown-menu/dist/index.mjs:74-79` — trigger otvara meni na **`pointerdown`** (`context.onOpenToggle()`), ne na `click`.
- `node_modules/@radix-ui/react-menu/dist/index.mjs:373, 392-400` — `MenuItem` drži `isPointerDownRef`. Na `pointerup`: `if (!isPointerDownRef.current) event.currentTarget?.click();` — tj. ako `pointerdown` **nije** bio na toj stavci, Radix svejedno sintetizira klik na stavku koja je pod pokazivačem u trenutku otpuštanja. To je namjerno za "press-drag-release" mišem, ali na dodiru je štetno.
- Posljedica: `toggleHidden` u `src/hooks/useHiddenPaymentSources.ts` (funkcija `toggleHidden`, optimistički `setCache(next)`) odmah promijeni vidljivost — bez potvrde, uz `showSuccess` note.

## 2. Slijed eventova koji daje simptom

1. Prst dodirne područje ⋮ → `pointerdown` (button 0) na `DropdownMenuTrigger` → meni se **odmah otvara i renderira**.
2. Radix Popper pozicionira `DropdownMenuContent` `side="bottom"`, `sideOffset=4` (`src/components/ui/dropdown-menu.tsx:58`), `align="end"` — dakle svega ~4px ispod gumba, poravnato desno, točno u zoni gdje je prst.
3. Prst se podigne (ili minimalno klizne prema dolje) → `pointerup` se dostavlja elementu koji je sada pod tom točkom = **prva stavka menija "Sakrij/Prikaži s dashboarda"**.
4. `MenuItem.onPointerUp` vidi `isPointerDownRef === false` (pointerdown je bio na trigeru, ne na stavci) → poziva `currentTarget.click()` → `handleSelect()` → `toggleHidden(source.id)` + `rootContext.onClose()`.
5. Meni se zatvori u istom frameu, pa korisnik **nikad ne vidi popup** — samo račun koji se sakrio/pokazao.

Zašto "ponekad": ovisi o točnoj y-koordinati dodira i mikropomaku prsta (Android ne šalje `pointerup` na istom elementu ako je prst pomaknut), te o poziciji kartice na ekranu. Ako je kartica pri dnu ekrana, Popper flipa meni prema gore i tada pod prstom završi **zadnja** stavka — "Obriši" (isti mehanizam, veći rizik; ipak tu slijedi AlertDialog potvrda pa nije destruktivno bez potvrde).

Napomena: isti obrazac ⋮-menija postoji i drugdje (npr. `src/components/projects/ProjectHeaderMenu.tsx`), pa je popravak najbolje napraviti centralno.

## 3. Prijedlog popravka (opis, bez koda)

Preporučeno, centralno, minimalno invazivno — u `src/components/ui/dropdown-menu.tsx`:

1. **Neutralizirati click-through na dodir**: u `DropdownMenuContent` dodati `onPointerUp` guard koji ignorira/spriječi prvi `pointerup` čiji `pointerType` nije `mouse`, a koji stiže unutar kratkog prozora od otvaranja (odnosno kad odgovarajući `pointerdown` nije bio unutar sadržaja menija). Efektivno: stavka se može odabrati tek zasebnim, novim dodirom.
2. **Povećati `sideOffset` / `collisionPadding`** za touch (npr. 8-10px) kako izlazna zona menija ne bi doslovno graničila s prstom. Ovo sâmo po sebi nije dovoljno — samo smanjuje učestalost; koristiti kao dopunu, ne kao rješenje.

Alternativa lokalno u `CustomPaymentSourcesPanel.tsx` (ako se ne želi dirati zajednički UI primitiv):
- Trigger prebaciti na otvaranje na `click` umjesto `pointerdown` (kontrolirani `open` state + `onPointerDown` preventDefault na dodiru). Tada u trenutku otvaranja menija prst je već gore i nema sintetiziranog klika.

Dodatno (neovisno o gornjem, kao obrana u dubinu):
- Prvu stavku menija **ne** ostaviti kao mutirajuću akciju bez potvrde — npr. redoslijed: Članovi / Uredi / Sakrij / (separator) Obriši, ili barem uvesti Undo za "Sakrij".
- Povećati touch target trigera na min 44px (trenutno `h-7 w-7`, `CustomPaymentSourcesPanel.tsx:421`) — mali cilj povećava vjerojatnost da centroid dodira padne izvan gumba.

## 4. Ako se traži tvrda potvrda prije popravka

Instrumentacija za live provjeru na uređaju (samo dijagnostika, privremeno):
- Na trigeru i na prvoj `DropdownMenuItem` logirati `pointerdown`/`pointerup`/`click` s `event.pointerType`, `clientX/Y`, `event.target`, `timeStamp`.
- Očekivani potpis buga: `pointerdown@trigger (pointerType="touch")` → `pointerup@menuitem` → `click@menuitem`, sve unutar ~100-200 ms, bez ijednog `pointerdown@menuitem`.
- Automatizirano se isto može reproducirati Playwright-om (Chromium, `hasTouch: true`, CDP `Input.dispatchTouchEvent` start/end na koordinatama ⋮ s pomakom od ~6px prema dolje) — ali kod je već jednoznačan, ovo služi samo kao regresijski test nakon popravka.

**Ništa nije mijenjano — ovo je samo dijagnoza.**
