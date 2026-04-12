import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CATEGORIES, Category, PAYMENT_SOURCE_GROUPS } from '@/types/expense';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import { Trash2, Settings2, X, CheckSquare, Tag, CreditCard } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
                  {t('bulk.selected', { count: selectedCount, total: totalCount })}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onSelectAll}
                  className="h-7 text-xs"
                >
                  {t('bulk.selectAll')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClearSelection}
                  className="h-7 text-xs"
                >
                  <X className="w-3 h-3 mr-1" />
                  {t('bulk.deselect')}
                </Button>
              </div>
            </div>

            {/* Bulk actions */}
            <div className="flex flex-wrap gap-2">
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
                      {t('bulk.bulkChange')}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    {showCategoryChange && (
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <Tag className="w-4 h-4 mr-2" />
                          {t('bulk.category_label')}
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

                    {showPaymentSourceChange && (
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <CreditCard className="w-4 h-4 mr-2" />
                          {t('bulk.payment')}
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="max-h-64 overflow-y-auto">
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

              <Button
                variant="destructive"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setDeleteConfirmOpen(true)}
                disabled={isProcessing}
              >
                <Trash2 className="w-3 h-3 mr-1" />
                {t('bulk.deleteCount', { count: selectedCount })}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent className="z-[70]">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('bulk.deleteConfirmTitle', { count: selectedCount })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('bulk.deleteConfirmDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete} 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isProcessing}
            >
              {isProcessing ? t('bulk.deleting') : t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
