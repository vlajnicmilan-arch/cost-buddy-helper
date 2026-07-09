import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { parseLocaleAmount } from '@/lib/money';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { CustomPaymentSource, PaymentSourceCard, DEFAULT_PAYMENT_ICONS, DEFAULT_PAYMENT_COLORS } from '@/types/customPaymentSource';
import { Plus, X, CreditCard, ScanLine, Briefcase, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CardScannerDialog } from '@/components/onboarding/CardScannerDialog';
import { useCurrency, CURRENCIES, CurrencyCode } from '@/contexts/CurrencyContext';
import { VoiceInputButton } from '@/components/VoiceInputButton';
import { useBusinessProfiles } from '@/hooks/useBusinessProfiles';
import { QuickBusinessProfileDialog } from '@/components/business/QuickBusinessProfileDialog';
interface CardInput {
  id?: string;
  card_name: string;
  last_four_digits: string;
  card_type?: string;
}

interface PaymentSourceData {
  name: string;
  icon: string;
  color: string;
  // Optional: u edit modu se namjerno NE šalje (mijenja se preko "Korekcija salda").
  balance?: number;
  currency?: string;
  description?: string;
  business_profile_id?: string | null;
  cards?: CardInput[];
}

interface CustomPaymentSourceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: CustomPaymentSource | null;
  onSave: (data: PaymentSourceData) => Promise<void>;
  onAddCard?: (paymentSourceId: string, card: Omit<PaymentSourceCard, 'id' | 'payment_source_id' | 'user_id' | 'created_at'>) => Promise<PaymentSourceCard | null>;
  onDeleteCard?: (cardId: string) => Promise<void>;
  onUpdateCard?: (cardId: string, updates: Partial<Pick<PaymentSourceCard, 'card_name' | 'last_four_digits' | 'card_type'>>) => Promise<void>;
  initialData?: Partial<PaymentSourceData>;
}

