import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Building2, Plus, FileSpreadsheet, Info } from 'lucide-react';
import { motion } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { CSVImportDialog } from './CSVImportDialog';
import { ParsedTransaction } from '@/lib/csvParsers';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface BankConnectionProps {
  onImportCSV?: (transactions: ParsedTransaction[]) => Promise<void>;
}

const SUPPORTED_SOURCES = [
  { id: 'revolut', name: 'Revolut', logo: '💳' },
  { id: 'aircash', name: 'Aircash', logo: '📱' },
  { id: 'pbz', name: 'PBZ', logo: '🏦' },
  { id: 'erste', name: 'Erste Bank', logo: '🏛️' },
  { id: 'zaba', name: 'Zagrebačka banka', logo: '🏦' },
  { id: 'other', name: 'Ostale banke', logo: '📄' },
];

export const BankConnection = ({ onImportCSV }: BankConnectionProps) => {
  const [infoOpen, setInfoOpen] = useState(false);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-2xl p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5" />
          Uvoz transakcija
        </h3>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 rounded-lg"
                onClick={() => setInfoOpen(true)}
              >
                <Info className="w-4 h-4 text-muted-foreground" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Podržani formati</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        Uvezi transakcije iz CSV izvoza svoje banke ili fintech aplikacije.
      </p>

      {onImportCSV && <CSVImportDialog onImport={onImportCSV} />}

      {/* Info Dialog */}
      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent className="sm:max-w-md glass-card border-border/50">
          <DialogHeader>
            <DialogTitle>Podržani izvori</DialogTitle>
          </DialogHeader>
          
          <div className="grid grid-cols-2 gap-3 mt-4">
            {SUPPORTED_SOURCES.map((source) => (
              <div
                key={source.id}
                className="flex items-center gap-3 p-3 rounded-xl bg-muted/50"
              >
                <span className="text-xl">{source.logo}</span>
                <span className="text-sm font-medium">{source.name}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 p-4 bg-muted/50 rounded-xl">
            <p className="text-sm font-medium mb-2">Kako izvesti CSV?</p>
            <ul className="text-xs text-muted-foreground space-y-2">
              <li>
                <strong>Revolut:</strong> Otvori app → Transactions → tri točkice → Export statement → CSV
              </li>
              <li>
                <strong>Aircash:</strong> Transakcije → Izvoz/Export
              </li>
              <li>
                <strong>Internet bankarstvo:</strong> Prometi/Izvodi → Preuzmi/Export → CSV format
              </li>
            </ul>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};
