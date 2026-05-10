import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }), 
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claimsData.claims.sub;
    const { pdfBase64, bankType, isImage, htmlContent } = await req.json();

    const isHTML = !!htmlContent;

    if (!pdfBase64 && !htmlContent) {
      return new Response(
        JSON.stringify({ error: 'No file provided' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

    // Use Gemini 2.5 Flash for better PDF support
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `Ti si asistent za izvlačenje transakcija iz bankovnih izvoda (HTML, PDF ili fotografija).

CILJ: Pronađi GLAVNU tablicu transakcija u dokumentu i izvuci SVAKI redak iz nje.

ZA HTML IZVODE:
- Pronađi najveću <table> u dokumentu (ona s najviše redaka).
- Svaki <tr> u njenom <tbody> koji ima datum + iznos je transakcija.
- NE preskači redove samo zato jer ti opis djeluje neobično — uplata vlasnika, primitak od kupca, naknada banke, transfer na drugu tvrtku, povrat poreza, kamate — SVE su to transakcije.

ZA PDF I FOTOGRAFIJE:
- Pronađi tablicu transakcija (obično glavni dio dokumenta).
- Pročitaj svaki redak. Ako iznos nije čitljiv, preskoči TAJ jedan redak.

ŠTO NIJE TRANSAKCIJA (jedine 4 iznimke koje preskačeš):
1. "Početno stanje" / "Stanje prije" / "Opening balance"
2. "Konačno stanje" / "Stanje poslije" / "Closing balance"
3. "Promet ukupno" / "Ukupni dugovni promet" / "Ukupni potražni promet" / "Total turnover"
4. "Stanje na dan ..." (sažetak salda na neki datum)

Sve drugo je transakcija — i mora ući u rezultat.

ODREĐIVANJE TIPA (jedino pravilo):
- Iznos u koloni "Uplata" / "Potražuje" / "Korist" / "Credit" / "Haben" / "U korist" → type = "income"
- Iznos u koloni "Isplata" / "Duguje" / "Teret" / "Debit" / "Soll" / "Na teret" → type = "expense"
- Ako je vidljivo da je interni prijenos između vlastitih računa (npr. "Prijenos sredstava na vlastiti račun", "ATM podizanje gotovine", "Top-up Revolut/Aircash") → type = "transfer"
- NE gledaj tko je platitelj/primatelj kad određuješ tip. Gleda se SAMO u kojoj je koloni iznos.
- Iznos vraćaj UVIJEK kao pozitivan broj.

OPIS TRANSAKCIJE:
- Zadrži ORIGINALNI tekst iz izvoda što vjernije možeš (naziv platitelja/primatelja + svrha plaćanja + model i poziv na broj ako postoji).
- NE skraćuj i NE preformuliraj — kasnije nam treba za prepoznavanje pozajmica.

merchant_name: ime druge strane u transakciji (platitelj kod uplate, primatelj kod isplate). Ako nije jasno, ostavi null.

KATEGORIJA: food, transport, shopping, entertainment, bills, health, other. Ako nisi siguran → "other".

DATUM: YYYY-MM-DD.

METAPODACI:
- detected_bank: naziv banke iz zaglavlja (PBZ, Erste, Zaba, Revolut, Aircash, OTP, RBA, Addiko itd.)
- account_iban: glavni IBAN ili broj računa vlasnika izvoda
- holder_name: ime/naziv vlasnika računa kako piše na izvodu

VAŽNO: Ako iz dokumenta s puno teksta vratiš samo 1-2 transakcije, vjerojatno si propustio glavnu tablicu — provjeri ponovo. Bolje uključi previše nego premalo.`
          },
          {
            role: 'user',
            content: isHTML ? [
              {
                type: 'text',
                text: `Analiziraj ovaj HTML bankovni izvod. Izvuci:
1. Naziv banke iz dokumenta
2. Glavni IBAN ili broj računa
3. Sve transakcije s detaljima o kartici ako postoje
4. Ime vlasnika računa (holder_name) ako je vidljivo na izvodu

HTML SADRŽAJ:
${htmlContent}`
              }
            ] : [
              {
                type: 'text',
                text: `Analiziraj ${isImage ? 'ovu fotografiju bankovnog izvoda' : 'ovaj bankovni izvod'}. Izvuci:
1. Naziv banke iz dokumenta
2. Glavni IBAN ili broj računa
3. Sve transakcije s detaljima o kartici ako postoje
4. Ime vlasnika računa (holder_name) ako je vidljivo na izvodu`
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
      // Remove non-printable chars except common whitespace
      const cleaned = text.replace(/[^\x20-\x7E\u00A0-\u024F\u0400-\u04FF\u0100-\u017F\u2000-\u206F\u20AC\n\r\t čćžšđČĆŽŠĐ]/g, '').trim();
      // If more than 30% of original was garbage, it's unreadable
      if (cleaned.length < text.trim().length * 0.5) {
        console.warn('Garbled text detected, discarding:', text.substring(0, 50));
        return null;
      }
      return cleaned || null;
    }

    // Filter and sanitize transactions
    const rawTransactions = statementData.transactions || [];
    const transactions = rawTransactions.map((t: any) => ({
      ...t,
      description: sanitizeText(t.description) || 'Nepoznata transakcija',
      merchant_name: sanitizeText(t.merchant_name),
    })).filter((t: any) => {
      // Skip transactions where both description and merchant are garbled
      if (t.description === 'Nepoznata transakcija' && !t.merchant_name) {
        console.warn('Skipping transaction with unreadable text, amount:', t.amount);
        return false;
      }
      return true;
    });

    const detectedBank = sanitizeText(statementData.detected_bank) || null;
    const accountIban = sanitizeText(statementData.account_iban) || null;
    const holderName = sanitizeText((statementData as any).holder_name) || null;
    const totalIncome = statementData.total_income || transactions.filter((t: any) => t.type === 'income').reduce((sum: number, t: any) => sum + (t.amount || 0), 0);
    const totalExpenses = statementData.total_expenses || transactions.filter((t: any) => t.type === 'expense').reduce((sum: number, t: any) => sum + (t.amount || 0), 0);

    // Group transactions by card if multiple cards detected
    const cardGroups = new Map<string, number>();
    transactions.forEach((t: any) => {
      if (t.card_last4) {
        cardGroups.set(t.card_last4, (cardGroups.get(t.card_last4) || 0) + 1);
      }
    });

    console.log(`Extracted ${transactions.length} transactions from ${detectedBank || 'unknown bank'}, account: ${accountIban || 'unknown'}`);
    console.log(`Cards detected: ${cardGroups.size > 0 ? Array.from(cardGroups.entries()).map(([card, count]) => `*${card} (${count})`).join(', ') : 'none'}`);

    // Diagnostic: warn when input is large but very few transactions came back
    if (transactions.length < 3 && fileSizeKB > 5) {
      console.warn(`WARN: suspiciously few transactions extracted (size=${fileSizeKB} KB, returned=${transactions.length}). Possible prompt/parsing miss.`);
    }

    return new Response(
      JSON.stringify({
        transactions,
        detected_bank: detectedBank,
        account_iban: accountIban,
        holder_name: holderName,
        cards_detected: Array.from(cardGroups.keys()),
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