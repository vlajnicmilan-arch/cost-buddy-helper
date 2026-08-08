# Nalaz: pozivnice u Krug padaju — stara verzija edge funkcije

## Potvrđeno iz logova (bez izmjena)

Runtime log `krug-add-member`, danas 8.8. u 09:04:36, 09:04:42, 09:05:38 i 09:09:06 UTC (11:04–11:09 lokalno) — četiri pokušaja, sva četiri ista greška:

```text
[KRUG-ADD-MEMBER] insert error {
  code: "23514",
  message: "krug_membership_requires_invitation: clanstvo u krugu moze nastati samo iz prihvacene pozivnice"
}
```

Što ovo dokazuje:

1. Poruka `[KRUG-ADD-MEMBER] insert error` postoji samo u STAROJ verziji funkcije. Nova verzija u izvoru loga `ownership error`, `find_user_by_email error`, `membership lookup error`, `invitation lookup error`, `invitation insert error`, `notify result` — nijedna od tih poruka nije u logu.
2. Greška 23514 je CHECK/okidač `krug_require_consent` nad `krug_membership`. Znači funkcija je pokušala upisati ČLANSTVO, a ne pozivnicu.
3. `krug_invitations` ima 0 redaka — potvrda da nova grana koda nikad nije izvršena.
4. `notify-krug-event` za isto vrijeme ima samo `shutdown` zapise — nikad nije pozvan, jer stara verzija pada prije notifikacije.

Sumnja je dakle potvrđena: **frontend je nov, baza je nova, deployana edge funkcija je stara.** Čuvar na bazi radi točno ono za što je napisan — blokira upis članstva bez pristanka. Generička poruka „Greška pri dodavanju člana." dolazi jer stara funkcija vraća `insert_failed`, kod koji UI mapira u generičku poruku.

## Što nije uzrok

- Nije `find_user_by_email` — funkcija je došla do inserta, dakle lookup je prošao.
- Nije RLS na `krug_invitations` — do te tablice se uopće nije došlo.
- Nije `krug_ownership` — owner check je prošao.
- Nije bug u novom kodu — novi kod nije izvršen.

## Što bi popravak zahtijevao (NIJE izvedeno)

Jedini korak: **redeploy funkcije `krug-add-member`** iz aktualnog izvora (`supabase/functions/krug-add-member/index.ts`), koji već piše u `krug_invitations`. Bez izmjene koda, sheme ni konfiguracije.

Provjera nakon redeploya:
1. Ponoviti poziv iz UI-a na krug „Test".
2. U logu očekivati odsutnost `insert error` i prisutnost `notify result`.
3. `select count(*) from krug_invitations` → 1 redak, status `pending`.
4. Kod pozvanog korisnika inbox pozivnica prikazuje poziv; prihvat stvara članstvo.

Ako se nakon redeploya i dalje pojavi `[KRUG-ADD-MEMBER] insert error` (točno taj tekst), znači da deploy nije uhvatio novu verziju i to je platformski problem, ne kod.

## Odluka

Reci „redeploy" i pokrećem samo taj korak, ništa drugo.
