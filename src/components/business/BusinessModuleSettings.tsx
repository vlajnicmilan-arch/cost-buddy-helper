import { useState, useEffect } from 'react';
import { Settings2, Loader2, Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useAppState } from '@/contexts/AppStateContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  INDUSTRIES, MODULES, getIndustry, getDefaultModules, getAvailableModules,
  type IndustryType, type ModuleId,
} from '@/lib/businessModules';

export const BusinessModuleSettings = () => {
  const { activeBusinessProfileId } = useAppState();
  const { user } = useAuth();
  const [industryType, setIndustryType] = useState<IndustryType>('other');
  const [enabledModules, setEnabledModules] = useState<ModuleId[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!activeBusinessProfileId || !user) return;
    setLoading(true);
    supabase
      .from('business_profiles')
      .select('industry_type, enabled_modules')
      .eq('id', activeBusinessProfileId)
      .single()
      .then(({ data }) => {
        if (data) {
          const it = (data as any).industry_type as IndustryType || 'other';
          const em = (data as any).enabled_modules as string[] || [];
          setIndustryType(it);
          setEnabledModules(em.length > 0 ? em as ModuleId[] : getDefaultModules(it));
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
      } as any)
      .eq('id', activeBusinessProfileId);

    setSaving(false);
    if (error) {
      toast.error('Greška pri spremanju postavki');
    } else {
      toast.success('Moduli i djelatnost spremljeni');
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
        <h2 className="text-base font-bold">Djelatnost i moduli</h2>
      </div>

      {/* Industry Selection */}
      <Card className="border-none shadow-sm">
        <CardHeader className="p-3 pb-1">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Odaberite djelatnost</CardTitle>
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
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Aktivni moduli</CardTitle>
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
                        Preporučeno
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
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Preporučene kategorije troškova</CardTitle>
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
        Spremi postavke
      </Button>
    </div>
  );
};
