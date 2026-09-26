---
name: Mail lijevak — čuvari klasifikacije (rujan 2026)
description: Poznat OIB nije presuda, vlastiti OIB nikad dobavljač, obavijesti bez privitka nije_za_nas, izlazni račun, jedan dokument = jedna stavka
type: feature
---
- Vlastiti OIB-ovi (business_profiles) nikad u `knownOibs` i nikad `supplier_oib` (classifyDocument + memoryFill). incoming_invoices ima vlastiti OIB kao dobavljača — zapisi se ne diraju.
- Poznat OIB = dokaz izdavatelja. Heuristika sama kaže `racun` samo uz `carriesInvoiceSignal`; inače AI. AI `ponuda`/`nije_za_nas` se ne gazi (osim korisnikove odluke ili izvod-sumnje).
- Obavijest bez privitka → `nije_za_nas`: Paddle/FINA primitak/subscription paused = `obavijest_platforme`; George/NetBanking = `obavijest_o_transakciji` (`notificationSignals.ts`).
- Izlazni račun (prvi OIB vlastiti, iza oznake kupca tuđi OIB; UBL s vlastitim dobavljačem) → classification `izlazni_racun`, status `nije_za_nas`, razlog `izlazni_racun`.
- Privici iste ponude iste poruke → `related_item_id` + `is_offer_attachment`; značka ne broji retke s `related_item_id`.
- Confidence obaranje za T4 ostaje (odluka vlasnika).
- Pad klasifikacije → `app_diagnostics_logs` event `mail_classification_failed` (code, message, build).
