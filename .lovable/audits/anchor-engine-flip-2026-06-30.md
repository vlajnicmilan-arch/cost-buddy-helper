# Anchor engine flip — pre/post snapshot

Flip: `anchor_engine_mode: day_cut → hybrid`
Snapshot at: 2026-06-30 21:01:48 UTC (pre-flip)

## Pre-flip (day_cut active)

| source | source_id | stored | preview_day_cut | preview_hybrid | diff_day_cut | diff_hybrid |
|---|---|---:|---:|---:|---:|---:|
| Aircash | 0716b12f… | -4.17 | -4.17 | -4.17 | 0.00 | 0.00 |
| Gotovina | fbb2778b… | 956.70 | 711.20 | 711.20 | **245.50** | 245.50 |
| Keks | 5d06600b… | 6.89 | 6.89 | 6.89 | 0.00 | 0.00 |
| Keš | d624d010… | 9104.15 | 6437.31 | 6429.84 | **2666.84** | **2674.31** |
| OTP racun | 8f922feb… | 1646.62 | -518.65 | -518.65 | **2165.27** | 2165.27 |
| Revolut | 4934f97e… | 20.00 | 20.00 | 20.00 | 0.00 | 0.00 |
| Tekući fizička | ced43ff2… | 5.65 | 5.65 | 5.65 | 0.00 | 0.00 |
| Tekući zaštićeni | 99f9425d… | 432.72 | 432.72 | 432.72 | 0.00 | 0.00 |

## Notes
- 5/8 sourceova: hybrid ≡ day_cut (nema C1/C2 same-day-after) → flip neutralan.
- 3/8 sourceova: pre-existing legacy drift, dokumentirano u prethodnim passovima.
- Keš: jedini source gdje hybrid != day_cut → -7.47 razlika (C1 red `4e9e82bb…`).
