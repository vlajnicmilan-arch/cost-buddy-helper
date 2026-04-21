
## Pravi uzrok (potvrđeno iz koda + logova)

U **tvojim console logovima** vidi se točno trenutak pada:
```
[Diag:route_change] { "from": "/app", "to": "/home" }
[BackButton] route changed: /home public: false
```

Ovo se događa **baš dok je nativna kamera otvorena**. Slijed:

1. Otvoriš `AddExpenseDialog` (na ruti `/app` ili `/index`)
2. Klikneš "Skeniraj" → otvara se **nativna Android Camera Activity** kao zasebni Android prozor iznad WebView-a
3. Slikaš → Android kamera se zatvara → vraća fokus WebView-u → Android operativni sustav usput šalje **`popstate` event** WebView-u (tipično ponašanje pri vraćanju activity-ja)
4. `BackButtonContext.handlePopState` se okida
5. `AddExpenseDialog` **nije registriran** preko `useBackButton`, pa `BackButtonContext` misli da nema otvorenog dialoga
6. Trenutna ruta nije root app ruta → kod izvršava `navigate('/home')`
7. Ruta se mijenja → `Index` page se demontira → cijeli `AddExpenseDialog` se demontira zajedno s njim
8. `scanReceipt` koji u međuvremenu uspješno završava (vidimo u edge logovima `200 OK`) **postavlja state na komponenti koje više nema** → `ScannedDataPreview` se ne renderira
9. Korisnik vidi početni ekran, bez podataka

Ovo nije bilo prije jer `BackButtonContext` (s pushanjem `popstate` i navigacijom na `/home`) je dodan tijekom rada na nativnom back gumbu, **isti period kao push notifikacije** — zato djeluje kao da su push krivi, ali zapravo su to dvije nezavisne izmjene iz iste runde.

## Što ću napraviti (samo web kod, bez novog APK-a)

### Datoteka 1: `src/components/add-expense/AddExpenseDialog.tsx`
Registrirati dialog u globalni back-button sustav, da `BackButtonContext` zna da je otvoren i ne navigira nigdje:

```ts
import { useBackButton } from '@/hooks/useBackButton';
// …
useBackButton(open, () => setOpen(false), 10);
```

Time kad Android pošalje `popstate` po povratku iz kamere, `handlePopState` vidi otvoreni dialog kao top handler, pozove njegov `onClose` (koji bi normalno zatvorio dialog), **ali** mi imamo `onOpenChange` zaštitu na liniji 697:
```ts
if (!isOpen && (scanning || showScannedPreview || isSaving)) return;
```
…pa dialog ostaje otvoren dok skeniranje traje. Kad rezultat stigne → `setShowScannedPreview(true)` → preview se pokaže.

### Datoteka 2: `src/components/add-expense/AddExpenseDialog.tsx` (ista, mali dodatak)
Proširiti zaštitu `onOpenChange` da pokriva i prozor **prije** `scanning=true` (dok je nativna kamera otvorena, prije nego što slika krene na server):
- Dodati ref `cameraActiveRef` koji se postavlja `true` u `handleNativeCapture` prije `nativeTakePhoto`, resetira u `finally` nakon `processImageBase64`
- Dodati u guard: `if (!isOpen && (scanning || showScannedPreview || isSaving || cameraActiveRef.current)) return;`

### Datoteka 3: `src/contexts/BackButtonContext.tsx` (sigurnosna mreža)
Dodati kratak prozor (~500 ms) nakon povratka iz pozadine u kojem `handlePopState` ne radi navigaciju na `/home`. Koristiti `document.visibilitychange` event:
- Kad `document.visibilityState` postane `hidden` (kamera otvorena) → zapamtiti timestamp
- Kad ponovno postane `visible` (povratak iz kamere) → 500 ms prozor u kojem se ignorira `popstate` koji nije zatvorio nijedan dialog

Ovo štiti **sve buduće dialoge** koji otvaraju nativne plugine (kamera, file picker, share), ne samo `AddExpenseDialog`.

## Što se NE dira
- Nativni Capacitor sloj → **bez `cap sync`, bez novog APK-a, bez `git pull`**
- `useNativeCamera`, `useReceiptScanner`, `parse-receipt` edge funkcija
- Push notifikacije i `usePushNotifications` (potvrđeno: nemaju veze)
- Bilo što izvan ova 2 file-a

## Kako ću potvrditi popravak
Nakon izmjene, ti probaš jednom snimiti račun. Ja u sljedećoj poruci provjerim u tvojim console logovima:
- **prije**: `[BackButton] route changed: /home` se pojavljivao baš pri povratku iz kamere
- **poslije**: te promjene rute više nema; umjesto toga vidi se `📤 Sending to processImageBase64` → 17 s pauze → `ScannedDataPreview` se pokaže

Ako se ipak ne pokaže, imam točan dijagnostički trag i znamo da problem više nije u routeru.

## Zašto nismo prije našli ovo
Prošla 3 plana su gledali samo `AddExpenseDialog` i `useNativeCamera`. Bug je bio u **trećem mjestu** (`BackButtonContext`) koje je dodano u istoj rundi kad i push notifikacije, pa je djelovalo povezano. Kad se ova izmjena napravi, popravak je trajan i pokriva sve buduće dialoge koji koriste nativne plugine.
