import { describe, expect, it } from 'vitest';
import { carriesInvoiceSignal } from '@/lib/mail/invoiceSignals';
import {
  attachmentTypeLabel,
  isUserFixableQuarantine,
} from '@/lib/mail/quarantineVisibility';

/**
 * KLASIFIKATORSKA LEKCIJA (živi kvar, 17.8.2026.):
 * „Fwd: Račun Grad Osijek" imao je jedan slab izvod-signal, pa je korisniku
 * postavljeno JEDINO pitanje „je li ovo izvod?" — a odgovor „nije" ga je
 * pojeo. Doslovan račun-signal mora imati prednost pred slabom sumnjom.
 */

const OSIJEK = `GRAD OSIJEK
Račun br. 2026-114
Datum dospijeća: 25.08.2026.
Iznos za uplatu: 41,20 EUR
IBAN: HR1723600001101234565`;

const ZABA_IZVOD = `ZAGREBAČKA BANKA d.d.
Izvod br. 152/2026
Prethodno stanje 1.230,00
Novo stanje 900,00
IBAN: HR1210010051863000160`;

describe('račun-signal ima prednost pred slabom sumnjom na izvod', () => {
  it('naslov i tekst „Račun br." → jasan račun-signal', () => {
    expect(carriesInvoiceSignal(OSIJEK, 'Fwd: Račun Grad Osijek')).toBe(true);
  });

  it('bankovni izvod NIKAD ne prolazi kao račun (izvod-rječnik je veto)', () => {
    expect(carriesInvoiceSignal(ZABA_IZVOD, 'Izvod 152/2026')).toBe(false);
  });

  it('proslijeđen izvod s naslovom koji spominje račun i dalje ne prolazi', () => {
    expect(carriesInvoiceSignal(ZABA_IZVOD, 'Fwd: Račun — izvod banke')).toBe(false);
  });

  it('promidžbena poruka bez račun-oblika ne prolazi', () => {
    expect(
      carriesInvoiceSignal('Iskoristi popust ovaj tjedan! Stanje računa provjeri u aplikaciji.', 'Novosti'),
    ).toBe(false);
  });

  it('„broj računa" na izvodu sam po sebi nije račun-signal', () => {
    expect(carriesInvoiceSignal('Stanje na broju računa HR12 je 900,00', 'Obavijest')).toBe(false);
  });
});

describe('karantena govori — ali samo za popravljive razloge', () => {
  it('nepodržan tip i arhiva su korisnički popravljivi', () => {
    expect(isUserFixableQuarantine('nepodrzan_tip')).toBe(true);
    expect(isUserFixableQuarantine('arhiva_nije_podrzana')).toBe(true);
  });

  it('sigurnosni razlozi ostaju tihi (bez kartice)', () => {
    expect(isUserFixableQuarantine('xml_dtd_zabranjen')).toBe(false);
    expect(isUserFixableQuarantine('malware')).toBe(false);
    expect(isUserFixableQuarantine(null)).toBe(false);
  });

  it('oznaka tipa uzima deklarirani MIME, pa njuškani', () => {
    expect(attachmentTypeLabel('message/rfc822', 'text/plain')).toBe('message/rfc822');
    expect(attachmentTypeLabel('', 'text/html')).toBe('text/html');
    expect(attachmentTypeLabel(null, null)).toBe('nepoznato');
  });
});
