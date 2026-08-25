import { useState, useCallback, useRef, useEffect } from 'react';
import { Plus, Pencil, Trash2, CreditCard, GripVertical, Users, Settings2, Eye, EyeOff, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import { useHiddenPaymentSources } from '@/hooks/useHiddenPaymentSources';
import { CustomPaymentSourceDialog } from './CustomPaymentSourceDialog';
import { BalanceCorrectionDialog } from './BalanceCorrectionDialog';
import { PaymentSourceMembersDialog } from './PaymentSourceMembersDialog';
import { CustomPaymentSource, SUGGESTED_PAYMENT_SOURCES } from '@/types/customPaymentSource';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useStorage } from '@/contexts/StorageContext';
import { saveLocalExpense } from '@/lib/storage/indexedDB';
import { coerceCanonicalShape } from '@/lib/paymentSource/normalize';
import { formatHrAmount } from '@/lib/money';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/EmptyState';

interface CustomPaymentSourcesPanelProps {
  hideHeader?: boolean;
  onSourceClick?: (source: CustomPaymentSource) => void;
  onRefetchExpenses?: () => void;
  /**
   * WS2 / Faza 2.1 — kad Wallet stigne s `?openSourceCreate=1`, panel
   * automatski otvara Add dialog jednom po mount-u (ref-guard).
   */
  autoOpenNew?: boolean;
}



