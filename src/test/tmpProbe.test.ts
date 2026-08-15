import { describe, it } from 'vitest';
import i18n from '@/i18n';
import { resolveNotificationText } from '@/lib/notificationI18n';
describe('probe', () => {
  it('p', async () => {
    for (const lng of ['hr-HR','en-US','en-GB','sr','it']) {
      await i18n.changeLanguage(lng);
      console.log(lng, i18n.language, i18n.exists('attention.issues.overdueIncomingInvoices.title'),
        JSON.stringify(resolveNotificationText('attention.issues.overdueIncomingInvoices.title', {count:83}, i18n.t.bind(i18n))));
    }
  });
});
