Utvrđeno iz dijagnostike: gumb Skeniraj normalno otvori kameru i pošalje sliku, ali zadnji pokušaji padaju u nativnom HTTP pozivu prema AI obradi s greškama `timeout` i `Software caused connection abort`. Zato se nakon analize ne prikaže ekran potvrde skeniranih podataka nego ostane/vrati se ručni obrazac. Raniji pokušaji istog toka su prolazili i prikazivali `ScannedDataPreview`, pa problem nije u samom gumbu nego u robusnosti nativnog poziva/oporavka nakon prekida veze.

Plan:
1. Popraviti `useReceiptScanner` da nativni HTTP poziv ima pouzdan fallback: ako `CapacitorHttp.post` pukne zbog `timeout`, `connection abort` ili slične mrežne greške, isti payload se pokuša poslati standardnim `fetch` pozivom prije nego korisniku prikaže grešku.
2. Produžiti realni timeout nativnog poziva tako da bude usklađen s backend AI timeoutom i mogućim retryjem, jer trenutnih 60s može pasti prije nego backend završi.
3. Dodati jasne dijagnostičke evente za fallback (`native_http_fallback_start`, `fallback_done`, `fallback_failed`) kako bismo sljedeći put točno vidjeli je li spašeno fallbackom ili stvarno pada backend.
4. U slučaju konačnog pada ne ostavljati dojam da je “analiza završila”; prikazati postojeću lokaliziranu grešku i zadržati ručni unos samo kao fallback bez gubitka slike/podataka.
5. Provjeriti postoje li hardcoded poruke u zahvaćenom toku i ne uvoditi nove; po potrebi koristiti postojeće i18n ključeve.

Tehnički opseg:
- Primarno `src/hooks/useReceiptScanner.ts`.
- Bez promjene baze.
- Bez dupliciranja scanner logike.
- Bez diranja generiranih Cloud/Supabase client/types datoteka.