/**
 * MAIL UVOZ — OBAVIJEST JE ZA SVJEŽU POŠTU.
 *
 * Kvar (17.8.2026): obrada je znala zazvoniti za poruke koje NISU upravo
 * stigle (ponovna obrada povijesti) — korisnika je zasuo val obavijesti.
 *
 * Pravilo je deterministicno i ima TOČNO jednu iznimku:
 *  - zvoni se samo ako je poruka primljena unutar 24 h, ILI
 *  - ako je obradu izričito pokrenuo korisnik (ručni „Ponovno obradi").
 *
 * Sve ostalo (masovna/pozadinska obrada starih poruka) je TIHO: stavka se i
 * dalje pojavi u Dokumentima, ali bez zvona i pusha.
 */

/** Poruke starije od ovoga ne pokreću obavijest u automatskoj obradi. */
export const NOTIFY_MAX_MESSAGE_AGE_MS = 24 * 60 * 60 * 1000;

export interface NotifyAgeInput {
  /** `inbound_messages.received_at` (ISO) — vrijeme dolaska pošte. */
  receivedAt: string | null | undefined;
  /** Trenutak odluke (ms). */
  now: number;
  /** Obradu je izričito pokrenuo korisnik (ručni reprocess). */
  manualReprocess: boolean;
}

export function shouldNotifyPending({ receivedAt, now, manualReprocess }: NotifyAgeInput): boolean {
  if (manualReprocess) return true;
  if (!receivedAt) return false;
  const ts = Date.parse(receivedAt);
  if (Number.isNaN(ts)) return false;
  return now - ts <= NOTIFY_MAX_MESSAGE_AGE_MS;
}
