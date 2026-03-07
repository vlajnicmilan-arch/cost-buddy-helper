import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Checkbox } from '@/components/ui/checkbox';
import { TransactionItem, TransactionContextLookup } from '@/components/TransactionItem';
import { Expense } from '@/types/expense';

interface VirtualTransactionListProps {
  expenses: Expense[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onClickDetail: (expense: Expense) => void;
  contextLookup?: TransactionContextLookup;
}

const ITEM_HEIGHT = 52; // px — estimated row height

export const VirtualTransactionList = ({
  expenses,
  selectedIds,
  onToggleSelect,
  onDelete,
  onClickDetail,
  contextLookup,
}: VirtualTransactionListProps) => {
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: expenses.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 10,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalHeight = rowVirtualizer.getTotalSize();

  return (
    <div
      ref={parentRef}
      className="max-h-[420px] overflow-y-auto pr-1"
      style={{ contain: 'strict' }}
    >
      {/* Sentinel — full virtual height so scrollbar is correct */}
      <div style={{ height: totalHeight, width: '100%', position: 'relative' }}>
        {virtualItems.map((virtualRow) => {
          const expense = expenses[virtualRow.index];
          return (
            <div
              key={expense.id}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div className="flex items-center gap-2 py-0.5">
                <Checkbox
                  checked={selectedIds.has(expense.id)}
                  onCheckedChange={() => onToggleSelect(expense.id)}
                  className="shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <TransactionItem
                    expense={expense}
                    onDelete={onDelete}
                    onClick={(e) => {
                      if (selectedIds.size === 0) {
                        onClickDetail(e);
                      } else {
                        onToggleSelect(e.id);
                      }
                    }}
                    contextLookup={contextLookup}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
