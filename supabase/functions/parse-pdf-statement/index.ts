import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkAiQuota, consumeCoreScanQuota, refundCoreScanQuota, isInternalSkipQuota, internalSkipQuotaHeader } from "../_shared/aiQuota.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
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

    // ---- Helpers: deterministic HTML table extraction ----
    function decodeEntities(s: string): string {
      return s
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(parseInt(n, 10)));
    }
    function stripTags(s: string): string {
      return decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    }
    function extractLargestTableRows(html: string): { header: string[]; rows: string[][] } | null {
      const tableMatches = Array.from(html.matchAll(/<table[\s\S]*?<\/table>/gi)).map(m => m[0]);
      if (tableMatches.length === 0) return null;
      const dateRe = /(\b\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b)/;
      const candidates: { header: string[]; rows: string[][]; dateRows: number }[] = [];
      for (const tbl of tableMatches) {
        const trMatches = Array.from(tbl.matchAll(/<tr[\s\S]*?<\/tr>/gi)).map(m => m[0]);
        if (trMatches.length < 2) continue;
        const parsed = trMatches.map(tr => {
          const cells = Array.from(tr.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)).map(m => stripTags(m[1]));
          return cells;
        }).filter(r => r.length > 0);
        if (parsed.length < 2) continue;
        const header = parsed[0];
        const rows = parsed.slice(1);
        // Count rows that contain a date in any cell (real transaction tables)
        const dateRows = rows.filter(r => r.some(c => dateRe.test(c))).length;
        candidates.push({ header, rows, dateRows });
      }
      if (candidates.length === 0) return null;
      // Prefer tables with most date-bearing rows; fall back to largest
      candidates.sort((a, b) => (b.dateRows - a.dateRows) || (b.rows.length - a.rows.length));
      const best = candidates[0];
      // If even the best has no date rows, return null so we fall back to raw HTML
      if (best.dateRows === 0) return null;
      return { header: best.header, rows: best.rows };
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }), 
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claimsData.claims.sub;

    const skipQuota = isInternalSkipQuota(req);
    if (!skipQuota) {
      const quotaResp = await checkAiQuota(supabase, userId, "parse-pdf-statement");
      if (quotaResp) return quotaResp;
      const coreResp = await consumeCoreScanQuota(supabase);
      if (coreResp) return coreResp;
    }

    const body = await req.json();
    const { pdfBase64, bankType, isImage, htmlContent } = body;

    const isHTML = !!htmlContent;

    if (!pdfBase64 && !htmlContent) {
      return new Response(
        JSON.stringify({ error: 'No file provided' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (body.async === true) {
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');

      const admin = createClient(supabaseUrl, serviceKey);
      const { data: job, error: jobError } = await admin
        .from('pdf_parse_jobs')
        .insert({ user_id: userId, status: 'processing' })
        .select('id')
        .single();

      if (jobError || !job?.id) {
        console.error('Failed to create PDF parse job:', jobError);
        return new Response(
          JSON.stringify({ error: 'Nije moguće pokrenuti obradu izvoda' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const processJob = async () => {
        try {
          const directBody = { ...body, async: false };
          const resultResponse = await fetch(`${supabaseUrl}/functions/v1/parse-pdf-statement`, {
            method: 'POST',
            headers: {
              Authorization: authHeader,
              'Content-Type': 'application/json',
              ...internalSkipQuotaHeader(),
            },
            body: JSON.stringify(directBody),
          });

          const result = await resultResponse.json().catch(() => null);
          if (!resultResponse.ok) {
            const message = result?.error || `PDF parse failed (${resultResponse.status})`;
            await admin.from('pdf_parse_jobs').update({ status: 'failed', error: message }).eq('id', job.id);
            return;
          }

          await admin.from('pdf_parse_jobs').update({ status: 'completed', result }).eq('id', job.id);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown PDF parse job error';
          console.error('PDF parse job failed:', message);
          await admin.from('pdf_parse_jobs').update({ status: 'failed', error: message }).eq('id', job.id);
        }
      };

      const edgeRuntime = (globalThis as unknown as { EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void } }).EdgeRuntime;
      edgeRuntime?.waitUntil ? edgeRuntime.waitUntil(processJob()) : void processJob();

      return new Response(
        JSON.stringify({ jobId: job.id, status: 'processing' }),
        { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check size (max ~5MB base64 = ~7MB string)
    const contentToCheck = htmlContent || pdfBase64;
    const fileSizeKB = Math.round(contentToCheck.length / 1024);
    console.log('Processing statement for user:', userId, 'bank:', bankType, 'isImage:', isImage, 'isHTML:', isHTML, 'size:', fileSizeKB, 'KB');

    if (contentToCheck.length > 7 * 1024 * 1024) {
      return new Response(
        JSON.stringify({ error: 'Datoteka je prevelika. Maksimalna veličina je 5MB.' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Pre-extract HTML table rows deterministically (avoids AI summarization)
    let htmlTablePayload: string | null = null;
    let htmlRowCount = 0;
    if (isHTML) {
      const extracted = extractLargestTableRows(htmlContent);
      if (extracted && extracted.rows.length > 0) {
        htmlRowCount = extracted.rows.length;
        const headerLine = extracted.header.join(' | ');
        const lines = extracted.rows.map((r, i) => `${i + 1}. ${r.join(' | ')}`);
        htmlTablePayload = `HEADER: ${headerLine}\nROWS (${htmlRowCount}):\n${lines.join('\n')}`;
        console.log(`HTML pre-parse: largest table has ${htmlRowCount} rows, header: ${headerLine.substring(0, 200)}`);
      } else {
        console.warn('HTML pre-parse: no table with rows found, falling back to raw HTML');
      }
    }

    // Use Pro model for HTML statements (better table comprehension), Flash for images/PDF
    const modelId = isHTML ? 'google/gemini-2.5-pro' : 'google/gemini-2.5-flash';

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelId,
        messages: [
          {
            role: 'system',
            content: `Ti si asistent za izvlačenje transakcija iz bankovnih izvoda.

CILJ: Vrati SVAKI redak iz dostavljene tablice transakcija. Ako u ROWS ima 47 redaka, transactions array MORA imati 47 stavki (osim sažetaka navedenih dolje).

ŠTO PRESKAČEŠ (samo ovo):
1. "Početno stanje" / "Stanje prije" / "Opening balance"
2. "Konačno stanje" / "Stanje poslije" / "Closing balance"
3. "Promet ukupno" / "Ukupni dugovni/potražni promet" / "Total turnover"
4. "Stanje na dan ..." (dnevni saldo)
5. Naslovi sekcija bez iznosa ("Specifikacija troškova usluga", "Datum", "ID1", "ID2")

ODREĐIVANJE TIPA (gledaj kolonu, ne opis):
- Iznos u koloni "Uplata" / "Potražuje" / "Korist" / "Credit" / "Haben" / "U korist" → type = "income"
- Iznos u koloni "Isplata" / "Duguje" / "Teret" / "Debit" / "Soll" / "Na teret" → type = "expense"
- Vidljivi interni prijenos između vlastitih računa / ATM podizanje → type = "transfer"
- Iznos UVIJEK pozitivan broj.

OPIS:
- Zadrži ORIGINALNI tekst iz izvoda (platitelj/primatelj + svrha + model i poziv na broj). NE skraćuj — kasnije nam treba za prepoznavanje pozajmica.

merchant_name: druga strana (platitelj kod uplate, primatelj kod isplate). Null ako nije jasno.
KATEGORIJA: food, transport, shopping, entertainment, bills, health, other.
DATUM: YYYY-MM-DD.

RATE / OBROČNA OTPLATA (VAŽNO za Diners, Visa Premium, Mastercard kreditne kartice):
- Ako opis sadrži notaciju "(n/m)", "(n od m)", "rata n/m", "obrok n/m" (npr. "EMMEZETA (6/7)", "Pandora Joker (3/3)") → postavi:
  - is_installment = true
  - installment_current = trenutna rata (broj prije /)
  - installment_total = ukupan broj rata (broj poslije /)
  - installment_base_description = opis BEZ zagrade s ratom (npr. "EMMEZETA", "Pandora Joker")
- Inače is_installment = false i ostala installment polja null.

DATUM KNJIŽENJA ZA KARTIČNE IZVODE (Diners, Visa Premium, Mastercard kreditne):
- Na takvim izvodima "Datum" uz svaku stavku je datum ORIGINALNE kupnje (npr. rata kupljena 05.09.25), ali NAPLATA se događa na datum dospijeća iz zaglavlja ("Platiti do: 20.03.2026").
- Za SVAKU stavku koja je rata ili kartična transakcija s retroaktivnim datumom, postavi due_date_override = datum dospijeća/naplate iz zaglavlja izvoda (YYYY-MM-DD).
- Ako izvod nije kartični (žiro, tekući račun), due_date_override = null.

ZBIRNI REDOVI (NE knjižiti kao običan expense):
- Redak tipa "Specifikacija troškova na prodajnim mjestima - [Card] (xxxx) [iznos] EUR" je SUMARNI total za karticu.
- Redak tipa "Ukupno troškovi usluga ESB", "Sveukupno novi troškovi", "Ukupno dugovanje/preplata" je SUMARNI total.
- Za TE retke postavi is_statement_total = true (svejedno popuni date/description/amount).
- Pojedinačne stavke u tablici (rate, transakcije) imaju is_statement_total = false.

METAPODACI:
- detected_bank, account_iban, holder_name iz zaglavlja izvoda.
- statement_due_date: ako je kartični izvod s datumom dospijeća ("Platiti do: DD.MM.YYYY"), vrati YYYY-MM-DD.`
          },
          {
            role: 'user',
            content: isHTML ? [
              {
                type: 'text',
                text: htmlTablePayload
                  ? `Bankovni izvod — tablica je već izvučena iz HTML-a. Vrati transakciju za SVAKI redak.\n\n${htmlTablePayload}\n\nNapomena: detected_bank, account_iban i holder_name pokušaj prepoznati iz redaka/opisa ako nisu vidljivi u zaglavlju.`
                  : `Analiziraj ovaj HTML bankovni izvod i izvuci sve transakcije iz glavne tablice.\n\nHTML:\n${htmlContent}`
              }
            ] : [
              {
                type: 'text',
                text: `Analiziraj ${isImage ? 'ovu fotografiju bankovnog izvoda' : 'ovaj bankovni izvod'}. Izvuci banku, IBAN, holder_name i SVE transakcije iz glavne tablice.`
              },
              {
                type: 'image_url',
                image_url: {
                  url: pdfBase64.startsWith('data:') ? pdfBase64 : 
                    isImage ? `data:image/jpeg;base64,${pdfBase64}` : `data:application/pdf;base64,${pdfBase64}`
                }
              }
            ]
          }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'extract_transactions',
              description: 'Extract bank info and transactions from a bank statement',
              parameters: {
                type: 'object',
                properties: {
                  detected_bank: {
                    type: 'string',
                    description: 'Detected bank name (e.g., PBZ, Erste, Zaba, Revolut, Aircash, OTP, RBA)',
                    nullable: true
                  },
                  account_iban: {
                    type: 'string',
                    description: 'Main account IBAN or account number from the statement',
                    nullable: true
                  },
                  holder_name: {
                    type: 'string',
                    description: 'Name of the account holder as shown on the statement',
                    nullable: true
                  },
                  transactions: {
                    type: 'array',
                    description: 'List of extracted transactions',
                    items: {
                      type: 'object',
                      properties: {
                        date: { 
                          type: 'string', 
                          description: 'Transaction date in YYYY-MM-DD format' 
                        },
                        description: { 
                          type: 'string', 
                          description: 'Enriched transaction description including merchant name and card info if visible. Example: "KONZUM P-1234 Zagreb [Visa *7262]"' 
                        },
                        amount: { 
                          type: 'number', 
                          description: 'Transaction amount (always positive)' 
                        },
                        type: { 
                          type: 'string', 
                          enum: ['income', 'expense', 'transfer'],
                          description: 'Transaction type: income for real income, expense for real costs, transfer for internal transfers between own accounts' 
                        },
                        category: { 
                          type: 'string', 
                          enum: ['food', 'transport', 'shopping', 'entertainment', 'bills', 'health', 'other'],
                          description: 'Transaction category' 
                        },
                        merchant_name: { 
                          type: 'string', 
                          description: 'Merchant or recipient name if available',
                          nullable: true
                        },
                        card_last4: {
                          type: 'string',
                          description: 'Last 4 digits of card used (e.g., "1234"), if different cards are used',
                          nullable: true
                        },
                        card_type: {
                          type: 'string',
                          enum: ['visa', 'visa_gold', 'visa_platinum', 'mastercard', 'mastercard_gold', 'mastercard_platinum', 'maestro', 'amex', 'diners', 'bank', 'cash', 'revolut', 'aircash', 'crypto', 'other'],
                          description: 'Detected card/payment type from transaction. Use visa/mastercard variants when card type is visible.',
                          nullable: true
                        },
                        is_installment: {
                          type: 'boolean',
                          description: 'True if description contains installment notation like (6/7) or "rata n/m". Default false.'
                        },
                        installment_current: {
                          type: 'number',
                          description: 'Current installment number (n in n/m). Null if not an installment.',
                          nullable: true
                        },
                        installment_total: {
                          type: 'number',
                          description: 'Total installment count (m in n/m). Null if not an installment.',
                          nullable: true
                        },
                        installment_base_description: {
                          type: 'string',
                          description: 'Description without the (n/m) suffix, e.g. "EMMEZETA" instead of "EMMEZETA (6/7)". Null if not an installment.',
                          nullable: true
                        },
                        due_date_override: {
                          type: 'string',
                          description: 'For credit-card statements: the actual billing/charge date (YYYY-MM-DD), different from the original purchase date in `date`. Null for non-credit statements.',
                          nullable: true
                        },
                        is_statement_total: {
                          type: 'boolean',
                          description: 'True if this row is a per-card summary total (e.g. "Specifikacija troškova - Diners (8881) 788,10 EUR") rather than an individual transaction. Default false.'
                        }
                      },
                      required: ['date', 'description', 'amount', 'type', 'category']
                    }
                  },
                  total_income: {
                    type: 'number',
                    description: 'Sum of all income transactions'
                  },
                  total_expenses: {
                    type: 'number',
                    description: 'Sum of all expense transactions'
                  },
                  statement_due_date: {
                    type: 'string',
                    description: 'For credit-card statements: charge/billing due date (YYYY-MM-DD) from header ("Platiti do: DD.MM.YYYY"). Null otherwise.',
                    nullable: true
                  }
                },
                required: ['transactions', 'total_income', 'total_expenses']
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'extract_transactions' } }
      })
    });

    if (!aiResponse.ok) {
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
      throw new Error('AI gateway error');
    }

    const aiData = await aiResponse.json();
    console.log('AI response structure:', JSON.stringify(aiData, null, 2));

    // Check if the response contains an error
    if (aiData.error) {
      console.error('AI gateway returned error:', aiData.error);
      return new Response(
        JSON.stringify({ error: `AI greška: ${aiData.error.message || 'Nepoznata greška'}` }), 
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract from tool call response
    let statementData: { 
      transactions: any[]; 
      total_income: number; 
      total_expenses: number;
      detected_bank?: string | null;
      account_iban?: string | null;
    } = { transactions: [], total_income: 0, total_expenses: 0, detected_bank: null, account_iban: null };
    
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        statementData = JSON.parse(toolCall.function.arguments);
        console.log('Parsed tool call data:', statementData);
      } catch (parseError) {
        console.error('Failed to parse tool call arguments:', parseError);
      }
    } else {
      // Fallback: try to parse from content
      const content = aiData.choices?.[0]?.message?.content || '';
      console.log('No tool call found, trying content:', content);
      
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          statementData = JSON.parse(jsonMatch[0]);
        }
      } catch (parseError) {
        console.error('Failed to parse content:', parseError);
      }
    }

    // Sanitize text: remove garbled/binary characters
    function sanitizeText(text: string | null | undefined): string | null {
      if (!text) return null;
      const cleaned = text.replace(/[^\x20-\x7E\u00A0-\u024F\u0400-\u04FF\u0100-\u017F\u2000-\u206F\u20AC\n\r\t čćžšđČĆŽŠĐ]/g, '').trim();
      if (cleaned.length < text.trim().length * 0.5) {
        console.warn('Garbled text detected, discarding:', text.substring(0, 50));
        return null;
      }
      return cleaned || null;
    }

    // Normalize various date formats to canonical YYYY-MM-DD.
    // Accepts: YYYY-MM-DD, DD.MM.YYYY, DD.MM.YY, DD/MM/YYYY, DD/MM/YY, DD-MM-YYYY.
    // Returns null for anything that isn't a real calendar date.
    function normalizeDate(input: unknown): string | null {
      if (typeof input !== 'string') return null;
      const s = input.trim();
      if (!s) return null;

      let y: number | null = null, m: number | null = null, d: number | null = null;
      let match: RegExpMatchArray | null;

      if ((match = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) {
        y = +match[1]; m = +match[2]; d = +match[3];
      } else if ((match = s.match(/^(\d{1,2})[.\/\-](\d{1,2})[.\/\-](\d{2}|\d{4})\.?$/))) {
        d = +match[1]; m = +match[2];
        const yy = +match[3];
        y = match[3].length === 2 ? 2000 + yy : yy;
      } else {
        return null;
      }

      if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null;

      const dt = new Date(Date.UTC(y, m - 1, d));
      if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;

      const mm = String(m).padStart(2, '0');
      const dd = String(d).padStart(2, '0');
      return `${y}-${mm}-${dd}`;
    }

    // Filter and sanitize transactions; preserve installment + statement-total metadata
    const rawTransactions = statementData.transactions || [];
    let droppedInvalidDate = 0;
    const transactions = rawTransactions.map((t: any) => {
      const normDate = normalizeDate(t.date);
      const normDueOverride = normalizeDate(t.due_date_override);
      return {
        ...t,
        // Fall back to due_date_override if primary date is unparseable.
        date: normDate ?? normDueOverride,
        description: sanitizeText(t.description) || 'Nepoznata transakcija',
        merchant_name: sanitizeText(t.merchant_name),
        is_installment: t.is_installment === true,
        installment_current: typeof t.installment_current === 'number' ? t.installment_current : null,
        installment_total: typeof t.installment_total === 'number' ? t.installment_total : null,
        installment_base_description: sanitizeText(t.installment_base_description),
        due_date_override: normDueOverride,
        is_statement_total: t.is_statement_total === true,
      };
    }).filter((t: any) => {
      if (!t.date) {
        droppedInvalidDate += 1;
        return false;
      }
      if (t.description === 'Nepoznata transakcija' && !t.merchant_name) {
        console.warn('Skipping transaction with unreadable text, amount:', t.amount);
        return false;
      }
      return true;
    });

    if (droppedInvalidDate > 0) {
      console.warn(`WARN: dropped ${droppedInvalidDate} transaction(s) with invalid/unrecognised date format`);
    }

    const detectedBank = sanitizeText(statementData.detected_bank) || null;
    const accountIban = sanitizeText(statementData.account_iban) || null;
    const holderName = sanitizeText((statementData as any).holder_name) || null;
    const statementDueDate = normalizeDate((statementData as any).statement_due_date);
    // Exclude statement-total rows from income/expense sums to avoid double counting
    const totalIncome = statementData.total_income || transactions.filter((t: any) => t.type === 'income' && !t.is_statement_total).reduce((sum: number, t: any) => sum + (t.amount || 0), 0);
    const totalExpenses = statementData.total_expenses || transactions.filter((t: any) => t.type === 'expense' && !t.is_statement_total).reduce((sum: number, t: any) => sum + (t.amount || 0), 0);

    // Group transactions by card if multiple cards detected
    const cardGroups = new Map<string, number>();
    transactions.forEach((t: any) => {
      if (t.card_last4) {
        cardGroups.set(t.card_last4, (cardGroups.get(t.card_last4) || 0) + 1);
      }
    });

    console.log(`Extracted ${transactions.length} transactions from ${detectedBank || 'unknown bank'}, account: ${accountIban || 'unknown'}`);
    console.log(`Cards detected: ${cardGroups.size > 0 ? Array.from(cardGroups.entries()).map(([card, count]) => `*${card} (${count})`).join(', ') : 'none'}`);

    // Diagnostic: warn when AI under-returned vs deterministic row count
    if (htmlRowCount > 0 && transactions.length < Math.max(3, Math.floor(htmlRowCount * 0.5))) {
      console.warn(`WARN: AI returned ${transactions.length} of ${htmlRowCount} parsed HTML rows (size=${fileSizeKB} KB)`);
    } else if (transactions.length < 3 && fileSizeKB > 5) {
      console.warn(`WARN: suspiciously few transactions extracted (size=${fileSizeKB} KB, returned=${transactions.length}).`);
    }

    return new Response(
      JSON.stringify({
        transactions,
        detected_bank: detectedBank,
        account_iban: accountIban,
        holder_name: holderName,
        cards_detected: Array.from(cardGroups.keys()),
        statement_due_date: statementDueDate,
        summary: {
          total_income: totalIncome,
          total_expenses: totalExpenses,
          transaction_count: transactions.length
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error processing PDF statement:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});