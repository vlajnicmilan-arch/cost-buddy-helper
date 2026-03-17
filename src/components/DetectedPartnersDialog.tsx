import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Loader2, Users, Check, Plus, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useAppState } from '@/contexts/AppStateContext';

interface DetectedPartner {
  name: string;
  transactionCount: number;
  totalAmount: number;
  existingClientId?: string;
}

interface DetectedPartnersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  merchantNames: string[];
}

export const DetectedPartnersDialog = ({ open, onOpenChange, merchantNames }: DetectedPartnersDialogProps) => {
  const { user } = useAuth();
  const { activeBusinessProfileId } = useAppState();
  const [partners, setPartners] = useState<DetectedPartner[]>([]);
  const [selectedPartners, setSelectedPartners] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && merchantNames.length > 0 && activeBusinessProfileId) {
      loadExistingClients();
    }
  }, [open, merchantNames, activeBusinessProfileId]);

  const loadExistingClients = async () => {
    if (!activeBusinessProfileId) return;
    setLoading(true);

    try {
      const { data: existingClients } = await supabase
        .from('clients')
        .select('id, name')
        .eq('business_profile_id', activeBusinessProfileId);

      const existingMap = new Map(
        (existingClients || []).map(c => [c.name.toLowerCase().trim(), c.id])
      );

      // Count occurrences from merchant names
      const countMap = new Map<string, number>();
      merchantNames.forEach(name => {
        const key = name.trim();
        if (key) countMap.set(key, (countMap.get(key) || 0) + 1);
      });

      const detectedPartners: DetectedPartner[] = Array.from(countMap.entries()).map(([name, count]) => ({
        name,
        transactionCount: count,
        totalAmount: 0,
        existingClientId: existingMap.get(name.toLowerCase().trim()),
      }));

      // Sort: new partners first, then existing
      detectedPartners.sort((a, b) => {
        if (!a.existingClientId && b.existingClientId) return -1;
        if (a.existingClientId && !b.existingClientId) return 1;
        return b.transactionCount - a.transactionCount;
      });

      setPartners(detectedPartners);

      // Pre-select all new partners
      const newPartnerNames = new Set(
        detectedPartners.filter(p => !p.existingClientId).map(p => p.name)
      );
      setSelectedPartners(newPartnerNames);
    } catch (error) {
      console.error('Error loading clients:', error);
    } finally {
      setLoading(false);
    }
  };

  const togglePartner = (name: string) => {
    setSelectedPartners(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleSave = async () => {
    if (!user || !activeBusinessProfileId || selectedPartners.size === 0) return;
    setSaving(true);

    try {
      const toCreate = partners.filter(p => selectedPartners.has(p.name) && !p.existingClientId);
      const toUpdate = partners.filter(p => selectedPartners.has(p.name) && p.existingClientId);

      // Create new clients
      if (toCreate.length > 0) {
        const { error: insertError } = await supabase
          .from('clients')
          .insert(toCreate.map(p => ({
            business_profile_id: activeBusinessProfileId,
            user_id: user.id,
            name: p.name,
          })));

        if (insertError) throw insertError;
      }

      // Update existing (touch updated_at to mark as recently seen)
      for (const p of toUpdate) {
        if (p.existingClientId) {
          await supabase
            .from('clients')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', p.existingClientId);
        }
      }

      const created = toCreate.length;
      const updated = toUpdate.length;
      const msg = [
        created > 0 ? `${created} ${created === 1 ? 'novi partner kreiran' : 'novih partnera kreirano'}` : '',
        updated > 0 ? `${updated} ${updated === 1 ? 'partner ažuriran' : 'partnera ažurirano'}` : '',
      ].filter(Boolean).join(', ');

      toast.success(msg);
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving partners:', error);
      toast.error('Greška pri spremanju partnera');
    } finally {
      setSaving(false);
    }
  };

  const newCount = partners.filter(p => !p.existingClientId).length;
  const existingCount = partners.filter(p => p.existingClientId).length;

  if (!activeBusinessProfileId) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showBackButton={false} className="sm:max-w-lg glass-card border-border/50 max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Detektirani partneri
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : partners.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nije pronađen nijedan partner u transakcijama.
          </p>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-4">
            {/* Summary */}
            <div className="flex gap-2">
              {newCount > 0 && (
                <Badge variant="default" className="gap-1">
                  <Plus className="w-3 h-3" />
                  {newCount} {newCount === 1 ? 'novi' : 'novih'}
                </Badge>
              )}
              {existingCount > 0 && (
                <Badge variant="secondary" className="gap-1">
                  <Check className="w-3 h-3" />
                  {existingCount} {existingCount === 1 ? 'postojeći' : 'postojećih'}
                </Badge>
              )}
            </div>

            {/* Partner list */}
            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {partners.map((partner) => (
                <div
                  key={partner.name}
                  className={`flex items-center gap-3 p-3 rounded-xl text-sm transition-colors cursor-pointer ${
                    selectedPartners.has(partner.name)
                      ? 'bg-primary/10 border border-primary/30'
                      : 'bg-muted/50 border border-transparent'
                  }`}
                  onClick={() => togglePartner(partner.name)}
                >
                  <Checkbox
                    checked={selectedPartners.has(partner.name)}
                    onCheckedChange={() => togglePartner(partner.name)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{partner.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {partner.transactionCount} {partner.transactionCount === 1 ? 'transakcija' : 'transakcija'}
                    </p>
                  </div>
                  {partner.existingClientId ? (
                    <Badge variant="outline" className="text-xs gap-1 shrink-0">
                      <RefreshCw className="w-3 h-3" />
                      Postojeći
                    </Badge>
                  ) : (
                    <Badge className="text-xs gap-1 shrink-0">
                      <Plus className="w-3 h-3" />
                      Novi
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter className="flex gap-2 mt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-xl"
          >
            Preskoči
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || selectedPartners.size === 0}
            className="rounded-xl gap-2"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Users className="w-4 h-4" />
            )}
            Spremi {selectedPartners.size > 0 ? `(${selectedPartners.size})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
