import { describe, it } from 'vitest';
import i18n from '@/i18n';
describe('probe', () => {
  it('p', async () => {
    for (const lng of ['hr','en','de']) {
      await i18n.changeLanguage(lng);
      for (const c of [1,2,83,100]) {
        console.log(lng, c, JSON.stringify(i18n.t('attention.issues.overdueIncomingInvoices.title', { count: c })), JSON.stringify(i18n.t('attention.issues.overdueIncomingInvoices.message', { count: c, amount: '1 €' })));
      }
    }
  });
});
