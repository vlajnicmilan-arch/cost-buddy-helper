import { checkAiCostCap, recordAiCost } from "../_shared/aiCostCap.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireAuth, checkAiQuota, corsHeaders } from "../_shared/aiQuota.ts";
import { callGemini } from "../_shared/geminiClient.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await requireAuth(req);
    if (auth instanceof Response) return auth;

    const quota = await checkAiQuota(auth.supabase, auth.userId, "categorize-transaction");
    if (quota) return quota;

    const { description, merchant_name, custom_categories, items, allowed_categories } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    if (!description && !merchant_name && (!items || items.length === 0)) {
      return new Response(JSON.stringify({ category: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const defaultCategories = [
      "food", "transport", "shopping", "entertainment", "bills", "health",
      "groceries", "utilities", "rent", "education", "travel", "clothing",
      "beauty", "sports", "pets", "gifts", "subscriptions", "savings",
      "investments", "charity", "kids", "home", "car", "insurance", "taxes", "other"
    ];

    // Kad klijent pošalje dopušteni popis (trošak vezan uz projekt),
    // AI bira ISKLJUČIVO iz njega — osobne kategorije se ne nude.
    const restricted = Array.isArray(allowed_categories) && allowed_categories.length > 0;
    const allowedList: { id: string; name?: string }[] = restricted ? allowed_categories : [];
    const allCategories = restricted
      ? allowedList.map((c) => String(c.id))
      : [...defaultCategories, ...(custom_categories || [])];
    const categoryLines = restricted
      ? allowedList.map((c) => `- ${c.id}${c.name ? ` → ${c.name}` : ""}`).join("\n")
      : "";

    // Build items context if available
    const itemsContext = items && items.length > 0
      ? `\nReceipt items: ${items.map((i: any) => i.name).join(", ")}`
      : "";

    const prompt = restricted
      ? `You are a transaction categorizer for a project expense.

Choose exactly ONE category key from this list (Croatian names in parentheses):
${categoryLines}

Rules:
- Building materials, supplies → material
- Own/hired manual work, wages → labor
- Invoices from another company doing part of the job → subcontractor
- Tools, machines, rentals → equipment
- Delivery, fuel, freight → transport
- Permits, administrative fees → permits
- Software licences, hosting, SaaS → licenses
- Advertising spend → ads
- Video/photo/print production → production
- Venue rental → venue
- Food and drinks for an event → catering
- Lecturers, trainers → instructors
- Demolition, waste removal → demolition
- Furniture and fittings → furniture
- If unsure → other

Return ONLY the category key, nothing else.`
      : `You are a transaction categorizer. Given a transaction description, merchant name, and/or receipt items, return the single most appropriate category.

IMPORTANT: If receipt items are provided, prioritize them over the generic description to determine the category. For example, if the description says "Weekly shopping" but the items are all coffee/drinks, categorize as "food" not "shopping".

Available categories: ${allCategories.join(", ")}

Rules:
- Coffee, tea, drinks, beverages from cafes or shops → food
- Supermarkets, grocery stores (Konzum, Lidl, Kaufland, Spar, Plodine, Interspar, Tommy, Studenac, Billa, Aldi, Penny, dm) → groceries
- Restaurants, cafes, bakeries, fast food, bars → food
- Gas stations, parking, tolls, public transit → transport
- Car repair, tires, car wash, registration → car
- Pharmacy, doctor, hospital, dentist → health
- Electricity, water, gas, internet, phone → utilities
- Netflix, Spotify, YouTube, Disney+, HBO → subscriptions
- Rent, mortgage payments → rent
- Clothing stores (H&M, Zara, C&A, New Yorker) → clothing
- Beauty, hairdresser, cosmetics → beauty
- School, courses, books, tuition → education
- Hotels, flights, Airbnb → travel
- Insurance premiums → insurance
- Gym, sports equipment → sports
- Pet food, vet → pets
- Amazon, online shopping, electronics → shopping
- If unsure → other

Return ONLY the category name, nothing else.`;

    const __cap = await checkAiCostCap(auth.supabase);
    if (__cap) return __cap;
    const response = await callGemini({
      model: "google/gemini-2.5-flash-lite",
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: `Description: ${description || "N/A"}\nMerchant: ${merchant_name || "N/A"}${itemsContext}` },
      ],
      max_tokens: 20,
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ category: null, error: "rate_limited" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      recordAiCost(auth.supabase, "categorize-transaction").catch(() => {});
      if (response.status === 402) {
        return new Response(JSON.stringify({ category: null, error: "payment_required" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error("AI gateway error:", response.status);
      return new Response(JSON.stringify({ category: null }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const rawCategory = data.choices?.[0]?.message?.content?.trim().toLowerCase() || null;

    // Validate the category
    const category = rawCategory && allCategories.includes(rawCategory) ? rawCategory : null;

    return new Response(JSON.stringify({ category }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("categorize error:", e);
    return new Response(JSON.stringify({ category: null, error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
