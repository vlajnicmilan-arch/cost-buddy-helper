import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Moon, Sun, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { languages } from '@/i18n';

interface AppearanceSectionProps {
  isDark: boolean;
  onToggleTheme: () => void;
  languageCode: string;
  onLanguageChange: (code: string) => void;
}

export const AppearanceSection = ({
  isDark, onToggleTheme, languageCode, onLanguageChange
}: AppearanceSectionProps) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        {t('settings.appearance', 'Izgled')}
      </h3>
      
      <div className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            {isDark ? <Moon className="w-4 h-4 text-primary" /> : <Sun className="w-4 h-4 text-primary" />}
          </div>
          <div>
            <Label htmlFor="theme-toggle" className="text-sm font-medium cursor-pointer">
              {t('settings.theme', 'Tema')}
            </Label>
            <p className="text-xs text-muted-foreground">
              {isDark ? t('settings.darkMode', 'Tamna tema') : t('settings.lightMode', 'Svijetla tema')}
            </p>
          </div>
        </div>
        <Switch id="theme-toggle" checked={isDark} onCheckedChange={onToggleTheme} />
      </div>

      <div className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Globe className="w-4 h-4 text-primary" />
          </div>
          <div>
            <Label className="text-sm font-medium">
              {t('settings.appLanguage', 'Jezik aplikacije')}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t('settings.appLanguageDesc', 'Odaberi jezik sučelja')}
            </p>
          </div>
        </div>
        <Select value={languageCode} onValueChange={onLanguageChange}>
          <SelectTrigger className="w-[130px] rounded-xl">
            <SelectValue placeholder="Language" />
          </SelectTrigger>
          <SelectContent>
            {languages.map((lang) => (
              <SelectItem key={lang.code} value={lang.code}>
                <span className="flex items-center gap-2">
                  <span>{lang.flag}</span>
                  <span>{lang.name}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};
