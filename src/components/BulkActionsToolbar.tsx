import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CATEGORIES, Category, PAYMENT_SOURCE_GROUPS } from '@/types/expense';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import { Trash2, Tag, CreditCard, X, CheckSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface BulkActionsToolbarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onSelectAll: () => void;
  totalCount: number;
  onBulkCategoryChange: (category: Category) => Promise<void>;
  onBulkPaymentSourceChange: (paymentSource: string) => Promise<void>;
  onBulkDelete: () => Promise<void>;
  showCategoryChange?: boolean;
  showPaymentSourceChange?: boolean;
}

export const BulkActionsToolbar = ({
  selectedCount,
  onClearSelection,
  onSelectAll,
  totalCount,
  onBulkCategoryChange,
  onBulkPaymentSourceChange,
  onBulkDelete,
  showCategoryChange = true,
  showPaymentSourceChange = true,
}: BulkActionsToolbarProps) => {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const { customPaymentSources } = useCustomPaymentSources();

  const handleCategoryChange = async (category: Category) => {
    setIsProcessing(true);
    try {
      await onBulkCategoryChange(category);
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePaymentSourceChange = async (paymentSource: string) => {
    setIsProcessing(true);
    try {
      await onBulkPaymentSourceChange(paymentSource);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async () => {
    setIsProcessing(true);
    try {
      await onBulkDelete();
      setDeleteConfirmOpen(false);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <AnimatePresence>
        {selectedCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-3 rounded-xl bg-primary/10 border border-primary/20 space-y-3"
          >
            {/* Selection info */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">
                  {selectedCount} od {totalCount} odabrano
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onSelectAll}
                  className="h-7 text-xs"
                >
                  Odaberi sve
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClearSelection}
                  className="h-7 text-xs"
                >
                  <X className="w-3 h-3 mr-1" />
                  Poništi
                </Button>
              </div>
            </div>

            {/* Bulk actions */}
            <div className="flex flex-wrap gap-2">
              {/* Category change */}
              {showCategoryChange && (
                <Select 
                  onValueChange={(value) => handleCategoryChange(value as Category)}
                  disabled={isProcessing}
                >
                  <SelectTrigger className="w-auto h-8 text-xs gap-2 bg-background">
                    <Tag className="w-3 h-3" />
                    <SelectValue placeholder="Promijeni kategoriju" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        <span className="flex items-center gap-2">
                          <span>{cat.icon}</span>
                          <span>{cat.name}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Payment source change */}
              {showPaymentSourceChange && (
                <Select 
                  onValueChange={handlePaymentSourceChange}
                  disabled={isProcessing}
                >
                  <SelectTrigger className="w-auto h-8 text-xs gap-2 bg-background">
                    <CreditCard className="w-3 h-3" />
                    <SelectValue placeholder="Promijeni izvor" />
                  </SelectTrigger>
                  <SelectContent>
                    {/* Custom payment sources */}
                    {customPaymentSources.length > 0 && (
                      <>
                        {customPaymentSources.map((source) => (
                          <SelectItem key={source.id} value={`custom:${source.id}`}>
                            <span className="flex items-center gap-2">
                              <span 
                                className="w-4 h-4 rounded-full flex items-center justify-center text-[10px]"
                                style={{ backgroundColor: source.color + '30', color: source.color }}
                              >
                                {source.icon}
                              </span>
                              <span>{source.name}</span>
                            </span>
                          </SelectItem>
                        ))}
                      </>
                    )}
                    {/* Standard payment sources */}
                    {PAYMENT_SOURCE_GROUPS.map((group) => (
                      group.sources.map((source) => (
                        <SelectItem key={source.id} value={source.id}>
                          <span className="flex items-center gap-2">
                            <span>{source.icon}</span>
                            <span>{source.name}</span>
                          </span>
                        </SelectItem>
                      ))
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Delete button */}
              <Button
                variant="destructive"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setDeleteConfirmOpen(true)}
                disabled={isProcessing}
              >
                <Trash2 className="w-3 h-3 mr-1" />
                Obriši ({selectedCount})
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Obrisati {selectedCount} transakcija?</AlertDialogTitle>
            <AlertDialogDescription>
              Ova radnja je nepovratna. Svi odabrani zapisi bit će trajno obrisani.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>Odustani</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete} 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isProcessing}
            >
              {isProcessing ? 'Brisanje...' : 'Obriši'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
