import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Users, Check, Plus, RefreshCw, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useAppState } from '@/contexts/AppStateContext';

interface PartnerDetails {
  oib?: string;
  address?: string;
  city?: string;
  postal_code?: string;
  email?: string;
  phone?: string;
  contact_person?: string;
}

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
  const [expandedPartner, setExpandedPartner] = useState<string | null>(null);
  const [partnerDetails, setPartnerDetails] = useState<Record<string, PartnerDetails>>({});
  const [lookingUp, setLookingUp] = useState<string | null>(null);

  useEffect(() => {
    if (open && merchantNames.length > 0 && activeBusinessProfileId) {
      loadExistingClients();
    }
  }, [open, merchantNames, activeBusinessProfileId]);

  // Normalize name: extract core business name, ignore address/postal/city details
  const normalizeName = (name: string): string => {
    let n = name.toLowerCase().trim();
    // Strip everything after common address indicators (postal codes, city names, slashes for bilingual)
    n = n
      .replace(/[,]\s*\d{4,5}\s+\w+.*$/i, '') // ", 6310 Izola..."
      .replace(/\s+\d{4,5}\s+\w+.*$/i, '')    // " 6310 Izola..."  
      .replace(/\s+[A-Za-zčćžšđ]+\/[A-Za-zčćžšđ]+.*$/i, '') // " IZOLA/ISOLA..."
      .replace(/[.,\-_]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    // Sort words for order-independent matching ("Milan Vlajnić" = "Vlajnić Milan")
    return n.split(/\s+/).filter(Boolean).sort().join(' ');
  };

  // Fuzzy match: check if two names are similar enough (one contains the other, or high word overlap)
  const namesMatch = (a: string, b: string): boolean => {
    if (a === b) return true;
    // One contains the other
    if (a.includes(b) || b.includes(a)) return true;
    // Word overlap: if shorter name's words are mostly found in longer name
    const wordsA = a.split(' ').filter(w => w.length > 2);
    const wordsB = b.split(' ').filter(w => w.length > 2);
    if (wordsA.length === 0 || wordsB.length === 0) return false;
    const [shorter, longer] = wordsA.length <= wordsB.length ? [wordsA, wordsB] : [wordsB, wordsA];
    const matchCount = shorter.filter(w => longer.some(lw => lw.includes(w) || w.includes(lw))).length;
    return matchCount / shorter.length >= 0.6;
  };

  const loadExistingClients = async () => {
    if (!activeBusinessProfileId) return;
    setLoading(true);

    try {
      const { data: existingClients } = await supabase
        .from('clients')
        .select('id, name')
        .eq('business_profile_id', activeBusinessProfileId);

      // Build normalized list of existing clients
      const existingNormalized = (existingClients || []).map(c => ({
        id: c.id,
        normalized: normalizeName(c.name),
      }));

      // Find matching existing client using fuzzy matching
      const findExistingClient = (normalizedKey: string): string | undefined => {
        // Exact match first
        const exact = existingNormalized.find(c => c.normalized === normalizedKey);
        if (exact) return exact.id;
        // Fuzzy match
        const fuzzy = existingNormalized.find(c => namesMatch(c.normalized, normalizedKey));
        return fuzzy?.id;
      };

      // Group merchant names by normalized key, pick the most common original name as display
      const groupMap = new Map<string, { displayName: string; count: number; names: Map<string, number> }>();
      merchantNames.forEach(rawName => {
        const name = rawName.trim();
        if (!name) return;
        const key = normalizeName(name);
        const group = groupMap.get(key) || { displayName: name, count: 0, names: new Map() };
        group.count++;
        group.names.set(name, (group.names.get(name) || 0) + 1);
        // Use most frequent variant as display name
        let maxCount = 0;
        group.names.forEach((cnt, n) => {
          if (cnt > maxCount) { maxCount = cnt; group.displayName = n; }
        });
        groupMap.set(key, group);
      });

      const detectedPartners: DetectedPartner[] = Array.from(groupMap.entries()).map(([key, group]) => ({
        name: group.displayName,
        transactionCount: group.count,
        totalAmount: 0,
        existingClientId: findExistingClient(key),
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

  const togglePartner = (name: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedPartners(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleExpand = (name: string) => {
    setExpandedPartner(prev => prev === name ? null : name);
  };

  const updatePartnerDetail = (name: string, field: keyof PartnerDetails, value: string) => {
    setPartnerDetails(prev => ({
      ...prev,
      [name]: { ...prev[name], [field]: value },
    }));
  };

  const lookupFromRegistry = async (partnerName: string) => {
    setLookingUp(partnerName);
    try {
      const { data, error } = await supabase.functions.invoke('lookup-company', {
        body: { query: partnerName },
      });

      if (error) throw error;
      if (!data?.found) {
        toast.info(`Nije pronađeno podataka za "${partnerName}"`);
        return;
      }

      const newDetails: PartnerDetails = {
        ...(partnerDetails[partnerName] || {}),
      };
      if (data.oib) newDetails.oib = data.oib;
      if (data.address) newDetails.address = data.address;
      if (data.city) newDetails.city = data.city;
      if (data.postal_code) newDetails.postal_code = data.postal_code;
      if (data.email) newDetails.email = data.email;
      if (data.phone) newDetails.phone = data.phone;
      if (data.contact_person) newDetails.contact_person = data.contact_person;

      setPartnerDetails(prev => ({ ...prev, [partnerName]: newDetails }));

      const source = data.source === 'sudreg' ? 'sudski registar' : 'AI';
      toast.success(`Podaci učitani za "${data.company_name || partnerName}" (izvor: ${source})`);
    } catch (error: any) {
      console.error('Error looking up company:', error);
      toast.error('Greška pri dohvatu podataka iz registra');
    } finally {
      setLookingUp(null);
    }
  };

  const handleSave = async () => {
    if (!user || !activeBusinessProfileId || selectedPartners.size === 0) return;
    setSaving(true);

    try {
      const toCreate = partners.filter(p => selectedPartners.has(p.name) && !p.existingClientId);
      const toUpdate = partners.filter(p => selectedPartners.has(p.name) && p.existingClientId);

      // Create new clients with details
      if (toCreate.length > 0) {
        const { error: insertError } = await supabase
          .from('clients')
          .insert(toCreate.map(p => {
            const details = partnerDetails[p.name] || {};
            return {
              business_profile_id: activeBusinessProfileId,
              user_id: user.id,
              name: p.name,
              ...(details.oib && { oib: details.oib }),
              ...(details.address && { address: details.address }),
              ...(details.city && { city: details.city }),
              ...(details.postal_code && { postal_code: details.postal_code }),
              ...(details.email && { email: details.email }),
              ...(details.phone && { phone: details.phone }),
              ...(details.contact_person && { contact_person: details.contact_person }),
            };
          }));

        if (insertError) throw insertError;
      }

      // Update existing with any new details provided
      for (const p of toUpdate) {
        if (p.existingClientId) {
          const details = partnerDetails[p.name] || {};
          const updateData: Record<string, string> = { updated_at: new Date().toISOString() };
          if (details.oib) updateData.oib = details.oib;
          if (details.address) updateData.address = details.address;
          if (details.city) updateData.city = details.city;
          if (details.postal_code) updateData.postal_code = details.postal_code;
          if (details.email) updateData.email = details.email;
          if (details.phone) updateData.phone = details.phone;
          if (details.contact_person) updateData.contact_person = details.contact_person;

          await supabase
            .from('clients')
            .update(updateData)
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
              {partners.map((partner) => {
                const isExpanded = expandedPartner === partner.name;
                const details = partnerDetails[partner.name] || {};
                return (
                  <div
                    key={partner.name}
                    className={`rounded-xl text-sm transition-colors border ${
                      selectedPartners.has(partner.name)
                        ? 'bg-primary/10 border-primary/30'
                        : 'bg-muted/50 border-transparent'
                    }`}
                  >
                    <div
                      className="flex items-center gap-3 p-3 cursor-pointer"
                      onClick={() => toggleExpand(partner.name)}
                    >
                      <Checkbox
                        checked={selectedPartners.has(partner.name)}
                        onCheckedChange={() => togglePartner(partner.name)}
                        onClick={(e) => e.stopPropagation()}
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
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                      )}
                    </div>

                    {isExpanded && (
                      <div className="px-3 pb-3 space-y-3 border-t border-border/50 pt-3">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs text-muted-foreground">OIB</Label>
                            <Input
                              placeholder="12345678901"
                              value={details.oib || ''}
                              onChange={(e) => updatePartnerDetail(partner.name, 'oib', e.target.value)}
                              className="h-8 text-xs rounded-lg"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Kontakt osoba</Label>
                            <Input
                              placeholder="Ime i prezime"
                              value={details.contact_person || ''}
                              onChange={(e) => updatePartnerDetail(partner.name, 'contact_person', e.target.value)}
                              className="h-8 text-xs rounded-lg"
                            />
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Adresa</Label>
                          <Input
                            placeholder="Ulica i broj"
                            value={details.address || ''}
                            onChange={(e) => updatePartnerDetail(partner.name, 'address', e.target.value)}
                            className="h-8 text-xs rounded-lg"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs text-muted-foreground">Grad</Label>
                            <Input
                              placeholder="Zagreb"
                              value={details.city || ''}
                              onChange={(e) => updatePartnerDetail(partner.name, 'city', e.target.value)}
                              className="h-8 text-xs rounded-lg"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Poštanski broj</Label>
                            <Input
                              placeholder="10000"
                              value={details.postal_code || ''}
                              onChange={(e) => updatePartnerDetail(partner.name, 'postal_code', e.target.value)}
                              className="h-8 text-xs rounded-lg"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs text-muted-foreground">Email</Label>
                            <Input
                              placeholder="email@primjer.hr"
                              value={details.email || ''}
                              onChange={(e) => updatePartnerDetail(partner.name, 'email', e.target.value)}
                              className="h-8 text-xs rounded-lg"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Telefon</Label>
                            <Input
                              placeholder="+385..."
                              value={details.phone || ''}
                              onChange={(e) => updatePartnerDetail(partner.name, 'phone', e.target.value)}
                              className="h-8 text-xs rounded-lg"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
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
