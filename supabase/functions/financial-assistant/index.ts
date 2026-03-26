import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Tool definitions for the AI agent
const tools = [
  {
    type: "function",
    function: {
      name: "search_transactions",
      description: "Search user's transactions with flexible filters. Use this to find specific transactions by description, category, merchant, date range, payment source, type, or expense_nature (e.g. 'correction' for balance corrections).",
      parameters: {
        type: "object",
        properties: {
          description: { type: "string", description: "Search in transaction description (partial match)" },
          category: { type: "string", description: "Filter by category name" },
          merchant_name: { type: "string", description: "Filter by merchant name (partial match)" },
          payment_source: { type: "string", description: "Filter by payment source name (partial match)" },
          type: { type: "string", enum: ["expense", "income", "transfer"], description: "Filter by transaction type" },
          expense_nature: { type: "string", description: "Filter by expense nature, e.g. 'correction' for balance corrections" },
          date_from: { type: "string", description: "Start date (YYYY-MM-DD)" },
          date_to: { type: "string", description: "End date (YYYY-MM-DD)" },
          limit: { type: "number", description: "Max results to return (default 20)" },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_payment_source_details",
      description: "Get detailed info about a specific payment source (account) including balance, cards, and recent corrections.",
      parameters: {
        type: "object",
        properties: {
          source_name: { type: "string", description: "Name of the payment source (partial match)" },
        },
        required: ["source_name"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_savings_goals",
      description: "Get all savings goals with current progress.",
      parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recurring_transactions",
      description: "Get all recurring (repeating) transactions.",
      parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "get_category_analysis",
      description: "Analyze spending by category for a given date range.",
      parameters: {
        type: "object",
        properties: {
          date_from: { type: "string", description: "Start date (YYYY-MM-DD)" },
          date_to: { type: "string", description: "End date (YYYY-MM-DD)" },
          category: { type: "string", description: "Specific category to analyze (optional)" },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
];

// Execute a tool call against the database
async function executeTool(
  toolName: string,
  args: Record<string, any>,
  userId: string,
  supabase: any
): Promise<string> {
  try {
    switch (toolName) {
      case "search_transactions": {
        let query = supabase
          .from("expenses")
          .select("id, description, amount, type, category, date, merchant_name, payment_source, expense_nature, note, created_at")
          .eq("user_id", userId)
          .order("date", { ascending: false })
          .limit(args.limit || 20);

        if (args.description) query = query.ilike("description", `%${args.description}%`);
        if (args.category) query = query.ilike("category", `%${args.category}%`);
        if (args.merchant_name) query = query.ilike("merchant_name", `%${args.merchant_name}%`);
        if (args.type) query = query.eq("type", args.type);
        if (args.expense_nature) query = query.eq("expense_nature", args.expense_nature);
        if (args.date_from) query = query.gte("date", args.date_from);
        if (args.date_to) query = query.lte("date", args.date_to);

        // Handle payment_source filter by looking up source IDs by name
        if (args.payment_source) {
          const { data: sources } = await supabase
            .from("custom_payment_sources")
            .select("id, name")
            .eq("user_id", userId)
            .ilike("name", `%${args.payment_source}%`);
          
          if (sources && sources.length > 0) {
            const sourceIds = sources.map((s: any) => s.id);
            query = query.in("payment_source", sourceIds);
          } else {
            // Also try matching against the raw payment_source field
            query = query.ilike("payment_source", `%${args.payment_source}%`);
          }
        }

        const { data, error } = await query;
        if (error) return JSON.stringify({ error: error.message });

        // Enrich with payment source names
        if (data && data.length > 0) {
          const sourceIds = [...new Set(data.filter((t: any) => t.payment_source).map((t: any) => t.payment_source))];
          if (sourceIds.length > 0) {
            const { data: sources } = await supabase
              .from("custom_payment_sources")
              .select("id, name")
              .in("id", sourceIds);
            const sourceMap = new Map((sources || []).map((s: any) => [s.id, s.name]));
            data.forEach((t: any) => {
              if (t.payment_source && sourceMap.has(t.payment_source)) {
                t.payment_source_name = sourceMap.get(t.payment_source);
              }
            });
          }
        }

        return JSON.stringify({ count: data?.length || 0, transactions: data || [] });
      }

      case "get_payment_source_details": {
        const { data: sources, error } = await supabase
          .from("custom_payment_sources")
          .select("id, name, balance, color, icon, currency, description")
          .eq("user_id", userId)
          .ilike("name", `%${args.source_name}%`);

        if (error) return JSON.stringify({ error: error.message });
        if (!sources || sources.length === 0) return JSON.stringify({ message: "Nije pronađen izvor plaćanja s tim imenom." });

        // Get cards for these sources
        const sourceIds = sources.map((s: any) => s.id);
        const { data: cards } = await supabase
          .from("payment_source_cards")
          .select("id, card_name, card_type, last_four_digits, payment_source_id")
          .in("payment_source_id", sourceIds);

        // Get recent corrections
        const { data: corrections } = await supabase
          .from("expenses")
          .select("id, description, amount, type, date, created_at")
          .eq("user_id", userId)
          .eq("expense_nature", "correction")
          .in("payment_source", sourceIds)
          .order("date", { ascending: false })
          .limit(10);

        return JSON.stringify({
          sources: sources,
          cards: cards || [],
          recent_corrections: corrections || [],
        });
      }

      case "get_savings_goals": {
        const { data, error } = await supabase
          .from("savings_goals")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false });

        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify({ goals: data || [] });
      }

      case "get_recurring_transactions": {
        const { data, error } = await supabase
          .from("recurring_transactions")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false });

        if (error) return JSON.stringify({ error: error.message });
        return JSON.stringify({ recurring_transactions: data || [] });
      }

      case "get_category_analysis": {
        let query = supabase
          .from("expenses")
          .select("category, amount, type, date")
          .eq("user_id", userId)
          .eq("type", "expense");

        if (args.date_from) query = query.gte("date", args.date_from);
        if (args.date_to) query = query.lte("date", args.date_to);
        if (args.category) query = query.ilike("category", `%${args.category}%`);

        const { data, error } = await query;
        if (error) return JSON.stringify({ error: error.message });

        // Aggregate by category
        const categoryTotals: Record<string, { total: number; count: number }> = {};
        (data || []).forEach((t: any) => {
          if (!categoryTotals[t.category]) categoryTotals[t.category] = { total: 0, count: 0 };
          categoryTotals[t.category].total += Number(t.amount);
          categoryTotals[t.category].count += 1;
        });

        const sorted = Object.entries(categoryTotals)
          .sort((a, b) => b[1].total - a[1].total)
          .map(([category, info]) => ({ category, ...info }));

        return JSON.stringify({
          date_range: { from: args.date_from || "all", to: args.date_to || "all" },
          categories: sorted,
          total: sorted.reduce((sum, c) => sum + c.total, 0),
        });
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
  } catch (err) {
    console.error(`Tool execution error (${toolName}):`, err);
    return JSON.stringify({ error: `Greška pri izvršavanju: ${err instanceof Error ? err.message : "Nepoznata greška"}` });
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, financialContext } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Extract user_id from auth token
    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;

    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      // Try to get user from the token (it might be anon key or user JWT)
      const supabaseAuth = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      
      try {
        const { data } = await supabaseAuth.auth.getUser();
        userId = data?.user?.id || null;
      } catch {
        // Not a user JWT, that's ok
      }
    }

    // Create service-role client for tool execution
    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Build system prompt
    const systemPrompt = `Ti si osobni financijski AI asistent u aplikaciji V&M Balance.

TVOJA ULOGA:
Kombinacija stručnog financijskog savjetnika i logoterapijskog vodiča. Pomažeš korisniku pronaći smisao u upravljanju novcem i preuzeti odgovornost za svoje financije.

STIL KOMUNIKACIJE:
- SAŽETO: 2-4 rečenice. Bez dugih uvoda.
- PRAKTIČNO: Konkretni brojevi, izvedive akcije.
- PROAKTIVNO: Daj prijedloge i postavljaj pitanja!
- LOGOTERAPIJSKI: Smisao i odgovornost, bez osude.

VAŽNO - PRISTUP PODACIMA:
Imaš pristup korisnikovim financijskim podacima putem alata (tools). KORISTI ALATE kad god korisnik traži specifične informacije koje nisu u sažetku ispod. Na primjer:
- "Kad sam radio korekciju?" → pozovi search_transactions s expense_nature="correction"
- "Koliko sam potrošio na hranu u veljači?" → pozovi get_category_analysis s datumima
- "Što imam na OTP računu?" → pozovi get_payment_source_details
- "Koje imam štedne ciljeve?" → pozovi get_savings_goals
- "Koje mi se transakcije ponavljaju?" → pozovi get_recurring_transactions

AKTIVNO POSTAVLJAJ PITANJA (uvijek završi s pitanjem kad je relevantno):
- "Što ti je najvažnije postići ovaj mjesec?"
- "Primjećujem porast u [kategorija] - je li to planirano?"
- "Imaš stabilan prihod - razmišljaš li o štednji za nešto konkretno?"

MOGUĆNOSTI V&M BALANCE - PODSJEĆAJ AKTIVNO:
- 📷 SLIKATI RAČUNE - kamera izvlači podatke automatski
- 🖼️ UČITATI IZ GALERIJE - slike koje već imaš
- 📱 SCREENSHOT - iz banking appa pa učitaj
- 📊 IZVJEŠTAJI - mjesečna analiza na gumb

KONTEKST KORISNIKOVIH FINANCIJA (brzi pregled):
${financialContext ? `
- Ukupni saldo: ${financialContext.balance}
- Ukupni prihodi ovaj mjesec: ${financialContext.totalIncome}
- Ukupni rashodi ovaj mjesec: ${financialContext.totalExpenses}
- Broj transakcija: ${financialContext.transactionCount}

RASPODJELA TROŠKOVA PO KATEGORIJAMA (ovaj mjesec):
${financialContext.categoryBreakdown || 'Nema podataka o kategorijama'}

IZVORI PLAĆANJA (računi):
${financialContext.paymentSources || 'Nema podataka o izvorima plaćanja'}

KARTICE KORISNIKA:
${financialContext.cards || 'Nema povezanih kartica'}

NEDAVNE TRANSAKCIJE:
${financialContext.recentTransactions || 'Nema nedavnih transakcija'}

BUDŽETI:
${financialContext.budgets || 'Nema aktivnih budžeta'}

PROJEKTI:
${financialContext.projects || 'Nema aktivnih projekata'}

POVIJEST PO MJESECIMA (zadnjih 6 mjeseci):
${financialContext.historicalTrends || 'Nema povijesnih podataka'}

${financialContext.trendAnalysis || ''}
` : 'Korisnik još nema podataka. Predloži: "Počni tako da slikaš prvi račun ili učitaš sliku iz galerije - ja ću napraviti ostatak!"'}

PRAVILA:
1. MAX 2-4 rečenice + pitanje ili prijedlog
2. Koristi konkretne brojeve iz podataka
3. UVIJEK završi s pitanjem ILI prijedlogom za akciju
4. Kad vidiš priliku - predstavi je pozitivno
5. Logoterapija: "Što ti je važno?" > "Moraš uštedjeti"
6. Predlaži mogućnosti aplikacije kad je relevantno
7. Nikad riječi koje izazivaju krivnju
8. AKO KORISNIK TRAŽI SPECIFIČNE PODATKE - KORISTI ALATE! Ne izmišljaj podatke.

IZVOZ PODATAKA:
Kad korisnik traži izvoz, preuzimanje, ispis ili pripremu podataka za izvoz:
1. Dohvati podatke alatima (search_transactions, get_category_analysis, itd.)
2. OBAVEZNO prikaži rezultate u MARKDOWN TABLICI s jasnim zaglavljima
3. Ispod tablice dodaj tekst: "📥 Koristi gumbe ispod tablice za izvoz u CSV, PDF ili ispis."
4. Tablica MORA imati zaglavlje (header row) i barem jedan redak podataka
5. Koristi čitljive nazive stupaca na hrvatskom (Datum, Opis, Iznos, Kategorija, Izvor, itd.)
6. Iznose formatiraj s 2 decimale i oznakom valute`;

    // Prepare messages for AI with tools
    const aiMessages = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    // Tool-calling loop: keep calling AI until we get a final text response
    const MAX_TOOL_ROUNDS = 5;
    let currentMessages = aiMessages;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const aiBody: any = {
        model: "google/gemini-3-flash-preview",
        messages: currentMessages,
        tools: userId ? tools : undefined, // Only provide tools if we have a user
      };

      // On the last round or if no userId, request streaming for the final answer
      const isLastPossibleRound = round === MAX_TOOL_ROUNDS - 1 || !userId;

      if (isLastPossibleRound) {
        aiBody.stream = true;
      }

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(aiBody),
      });

      if (!response.ok) {
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: "Previše zahtjeva, pokušajte kasnije." }), {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: "Potrebno je nadopuniti kredit." }), {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const errorText = await response.text();
        console.error("AI gateway error:", response.status, errorText);
        return new Response(JSON.stringify({ error: "Greška AI servisa" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // If streaming (final answer), pass through directly
      if (isLastPossibleRound) {
        return new Response(response.body, {
          headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
        });
      }

      // Non-streaming: parse the response to check for tool calls
      const result = await response.json();
      const choice = result.choices?.[0];

      if (!choice) {
        return new Response(JSON.stringify({ error: "Nema odgovora od AI-ja" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // If the AI wants to call tools
      if (choice.finish_reason === "tool_calls" && choice.message?.tool_calls) {
        // Add the assistant message with tool calls
        currentMessages.push(choice.message);

        // Execute each tool call
        for (const toolCall of choice.message.tool_calls) {
          const fnName = toolCall.function.name;
          let fnArgs: Record<string, any> = {};
          try {
            fnArgs = JSON.parse(toolCall.function.arguments || "{}");
          } catch {
            fnArgs = {};
          }

          console.log(`Executing tool: ${fnName}`, fnArgs);
          const toolResult = await executeTool(fnName, fnArgs, userId!, supabaseService);
          
          // Add tool result to messages
          currentMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: toolResult,
          });
        }

        // Continue the loop - AI will process tool results
        continue;
      }

      // AI responded with a regular message (no tool calls) - stream the final response
      // Re-request with streaming enabled
      const streamBody = {
        model: "google/gemini-3-flash-preview",
        messages: currentMessages.concat(choice.message ? [choice.message] : []),
        stream: true,
      };

      // Actually, if we already have a text response, just wrap it as SSE
      if (choice.message?.content) {
        const content = choice.message.content;
        const sseData = `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`;
        return new Response(sseData, {
          headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
        });
      }

      // Fallback: stream from AI
      const finalResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: currentMessages,
          stream: true,
        }),
      });

      return new Response(finalResponse.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    // Should not reach here
    return new Response(JSON.stringify({ error: "Prekoračen broj koraka" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Financial assistant error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Nepoznata greška" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
