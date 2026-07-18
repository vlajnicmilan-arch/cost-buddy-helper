import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { captureEdgeError } from "../_shared/sentry.ts";
import { checkAiQuota, consumeCoreScanQuota, refundCoreScanQuota, isInternalSkipQuota } from "../_shared/aiQuota.ts";
import { callGemini } from "../_shared/geminiClient.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Čišćenje base64 podataka - mobilni uređaji često dodaju prefiks
function cleanBase64(base64String: string): string {
  if (!base64String) return "";
  let cleaned = base64String.trim();

  // Uklanjanje "data:image/...;base64," prefiksa
  if (cleaned.includes(",") && cleaned.startsWith("data:")) {
    cleaned = cleaned.split(",")[1];
  }

  // Uklanjanje razmaka i novih redova koji se mogu pojaviti na mobitelu
  return cleaned.replace(/\s/g, "");
}

// Detekcija MIME tipa iz base64 podataka
function detectMimeType(base64String: string): string {
  if (base64String.startsWith("data:")) {
    const match = base64String.match(/data:([^;]+);/);
    if (match) return match[1];
  }
  
  // Provjera magic bytes-a
  const cleaned = cleanBase64(base64String);
  if (cleaned.startsWith("/9j/")) return "image/jpeg";
  if (cleaned.startsWith("iVBORw")) return "image/png";
  if (cleaned.startsWith("R0lGOD")) return "image/gif";
  if (cleaned.startsWith("UklGR")) return "image/webp";
  
  return "image/jpeg"; // Default
}

// Prepare image content part for AI message
function prepareImagePart(imageBase64: string) {
  const mimeType = detectMimeType(imageBase64);
  const cleanedBase64 = cleanBase64(imageBase64);
  const imageDataUrl = `data:${mimeType};base64,${cleanedBase64}`;
  return {
    type: 'image_url' as const,
    image_url: { url: imageDataUrl }
  };
}

