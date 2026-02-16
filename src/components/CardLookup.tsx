import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CreditCard, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CustomPaymentSource } from '@/types/customPaymentSource';

interface CardMatch {
  cardId: string;
  cardName: string;
  lastFour: string;
  sourceId: string;
  sourceName: string;
  sourceIcon: string;
  sourceColor: string;
}

interface CardLookupProps {
  customPaymentSources: CustomPaymentSource[];
  onSelect: (sourceId: string, cardId: string) => void;
}

export const CardLookup = ({ customPaymentSources, onSelect }: CardLookupProps) => {
  const [digits, setDigits] = useState('');
  const [dismissed, setDismissed] = useState(false);

  const matches = useMemo<CardMatch[]>(() => {
    if (digits.length < 4) return [];
    
    const results: CardMatch[] = [];
    for (const source of customPaymentSources) {
      if (!source.cards) continue;
      for (const card of source.cards) {
        if (card.last_four_digits === digits) {
          results.push({
            cardId: card.id,
            cardName: card.card_name,
            lastFour: card.last_four_digits,
            sourceId: source.id,
            sourceName: source.name,
            sourceIcon: source.icon,
            sourceColor: source.color,
          });
        }
      }
    }
    return results;
  }, [digits, customPaymentSources]);

  const handleSelect = (match: CardMatch) => {
    onSelect(match.sourceId, match.cardId);
    setDigits('');
    setDismissed(true);
  };

  if (dismissed) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Search className="w-3 h-3" />
          Pronađi karticu po zadnje 4 znamenke
        </Label>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <Input
        type="text"
        inputMode="numeric"
        maxLength={4}
        placeholder="npr. 1234"
        value={digits}
        onChange={(e) => {
          const val = e.target.value.replace(/\D/g, '').slice(0, 4);
          setDigits(val);
        }}
        className="h-10 rounded-xl font-mono text-center tracking-[0.3em]"
      />
      
      {digits.length === 4 && matches.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-1">
          Nije pronađena kartica s brojem ****{digits}
        </p>
      )}

      {matches.length > 0 && (
        <div className="space-y-1.5">
          {matches.map((match) => (
            <button
              key={match.cardId}
              type="button"
              onClick={() => handleSelect(match)}
              className={cn(
                "w-full flex items-center gap-3 p-3 rounded-xl border border-border",
                "bg-muted/30 hover:bg-primary/10 hover:border-primary/30 transition-all text-left"
              )}
            >
              <span
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0"
                style={{ backgroundColor: match.sourceColor + '20', color: match.sourceColor }}
              >
                {match.sourceIcon}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{match.sourceName}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <CreditCard className="w-3 h-3" />
                  {match.cardName} •••• {match.lastFour}
                </p>
              </div>
              <span className="text-xs text-primary font-medium shrink-0">Odaberi</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
