import { useState } from 'react';
import { Plus, Pencil, Trash2, CreditCard, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCustomPaymentSources } from '@/hooks/useCustomPaymentSources';
import { CustomPaymentSourceDialog } from './CustomPaymentSourceDialog';
import { CustomPaymentSource, SUGGESTED_PAYMENT_SOURCES } from '@/types/customPaymentSource';
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

interface CustomPaymentSourcesPanelProps {
  hideHeader?: boolean;
}

export const CustomPaymentSourcesPanel = ({ hideHeader = false }: CustomPaymentSourcesPanelProps) => {
  const { customPaymentSources, loading, addCustomPaymentSource, updateCustomPaymentSource, deleteCustomPaymentSource, addCard, deleteCard } = useCustomPaymentSources();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<CustomPaymentSource | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [sourceToDelete, setSourceToDelete] = useState<CustomPaymentSource | null>(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [initialData, setInitialData] = useState<{ name: string; icon: string; color: string; balance?: number } | undefined>();

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
            Prilagođeni izvori plaćanja
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
      {/* Existing custom sources */}
      {customPaymentSources.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          Nemate prilagođenih izvora plaćanja.<br />
          Dodajte novi ili odaberite iz predloženih.
        </p>
      ) : (
        <div className="space-y-2">
          {customPaymentSources.map((source) => (
            <div
              key={source.id}
              className="p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white"
                    style={{ backgroundColor: source.color }}
                  >
                    <span>{source.icon}</span>
                  </div>
                  <div>
                    <span className="font-medium">{source.name}</span>
                    {source.description && (
                      <p className="text-xs text-muted-foreground truncate max-w-[120px]">{source.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`font-mono text-sm font-semibold ${(source.balance || 0) >= 0 ? 'text-income' : 'text-expense'}`}>
                    €{(source.balance || 0).toFixed(2)}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleEdit(source)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(source)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
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
                Predloženi izvori ({availableSuggestions.length})
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
          Novi izvor plaćanja
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
              <AlertDialogTitle>Obrisati izvor plaćanja?</AlertDialogTitle>
              <AlertDialogDescription>
                Jeste li sigurni da želite obrisati izvor plaćanja "{sourceToDelete?.name}"?
                Transakcije koje koriste ovaj izvor neće biti obrisane, ali će im izvor biti promijenjen u "Ostalo".
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Odustani</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Obriši
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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
              Prilagođeni izvori plaćanja
            </CardTitle>
            <Button size="sm" onClick={openNewDialog}>
              <Plus className="h-4 w-4 mr-1" />
              Nova
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
            <AlertDialogTitle>Obrisati izvor plaćanja?</AlertDialogTitle>
            <AlertDialogDescription>
              Jeste li sigurni da želite obrisati izvor plaćanja "{sourceToDelete?.name}"?
              Transakcije koje koriste ovaj izvor neće biti obrisane, ali će im izvor biti promijenjen u "Ostalo".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Odustani</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Obriši
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
