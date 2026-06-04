/**
 * Krug — top-level stranica koja zauzima slot u dashboard navigaciji.
 *
 * V1 skeleton: listanje mojih Krugova + detalj (članovi + shared izvori).
 * Kreiranje novog Kruga zahtijeva preset wizard koji NIJE u Wave 1.5 skoupu
 * (vodi se kroz Foundation preset matrix); CTA postoji ali otvara
 * "uskoro" placeholder dijalog umjesto da ovdje uvodi novu odluku.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { HomeHeader } from '@/components/HomeHeader';
import { BottomNav } from '@/components/BottomNav';
import { KrugListScreen } from '@/components/krug/KrugListScreen';
import { KrugDetailScreen } from '@/components/krug/KrugDetailScreen';

export default function Krug() {
  const { t } = useTranslation();
  const { hasAccess } = useFeatureAccess();
  const [selectedKrugId, setSelectedKrugId] = useState<string | null>(null);

  // Krug je gated isključivo po pretplati (Foundation odluka). UI ne treba
  // dupli toggle u Settings — slot zauzima nav i pojavljuje se tek kad
  // plan dopušta.
  if (!hasAccess('family_groups')) {
    return <Navigate to="/paywall" replace state={{ feature: 'krug' }} />;
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <HomeHeader />
      <main className="max-w-4xl mx-auto px-4 py-4 space-y-4">
        {selectedKrugId ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedKrugId(null)}
              className="-ml-2"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              {t('krug.backToList', 'Natrag na popis')}
            </Button>
            <KrugDetailScreen krugId={selectedKrugId} />
          </>
        ) : (
          <KrugListScreen onSelect={setSelectedKrugId} />
        )}
      </main>
      <BottomNav />
    </div>
  );
}
