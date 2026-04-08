import { useState, useEffect } from 'react';
import { Settings2, Loader2, Check, Palette } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useAppState } from '@/contexts/AppStateContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { useTranslation } from 'react-i18next';
import {
  INDUSTRIES, MODULES, getIndustry, getDefaultModules, getAvailableModules,
  type IndustryType, type ModuleId,
} from '@/lib/businessModules';

export type BusinessTheme = 'ocean-blue' | 'emerald' | 'indigo' | 'crimson' | 'amber' | 'slate' | 'teal';

const THEME_DESCRIPTION_KEYS: Record<BusinessTheme, string> = {
  'ocean-blue': 'businessModules.themeOceanBlue',
  'emerald': 'businessModules.themeEmerald',
  'indigo': 'businessModules.themeIndigo',
  'crimson': 'businessModules.themeCrimson',
  'amber': 'businessModules.themeAmber',
  'slate': 'businessModules.themeSlate',
  'teal': 'businessModules.themeTeal',
};

const BUSINESS_THEMES: { id: BusinessTheme; label: string; previewColor: string }[] = [
  { id: 'ocean-blue', label: 'Ocean Blue', previewColor: 'hsl(220 70% 50%)' },
  { id: 'emerald', label: 'Emerald', previewColor: 'hsl(160 84% 39%)' },
  { id: 'indigo', label: 'Indigo', previewColor: 'hsl(239 84% 67%)' },
  { id: 'crimson', label: 'Crimson', previewColor: 'hsl(0 72% 51%)' },
  { id: 'amber', label: 'Amber', previewColor: 'hsl(38 92% 50%)' },
  { id: 'slate', label: 'Slate', previewColor: 'hsl(215 25% 27%)' },
  { id: 'teal', label: 'Teal', previewColor: 'hsl(174 72% 40%)' },
];

export const BusinessModuleSettings = () => {
  const { t } = useTranslation();
  const { activeBusinessProfileId } = useAppState();
  const { user } = useAuth();
  const [industryType, setIndustryType] = useState<IndustryType>('other');
  const [enabledModules, setEnabledModules] = useState<ModuleId[]>([]);
  const [themeColor, setThemeColor] = useState<BusinessTheme>('ocean-blue');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!activeBusinessProfileId || !user) return;
    setLoading(true);
    supabase
      .from('business_profiles')
      .select('industry_type, enabled_modules, theme_color')
      .eq('id', activeBusinessProfileId)
      .single()
      .then(({ data }) => {
        if (data) {
          const it = (data as any).industry_type as IndustryType || 'other';
          const em = (data as any).enabled_modules as string[] || [];
          const tc = (data as any).theme_color as BusinessTheme || 'ocean-blue';
          setIndustryType(it);
          setEnabledModules(em.length > 0 ? em as ModuleId[] : getDefaultModules(it));
          setThemeColor(tc);
        }
        setLoading(false);
      });
  }, [activeBusinessProfileId, user]);

  const handleIndustryChange = (id: IndustryType) => {
    setIndustryType(id);
    setEnabledModules(getDefaultModules(id));
  };

  const toggleModule = (moduleId: ModuleId) => {
    setEnabledModules(prev =>
      prev.includes(moduleId) ? prev.filter(m => m !== moduleId) : [...prev, moduleId]
    );
  };

  const handleSave = async () => {
    if (!activeBusinessProfileId) return;
    setSaving(true);
    const { error } = await supabase
      .from('business_profiles')
      .update({
        industry_type: industryType,
        enabled_modules: enabledModules,
        theme_color: themeColor,
      } as any)
      .eq('id', activeBusinessProfileId);

    setSaving(false);
    if (error) {
      showError(t('businessModules.saveError'));
    } else {
      showSuccess(t('businessModules.saved'));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const availableModules = getAvailableModules(industryType);
  const industry = getIndustry(industryType);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Settings2 className="w-5 h-5 text-primary" />
        <h2 className="text-base font-bold">{t('businessModules.title')}</h2>
      </div>

      {/* Theme Color Selection */}
      <Card className="border-none shadow-sm">
        <CardHeader className="p-3 pb-1">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Palette className="w-3.5 h-3.5" />
            {t('businessModules.themeColor')}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-2">
          <div className="grid grid-cols-2 gap-2">
            {BUSINESS_THEMES.map(theme => (
              <button
                key={theme.id}
                onClick={() => setThemeColor(theme.id)}
                className={`flex items-center gap-2 p-2.5 rounded-xl border text-left transition-all ${
                  themeColor === theme.id
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                    : 'border-border hover:border-muted-foreground/30 hover:bg-muted/30'
                }`}
              >
                <div
                  className="w-6 h-6 rounded-lg flex-shrink-0 shadow-sm"
                  style={{ backgroundColor: theme.previewColor }}
                />
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{theme.label}</p>
                  <p className="text-[9px] text-muted-foreground truncate">{t(THEME_DESCRIPTION_KEYS[theme.id])}</p>
                </div>
                {themeColor === theme.id && (
                  <Check className="w-3.5 h-3.5 text-primary ml-auto flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Industry Selection */}
      <Card className="border-none shadow-sm">
        <CardHeader className="p-3 pb-1">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('businessModules.selectIndustry')}</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-2">
          <div className="grid grid-cols-2 gap-2">
            {INDUSTRIES.map(ind => (
              <button
                key={ind.id}
                onClick={() => handleIndustryChange(ind.id)}
                className={`flex items-center gap-2 p-2.5 rounded-xl border text-left transition-all ${
                  industryType === ind.id
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                    : 'border-border hover:border-muted-foreground/30 hover:bg-muted/30'
                }`}
              >
                <span className="text-lg">{ind.icon}</span>
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{ind.label}</p>
                </div>
                {industryType === ind.id && (
                  <Check className="w-3.5 h-3.5 text-primary ml-auto flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Module Toggles */}
      <Card className="border-none shadow-sm">
        <CardHeader className="p-3 pb-1">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('businessModules.activeModules')}</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-2 space-y-2">
          {MODULES.filter(m => availableModules.includes(m.id)).map(mod => {
            const isRecommended = industry.recommended.includes(mod.id);
            return (
              <div
                key={mod.id}
                className="flex items-center gap-3 p-2.5 rounded-xl border border-border"
              >
                <span className="text-lg">{mod.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-medium">{mod.label}</p>
                    {isRecommended && (
                      <Badge variant="outline" className="text-[8px] px-1 py-0 border-primary/30 text-primary">
                        {t('businessModules.recommended')}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground">{mod.description}</p>
                </div>
                <Switch
                  checked={enabledModules.includes(mod.id)}
                  onCheckedChange={() => toggleModule(mod.id)}
                />
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Recommended Categories */}
      {industry.categories.length > 0 && (
        <Card className="border-none shadow-sm">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('businessModules.recommendedCategories')}</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-2">
            <div className="flex flex-wrap gap-1.5">
              {industry.categories.map(cat => (
                <Badge key={cat} variant="secondary" className="text-[10px] font-normal">
                  {cat}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Button className="w-full gap-2" onClick={handleSave} disabled={saving}>
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        {t('businessModules.saveSettings')}
      </Button>
    </div>
  );
};
