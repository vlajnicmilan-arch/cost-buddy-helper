import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Smartphone, Cloud, LayoutDashboard, FileSpreadsheet, LogOut } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { NotificationsDropdown } from '@/components/NotificationsDropdown';
import { SettingsDialog } from '@/components/SettingsDialog';
import { TutorialButton } from '@/components/tutorial';
import { BulkEditDropdown } from '@/components/BulkEditDropdown';
import { ReportsDialog } from '@/components/reports/ReportsDialog';
import { ScanTriggerButton } from '@/components/add-expense/ScanTriggerButton';
import { ManualAddTriggerButton } from '@/components/add-expense/ManualAddTriggerButton';

import { CSVImportDialog } from '@/components/CSVImportDialog';
import { GlobalSearch } from '@/components/GlobalSearch';
import logo from '@/assets/logo.webp';
import { Expense, ReceiptItem } from '@/types/expense';
import { ParsedTransaction } from '@/lib/csvParsers';

interface HomeHeaderProps {
  displayName: string;
  isLocalMode: boolean;
  simpleModeEnabled: boolean;
  expenses: Expense[];
  reportsExpenses: Expense[];
  allExpenses: Expense[];
  onAddExpense: (expense: Omit<Expense, 'id' | 'user_id' | 'created_at' | 'updated_at'>, items?: ReceiptItem[], isPendingMemberTransaction?: boolean) => Promise<void> | void;
  onCheckDuplicate?: (transaction: { amount: number; description: string; date: Date; type: string; category?: string; merchant_name?: string }) => Expense | null;
  onBulkUpdateExpenses: (expenses: Expense[]) => Promise<any>;
  onImportCSV?: (transactions: ParsedTransaction[]) => Promise<void>;
  findDuplicates?: (transactions: ParsedTransaction[]) => { duplicates: ParsedTransaction[]; fuzzyDuplicates: ParsedTransaction[]; fuzzyMatchedExpenses: Expense[]; unique: ParsedTransaction[] };
  existingExpenses?: Expense[];
  onRefetch: () => void;
  onSelectExpense?: (expense: Expense) => void;
}

export const HomeHeader = ({
  displayName,
  isLocalMode,
  simpleModeEnabled,
  expenses,
  reportsExpenses,
  allExpenses,
  onAddExpense,
  onCheckDuplicate,
  onBulkUpdateExpenses,
  onImportCSV,
  findDuplicates,
  existingExpenses,
  onRefetch,
  onSelectExpense,
}: HomeHeaderProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [importOpen, setImportOpen] = useState(false);

  // Note: scan trigger now opens a globally-mounted AddExpenseDialog (see
  // GlobalReceiptScanHost) so the camera roundtrip on Android cannot unmount it.

  const handleSignOut = async () => {
    if (isLocalMode) {
      navigate('/setup');
      return;
    }
    try {
      await signOut();
    } catch (e) {
      console.error('Sign out error:', e);
    } finally {
      const theme = localStorage.getItem('theme');
      const storageConfig = localStorage.getItem('finmate-storage-config');
      const aiAssistant = localStorage.getItem('ai_assistant_enabled');
      const simpleMode = localStorage.getItem('simple_mode_enabled');
      const familyMode = localStorage.getItem('family_mode_enabled');
      const businessMode = localStorage.getItem('business_mode_enabled');
      localStorage.clear();
      if (theme) localStorage.setItem('theme', theme);
      if (storageConfig) localStorage.setItem('finmate-storage-config', storageConfig);
      if (aiAssistant) localStorage.setItem('ai_assistant_enabled', aiAssistant);
      if (simpleMode) localStorage.setItem('simple_mode_enabled', simpleMode);
      if (familyMode) localStorage.setItem('family_mode_enabled', familyMode);
      if (businessMode) localStorage.setItem('business_mode_enabled', businessMode);
      navigate('/');
    }
  };

  return (
    <header className="flex flex-col gap-3 mb-4 sm:mb-6" data-tutorial="header">
      {/* Top row: Logo, title, and navigation icons */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl overflow-hidden flex-shrink-0">
            <img src={logo} alt="V&M Balance" className="w-full h-full scale-[1.8] object-cover" width={48} height={48} fetchPriority="high" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-3xl font-bold text-foreground tracking-tight truncate">
              {displayName ? t('common.greeting', 'Bok, {{name}}!').replace('{{name}}', displayName) : 'V&M Balance'}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/50 text-xs text-muted-foreground">
                      {isLocalMode ? (
                        <>
                          <Smartphone className="w-3 h-3" />
                          {t('common.local')}
                        </>
                      ) : (
                        <>
                          <Cloud className="w-3 h-3" />
                          {t('common.cloud')}
                        </>
                      )}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{isLocalMode ? t('common.localData') : t('common.cloudData')}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </div>

        {/* Navigation icons (right side) */}
        <div className="flex items-center gap-0.5 sm:gap-2 flex-shrink-0">
          <TutorialButton className="rounded-xl h-8 w-8 sm:h-9 sm:w-9" />
          {!isLocalMode && <NotificationsDropdown />}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => navigate('/dashboard')}
                  className="rounded-xl h-8 w-8 sm:h-9 sm:w-9"
                >
                  <LayoutDashboard className="w-4 h-4 sm:w-5 sm:h-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Dashboard</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <SettingsDialog onDataImported={onRefetch} />
          {!isLocalMode && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleSignOut}
                    className="rounded-xl h-8 w-8 sm:h-9 sm:w-9"
                    aria-label={t('common.signOut', 'Odjava')}
                  >
                    <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('common.signOut', 'Odjava')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      {/* Bottom row: Action buttons */}
      {/* Search bar - full width */}
      {onSelectExpense && (
        <div className="w-full">
          <GlobalSearch expenses={allExpenses} onSelectExpense={onSelectExpense} alwaysExpanded />
        </div>
      )}

      {/* Bottom row: Action buttons — equal width grid */}
      <div
        className={`grid ${simpleModeEnabled ? 'grid-cols-2' : 'grid-cols-3'} gap-2`}
        data-tutorial="add-buttons"
      >
        {!simpleModeEnabled && (
          <ReportsDialog expenses={reportsExpenses} triggerClassName="w-full h-11 justify-center" />
        )}
        <ScanTriggerButton
          triggerLabel={t('common.scan', 'Skeniraj')}
          triggerClassName="w-full h-11 justify-center"
        />
        <ManualAddTriggerButton
          triggerClassName="w-full h-11 justify-center"
        />
      </div>
    </header>
  );
};
