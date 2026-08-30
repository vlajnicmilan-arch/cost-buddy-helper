import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useTranslation } from 'react-i18next';
import { ArrowLeft, FileClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMailPendingCount } from '@/hooks/useMailPendingCount';
import { MailQuotaStrip } from '@/components/mail/MailQuotaStrip';
import { MailReviewList } from '@/components/mail/MailReviewList';
import { DocumentsReceivedTab } from '@/components/mail/DocumentsReceivedTab';
import { PageContainer } from '@/components/layout/PageContainer';
import { useGoBackOrHome } from '@/hooks/useGoBackOrHome';

/**
 * DOM ZA DOKUMENTE (`/dokumenti`).
 *
 * Ekran je OTVOREN svakom prijavljenom korisniku (odluka vlasnika proizvoda,
 * 30.8.2026). Pravo `mail_uvoz` više ne skriva sučelje — utječe samo na
 * mjesečnu kvotu uvoza, koja se prikazuje u `MailQuotaStrip`.
 */
export default function Documents() {
  const { t } = useTranslation();
  // Ekran zna biti PRVA stavka povijesti (ulaz kroz brief-vrata s `replace`).
  const goBack = useGoBackOrHome();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') === 'received' ? 'received' : 'pending';
  const [tab, setTab] = useState<'pending' | 'received'>(initialTab);

  const { count, refetch } = useMailPendingCount(true);

  return (
    <div className="min-h-dvh bg-background pb-24">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <PageContainer noVerticalPadding className="flex items-center gap-2 py-3">
          <Button
            variant="ghost"
            size="icon"
            className="min-h-[44px] min-w-[44px]"
            aria-label={t('common.back', 'Natrag')}
            onClick={goBack}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <FileClock className="h-5 w-5 text-document-pending" />
          <h1 className="text-base font-semibold">{t('documents.title', 'Dokumenti')}</h1>
        </PageContainer>
      </header>

      <PageContainer as="main">
        <MailQuotaStrip />
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'pending' | 'received')}>
          <TabsList className="w-full">
            <TabsTrigger value="pending" className="flex-1 min-h-[44px]">
              {t('mailReview.title', 'Na pregled')}
              {count > 0 && (
                <span className="ml-2 rounded-full bg-document-pending px-2 py-0.5 text-[10px] font-bold text-document-pending-foreground">
                  {count}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="received" className="flex-1 min-h-[44px]">
              {t('documents.tab.received', 'Primljeno')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="mt-4">
            <MailReviewList active={tab === 'pending'} onCountChange={refetch} />
          </TabsContent>

          <TabsContent value="received" className="mt-4">
            <DocumentsReceivedTab active={tab === 'received'} onCountChange={refetch} />
          </TabsContent>
        </Tabs>
      </PageContainer>
    </div>
  );
}
