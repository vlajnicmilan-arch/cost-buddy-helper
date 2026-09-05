import { describe, it, expect } from 'vitest';
import {
  extractBulkHeaders,
  hasBulkMarker,
  bulkMailRule,
  noAmountNoNumberRule,
  markersFound,
  EMPTY_BULK_HEADERS,
} from '../../supabase/functions/_shared/mailImport/bulkMailSignals.ts';

describe('extractBulkHeaders', () => {
  it('čita ravna Mailgun polja', () => {
    const h = extractBulkHeaders({
      'List-Unsubscribe': '<mailto:off@primjer.hr>',
      Precedence: 'Bulk',
    });
    expect(h.listUnsubscribe).toBe('<mailto:off@primjer.hr>');
    expect(h.precedence).toBe('Bulk');
    expect(h.listId).toBeNull();
  });

  it('čita i JSON message-headers', () => {
    const h = extractBulkHeaders({
      'message-headers': JSON.stringify([
        ['List-Id', '<akcije.primjer.hr>'],
        ['Auto-Submitted', 'auto-generated'],
      ]),
    });
    expect(h.listId).toBe('<akcije.primjer.hr>');
    expect(h.autoSubmitted).toBe('auto-generated');
  });

  it('prazan payload daje prazne oznake', () => {
    expect(extractBulkHeaders(null)).toEqual(EMPTY_BULK_HEADERS);
    expect(extractBulkHeaders({})).toEqual(EMPTY_BULK_HEADERS);
  });
});

describe('hasBulkMarker', () => {
  it('prepoznaje sve četiri oznake', () => {
    expect(hasBulkMarker({ ...EMPTY_BULK_HEADERS, listUnsubscribe: '<x>' })).toBe(true);
    expect(hasBulkMarker({ ...EMPTY_BULK_HEADERS, listId: '<x>' })).toBe(true);
    expect(hasBulkMarker({ ...EMPTY_BULK_HEADERS, precedence: 'bulk' })).toBe(true);
    expect(hasBulkMarker({ ...EMPTY_BULK_HEADERS, precedence: 'list' })).toBe(true);
    expect(hasBulkMarker({ ...EMPTY_BULK_HEADERS, precedence: 'junk' })).toBe(true);
    expect(hasBulkMarker({ ...EMPTY_BULK_HEADERS, autoSubmitted: 'auto-generated' })).toBe(true);
  });

  it('ne prepoznaje bezopasne vrijednosti', () => {
    expect(hasBulkMarker(EMPTY_BULK_HEADERS)).toBe(false);
    expect(hasBulkMarker({ ...EMPTY_BULK_HEADERS, precedence: 'normal' })).toBe(false);
    expect(hasBulkMarker({ ...EMPTY_BULK_HEADERS, autoSubmitted: 'no' })).toBe(false);
    expect(hasBulkMarker({ ...EMPTY_BULK_HEADERS, listUnsubscribe: '   ' })).toBe(false);
  });
});

describe('pravilo 2 — masovna pošta bez privitka', () => {
  it('odbija newsletter bez privitka', () => {
    expect(
      bulkMailRule({
        headers: { ...EMPTY_BULK_HEADERS, listUnsubscribe: '<mailto:off@x.hr>', precedence: 'Bulk' },
        hasAttachment: false,
      }),
    ).toBe('masovna_posta');
  });

  it('NE dira poruku s privitkom, ma koliko oznaka imala', () => {
    expect(
      bulkMailRule({
        headers: { listUnsubscribe: '<x>', listId: '<y>', precedence: 'bulk', autoSubmitted: 'auto-replied' },
        hasAttachment: true,
      }),
    ).toBeNull();
  });

  it('NE dira običnu poruku bez oznaka', () => {
    expect(bulkMailRule({ headers: EMPTY_BULK_HEADERS, hasAttachment: false })).toBeNull();
  });

  it('markersFound nabraja samo nađene oznake', () => {
    expect(markersFound({ ...EMPTY_BULK_HEADERS, listUnsubscribe: '<x>', precedence: 'Bulk' })).toEqual([
      'List-Unsubscribe',
      'Precedence=bulk',
    ]);
  });
});

describe('pravilo 3 — bez iznosa I bez broja', () => {
  const base = { hasAttachment: false, classification: 'ponuda' as string | null };

  it('odbija ponudu bez oba polja', () => {
    expect(noAmountNoNumberRule({ ...base, totalAmount: null, invoiceNumber: '' })).toBe(
      'bez_iznosa_i_broja',
    );
  });

  it('ne odbija kad postoji iznos', () => {
    expect(noAmountNoNumberRule({ ...base, totalAmount: 12.5, invoiceNumber: null })).toBeNull();
  });

  it('ne odbija kad postoji broj računa', () => {
    expect(noAmountNoNumberRule({ ...base, totalAmount: null, invoiceNumber: '123/1/1' })).toBeNull();
  });

  it('ne dira privitke ni druge vrste', () => {
    expect(
      noAmountNoNumberRule({ hasAttachment: true, classification: 'racun', totalAmount: null, invoiceNumber: null }),
    ).toBeNull();
    expect(
      noAmountNoNumberRule({ hasAttachment: false, classification: 'izvod', totalAmount: null, invoiceNumber: null }),
    ).toBeNull();
  });
});