export const CustomPaymentSourcesPanel = ({ hideHeader = false, onSourceClick, onRefetchExpenses, autoOpenNew = false }: CustomPaymentSourcesPanelProps) => {
  const { ownedPaymentSources: customPaymentSources, loading, addCustomPaymentSource, updateCustomPaymentSource, deleteCustomPaymentSource, addCard, deleteCard, updateCard, reorderPaymentSources } = useCustomPaymentSources();
  const { isHidden, toggleHidden } = useHiddenPaymentSources();
  const { user } = useAuth();
  const { storageMode } = useStorage();
  const isLocalMode = storageMode === 'local' && !user;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<CustomPaymentSource | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [sourceToDelete, setSourceToDelete] = useState<CustomPaymentSource | null>(null);
  const [initialData, setInitialData] = useState<{ name: string; icon: string; color: string; balance?: number } | undefined>();
  const [reorderMode, setReorderMode] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [membersDialogSource, setMembersDialogSource] = useState<CustomPaymentSource | null>(null);
  const [balanceCorrectionSource, setBalanceCorrectionSource] = useState<CustomPaymentSource | null>(null);
  const { t } = useTranslation();

  /**
   * Popis računa: prva 4 vidljiva, ostatak iza "Prikaži sve (N)".
   * Stanje se pamti po korisniku (localStorage) da se odluka ne gubi
   * pri svakom otvaranju Novčanika.
   */
  const VISIBLE_SOURCES_LIMIT = 4;
  const SHOW_ALL_KEY = 'vmb-wallet-show-all-sources:v1';
  const [showAllSources, setShowAllSources] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SHOW_ALL_KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggleShowAllSources = useCallback(() => {
    setShowAllSources((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SHOW_ALL_KEY, next ? '1' : '0');
      } catch {
        /* privatni način rada — stanje vrijedi samo za ovu sesiju */
      }
      return next;
    });
  }, []);

  const handleBalanceCorrection = async (newBalance: number) => {
    if (!balanceCorrectionSource) return;
    const sourceId = balanceCorrectionSource.id;

    try {
      // Fetch fresh balance for the audit description
      let freshBalance = balanceCorrectionSource.balance || 0;
      if (!isLocalMode && user) {
        const { data: freshData } = await supabase
          .from('custom_payment_sources' as any)
          .select('balance')
          .eq('id', sourceId)
          .single();
        if (freshData) {
          freshBalance = (freshData as any).balance ?? 0;
        }
      }

      const difference = newBalance - freshBalance;
      const nowIso = new Date().toISOString();

      if (isLocalMode) {
        // Local mode: keep legacy behaviour (no anchor model on IndexedDB).
        // Balance je namjerno izuzet iz cloud tipa; ovdje ide kroz `as any`.
        await updateCustomPaymentSource(sourceId, { balance: newBalance } as any);
        if (difference !== 0) {
          await saveLocalExpense({
            amount: Math.abs(difference),
            description: `Korekcija salda — ${balanceCorrectionSource.name}`,
            category: 'other',
            type: difference > 0 ? 'income' : 'expense',
            date: new Date(),
            payment_source: `custom:${sourceId}`,
            note: `Saldo korigiran s ${freshBalance.toFixed(2)} na ${newBalance.toFixed(2)}`,
            expense_nature: 'correction',
          } as any);
        }
      } else if (user) {
        // Cloud mode: atomarni SET sidra kroz RPC (PR2 Faza A).
        // RPC radi: anchor kolone + balance + (opcionalni) audit correction
        // red + recompute — sve u jednoj transakciji. Stored balance je
        // ispravan odmah po povratku, bez ovisnosti o sljedećem write-u.
        const correctionPayload =
          difference !== 0
            ? {
                amount: difference, // predznak: + income, − expense
                type: difference > 0 ? 'income' : 'expense',
                description: `Korekcija salda — ${balanceCorrectionSource.name}`,
                category: 'other',
                note: `Saldo korigiran s ${freshBalance.toFixed(2)} na ${newBalance.toFixed(2)}`,
              }
            : null;

        const { error: rpcError } = await supabase.rpc('set_source_anchor' as any, {
          p_source_id: sourceId,
          p_anchor_ts: nowIso,
          p_anchor_balance: newBalance,
          p_correction: correctionPayload,
        });

        if (rpcError) throw rpcError;
      }


      // Refresh expenses list so the correction appears immediately
      onRefetchExpenses?.();
      setBalanceCorrectionSource(null);
    } catch (error) {
      console.error('Balance correction failed:', error);
      showError(t('paymentSources.correctionError', 'Greška pri korekciji salda'));
    }
  };


  const handleSave = async (data: { name: string; icon: string; color: string; balance?: number; description?: string; currency?: string; business_profile_id?: string | null }) => {
    if (editingSource) {
      // Balance NIKAD ne ide kroz update — mijenja se preko "Korekcija salda"
      // (set_source_anchor RPC). Guard trigger `_cps_balance_guard_before` u
      // bazi bi ga svejedno auto-anchor-irao, ali frontend ne smije slati.
      const { balance: _ignored, ...rest } = data;
      await updateCustomPaymentSource(editingSource.id, rest);
    } else {
      await addCustomPaymentSource({ ...data, balance: data.balance ?? 0 });
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

  // WS2 / Faza 2.1 — auto-otvori Add dialog kad je panel mountiran s
  // `autoOpenNew` (Wallet ?openSourceCreate=1 iz AttributionSheet empty-state).
  const autoOpenNewFiredRef = useRef(false);
  useEffect(() => {
    if (!autoOpenNew) return;
    if (autoOpenNewFiredRef.current) return;
    autoOpenNewFiredRef.current = true;
    openNewDialog();
  }, [autoOpenNew]);


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
          <CardTitle className="text-lg flex items-center gap-2 text-module-muted">
            <CreditCard className="h-5 w-5 text-module-muted" />
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
      {/* Preslagivanje: ulazi se kroz "…" izbornik računa, izlazi ovim gumbom */}
      {reorderMode && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2">
          <span className="text-sm text-muted-foreground">
            {t('paymentSources.reorderHint', 'Povuci račune na željeno mjesto')}
          </span>
          <Button size="sm" variant="outline" onClick={() => setReorderMode(false)}>
            {t('paymentSources.reorderDone', 'Gotovo')}
          </Button>
        </div>
      )}

      {/* Existing custom sources */}
      {customPaymentSources.length === 0 ? (
        <EmptyState
          variant="wallet"
          title={t('common.noCustomPaymentSources')}
          description={t('common.clickNewToAdd')}
          action={{
            label: t('common.new'),
            onClick: openNewDialog,
          }}
          compact
        />
      ) : (
        <div className="space-y-2">
          {customPaymentSources.map((source, index) => {
            const hidden = isHidden(source.id);
            // Rep popisa je skriven dok korisnik ne zatraži "Prikaži sve".
            // U načinu preslagivanja uvijek se vide svi — inače se ne bi
            // mogao presložiti račun koji je ispod granice.
            if (!showAllSources && !reorderMode && index >= VISIBLE_SOURCES_LIMIT) return null;
            return (
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
              } ${hidden ? 'opacity-60' : ''}`}
              style={draggedIndex === index ? { 
                boxShadow: `0 20px 40px -10px ${source.color}40, 0 10px 20px -5px rgba(0,0,0,0.2)`,
                borderColor: source.color 
              } : undefined}
            >
              {/* Jedan redak: ikona · ime · saldo · izbornik.
                  IBAN i kartice žive u detalju/uređivanju računa — na popisu
                  su trošile tri reda po računu i gurale sve ostalo ispod ruba. */}
              <div className="flex items-center gap-3">
                {reorderMode && (
                  <GripVertical className="h-5 w-5 text-muted-foreground shrink-0" />
                )}
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0 text-sm"
                  style={{ backgroundColor: source.color }}
                >
                  <span>{source.icon}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium">{source.name}</span>
                    {((source.isOwned && (source.memberCount || 0) > 0) || source.isOwned === false) && (
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-secondary text-secondary-foreground text-[10px] font-medium"
                        title={
                          source.isOwned === false
                            ? t('paymentSources.sharedWithYou', { owner: source.ownerName || '—', defaultValue: 'Dijeli: {{owner}}' })
                            : t('paymentSources.sharedByYou', { count: source.memberCount || 0, defaultValue: 'Dijelite s {{count}} osoba' })
                        }
                      >
                        <Users className="w-2.5 h-2.5" />
                        {t('paymentSources.shared', 'Dijeljeno')}
                      </span>
                    )}
                    {hidden && (
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-medium"
                        title={t('paymentSources.hiddenFromDashboard', 'Sakriveno s dashboarda')}
                      >
                        <EyeOff className="w-2.5 h-2.5" />
                        {t('paymentSources.hiddenBadge', 'Sakriveno')}
                      </span>
                    )}
                  </div>
                  {source.description && (
                    <p className="text-xs text-muted-foreground truncate">{source.description}</p>
                  )}
                </div>
                <span
                  className={`text-sm font-semibold tabular-nums cursor-pointer hover:underline shrink-0 ${(source.balance || 0) < 0 ? 'text-expense' : 'text-foreground'}`}
                  onClick={(e) => { e.stopPropagation(); setBalanceCorrectionSource(source); }}
                  title={t('paymentSources.correctBalance', 'Korigiraj saldo')}
                >
                  {formatHrAmount(source.balance || 0)} €
                </span>
                {!reorderMode && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => e.stopPropagation()}
                        title={t('common.actions', 'Actions')}
                        aria-label={t('common.actions', 'Actions')}
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenuItem onClick={(e) => {
                        e.stopPropagation();
                        toggleHidden(source.id);
                      }}>

                        {hidden ? <EyeOff className="h-3.5 w-3.5 mr-2" /> : <Eye className="h-3.5 w-3.5 mr-2" />}
                        {hidden
                          ? t('paymentSources.showOnDashboard', 'Prikaži na dashboardu')
                          : t('paymentSources.hideFromDashboard', 'Sakrij s dashboarda')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setMembersDialogSource(source); }}>
                        <Users className="h-3.5 w-3.5 mr-2" />
                        {t('common.members', 'Članovi')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEdit(source); }}>
                        <Pencil className="h-3.5 w-3.5 mr-2" />
                        {t('common.edit', 'Uredi')}
                      </DropdownMenuItem>
                      {customPaymentSources.length > 1 && (
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setReorderMode(true); }}>
                          <GripVertical className="h-3.5 w-3.5 mr-2" />
                          {t('paymentSources.reorderAccounts', 'Presloži račune')}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={(e) => { e.stopPropagation(); handleDelete(source); }}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-2" />
                        {t('common.delete', 'Obriši')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
            );
          })}

          {/* Rep popisa — vidljiv tek na zahtjev */}
          {!reorderMode && customPaymentSources.length > VISIBLE_SOURCES_LIMIT && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground hover:text-foreground"
              onClick={toggleShowAllSources}
            >
              {showAllSources
                ? t('paymentSources.showLess', 'Prikaži manje')
                : t('paymentSources.showAll', 'Prikaži sve ({{count}})', { count: customPaymentSources.length })}
              <ChevronDown className={`h-4 w-4 ml-1 transition-transform ${showAllSources ? 'rotate-180' : ''}`} />
            </Button>
          )}
        </div>
      )}

      {/* Predlošci više NE stoje ispod korisnikovih računa — sele u dijalog
          "novi račun" (CustomPaymentSourceDialog, prop `suggestions`), jer se
          ovdje čitalo kao da su i oni korisnikovi računi. */}

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
          onUpdateCard={updateCard}
          initialData={initialData}
          suggestions={availableSuggestions}
          onCorrectBalance={editingSource ? () => {
            const src = editingSource;
            setDialogOpen(false);
            setBalanceCorrectionSource(src);
          } : undefined}
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
            <CardTitle className="text-lg flex items-center gap-2 text-module-muted">
              <CreditCard className="h-5 w-5 text-module-muted" />
              {t('paymentSources.myAccounts')}
            </CardTitle>
            <Button size="sm" variant="module" onClick={openNewDialog}>
              <Plus className="h-4 w-4 mr-1" />
              {t('paymentSources.newAccount', 'Račun')}
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
        onUpdateCard={updateCard}
        initialData={initialData}
        suggestions={availableSuggestions}
        onCorrectBalance={editingSource ? () => {
          const src = editingSource;
          setDialogOpen(false);
          setBalanceCorrectionSource(src);
        } : undefined}
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
