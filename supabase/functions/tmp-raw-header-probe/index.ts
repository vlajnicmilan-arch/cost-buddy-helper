// PRIVREMENA DIJAGNOSTIKA — vraća SAMO imena polja iz sirovog Mailgun payloada
// i imena zaglavlja iz `message-headers`. Nikakav sadržaj poruke se ne vraća.
// Briše se odmah nakon mjerenja.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

Deno.serve(async (req) => {
  if (req.headers.get("x-probe") !== "1") {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: msgs } = await supabase
    .from("inbound_messages")
    .select("id, body_storage_path, received_at")
    .in("id", [
      "3181aab6-c74b-4d7c-8255-6f9516d5fa1d",
      "a83d750b-eebb-4705-927c-f9ccfe481e96",
      "83421811-618f-4127-834b-5d3543ca5572",
    ]);
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
    const want = ["list-unsubscribe", "list-id", "precedence", "auto-submitted", "list-unsubscribe-post"];
    const bulk: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (want.includes(k.toLowerCase())) bulk[k] = String(v).slice(0, 120);
    }
    try {
      const parsed = JSON.parse(raw["message-headers"] ?? "[]");
      if (Array.isArray(parsed)) {
        for (const e of parsed) {
          if (Array.isArray(e) && want.includes(String(e[0]).toLowerCase())) {
            bulk["hdr:" + String(e[0])] = String(e[1]).slice(0, 120);
          }
        }
      }
    } catch { /* ignore */ }
    out.push({ id: m.id, fields: Object.keys(raw), headerNames, bulk });
  }
  return new Response(JSON.stringify(out, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
