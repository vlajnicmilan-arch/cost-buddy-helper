import { describe, it } from 'vitest';
import fs from 'node:fs';
import { parseUbl } from '@/lib/eracun/parseUbl';
import { evaluateInvoice } from '@/lib/eracun/acceptance';
import { buildIntakeRows, toInsertRow } from '@/lib/eracun/intakeBatch';
import { invoiceFingerprint } from '@/lib/eracun/fingerprint';

describe('e2e row', () => {
  it('builds insert row', async () => {
    const xml = fs.readFileSync('src/test/tmp-e2e/hep.xml', 'utf8');
    const invoice = parseUbl(xml);
    const acceptance = evaluateInvoice(invoice);
    const fingerprint = await invoiceFingerprint(invoice.supplier.oib, invoice.invoiceNumber);
    const rows = buildIntakeRows([{ fileName: 'hep.xml', invoice, acceptance, fingerprint }], new Set());
    const insert = toInsertRow(rows[0], { userId: '5469386b-5e34-4530-82ef-5cdccbd04026', businessProfileId: null, batchId: '00000000-0000-4000-8000-0000000000e2' });
    fs.writeFileSync('src/test/tmp-e2e/row.json', JSON.stringify({ acceptance, row: rows[0], insert }, null, 2));
  });
});
