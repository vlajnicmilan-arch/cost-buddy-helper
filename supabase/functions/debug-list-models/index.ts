Deno.serve(async () => {
  const key = Deno.env.get("GOOGLE_GEMINI_API_KEY")!;
  const targets = [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.5-pro",
    "gemini-2.0-flash-001",
    "gemini-2.0-flash-lite-001",
    "gemini-3-flash-preview",
  ];
  const out: any[] = [];
  for (const m of targets) {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`,
      {
        method: "POST",
        headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "reply with just: ok" }] }],
          generationConfig: { maxOutputTokens: 5 },
        }),
      },
    );
    const t = await r.text();
    out.push({ model: m, status: r.status, snippet: t.slice(0, 200) });
  }
  return new Response(JSON.stringify(out, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
