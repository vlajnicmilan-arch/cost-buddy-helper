// Pure allowlist helper for admin-hard-delete-user.
// Extracted so unit tests can import without pulling in Deno/Supabase modules.

export const ALLOWLIST_EMAILS: readonly string[] = ["vinkabalance@gmail.com"];
export const ALLOWLIST_DOMAIN_SUFFIX = "@test.vmbalance.com";

export function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  if (!e) return false;
  if (ALLOWLIST_EMAILS.includes(e)) return true;
  if (e.endsWith(ALLOWLIST_DOMAIN_SUFFIX)) return true;
  return false;
}
