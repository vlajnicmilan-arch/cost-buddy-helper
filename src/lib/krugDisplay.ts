/**
 * Krug display helpers — name/initials/source-label resolveri.
 * Bez novog profile sustava; koristi se nad već dohvaćenim profile mapama.
 */
import type { UserProfileLite } from '@/hooks/useUserProfiles';

export function getMemberDisplayName(
  profile: UserProfileLite | undefined,
  userId: string,
  fallbackUnknown: string,
): string {
  const name = profile?.display_name?.trim();
  if (name) return name;
  if (userId) return `${fallbackUnknown} · ${userId.slice(0, 6)}`;
  return fallbackUnknown;
}

export function getInitials(name: string, userId?: string): string {
  const src = (name || '').trim();
  if (src) {
    const parts = src.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return src.slice(0, 2).toUpperCase();
  }
  if (userId) return userId.slice(0, 2).toUpperCase();
  return '?';
}

/**
 * Human label za payment_source_id u Krug kontekstu.
 * - `custom:UUID` → traži ime u prosljeđenoj mapi, fallback na "Izvor · xxxxxx"
 * - built-in slug (npr. `cash`, `bank_account`) → koristi i18n lookup ako postoji
 * - inače: vrati raw id
 */
export function getPaymentSourceLabel(
  paymentSourceId: string,
  customNameMap: Map<string, { name: string; currency?: string }>,
  translateSlug: (slug: string) => string | undefined,
  unknownLabel: string,
): { label: string; currency?: string } {
  if (paymentSourceId.startsWith('custom:')) {
    const meta = customNameMap.get(paymentSourceId);
    if (meta?.name) return { label: meta.name, currency: meta.currency };
    const tail = paymentSourceId.slice('custom:'.length, 'custom:'.length + 6);
    return { label: `${unknownLabel} · ${tail}` };
  }
  const slugged = translateSlug(paymentSourceId);
  if (slugged) return { label: slugged };
  return { label: paymentSourceId };
}
