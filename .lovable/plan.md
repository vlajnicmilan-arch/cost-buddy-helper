
# Faza 2 — Projects Cleanup: Korigirana Prioritizacija

Korekcija prema korisničkom prigovoru: #1 + #2 nisu kandidati za FIX NOW jer su strukturalni i međusobno ovisni; spuštaju se u NEXT WAVE. #11 se izdvaja u samostalan polish u FIX NOW.

---

## FIX NOW

### #5 Delete affordance
- **Kategorija**: polish-M, samostalan zahvat
- **Dobitak 6 · Rizik 2 · ROI 9**
- **Zašto sada**: brzi win, izoliran, gradi povjerenje korisnika ("ne mogu obrisati projekt" je čest signal).

### #3 Budget duplikacija
- **Kategorija**: srednji UX cleanup
- **Dobitak 8 · Rizik 3 · ROI 9**
- **Zašto sada**: ne dira računice, samo presentation. Čisti teren za #4 u NEXT WAVE.

### #11 Header actions cleanup (samostalno)
- **Kategorija**: polish-S, izolirano od #1
- **Dobitak 6 · Rizik 2 · ROI 7**
- **Zašto sada**: 7 akcija + 7-stavki dropdown može se reducirati i bez Lite/Full unifikacije (grupiranje, uklanjanje duplih ulaza). Ne dira navigaciju tabova.
- **Napomena**: kad #1 dođe na red u NEXT WAVE, header će se možda dodatno doraditi — to je prihvatljivo, ovaj polish nije bačeni rad.

---

## NEXT WAVE

### #1 Lite vs Full unifikacija (REDIZAJN)
- **Dobitak 9 · Rizik 6 · ROI 9 · Veličina L**
- **Zašto NEXT WAVE**: najveći strukturalni zahvat, povlači #2 i dio #16. Treba dizajn-prolaz prije implementacije.

### #2 Trostepena navigacija (REDIZAJN, zajedno s #1)
- **Dobitak 8 · Rizik 5 · ROI 8 · Veličina L**
- **Ovisnost**: ide u istom potezu kao #1, ne parcijalno.

### #4 Overview hijerarhija (DORADA)
- **Dobitak 7 · Rizik 4 · ROI 7 · Veličina M**
- **Ovisnost**: dolazi nakon #3 (kanonski budget broj već postoji).

---

## LATER
- #8 Complete wizard skraćivanje (D5/R4/ROI5, M)
- #9 Team labeling polish (D5/R2/ROI6, S) — ovisi o #1+#2
- #10 QuickStartCards affordance (D5/R3/ROI6, S)
- #12 Migrate Personal→Business vidljivost (D4/R3/ROI5, S)
- #14 Project list filteri (D4/R3/ROI5, M)
- #15 Phases view switcher (D4/R4/ROI4, M)

---

## LEAVE AS-IS / STOP DIRATI
- **#6 Reports kao dialog** — LEAVE AS-IS (dialog je svjesna odluka, pretvaranje u tab donosi rizik bez koristi)
- **#7 Dynamic worklog tab** — STOP DIRATI (progressive disclosure radi kako treba)
- **#13 `resolvedActiveTab` legacy mapping** — LEAVE AS-IS (tech debt bez korisničkog utjecaja)
- **#16 Lite "More" sheet leftover** — rješava se kroz #1, ne dirati zasebno

---

## TOP 3 FIX NOW
1. **#5 Delete affordance**
2. **#3 Budget duplikacija**
3. **#11 Header actions cleanup**

## TOP 3 NEXT WAVE
1. **#1 Lite vs Full unifikacija** (s #2 u istom potezu)
2. **#2 Trostepena navigacija** (zajedno s #1)
3. **#4 Overview hijerarhija** (nakon #3)

## Preporučeni redoslijed izvedbe

```text
Wave 1 (FIX NOW):
  1. #5 Delete affordance         ← najbrži, izoliran
  2. #3 Budget duplikacija         ← priprema teren za #4
  3. #11 Header actions cleanup    ← samostalan polish

Wave 2 (NEXT WAVE):
  4. #1 + #2 + #16 zajedno         ← jedan strukturni potez,
                                     ne razdvajati (visok rizik
                                     regresije ako se radi parcijalno)
  5. #4 Overview hijerarhija       ← ovisi o #3 (već gotovo)

Later (signal-driven):
  6. #8 Complete wizard
  7. #9 Team labeling polish       ← tek nakon #1+#2
  8. #10 QuickStartCards
  9. #12 Migrate vidljivost
  10. #14 Project list filteri
  11. #15 Phases view switcher

Ne dirati:
  - #6 Reports dialog
  - #7 Dynamic worklog
  - #13 resolvedActiveTab
```

## Eksplicitne ovisnosti
- **#2 + #16 ovise o #1** → ide kao jedan zahvat u NEXT WAVE.
- **#4 ovisi o #3** → #3 je u FIX NOW, #4 u NEXT WAVE prirodno slijedi.
- **#9 ovisi o #1 + #2** → ostaje u Later dok navigacija nije unificirana.
- **#11 NE ovisi o #1** → može samostalno u FIX NOW; manji touch-up nakon #1 je prihvatljiv.
