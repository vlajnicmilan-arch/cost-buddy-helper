import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LogOut, Smartphone, Cloud, LayoutDashboard, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { NotificationsDropdown } from '@/components/NotificationsDropdown';
import { SettingsDialog } from '@/components/SettingsDialog';
import { TutorialButton } from '@/components/tutorial';
import { BulkEditDropdown } from '@/components/BulkEditDropdown';
import { ReportsDialog } from '@/components/reports/ReportsDialog';
import { AddExpenseDialog } from '@/components/AddExpenseDialog';
import { BusinessProfileSwitcher } from '@/components/BusinessProfileSwitcher';
import { CSVImportDialog } from '@/components/CSVImportDialog';
import logo from '@/assets/logo.png';
import { Expense, ReceiptItem } from '@/types/expense';
import { ParsedTransaction } from '@/lib/csvParsers';

interface HomeHeaderProps {
  displayName: string;
  isLocalMode: boolean;
  simpleModeEnabled: boolean;
  expenses: Expense[];
  onAddExpense: (expense: Omit<Expense, 'id' | 'user_id' | 'created_at' | 'updated_at'>, items?: ReceiptItem[], isPendingMemberTransaction?: boolean) => Promise<void> | void;
  onCheckDuplicate?: (transaction: { amount: number; description: string; date: Date; type: string; category?: string; merchant_name?: string }) => Expense | null;
  onBulkUpdateExpenses: (expenses: Expense[]) => Promise<any>;
  onImportCSV?: (transactions: ParsedTransaction[]) => Promise<void>;
  findDuplicates?: (transactions: ParsedTransaction[]) => { duplicates: ParsedTransaction[]; unique: ParsedTransaction[] };
  existingExpenses?: Expense[];
  onRefetch: () => void;
  onSignOut: () => void;
}

export const HomeHeader = ({
  displayName,
  isLocalMode,
  simpleModeEnabled,
  expenses,
  onAddExpense,
  onCheckDuplicate,
  onBulkUpdateExpenses,
  onImportCSV,
  findDuplicates,
  existingExpenses,
  onRefetch,
  onSignOut,
}: HomeHeaderProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [importOpen, setImportOpen] = useState(false);

  return (
    <header className="flex flex-col gap-4 mb-6 sm:mb-8" data-tutorial="header">
      {/* Top row: Logo, title, and navigation icons */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl overflow-hidden flex-shrink-0">
            <img src={logo} alt="V&M Balance" className="w-full h-full scale-[1.8] object-cover" />
          </div>
          <div>
            <h1 className="text-xl sm:text-3xl font-bold text-foreground tracking-tight">
              {displayName ? t('common.greeting', 'Bok, {{name}}!').replace('{{name}}', displayName) : 'V&M Balance'}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-sm sm:text-base text-muted-foreground hidden sm:block">{t('common.manageFinances')}</p>
              <div className="flex items-center gap-1.5">
                <BusinessProfileSwitcher />
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
        </div>

        {/* Navigation icons (right side) */}
        <div className="flex items-center gap-1 sm:gap-2">
          <TutorialButton className="rounded-xl h-9 w-9" />
          {!isLocalMode && <NotificationsDropdown />}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => navigate('/dashboard')}
                  className="rounded-xl h-9 w-9"
                >
                  <LayoutDashboard className="w-4 h-4 sm:w-5 sm:h-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Dashboard</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <SettingsDialog onDataImported={onRefetch} />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t('settings.title', 'Postavke')}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {!isLocalMode && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onSignOut}
              className="rounded-xl h-9 w-9"
            >
              <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
            </Button>
          )}
        </div>
      </div>

      {/* Bottom row: Action buttons */}
      <div className="flex flex-wrap items-center gap-2" data-tutorial="add-buttons">
        {!simpleModeEnabled && <BulkEditDropdown expenses={expenses} onUpdateExpenses={onBulkUpdateExpenses} />}
        {!simpleModeEnabled && <ReportsDialog expenses={expenses} />}
        {onImportCSV && (
          <>
            <Button 
              variant="outline" 
              className="gap-2 rounded-xl"
              onClick={() => setImportOpen(true)}
            >
              <FileSpreadsheet className="w-4 h-4" />
              {t('import.title', 'Uvoz izvoda')}
            </Button>
            <CSVImportDialog
              onImport={onImportCSV}
              findDuplicates={findDuplicates}
              existingExpenses={existingExpenses}
              externalOpen={importOpen}
              onExternalOpenChange={setImportOpen}
            />
          </>
        )}
        <AddExpenseDialog onAdd={onAddExpense} checkDuplicate={onCheckDuplicate} />
      </div>
    </header>
  );
};
