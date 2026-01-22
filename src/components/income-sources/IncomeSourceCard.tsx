import { IncomeSource } from '@/types/incomeSource';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface IncomeSourceCardProps {
  source: IncomeSource;
  totalAmount: number;
  transactionCount: number;
  onEdit: (source: IncomeSource) => void;
  onDelete: (id: string) => void;
  onClick: (source: IncomeSource) => void;
}

export const IncomeSourceCard = ({
  source,
  totalAmount,
  transactionCount,
  onEdit,
  onDelete,
  onClick
}: IncomeSourceCardProps) => {
  const formatAmount = (value: number) => {
    return new Intl.NumberFormat('hr-HR', {
      style: 'currency',
      currency: 'EUR',
    }).format(value);
  };

  const sourceColor = source.color || '#22c55e';
  const sourceIcon = source.icon || '💰';

  return (
    <div 
      className="relative group p-4 rounded-xl border bg-card hover:shadow-md transition-all cursor-pointer"
      style={{ borderLeftColor: sourceColor, borderLeftWidth: 4 }}
      onClick={() => onClick(source)}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div 
          className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
          style={{ backgroundColor: `${sourceColor}20` }}
        >
          {sourceIcon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold truncate">{source.name}</h3>
          {source.description && (
            <p className="text-sm text-muted-foreground truncate">{source.description}</p>
          )}
          <div className="mt-2 flex items-center gap-4 text-sm">
            <span className="font-mono font-semibold text-income">
              {formatAmount(totalAmount)}
            </span>
            <span className="text-muted-foreground">
              {transactionCount} {transactionCount === 1 ? 'transakcija' : 'transakcija'}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className={cn(
          "flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity",
          "absolute top-2 right-2"
        )}>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(source);
            }}
          >
            <Pencil className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(source.id);
            }}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};
