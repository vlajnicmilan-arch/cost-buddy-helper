# Stabilizacija dohvata velikog broja transakcija

## Plan
1. Odvojiti rokove: 90 s za cijeli dohvat transakcija i 30 s za ostale dohvate Početne, bez promjene spremanja.
2. Preurediti straničenje transakcija tako da najviše dvije stranice rade paralelno, a prolazni pad ponavlja samo palu stranicu i zadržava već dohvaćene retke.
3. Uvesti zajedničko spajanje istovremenih dohvata po imenu: drugi poziv dobiva postojeće obećanje umjesto novog mrežnog zahtjeva.
4. Osigurati da se trajna ili sesijska snimka primijeni prije mrežnog osvježavanja i ostane prikazana nakon pada.
5. Zatvoriti stanje žute trake na uspjehu i konačnom padu te dodati mjerenje svake stranice.
6. Dodati ciljane regresijske testove i pokrenuti cijeli paket testova te provjeru tipova.

## Tehnički detalji
- Jedan `AbortController` obuhvaća cijeli logički dohvat transakcija.
- Nastavak se vodi po indeksu stranice; uspješne stranice se ne dohvaćaju ponovno.
- Postojeći auth/refresh put, spremanje troška, izračun salda, QueryClient i stupci liste ostaju netaknuti.
- Ne objavljuje se aplikacija.
