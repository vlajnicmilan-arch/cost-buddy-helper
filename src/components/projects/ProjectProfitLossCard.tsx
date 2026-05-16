import { useState } from 'react';
import { useProjectProfitLoss } from '@/hooks/useProjectProfitLoss';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { TrendingUp, Users, Handshake, Package, Loader2, ChevronDown, ChevronUp, Wallet, FileSignature } from 'lucide-react';

interface ProjectProfitLossCardProps {
  projectId: string;
}

export const ProjectProfitLossCard = ({ projectId }: ProjectProfitLossCardProps) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const pl = useProjectProfitLoss(projectId);
  const [expanded, setExpanded] = useState(false);

  if (pl.loading) {
    return (
      <div className="p-4 rounded-lg border flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasData = pl.totalIncome > 0 || pl.totalExpenses > 0 || pl.contractValue > 0;

  if (!hasData) {
    return (
      <div className="p-4 rounded-lg border text-center text-muted-foreground">
        <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">{t('projects.noPLData', 'Nema podataka za P&L prikaz')}</p>
      </div>
    );
  }

  const totalCosts = pl.laborCost + pl.collaboratorCost + pl.materialCost;
  const cashBalance = pl.totalIncome - totalCosts;
  const hasContract = pl.contractValue > 0;

  return (
    <div className="p-4 rounded-lg border space-y-4">
      <div className="flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-muted-foreground" />
        <span className="font-medium">{t('projects.profitLoss', 'Profitabilnost (P&L)')}</span>
      </div>

      {/* Dual View Grid */}
      <div className={cn("grid gap-3", hasContract ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1")}>
        {/* LEFT: Current state (cash basis) */}
        <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Wallet className="w-3.5 h-3.5" />
            {t('projects.currentStateCash', 'Trenutno stanje (gotovina)')}
          </div>
          <div className="space-y-1 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('projects.collected', 'Naplaćeno')}</span>
              <span className="font-medium text-income">+{formatAmount(pl.totalIncome)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('projects.plCosts', 'Troškovi')}</span>
              <span className="font-medium text-expense">-{formatAmount(totalCosts)}</span>
            </div>
          </div>
          <div className="pt-2 border-t border-dashed">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">{t('projects.cashBalance', 'Cash saldo')}</span>
              <span className={cn("font-bold", cashBalance >= 0 ? "text-income" : "text-destructive")}>
                {cashBalance >= 0 ? '+' : ''}{formatAmount(cashBalance)}
              </span>
            </div>
            {hasContract && pl.remainingToCollect > 0 && (
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-muted-foreground">{t('projects.remainingToCollect', 'Za naplatu')}</span>
                <span className="text-xs font-medium text-muted-foreground">
                  {formatAmount(pl.remainingToCollect)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Expected (contract / accrual) — only when contract value exists */}
        {hasContract && (
          <div className="rounded-lg border bg-primary/5 p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
              <FileSignature className="w-3.5 h-3.5" />
              {t('projects.expectedContract', 'Očekivano (ugovor)')}
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t('projects.contracted', 'Ugovoreno')}</span>
                <span className="font-medium">{formatAmount(pl.contractValue)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t('projects.allCosts', 'Svi troškovi')}</span>
                <span className="font-medium text-expense">-{formatAmount(totalCosts)}</span>
              </div>
            </div>
            <div className="pt-2 border-t border-dashed">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">{t('projects.expectedProfit', 'Očekivani profit')}</span>
                <span className={cn("font-bold", pl.expectedProfit >= 0 ? "text-income" : "text-destructive")}>
                  {pl.expectedProfit >= 0 ? '+' : ''}{formatAmount(pl.expectedProfit)}
                </span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-muted-foreground">{t('projects.expectedMargin', 'Očekivana marža')}</span>
                <span className={cn("text-xs font-medium", pl.expectedMargin >= 0 ? "text-income" : "text-destructive")}>
                  {pl.expectedMargin.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Costs breakdown */}
      <div className="space-y-1.5 pl-2 border-l-2 border-muted">
        <div className="text-xs font-medium text-muted-foreground mb-1">
          {t('projects.costBreakdown', 'Razrada troškova')}
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

      {/* Expandable worker/collaborator details */}
      {(pl.workers.length > 0 || pl.collaborators.length > 0) && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors pt-1"
          >
            {expanded ? (
              <>
                <ChevronUp className="w-3 h-3" />
                {t('common.showLess', 'Prikaži manje')}
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3" />
                {t('projects.showResourceDetails', 'Prikaži detalje resursa')}
              </>
            )}
          </button>

          {expanded && (
            <div className="space-y-3 pt-2 border-t">
              {/* Workers detail */}
              {pl.workers.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Users className="w-3.5 h-3.5" />
                    {t('projects.workersDetail', 'Radnici')}
                  </div>
                  <div className="space-y-1">
                    {pl.workers.map(w => (
                      <div key={w.id} className="flex items-center justify-between text-xs p-2 rounded bg-muted/50">
                        <span className="font-medium">{w.name}</span>
                        <div className="flex items-center gap-3 text-muted-foreground">
                          <span>{w.hours.toFixed(1)}h × {formatAmount(w.rate)}/h</span>
                          <span className="font-medium text-foreground">{formatAmount(w.cost)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Collaborators detail */}
              {pl.collaborators.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Handshake className="w-3.5 h-3.5" />
                    {t('projects.collaboratorsDetail', 'Suradnici')}
                  </div>
                  <div className="space-y-1">
                    {pl.collaborators.map(c => (
                      <div key={c.id} className="flex items-center justify-between text-xs p-2 rounded bg-muted/50">
                        <span className="font-medium">{c.name}</span>
                        <div className="flex items-center gap-3 text-muted-foreground">
                          <span>{formatAmount(c.paidAmount)} / {formatAmount(c.totalPrice)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
