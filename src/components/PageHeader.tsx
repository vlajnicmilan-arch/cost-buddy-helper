import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useStorage } from '@/contexts/StorageContext';
import { NotificationsDropdown } from '@/components/NotificationsDropdown';
import { SettingsDialog } from '@/components/SettingsDialog';
import { TutorialButton } from '@/components/tutorial';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { LogOut, Smartphone, Cloud } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import logo from '@/assets/logo.png';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  onDataImported?: () => void;
}

export const PageHeader = ({ title, subtitle, onDataImported }: PageHeaderProps) => {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const { storageMode } = useStorage();
  const navigate = useNavigate();
  const isLocalMode = storageMode === 'local';

  const handleSignOut = async () => {
    if (isLocalMode) {
      navigate('/setup');
    } else {
      try {
        await signOut();
      } catch (error) {
        console.error('Sign out error:', error);
      } finally {
        navigate('/auth');
      }
    }
  };

  return (
    <header className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0">
          <img src={logo} alt="V&M Balance" className="w-full h-full scale-[1.8] object-cover" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">{title}</h1>
          {subtitle && (
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-sm text-muted-foreground">{subtitle}</p>
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
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 sm:gap-2">
        <TutorialButton className="rounded-xl h-9 w-9" />
        {!isLocalMode && <NotificationsDropdown />}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <SettingsDialog onDataImported={onDataImported} />
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
            onClick={handleSignOut}
            className="rounded-xl h-9 w-9"
          >
            <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
          </Button>
        )}
      </div>
    </header>
  );
};
