/**
 * MAIL UVOZ — ODREDIŠTE DOKUMENTA PO KUPCU.
 *
 * Dokument sam kaže kome pripada: kupac na računu je pravna činjenica. Zato
 * odredište izvodimo iz KUPCA kroz ISTI mehanizam koji koristi sken računa
 * (`receiptBusinessRouting`), a dosadašnje usmjeravanje po OIB-u u tekstu
 * (`scopeRouting`) ostaje SAMO REZERVA — kad dokument kupca nema.
 *
 * Korisnikova korekcija (`scope_set_by_user`) je iznad svega i rješava se
 * slojem iznad (`ingestItemUpsert`), ne ovdje.
 */

import {
  resolveReceiptBusinessRouting,
  type RoutableBusinessProfile,
} from '../businessRouting/receiptBusinessRouting.ts';

/** Kupac je prepoznat, ali samo po imenu — ponuda, nikad automatika. */
export const DESTINATION_OFFER_WARNING = 'odrediste_ponuda';

export interface DestinationDecision {
  scopeType: 'user' | 'business_profile';
  scopeId: string;
  /** Odakle odluka: kupac s dokumenta ili rezerva (OIB u tekstu / vlasnik). */
  source: 'kupac_oib' | 'rezerva';
  /** Prijedlog po imenu kupca — korisnik ga prihvaća, sustav ga ne primjenjuje. */
  offer: { profileId: string; profileName: string } | null;
  warnings: string[];
}

export function resolveDestination(params: {
  recipientOib: string | null | undefined;
  recipientName: string | null | undefined;
  profiles: readonly RoutableBusinessProfile[];
  /** Dosadašnje usmjeravanje po OIB-u u tekstu — rezerva. */
  fallback: { scopeType: 'user' | 'business_profile'; scopeId: string };
}): DestinationDecision {
  const routing = resolveReceiptBusinessRouting({
    recipientOib: params.recipientOib ?? null,
    recipientName: params.recipientName ?? null,
    profiles: params.profiles,
    activeBusinessProfileId: null,
  });

  if (routing.kind === 'auto') {
    return {
      scopeType: 'business_profile',
      scopeId: routing.profileId,
      source: 'kupac_oib',
      offer: null,
      warnings: [],
    };
  }

  if (routing.kind === 'offer') {
    return {
      scopeType: params.fallback.scopeType,
      scopeId: params.fallback.scopeId,
      source: 'rezerva',
      offer: { profileId: routing.profileId, profileName: routing.profileName },
      warnings: [DESTINATION_OFFER_WARNING],
    };
  }

  return {
    scopeType: params.fallback.scopeType,
    scopeId: params.fallback.scopeId,
    source: 'rezerva',
    offer: null,
    warnings: [],
  };
}
