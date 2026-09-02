# Popravak dijaloga kupnje i naziva modula

## Opseg

1. **ModuleUpgradeDialog**
   - Presložiti podnožje tako da se tri radnje nikad ne stišću izvan širine dijaloga.
   - Na uskim i srednjim širinama koristiti stabilan raspored u više redova/punu širinu; glavna radnja „Otključaj …” ostaje vizualno primarna i potpuno vidljiva.
   - Ne mijenjati ponašanje gumba, trial ni prava pristupa.

2. **Poruka ograničenja novčanika**
   - Zadržati ključ `errors.limits.paymentSources`.
   - Zamijeniti samo vrijednosti u HR/EN/DE katalozima:
     - HR: „Dosegnuli ste ograničenje. Za više novčanika potreban je modul Smjer.”
     - EN i DE: smislen, izravan prijevod iste poruke bez spomena nepostojećeg plana.
   - U `useCustomPaymentSources` uskladiti hrvatski fallback s novom odobrenom porukom.

3. **Inventura starih naziva planova — bez izmjena**
   - Pretražiti korisnički vidljive tekstove u HR/EN/DE katalozima, `UpgradePrompt`, sve njegove pozivatelje preko `requiredTier`/`getRequiredTier`, poruke limita i `/paywall`.
   - Odvojiti stvarne nazive starih/nepostojećih planova od obične riječi „business” koja opisuje poslovni način rada, te prijaviti samo relevantne korisničke tekstove.
   - Za svaki nalaz navesti datoteku, redak ili i18n ključ i doslovni prikazani tekst; ništa iz tog popisa ne mijenjati.

## Provjera

- Pokrenuti ciljane testove/i18n provjere povezane s izmijenjenim datotekama.
- Otvoriti stvarni `ModuleUpgradeDialog` u pregledniku i snimiti/provjeriti širine viewporta **360 px, 570 px i 900 px**.
- Na svakoj širini provjeriti da su sva tri gumba unutar dijaloga, da tekst nije odrezan i da je „Otključaj …” jasno vidljiv kao glavna radnja.
- Završno prijaviti raspored na svakoj širini, tri nova prijevoda i inventuru iz točke C.
