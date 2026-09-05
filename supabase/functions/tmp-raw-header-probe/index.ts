// PRIVREMENA DIJAGNOSTIKA — vraća SAMO imena polja iz sirovog Mailgun payloada
// i imena zaglavlja iz `message-headers`. Nikakav sadržaj poruke se ne vraća.
// Briše se odmah nakon mjerenja.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

Deno.serve(async (req) => {
  const secret = new URL(req.url).searchParams.get("s");
  if (secret !== Deno.env.get("MAIL_INGEST_PATH_SECRET")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: msgs } = await supabase
    .from("inbound_messages")
    .select("id, body_storage_path, received_at")
    .not("body_storage_path", "is", null)
    .order("received_at", { ascending: false })
    .limit(3);
  const out: unknown[] = [];
  for (const m of msgs ?? []) {
    const { data: blob } = await supabase.storage
      .from("inbound-mail")
      .download(m.body_storage_path as string);
    if (!blob) { out.push({ id: m.id, error: "no_blob" }); continue; }
    const raw = JSON.parse(await blob.text()) as Record<string, string>;
    let headerNames: string[] = [];
    try {
      const parsed = JSON.parse(raw["message-headers"] ?? "[]");
      if (Array.isArray(parsed)) headerNames = parsed.map((e) => String(e?.[0] ?? ""));
    } catch { headerNames = ["<neispravan JSON>"]; }
    out.push({ id: m.id, fields: Object.keys(raw), headerNames });
  }
  return new Response(JSON.stringify(out, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
