import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { ProjectFunding } from '@/types/project';
import { useProjectFunding } from '@/hooks/useProjectFunding';
import { useIncomeSources } from '@/hooks/useIncomeSources';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Wallet, Loader2 } from 'lucide-react';

interface ProjectFundingTabProps {
  projectId: string;
  funding: ProjectFunding[];
  totalAllocated: number;
  projectBudget: number;
  isManager: boolean;
  loading: boolean;
  onRefetch: () => void;
}

export const ProjectFundingTab = ({
  projectId,
  funding,
  totalAllocated,
  projectBudget,
  isManager,
  loading,
  onRefetch
}: ProjectFundingTabProps) => {
  const { t } = useTranslation();
  const { formatAmount, currency } = useCurrency();
  const { addFunding, deleteFunding } = useProjectFunding(projectId);
  const { incomeSources } = useIncomeSources();
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Form state
  const [selectedSource, setSelectedSource] = useState('');
  const [amount, setAmount] = useState('');
  const [percentage, setPercentage] = useState('');

  // Filter out already linked sources
  const availableSources = incomeSources.filter(
    s => !funding.some(f => f.income_source_id === s.id)
  );

  const allocationPercentage = projectBudget > 0 
    ? (totalAllocated / projectBudget) * 100 
    : 0;

  const handleAdd = async () => {
    if (!selectedSource || !amount) return;
    
    setSaving(true);
    try {
      await addFunding(
        selectedSource,
        parseFloat(amount),
        percentage ? parseFloat(percentage) : undefined
      );
      setDialogOpen(false);
      setSelectedSource('');
      setAmount('');
      setPercentage('');
      onRefetch();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm(t('projects.confirmRemoveFunding'))) {
      await deleteFunding(id);
      onRefetch();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Allocation summary */}
      {projectBudget > 0 && (
        <div className="p-4 rounded-lg bg-muted/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">{t('projects.fundingAllocation')}</span>
            <span className="text-sm text-muted-foreground">
              {formatAmount(totalAllocated)} / {formatAmount(projectBudget)}
            </span>
          </div>
          <Progress value={Math.min(allocationPercentage, 100)} className="h-2" />
          <p className="text-xs text-muted-foreground mt-1">
            {allocationPercentage.toFixed(0)}% {t('projects.ofBudgetAllocated')}
          </p>
        </div>
      )}

      {isManager && availableSources.length > 0 && (
        <div className="flex justify-end">
          <Button onClick={() => setDialogOpen(true)} size="sm">
            <Plus className="w-4 h-4 mr-2" />
            {t('projects.addFunding')}
          </Button>
        </div>
      )}

      {funding.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Wallet className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>{t('projects.noFunding')}</p>
          <p className="text-sm">{t('projects.noFundingHint')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {funding.map((f) => (
            <div 
              key={f.id}
              className="p-4 rounded-lg border bg-card flex items-center gap-3"
            >
              <div 
                className="w-10 h-10 rounded-lg flex items-center justify-center text-xl shrink-0"
                style={{ backgroundColor: `${f.income_source_color}20` }}
              >
                {f.income_source_icon || '💰'}
              </div>
              
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{f.income_source_name}</p>
                <p className="text-sm text-muted-foreground">
                  {formatAmount(f.allocated_amount)}
                  {f.percentage && ` (${f.percentage}%)`}
                </p>
              </div>

              {isManager && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="text-destructive"
                  onClick={() => handleDelete(f.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Funding Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('projects.addFunding')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('projects.incomeSource')}</Label>
              <Select value={selectedSource} onValueChange={setSelectedSource}>
                <SelectTrigger>
                  <SelectValue placeholder={t('projects.selectIncomeSource')} />
                </SelectTrigger>
                <SelectContent>
                  {availableSources.map((source) => (
                    <SelectItem key={source.id} value={source.id}>
                      <div className="flex items-center gap-2">
                        <span>{source.icon}</span>
                        <span>{source.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('projects.allocatedAmount')}</Label>
              <div className="relative">
                <Input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="pr-12"
                  min="0"
                  step="0.01"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {currency.symbol}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('projects.percentageOptional')}</Label>
              <div className="relative">
                <Input
                  type="number"
                  value={percentage}
                  onChange={(e) => setPercentage(e.target.value)}
                  placeholder="0"
                  className="pr-8"
                  min="0"
                  max="100"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  %
                </span>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button className="flex-1" onClick={handleAdd} disabled={saving || !selectedSource || !amount}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {t('common.add')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
