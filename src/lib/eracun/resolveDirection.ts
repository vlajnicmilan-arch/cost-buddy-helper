/**
 * eRačun — smjer dokumenta (ulazni / izlazni).
 *
 * Odlučuje se isključivo po OIB-u: ako je OIB aktivne tvrtke na strani kupca,
 * račun je ULAZNI; ako je na strani dobavljača, račun je IZLAZNI. Kad se ne
 * poklapa nijedan, dokument ne pripada toj tvrtki (`foreign`) — najčešće je
 * odabrana kriva tvrtka.
 *
 * OIB u XML-u redovito nosi prefiks `HR` (`HR39916265994`), a u
 * `business_profiles` je bez njega — zato se obje strane normaliziraju.
 */

import { normalizeOib } from './fingerprint';

export type EracunDirection = 'in' | 'out';

/** `unknown` = OIB tvrtke nije poznat, smjer se ne može utvrditi. */
export type EracunDirectionResult = EracunDirection | 'foreign' | 'unknown';

export interface DirectionInput {
  supplierOib: string | null | undefined;
  customerOib: string | null | undefined;
  companyOib: string | null | undefined;
}

export const resolveDirection = ({
  supplierOib,
  customerOib,
  companyOib,
}: DirectionInput): EracunDirectionResult => {
  const company = normalizeOib(companyOib);
  if (!company) return 'unknown';

  const supplier = normalizeOib(supplierOib);
  const customer = normalizeOib(customerOib);

  if (supplier === company) return 'out';
  if (customer === company) return 'in';
  return 'foreign';
};

/** Smjer koji se stvarno sprema; `foreign`/`unknown` se tretiraju kao ulazni. */
export const storedDirection = (result: EracunDirectionResult): EracunDirection =>
  result === 'out' ? 'out' : 'in';
