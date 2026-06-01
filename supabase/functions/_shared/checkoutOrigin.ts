/**
 * Pure origin-allowlist resolver for Stripe checkout redirect URLs.
 * SECURITY: do not echo client-controlled Origin header into success_url/cancel_url.
 */

export const ALLOWED_CHECKOUT_ORIGINS: ReadonlySet<string> = new Set([
  "https://vmbalance.com",
  "https://www.vmbalance.com",
  "https://cost-buddy-helper.lovable.app",
  "https://id-preview--8a8fc612-0ac2-4902-a82e-29b5b800bc32.lovable.app",
]);

export const DEFAULT_CHECKOUT_ORIGIN = "https://vmbalance.com";

export function resolveCheckoutOrigin(
  requestedOrigin: string | null | undefined,
  allowed: ReadonlySet<string> = ALLOWED_CHECKOUT_ORIGINS,
  fallback: string = DEFAULT_CHECKOUT_ORIGIN,
): string {
  if (!requestedOrigin) return fallback;
  return allowed.has(requestedOrigin) ? requestedOrigin : fallback;
}
