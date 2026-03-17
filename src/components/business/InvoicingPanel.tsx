import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Plus, FileText, Loader2, Trash2, ChevronRight, Users, Check, X, Download, Share2, Zap, Send, ScanSearch, DatabaseZap } from 'lucide-react';
import { DetectedPartnersDialog } from '@/components/DetectedPartnersDialog';
import { downloadInvoicePDF, shareInvoicePDF } from '@/lib/invoicePdfExport';
import { useAppState } from '@/contexts/AppStateContext';
import { useAuth } from '@/hooks/useAuth';
import { useCurrency } from '@/contexts/CurrencyContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface Client {
  id: string;
  name: string;
  oib: string | null;
  address: string | null;
  city: string | null;
  email: string | null;
  phone: string | null;
  contact_person: string | null;
}

interface Invoice {
  id: string;
  invoice_number: string;
  client_id: string | null;
  issue_date: string;
  due_date: string | null;
  status: string;
  total_amount: number;
  vat_amount: number;
  notes: string | null;
  paid_at: string | null;
  fiscalization_jir?: string | null;
  fiscalization_zki?: string | null;
  fiscalized_at?: string | null;
  eracun_sent?: boolean;
  eracun_sent_at?: string | null;
}

interface InvoiceItem {
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  discount: number;
  vat_rate: number;
}

type View = 'menu' | 'clients' | 'invoices' | 'new_invoice' | 'new_client';

