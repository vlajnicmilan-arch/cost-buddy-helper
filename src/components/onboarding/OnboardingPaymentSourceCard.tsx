import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { parseLocaleAmount } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { DEFAULT_PAYMENT_ICONS, DEFAULT_PAYMENT_COLORS } from '@/types/customPaymentSource';
import { X, Plus, ScanLine, CreditCard, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface CardInput {
  card_name: string;
  last_four_digits: string;
  card_type?: string;
}

interface PaymentSourceSetup {
  name: string;
  icon: string;
  color: string;
  balance: number;
  cards: CardInput[];
}

interface OnboardingPaymentSourceCardProps {
  source: PaymentSourceSetup;
  onUpdate: (updates: Partial<PaymentSourceSetup>) => void;
  onRemove: () => void;
  onScanCard: () => void;
}

export const OnboardingPaymentSourceCard = ({
  source,
  onUpdate,
  onRemove,
  onScanCard
}: OnboardingPaymentSourceCardProps) => {
  const { t } = useTranslation();
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);

  const addCard = () => {
    onUpdate({
      cards: [...source.cards, { card_name: '', last_four_digits: '', card_type: '' }]
    });
  };

  const updateCard = (index: number, updates: Partial<CardInput>) => {
    const newCards = [...source.cards];
    newCards[index] = { ...newCards[index], ...updates };
    onUpdate({ cards: newCards });
  };

  const removeCard = (index: number) => {
    onUpdate({ cards: source.cards.filter((_, i) => i !== index) });
  };

  return (
    <div className="p-4 rounded-xl border border-border bg-card space-y-4">
      {/* Header with name and remove button */}
      <div className="flex items-start gap-3">
        {/* Icon picker */}
        <Popover open={iconPickerOpen} onOpenChange={setIconPickerOpen}>
          <PopoverTrigger asChild>
            <button
              className="w-12 h-12 rounded-xl flex items-center justify-center text-xl shrink-0 transition-all hover:ring-2 ring-primary"
              style={{ backgroundColor: source.color + '20', color: source.color }}
            >
              {source.icon}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3" align="start">
            <div className="grid grid-cols-6 gap-2">
              {DEFAULT_PAYMENT_ICONS.map((icon) => (
                <button
                  key={icon}
                  onClick={() => {
                    onUpdate({ icon });
                    setIconPickerOpen(false);
                  }}
                  className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg transition-all ${
                    source.icon === icon ? 'ring-2 ring-primary bg-primary/10' : 'hover:bg-muted'
                  }`}
                >
                  {icon}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <div className="flex-1 space-y-2">
          <Input
            value={source.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            placeholder={t('onboarding.sourceName', 'Naziv izvora (npr. Revolut)')}
            className="font-medium"
          />
          
          {/* Color picker */}
          <Popover open={colorPickerOpen} onOpenChange={setColorPickerOpen}>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
                <div 
                  className="w-4 h-4 rounded-full border"
                  style={{ backgroundColor: source.color }}
                />
                {t('common.changeColor', 'Promijeni boju')}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-3" align="start">
              <div className="grid grid-cols-5 gap-2">
                {DEFAULT_PAYMENT_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => {
                      onUpdate({ color });
                      setColorPickerOpen(false);
                    }}
                    className={`w-7 h-7 rounded-full transition-all ${
                      source.color === color ? 'ring-2 ring-primary ring-offset-2' : ''
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive shrink-0"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>

      {/* Balance */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{t('common.currentBalance', 'Trenutno stanje')}</Label>
        <Input
        <MoneyInput
          value={source.balance ? String(source.balance) : ''}
          onChange={(e) => onUpdate({ balance: parseLocaleAmount(e.target.value).value || 0 })}
          placeholder="0,00"
          className="font-mono"
          allowNegative
        />
      </div>


      {/* Cards section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground flex items-center gap-1">
            <CreditCard className="w-3 h-3" />
            {t('common.linkedCards', 'Povezane kartice')}
          </Label>
          <div className="flex gap-1">
            <Button type="button" variant="ghost" size="sm" onClick={onScanCard} className="h-7 text-xs gap-1">
              <ScanLine className="w-3 h-3" />
              {t('onboarding.scanCard', 'Skeniraj')}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={addCard} className="h-7 text-xs gap-1">
              <Plus className="w-3 h-3" />
              {t('common.add', 'Dodaj')}
            </Button>
          </div>
        </div>

        {source.cards.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-2 bg-muted/30 rounded-lg">
            {t('onboarding.noCardsYet', 'Nema povezanih kartica. Skenirajte ili dodajte ručno.')}
          </p>
        ) : (
          <div className="space-y-2">
            {source.cards.map((card, index) => (
              <div key={index} className="flex gap-2 p-2 bg-muted/30 rounded-lg items-center">
                <div className="flex-1 grid grid-cols-3 gap-2">
                  <Input
                    placeholder={t('onboarding.cardType', 'Tip (Visa...)')}
                    value={card.card_type || ''}
                    onChange={(e) => updateCard(index, { card_type: e.target.value })}
                    className="h-8 text-xs"
                  />
                  <Input
                    placeholder={t('onboarding.cardName', 'Naziv')}
                    value={card.card_name}
                    onChange={(e) => updateCard(index, { card_name: e.target.value })}
                    className="h-8 text-xs"
                  />
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">****</span>
                    <Input
                      placeholder="1234"
                      value={card.last_four_digits}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                        updateCard(index, { last_four_digits: value });
                      }}
                      className="h-8 text-xs font-mono w-16"
                      maxLength={4}
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeCard(index)}
                  className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
