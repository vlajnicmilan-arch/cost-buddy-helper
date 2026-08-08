/**
 * eRačun (UBL 2.1) parser — JEDINA implementacija živi u
 * `supabase/functions/_shared/eracun/parseUbl.ts` kako bi je dijelili i
 * preglednik i edge funkcije (mail uvoz). Ovdje je samo re-export.
 *
 * U pregledniku i testovima koristi se globalni `DOMParser`; edge funkcija
 * ubrizgava svoj parser preko `setUblXmlParser`.
 */

export {
  parseUbl,
  setUblXmlParser,
} from '../../../supabase/functions/_shared/eracun/parseUbl.ts';
