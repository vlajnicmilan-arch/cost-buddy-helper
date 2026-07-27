
# Dijagnoza — Erste "Tekući" pokazuje 0,00 umjesto -3,00

**SAMO dijagnoza. Ništa nije mijenjano. Odluka je Milanova.**

## Ukratko

Nesklad nastaje pri **kreiranju novog novčanika kroz "poveži račun"**, ne u sync-u i ne u prikazu. `bank-link-account` INSERTa novi `custom_payment_sources` red **bez `balance` polja** → default 0. Trigger `_cps_autoseed_anchor` odmah postavi sidro na **`correction_anchor_balance = 0.00`**. Nakon toga sve što bank sync ubaci u transakcije **je datirano PRIJE sidra** (tx-ovi iz 04.–07. mj., sidro 27.07. 19:08), pa recompute vidi 0 post-anchor prometa → prikazuje 0,00.

Wallet čita `custom_payment_sources.balance`. `bank_accounts.balance = -3,00` **ne završava nigdje u tom lancu**.

## Dokazi iz baze

**bank_accounts** (relevantni red):
- `277b375d…` IBAN `HR47…4976` EUR, `balance = -3,00`, `linked_payment_source_id = d28bc2f5…` (Tekući). Zadnji update 19:09:12.

**custom_payment_sources** (novi red):
- `d28bc2f5… "Tekući"`, `balance = 0,00`, `correction_anchor_date = 2026-07-27 19:08:34`, `correction_anchor_balance = 0,00`. Kreiran 19:08:34.

**anchor_audit** (jedini zapis za taj source):
- `system_initial`, "Auto-seed pri kreiranju novčanika", `new_anchor_balance = 0.00`, 19:08:34. **Nema drugih zapisa**, tj. nijedan naknadan reconciliation nije pokušan.

**Trigger `_cps_autoseed_anchor`** (živa definicija):
```
IF NEW.correction_anchor_date IS NULL THEN
  NEW.correction_anchor_date    := NEW.created_at;
  NEW.correction_anchor_balance := COALESCE(NEW.balance, 0);
  NEW.anchor_source             := 'system_initial';
END IF;
```
INSERT je došao bez `balance` → `COALESCE(NULL,0) = 0` → sidro 0.

**`bank-link-account/index.ts` `create_new` grana** (linije 75–86): INSERTa `{ user_id, name, currency, business_profile_id, sort_order }`. **Ne postavlja `balance`, ne postavlja `correction_anchor_*`.** Balans banke se ovdje ne prosljeđuje.

**Expenses povezani na taj source** (14 redova, svi PRIJE sidra 27.07. 19:08):
- Većinom parovi income+expense istog iznosa (neto 0).
- Jedini "solo" red je income +3,00 od 27.07. 10:00. Njegov `date = 2026-07-27` je **jednak** danu sidra → recompute reže striktnim `>` (day cut / hybrid) → isključen.
- Ni jedan post-anchor red → `recompute` vraća `anchor_balance + 0 = 0,00`. Točno kako se prikazuje.

Napomena: kad bi sidro bilo dovoljno rano da uhvati svih 14 redova, zbroj bi bio **+3,00**, ne -3,00 (parni parovi + solo +3). Znači i "pomak sidra unazad" **ne bi** sam po sebi reproducirao -3. Realan bank saldo -3 nije potpuno pokriven zapisanim tx-ovima; sinkronizirano je najvjerojatnije samo posljednjih ~90 dana, ranija povijest nedostaje.

## Odgovori na 5 pitanja

1. **Sidro postoji**, `system_initial`, 27.07. 19:08:34, vrijednost **0,00** (ne -3,00). Kreiran ga je autoseed trigger u istoj INSERT transakciji.

2. **Bank-sync i bank-link-account ne prosljeđuju bank saldo u payment source.** `bank-sync-transactions` ažurira samo `bank_accounts.balance`. `bank-link-account.create_new` kreira `custom_payment_sources` s defaultima; balans/sidro nikad ne postavlja iz `bank_accounts.balance`.

3. **Nema clampa na nulu.** Ostali Milanovi novčanici drže negative bez problema (-186.38, -535.60, -1077.07, -77.48). Balance triggeri (`_cps_balance_guard_*`, `_expenses_recompute_source_balance`) ne clampaju.

4. **Wallet čita `custom_payment_sources.balance`** (0,00), ne `bank_accounts.balance` (-3,00). Nesklad je stvaran i sistemski: dvije tablice, jedan smjer sinkronizacije (Enable Banking → `bank_accounts`), nijedan smjer prema `custom_payment_sources.balance` osim ručnog "Poravnaj s bankom" (align_source_to_bank) i user set_source_anchor.

5. **Dodavanje drugog računa NIJE poremetilo sidro prvog.** "Tekući zaštićeni" (99f9425d, IBAN 6624…5267) i dalje ima svoje sidro iz 07.07., nepromijenjeno. `anchor_audit` za taj source ne pokazuje nikakav zapis nakon Faza 1 backfilla 22.07. Novi anchor 27.07. 19:08 pripada isključivo **novom** source-u d28bc2f5. Nema koliziji između sidara — svaki novčanik ima svoje.

## Hipoteza / gdje je saldo postao 0

- **Root cause:** `bank-link-account` `create_new` grana + `_cps_autoseed_anchor` trigger zajedno garantiraju da svaki novčanik nastao klikom "poveži i stvori novi" starta sa **balance = 0 i sidrom 0**, neovisno o tome što banka javlja kao stvarni saldo tog IBAN-a.
- **Zašto -3 nikad ne stigne u UI:** poznati bankin saldo živi u `bank_accounts.balance` i nema mehanizma koji ga pri linkanju kopira u novi source niti postavlja odgovarajuće sidro. Ručni "Poravnaj s bankom" (`align_source_to_bank`) je jedini put — nije pokrenut (nema `bank_reconciliation` zapisa u auditu za d28bc2f5).
- **Sekundarno:** čak i da recompute uhvati sve tx-ove, iznos bi bio +3 (ne -3) jer sinkronizirana povijest nije dovoljno duboka. Bez oslanjanja na bankin saldo pri linkanju, saldo se ne može ispravno rekonstruirati iz samih transakcija.

## Značajno usput

- `bank_accounts` sadrži **duplikate istog IBAN-a s različitim valutama** (HR41…6997 postoji i kao EUR i kao HRK; HR47…4976 postoji i kao EUR i kao HRK). To je artefakt Enable Banking "multi-currency subaccount" modela. Prilikom linkanja treba paziti da se veže **EUR** subaccount (ovdje je Milan spojio ispravan EUR red 277b375d…, ne HRK aa1fce2a…).
- Tri od pet Milanovih bank_accounts redova (dva HRK i jedan EUR HR41…6997) **nisu linkani** ni na jedan payment source. To je zasebno pitanje, ne uzrok trenutnog -3 vs 0 nesklada.

## Što NIJE uzrok

- Nije clamp na 0.
- Nije trigger koji tretira negative kao grešku.
- Nije "drugi račun je pojeo sidro prvog".
- Nije bug u prikazu — komponenta prikazuje točno ono što `custom_payment_sources.balance` sadrži.

Čekam Milanovu odluku o smjeru — više opcija je moguće (autoseed iz bank_accounts.balance pri link-anju, ili obavezno predlaganje "Poravnaj s bankom" odmah nakon linkanja, ili nešto treće). Ništa se ne mijenja bez odobrenja.
