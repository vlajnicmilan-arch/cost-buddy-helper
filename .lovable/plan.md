## Cilj

Dodati Sentry error capture u 5 najkritičnijih edge funkcija, tako da svaka neuhvaćena greška (Stripe payment fail, AI fail, FCM token expire, itd.) odmah završi u Sentry dashboardu — umjesto da je vidimo tek kada korisnik javi.

## Top 5 funkcija (po prioritetu)

| # | Funkcija | Zašto kritična |
|---|----------|---------------|
| 1 | `parse-receipt` | Korisnici skeniraju račune dnevno; Gemini AI fail = izgubljen receipt |
| 2 | `send-push` | FCM v1 OAuth token može expire; tihi fail = nema notifikacija |
| 3 | `create-checkout` | Stripe payments = pravi novac, fail blokira upgrade |
| 4 | `customer-portal` | Stripe billing management, isti rizik |
| 5 | `financial-assistant` | AI chat, glavni Pro feature |

Ostale 60+ funkcija dodajemo postupno **kada se javi konkretan problem**, da ne trošimo vrijeme bez ROI-a.

## Implementacijski koraci

### 1. Novi shared helper: `supabase/functions/_shared/sentry.ts`

Lightweight Deno wrapper koji:
- Šalje POST direktno na Sentry **Store API** (`https://o4511302417973248.ingest.de.sentry.io/api/4511302422167632/store/`) — bez SDK-a, bez `npm:` ovisnosti, bez `deno.lock` rizika
- Format event payloada: `{ event_id, timestamp, platform: 'javascript', level: 'error', exception: {...}, tags: { function_name, environment: 'edge' }, extra: {...} }`
- Sve u **fire-and-forget** modu (`.catch(() => {})`) — Sentry ne smije nikad blokirati ni rušiti edge funkciju
- Export: `captureEdgeError(error, { functionName, userId?, context? })`

DSN je javan po dizajnu, hardkodiran u helperu (isti kao frontend) — nema potrebe za novim secretom.

### 2. Wrap `Deno.serve` handlera u svakoj od 5 funkcija

Pattern (minimalna izmjena, ne diramo business logiku):

```ts
import { captureEdgeError } from "../_shared/sentry.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  
  let userId: string | undefined;
  try {
    // ... postojeći kod (auth, validacija, posao) ...
    // userId postavimo čim ga dohvatimo iz auth-a
    return new Response(JSON.stringify(result), { ... });
  } catch (error) {
    // Fire-and-forget Sentry
    captureEdgeError(error, {
      functionName: "parse-receipt",
      userId,
      context: { method: req.method, path: new URL(req.url).pathname },
    });
    // POSTOJEĆI error response ostaje netaknut
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
```

**Bitno:** wrap je samo na **vanjskoj razini**. Postojeće `try/catch` blokove unutra ne diramo. User-facing error response ostaje identičan — Sentry je samo "tap" na grešku u prolazu.

### 3. Šum filter (u helperu)

`captureEdgeError` interno odbacuje:
- `User not authenticated` (očekivani 401, ne bug)
- `Price ID is required` i slične `400` validacijske greške gdje znamo da je input loš
- Greške s porukom koja sadrži `not authenticated` ili počinje s `Validation:`

Štedi quotu i drži signal čist.

### 4. Deploy & test

- Auto-deploy 5 funkcija
- Pošaljem 1 test request prema `parse-receipt` s namjerno krivim payloadom da potvrdim da Sentry hvata server-side greške
- Provjerim u Sentry dashboardu da event ima tag `function_name: parse-receipt` i `environment: edge`

### 5. Sentry Alerts checklist (za tebe, 5 min u Sentry UI)

Nakon implementacije dat ću ti precizne klikove za:
- **Email alert: "Issue first seen"** → trenutni email kada se nova greška pojavi
- **Email alert: "Error spike"** → preko 10 errora u 1 satu
- **Regression alert** → resolved issue se vratio (često kod deploya)

## Što NE radimo

- ❌ Deno SDK (`@sentry/deno`) — npm/esm import može razbiti `deno.lock` u edge-runtime, raw HTTP POST je sigurniji
- ❌ Performance tracing — nula quota benefit za naš scale
- ❌ Ostalih 60+ funkcija — dodajemo on-demand
- ❌ Cleanup `app_diagnostics_logs` — čekamo 2 tjedna validacije (frontend + edge paralelno)

## Datoteke koje mijenjamo

1. **NEW** `supabase/functions/_shared/sentry.ts` — raw HTTP Sentry client
2. `supabase/functions/parse-receipt/index.ts` — outer try/catch + capture
3. `supabase/functions/send-push/index.ts` — outer try/catch + capture
4. `supabase/functions/create-checkout/index.ts` — outer try/catch + capture
5. `supabase/functions/customer-portal/index.ts` — outer try/catch + capture
6. `supabase/functions/financial-assistant/index.ts` — outer try/catch + capture

## Validacija nakon deploya

1. Sentry primio test event s tagom `function_name`
2. Sve 5 funkcija i dalje rade normalno (curl test svake)
3. Latencija nije porasla (`captureEdgeError` je fire-and-forget, ne čeka response)
4. U Sentry UI vidim 2 environmenta: `production` (frontend) i `edge` (backend)
