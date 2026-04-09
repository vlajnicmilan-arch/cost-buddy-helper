import { useState, useCallback, useRef } from 'react';
import { Plus, Pencil, Trash2, CreditCard, Sparkles, GripVertical, Users, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import { CustomPaymentSourceDialog } from './CustomPaymentSourceDialog';
import { BalanceCorrectionDialog } from './BalanceCorrectionDialog';
import { PaymentSourceMembersDialog } from './PaymentSourceMembersDialog';
import { CustomPaymentSource, SUGGESTED_PAYMENT_SOURCES } from '@/types/customPaymentSource';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useStorage } from '@/contexts/StorageContext';
import { saveLocalExpense } from '@/lib/storage/indexedDB';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface CustomPaymentSourcesPanelProps {
  hideHeader?: boolean;
  onSourceClick?: (source: CustomPaymentSource) => void;
  onRefetchExpenses?: () => void;
}

export const CustomPaymentSourcesPanel = ({ hideHeader = false, onSourceClick }: CustomPaymentSourcesPanelProps) => {
  const { ownedPaymentSources: customPaymentSources, loading, addCustomPaymentSource, updateCustomPaymentSource, deleteCustomPaymentSource, addCard, deleteCard, reorderPaymentSources } = useCustomPaymentSources();
  const { user } = useAuth();
  const { storageMode } = useStorage();
  const isLocalMode = storageMode === 'local' && !user;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<CustomPaymentSource | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [sourceToDelete, setSourceToDelete] = useState<CustomPaymentSource | null>(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [initialData, setInitialData] = useState<{ name: string; icon: string; color: string; balance?: number } | undefined>();
  const [reorderMode, setReorderMode] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [membersDialogSource, setMembersDialogSource] = useState<CustomPaymentSource | null>(null);
  const [balanceCorrectionSource, setBalanceCorrectionSource] = useState<CustomPaymentSource | null>(null);
  const { t } = useTranslation();

  const handleBalanceCorrection = async (newBalance: number) => {
    if (!balanceCorrectionSource) return;
    const currentBalance = balanceCorrectionSource.balance || 0;
    const difference = newBalance - currentBalance;

    // Update the balance on the payment source
    await updateCustomPaymentSource(balanceCorrectionSource.id, {
      name: balanceCorrectionSource.name,
      icon: balanceCorrectionSource.icon,
      color: balanceCorrectionSource.color,
      balance: newBalance,
      description: balanceCorrectionSource.description || undefined,
    });

    // Create a correction transaction so it shows in history
    if (difference !== 0) {
      const correctionType = difference > 0 ? 'income' : 'expense';
      const correctionAmount = Math.abs(difference);
      const correctionData = {
        amount: correctionAmount,
        description: `Korekcija salda — ${balanceCorrectionSource.name}`,
        category: 'other',
        type: correctionType,
        date: new Date(),
        payment_source: `custom:${balanceCorrectionSource.id}`,
        note: `Saldo korigiran s ${currentBalance.toFixed(2)} na ${newBalance.toFixed(2)}`,
        expense_nature: 'correction' as string,
      };

      if (isLocalMode) {
        await saveLocalExpense(correctionData as any);
      } else if (user) {
        await supabase.from('expenses').insert({
          user_id: user.id,
          amount: correctionAmount,
          description: correctionData.description,
          category: correctionData.category,
          type: correctionType,
          date: new Date().toISOString(),
          payment_source: correctionData.payment_source,
          note: correctionData.note,
          expense_nature: 'correction',
        });
      }
    }

    setBalanceCorrectionSource(null);
  };

  const handleSave = async (data: { name: string; icon: string; color: string; balance: number; description?: string }) => {
    if (editingSource) {
      await updateCustomPaymentSource(editingSource.id, data);
    } else {
      await addCustomPaymentSource(data);
    }
    setEditingSource(null);
    setInitialData(undefined);
  };

  const handleEdit = (source: CustomPaymentSource) => {
    setEditingSource(source);
    setInitialData(undefined);
    setDialogOpen(true);
  };

  const handleDelete = (source: CustomPaymentSource) => {
    setSourceToDelete(source);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (sourceToDelete) {
      await deleteCustomPaymentSource(sourceToDelete.id);
      setSourceToDelete(null);
      setDeleteConfirmOpen(false);
    }
  };

  const openNewDialog = () => {
    setEditingSource(null);
    setInitialData(undefined);
    setDialogOpen(true);
  };

  const handleSuggestionClick = (suggestion: { name: string; icon: string; color: string }) => {
    // Check if already exists
    const exists = customPaymentSources.some(
      src => src.name.toLowerCase() === suggestion.name.toLowerCase()
    );
    if (exists) {
      return;
    }
    setEditingSource(null);
    setInitialData({ ...suggestion, balance: 0 });
    setDialogOpen(true);
  };

  // Filter out suggestions that are already added
  const availableSuggestions = SUGGESTED_PAYMENT_SOURCES.filter(
    suggestion => !customPaymentSources.some(
      src => src.name.toLowerCase() === suggestion.name.toLowerCase()
    )
  );

  // Drag and drop handlers (desktop)
  const handleDragStart = useCallback((index: number) => {
    setDraggedIndex(index);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newSources = [...customPaymentSources];
    const [draggedItem] = newSources.splice(draggedIndex, 1);
    newSources.splice(index, 0, draggedItem);
    
    reorderPaymentSources(newSources);
    setDraggedIndex(index);
  }, [draggedIndex, customPaymentSources, reorderPaymentSources]);

  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null);
  }, []);

  // Touch handlers for mobile drag-and-drop
  const touchStartY = useRef<number>(0);
  const touchStartIndex = useRef<number | null>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  const handleTouchStart = useCallback((e: React.TouchEvent, index: number) => {
    if (!reorderMode) return;
    touchStartY.current = e.touches[0].clientY;
    touchStartIndex.current = index;
    setDraggedIndex(index);
  }, [reorderMode]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!reorderMode || touchStartIndex.current === null) return;
    e.preventDefault(); // Prevent scrolling while dragging
    
    const currentY = e.touches[0].clientY;
    const currentIndex = touchStartIndex.current;
    
    // Find which item we're hovering over
    for (let i = 0; i < itemRefs.current.length; i++) {
      const item = itemRefs.current[i];
      if (item && i !== currentIndex) {
        const rect = item.getBoundingClientRect();
        if (currentY >= rect.top && currentY <= rect.bottom) {
          // Swap items
          const newSources = [...customPaymentSources];
          const [draggedItem] = newSources.splice(currentIndex, 1);
          newSources.splice(i, 0, draggedItem);
          
          reorderPaymentSources(newSources);
          touchStartIndex.current = i;
          setDraggedIndex(i);
          break;
        }
      }
    }
  }, [reorderMode, customPaymentSources, reorderPaymentSources]);

  const handleTouchEnd = useCallback(() => {
    touchStartIndex.current = null;
    setDraggedIndex(null);
  }, []);

  if (loading) {
    if (hideHeader) {
      return (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      );
    }
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            {t('paymentSources.myAccounts')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const content = (
    <div className="space-y-4">
      {/* Reorder toggle */}
      {customPaymentSources.length > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Label htmlFor="reorder-mode" className="text-sm text-muted-foreground cursor-pointer">
            {t('common.reorderMode', 'Preslagivanje')}
          </Label>
          <Switch
            id="reorder-mode"
            checked={reorderMode}
            onCheckedChange={setReorderMode}
          />
        </div>
      )}

      {/* Existing custom sources */}
      {customPaymentSources.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          {t('common.noCustomPaymentSources')}<br />
          {t('common.clickNewToAdd')}
        </p>
      ) : (
        <div className="space-y-2">
          {customPaymentSources.map((source, index) => (
            <div
              key={source.id}
              ref={(el) => { itemRefs.current[index] = el; }}
              draggable={reorderMode}
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              onTouchStart={(e) => handleTouchStart(e, index)}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onClick={() => !reorderMode && onSourceClick?.(source)}
              className={`p-3 rounded-lg border bg-card transition-all duration-200 ${reorderMode ? 'touch-none' : ''} ${
                reorderMode 
                  ? 'cursor-grab active:cursor-grabbing hover:border-primary/50' 
                  : onSourceClick ? 'hover:bg-muted/50 cursor-pointer' : 'hover:bg-muted/50'
              } ${draggedIndex === index
                ? 'scale-105 shadow-xl shadow-primary/20 border-primary z-10 relative bg-card/95 backdrop-blur-sm' 
                : ''
              }`}
              style={draggedIndex === index ? { 
                boxShadow: `0 20px 40px -10px ${source.color}40, 0 10px 20px -5px rgba(0,0,0,0.2)`,
                borderColor: source.color 
              } : undefined}
            >
              {/* Row 1: Icon + Name + Description */}
              <div className="flex items-center gap-3">
                {reorderMode && (
                  <GripVertical className="h-5 w-5 text-muted-foreground shrink-0" />
                )}
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white shrink-0"
                  style={{ backgroundColor: source.color }}
                >
                  <span>{source.icon}</span>
                </div>
                <div className="min-w-0">
                  <span className="font-medium block">{source.name}</span>
                  {source.description && (
                    <p className="text-xs text-muted-foreground">{source.description}</p>
                  )}
                </div>
              </div>
              {/* Row 2: Balance + Action buttons */}
              <div className="flex items-center justify-between mt-2 pl-[52px]">
                <span 
                  className={`font-mono text-sm font-semibold cursor-pointer hover:underline ${(source.balance || 0) >= 0 ? 'text-income' : 'text-expense'}`}
                  onClick={(e) => { e.stopPropagation(); setBalanceCorrectionSource(source); }}
                  title={t('paymentSources.correctBalance', 'Korigiraj saldo')}
                >
                  €{(source.balance || 0).toFixed(2)}
                </span>
                {!reorderMode && (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => { e.stopPropagation(); setMembersDialogSource(source); }}
                      title={t('common.members', 'Članovi')}
                    >
                      <Users className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => { e.stopPropagation(); handleEdit(source); }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); handleDelete(source); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
              {/* Cards display */}
              {source.cards && source.cards.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-border/50">
                  {source.cards.map((card) => (
                    <span 
                      key={card.id} 
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-muted rounded text-xs"
                    >
                      <CreditCard className="w-3 h-3" />
                      {card.card_type && <span className="text-muted-foreground">{card.card_type}</span>}
                      <span className="font-mono">****{card.last_four_digits}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Suggested Payment Sources */}
      {availableSuggestions.length > 0 && (
        <Collapsible open={suggestionsOpen} onOpenChange={setSuggestionsOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between text-muted-foreground hover:text-foreground">
              <span className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                {t('common.suggestedPaymentSources')} ({availableSuggestions.length})
              </span>
              <ChevronDown className={`h-4 w-4 transition-transform ${suggestionsOpen ? 'rotate-180' : ''}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <div className="flex flex-wrap gap-2">
              {availableSuggestions.map((suggestion) => (
                <button
                  key={suggestion.name}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-muted/30 hover:bg-muted/60 transition-colors text-sm"
                >
                  <span
                    className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs"
                    style={{ backgroundColor: suggestion.color }}
                  >
                    {suggestion.icon}
                  </span>
                  <span>{suggestion.name}</span>
                  <Plus className="h-3 w-3 text-muted-foreground" />
                </button>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Add button when in accordion mode */}
      {hideHeader && (
        <Button size="sm" onClick={openNewDialog} className="w-full">
          <Plus className="h-4 w-4 mr-1" />
          {t('common.newPaymentSource')}
        </Button>
      )}
    </div>
  );

  if (hideHeader) {
    return (
      <>
        {content}
        <CustomPaymentSourceDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          source={editingSource}
          onSave={handleSave}
          onAddCard={addCard}
          onDeleteCard={deleteCard}
          initialData={initialData}
        />
        <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('common.deletePaymentSource')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('common.deletePaymentSourceConfirm')} "{sourceToDelete?.name}"?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {t('common.delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <PaymentSourceMembersDialog
          open={!!membersDialogSource}
          onOpenChange={(open) => !open && setMembersDialogSource(null)}
          paymentSource={membersDialogSource}
        />
        <BalanceCorrectionDialog
          open={!!balanceCorrectionSource}
          onOpenChange={(open) => !open && setBalanceCorrectionSource(null)}
          currentBalance={balanceCorrectionSource?.balance || 0}
          sourceName={balanceCorrectionSource?.name || ''}
          onSave={handleBalanceCorrection}
        />
      </>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              {t('paymentSources.myAccounts')}
            </CardTitle>
            <Button size="sm" onClick={openNewDialog}>
              <Plus className="h-4 w-4 mr-1" />
              {t('common.new')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {content}
        </CardContent>
      </Card>

      <CustomPaymentSourceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        source={editingSource}
        onSave={handleSave}
        onAddCard={addCard}
        onDeleteCard={deleteCard}
        initialData={initialData}
      />

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common.deletePaymentSource')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('common.deletePaymentSourceConfirm')} "{sourceToDelete?.name}"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PaymentSourceMembersDialog
        open={!!membersDialogSource}
        onOpenChange={(open) => !open && setMembersDialogSource(null)}
        paymentSource={membersDialogSource}
      />
      <BalanceCorrectionDialog
        open={!!balanceCorrectionSource}
        onOpenChange={(open) => !open && setBalanceCorrectionSource(null)}
        currentBalance={balanceCorrectionSource?.balance || 0}
        sourceName={balanceCorrectionSource?.name || ''}
        onSave={handleBalanceCorrection}
      />
    </>
  );
};
