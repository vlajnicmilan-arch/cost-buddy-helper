
Problem koji se vidi u kodu

- `TransactionDetailDialog.tsx` drži viewer state (`showReceiptImage`, `imageZoom`) lokalno, ali ga ne resetira kad se detail dialog zatvori ili kad se promijeni transakcija.
- fullscreen preview je portal izvan Radix `Dialog` sustava i trenutno nije registriran u `useBackButton`, pa Android/Samsung back zatvara parent dialog transakcije umjesto samog previewa.
- u `Index.tsx`, `PaymentSourceTransactionsDialog.tsx` i `BudgetFullScreenView.tsx` detail dialog ostaje mountan i nakon zatvaranja, pa stari viewer state preživi sljedeće otvaranje.

Plan

1. Stabilizirati lifecycle previewa u `TransactionDetailDialog.tsx`
- uvesti jedinstveni `closeReceiptViewer()` helper
- portal renderirati samo kad je `open && showReceiptImage && freshReceiptUrl`
- resetirati viewer state kad `open` postane `false` i kad se promijeni `expense.id`
- kroz wrapper za `onOpenChange` prvo zatvoriti preview, pa tek onda detail dialog

2. Ispravno spojiti preview na mobile/back ponašanje
- registrirati receipt preview preko `useBackButton(showReceiptImage, closeReceiptViewer, višiPrioritet)`
- time će back prvo zatvoriti sliku, a tek drugi back detail transakcije
- isto ponašanje koristiti za X i tap na backdrop

3. Uskladiti parent komponente da ne čuvaju “stari” dialog state
- `Index.tsx`
- `PaymentSourceTransactionsDialog.tsx`
- `BudgetFullScreenView.tsx`
- na zatvaranju clearati odabranu transakciju i uvjetno mountati `TransactionDetailDialog`, po uzoru na već ispravan pattern u `BusinessTransactions.tsx`

4. Mali mobile UX popravci dok se dira viewer
- povećati close/zoom touch targete na najmanje 44x44
- zadržati isti izgled, ali ukloniti mogućnost da fullscreen overlay ostane “odspojen” od transakcije

Tehnički detalji
- glavni bug nije storage nego state/lifecycle
- ne treba vraćati nested dialog
- ne treba mijenjati local-first spremanje receipt slike
- ne treba uvoditi nove akcije; fokus je da `Pregledaj` radi pouzdano

Provjera nakon implementacije
- otvori receipt, zatvori ga s X → vraća se na detalj transakcije
- otvori receipt, zatvori ga Android/browser back tipkom → zatvara se samo preview
- zatvori cijelu transakciju dok je preview bio otvoren → ponovno otvaranje kreće iz detalja, ne iz fullscreen slike
- isto ponašanje radi na `/index`, u payment source pregledu i u budget pregledu
- Samsung Internet / mobilni preview više ne “lijepi” fullscreen viewer za sljedeće otvaranje
