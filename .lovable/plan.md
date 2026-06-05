## Cilj

Povećati vizualni "gap" između 4 segmenta u `KrugBrandIcon` tako da odgovara referentnoj slici (jasno prekinut krug, kratki lukovi s velikim razmacima).

## Trenutno stanje

`src/components/krug/KrugBrandIcon.tsx`: arc 80°, gap 10° → segmenti se gotovo dodiruju.

## Izmjena

Samo `src/components/krug/KrugBrandIcon.tsx`:

- `ARC_LEN`: 80° → **60°** (kraći luk)
- Gap između segmenata: 10° → **30°** (vidljivo razmaknuti, kao na slici)
- Rekalibracija `rotate` vrijednosti tako da centri lukova ostaju na 45°/135°/225°/315° (sredina = rotate + 30°):
  - Krug (narančasta, bottom-right): `5` → `15`
  - Budžeti (ljubičasta, bottom-left): `95` → `105`
  - Projekti (plava, top-left): `185` → `195`
  - Novčanik (zelena, top-right): `-85` → `-75`
- `strokeLinecap="round"` ostaje (zaobljeni krajevi kao na slici)
- `strokeWidth="2.5"` ostaje

## Out of scope

Boje, redoslijed, veličine, ostali ekrani. Samo geometrija lukova u jednoj komponenti.
