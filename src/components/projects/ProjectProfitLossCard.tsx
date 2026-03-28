import { useProjectProfitLoss } from '@/hooks/useProjectProfitLoss';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Users, Handshake, Package, Loader2 } from 'lucide-react';

interface ProjectProfitLossCardProps {
  projectId: string;
}

export const ProjectProfitLossCard = ({ projectId }: ProjectProfitLossCardProps) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const pl = useProjectProfitLoss(projectId);

  if (pl.loading) {
    return (
      <div className="p-4 rounded-lg border flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasData = pl.totalIncome > 0 || pl.totalExpenses > 0;

  if (!hasData) {
    return (
      <div className="p-4 rounded-lg border text-center text-muted-foreground">
        <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">{t('projects.noPLData', 'Nema podataka za P&L prikaz')}</p>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-lg border space-y-3">
      <div className="flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-muted-foreground" />
        <span className="font-medium">{t('projects.profitLoss', 'Profitabilnost (P&L)')}</span>
      </div>

      {/* Income */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-income">{t('projects.plIncome', 'Prihodi')}</span>
          <span className="font-semibold text-income">+{formatAmount(pl.totalIncome)}</span>
        </div>
      </div>

      {/* Costs breakdown */}
      <div className="space-y-1.5 pl-2 border-l-2 border-muted">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{t('projects.plCosts', 'Troškovi')}</span>
          <span className="font-semibold text-expense">-{formatAmount(pl.laborCost + pl.collaboratorCost + pl.materialCost)}</span>
        </div>
        
        {pl.laborCost > 0 && (
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1 text-muted-foreground">
              <Users className="w-3 h-3" />
              {t('projects.plLabor', 'Radna snaga')}
            </span>
            <span className="text-muted-foreground">-{formatAmount(pl.laborCost)}</span>
          </div>
        )}
        
        {pl.collaboratorCost > 0 && (
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1 text-muted-foreground">
              <Handshake className="w-3 h-3" />
              {t('projects.plCollaborators', 'Suradnici')}
            </span>
            <span className="text-muted-foreground">-{formatAmount(pl.collaboratorCost)}</span>
          </div>
        )}
        
        {pl.materialCost > 0 && (
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1 text-muted-foreground">
              <Package className="w-3 h-3" />
              {t('projects.plMaterial', 'Materijalni troškovi')}
            </span>
            <span className="text-muted-foreground">-{formatAmount(pl.materialCost)}</span>
          </div>
        )}
      </div>

      {/* Net profit */}
      <div className="pt-2 border-t border-dashed">
        <div className="flex items-center justify-between">
          <span className="font-medium">{t('projects.plNetProfit', 'Neto dobit')}</span>
          <span className={cn("font-bold text-lg", pl.netProfit >= 0 ? "text-income" : "text-destructive")}>
            {pl.netProfit >= 0 ? '+' : ''}{formatAmount(pl.netProfit)}
          </span>
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs text-muted-foreground">{t('projects.plMargin', 'Marža')}</span>
          <span className={cn("text-sm font-medium", pl.margin >= 0 ? "text-income" : "text-destructive")}>
            {pl.margin.toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
};
