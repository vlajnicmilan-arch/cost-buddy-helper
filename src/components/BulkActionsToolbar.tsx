import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CATEGORIES, Category, PAYMENT_SOURCE_GROUPS } from '@/types/expense';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import { Trash2, Settings2, X, CheckSquare, Tag, CreditCard } from 'lucide-react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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
              {/* Combined dropdown for category and payment source */}
              {(showCategoryChange || showPaymentSourceChange) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-8 text-xs gap-2 bg-background"
                      disabled={isProcessing}
                    >
                      <Settings2 className="w-3 h-3" />
                      Grupna promjena
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    {/* Category submenu */}
                    {showCategoryChange && (
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <Tag className="w-4 h-4 mr-2" />
                          Kategorija
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="max-h-64 overflow-y-auto">
                          {CATEGORIES.map((cat) => (
                            <DropdownMenuItem 
                              key={cat.id} 
                              onClick={() => handleCategoryChange(cat.id as Category)}
                            >
                              <span className="mr-2">{cat.icon}</span>
                              {cat.name}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    )}

                    {/* Payment source submenu */}
                    {showPaymentSourceChange && (
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <CreditCard className="w-4 h-4 mr-2" />
                          Plaćanje
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="max-h-64 overflow-y-auto">
                          {/* Custom payment sources */}
                          {customPaymentSources.length > 0 && (
                            <>
                              {customPaymentSources.map((source) => (
                                <DropdownMenuItem 
                                  key={source.id} 
                                  onClick={() => handlePaymentSourceChange(`custom:${source.id}`)}
                                >
                                  <span 
                                    className="w-4 h-4 mr-2 rounded-full flex items-center justify-center text-[10px]"
                                    style={{ backgroundColor: source.color + '30', color: source.color }}
                                  >
                                    {source.icon}
                                  </span>
                                  {source.name}
                                </DropdownMenuItem>
                              ))}
                            </>
                          )}
                          {/* Standard payment sources */}
                          {PAYMENT_SOURCE_GROUPS.map((group) => (
                            group.sources.map((source) => (
                              <DropdownMenuItem 
                                key={source.id} 
                                onClick={() => handlePaymentSourceChange(source.id)}
                              >
                                <span className="mr-2">{source.icon}</span>
                                {source.name}
                              </DropdownMenuItem>
                            ))
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
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
