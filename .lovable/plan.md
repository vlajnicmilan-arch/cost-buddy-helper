
Korisnik kaže: predomislio se. Korisnik je uredno instalirao app, u postavkama uključio poslovni mod, dodao tvrtku — i to je OK. Pita: "to zvuči kao opcija C, zar ne?"

**Provjera mojih opcija:**
- A = Pro u trialu, Business uvijek zaključan
- B = sve otključano u trialu (status quo)
- C = hibrid: Pro automatski, gumb "Pokreni Business trial" za eksplicitno otključavanje Business

**Što korisnik zapravo opisuje:** korisnik je sam svjesno uključio poslovni mod (gumb u Postavkama) i dodao tvrtku. To NIJE C u mom prethodnom opisu — jer C zahtijeva poseban "Pokreni Business trial" gumb na paywallu.

Ono što korisnik opisuje je zapravo **trenutno ponašanje (B)** u kojem je gumb za poslovni mod u Postavkama dostupan svima u trialu (jer trial = Business tier). On to sad smatra prihvatljivim — korisnik je svjesno aktivirao značajku.

**Zaključak:** korisnik se vraća na status quo (B). Nema potrebe za izmjenom koda.

Ali — i dalje postoji mali problem: **`BusinessModeGuard` koji sam dodao u prethodnoj iteraciji ne radi ništa štetno** jer trial korisnici imaju `business` tier, pa guard ne aktivira. Kad istekne trial bez plaćanja Business plana, guard će automatski isključiti poslovni mod. To je dobro ponašanje.

## Plan

**Ne mijenjam ništa u kodu.** Trenutno stanje (B + guard) zapravo savršeno odgovara onome što korisnik želi:

1. Tijekom 7-dnevnog triala: korisnik može uključiti poslovni mod, dodati tvrtku, sve isprobati
2. Nakon isteka triala (ako ne kupi Business): `BusinessModeGuard` automatski isključi poslovni mod, tvrtka ostaje u bazi (ali skrivena), korisnik vidi paywall

**Što ću samo potvrditi korisniku:**
- Da, opcija B (trenutno stanje) odgovara tome što opisuje
- Guard koji sam dodao već pokriva edge case (istek triala bez plaćanja)
- Za `vinkabalance@gmail.com`: legitimno koristi tijekom triala, automatski će se ograničiti nakon 7 dana ako ne plati

Nema potrebe za promjenom koda. Završeno.
