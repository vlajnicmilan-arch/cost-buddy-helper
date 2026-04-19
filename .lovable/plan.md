

## Plan: Oznaka "Dijeljeno" na karticama računa

### Cilj
Dodati vizualnu oznaku (badge) "Dijeljeno" na svaki račun u Novčaniku koji je dijeljen s drugim korisnicima — bilo da ga **ja dijelim s drugima** (vlasnik) ili je **netko drugi podijelio sa mnom** (član).

### Gdje se prikazuje
1. **Novčanik** — kartice u `CustomPaymentSourcesPanel`
2. **Početna (Dashboard)** — kartice u `PaymentSourcesSection` (collapsible "Financije")

### Logika prepoznavanja
Račun je "dijeljen" ako:
- ja sam vlasnik i račun ima barem jednog člana u `payment_source_members`, ILI
- ja nisam vlasnik (`source.user_id !== currentUser.id`) → znači netko ga je podijelio sa mnom

`useCustomPaymentSources` već razlikuje `ownedPaymentSources` i `sharedPaymentSources`, pa za drugi slučaj već imam podatak. Za prvi slučaj (ja dijelim s drugima) dohvatit ću broj članova po `payment_source_id` u istom hooku i izložiti `memberCount` polje.

### Vizualno
Mali badge u gornjem desnom kutu kartice ili pored imena računa:
- ikona `Users` (Lucide) + tekst "Dijeljeno"
- diskretna boja (muted/secondary), ne smije nadjačati boju računa
- na hover/tap tooltip: "Vlasnik: X" ili "Dijelite s N osoba"

### i18n ključevi (HR/EN/DE)
- `paymentSources.shared` → "Dijeljeno" / "Shared" / "Geteilt"
- `paymentSources.sharedByYou` → "Dijelite s {{count}} osoba"
- `paymentSources.sharedWithYou` → "Dijeli: {{owner}}"

### Datoteke
- **Izmjena**: `src/hooks/useCustomPaymentSources.ts` — dodati `memberCount` i `isOwned` na svaki source
- **Izmjena**: `src/components/custom-payment-sources/CustomPaymentSourcesPanel.tsx` — prikaz badge-a
- **Izmjena**: `src/components/home/PaymentSourcesSection.tsx` — prikaz badge-a
- **Izmjena**: `src/i18n/locales/hr.json`, `en.json`, `de.json` — novi ključevi

### Što NE diram
- RLS politike, balance logiku, vidljivost transakcija
- `payment_source_members` tablicu i invitation flow
- Selector u dijalogu za dodavanje transakcije

