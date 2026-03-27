

# AI Asistent: Pamćenje razgovora (Opcija 3 — Sažeci + kratka povijest)

## Pregled
Dodati sustav pamćenja razgovora koji kombinira kratku povijest poruka (zadnjih 30) i dugotrajne "memorije" — ključne činjenice o korisniku koje AI sam ekstrahira iz razgovora. Trošak ostaje nizak jer se u AI kontekst šalje samo sažetak, a ne cijela povijest.

## Kako radi

```text
Korisnik piše → Edge funkcija:
  1. Dohvati zadnjih 30 poruka iz chat_messages
  2. Dohvati sve user_memories (ključne činjenice)
  3. Pošalji AI-ju: system prompt + memorije + zadnjih 30 poruka + nova poruka
  4. AI odgovori
  5. Spremi poruke (user + assistant) u chat_messages
  6. AI ekstrahira nove memorije → spremi u user_memories
```

## Promjene

### 1. Dvije nove tablice (migracija)

**`chat_messages`** — zadnjih 30 poruka po sesiji
- `id`, `user_id`, `session_id` (uuid), `role` (user/assistant), `content`, `business_profile_id`, `created_at`
- RLS: korisnik vidi samo svoje poruke

**`user_memories`** — ključne činjenice ekstrahirane iz razgovora
- `id`, `user_id`, `content` (tekst činjenice, npr. "Štedi 500€/mj za auto"), `category` (goal/preference/fact/habit), `business_profile_id`, `created_at`, `updated_at`
- RLS: korisnik vidi samo svoje memorije
- Max ~50 memorija po korisniku (stare se zamjenjuju)

### 2. Edge funkcija — pamćenje u `financial-assistant`
**Datoteka: `supabase/functions/financial-assistant/index.ts`**

- Na početku obrade: dohvati zadnjih 30 poruka iz `chat_messages` za korisnikov `session_id`
- Dohvati sve `user_memories` za korisnika (filtrirano po business_profile_id)
- Ubaci memorije u system prompt kao sekciju "ŠTO ZNAM O KORISNIKU"
- Nakon što AI odgovori: spremi user + assistant poruku u `chat_messages`
- Novi alat **`extract_memories`** — AI ga poziva kad prepozna novu ključnu činjenicu (cilj, navika, preferencija)
- Novi alat **`get_memories`** — dohvaća postojeće memorije
- Novi alat **`delete_memory`** — briše memoriju kad korisnik to zatraži

### 3. Hook — upravljanje sesijama
**Datoteka: `src/hooks/useFinancialAssistant.ts`**

- Generiraj `session_id` (uuid) kad korisnik otvori chat; spremi u `useState`
- Šalji `session_id` u request body edge funkciji
- Pri prvom otvaranju: dohvati zadnje poruke iz `chat_messages` za prikaz prethodnog razgovora
- `clearMessages` briše i lokalno stanje i bazu (ili samo započne novu sesiju)

### 4. Privatnost — brisanje memorija
**Datoteka: `src/components/FinancialAssistantDialog.tsx`**

- Dodati gumb "Obriši memorije" u settings/header dijalogu
- Korisnik može vidjeti što AI "pamti" i obrisati pojedine stavke ili sve

## Utjecaj na troškove

- **Baza**: Zanemarivo (~1KB po poruci, max 30 poruka = ~30KB po korisniku)
- **AI tokeni**: Memorije dodaju ~200-500 tokena po zahtjevu (minimalan utjecaj)
- **Čišćenje**: Automatski trigger briše poruke starije od 90 dana

## Tehnički detalji

```text
chat_messages:
  id uuid PK, user_id uuid FK, session_id uuid,
  role text, content text, business_profile_id uuid nullable,
  created_at timestamptz

user_memories:
  id uuid PK, user_id uuid FK, content text,
  category text (goal/preference/fact/habit),
  business_profile_id uuid nullable,
  created_at timestamptz, updated_at timestamptz

AI toolovi:
  extract_memories → INSERT/UPSERT user_memories (max 50)
  get_memories → SELECT user_memories
  delete_memory → DELETE user_memories WHERE id = X

System prompt nova sekcija:
  "ŠTO ZNAM O KORISNIKU: [lista memorija]"

Cleanup trigger:
  DELETE FROM chat_messages WHERE created_at < now() - interval '90 days'
```

Datoteke za promjenu:
- Nova migracija: `chat_messages` + `user_memories` tablice + RLS + cleanup
- `supabase/functions/financial-assistant/index.ts` — dohvat poruka, memorije u prompt, 3 nova alata, spremanje poruka
- `src/hooks/useFinancialAssistant.ts` — session_id, učitavanje prethodnih poruka
- `src/components/FinancialAssistantDialog.tsx` — gumb za brisanje memorija

