/**
 * MAIL UVOZ — generiranje i format aliasa za prijemnu adresu.
 * Format: `c-` + 16 znakova iz [a-z2-9] (kriptografski random).
 */

export const MAIL_ALIAS_DOMAIN = 'centar.vmbalance.com';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz23456789';
export const MAIL_ALIAS_REGEX = /^c-[a-z2-9]{16}$/;

export function generateAliasLocal(
  randomBytes: (n: number) => Uint8Array = (n) => {
    const arr = new Uint8Array(n);
    crypto.getRandomValues(arr);
    return arr;
  }
): string {
  let out = '';
  // Rejection sampling — bez modulo pristranosti.
  while (out.length < 16) {
    const bytes = randomBytes(24);
    for (const b of bytes) {
      if (out.length === 16) break;
      if (b >= 238) continue; // 238 = 7 * 34 (najveći višekratnik duljine abecede)
      out += ALPHABET[b % ALPHABET.length];
    }
  }
  return `c-${out}`;
}

export function isValidAliasLocal(value: string): boolean {
  return MAIL_ALIAS_REGEX.test(value);
}

export function aliasToAddress(aliasLocal: string): string {
  return `${aliasLocal}@${MAIL_ALIAS_DOMAIN}`;
}
