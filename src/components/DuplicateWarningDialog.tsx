import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';
import { Expense, Category, IncomeCategory, getCategoryInfo } from '@/types/expense';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { hr, de, enUS } from 'date-fns/locale';

interface DuplicateWarningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  duplicateOf: Expense | null;
  newTransaction: {
    amount: number;
    description: string;
    date: Date;
    type: string;
    category: string;
    merchant_name?: string;
  } | null;
  onConfirm: () => void;
  onCancel: () => void;
  /** Optional centralized match metadata for richer messaging. */
  level?: 'strict' | 'fuzzy' | 'suspicious';
  reasonKey?: string;
}

export const DuplicateWarningDialog = ({
  open,
  onOpenChange,
  duplicateOf,
  newTransaction,
  onConfirm,
  onCancel,
  level,
  reasonKey,
}: DuplicateWarningDialogProps) => {
  const { t, i18n } = useTranslation();
  const { formatAmount } = useCurrency();

  const getLocale = () => {
    switch (i18n.language) {
      case 'hr': return hr;
      case 'de': return de;
      default: return enUS;
    }
  };

  if (!duplicateOf || !newTransaction) return null;

  const existingCategoryInfo = getCategoryInfo(duplicateOf.category);
  const newCategoryInfo = getCategoryInfo(newTransaction.category as Category | IncomeCategory);

  const levelLabel = level ? t(`duplicates.level.${level}`, level) : null;
  const reasonText = reasonKey ? t(reasonKey, '') : '';

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-warning">
            <AlertTriangle className="w-5 h-5" />
            {t('duplicates.possibleDuplicate', 'Moguća duplirana transakcija')}
            {levelLabel && (
              <Badge variant="outline" className="ml-1 text-[10px] uppercase">
                {levelLabel}
              </Badge>
            )}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-left space-y-4">
            <p className="text-sm text-muted-foreground">
              {reasonText || t('duplicates.foundSimilar', 'Pronašli smo sličnu transakciju u vašoj evidenciji. Jeste li sigurni da želite dodati novu?')}
            </p>

            
            {/* Existing transaction */}
            <div className="p-3 bg-muted/50 rounded-lg border space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase">
                  {t('duplicates.existingTransaction', 'Postojeća transakcija')}
                </span>
                <Badge variant="outline" className="text-xs">
                  {format(duplicateOf.date, 'dd.MM.yyyy', { locale: getLocale() })}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{existingCategoryInfo.icon}</span>
                  <div>
                    <p className="font-medium text-sm">{duplicateOf.description}</p>
                    {duplicateOf.merchant_name && (
                      <p className="text-xs text-muted-foreground">{duplicateOf.merchant_name}</p>
                    )}
                  </div>
                </div>
                <p className={`font-bold ${duplicateOf.type === 'income' ? 'text-income' : 'text-destructive'}`}>
                  {duplicateOf.type === 'expense' ? '-' : ''}{formatAmount(duplicateOf.amount)}
                </p>
              </div>
            </div>

            {/* New transaction */}
            <div className="p-3 bg-primary/5 rounded-lg border border-primary/20 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-primary uppercase">
                  {t('duplicates.newTransaction', 'Nova transakcija')}
                </span>
                <Badge variant="outline" className="text-xs border-primary/30">
                  {format(newTransaction.date, 'dd.MM.yyyy', { locale: getLocale() })}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{newCategoryInfo.icon}</span>
                  <div>
                    <p className="font-medium text-sm">{newTransaction.description}</p>
                    {newTransaction.merchant_name && (
                      <p className="text-xs text-muted-foreground">{newTransaction.merchant_name}</p>
                    )}
                  </div>
                </div>
                <p className={`font-bold ${newTransaction.type === 'income' ? 'text-income' : 'text-destructive'}`}>
                  {newTransaction.type === 'expense' ? '-' : ''}{formatAmount(newTransaction.amount)}
                </p>
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-0">
          <AlertDialogCancel onClick={onCancel}>
            {t('common.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction 
            onClick={onConfirm}
            className="bg-warning text-warning-foreground hover:bg-warning/90"
          >
            {t('duplicates.addAnyway', 'Dodaj svejedno')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