async function callAiGateway(_apiKey: string, payload: Record<string, unknown>, timeoutMs = 45_000) {
  return await callGemini(payload as any, { timeoutMs });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('No authorization header');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }), 
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      console.error('Invalid token:', claimsError);
      return new Response(
        JSON.stringify({ error: 'Invalid token' }), 
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claimsData.claims.sub;

    const skipQuota = isInternalSkipQuota(req);
    if (!skipQuota) {
      const quotaResp = await checkAiQuota(supabase, userId, "parse-receipt");
      if (quotaResp) return quotaResp;
      const coreResp = await consumeCoreScanQuota(supabase);
      if (coreResp) return coreResp;
    }

    
    let body;
    try {
      body = await req.json();
    } catch (parseError) {
      console.error('Failed to parse request body:', parseError);
      return new Response(
        JSON.stringify({ error: 'Invalid request body' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const { imageBase64, imagesBase64, customPaymentSources, customCategories } = body;

    // Support both single image (backward compat) and multiple images
    const images: string[] = imagesBase64 && imagesBase64.length > 0 
      ? imagesBase64 
      : (imageBase64 ? [imageBase64] : []);

    if (images.length === 0) {
      console.error('No image provided in request');
      return new Response(
        JSON.stringify({ error: 'No image provided' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Processing receipt with', images.length, 'image(s) for user:', userId);
    console.log('Custom payment sources:', customPaymentSources?.length || 0);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Prepare image parts for AI
    const imageParts = images.map(img => prepareImagePart(img));
    
    console.log('Sending', imageParts.length, 'image(s) to AI gateway...');
    
    // Build custom categories context
    let customCategoriesContext = '';
    if (customCategories && customCategories.length > 0) {
      const catList = customCategories.map((cat: any) => `- ${cat.id} → ${cat.icon} ${cat.name}`).join('\n');
      customCategoriesContext = `\n\nKORISNIKOVE PRILAGOĐENE KATEGORIJE (koristi ih ako odgovaraju sadržaju računa):\n${catList}\nAko nijedna prilagođena kategorija ne odgovara, koristi standardne kategorije.`;
    }

    // Build custom payment sources context for AI prompt
    let paymentSourcesContext = '';
    let cardMatchingRules = '';
    
    if (customPaymentSources && customPaymentSources.length > 0) {
      const sourcesList: string[] = [];
      const cardsList: string[] = [];
      
      customPaymentSources.forEach((src: any) => {
        sourcesList.push(`- "${src.name}" (source_id: ${src.id})`);
        
        if (src.cards?.length > 0) {
          src.cards.forEach((card: any) => {
            cardsList.push(`  - "${card.card_name}" → zadnje 4 znamenke: "${card.last_four_digits}" → card_id: "${card.id}" → source_id: "${src.id}"`);
          });
        }
      });
      
      paymentSourcesContext = `

=== KORISNIKOVI RAČUNI I KARTICE ===
RAČUNI:
${sourcesList.join('\n')}

KARTICE (PRESUDNO ZA POVEZIVANJE):
${cardsList.length > 0 ? cardsList.join('\n') : '(nema definiranih kartica)'}
=== KRAJ POPISA ===`;

      cardMatchingRules = `

=== OBVEZNA PRAVILA ZA KARTICE ===
KORAK 1: Pronađi broj kartice na računu
- Traži sljedeće uzorke: "****1234", "XXXX1234", "xxxx1234", "1234****", "PAN: 1234", "Kartica: 1234"
- Traži kraj redaka s brojevima: često su zadnje 4 znamenke na kraju retka iza VISA/MC/MAESTRO
- Traži u blizini riječi: KARTICA, CARD, PAN, VISA, MASTERCARD, MC, MAESTRO, AMEX, DEBIT, CREDIT
- Traži u blizini: "Kartično plaćanje", "Bezgotovinsko", "POS terminal"

KORAK 2: Usporedi s popisom KARTICE iznad
- Ako pronađeš 4 znamenke na računu, usporedi ih s SVAKOM karticom iz popisa
- Ako se podudaraju → MORAŠ postaviti payment_source_card_id na taj card_id I custom_payment_source_id na taj source_id
- Ovo je KRITIČNO - nemoj zaboraviti card_id!

KORAK 3: Ako nema podudaranja brojeva
- Ako vidiš naziv banke (ZABA, PBZ, Erste, Revolut, OTP, RBA, Addiko) bez broja kartice → postavi samo custom_payment_source_id
- Ako je gotovina → payment_method: "cash", ostalo null
- Ako ne možeš utvrditi → payment_method: "card", ostalo null
=== KRAJ PRAVILA ===`;
    }

    // Multi-page instruction
    const multiPageNote = images.length > 1 
      ? `\n\nVAŽNO: Dobio si ${images.length} slika/stranica ISTOG računa. Spoji podatke sa svih stranica u JEDAN rezultat. Artikli s različitih stranica trebaju biti u jednom popisu. Ukupni iznos je onaj na posljednjoj stranici (UKUPNO/TOTAL).`
      : '';
    
    // Enhanced prompt for better OCR and item extraction
    const systemPrompt = `Ti si precizni OCR asistent za analizu hrvatskih računa. TVOJ CILJ: izvući SVE podatke s računa.${multiPageNote}

=== ŠTO MORAŠ PRONAĆI ===

1. UKUPNI IZNOS
   - Traži: "UKUPNO", "TOTAL", "ZA PLATITI", "SVEGA", "IZNOS"
   - Vraća se kao broj u eurima (npr. 45.50)

2. TRGOVINA/TRGOVAC
   - Obično je na vrhu računa velikim slovima
   - Može biti: KONZUM, LIDL, KAUFLAND, SPAR, PLODINE, TOMMY, STUDENAC, INTERSPAR, DM, MULLER itd.

3. DATUM RAČUNA
   - Traži format: DD.MM.YYYY, DD/MM/YYYY, YYYY-MM-DD
   - Često piše: "Datum:", "Date:", ili je blizu vremena (npr. "20.01.2025 15:30")
   - VAŽNO: Uvijek vrati u formatu YYYY-MM-DD

3a. STRUKTURIRANO VRIJEME IZDAVANJA (Val 4 — precizno vrijeme)
   - Cilj: prepoznati JEDAN primarni timestamp događaja izdavanja računa.
   - Vrati issued_at_raw kao DOSLOVAN tekst kako stoji na slici (npr. "20.01.2025 15:30:42")
   - Vrati issued_at_iso kao ISO-8601 datetime s vremenom i HR offsetom (npr. "2025-01-20T15:30:42+01:00" zimi, "+02:00" ljeti). Ako nemaš pouzdano vrijeme → null

   issued_at_label_present smije biti true SAMO u jednom od ova dva slučaja:

   SLUČAJ A — Eksplicitni label uz puni datetime (datum + HH:MM):
     HR: „Vrijeme izdavanja", „Datum/vrijeme", „Datum i vrijeme", „Izdano", „Vrijeme:"
     DE: „Ausgestellt", „Datum/Uhrzeit", „Ausstellungszeit"
     EN: „Issued at", „Date/Time", „Time of issue"
     Posebno: „Datum računa" / „Invoice date" / „Rechnungsdatum" vrijedi SAMO ako uz njega stoji i vrijeme (HH:MM). Goli datum nije dovoljan.

   SLUČAJ B — Nedvosmisleni glavni timestamp bez doslovnog labela:
     - Pregledaj CIJELI račun (zaglavlje, sredinu, podnožje). Pozicija sama po sebi nije ni dovoljan ni diskvalificirajući signal.
     - Datetime smije biti priznat ako je jedini uvjerljivi kandidat za stvarno vrijeme izdavanja računa,
     - ILI ako drugi datetime kandidati postoje, ali su jasno sekundarni i pripadaju STOP-LISTI ispod.
      - Uski HR fiskalni obrazac koji se priznaje: naziv izdavatelja/OIB/adresa → „Račun br." / broj računa → jedan puni datetime (DD.MM.YYYY HH:MM[:SS]) → tablica stavki/ukupno, bez konkurentskog glavnog datetimea. U tom obrascu datetime je primarni timestamp računa i issued_at_label_present=true.
     - Ako nisi siguran koji je glavni → false.

   STOP-LISTA (datetime u TIM kontekstima NIKAD nije glavni i mora biti odbačen):
     - Kartični slip / POS autorizacija: „Autorizacija", „Approved", „Auth", „Odobreno", „AID", „RRN", broj transakcije kartice, vrijeme terećenja kartice
     - „Vrijeme tiska", „Tiskano", „Kopija", „Reprint", „Duplikat"
     - „Smjena", „Sat blagajne", „Vrijeme smjene", „Otvorena smjena"
     - „Vrijeme dolaska", „Vrijeme naplate", „Vrijeme narudžbe"
     - Bilo koji sekundarni ispis ili pomoćni dokument na istom papiru (ponuda uz račun, narudžbenica, R1 zahtjev)

   PRAVILA RAZDVAJANJA:
     - Ako postoji jedan očito glavni datetime i jedan iz stop-liste → glavni se priznaje (label_present=true po slučaju B).
     - Ako postoji više datetime kandidata IZVAN stop-liste bez jasnog primata → label_present=false.

   ZABRANE HEURISTIKE:
      - NE zaključuj true samo zato što je datetime „uz Račun br." ili u zaglavlju; mora postojati puni strukturni obrazac iz Slučaja B ili eksplicitni label iz Slučaja A.
     - NE zaključuj false samo zato što datetime nije u zaglavlju. Glavni timestamp može legitimno biti između stavki i totala ili u podnožju.
     - Postojanje ili nepostojanje JIR / ZKI / fiskalnog markera / QR fiskalnog bloka NE SMIJE utjecati na ovu odluku.

   Ako nemaš pouzdano vrijeme → issued_at_iso=null i label_present=false. NE pogađaj.

3b. FISKALNI MARKER (Val 4 — SAMO TELEMETRIJA, ne utječe na odluku o vremenu)
   - fiscal_marker_present: true SAMO ako na računu vidiš JIR (Jedinstveni Identifikator Računa) ili ZKI (Zaštitni Kod Izdavatelja) ili izričito „Račun fiskaliziran"/„Fiskalizirano"
   - Ako pročitaš JIR vrati ga kao jir_value (string), inače null
   - Ne-fiskalni dokumenti (ponude, predračuni, interni bonovi, ručno pisani) → fiscal_marker_present: false
   - VAŽNO: ovi signali su isključivo telemetrijski. Ne smiju utjecati ni na issued_at_label_present ni na bilo koju drugu odluku o vremenu.

4. NAČIN PLAĆANJA (KRITIČNO!)
   - Za karticu traži: VISA, MASTERCARD, MC, MAESTRO, AMEX, DEBIT, CREDIT, POS, KARTICA, CARD, KARTIČNO, BEZGOTOVINSKI, CONTACTLESS
   - Za gotovinu traži: GOTOVINA, GOTOV., CASH, UPLAĆENO
   - OBAVEZNO traži zadnje 4 znamenke kartice! (npr. ****5678, XXXX1234)

5. SVI ARTIKLI - izvuci SVAKI proizvod s računa:
   - name: puni naziv artikla (npr. "MLIJEKO DUKAT 1L", "KRUH BIJELI 500G")
   - quantity: količina (broj, obično ispred cijene, default 1)
   - unit_price: jedinična cijena ako je različita od ukupne (može biti null)
   - total_price: ukupna cijena tog artikla (OBAVEZNO)

 6. RATE / KUPNJA NA RATE (KRITIČNO - PAŽLJIVO PROVJERI!)
   - Traži BILO KOJI od ovih pojmova BILO GDJE na računu: "RATE", "RATA", "INSTALLMENT", "BR.RATA", "BROJ RATA", "RATA X/Y", "NA X RATA", "MJESEČNA RATA", "OBROČNO PLAĆANJE", "OBROK", "OBROČNA OTPLATA", "RATE:", "BR RATA:", "RATA BR", "KUPNJA NA RATE", "INSTALMENTS"
   - Traži uzorke poput: "12 RATA", "RATA 1/12", "6 RATA PO 50.00", "OBROČNA OTPLATA", "RATE: 12", "BR.RATA: 6", "NA 3 RATE", "RATA BR. 1 OD 12"
   - Traži i manje očite oznake: "R:", "BR.R:", "RATE MJES.", "OBR.", "OBROCNO"
   - AKO PRONAĐEŠ BILO ŠTO ŠTO UKAZUJE NA RATE → OBAVEZNO postavi is_installment: true
   - installment_count: ukupni broj rata (npr. 12, 6, 24)
   - installment_current: trenutna rata ako je navedena (npr. 1 od 12)
   - installment_amount: iznos jedne rate ako je naveden (ako nije, izračunaj: amount / installment_count)

 7. DOPUNA / TOP-UP / TRANSFER / BANKOMAT / BANKARSKI PRIJENOS (KRITIČNO!)
     - Traži: "DOPUNA", "TOP-UP", "TOP UP", "NADOPLATA", "UPLATA NA", "NADOPUNA", "PREPAID", "VOUCHER", "BON", "E-BON"
     - Traži usluge: "AIRCASH", "REVOLUT", "PAYPAL", "KEKS PAY", "GOOGLE PAY", "APPLE PAY"
     - Ako račun opisuje DOPUNU DIGITALNOG NOVČANIKA ili PREPAID USLUGE → transaction_type: "transfer"
     - transfer_destination_name: naziv odredišnog računa (npr. "Aircash", "Revolut") - koristi TOČAN naziv usluge
     - Ovo NIJE obični trošak! To je prijenos novca s jednog izvora na drugi.
     - Primjeri: "AIRCASH DOPUNA 50 EUR" na INA → transaction_type: "transfer", transfer_destination_name: "Aircash"
     
     BANKOMAT / ATM ISPLATA (KRITIČNO!):
     - Traži: "BANKOMAT", "ATM", "ISPLATA", "CASH WITHDRAWAL", "PODIZANJE GOTOVINE"
     - Ako račun dolazi s BANKOMATA ili opisuje ISPLATU gotovine → transaction_type: "transfer" (UVIJEK!)
     - transfer_destination_name: "Gotovina" (jer se novac prebacuje s računa na gotovinu)
     - Ovo NIKAD nije "expense"! Podizanje gotovine je PRIJENOS novca, ne trošak.
     - Primjer: "PRIVREDNA BANKA ZAGREB / BANKOMAT / ISPLATA 240.00 EUR" → transaction_type: "transfer", transfer_destination_name: "Gotovina"

      BANKARSKA POTVRDA O PRIJENOSU / UPLATI:
      - Traži: "Potvrda o izvršenoj transakciji", "PLATITELJ", "PRIMATELJ", "IBAN", "Broj računa platitelja", "Broj računa primatelja", "Internet bankarstvo", "Mobilno bankarstvo", "Datum izvršenja", "Poziv na broj", "Način plaćanja: Instant", "Iznos terećenja", "Iznos odobrenja"
      - Ako dokument sadrži PLATITELJA i PRIMATELJA s IBAN brojevima → OVO JE BANKARSKA POTVRDA!
      - merchant: UVIJEK ime PLATITELJA (osoba koja šalje novac, npr. "Duje Grčić") - NIKAD naziv banke, NIKAD ime primatelja!
      - description: opis s potvrde (npr. "posudba", "najam") + " - " + ime PRIMATELJA
      - recipient_name: ime PRIMATELJA (osoba ili firma koja prima novac, npr. "Vinka Pleško", "HEP d.d.")
      - transaction_type: "expense" (korisnik može promijeniti u pregledu na "transfer" ili "income")
      - transfer_destination_name: null
      - KRITIČNO ZA PAYMENT SOURCE: Ako na potvrdi piše naziv banke platitelja (OTP, PBZ, ZABA, Erste, Revolut, RBA, Addiko, HPB), usporedi s popisom KORISNIKOVIH RAČUNA iznad i postavi custom_payment_source_id ako se naziv podudara!
      - Primjer: Potvrda OTP banke, platitelj Duje Grčić, primatelj Vinka Pleško, opis "posudba", iznos 1736.95 EUR
        → merchant: "Duje Grčić", description: "Posudba - Vinka Pleško", recipient_name: "Vinka Pleško", transaction_type: "expense", category: "other", custom_payment_source_id: (ID OTP računa ako postoji u popisu)
     
     - Ako NIJE dopuna/transfer/bankomat → transaction_type: "expense"
${paymentSourcesContext}${cardMatchingRules}${customCategoriesContext}

 8. IZDAVATELJ I PRIMATELJ RAČUNA (KRITIČNO!)
    - issuer_name: Tvrtka/obrt/osoba koja je IZDALA račun (prodavatelj, pružatelj usluge)
      - Obično na vrhu računa: naziv firme, OIB, adresa
      - Primjeri: "KONZUM PLUS d.o.o.", "INA d.d.", "Frizerski salon Ana"
    - recipient_name: Tvrtka/osoba koja je PRIMILA račun (kupac)
      - Traži: "Kupac:", "Račun za:", "Customer:", ili podatke kupca (naziv firme, OIB kupca)
      - Ako nema podataka o kupcu → recipient_name: null
    - VAŽNO: merchant polje = issuer_name (naziv izdavatelja, skraćeni oblik za prikaz)

=== FORMAT ODGOVORA (SAMO JSON) ===
{
  "amount": 45.50,
  "merchant": "Konzum",
  "description": "Tjedna kupovina",
  "category": "food",
  "date": "2025-01-20",
  "issued_at_iso": "2025-01-20T15:30:42+01:00",
  "issued_at_raw": "20.01.2025 15:30:42",
  "issued_at_label_present": true,
  "fiscal_marker_present": true,
  "jir_value": null,
  "payment_method": "card",
  "transaction_type": "expense",
  "transfer_destination_name": null,
  "recipient_name": null,
  "issuer_name": "KONZUM PLUS d.o.o.",
  "issuer_oib": "62226620908",
  "custom_payment_source_id": null,
  "payment_source_card_id": null,
  "is_installment": false,
  "installment_count": null,
  "installment_amount": null,
  "items": [
    {"name": "MLIJEKO DUKAT 1L", "quantity": 2, "unit_price": 1.29, "total_price": 2.58},
    {"name": "KRUH BIJELI", "quantity": 1, "unit_price": null, "total_price": 1.50}
  ]
}

PRIMJER ZA DOPUNU/TRANSFER:
{
  "amount": 300.00,
  "merchant": "INA",
  "description": "Aircash dopuna",
  "category": "other",
  "date": "2025-02-13",
  "payment_method": "cash",
  "transaction_type": "transfer",
  "transfer_destination_name": "Aircash",
  "custom_payment_source_id": null,
  "payment_source_card_id": null,
  "is_installment": false,
  "installment_count": null,
  "installment_amount": null,
  "items": [{"name": "AIRCASH DOPUNA", "quantity": 1, "unit_price": null, "total_price": 300.00}]
}

PRIMJER ZA RATE:
{
  "amount": 600.00,
  "merchant": "Sancta Domenica",
  "description": "Laptop na 12 rata",
  "category": "shopping",
  "date": "2025-01-20",
  "payment_method": "card",
  "transaction_type": "expense",
  "transfer_destination_name": null,
  "is_installment": true,
  "installment_count": 12,
  "installment_amount": 50.00,
  "items": [{"name": "Laptop HP 15", "quantity": 1, "unit_price": null, "total_price": 600.00}]
}

KATEGORIJE (odaberi NAJSPECIFIČNIJU koja odgovara):
- food → Restorani, fast food, kafići, pekare, gotova jela (NE supermarket kupovina!)
- groceries → Supermarketi, dućani, namirnice (Konzum, Lidl, Kaufland, Spar, Plodine, Tommy, Studenac, Interspar, Eurospin)
- transport → Javni prijevoz, taxi, Uber, Bolt, TRAJEKT, ferry, autobus, vlak, parking, cestarina, vinjeta, ENC
- car → Gorivo, benzin, servis auta, registracija, automehaničar, autopraonica, INA, Petrol, Tifon, Crodux (OSIM ako je DOPUNA → transfer)
- shopping → Općenita kupovina, elektronika, tehnika, namještaj, alati
- clothing → Odjeća, obuća, modni dodaci
- entertainment → Kino, koncerti, izlasci, noćni klubovi, bowling
- subscriptions → Netflix, Spotify, HBO, streaming usluge, mjesečne pretplate
- bills → Računi za telefon, internet, TV, komunalne usluge
- utilities → Struja, voda, plin, grijanje, komunalije
- rent → Najam stana, zakupnina
- health → Ljekarna, liječnik, bolnica, laboratorij, vitamini
- beauty → Frizerski salon, kozmetika, DM, Müller (kozmetički proizvodi)
- sports → Teretana, sport, oprema za sport, članarine za sport
- education → Knjige, tečajevi, školarine, edukacije
- travel → Putovanja, hoteli, smještaj, avionske karte, turističke aktivnosti
- home → Kućne potrepštine, popravci, vrtni centar, Bauhaus, Pevex
- pets → Hrana za životinje, veterinar
- gifts → Pokloni, cvjećarnica
- kids → Dječje potrepštine, igračke, škola, vrtić
- insurance → Osiguranje (životno, auto, zdravstveno)
- taxes → Porezi, pristojbe, javni nameti
- savings → Štednja
- investments → Investicije
- charity → Donacije, humanitarne uplate
- other → Sve ostalo što ne pripada nijednoj kategoriji

VAŽNO ZA KATEGORIZACIJU:
- "Trajekt", "ferry", "karta za brod" → UVIJEK "transport", NIKAD "food"!
- Supermarketi (Konzum, Lidl, Spar...) → "groceries", NE "food"
- Benzinske postaje (INA, Petrol) s gorivom → "car"
- Benzinske postaje s dopunom (Aircash) → "transfer"
- DM, Müller → "beauty" ako je kozmetika, "groceries" ako su namirnice

AKO NE MOŽEŠ PROČITATI:
{"error": "Nije moguće pročitati račun"}`;

    const userPrompt = images.length > 1
      ? `Analiziraj ovaj račun koji se sastoji od ${images.length} stranica/slika. Spoji sve podatke u jedan rezultat.

POSEBNO OBRATI PAŽNJU:
1. Pronađi SVE artikle SA SVIH STRANICA - svaki redak s proizvodom i cijenom
2. Pronađi TOČAN DATUM na računu
3. Pronađi BROJ KARTICE (zadnje 4 znamenke) i usporedi s popisom korisnikovih kartica
4. Ako pronađeš podudaranje broja kartice → MORAŠ vratiti card_id i source_id
5. Provjeri piše li na računu RATE, RATA, OBROČNO ili slično - ako da, vrati is_installment: true i broj rata
6. UKUPNI IZNOS uzmi s posljednje stranice (UKUPNO/TOTAL)

Vrati SAMO JSON bez dodatnog teksta.`
      : `Analiziraj ovaj račun. 

POSEBNO OBRATI PAŽNJU:
1. Pronađi SVE artikle - svaki redak s proizvodom i cijenom
2. Pronađi TOČAN DATUM na računu
3. Pronađi BROJ KARTICE (zadnje 4 znamenke) i usporedi s popisom korisnikovih kartica
4. Ako pronađeš podudaranje broja kartice → MORAŠ vratiti card_id i source_id
5. Provjeri piše li na računu RATE, RATA, OBROČNO ili slično - ako da, vrati is_installment: true i broj rata

Vrati SAMO JSON bez dodatnog teksta.`;

    // Build user message content with text + all images
    const userContent: any[] = [
      { type: 'text', text: userPrompt },
      ...imageParts
    ];

    const aiPayload = {
      model: 'google/gemini-2.5-flash',
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: userContent
        }
      ],
      temperature: 0.1,
      // Bumped 4000 → 8192: dugački Spar/Konzum računi s 15–25+ stavki + puno metapodataka
      // često prelaze 4k tokena i budu odsječeni usred `items` polja (regresija 2026-08-25).
      max_tokens: 8192,
      // KRITIČNO: forsira Google Gemini da vrati čist JSON objekt (responseMimeType
      // application/json u geminiClient.ts) — nema markdown ```json fenceova, nema
      // chain-of-thought leaka prije objekta.
      response_format: { type: 'json_object' as const },
    };

    // Use Flash for receipt OCR. Pro was too slow on native scans and caused 503 before the UI got a result.
    let aiResponse = await callAiGateway(LOVABLE_API_KEY, aiPayload);

    if (aiResponse.status >= 500) {
      console.warn('AI gateway transient error, retrying once with flash-lite:', aiResponse.status);
      aiResponse = await callAiGateway(LOVABLE_API_KEY, {
        ...aiPayload,
        model: 'google/gemini-2.5-flash-lite',
      }, 30_000);
    }

    if (!aiResponse.ok) {
      if (!skipQuota) await refundCoreScanQuota(supabase);
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Previše zahtjeva. Pokušaj ponovno za minutu.' }), 
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Nedostaje kredita za AI obradu.' }), 
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await aiResponse.text();
      console.error('AI gateway error:', aiResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: 'AI analiza trenutno nije dostupna. Pokušaj ponovno za minutu.' }), 
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || '';
    const finishReason = aiData.choices?.[0]?.finish_reason || null;

    console.log('AI response length:', content.length, 'finish_reason:', finishReason);

    // Parse JSON from AI response — obrambeno protiv triju modova pada:
    //   (a) čist JSON (očekivano uz response_format: json_object)
    //   (b) ```json ... ``` fences (starije ponašanje ili fallback path)
    //   (c) reasoning leak PRIJE JSON-a + eventualna truncation
    let receiptData: any = null;
    let parseMode: 'clean' | 'fenced' | 'braces' | 'salvage-truncated' | null = null;
    let parseError: unknown = null;

    const tryParse = (s: string): any => JSON.parse(s);

    const stripFences = (s: string): string => {
      return s.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
    };

    // (a) direct
    try {
      receiptData = tryParse(content.trim());
      parseMode = 'clean';
    } catch { /* try next */ }

    // (b) skini ```json fences
    if (!receiptData) {
      try {
        receiptData = tryParse(stripFences(content));
        parseMode = 'fenced';
      } catch { /* try next */ }
    }

    // (c) izvadi prvi { ... } blok
    if (!receiptData) {
      const stripped = stripFences(content);
      const first = stripped.indexOf('{');
      const last = stripped.lastIndexOf('}');
      if (first >= 0 && last > first) {
        const slice = stripped.slice(first, last + 1);
        try {
          receiptData = tryParse(slice);
          parseMode = 'braces';
        } catch (e) { parseError = e; }
      }
    }

    // (d) SALVAGE: JSON je truncated (finish_reason=length ili očito odsječen).
    // Zatvori otvorene stringove/nizove/objekte i pokušaj parsirati parcijalni podatak.
    if (!receiptData) {
      const stripped = stripFences(content);
      const first = stripped.indexOf('{');
      if (first >= 0) {
        const salvage = attemptJsonSalvage(stripped.slice(first));
        if (salvage) {
          try {
            receiptData = tryParse(salvage);
            parseMode = 'salvage-truncated';
          } catch (e) { parseError = e; }
        }
      }
    }

    if (!receiptData) {
      const cause = finishReason === 'length' ? 'truncated' :
                    /\{/.test(content) ? 'schema-miss' : 'no-json';
      console.error('Failed to parse AI response:', {
        cause,
        finishReason,
        contentLength: content.length,
        error: parseError instanceof Error ? parseError.message : String(parseError),
        preview: content.slice(0, 200),
        tail: content.slice(-200),
      });
      // Fire-and-forget telemetrija — da idući put ne moramo čitati edge logove ručno.
      void logParseFailure(supabase, userId, {
        cause,
        finish_reason: finishReason,
        content_length: content.length,
        error_message: parseError instanceof Error ? parseError.message : String(parseError),
        tail: content.slice(-200),
      });
      if (!skipQuota) await refundCoreScanQuota(supabase);
      const userMsg = cause === 'truncated'
        ? 'Račun je predugačak za AI obradu. Pokušaj skenirati manje stavki odjednom.'
        : 'AI odgovor nije bio ispravan JSON. Pokušaj ponovno.';
      return new Response(
        JSON.stringify({ error: userMsg, cause }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (parseMode !== 'clean') {
      console.warn('parse-receipt: JSON parsed via fallback mode:', parseMode, 'finish_reason:', finishReason);
    }

    if (receiptData.error) {
      return new Response(
        JSON.stringify({ error: receiptData.error }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Parsed receipt data:', receiptData);

    return new Response(
      JSON.stringify({
        amount: receiptData.amount,
        merchant: receiptData.merchant,
        description: receiptData.description,
        category: receiptData.category,
        date: receiptData.date || null,
        // Val 4 — strukturirani signali za deterministički scan-C1 helper.
        // Sami signali; tier odluku donosi klijent kod (decideScanTier).
        issued_at_iso: typeof receiptData.issued_at_iso === 'string' ? receiptData.issued_at_iso : null,
        issued_at_raw: typeof receiptData.issued_at_raw === 'string' ? receiptData.issued_at_raw : null,
        issued_at_label_present: receiptData.issued_at_label_present === true,
        fiscal_marker_present: receiptData.fiscal_marker_present === true,
        jir_value: typeof receiptData.jir_value === 'string' ? receiptData.jir_value : null,
        payment_method: receiptData.payment_method || null,
        transaction_type: receiptData.transaction_type || 'expense',
        transfer_destination_name: receiptData.transfer_destination_name || null,
        recipient_name: receiptData.recipient_name || null,
        issuer_name: receiptData.issuer_name || receiptData.merchant || null,
        issuer_oib: receiptData.issuer_oib || null,
        custom_payment_source_id: receiptData.custom_payment_source_id || null,
        payment_source_card_id: receiptData.payment_source_card_id || null,
        is_installment: receiptData.is_installment || false,
        installment_count: receiptData.installment_count || null,
        installment_amount: receiptData.installment_amount || null,
        items: receiptData.items || []
      }), 
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error processing receipt:', error);
    captureEdgeError(error, {
      functionName: 'parse-receipt',
      context: { method: req.method },
    });
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
