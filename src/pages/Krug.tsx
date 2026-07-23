/**
 * Krug — top-level stranica koja zauzima slot u dashboard navigaciji.
 *
 * V1 skeleton: listanje mojih Krugova + detalj (članovi + shared izvori).
 *
 * P0 Hotfix B (follow-up): page-level broadcast subscribe na `krug_deleted`
 * per-user topic. `useMyKrugs` broadcast pretplata živi samo dok je list
 * grana mountana; kad je korisnik u detail viewu, samo `KrugDetailScreen`
 * je renderiran i pretplata nestaje. Ovdje se pretplata drži na razini
 * stranice pa se `selectedKrugId` resetira odmah kad owner soft-delete-a
 * otvoreni Krug, bez oslanjanja na focus/reconnect/refresh.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';
import { BottomNav } from '@/components/BottomNav';
import { KrugListScreen } from '@/components/krug/KrugListScreen';
import { KrugDetailScreen } from '@/components/krug/KrugDetailScreen';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { ReadOnlyBanner } from '@/components/access/ReadOnlyBanner';
import { useMyKrugs } from '@/hooks/useKrug';
import { useModuleGate } from '@/hooks/useModuleGate';


export default function Krug() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { hasModuleAccess } = useFeatureAccess();
  const { requestModule } = useModuleGate();
  const hasKrugAccess = hasModuleAccess('krug');
  const isReadOnly = !hasKrugAccess;
  const [selectedKrugId, setSelectedKrugId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Direktan ulaz na /krug bez prava: ako korisnik nema NI tier NI članstvo
  // u ijednom Krugu, otvori upgrade dijalog; "Ne sada" vraća na /home bez
  // ikakve tehničke greške. Ako je član nekog Kruga — ostavi ReadOnly pregled.
  const { data: krugs, isLoading: krugsLoading } = useMyKrugs();
  const hasMemberships = (krugs?.length ?? 0) > 0;
  const gatePromptedRef = useState<{ done: boolean }>({ done: false })[0];
  useEffect(() => {
    if (hasKrugAccess) return;
    if (krugsLoading) return;
    if (hasMemberships) return;
    if (gatePromptedRef.done) return;
    gatePromptedRef.done = true;
    requestModule('krug', {
      onDismiss: () => navigate('/home', { replace: true }),
    });
  }, [hasKrugAccess, krugsLoading, hasMemberships, requestModule, navigate, gatePromptedRef]);


  // Deep-link ulaz iz obavijesti (`/krug?id=<uuid>`). Kad payload ima id,
  // otvaramo detail direktno i čistimo query param da back-navigacija na
  // listu ne re-triggera otvaranje.
  useEffect(() => {
    const idParam = searchParams.get('id');
    if (idParam && idParam !== selectedKrugId) {
      setSelectedKrugId(idParam);
      const next = new URLSearchParams(searchParams);
      next.delete('id');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, selectedKrugId, setSearchParams]);

  // Page-level broadcast — hvata `krug_deleted` iz DB trigera
  // `krug_broadcast_soft_delete` bez obzira je li user u list ili detail
  // grani. Detail grana unmount-a `useMyKrugs` (i njegov broadcast handler),
  // pa bez ove pretplate obrisani Krug ostaje otvoren u detail viewu drugog
  // korisnika dok ne izađe ručno.
  useEffect(() => {
    if (!user) return;
    // Topic MORA doslovno odgovarati onome kojim DB trigger
    // `krug_broadcast_soft_delete` zove `realtime.send(..., 'krug:user:<uid>')`.
    // Ranije ime `krug-page-deletions-<uid>` bilo je mismatch pa owner nikad
    // nije primao `krug_deleted` i detail view mu je ostajao otvoren.
    const channel = supabase
      .channel(`krug:user:${user.id}`)
      .on('broadcast', { event: 'krug_deleted' }, (msg) => {
        const krugId = (msg?.payload as { krug_id?: string } | undefined)?.krug_id;
        if (!krugId) return;
        qc.invalidateQueries({ queryKey: ['krug', 'my'] });
        qc.invalidateQueries({ queryKey: ['krug', 'detail', krugId] });
        qc.invalidateQueries({ queryKey: ['krug', 'members', krugId] });
        setSelectedKrugId((current) => (current === krugId ? null : current));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, qc]);

  return (
    <div className="min-h-screen bg-background pb-20">
      <PageHeader title={t('krug.title', 'Krug')} />
      <main className="max-w-4xl mx-auto px-4 py-4 space-y-4">
        {isReadOnly && (
          <ReadOnlyBanner
            title={t('krug.readOnlyTitle', 'Krug je u načinu samo za pregled')}
            body={t('krug.readOnlyBody', 'Postojeće Krugove vidiš i možeš izvesti. Za pozivanje članova i uređivanje aktiviraj modul Krug.')}
          />
        )}
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
