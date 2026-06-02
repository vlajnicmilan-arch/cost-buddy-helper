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
import logo from '@/assets/logo.webp';

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
        // Preserve non-user-specific settings. Faza 1 modularnog UI-a:
        // sinkronizirano s HomeHeader-om, uključujući `projects_module_enabled`.
        const theme = localStorage.getItem('theme');
        const storageConfig = localStorage.getItem('finmate-storage-config');
        const aiAssistant = localStorage.getItem('ai_assistant_enabled');
        const simpleMode = localStorage.getItem('simple_mode_enabled');
        const familyMode = localStorage.getItem('family_mode_enabled');
        const businessMode = localStorage.getItem('business_mode_enabled');
        const businessFeature = localStorage.getItem('business_feature_enabled');
        const projectsModule = localStorage.getItem('projects_module_enabled');
        localStorage.clear();
        if (theme) localStorage.setItem('theme', theme);
        if (storageConfig) localStorage.setItem('finmate-storage-config', storageConfig);
        if (aiAssistant) localStorage.setItem('ai_assistant_enabled', aiAssistant);
        if (simpleMode) localStorage.setItem('simple_mode_enabled', simpleMode);
        if (familyMode) localStorage.setItem('family_mode_enabled', familyMode);
        if (businessMode) localStorage.setItem('business_mode_enabled', businessMode);
        if (businessFeature) localStorage.setItem('business_feature_enabled', businessFeature);
        if (projectsModule) localStorage.setItem('projects_module_enabled', projectsModule);
        navigate('/');
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
