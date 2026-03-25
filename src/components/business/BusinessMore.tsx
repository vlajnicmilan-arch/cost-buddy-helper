import { useState, useEffect } from 'react';
import { Receipt, RefreshCw, FileText, Building2, ChevronRight, Settings2, Car, Package, Users, FileSpreadsheet } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { BusinessDebtTracker } from './BusinessDebtTracker';
import { BusinessVATOverview } from './BusinessVATOverview';
import { BusinessRecurring } from './BusinessRecurring';
import { BusinessProfileView } from './BusinessProfileView';
import { BusinessModuleSettings } from './BusinessModuleSettings';
import { TravelOrdersPanel } from './TravelOrdersPanel';
import { InventoryPanel } from './InventoryPanel';
import { BusinessWorkforcePanel } from './BusinessWorkforcePanel';
import { SynesisExportPanel } from './SynesisExportPanel';
import { Expense } from '@/types/expense';
import { useAppState } from '@/contexts/AppStateContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { isModuleEnabled } from '@/lib/businessModules';
import { useBackButton } from '@/hooks/useBackButton';
import { useTranslation } from 'react-i18next';

type SubView = 'menu' | 'profile' | 'debts' | 'vat' | 'recurring' | 'modules' | 'travel' | 'inventory' | 'workforce' | 'synesis-export';

interface Props {
  expenses: Expense[];
}

export const BusinessMore = ({ expenses }: Props) => {
  const { activeBusinessProfileId } = useAppState();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [view, setView] = useState<SubView>('menu');
  const [enabledModules, setEnabledModules] = useState<string[]>([]);

  useBackButton(view !== 'menu', () => setView('menu'));

  useEffect(() => {
    if (!activeBusinessProfileId || !user) return;
    supabase
      .from('business_profiles')
      .select('enabled_modules')
      .eq('id', activeBusinessProfileId)
      .single()
      .then(({ data }) => {
        if (data) setEnabledModules((data as any).enabled_modules || []);
      });
  }, [activeBusinessProfileId, user]);

  const backButton = (
    <button onClick={() => setView('menu')} className="text-xs text-primary mb-3 flex items-center gap-1">{t('business.more.back', '← Natrag')}</button>
  );

  if (view === 'profile') return <div>{backButton}<BusinessProfileView /></div>;
  if (view === 'modules') return <div>{backButton}<BusinessModuleSettings /></div>;
  if (view === 'debts') return <div>{backButton}<BusinessDebtTracker /></div>;
  if (view === 'vat') return <div>{backButton}<BusinessVATOverview expenses={expenses} /></div>;
  if (view === 'recurring') return <div>{backButton}<BusinessRecurring /></div>;
  if (view === 'travel') return <div>{backButton}<TravelOrdersPanel /></div>;
  if (view === 'inventory') return <div>{backButton}<InventoryPanel /></div>;
  if (view === 'workforce') return <div>{backButton}<BusinessWorkforcePanel /></div>;
  if (view === 'synesis-export') return <div>{backButton}<SynesisExportPanel /></div>;

  type MenuItem = { id: SubView; icon: any; label: string; desc: string; module?: string };

  const allMenuItems: MenuItem[] = [
    { id: 'profile', icon: Building2, label: t('business.more.companyData', 'Podaci o tvrtki'), desc: t('business.more.companyDataDesc', 'Naziv, OIB, adresa, IBAN i ostali podaci') },
    { id: 'modules', icon: Settings2, label: t('business.more.modulesAndIndustry', 'Djelatnost i moduli'), desc: t('business.more.modulesAndIndustryDesc', 'Odaberite djelatnost i prilagodite module') },
    { id: 'debts', icon: Receipt, label: t('business.more.debtsAndReceivables', 'Dugovanja i potraživanja'), desc: t('business.more.debtsAndReceivablesDesc', 'Praćenje tko vam duguje i kome vi dugujete') },
    { id: 'vat', icon: FileText, label: t('business.more.vatOverview', 'PDV pregled'), desc: t('business.more.vatOverviewDesc', 'Procjena ulaznog i izlaznog PDV-a'), module: 'vat_tracking' },
    { id: 'travel', icon: Car, label: t('business.more.travelExpenses', 'Putni troškovi'), desc: t('business.more.travelExpensesDesc', 'Putni nalozi, kilometraža, dnevnice'), module: 'travel_expenses' },
    { id: 'inventory', icon: Package, label: t('business.more.inventory', 'Zalihe'), desc: t('business.more.inventoryDesc', 'Praćenje artikala i stanja skladišta'), module: 'inventory' },
    { id: 'workforce', icon: Users, label: t('business.more.workforce', 'Radnici & satnice'), desc: t('business.more.workforceDesc', 'Evidencija radnika, sati i troškova rada'), module: 'workforce' },
    { id: 'recurring', icon: RefreshCw, label: t('business.more.recurringObligations', 'Ponavljajuće obveze'), desc: t('business.more.recurringObligationsDesc', 'Najam, pretplate, leasing i ostalo') },
    { id: 'synesis-export', icon: FileSpreadsheet, label: 'Izvoz za Synesis', desc: 'Izvezi transakcije u CSV za knjigovodstvo' },
  ];

  const menuItems = allMenuItems.filter(item => !item.module || isModuleEnabled(enabledModules, item.module as any));

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
