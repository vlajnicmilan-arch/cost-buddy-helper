import { useState } from 'react';
import type { FindPdfDuplicatesHandler } from '@/contexts/PdfImportContext';
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
import { useAppState } from '@/contexts/AppStateContext';

import { CSVImportDialog } from '@/components/CSVImportDialog';
import { GlobalSearch } from '@/components/GlobalSearch';
import logo from '@/assets/logo.webp';
import { Expense, ReceiptItem } from '@/types/expense';
import { ParsedTransaction } from '@/lib/csvParsers';

interface HomeHeaderProps {
  displayName: string;
  isLocalMode: boolean;
  expenses: Expense[];
  reportsExpenses: Expense[];
  allExpenses: Expense[];
  onAddExpense: (expense: Omit<Expense, 'id' | 'user_id' | 'created_at' | 'updated_at'>, items?: ReceiptItem[], isPendingMemberTransaction?: boolean) => Promise<void> | void;
  onCheckDuplicate?: (transaction: { amount: number; description: string; date: Date; type: string; category?: string; merchant_name?: string }) => Expense | null;
  onBulkUpdateExpenses: (expenses: Expense[]) => Promise<any>;
  onImportCSV?: (transactions: ParsedTransaction[]) => Promise<void>;
  findDuplicates?: FindPdfDuplicatesHandler;
  existingExpenses?: Expense[];
  onRefetch: () => void;
  onSelectExpense?: (expense: Expense) => void;
  searchPaymentSources?: { id: string; name: string; cards?: { id: string; last_four_digits?: string | null }[] }[];
  searchProjects?: { id: string; name: string }[];
  searchBudgets?: { id: string; name: string }[];
  searchCustomCategories?: { id: string; name: string }[];
}

export const HomeHeader = ({
  displayName,
  isLocalMode,
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
  searchPaymentSources,
  searchProjects,
  searchBudgets,
  searchCustomCategories,
}: HomeHeaderProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { activeBusinessProfileId } = useAppState();
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
      // Sign-out preserve: keep non-user-specific local prefs (themes, modul flagovi
      // i pohrana). Faza 1 modularnog UI-a dodaje `projects_module_enabled`.
      const theme = localStorage.getItem('theme');
      const storageConfig = localStorage.getItem('finmate-storage-config');
      const aiAssistant = localStorage.getItem('ai_assistant_enabled');
      const krugMode = localStorage.getItem('krug_mode_enabled');
      const businessMode = localStorage.getItem('business_mode_enabled');
      const businessFeature = localStorage.getItem('business_feature_enabled');
      const projectsModule = localStorage.getItem('projects_module_enabled');
      localStorage.clear();
      if (theme) localStorage.setItem('theme', theme);
      if (storageConfig) localStorage.setItem('finmate-storage-config', storageConfig);
      if (aiAssistant) localStorage.setItem('ai_assistant_enabled', aiAssistant);
      if (krugMode) localStorage.setItem('krug_mode_enabled', krugMode);
      if (businessMode) localStorage.setItem('business_mode_enabled', businessMode);
      if (businessFeature) localStorage.setItem('business_feature_enabled', businessFeature);
      if (projectsModule) localStorage.setItem('projects_module_enabled', projectsModule);
      navigate('/');
    }
  };

  return (
    <header className="flex flex-col gap-3 mb-4 sm:mb-6" data-tutorial="header">
      {/* Top row: Logo, title, and navigation icons */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <div className="w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-xl overflow-hidden flex-shrink-0">
            <img src={logo} alt="Centar" className="w-full h-full object-contain" width={72} height={72} fetchPriority="high" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-3xl font-bold text-foreground tracking-tight truncate">
              {displayName ? t('common.greeting', 'Bok, {{name}}!').replace('{{name}}', displayName) : 'Centar'}
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
          <GlobalSearch
            expenses={allExpenses}
            onSelectExpense={onSelectExpense}
            alwaysExpanded
            paymentSources={searchPaymentSources}
            projects={searchProjects}
            budgets={searchBudgets}
            customCategories={searchCustomCategories}
          />
        </div>
      )}

      {/* Bottom row: Action buttons — equal width grid */}
      <div
        className="grid grid-cols-3 gap-2"
        data-tutorial="add-buttons"
      >
        <ReportsDialog expenses={reportsExpenses} triggerClassName="w-full h-11 justify-center" />
        <ScanTriggerButton
          businessProfileId={activeBusinessProfileId}
          triggerLabel={t('common.scan', 'Skeniraj')}
          triggerClassName="w-full h-11 justify-center"
        />
        <ManualAddTriggerButton
          businessProfileId={activeBusinessProfileId}
          triggerClassName="w-full h-11 justify-center"
        />
      </div>
    </header>
  );
};
