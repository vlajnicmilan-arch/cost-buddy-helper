import { useState } from 'react';
import { Receipt, RefreshCw, FileText, Building2, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { BusinessDebtTracker } from './BusinessDebtTracker';
import { BusinessVATOverview } from './BusinessVATOverview';
import { BusinessRecurring } from './BusinessRecurring';
import { Expense } from '@/types/expense';

type SubView = 'menu' | 'debts' | 'vat' | 'recurring';

interface Props {
  expenses: Expense[];
}

const menuItems = [
  { id: 'debts' as SubView, icon: Receipt, label: 'Dugovanja i potraživanja', desc: 'Praćenje tko vam duguje i kome vi dugujete' },
  { id: 'vat' as SubView, icon: FileText, label: 'PDV pregled', desc: 'Procjena ulaznog i izlaznog PDV-a' },
  { id: 'recurring' as SubView, icon: RefreshCw, label: 'Ponavljajuće obveze', desc: 'Najam, pretplate, leasing i ostalo' },
];

export const BusinessMore = ({ expenses }: Props) => {
  const [view, setView] = useState<SubView>('menu');

  if (view === 'debts') return (
    <div>
      <button onClick={() => setView('menu')} className="text-xs text-primary mb-3 flex items-center gap-1">← Natrag</button>
      <BusinessDebtTracker />
    </div>
  );

  if (view === 'vat') return (
    <div>
      <button onClick={() => setView('menu')} className="text-xs text-primary mb-3 flex items-center gap-1">← Natrag</button>
      <BusinessVATOverview expenses={expenses} />
    </div>
  );

  if (view === 'recurring') return (
    <div>
      <button onClick={() => setView('menu')} className="text-xs text-primary mb-3 flex items-center gap-1">← Natrag</button>
      <BusinessRecurring />
    </div>
  );

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