export const CustomPaymentSourceDialog = ({
  open,
  onOpenChange,
  source,
  onSave,
  onAddCard,
  onDeleteCard,
  onUpdateCard,
  initialData,
}: CustomPaymentSourceDialogProps) => {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('💳');
  const [color, setColor] = useState('#6b7280');
  const [balance, setBalance] = useState('0');
  const [description, setDescription] = useState('');
  const [sourceCurrency, setSourceCurrency] = useState<CurrencyCode>('EUR');
  const [cards, setCards] = useState<CardInput[]>([]);
  const [businessProfileId, setBusinessProfileId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanningCardIndex, setScanningCardIndex] = useState<number | null>(null);
  const [quickCompanyOpen, setQuickCompanyOpen] = useState(false);
  const { t } = useTranslation();
  const { currency, multiCurrencyEnabled } = useCurrency();
  const { profiles: businessProfiles, refetch: refetchBusinessProfiles } = useBusinessProfiles();
  const isBusiness = businessProfileId !== null;
  useEffect(() => {
    if (open) {
      if (source) {
        setName(source.name);
        setIcon(source.icon);
        setColor(source.color);
        setBalance(source.balance?.toString() || '0');
        setDescription(source.description || '');
        setSourceCurrency((source.currency as CurrencyCode) || currency.code);
        setBusinessProfileId(source.business_profile_id || null);
        setCards((source.cards || []).map(c => ({
          id: c.id,
          card_name: c.card_name,
          last_four_digits: c.last_four_digits,
          card_type: c.card_type || undefined
        })));
      } else if (initialData) {
        setName(initialData.name || '');
        setIcon(initialData.icon || '💳');
        setColor(initialData.color || '#6b7280');
        setBalance(initialData.balance?.toString() || '0');
        setDescription(initialData.description || '');
        setSourceCurrency(currency.code);
        setBusinessProfileId(initialData.business_profile_id || null);
        setCards(initialData.cards || []);
      } else {
        setName('');
        setIcon('💳');
        setColor('#6b7280');
        setBalance('0');
        setDescription('');
        setSourceCurrency(currency.code);
        setBusinessProfileId(null);
        setCards([]);
      }
    }
  }, [open, source, initialData, currency.code]);

  // Always re-fetch the business profile list when the dialog opens so a newly
  // created company shows up immediately in the owner select.
  useEffect(() => {
    if (open) refetchBusinessProfiles();
  }, [open, refetchBusinessProfiles]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const isEdit = !!source;
      // U edit modu balance se NIKAD ne šalje kroz updateCustomPaymentSource —
      // saldo se mijenja isključivo kroz "Korekcija salda" (set_source_anchor RPC).
      // Sirov write balance-a pregazi sidro i sljedeći recompute vrati staru
      // vrijednost. Vidi guard trigger `_cps_balance_guard_before`.
      const payload: PaymentSourceData = {
        name: name.trim(),
        icon,
        color,
        balance: isEdit ? (source!.balance || 0) : (parseLocaleAmount(balance).value || 0),
        currency: multiCurrencyEnabled ? sourceCurrency : undefined,
        description: description.trim() || undefined,
        business_profile_id: businessProfileId,
      };
      if (isEdit) {
        // Ukloni balance da payload prosljeđen `updateCustomPaymentSource` ne dira kolonu.
        delete (payload as Partial<PaymentSourceData>).balance;
      }
      await onSave(payload);

      // Handle cards for existing sources
      if (source && onAddCard && onDeleteCard) {
        const existingCardIds = (source.cards || []).map(c => c.id);
        const currentCardIds = cards.filter(c => c.id).map(c => c.id);
        
        // Delete removed cards
        for (const existingId of existingCardIds) {
          if (!currentCardIds.includes(existingId)) {
            await onDeleteCard(existingId);
          }
        }
        
        // Add new cards or update existing changed ones
        for (const card of cards) {
          if (!card.id && card.last_four_digits) {
            await onAddCard(source.id, {
              card_name: card.card_name || t('common.card'),
              last_four_digits: card.last_four_digits,
              card_type: card.card_type
            });
          } else if (card.id && onUpdateCard) {
            const original = (source.cards || []).find(c => c.id === card.id);
            if (
              original &&
              (original.card_name !== card.card_name ||
                original.last_four_digits !== card.last_four_digits ||
                (original.card_type || '') !== (card.card_type || ''))
            ) {
              await onUpdateCard(card.id, {
                card_name: card.card_name || t('common.card'),
                last_four_digits: card.last_four_digits,
                card_type: card.card_type,
              });
            }
          }
        }
      }

      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const addCard = () => {
    setCards([...cards, { card_name: t('common.card'), last_four_digits: '', card_type: '' }]);
  };

  const addCardWithScan = () => {
    const newIndex = cards.length;
    setCards([...cards, { card_name: t('common.card'), last_four_digits: '', card_type: '' }]);
    setScanningCardIndex(newIndex);
    setScannerOpen(true);
  };

  const openScannerForCard = (index: number) => {
    setScanningCardIndex(index);
    setScannerOpen(true);
  };

  const handleCardScanned = (cardType: string) => {
    if (scanningCardIndex !== null && scanningCardIndex < cards.length) {
      const newCards = [...cards];
      newCards[scanningCardIndex] = { 
        ...newCards[scanningCardIndex], 
        card_type: cardType,
        card_name: cardType
      };
      setCards(newCards);
    }
    setScanningCardIndex(null);
  };

  const updateCard = (index: number, field: keyof CardInput, value: string) => {
    const newCards = [...cards];
    newCards[index] = { ...newCards[index], [field]: value };
    setCards(newCards);
  };

  const removeCard = (index: number) => {
    setCards(cards.filter((_, i) => i !== index));
  };

  const formattedBalance = parseLocaleAmount(balance).value || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showBackButton={false} className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {source ? t('common.editPaymentSource') : t('common.newPaymentSource')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">{t('common.name')}</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="PayPal, Google Pay..."
            />
          </div>

          {/* Balance */}
          <div className="space-y-2">
            <Label htmlFor="balance">
              {t('common.balance')} ({multiCurrencyEnabled ? CURRENCIES.find(c => c.code === sourceCurrency)?.symbol || sourceCurrency : '€'})
            </Label>
            <div className="flex gap-2">
              <MoneyInput
                id="balance"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                placeholder="0,00"
                className="font-mono flex-1"
                allowNegative
                disabled={!!source}
                readOnly={!!source}
              />
              {multiCurrencyEnabled && (
                <Select value={sourceCurrency} onValueChange={(v) => setSourceCurrency(v as CurrencyCode)}>
                  <SelectTrigger className="w-[90px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((curr) => (
                      <SelectItem key={curr.code} value={curr.code}>
                        <span className="flex items-center gap-1">
                          <span>{curr.symbol}</span>
                          <span className="text-xs">{curr.code}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            {!!source && (
              <p className="text-xs text-muted-foreground">
                {t('paymentSources.balanceEditHint', 'Saldo se mijenja isključivo preko "Korekcija salda" — sirovi upis bi pregazio sidro.')}
              </p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">{t('common.description')}</Label>
            <div className="relative">
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="pr-12"
              />
              <VoiceInputButton
                value={description}
                onChange={setDescription}
                className="absolute bottom-2 right-2"
              />
            </div>
          </div>

          {/* Owner / company assignment */}
          <div className="space-y-2 p-3 rounded-lg border bg-muted/30">
            <Label htmlFor="owner-select" className="flex items-center gap-2 font-medium">
              {isBusiness ? <Briefcase className="w-4 h-4 text-amber-600" /> : <User className="w-4 h-4 text-muted-foreground" />}
              {t('wallet.source.owner', 'Vlasnik izvora')}
            </Label>
            <Select
              value={businessProfileId ?? '__personal__'}
              onValueChange={(v) => {
                if (v === '__add_company__') {
                  setQuickCompanyOpen(true);
                  return;
                }
                setBusinessProfileId(v === '__personal__' ? null : v);
              }}
            >
              <SelectTrigger id="owner-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__personal__">
                  <span className="flex items-center gap-2">
                    <User className="w-3.5 h-3.5" />
                    {t('wallet.source.ownerPersonal', 'Osobno')}
                  </span>
                </SelectItem>
                {businessProfiles.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="flex items-center gap-2">
                      <Briefcase className="w-3.5 h-3.5 text-amber-600" />
                      {p.name}
                    </span>
                  </SelectItem>
                ))}
                <SelectItem value="__add_company__" className="text-primary font-medium border-t mt-1 pt-2">
                  <span className="flex items-center gap-2">
                    <Plus className="w-3.5 h-3.5" />
                    {t('wallet.source.addCompany', '+ Nova tvrtka')}
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t('wallet.source.ownerHint', 'Odredi pripada li ovaj izvor osobi ili točno jednoj tvrtki. Filter "Sve / Osobno / Tvrtka" koristi ovu vezu.')}
            </p>
          </div>

          {/* Cards Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <CreditCard className="w-4 h-4" />
                {t('common.cards')}
              </Label>
              <div className="flex gap-1">
                <Button type="button" variant="ghost" size="sm" onClick={addCardWithScan}>
                  <ScanLine className="w-4 h-4 mr-1" />
                  {t('common.scan', 'Skeniraj')}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={addCard}>
                  <Plus className="w-4 h-4 mr-1" />
                  {t('common.addCard')}
                </Button>
              </div>
            </div>
            
            {cards.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-2">
                {t('paymentSources.noCards', 'Nema kartica. Kliknite "Skeniraj" ili "Dodaj karticu" za povezivanje.')}
              </p>
            ) : (
              <div className="space-y-2">
                {cards.map((card, index) => (
                  <div key={index} className="flex gap-2 p-3 bg-muted/50 rounded-lg">
                    <div className="flex-1 space-y-2">
                      <div className="flex gap-2">
                        <Input
                          placeholder={t('common.cardName')}
                          value={card.card_name}
                          onChange={(e) => updateCard(index, 'card_name', e.target.value)}
                          className="h-9 text-sm"
                        />
                        <div className="flex gap-1">
                          <Input
                            placeholder={t('common.cardType')}
                            value={card.card_type || ''}
                            onChange={(e) => updateCard(index, 'card_type', e.target.value)}
                            className="h-9 text-sm w-20"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => openScannerForCard(index)}
                            className="h-9 w-9 shrink-0"
                            title={t('common.scanCard', 'Skeniraj karticu')}
                          >
                            <ScanLine className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">**** **** ****</span>
                        <Input
                          placeholder={t('common.lastFourDigits')}
                          value={card.last_four_digits}
                          onChange={(e) => {
                            const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                            updateCard(index, 'last_four_digits', value);
                          }}
                          className="h-9 text-sm w-20 font-mono"
                          maxLength={4}
                        />
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeCard(index)}
                      className="h-9 w-9 text-muted-foreground hover:text-destructive shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Icon Selection */}
          <div className="space-y-2">
            <Label>{t('common.icon')}</Label>
            <div className="flex flex-wrap gap-2">
              {DEFAULT_PAYMENT_ICONS.map((i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setIcon(i)}
                  className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl transition-all ${
                    icon === i
                      ? 'ring-2 ring-primary bg-primary/10 scale-110'
                      : 'bg-muted hover:bg-muted/80'
                  }`}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>

          {/* Color Selection */}
          <div className="space-y-2">
            <Label>{t('common.color')}</Label>
            <div className="flex flex-wrap gap-2">
              {DEFAULT_PAYMENT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full transition-all ${
                    color === c ? 'ring-2 ring-primary ring-offset-2 scale-110' : ''
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="space-y-2">
            <Label>{t('common.preview')}</Label>
            <div className={`p-3 rounded-lg border bg-card space-y-2 ${isBusiness ? 'border-l-4 border-l-amber-500' : ''}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white"
                    style={{ backgroundColor: color }}
                  >
                    <span>{icon}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{name || t('common.name')}</span>
                      {isBusiness && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-[10px] font-semibold uppercase tracking-wide max-w-[140px] truncate">
                          <Briefcase className="w-3 h-3 shrink-0" />
                          <span className="truncate">{businessProfiles.find(p => p.id === businessProfileId)?.name || t('wallet.source.businessBadge', 'Poslovno')}</span>
                        </span>
                      )}
                    </div>
                    {description && (
                      <p className="text-xs text-muted-foreground truncate max-w-[150px]">{description}</p>
                    )}
                  </div>
                </div>
                <span className={`font-mono font-semibold ${formattedBalance >= 0 ? 'text-income' : 'text-expense'}`}>
                  {(CURRENCIES.find(c => c.code === sourceCurrency)?.symbol || '€')}{formattedBalance.toFixed(2)}
                </span>
              </div>
              {cards.filter(c => c.last_four_digits).length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2 border-t">
                  {cards.filter(c => c.last_four_digits).map((card, idx) => (
                    <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 bg-muted rounded text-xs">
                      <CreditCard className="w-3 h-3" />
                      {card.card_type && <span className="text-muted-foreground">{card.card_type}</span>}
                      <span className="font-mono">****{card.last_four_digits}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </DialogContent>

      {/* Card Scanner Dialog */}
      <CardScannerDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onCardDetected={handleCardScanned}
      />

      {/* Quick "+ New company" inline dialog */}
      <QuickBusinessProfileDialog
        open={quickCompanyOpen}
        onOpenChange={setQuickCompanyOpen}
        onCreated={async (newId) => {
          await refetchBusinessProfiles();
          setBusinessProfileId(newId);
        }}
      />
    </Dialog>
  );
};
