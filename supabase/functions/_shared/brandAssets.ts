/**
 * Brand asset URLs derived from SUPABASE_URL env (not hardcoded project ref).
 * Used by email templates so the project ref appears in exactly one place.
 */

const FALLBACK_SUPABASE_URL = "https://fzalxjretvtvokiotvkf.supabase.co";

function baseUrl(): string {
  return (Deno.env.get("SUPABASE_URL") || FALLBACK_SUPABASE_URL).replace(/\/$/, "");
}

export function getLogoUrl(): string {
  return `${baseUrl()}/storage/v1/object/public/email-assets/logo.png`;
}

export function getPublicAssetUrl(path: string): string {
  const clean = path.replace(/^\//, "");
  return `${baseUrl()}/storage/v1/object/public/${clean}`;
}
