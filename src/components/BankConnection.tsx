import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Building2, Plus, ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

interface BankConnectionProps {
  onConnect?: () => void;
}

const SUPPORTED_BANKS = [
  { id: 'pbz', name: 'PBZ', logo: '🏦' },
  { id: 'erste', name: 'Erste Bank', logo: '🏛️' },
  { id: 'zaba', name: 'Zagrebačka banka', logo: '🏦' },
  { id: 'raiffeisen', name: 'Raiffeisen', logo: '🏛️' },
  { id: 'otp', name: 'OTP Banka', logo: '🏦' },
  { id: 'addiko', name: 'Addiko Bank', logo: '🏛️' },
];

export const BankConnection = ({ onConnect }: BankConnectionProps) => {
  const [open, setOpen] = useState(false);

  const handleBankConnect = (bankId: string) => {
    // For now, show that this feature requires external API setup
    alert(`Povezivanje s bankom ${bankId} zahtijeva konfiguraciju Salt Edge ili Nordigen API-ja. Ova funkcionalnost dolazi uskoro!`);
    setOpen(false);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-2xl p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Building2 className="w-5 h-5" />
          Bankovni računi
        </h3>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        Poveži banku za automatski uvoz transakcija putem PSD2 Open Banking protokola.
      </p>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" className="w-full gap-2 rounded-xl">
            <Plus className="w-4 h-4" />
            Poveži banku
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md glass-card border-border/50">
          <DialogHeader>
            <DialogTitle>Odaberi banku</DialogTitle>
          </DialogHeader>
          
          <div className="grid grid-cols-2 gap-3 mt-4">
            {SUPPORTED_BANKS.map((bank) => (
              <button
                key={bank.id}
                onClick={() => handleBankConnect(bank.id)}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-transparent bg-muted/50 hover:bg-muted hover:border-primary/20 transition-all"
              >
                <span className="text-2xl">{bank.logo}</span>
                <span className="text-sm font-medium">{bank.name}</span>
              </button>
            ))}
          </div>

          <div className="mt-4 p-4 bg-muted/50 rounded-xl">
            <p className="text-xs text-muted-foreground text-center">
              Bankovno povezivanje koristi sigurni PSD2 Open Banking protokol. 
              Tvoji podaci su kriptirani i zaštićeni.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};
