import { useState, useEffect } from 'react';
import { Receipt, RefreshCw, FileText, Building2, ChevronRight, Settings2, Car, Package, Banknote, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { BusinessDebtTracker } from './BusinessDebtTracker';
import { BusinessVATOverview } from './BusinessVATOverview';
import { BusinessRecurring } from './BusinessRecurring';
import { BusinessProfileView } from './BusinessProfileView';
import { BusinessModuleSettings } from './BusinessModuleSettings';
import { TravelOrdersPanel } from './TravelOrdersPanel';
import { InvoicingPanel } from './InvoicingPanel';
import { InventoryPanel } from './InventoryPanel';
import { Expense } from '@/types/expense';
import { useAppState } from '@/contexts/AppStateContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { isModuleEnabled } from '@/lib/businessModules';

type SubView = 'menu' | 'profile' | 'debts' | 'vat' | 'recurring' | 'modules' | 'travel' | 'invoicing' | 'inventory';

interface Props {
  expenses: Expense[];
}

export const BusinessMore = ({ expenses }: Props) => {
  const { activeBusinessProfileId } = useAppState();
  const { user } = useAuth();
  const [view, setView] = useState<SubView>('menu');
  const [enabledModules, setEnabledModules] = useState<string[]>([]);

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
    <button onClick={() => setView('menu')} className="text-xs text-primary mb-3 flex items-center gap-1">← Natrag</button>
  );

  if (view === 'profile') return <div>{backButton}<BusinessProfileView /></div>;
  if (view === 'modules') return <div>{backButton}<BusinessModuleSettings /></div>;
  if (view === 'debts') return <div>{backButton}<BusinessDebtTracker /></div>;
  if (view === 'vat') return <div>{backButton}<BusinessVATOverview expenses={expenses} /></div>;
  if (view === 'recurring') return <div>{backButton}<BusinessRecurring /></div>;
  if (view === 'travel') return <div>{backButton}<TravelOrdersPanel /></div>;
  if (view === 'invoicing') return <div>{backButton}<InvoicingPanel /></div>;
  if (view === 'inventory') return <div>{backButton}<InventoryPanel /></div>;

  type MenuItem = { id: SubView; icon: any; label: string; desc: string; module?: string };

  const allMenuItems: MenuItem[] = [
    { id: 'profile', icon: Building2, label: 'Podaci o tvrtki', desc: 'Naziv, OIB, adresa, IBAN i ostali podaci' },
    { id: 'modules', icon: Settings2, label: 'Djelatnost i moduli', desc: 'Odaberite djelatnost i prilagodite module' },
    { id: 'debts', icon: Receipt, label: 'Dugovanja i potraživanja', desc: 'Praćenje tko vam duguje i kome vi dugujete' },
    { id: 'vat', icon: FileText, label: 'PDV pregled', desc: 'Procjena ulaznog i izlaznog PDV-a', module: 'vat_tracking' },
    { id: 'travel', icon: Car, label: 'Putni troškovi', desc: 'Putni nalozi, kilometraža, dnevnice', module: 'travel_expenses' },
    { id: 'invoicing', icon: Banknote, label: 'Fakturiranje', desc: 'Klijenti i izdavanje računa', module: 'invoicing' },
    { id: 'inventory', icon: Package, label: 'Zalihe', desc: 'Praćenje artikala i stanja skladišta', module: 'inventory' },
    { id: 'recurring', icon: RefreshCw, label: 'Ponavljajuće obveze', desc: 'Najam, pretplate, leasing i ostalo' },
  ];

  // Filter by enabled modules (items without module field are always shown)
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