export const InvoicingPanel = () => {
  const { activeBusinessProfileId } = useAppState();
  const { user } = useAuth();
  const { formatAmount } = useCurrency();
  const [view, setView] = useState<View>('menu');
  const [clients, setClients] = useState<Client[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [eracuniConnected, setEracuniConnected] = useState(false);
  const [fiscalizationEnabled, setFiscalizationEnabled] = useState(false);
  const [fiscalizing, setFiscalizing] = useState(false);
  const [sendingEracun, setSendingEracun] = useState(false);
  const [syncingToEracuni, setSyncingToEracuni] = useState(false);
  const [businessProfile, setBusinessProfile] = useState<any>(null);

  // Client form
  const [clientName, setClientName] = useState('');
  const [clientOib, setClientOib] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [clientCity, setClientCity] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');

  // Invoice form
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [invoiceNotes, setInvoiceNotes] = useState('');
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([
    { description: '', quantity: 1, unit: 'kom', unit_price: 0, discount: 0, vat_rate: 25 },
  ]);
  const [saving, setSaving] = useState(false);
  const [scanPartnersOpen, setScanPartnersOpen] = useState(false);
  const [scannedMerchants, setScannedMerchants] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [enrichingClientId, setEnrichingClientId] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  // Detail
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null);
  const [detailItems, setDetailItems] = useState<any[]>([]);
  const [detailClient, setDetailClient] = useState<Client | null>(null);

  useEffect(() => {
    if (activeBusinessProfileId && user) {
      loadClients();
      loadInvoices();
      loadBusinessProfile();
    }
  }, [activeBusinessProfileId, user]);

  const loadBusinessProfile = async () => {
    if (!activeBusinessProfileId) return;
    const { data } = await supabase
      .from('business_profiles')
      .select('*')
      .eq('id', activeBusinessProfileId)
      .single();
    setBusinessProfile(data);
    setEracuniConnected((data as any)?.eracuni_connected || false);
    setFiscalizationEnabled((data as any)?.fiscalization_enabled || false);
  };

  const fiscalizeInvoice = async (invoiceId: string) => {
    setFiscalizing(true);
    try {
      // First sync to e-Računi
      const syncRes = await supabase.functions.invoke('eracuni-proxy', {
        body: { action: 'create_invoice', businessProfileId: activeBusinessProfileId, invoiceId },
      });

      if (syncRes.error || syncRes.data?.error) {
        toast.error(syncRes.data?.error || 'Greška pri slanju na e-Računi');
        setFiscalizing(false);
        return;
      }

      // Then fiscalize
      const res = await supabase.functions.invoke('eracuni-proxy', {
        body: { action: 'fiscalize', businessProfileId: activeBusinessProfileId, invoiceId },
      });

      if (res.error || res.data?.error) {
        toast.error(res.data?.error || 'Fiskalizacija neuspješna');
      } else {
        toast.success(`✅ Fiskalizirano! JIR: ${res.data.jir || 'N/A'}`);
        setDetailInvoice(null);
        loadInvoices();
      }
    } catch (err: any) {
      toast.error(err.message || 'Greška');
    }
    setFiscalizing(false);
  };

  const sendEracun = async (invoiceId: string) => {
    setSendingEracun(true);
    try {
      const res = await supabase.functions.invoke('eracuni-proxy', {
        body: { action: 'send_eracun', businessProfileId: activeBusinessProfileId, invoiceId },
      });

      if (res.error || res.data?.error) {
        toast.error(res.data?.error || 'Slanje e-Računa neuspješno');
      } else {
        toast.success('✅ e-Račun poslan!');
        setDetailInvoice(null);
        loadInvoices();
      }
    } catch (err: any) {
      toast.error(err.message || 'Greška');
    }
    setSendingEracun(false);
  };

  const syncToEracuni = async (invoiceId: string) => {
    setSyncingToEracuni(true);
    try {
      const res = await supabase.functions.invoke('eracuni-proxy', {
        body: { action: 'create_invoice', businessProfileId: activeBusinessProfileId, invoiceId },
      });

      if (res.error || res.data?.error) {
        toast.error(res.data?.error || 'Sinkronizacija neuspješna');
      } else {
        toast.success('✅ Račun poslan na e-Računi.hr');
      }
    } catch (err: any) {
      toast.error(err.message || 'Greška');
    }
    setSyncingToEracuni(false);
  };

  const loadClients = async () => {
    if (!activeBusinessProfileId) return;
    const { data } = await supabase
      .from('clients')
      .select('*')
      .eq('business_profile_id', activeBusinessProfileId)
      .order('name') as any;
    setClients(data || []);
  };

  const loadInvoices = async () => {
    if (!activeBusinessProfileId) return;
    const { data } = await supabase
      .from('invoices')
      .select('*')
      .eq('business_profile_id', activeBusinessProfileId)
      .order('issue_date', { ascending: false }) as any;
    setInvoices(data || []);
  };

  const saveClient = async () => {
    if (!user || !activeBusinessProfileId || !clientName.trim()) {
      toast.error('Unesite naziv klijenta');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('clients').insert({
      business_profile_id: activeBusinessProfileId,
      user_id: user.id,
      name: clientName.trim(),
      oib: clientOib.trim() || null,
      address: clientAddress.trim() || null,
      city: clientCity.trim() || null,
      email: clientEmail.trim() || null,
      phone: clientPhone.trim() || null,
    } as any);
    setSaving(false);
    if (error) { toast.error('Greška'); return; }
    toast.success('Klijent dodan');
    setClientName(''); setClientOib(''); setClientAddress(''); setClientCity(''); setClientEmail(''); setClientPhone('');
    loadClients();
    setView('clients');
  };

  const deleteClient = async (id: string) => {
    await supabase.from('clients').delete().eq('id', id) as any;
    toast.success('Klijent obrisan');
    loadClients();
  };

  const scanTransactionsForPartners = async () => {
    if (!user || !activeBusinessProfileId) return;
    setScanning(true);
    try {
      const { data: expenses } = await supabase
        .from('expenses')
        .select('merchant_name')
        .eq('user_id', user.id)
        .eq('business_profile_id', activeBusinessProfileId)
        .not('merchant_name', 'is', null);

      const merchants = (expenses || [])
        .map((e: any) => e.merchant_name as string)
        .filter(Boolean);

      if (merchants.length === 0) {
        toast.info('Nije pronađen nijedan partner u transakcijama.');
        setScanning(false);
        return;
      }

      setScannedMerchants(merchants);
      setScanPartnersOpen(true);
    } catch (error) {
      console.error('Error scanning transactions:', error);
      toast.error('Greška pri skeniranju transakcija');
    } finally {
      setScanning(false);
    }
  };

  const cleanCompanyName = (name: string): string => {
    // Remove city names at end (after comma or last word in CAPS that's a city)
    let cleaned = name.trim();
    // Remove trailing city after comma
    cleaned = cleaned.replace(/,\s*[A-ZČĆŽŠĐ][A-ZČĆŽŠĐa-zčćžšđ\s/]+$/i, '');
    // Remove common long legal form descriptions
    cleaned = cleaned.replace(/\s+(jednostavno\s+)?dru[šs]tvo\s+s\s+ograni[čc]enom\s+odgovorno[šs][ćc]u.*$/i, '');
    cleaned = cleaned.replace(/\s+za\s+proizvodnju.*$/i, '');
    cleaned = cleaned.replace(/\s+za\s+trgovinu.*$/i, '');
    // Remove trailing city name (single word, all caps, at end)
    cleaned = cleaned.replace(/\s+[A-ZČĆŽŠĐ]{3,}$/i, '').trim();
    // Remove PJ (poslovni jedinica) suffix
    cleaned = cleaned.replace(/\s+PJ\s+.*$/i, '').trim();
    return cleaned || name;
  };

  const enrichClientFromRegistry = async (client: Client) => {
    if (enrichingClientId) {
      toast.info('Pričekajte da završi trenutno obogaćivanje klijenta.');
      return;
    }

    setEnrichingClientId(client.id);

    try {
      const targetClientId = client.id;
      const query = cleanCompanyName(client.name);
      console.log('Enriching client, cleaned query:', query);

      const { data, error } = await supabase.functions.invoke('lookup-company', {
        body: { query },
      });

      if (error) {
        toast.error('Greška pri pretrazi registra.');
        return;
      }

      if (!data?.found) {
        toast.info('Nije pronađen konkretan podatak u sudskom registru za: ' + query);
        return;
      }

      const updates: Record<string, any> = {};
      if (data.oib && !client.oib) updates.oib = data.oib;
      if (data.address && !client.address) updates.address = data.address;
      if (data.city && !client.city) updates.city = data.city;
      if (data.email && !client.email) updates.email = data.email;
      if (data.phone && !client.phone) updates.phone = data.phone;
      if (data.contact_person && !client.contact_person) updates.contact_person = data.contact_person;
      if (data.postal_code) updates.postal_code = data.postal_code;
      if (data.company_name && data.company_name.length > 2) updates.name = data.company_name;

      const hasRealUpdates = Object.keys(updates).length > 0;
      if (!hasRealUpdates) {
        toast.info('Registar nije vratio dodatne podatke osim naziva.');
        return;
      }

      const { error: updateError } = await supabase
        .from('clients')
        .update(updates as any)
        .eq('id', targetClientId);

      if (updateError) {
        console.error('Error updating client after enrichment:', updateError);
        toast.error('Podaci su pronađeni, ali spremanje klijenta nije uspjelo.');
        return;
      }

      toast.success('Podaci klijenta ažurirani iz registra!');
      loadClients();
      setSelectedClient((prev) => prev && prev.id === targetClientId ? { ...prev, ...updates } : prev);
    } catch (err: any) {
      console.error('Error enriching client:', err);
      toast.error(err?.message || 'Greška pri pretrazi registra.');
    } finally {
      setEnrichingClientId((current) => current === client.id ? null : current);
    }
  };

  const calcItemTotal = (item: InvoiceItem) => {
    const base = item.quantity * item.unit_price;
    const discounted = base * (1 - item.discount / 100);
    return discounted * (1 + item.vat_rate / 100);
  };

  const calcItemVAT = (item: InvoiceItem) => {
    const base = item.quantity * item.unit_price;
    const discounted = base * (1 - item.discount / 100);
    return discounted * (item.vat_rate / 100);
  };

  const totalAmount = invoiceItems.reduce((s, i) => s + calcItemTotal(i), 0);
  const totalVAT = invoiceItems.reduce((s, i) => s + calcItemVAT(i), 0);

  const generateInvoiceNumber = () => {
    const year = new Date().getFullYear();
    const num = (invoices.length + 1).toString().padStart(3, '0');
    return `${num}/${year}`;
  };

  const saveInvoice = async () => {
    if (!user || !activeBusinessProfileId) return;
    const validItems = invoiceItems.filter(i => i.description.trim() && i.unit_price > 0);
    if (validItems.length === 0) { toast.error('Dodajte barem jednu stavku'); return; }

    setSaving(true);
    const invNum = invoiceNumber.trim() || generateInvoiceNumber();

    const { data: inv, error } = await supabase.from('invoices').insert({
      business_profile_id: activeBusinessProfileId,
      user_id: user.id,
      client_id: selectedClientId || null,
      invoice_number: invNum,
      issue_date: issueDate,
      due_date: dueDate || null,
      status: 'draft',
      total_amount: totalAmount,
      vat_amount: totalVAT,
      notes: invoiceNotes.trim() || null,
    } as any).select().single() as any;

    if (error || !inv) { toast.error('Greška'); setSaving(false); return; }

    await supabase.from('invoice_items').insert(
      validItems.map(item => ({
        invoice_id: inv.id,
        description: item.description.trim(),
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unit_price,
        discount: item.discount,
        vat_rate: item.vat_rate,
        total: calcItemTotal(item),
      })) as any
    );

    toast.success(`Račun ${invNum} kreiran`);
    setSaving(false);
    setInvoiceItems([{ description: '', quantity: 1, unit: 'kom', unit_price: 0, discount: 0, vat_rate: 25 }]);
    setInvoiceNumber(''); setSelectedClientId(''); setInvoiceNotes('');
    loadInvoices();
    setView('invoices');
  };

  const openDetail = async (inv: Invoice) => {
    setDetailInvoice(inv);
    const { data: items } = await supabase.from('invoice_items').select('*').eq('invoice_id', inv.id) as any;
    setDetailItems(items || []);
    if (inv.client_id) {
      const client = clients.find(c => c.id === inv.client_id);
      setDetailClient(client || null);
    } else {
      setDetailClient(null);
    }
  };

  const updateInvoiceStatus = async (id: string, status: string) => {
    await supabase.from('invoices').update({ 
      status, 
      paid_at: status === 'paid' ? new Date().toISOString() : null 
    } as any).eq('id', id);
    toast.success(status === 'paid' ? 'Označeno kao plaćeno' : 'Status ažuriran');
    setDetailInvoice(null);
    loadInvoices();
  };

  const deleteInvoice = async (id: string) => {
    await supabase.from('invoices').delete().eq('id', id) as any;
    toast.success('Račun obrisan');
    setDetailInvoice(null);
    loadInvoices();
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      draft: 'bg-muted text-muted-foreground',
      sent: 'bg-blue-500/10 text-blue-600',
      paid: 'bg-income/10 text-income',
      overdue: 'bg-expense/10 text-expense',
    };
    const labels: Record<string, string> = { draft: 'Nacrt', sent: 'Poslano', paid: 'Plaćeno', overdue: 'Dospjelo' };
    return <Badge className={`text-[8px] px-1.5 py-0 ${colors[status] || ''}`}>{labels[status] || status}</Badge>;
  };

  const addItemRow = () => {
    setInvoiceItems(prev => [...prev, { description: '', quantity: 1, unit: 'kom', unit_price: 0, discount: 0, vat_rate: 25 }]);
  };

  const updateItem = (idx: number, field: string, value: any) => {
    setInvoiceItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const backButton = (
    <button onClick={() => setView('menu')} className="text-xs text-primary mb-3 flex items-center gap-1">← Natrag</button>
  );

  // Clients list
  if (view === 'clients') return (
    <div>
      {backButton}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-bold">Klijenti</h2>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" className="gap-1 h-8 text-xs" onClick={scanTransactionsForPartners} disabled={scanning}>
            {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ScanSearch className="w-3.5 h-3.5" />}
            Skeniraj
          </Button>
          <Button size="sm" className="gap-1 h-8 text-xs" onClick={() => setView('new_client')}>
            <Plus className="w-3.5 h-3.5" /> Novi
          </Button>
        </div>
      </div>
      {clients.length === 0 ? (
        <Card className="border-none shadow-sm">
          <CardContent className="p-6 text-center">
            <Users className="w-10 h-10 mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">Nema klijenata</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {clients.map(c => (
            <Card key={c.id} className="border-none shadow-sm cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => setSelectedClient(c)}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {[c.oib, c.city, c.email].filter(Boolean).join(' · ') || 'Bez detalja'}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Client Detail Dialog */}
      <Dialog open={!!selectedClient} onOpenChange={(open) => { if (!open) setSelectedClient(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">{selectedClient?.name}</DialogTitle>
          </DialogHeader>
          {selectedClient && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-muted-foreground">OIB:</span><p className="font-medium">{selectedClient.oib || '—'}</p></div>
                <div><span className="text-muted-foreground">Grad:</span><p className="font-medium">{selectedClient.city || '—'}</p></div>
                <div className="col-span-2"><span className="text-muted-foreground">Adresa:</span><p className="font-medium">{selectedClient.address || '—'}</p></div>
                <div><span className="text-muted-foreground">Email:</span><p className="font-medium">{selectedClient.email || '—'}</p></div>
                <div><span className="text-muted-foreground">Telefon:</span><p className="font-medium">{selectedClient.phone || '—'}</p></div>
                {selectedClient.contact_person && (
                  <div className="col-span-2"><span className="text-muted-foreground">Kontakt osoba:</span><p className="font-medium">{selectedClient.contact_person}</p></div>
                )}
              </div>
              <Separator />
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 gap-1.5 text-xs" onClick={() => enrichClientFromRegistry(selectedClient)} disabled={!!enrichingClientId}>
                  {enrichingClientId === selectedClient.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <DatabaseZap className="w-3.5 h-3.5" />}
                  Obogati iz registra
                </Button>
                <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive" onClick={() => { deleteClient(selectedClient.id); setSelectedClient(null); }}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <DetectedPartnersDialog
        open={scanPartnersOpen}
        onOpenChange={(open) => {
          setScanPartnersOpen(open);
          if (!open) loadClients();
        }}
        merchantNames={scannedMerchants}
      />
    </div>
  );

  // New client form
  if (view === 'new_client') return (
    <div>
      <button onClick={() => setView('clients')} className="text-xs text-primary mb-3 flex items-center gap-1">← Natrag</button>
      <h2 className="text-base font-bold mb-3">Novi klijent</h2>
      <div className="space-y-3">
        <div className="space-y-2"><Label className="text-xs">Naziv *</Label><Input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Tvrtka d.o.o." /></div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-2"><Label className="text-xs">OIB</Label><Input value={clientOib} onChange={e => setClientOib(e.target.value)} /></div>
          <div className="space-y-2"><Label className="text-xs">Grad</Label><Input value={clientCity} onChange={e => setClientCity(e.target.value)} /></div>
        </div>
        <div className="space-y-2"><Label className="text-xs">Adresa</Label><Input value={clientAddress} onChange={e => setClientAddress(e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-2"><Label className="text-xs">Email</Label><Input type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} /></div>
          <div className="space-y-2"><Label className="text-xs">Telefon</Label><Input value={clientPhone} onChange={e => setClientPhone(e.target.value)} /></div>
        </div>
        <Button className="w-full" onClick={saveClient} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Spremi klijenta
        </Button>
      </div>
    </div>
  );

  // Invoice list
  if (view === 'invoices') return (
    <div>
      {backButton}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-bold">Računi</h2>
        <Button size="sm" className="gap-1 h-8 text-xs" onClick={() => { setInvoiceNumber(generateInvoiceNumber()); setView('new_invoice'); }}>
          <Plus className="w-3.5 h-3.5" /> Novi račun
        </Button>
      </div>
      {invoices.length === 0 ? (
        <Card className="border-none shadow-sm">
          <CardContent className="p-6 text-center">
            <FileText className="w-10 h-10 mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">Nema izdanih računa</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {invoices.map(inv => {
            const client = clients.find(c => c.id === inv.client_id);
            return (
              <Card key={inv.id} className="border-none shadow-sm cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => openDetail(inv)}>
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium">#{inv.invoice_number}</p>
                      {statusBadge(inv.status)}
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {client?.name || 'Bez klijenta'} · {format(new Date(inv.issue_date), 'dd.MM.yyyy')}
                    </p>
                  </div>
                  <p className="text-sm font-bold flex-shrink-0">{formatAmount(inv.total_amount)}</p>
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!detailInvoice} onOpenChange={() => setDetailInvoice(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              Račun #{detailInvoice?.invoice_number}
              {detailInvoice && statusBadge(detailInvoice.status)}
            </DialogTitle>
          </DialogHeader>
          {detailInvoice && (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-3">
                {detailClient && (
                  <div className="text-xs">
                    <span className="text-muted-foreground">Klijent:</span>
                    <p className="font-medium">{detailClient.name}</p>
                    {detailClient.oib && <p className="text-muted-foreground">OIB: {detailClient.oib}</p>}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-muted-foreground">Datum izdavanja:</span><p className="font-medium">{format(new Date(detailInvoice.issue_date), 'dd.MM.yyyy')}</p></div>
                  {detailInvoice.due_date && <div><span className="text-muted-foreground">Dospijeće:</span><p className="font-medium">{format(new Date(detailInvoice.due_date), 'dd.MM.yyyy')}</p></div>}
                </div>

                <Card className="border-none shadow-sm">
                  <CardContent className="p-3 space-y-1.5">
                    {detailItems.map((item: any, i: number) => (
                      <div key={i} className="flex justify-between text-xs border-b border-border/20 pb-1 last:border-0">
                        <div>
                          <p className="font-medium">{item.description}</p>
                          <p className="text-muted-foreground">{item.quantity} {item.unit} × {formatAmount(item.unit_price)}</p>
                        </div>
                        <p className="font-medium">{formatAmount(item.total)}</p>
                      </div>
                    ))}
                    <Separator />
                    <div className="flex justify-between text-xs"><span className="text-muted-foreground">PDV</span><span>{formatAmount(detailInvoice.vat_amount)}</span></div>
                    <div className="flex justify-between text-sm font-bold"><span>Ukupno</span><span>{formatAmount(detailInvoice.total_amount)}</span></div>
                  </CardContent>
                </Card>

                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1 gap-1 text-xs" onClick={() => {
                    if (businessProfile) downloadInvoicePDF(detailInvoice, detailItems, businessProfile, detailClient);
                    else toast.error('Poslovni profil nije učitan');
                  }}>
                    <Download className="w-3 h-3" /> PDF
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 gap-1 text-xs" onClick={async () => {
                    if (businessProfile) {
                      try { await shareInvoicePDF(detailInvoice, detailItems, businessProfile, detailClient); }
                      catch { /* user cancelled share */ }
                    } else toast.error('Poslovni profil nije učitan');
                  }}>
                    <Share2 className="w-3 h-3" /> Podijeli
                  </Button>
                </div>

                {/* Fiscalization & e-Računi buttons */}
                {(fiscalizationEnabled || eracuniConnected) && (
                  <div className="space-y-2">
                    <Separator />
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">e-Računi.hr</p>
                    
                    {/* Fiscalization info if already done */}
                    {detailInvoice.fiscalization_jir && (
                      <div className="p-2 rounded-lg bg-income/5 text-xs">
                        <p className="font-medium text-income">✅ Fiskalizirano</p>
                        <p className="text-muted-foreground">JIR: {detailInvoice.fiscalization_jir}</p>
                        {detailInvoice.fiscalization_zki && <p className="text-muted-foreground">ZKI: {detailInvoice.fiscalization_zki}</p>}
                      </div>
                    )}

                    {detailInvoice.eracun_sent && (
                      <div className="p-2 rounded-lg bg-primary/5 text-xs">
                        <p className="font-medium text-primary">📤 e-Račun poslan</p>
                        {detailInvoice.eracun_sent_at && (
                          <p className="text-muted-foreground">{format(new Date(detailInvoice.eracun_sent_at), 'dd.MM.yyyy HH:mm')}</p>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2">
                      {!detailInvoice.fiscalization_jir && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 gap-1 text-xs"
                          onClick={() => fiscalizeInvoice(detailInvoice.id)}
                          disabled={fiscalizing}
                        >
                          {fiscalizing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                          Fiskaliziraj
                        </Button>
                      )}
                      {!detailInvoice.eracun_sent && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 gap-1 text-xs"
                          onClick={() => sendEracun(detailInvoice.id)}
                          disabled={sendingEracun}
                        >
                          {sendingEracun ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                          Pošalji e-Račun
                        </Button>
                      )}
                    </div>
                    
                    {!detailInvoice.fiscalization_jir && !detailInvoice.eracun_sent && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="w-full gap-1 text-[10px] text-muted-foreground"
                        onClick={() => syncToEracuni(detailInvoice.id)}
                        disabled={syncingToEracuni}
                      >
                        {syncingToEracuni ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                        Samo sinkroniziraj na e-Računi (bez fiskalizacije)
                      </Button>
                    )}
                  </div>
                )}

                <div className="flex gap-2">
                  {detailInvoice.status !== 'paid' && (
                    <Button size="sm" className="flex-1 gap-1 text-xs" onClick={() => updateInvoiceStatus(detailInvoice.id, 'paid')}>
                      <Check className="w-3 h-3" /> Označi plaćenim
                    </Button>
                  )}
                  <Button variant="destructive" size="sm" className="gap-1 text-xs" onClick={() => deleteInvoice(detailInvoice.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );

  // New invoice form
  if (view === 'new_invoice') return (
    <div>
      <button onClick={() => setView('invoices')} className="text-xs text-primary mb-3 flex items-center gap-1">← Natrag</button>
      <h2 className="text-base font-bold mb-3">Novi račun</h2>
        <div className="space-y-4 pb-24">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2"><Label className="text-xs">Broj računa</Label><Input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} /></div>
            <div className="space-y-2">
              <Label className="text-xs">Klijent</Label>
              <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Odaberi..." /></SelectTrigger>
                <SelectContent>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2"><Label className="text-xs">Datum izdavanja</Label><Input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} /></div>
            <div className="space-y-2"><Label className="text-xs">Dospijeće</Label><Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></div>
          </div>

          <Separator />
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold">Stavke</Label>
            <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={addItemRow}><Plus className="w-3 h-3" /> Dodaj</Button>
          </div>

          {invoiceItems.map((item, i) => (
            <div key={i} className="space-y-2 p-2 rounded-lg border border-border/50">
              <div className="flex items-start gap-1">
                <div className="flex-1 space-y-2">
                  <Input placeholder="Opis stavke" className="h-8 text-xs" value={item.description} onChange={e => updateItem(i, 'description', e.target.value)} />
                  <div className="grid grid-cols-4 gap-1">
                    <Input type="number" placeholder="Kol." className="h-7 text-xs" value={item.quantity || ''} onChange={e => updateItem(i, 'quantity', Number(e.target.value))} />
                    <Input placeholder="Jed." className="h-7 text-xs" value={item.unit} onChange={e => updateItem(i, 'unit', e.target.value)} />
                    <Input type="number" placeholder="Cijena" className="h-7 text-xs" value={item.unit_price || ''} onChange={e => updateItem(i, 'unit_price', Number(e.target.value))} />
                    <Select value={String(item.vat_rate)} onValueChange={v => updateItem(i, 'vat_rate', Number(v))}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="25">25%</SelectItem>
                        <SelectItem value="13">13%</SelectItem>
                        <SelectItem value="5">5%</SelectItem>
                        <SelectItem value="0">0%</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {invoiceItems.length > 1 && (
                  <Button variant="ghost" size="icon" className="h-7 w-6 text-destructive mt-0.5" onClick={() => setInvoiceItems(prev => prev.filter((_, j) => j !== i))}>
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>
              <p className="text-right text-xs font-medium">{formatAmount(calcItemTotal(item))}</p>
            </div>
          ))}

          <Card className="border-none shadow-sm">
            <CardContent className="p-3 space-y-1">
              <div className="flex justify-between text-xs"><span className="text-muted-foreground">Osnovica</span><span>{formatAmount(totalAmount - totalVAT)}</span></div>
              <div className="flex justify-between text-xs"><span className="text-muted-foreground">PDV</span><span>{formatAmount(totalVAT)}</span></div>
              <div className="flex justify-between text-sm font-bold pt-1 border-t border-border/30"><span>Ukupno</span><span>{formatAmount(totalAmount)}</span></div>
            </CardContent>
          </Card>

          <div className="space-y-2">
            <Label className="text-xs">Napomene</Label>
            <Textarea value={invoiceNotes} onChange={e => setInvoiceNotes(e.target.value)} placeholder="Napomene na računu..." className="min-h-[50px]" />
          </div>

          <Button className="w-full" onClick={saveInvoice} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Kreiraj račun
          </Button>
        </div>
    </div>
  );

  // Menu
  const unpaidCount = invoices.filter(i => i.status !== 'paid').length;
  const unpaidTotal = invoices.filter(i => i.status !== 'paid').reduce((s, i) => s + i.total_amount, 0);

  return (
    <div className="space-y-4">
      <h2 className="text-base font-bold flex items-center gap-2">💰 Fakturiranje</h2>

      {unpaidCount > 0 && (
        <Card className="border-none shadow-sm bg-expense/5">
          <CardContent className="p-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-muted-foreground">Neplaćeni računi</p>
              <p className="text-sm font-bold text-expense">{unpaidCount} ({formatAmount(unpaidTotal)})</p>
            </div>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setView('invoices')}>Pregledaj</Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {[
          { id: 'clients' as View, icon: Users, label: 'Klijenti', desc: `${clients.length} klijenata` },
          { id: 'invoices' as View, icon: FileText, label: 'Računi', desc: `${invoices.length} izdanih računa` },
        ].map(item => {
          const Icon = item.icon;
          return (
            <Card key={item.id} className="border-none shadow-sm cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => setView(item.id)}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1"><p className="text-sm font-medium">{item.label}</p><p className="text-[10px] text-muted-foreground">{item.desc}</p></div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
