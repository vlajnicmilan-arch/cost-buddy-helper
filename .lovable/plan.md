# Continuity & Billing State Machine — Mini-patch v1.3.1

Bez novog scope-a. Samo dva preciziranja na v1.3.

---

## Patch 1 — O-B zaključan

Reaktivacija iz `read_only` više nije otvoreno pitanje.

Zaključano:

- Ako bilo koji član obnovi pretplatu Kruga **unutar 30-dnevnog `read_only` prozora**, Krug se vraća u `active`.
- Sva metadata i veze Kruga ostaju netaknute (jer još nije nastupio `deleted`).
- Nakon isteka 30 dana `read_only` bez plaćanja → `deleted` je terminalno; reaktivacija više nije moguća.

Posljedica u tranzicijskoj tablici: red `read_only → active (reaktivacija unutar 30 dana)` više nije označen kao O-B, nego kao zaključana tranzicija.

---

## Patch 2 — Login ownera djeluje samo na inactivity grani

Preciziranje već postojećeg prioriteta billinga.

Zaključano:

- **Inactivity grana:** owner autentificirana sesija → `early_signal → active` (i prekida odbrojavanje prema continuity).
- **Billing grana:** ako je Krug u `ugrožen` zbog pretplate, sam login ownera **ne** vraća Krug u `active`.
  - Iz `ugrožen` u `active` vode isključivo:
    - obnova pretplate Kruga, ili
    - takeover od strane nasljednika s aktivnom pretplatom.
- Ako su istovremeno prisutni i inactivity i billing problem, glavno stanje je `ugrožen` (po v1.3 prioritetu); ownerov login u tom slučaju može samo ukloniti inactivity kao sekundarni signal, ali ne mijenja glavno stanje dok se billing ne riješi.

---

## Što ostaje otvoreno

Samo:

- **O-A** — sadržaj takeover uvjeta.

O-B je ovim patchem zatvoren.

---

Reci "prihvaćam v1.3.1" pa idemo na sljedeći dokument.