/**
 * Središnja zaštita od tehničkih poruka u sučelju.
 *
 * Korisnik nikad ne smije vidjeti "Failed to fetch" ni ime iznimke. Kad takva
 * poruka stigne u `showError`, zamjenjuje se ljudskom rečenicom, a doslovan
 * tekst + skraćeni stack pozivatelja idu u dijagnostiku (`raw_error_shown`),
 * da se vidi tko ju je poslao.
 */

/** Tehnički obrasci koji ne smiju do korisnika. */
export const RAW_ERROR_PATTERN =
  /failed to fetch|networkerror|network request failed|load failed|typeerror|fetch/i;

/** Ime iznimke umjesto rečenice, npr. "TypeError" ili "AbortError: ...". */
const EXCEPTION_NAME_PATTERN = /^[A-Za-z]*Error\b/;

export const RAW_ERROR_REPLACEMENT =
  'Veza s poslužiteljem je nakratko pukla. Pokušaj ponovno.';

export function isRawTechnicalMessage(message?: string): boolean {
  if (!message) return false;
  const text = message.trim();
  if (!text) return false;
  return RAW_ERROR_PATTERN.test(text) || EXCEPTION_NAME_PATTERN.test(text);
}

/** Prvih 5 redaka stacka pozivatelja, bez ovog modula. */
export function callerStack(): string {
  const raw = new Error().stack ?? '';
  return raw
    .split('\n')
    .filter((line) => !line.includes('rawErrorGuard'))
    .slice(0, 5)
    .join('\n');
}

export function currentRoute(): string {
  try {
    return `${window.location.pathname}${window.location.search}`;
  } catch {
    return '';
  }
}
