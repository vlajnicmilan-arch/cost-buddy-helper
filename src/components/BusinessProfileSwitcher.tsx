import { useState, useEffect, forwardRef } from 'react';
import { Building2, ChevronDown, User } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAppState } from '@/contexts/AppStateContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface BusinessProfile {
  id: string;
  company_name: string;
  legal_form: string | null;
  is_active: boolean;
}

export const BusinessProfileSwitcher = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { activeBusinessProfileId, setActiveBusinessProfileId, businessModeEnabled } = useAppState();
  const [profiles, setProfiles] = useState<BusinessProfile[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user || !businessModeEnabled) return;
    supabase
      .from('business_profiles')
      .select('id, company_name, legal_form, is_active')
      .eq('user_id', user.id)
      .order('is_active', { ascending: false })
      .then(({ data }) => {
        if (data) setProfiles(data);
      });
  }, [user, businessModeEnabled]);

  if (!businessModeEnabled || profiles.length === 0) return null;

  const activeProfile = profiles.find(p => p.id === activeBusinessProfileId);
  const isBusinessMode = !!activeBusinessProfileId;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
            isBusinessMode
              ? 'bg-primary/10 text-primary border border-primary/20'
              : 'bg-muted/50 text-muted-foreground hover:bg-muted'
          )}
        >
          {isBusinessMode ? (
            <>
              <Building2 className="w-3 h-3" />
              <span className="max-w-[120px] truncate">{activeProfile?.company_name}</span>
            </>
          ) : (
            <>
              <User className="w-3 h-3" />
              {t('business.personal', 'Osobno')}
            </>
          )}
          <ChevronDown className="w-3 h-3 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1.5" align="start">
        <button
          className={cn(
            'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
            !isBusinessMode ? 'bg-muted font-medium' : 'hover:bg-muted/50'
          )}
          onClick={() => { setActiveBusinessProfileId(null); setOpen(false); }}
        >
          <User className="w-4 h-4" />
          {t('business.personal', 'Osobno')}
        </button>
        <div className="my-1 border-t border-border" />
        {profiles.map(p => (
          <button
            key={p.id}
            className={cn(
              'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
              activeBusinessProfileId === p.id ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted/50'
            )}
            onClick={() => { setActiveBusinessProfileId(p.id); setOpen(false); }}
          >
            <Building2 className="w-4 h-4" />
            <span className="truncate">{p.company_name}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
};
