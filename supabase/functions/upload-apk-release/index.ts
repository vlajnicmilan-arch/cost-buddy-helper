// Edge function vraća signed upload URL za APK.
// GitHub Actions zatim direktno PUT-a binarno u Storage (zaobilazi edge gateway 504).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-upload-token, x-apk-version",
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

    const version = req.headers.get("x-apk-version");
    if (!version || !/^[0-9.]+$/.test(version)) {
      return json({ error: "Invalid or missing x-apk-version header" }, 400);
    }

    // force=true (body ili query) je jedini način da se postojeće izdanje pregazi.
    const url = new URL(req.url);
    const bodyJson = await req.json().catch(() => null) as { force?: boolean } | null;
    const force = bodyJson?.force === true || url.searchParams.get("force") === "true";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const objectPath = `releases/centar-${version}.apk`;

    // Nepromjenjivost izdanja: ako objekt postoji, odbij bez brisanja.
    const { data: existing } = await supabase.storage
      .from("public-assets")
      .list("releases", { search: `centar-${version}.apk`, limit: 100 });
    const alreadyPublished = (existing ?? []).some((o: any) => o.name === `centar-${version}.apk`);

    if (alreadyPublished && !force) {
      return json({
        error: `Izdanje ${version} već postoji — podigni verziju ili pošalji force=true`,
        code: "release_exists",
        version,
        path: objectPath,
      }, 409);
    }

    // Samo uz eksplicitni force brišemo prethodni binarij (upsert nije podržan na ovoj ruti).
    if (alreadyPublished && force) {
      console.warn(`[upload-apk-release] FORCE overwrite of ${objectPath}`);
      await supabase.storage.from("public-assets").remove([objectPath]).catch(() => {});
    }

    const { data, error } = await supabase.storage
      .from("public-assets")
      .createSignedUploadUrl(objectPath);

    if (error || !data) {
      console.error("createSignedUploadUrl failed", error);
      return json({ error: error?.message ?? "Failed to create signed URL" }, 500);
    }

    const { data: pub } = supabase.storage
      .from("public-assets")
      .getPublicUrl(objectPath);

    return json({
      success: true,
      path: objectPath,
      signedUrl: data.signedUrl,
      token: data.token,
      publicUrl: pub.publicUrl,
    });
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
