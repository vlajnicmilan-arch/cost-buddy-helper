import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalizePayload } from '@/lib/notificationPayload';

describe('invoice_due klik', () => {
  for (const stage of ['d0', 'd3']) {
    it(`${stage} nosi konkretan račun u postojeći eRačun kanal`, () => {
      const id = `invoice-${stage}`;
      const payload = normalizePayload('invoice_due', { invoice_id: id, stage });
      expect(payload.route).toBe('/home');
      expect(payload.highlight).toEqual({ type: 'invoice', id });

      const hook = readFileSync('src/hooks/useNotificationNavigation.ts', 'utf8');
      expect(hook).toContain("type === 'invoice_due'");
      expect(hook).toContain('requestOpenIncomingInvoice({ invoiceId, businessProfileId: profileId })');
      expect(hook).toContain('setActiveBusinessProfileId(profileId)');
    });
  }
});