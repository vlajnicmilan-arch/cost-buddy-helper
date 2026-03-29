

## Plan: Sustav ponašanja AI Ghost Avatara

Trenutno avatar reagira samo na jedan event — dodavanje prihoda (`happy` + poruka). Cilj je definirati kompletnu mapu ponašanja i implementirati triggere po cijeloj aplikaciji.

### Mapa ponašanja po akcijama korisnika

```text
AKCIJA KORISNIKA              → MOOD      PORUKA (primjer)
─────────────────────────────────────────────────────────────────
Dodavanje rashoda              → neutral   "Zapisano! 📝"
Dodavanje prihoda              → happy     "Super! Novi prihod! 💰"
Veliki rashod (>50% budžeta)   → worried   "Hmm, to je velik izdatak... 😰"
Probijen budžet                → worried   "Budžet je premašen! ⚠️"
Cilj štednje dostignut         → proud     "Bravo! Cilj ostvaren! 🎉"
Dodavanje u štednju            → happy     "Sjajno, štedeš! 🐷"
CSV import završen             → happy     "Uvezeno! Sve je tu 📊"
Brisanje transakcije           → thinking  "Uklonjeno... 🗑️"
Prazna lista (nema troškova)   → thinking  "Hmm, mirno je ovdje... 🤔"
Otvaranje AI asistenta         → thinking  "Razmišljam... 🧠"
Primljen odgovor asistenta     → happy     "Evo, pogledaj! 💡"
Greška (API/save fail)         → worried   "Ups, nešto nije u redu 😟"
Uspješan backup/restore        → proud     "Podatci su sigurni! 🔒"
Pokretanje aplikacije (jutro)  → happy     "Dobro jutro! ☀️"
Pokretanje (večer)             → neutral   "Dobra večer! 🌙"
Neaktivnost >30s               → neutral   (bez poruke, vraća se u idle)
Postavljanje PIN-a             → proud     "Zaštićeno! 🛡️"
Kreiranje projekta             → happy     "Novi projekt, nove prilike! 🚀"
Dodavanje člana obitelji       → happy     "Obitelj raste! 👨‍👩‍👧"
```

### Promjene datoteka

| Datoteka | Promjena |
|---|---|
| `src/hooks/useExpenseCRUD.ts` | Dodati `emitAvatarEvent` za rashode, velike rashode, brisanje |
| `src/hooks/useBudgetAlerts.ts` | Emitirati `worried` kad je budžet probijen |
| `src/hooks/useSavingsGoals.ts` | Emitirati `happy` za dodavanje, `proud` za dostignut cilj |
| `src/components/CSVImportDialog.tsx` | Emitirati `happy` nakon uspješnog importa |
| `src/components/FinancialAssistantDialog.tsx` | Emitirati `thinking` pri otvaranju, `happy` pri odgovoru |
| `src/components/BackupRestore.tsx` | Emitirati `proud` nakon uspješnog backup/restore |
| `src/components/SetPinDialog.tsx` | Emitirati `proud` kad se PIN postavi |
| `src/hooks/useProjects.ts` | Emitirati `happy` pri kreiranju projekta |
| `src/hooks/useFamilyGroups.ts` | Emitirati `happy` pri dodavanju člana |
| `src/components/ai-avatar/FloatingAIAvatar.tsx` | Dodati greeting logiku (jutro/večer) pri prvom renderiranju |
| `src/components/ErrorBoundary.tsx` | Emitirati `worried` kad se uhvati greška |

### Greeting logika (FloatingAIAvatar ili hook)

```text
Sat 5-12  → happy  + "Dobro jutro! ☀️"
Sat 12-18 → neutral + "Dobar dan! 👋"
Sat 18-22 → neutral + "Dobra večer! 🌙"
Sat 22-5  → thinking + "Kasno je... 🌜"
```

Pokreće se jednom pri mount-u s 2s odgodom (da se avatar prvo renderira).

### Tehnički detalji

- Svi triggeri koriste postojeći `emitAvatarEvent(mood, message)` iz `useAppState()`
- Poruke su na hrvatskom (lokalizirane)
- Mood se automatski vraća na `neutral` nakon 3s (već implementirano u `useAvatarMood`)
- Za detekciju "velikog rashoda" — usporedba s dnevnim budžetom ili fiksni prag (npr. >500 kn ili >50% budžeta)
- Nema novih komponenti, samo pozivi `emitAvatarEvent` na pravim mjestima

