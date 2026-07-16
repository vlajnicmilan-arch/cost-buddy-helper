// Temporary diagnostic — lists Google Gemini models visible to this API key.
Deno.serve(async () => {
  const key = Deno.env.get("GOOGLE_GEMINI_API_KEY");
  if (!key) return new Response("no key", { status: 500 });
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=200`);
  const data = await r.json();
  const models = (data.models ?? [])
    .filter((m: any) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
    .map((m: any) => ({
      name: m.name,
      methods: m.supportedGenerationMethods,
    }));
  return new Response(JSON.stringify({ count: models.length, models }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
