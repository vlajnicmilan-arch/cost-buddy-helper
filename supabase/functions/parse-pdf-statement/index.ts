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
    const { pdfBase64, bankType } = await req.json();

    if (!pdfBase64) {
      return new Response(
        JSON.stringify({ error: 'No PDF provided' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Processing PDF statement for user:', userId, 'bank:', bankType);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Use Gemini with tool calling for structured output
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          {
            role: 'system',
            content: `Ti si asistent za analizu bankovnih izvoda. Analiziraj tekst izvoda i izvuci SVE transakcije.
Banka/izvor: ${bankType || 'nepoznato'}

PRAVILA:
- Iznos je UVIJEK pozitivan broj
- Tip je "income" za uplate/priljeve, "expense" za isplate/odljeve
- Kategorije: food, transport, shopping, entertainment, bills, health, other
- Datum u formatu YYYY-MM-DD
- Ako ne možeš naći transakcije, vrati prazan niz`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analiziraj ovaj bankovni izvod i izvuci sve transakcije. Ako je dokument nečitljiv ili nije bankovni izvod, vrati prazan niz transakcija.`
              },
              {
                type: 'image_url',
                image_url: {
                  url: pdfBase64.startsWith('data:') ? pdfBase64 : `data:application/pdf;base64,${pdfBase64}`
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
              description: 'Extract transactions from a bank statement',
              parameters: {
                type: 'object',
                properties: {
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
                          description: 'Transaction description' 
                        },
                        amount: { 
                          type: 'number', 
                          description: 'Transaction amount (always positive)' 
                        },
                        type: { 
                          type: 'string', 
                          enum: ['income', 'expense'],
                          description: 'Transaction type' 
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

    // Extract from tool call response
    let statementData = { transactions: [], total_income: 0, total_expenses: 0 };
    
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
    const totalIncome = statementData.total_income || transactions.filter((t: any) => t.type === 'income').reduce((sum: number, t: any) => sum + (t.amount || 0), 0);
    const totalExpenses = statementData.total_expenses || transactions.filter((t: any) => t.type === 'expense').reduce((sum: number, t: any) => sum + (t.amount || 0), 0);

    console.log(`Extracted ${transactions.length} transactions`);

    return new Response(
      JSON.stringify({
        transactions,
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