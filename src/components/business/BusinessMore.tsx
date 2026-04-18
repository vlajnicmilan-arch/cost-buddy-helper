import { useState } from 'react';
import { Receipt, RefreshCw, Building2, ChevronRight, Settings2, FileSignature } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { BusinessDebtTracker } from './BusinessDebtTracker';
import { BusinessRecurring } from './BusinessRecurring';
import { BusinessProfileView } from './BusinessProfileView';
import { BusinessModuleSettings } from './BusinessModuleSettings';
import { ProjectEstimatesPanel } from '@/components/projects/ProjectEstimatesPanel';
import { Expense } from '@/types/expense';
import { useBackButton } from '@/hooks/useBackButton';
import { useTranslation } from 'react-i18next';

type SubView = 'menu' | 'profile' | 'debts' | 'recurring' | 'modules' | 'estimates';

interface Props {
  expenses: Expense[];
}

export const BusinessMore = ({ expenses }: Props) => {
  const { t } = useTranslation();
  const [view, setView] = useState<SubView>('menu');

  useBackButton(view !== 'menu', () => setView('menu'));

  const backButton = (
    <button onClick={() => setView('menu')} className="text-xs text-primary mb-3 flex items-center gap-1">{t('business.more.back', '← Natrag')}</button>
  );

  if (view === 'profile') return <div>{backButton}<BusinessProfileView /></div>;
  if (view === 'modules') return <div>{backButton}<BusinessModuleSettings /></div>;
  if (view === 'debts') return <div>{backButton}<BusinessDebtTracker /></div>;
  if (view === 'recurring') return <div>{backButton}<BusinessRecurring /></div>;
  if (view === 'estimates') return <div>{backButton}<ProjectEstimatesPanel /></div>;

  type MenuItem = { id: SubView; icon: any; label: string; desc: string };

  const menuItems: MenuItem[] = [
    { id: 'profile', icon: Building2, label: t('business.more.companyData', 'Podaci o tvrtki'), desc: t('business.more.companyDataDesc', 'Naziv, OIB, adresa, IBAN i ostali podaci') },
    { id: 'modules', icon: Settings2, label: t('business.more.modulesAndIndustry', 'Djelatnost i moduli'), desc: t('business.more.modulesAndIndustryDesc', 'Odaberite djelatnost i prilagodite module') },
    { id: 'estimates', icon: FileSignature, label: t('estimates.title', 'Ponude i predračuni'), desc: t('estimates.menuDesc', 'Pripremi ponudu i pretvori je u projekt') },
    { id: 'debts', icon: Receipt, label: t('business.more.debtsAndReceivables', 'Dugovanja i potraživanja'), desc: t('business.more.debtsAndReceivablesDesc', 'Praćenje tko vam duguje i kome vi dugujete') },
    { id: 'recurring', icon: RefreshCw, label: t('business.more.recurringObligations', 'Ponavljajuće obveze'), desc: t('business.more.recurringObligationsDesc', 'Najam, pretplate, leasing i ostalo') },
  ];

  return (
    <div className="space-y-2">
      {menuItems.map(item => {
        const Icon = item.icon;
        return (
          <Card key={item.id} className="border-none shadow-sm cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => setView(item.id)}>
            <CardContent className="p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{item.label}</p>
                <p className="text-[10px] text-muted-foreground">{item.desc}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

