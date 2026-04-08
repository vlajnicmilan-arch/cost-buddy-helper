import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Plus, ChevronDown, ChevronUp, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ReceiptItem } from '@/types/expense';

interface ExpenseItemsListProps {
  items: ReceiptItem[];
  showItems: boolean;
  onShowItemsChange: (show: boolean) => void;
  onAddItem: () => void;
  onUpdateItem: (index: number, field: keyof ReceiptItem, value: string | number) => void;
  onRemoveItem: (index: number) => void;
}

export const ExpenseItemsList = ({
  items,
  showItems,
  onShowItemsChange,
  onAddItem,
  onUpdateItem,
  onRemoveItem,
}: ExpenseItemsListProps) => {
  const { t } = useTranslation();

  return (
    <Collapsible open={showItems} onOpenChange={onShowItemsChange}>
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">
          {t('transactions.expenseItems')}
          {items.length > 0 && (
            <span className="ml-2 text-xs text-primary font-bold">
              ({items.length})
            </span>
          )}
        </Label>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onAddItem}
            className="h-8 text-xs gap-1"
          >
            <Plus className="w-3 h-3" />
            {t('transactions.addItem')}
          </Button>
          {items.length > 0 && (
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                {showItems ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </Button>
            </CollapsibleTrigger>
          )}
        </div>
      </div>
      
      <CollapsibleContent className="mt-2 space-y-2">
        {items.map((item, index) => (
          <div key={index} className="flex gap-2 items-start p-3 bg-muted/50 rounded-xl">
            <div className="flex-1 space-y-2">
              <Input
                placeholder={t('transactions.itemName')}
                value={item.name}
                onChange={(e) => onUpdateItem(index, 'name', e.target.value)}
                className="h-9 text-sm rounded-lg"
              />
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder={t('transactions.qty')}
                  value={item.quantity || ''}
                  onChange={(e) => onUpdateItem(index, 'quantity', parseFloat(e.target.value) || 1)}
                  className="h-9 w-16 text-sm rounded-lg"
                  min="1"
                />
                <Input
                  type="number"
                  step="0.01"
                  placeholder={t('transactions.price')}
                  value={item.unit_price || ''}
                  onChange={(e) => onUpdateItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                  className="h-9 flex-1 text-sm rounded-lg"
                />
                <Input
                  type="number"
                  step="0.01"
                  placeholder={t('common.total')}
                  value={item.total_price || ''}
                  onChange={(e) => onUpdateItem(index, 'total_price', parseFloat(e.target.value) || 0)}
                  className="h-9 w-24 text-sm rounded-lg font-medium"
                />
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onRemoveItem(index)}
              className="h-9 w-9 text-muted-foreground hover:text-destructive shrink-0"
              title={t('transactions.removeItem')}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-3">
            {t('scanner.scanReceipt')} {t('common.or').toLowerCase()} {t('transactions.addItem').toLowerCase()}
          </p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
};
