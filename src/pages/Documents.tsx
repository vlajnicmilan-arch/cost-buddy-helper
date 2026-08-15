import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useTranslation } from 'react-i18next';
import { ArrowLeft, FileClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMailImportAccess } from '@/hooks/useMailImportAccess';
import { useMailPendingCount } from '@/hooks/useMailPendingCount';
import { MailReviewList } from '@/components/mail/MailReviewList';
import { DocumentsReceivedTab } from '@/components/mail/DocumentsReceivedTab';
import { PageContainer } from '@/components/layout/PageContainer';
import { useGoBackOrHome } from '@/hooks/useGoBackOrHome';

/**
 * DOM ZA DOKUMENTE (`/dokumenti`).
 *
 * Cijeli ekran postoji ISKLJUČIVO uz pravo `mail_uvoz`. Bez prava korisnik se
 * tiho vraća na početni ekran — nema kartice, nema taba, nema traga.
 */
export default function Documents() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // Ekran zna biti PRVA stavka povijesti (ulaz kroz brief-vrata s `replace`).
  const goBack = useGoBackOrHome();
  const { hasAccess, loading: accessLoading } = useMailImportAccess();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') === 'received' ? 'received' : 'pending';
  const [tab, setTab] = useState<'pending' | 'received'>(initialTab);

  const { count, refetch } = useMailPendingCount(hasAccess);

  if (accessLoading) {
    return (
      <div className="p-4 text-sm text-muted-foreground">{t('common.loading', 'Učitavanje...')}</div>
    );
  }

  if (!hasAccess) {
    navigate('/app', { replace: true });
    return null;
  }

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
