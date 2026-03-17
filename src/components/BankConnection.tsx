import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { FileSpreadsheet, Info, FileText, Loader2, AlertTriangle, Camera, Image as ImageIcon, Code2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { CSVImportDialog } from './CSVImportDialog';
import { ParsedTransaction } from '@/lib/csvParsers';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { usePDFParser } from '@/hooks/usePDFParser';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import { useTranslation } from 'react-i18next';
import { useAppState } from '@/contexts/AppStateContext';
import { Badge } from '@/components/ui/badge';
import { DetectedPartnersDialog } from './DetectedPartnersDialog';

interface BankConnectionProps {
  onImportCSV?: (transactions: ParsedTransaction[]) => Promise<void>;
  findDuplicates?: (transactions: ParsedTransaction[]) => { duplicates: ParsedTransaction[]; fuzzyDuplicates: ParsedTransaction[]; unique: ParsedTransaction[] };
  existingExpenses?: import('@/types/expense').Expense[];
}

const SUPPORTED_SOURCES = [
  { id: 'revolut', name: 'Revolut', logo: '💳' },
  { id: 'aircash', name: 'Aircash', logo: '📱' },
  { id: 'pbz', name: 'PBZ', logo: '🏦' },
  { id: 'erste', name: 'Erste Bank', logo: '🏛️' },
  { id: 'zaba', name: 'Zagrebačka banka', logo: '🏦' },
];

export const BankConnection = ({ onImportCSV, findDuplicates, existingExpenses }: BankConnectionProps) => {
  const { t } = useTranslation();
  const { activeBusinessProfileId } = useAppState();
  const [infoOpen, setInfoOpen] = useState(false);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [duplicateWarningOpen, setDuplicateWarningOpen] = useState(false);
  const [includeDuplicates, setIncludeDuplicates] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState<{ duplicates: ParsedTransaction[]; fuzzyDuplicates: ParsedTransaction[]; unique: ParsedTransaction[] } | null>(null);
  const [selectedFuzzy, setSelectedFuzzy] = useState<Set<number>>(new Set());
  const [partnersDialogOpen, setPartnersDialogOpen] = useState(false);
  const [detectedMerchants, setDetectedMerchants] = useState<string[]>([]);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const htmlInputRef = useRef<HTMLInputElement>(null);
  const { parsing, parsedData, parsePDF, parsePhoto, parseHTML, clearParsedData } = usePDFParser();

  const handlePDFSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      toast.error(t('import.selectPDF'));
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      const result = await parsePDF(base64);
      
      if (result && result.transactions.length > 0) {
        setPdfPreviewOpen(true);
      }
    };
    reader.readAsDataURL(file);

    if (pdfInputRef.current) {
      pdfInputRef.current.value = '';
    }
  };

  const handleHTMLSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const isHTMLFile = file.type === 'text/html' || file.name.toLowerCase().endsWith('.html') || file.name.toLowerCase().endsWith('.htm');
    if (!isHTMLFile) {
      toast.error('Odaberi HTML datoteku (.html ili .htm)');
      return;
    }

    const content = await file.text();
    const result = await parseHTML(content);
    
    if (result && result.transactions.length > 0) {
      setPdfPreviewOpen(true);
    } else if (result && result.transactions.length === 0) {
      toast.error('Nije pronađena nijedna transakcija u HTML datoteci.');
    }

    if (htmlInputRef.current) {
      htmlInputRef.current.value = '';
    }
  };

  const handlePhotoSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Odaberi slikovnu datoteku (JPG, PNG)');
      return;
    }

    // Resize image for efficiency
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      
      // Compress if needed
      const img = new window.Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        const maxWidth = 1200;
        const scale = Math.min(1, maxWidth / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const compressed = canvas.toDataURL('image/jpeg', 0.85);
        
        const result = await parsePhoto(compressed);
        if (result && result.transactions.length > 0) {
          setPdfPreviewOpen(true);
        } else if (result && result.transactions.length === 0) {
          toast.error('Nije pronađena nijedna transakcija na fotografiji. Pokušaj s boljom kvalitetom slike.');
        }
      };
      img.src = base64;
    };
    reader.readAsDataURL(file);

    // Reset inputs
    if (photoInputRef.current) photoInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const handleImportPDFTransactions = async () => {
    if (!parsedData || !onImportCSV) return;

    const transactions: ParsedTransaction[] = parsedData.transactions.map(tx => ({
      date: tx.date,
      description: tx.description,
      amount: tx.amount,
      type: tx.type,
      category: tx.category,
      merchant_name: tx.merchant_name || undefined,
      source: 'pdf',
      payment_source: tx.payment_source || 'bank'
    }));

    // Check for duplicates if function is provided
    if (findDuplicates) {
      const { duplicates, fuzzyDuplicates, unique } = findDuplicates(transactions);
      
      if (duplicates.length > 0 || fuzzyDuplicates.length > 0) {
        setDuplicateInfo({ duplicates, fuzzyDuplicates, unique });
        setIncludeDuplicates(false);
        setSelectedFuzzy(new Set());
        setPdfPreviewOpen(false);
        setDuplicateWarningOpen(true);
        return;
      }
    }

    // No duplicates, import all
    await onImportCSV(transactions);
    setPdfPreviewOpen(false);
    // Extract merchants for partner detection
    const merchants = transactions.map(t => t.merchant_name).filter(Boolean) as string[];
    if (merchants.length > 0 && activeBusinessProfileId) {
      setDetectedMerchants(merchants);
      setPartnersDialogOpen(true);
    }
    clearParsedData();
    toast.success(t('import.importedFromPDF', { count: transactions.length }));
  };

  const handleConfirmImportWithDuplicates = async () => {
    if (!duplicateInfo || !onImportCSV) return;

    // Always include unique, optionally include strict duplicates, include selected fuzzy duplicates
    const fuzzyToInclude = duplicateInfo.fuzzyDuplicates.filter((_, i) => selectedFuzzy.has(i));
    const strictToInclude = includeDuplicates ? duplicateInfo.duplicates : [];
    const transactionsToImport = [...duplicateInfo.unique, ...fuzzyToInclude, ...strictToInclude];

    if (transactionsToImport.length === 0) {
      toast.info(t('import.noNewTransactions'));
      setDuplicateWarningOpen(false);
      clearParsedData();
      setDuplicateInfo(null);
      return;
    }

    await onImportCSV(transactionsToImport);
    setDuplicateWarningOpen(false);
    // Extract merchants for partner detection
    const merchants = transactionsToImport.map(t => t.merchant_name).filter(Boolean) as string[];
    if (merchants.length > 0 && activeBusinessProfileId) {
      setDetectedMerchants(merchants);
      setPartnersDialogOpen(true);
    }
    clearParsedData();
    setDuplicateInfo(null);
    toast.success(t('import.importedTransactions', { count: transactionsToImport.length }));
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-2xl p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5" />
          {t('import.title')}
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
              <p>{t('import.supportedFormats')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        {t('import.supportedBanks').split(':')[0]}.
      </p>

      <div className="flex flex-col gap-2">
        {onImportCSV && <CSVImportDialog onImport={onImportCSV} existingExpenses={existingExpenses} findDuplicates={findDuplicates} />}
        
        {/* Photo Import */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handlePhotoSelect}
          className="hidden"
          id="camera-input"
        />
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          onChange={handlePhotoSelect}
          className="hidden"
          id="photo-input"
        />
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            className="gap-2 rounded-xl border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10"
            onClick={() => cameraInputRef.current?.click()}
            disabled={parsing}
          >
            {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
            {t('scanner.camera', 'Fotografiraj')}
          </Button>
          <Button
            variant="outline"
            className="gap-2 rounded-xl border-green-500/30 text-green-600 dark:text-green-400 hover:bg-green-500/10"
            onClick={() => photoInputRef.current?.click()}
            disabled={parsing}
          >
            {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
            {t('scanner.gallery', 'Iz galerije')}
          </Button>
        </div>

        {/* PDF Import */}
        <input
          ref={pdfInputRef}
          type="file"
          accept="application/pdf"
          onChange={handlePDFSelect}
          className="hidden"
          id="pdf-input"
        />
        <Button
          variant="outline"
          className="w-full gap-2 rounded-xl"
          onClick={() => pdfInputRef.current?.click()}
          disabled={parsing}
        >
          {parsing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <FileText className="w-4 h-4" />
          )}
          {parsing ? t('import.analyzingPDF') : t('import.importPDF')}
        </Button>

        {/* HTML Import */}
        <input
          ref={htmlInputRef}
          type="file"
          accept=".html,.htm,text/html"
          onChange={handleHTMLSelect}
          className="hidden"
          id="html-input"
        />
        <Button
          variant="outline"
          className="w-full gap-2 rounded-xl border-purple-500/30 text-purple-600 dark:text-purple-400 hover:bg-purple-500/10"
          onClick={() => htmlInputRef.current?.click()}
          disabled={parsing}
        >
          {parsing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Code2 className="w-4 h-4" />
          )}
          {parsing ? t('import.analyzingPDF') : 'Uvezi HTML izvod'}
        </Button>
      </div>

      {/* PDF Preview Dialog */}
      <Dialog open={pdfPreviewOpen} onOpenChange={setPdfPreviewOpen}>
        <DialogContent showBackButton={false} className="sm:max-w-lg glass-card border-border/50 max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{t('import.foundTransactions')}</DialogTitle>
          </DialogHeader>
          
          {parsedData && (
            <div className="flex-1 overflow-y-auto space-y-4">
              {/* Detected bank and account info */}
              {(parsedData.detected_bank || parsedData.account_iban || parsedData.cards_detected.length > 0) && (
                <div className="p-3 bg-primary/10 rounded-xl text-sm space-y-1">
                  {parsedData.detected_bank && (
                    <p className="font-medium">
                      🏦 {t('import.bank')}: <span className="text-primary">{parsedData.detected_bank}</span>
                    </p>
                  )}
                  {parsedData.account_iban && (
                    <p className="text-muted-foreground text-xs font-mono">
                      {t('import.account')}: {parsedData.account_iban}
                    </p>
                  )}
                  {parsedData.cards_detected.length > 0 && (
                    <p className="text-muted-foreground text-xs">
                      💳 {t('import.cards')}: {parsedData.cards_detected.map(c => `*${c}`).join(', ')}
                    </p>
                  )}
                </div>
              )}

              {/* Business profile mismatch warning */}
              {activeBusinessProfileId && parsedData.holder_name && (
                <div className="p-3 bg-orange-500/10 border border-orange-500/20 rounded-xl text-sm flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-orange-600 dark:text-orange-400">
                      Provjeri vlasnika računa
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Izvod glasi na: <strong>{parsedData.holder_name}</strong>. 
                      Trenutno uvoziš u <strong>poslovni profil</strong>. Je li to ispravno?
                    </p>
                  </div>
                </div>
              )}

              {/* Duplicate detection warning */}
              {findDuplicates && parsedData.transactions.length > 0 && (() => {
                const txForCheck: ParsedTransaction[] = parsedData.transactions.map(tx => ({
                  date: tx.date,
                  description: tx.description,
                  amount: tx.amount,
                  type: tx.type,
                  category: tx.category,
                  merchant_name: tx.merchant_name || undefined,
                  source: 'photo',
                  payment_source: tx.payment_source || 'bank'
                }));
                const { duplicates, fuzzyDuplicates } = findDuplicates(txForCheck);
                const totalDups = duplicates.length + fuzzyDuplicates.length;
                if (totalDups === 0) return null;
                return (
                  <div className="p-3 bg-orange-500/10 border border-orange-500/20 rounded-xl text-sm flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-orange-600 dark:text-orange-400">
                        {duplicates.length > 0 && `${duplicates.length} ${duplicates.length === 1 ? 'sigurni duplikat' : 'sigurnih duplikata'}`}
                        {duplicates.length > 0 && fuzzyDuplicates.length > 0 && ', '}
                        {fuzzyDuplicates.length > 0 && `${fuzzyDuplicates.length} ${fuzzyDuplicates.length === 1 ? 'mogući duplikat' : 'mogućih duplikata'} (±3 dana)`}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Duplikati će biti označeni pri uvozu. Moći ćeš odabrati koje želiš uvesti.
                      </p>
                    </div>
                  </div>
                );
              })()}

              {parsedData.summary && (
                <div className="grid grid-cols-3 gap-2 p-3 bg-muted/50 rounded-xl text-sm">
                  <div className="text-center">
                    <p className="text-muted-foreground">{t('import.income')}</p>
                    <p className="font-bold text-income">€{parsedData.summary.total_income.toFixed(2)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-muted-foreground">{t('import.expenses')}</p>
                    <p className="font-bold text-expense">€{parsedData.summary.total_expenses.toFixed(2)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-muted-foreground">{t('import.total')}</p>
                    <p className="font-bold">{parsedData.summary.transaction_count}</p>
                  </div>
                </div>
              )}

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {parsedData.transactions.map((tx, idx) => (
                  <div 
                    key={idx} 
                    className="flex items-center justify-between p-3 bg-background/50 rounded-xl text-sm"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{tx.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {tx.date.toLocaleDateString()} • {tx.merchant_name || tx.category}
                        {tx.card_last4 && <span className="ml-1 font-mono">(*{tx.card_last4})</span>}
                      </p>
                    </div>
                    <p className={`font-mono font-bold ${
                      tx.type === 'income' ? 'text-income' : 
                      tx.type === 'transfer' ? 'text-muted-foreground' : 'text-expense'
                    }`}>
                      {tx.type === 'income' ? '+' : tx.type === 'transfer' ? '↔' : '-'}€{tx.amount.toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>

              <Button 
                onClick={handleImportPDFTransactions}
                className="w-full rounded-xl"
              >
                {t('import.importCount', { count: parsedData.transactions.length })}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Duplicate Warning Dialog */}
      <Dialog open={duplicateWarningOpen} onOpenChange={setDuplicateWarningOpen}>
        <DialogContent showBackButton={false} className="sm:max-w-lg glass-card border-border/50 max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              {t('import.duplicatesFound')}
            </DialogTitle>
          </DialogHeader>
          
          {duplicateInfo && (
            <div className="flex-1 overflow-y-auto space-y-4">
              {/* Summary */}
              <div className="p-3 bg-orange-500/10 border border-orange-500/20 rounded-xl text-sm">
                <p className="font-medium text-orange-600 dark:text-orange-400">
                  {duplicateInfo.duplicates.length > 0 && `${duplicateInfo.duplicates.length} sigurnih duplikata (automatski preskočeno)`}
                  {duplicateInfo.duplicates.length > 0 && duplicateInfo.fuzzyDuplicates.length > 0 && ' • '}
                  {duplicateInfo.fuzzyDuplicates.length > 0 && `${duplicateInfo.fuzzyDuplicates.length} mogućih duplikata (±3 dana)`}
                </p>
                <p className="text-muted-foreground text-xs mt-1">
                  {t('import.newTransactionsReady', { count: duplicateInfo.unique.length })}
                </p>
              </div>

              {/* Strict duplicates - collapsed list */}
              {duplicateInfo.duplicates.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-destructive/80">🚫 Sigurni duplikati (isti datum i iznos):</p>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {duplicateInfo.duplicates.map((tx, idx) => (
                      <div 
                        key={idx} 
                        className="flex items-center justify-between p-2 bg-destructive/5 rounded-lg text-sm border border-destructive/10 opacity-60"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate text-xs">{tx.description}</p>
                          <p className="text-xs text-muted-foreground">{tx.date.toLocaleDateString()}</p>
                        </div>
                        <p className={`font-mono text-xs ${tx.type === 'income' ? 'text-income' : 'text-expense'}`}>
                          {tx.type === 'income' ? '+' : '-'}€{tx.amount.toFixed(2)}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center space-x-2 p-2 bg-muted/30 rounded-lg">
                    <Checkbox 
                      id="include-strict-duplicates" 
                      checked={includeDuplicates}
                      onCheckedChange={(checked) => setIncludeDuplicates(checked === true)}
                    />
                    <label htmlFor="include-strict-duplicates" className="text-xs cursor-pointer text-muted-foreground">
                      Ipak uvezi sigurne duplikate ({duplicateInfo.duplicates.length})
                    </label>
                  </div>
                </div>
              )}

              {/* Fuzzy duplicates - individual checkboxes */}
              {duplicateInfo.fuzzyDuplicates.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-amber-600 dark:text-amber-400">⚠️ Mogući duplikati (±3 dana, isti iznos):</p>
                  <p className="text-xs text-muted-foreground">Odaberi koje želiš uvesti:</p>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {duplicateInfo.fuzzyDuplicates.map((tx, idx) => (
                      <div 
                        key={idx} 
                        className={`flex items-center gap-2 p-2 rounded-lg text-sm border cursor-pointer transition-colors ${
                          selectedFuzzy.has(idx) 
                            ? 'bg-primary/5 border-primary/20' 
                            : 'bg-amber-500/5 border-amber-500/15'
                        }`}
                        onClick={() => {
                          const next = new Set(selectedFuzzy);
                          next.has(idx) ? next.delete(idx) : next.add(idx);
                          setSelectedFuzzy(next);
                        }}
                      >
                        <Checkbox 
                          checked={selectedFuzzy.has(idx)}
                          onCheckedChange={() => {
                            const next = new Set(selectedFuzzy);
                            next.has(idx) ? next.delete(idx) : next.add(idx);
                            setSelectedFuzzy(next);
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate text-xs">{tx.description}</p>
                          <p className="text-xs text-muted-foreground">{tx.date.toLocaleDateString()}</p>
                        </div>
                        <p className={`font-mono text-xs ${tx.type === 'income' ? 'text-income' : 'text-expense'}`}>
                          {tx.type === 'income' ? '+' : '-'}€{tx.amount.toFixed(2)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex gap-2 mt-4">
            <Button 
              variant="outline" 
              onClick={() => {
                setDuplicateWarningOpen(false);
                clearParsedData();
                setDuplicateInfo(null);
              }}
              className="rounded-xl"
            >
              {t('common.cancel')}
            </Button>
            <Button 
              onClick={handleConfirmImportWithDuplicates}
              className="rounded-xl"
            >
              {t('import.importCount', { 
                count: (duplicateInfo?.unique.length || 0) + 
                       selectedFuzzy.size + 
                       (includeDuplicates ? (duplicateInfo?.duplicates.length || 0) : 0)
              })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Info Dialog */}
      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent className="sm:max-w-md glass-card border-border/50">
          <DialogHeader>
            <DialogTitle>{t('import.supportedSources')}</DialogTitle>
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
            <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
              <span className="text-xl">📄</span>
              <span className="text-sm font-medium">{t('import.otherBanks')}</span>
            </div>
          </div>

          <div className="mt-4 p-4 bg-muted/50 rounded-xl">
            <p className="text-sm font-medium mb-2">{t('import.supportedFormats')}</p>
            <ul className="text-xs text-muted-foreground space-y-2">
              <li>
                <strong>📷 Fotografija:</strong> Fotografiraj papirni izvod ili screenshot iz aplikacije banke
              </li>
              <li>
                <strong>CSV:</strong> {t('import.csvFormat')}
              </li>
              <li>
                <strong>PDF:</strong> {t('import.pdfFormat')}
              </li>
            </ul>
          </div>

          <div className="mt-2 p-4 bg-muted/50 rounded-xl">
            <p className="text-sm font-medium mb-2">{t('import.howToExport')}</p>
            <ul className="text-xs text-muted-foreground space-y-2">
              <li>
                <strong>Revolut:</strong> Transactions → Export statement
              </li>
              <li>
                <strong>Aircash:</strong> Transakcije → Izvoz
              </li>
              <li>
                <strong>Internet bankarstvo:</strong> Izvodi/Prometi → Preuzmi
              </li>
            </ul>
          </div>
        </DialogContent>
      </Dialog>
      {/* Detected Partners Dialog */}
      <DetectedPartnersDialog
        open={partnersDialogOpen}
        onOpenChange={setPartnersDialogOpen}
        merchantNames={detectedMerchants}
      />
    </motion.div>
  );
};