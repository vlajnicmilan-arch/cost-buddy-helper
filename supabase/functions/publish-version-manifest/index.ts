// Edge function: prima manifest JSON od CI-a i upload-a ga u
// public-assets/releases/version.json kako bi update checker imao stabilan
// izvor neovisno o tome je li frontend već published.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-upload-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const expectedToken = Deno.env.get("APK_UPLOAD_TOKEN");
    if (!expectedToken) {
      return json({ error: "APK_UPLOAD_TOKEN not configured" }, 500);
    }
    const provided = req.headers.get("x-upload-token");
    if (!provided || provided !== expectedToken) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => null) as
      | { version?: string; minSupportedVersion?: string | null; sha256?: string | null; apkUrl?: string | null }
      | null;

    if (!body || typeof body.version !== "string" || !/^[0-9.]+$/.test(body.version)) {
      return json({ error: "Invalid or missing version" }, 400);
    }

    const manifest = {
      version: body.version,
      minSupportedVersion: body.minSupportedVersion ?? "0.0.0",
      sha256: body.sha256 ?? null,
      apkUrl: body.apkUrl ?? null,
      publishedAt: new Date().toISOString(),
    };

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const objectPath = "releases/version.json";
    const bytes = new TextEncoder().encode(JSON.stringify(manifest, null, 2) + "\n");

    const { error } = await supabase.storage
      .from("public-assets")
      .upload(objectPath, bytes, {
        contentType: "application/json",
        cacheControl: "60",
        upsert: true,
      });

    if (error) {
      console.error("upload version.json failed", error);
      return json({ error: error.message }, 500);
    }

    const { data: pub } = supabase.storage
      .from("public-assets")
      .getPublicUrl(objectPath);

    return json({ success: true, publicUrl: pub.publicUrl, manifest });
  } catch (e: any) {
    console.error("unhandled", e);
    return json({ error: e?.message ?? String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
