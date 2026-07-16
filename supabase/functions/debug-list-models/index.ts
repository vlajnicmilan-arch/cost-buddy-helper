Deno.serve(async () => {
  const key = Deno.env.get("GOOGLE_GEMINI_API_KEY")!;
  const targets = [
    "gemini-3-flash-preview",
    "gemini-3-pro-preview",
    "gemini-3.1-pro-preview",
    "gemini-3.1-flash-lite",
    "gemini-3.1-flash-lite-preview",
    "gemini-3.5-flash",
    "gemini-flash-latest",
    "gemini-flash-lite-latest",
    "gemini-pro-latest",
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
    let resolved: string | undefined;
    try { resolved = JSON.parse(t).modelVersion; } catch {}
    out.push({ model: m, status: r.status, resolved, snippet: t.slice(0, 120) });
  }
  return new Response(JSON.stringify(out, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
