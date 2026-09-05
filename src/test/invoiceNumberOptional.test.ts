/**
 * DOKUMENT BEZ BROJA NE SMIJE PRIKAZATI PRAZNINU NI SRUŠITI POREDAK.
 *
 * Živi kvar (5.9.2026.): baza je imala NOT NULL na `incoming_invoices.invoice_number`,
 * pa je kvačica „nema broj" padala s 23502. Nakon skidanja ograničenja broj
 * smije biti prazan — prikaz i poredak to moraju podnijeti.
 */

import { describe, it, expect } from 'vitest';
import { invoiceNumberLabel, invoiceDescriptor } from '@/lib/eracun/invoiceLabel';
import { sortIncomingInvoices } from '@/lib/eracun/sortInvoices';

describe('broj dokumenta smije nedostajati', () => {
  it('prazan broj se prikazuje kao „—", nikad kao null/undefined', () => {
    expect(invoiceNumberLabel(null)).toBe('—');
    expect(invoiceNumberLabel(undefined)).toBe('—');
    expect(invoiceNumberLabel('   ')).toBe('—');
    expect(invoiceNumberLabel('I08-0626')).toBe('I08-0626');
  });

  it('opis bez broja preuzima naziv druge strane', () => {
    expect(invoiceDescriptor({ invoice_number: null, supplier_name: 'Taxi Dama' })).toBe('Taxi Dama');
    expect(invoiceDescriptor({ invoice_number: null, counterparty_name: 'HEP' })).toBe('HEP');
    expect(invoiceDescriptor({ invoice_number: '  ' })).toBe('—');
  });

  it('poredak ne puca i gura dokumente bez broja na kraj', () => {
    const rows = [
      { invoice_number: null, issue_date: '2026-09-01', due_date: null, paid_at: null },
      { invoice_number: 'A-1', issue_date: '2026-09-01', due_date: null, paid_at: null },
    ];
    const sorted = sortIncomingInvoices(rows);
    expect(sorted[0].invoice_number).toBe('A-1');
    expect(sorted[1].invoice_number).toBeNull();
  });
});
