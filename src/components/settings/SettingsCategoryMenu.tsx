import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMailImportAccess } from '@/hooks/useMailImportAccess';
import {
  visibleSettingsCategories,
  type SettingsCategoryId,
} from './settingsCategories';

interface SettingsCategoryMenuProps {
  onSelect: (id: SettingsCategoryId) => void;
}

/**
 * Predvorje postavki — kratki izbornik kategorija u postojećem rukopisu
 * aplikacije (ikona u obojenom krugu + naziv + kratak opis).
 */
export const SettingsCategoryMenu = ({ onSelect }: SettingsCategoryMenuProps) => {
  const { t } = useTranslation();
  const { hasAccess } = useMailImportAccess();
  const categories = visibleSettingsCategories(hasAccess);

  return (
    <div className="space-y-2 py-2" data-testid="settings-category-menu">
      {categories.map((category) => {
        const Icon = category.icon;
        return (
          <button
            key={category.id}
            type="button"
            data-testid={`settings-category-${category.id}`}
            onClick={() => onSelect(category.id)}
            className="w-full min-h-[44px] flex items-center justify-between p-3 bg-muted/30 rounded-xl hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium">{t(category.titleKey, category.titleFallback)}</p>
                <p className="text-xs text-muted-foreground">{t(category.descKey, category.descFallback)}</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </button>
        );
      })}
    </div>
  );
};
