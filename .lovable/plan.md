
# Plan: PDF "Što popraviti da svaka ocjena bude 9+"

## Što ću napraviti
Generirati jedan PDF (`/mnt/documents/vmbalance_ocjene_9plus.pdf`) na hrvatskom, laičkim jezikom, u Teal brandingu aplikacije. Bez tehničkog žargona; gdje je termin nužan, kratko objašnjenje u zagradi.

## Struktura dokumenta

**Naslovnica**
- Naslov, datum, kratki sažetak u 3 rečenice.

**Stranica s pregledom (tablica)**
- 10 područja, trenutna ocjena → ciljna ocjena 9, jedna rečenica "glavna prepreka".

**Po jedno poglavlje za svako područje** (10 poglavlja, ~1 stranica):
1. Produkt / UX — sad 7.5
2. Frontend (sučelje) — sad 7
3. Backend i baza — sad 7
4. Sigurnost — sad 7.5
5. Brzina — sad 6.5
6. Mobilna aplikacija — sad 8
7. Prijevodi i pristupačnost — sad 7
8. Testiranje / kvaliteta — sad 5
9. Naplata (Pro/Business) — sad 6
10. AI funkcije — sad 7

Svako poglavlje ima isti format:
- **Što je dobro danas** (2-3 rečenice)
- **Zašto nije 9** (laički, konkretno)
- **Konkretni koraci do 9** (numerirana lista, 3-5 stavki, svaka 1 rečenica + procjena truda: mali / srednji / veliki)
- **Kako ćeš znati da je 9** (1 mjerljiv kriterij)

**Završna stranica — "Prvih 5 koraka ako kreneš sutra"**
Prioritizirani redoslijed (push → onboarding → testovi → EU PDV → bundle).

## Tehnika izvedbe
- Python `reportlab` (Platypus), font Helvetica/Arial, naslovi teal `#22A39A`.
- Tablica preglede s obojenim ćelijama ovisno o jazu.
- Footer s brojem stranice.
- Nakon generiranja: `pdftoppm` render svih stranica → vizualna QA (overlap, cut-off, prazni naslovi) → fix → ponoviti dok ne bude čisto.
- Predati kroz `<presentation-artifact>`.

## Što NEĆU u dokumentu
- Imena datoteka, SQL, edge function nazivi, RLS detalji.
- Marketinški jezik, emoji u tijelu (samo 🔴🟡🟢 za status u tablici).
- Procjene sati u danima — samo "mali / srednji / veliki" trud.
