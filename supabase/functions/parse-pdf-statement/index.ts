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
    const { pdfBase64, bankType, isImage } = await req.json();

    if (!pdfBase64) {
      return new Response(
        JSON.stringify({ error: 'No file provided' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check size (max ~5MB base64 = ~7MB string)
    const fileSizeKB = Math.round(pdfBase64.length / 1024);
    console.log('Processing statement for user:', userId, 'bank:', bankType, 'isImage:', isImage, 'size:', fileSizeKB, 'KB');

    if (pdfBase64.length > 7 * 1024 * 1024) {
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
            content: `Ti si asistent za analizu bankovnih izvoda i fotografija izvoda. Analiziraj dokument/fotografiju i izvuci SVE transakcije.

VAŽNO ZA FOTOGRAFIJE:
- Fotografija može biti papirni izvod, screenshot iz aplikacije, ili potvrda transakcije
- Čitaj pažljivo čak i ako je kvaliteta slike lošija
- Ako ne možeš pročitati neki iznos ili datum, preskoči tu transakciju

PRAVILA ZA DETEKCIJU:
1. BANKA - prepoznaj naziv banke iz zaglavlja/logotipa (PBZ, Erste, Zaba, Revolut, Aircash, OTP, RBA, Addiko, itd.)
2. IBAN/RAČUN - pronađi glavni IBAN ili broj računa vlasnika izvoda
3. KARTICE - ako transakcija pokazuje drugačiju karticu (zadnje 4 znamenke), izdvoji to

PRAVILA ZA TRANSAKCIJE:
- Iznos je UVIJEK pozitivan broj
- Tip može biti:
  - "income" za STVARNE prihode (plaća, primanja od trećih osoba, povrat)
  - "expense" za STVARNE troškove (kupovina, plaćanja, računi)
  - "transfer" za INTERNE prijenose između vlastitih računa (npr. toplanje Aircash/Revolut, prebacivanje na vlastiti račun)
- VAŽNO: Prepoznaj interne prijenose! Ključne riječi: "top up", "nadoplata", "uplata na Aircash/Revolut", "prijenos na vlastiti račun", "podizanje gotovine", "ATM"
- Kategorije: food, transport, shopping, entertainment, bills, health, other
- Datum u formatu YYYY-MM-DD

PRAVILA ZA OPIS TRANSAKCIJE:
- Uključi naziv trgovca/primatelja
- Ako je vidljivo, dodaj tip kartice (Visa, Mastercard, itd.)
- Ako je vidljivo, dodaj zadnje 4 znamenke kartice u formatu [Visa *1234]
- Ako je različita kartica od glavne, naznači to
- Primjer obogaćenog opisa: "KONZUM P-1234 Zagreb [Visa *7262]" ili "Wolt Zagreb [Mastercard *4521]"

payment_source opcije:
- "cash" za gotovinu
- "bank" za generičku banku
- "visa", "visa_gold", "visa_platinum" za Visa kartice
- "mastercard", "mastercard_gold", "mastercard_platinum" za Mastercard
- "maestro" za Maestro kartice
- "amex" za American Express
- "diners" za Diners Club
- "revolut" za Revolut
- "aircash" za Aircash
- "crypto" za kripto

- card_last4: zadnje 4 znamenke kartice ako je vidljivo (npr. "*1234" ili "VISA ****5678")
- Ako ne možeš naći transakcije, vrati prazan niz`
          },
          {
            role: 'user',
            content: [
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

    const transactions = statementData.transactions || [];
    const detectedBank = statementData.detected_bank || null;
    const accountIban = statementData.account_iban || null;
    const holderName = (statementData as any).holder_name || null;
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