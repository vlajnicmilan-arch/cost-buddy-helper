/**
 * CreateKrugDialog — minimalni 3-step wizard za novi Krug.
 *
 * Koraci:
 *   1. naziv (slobodan tekst, ≥2 char)
 *   2. preset (3 opcije iz `KRUG_PRESETS`; ostali enum valueovi nisu izloženi)
 *   3. potvrda → INSERT u `public.krug` (trigger bootstrap-a ownership + membership='punopravni')
 *
 * Po uspjehu poziva `onCreated(krugId)`; pozivajući ekran je odgovoran za redirect.
 *
 * Ne uvodi novu semantiku: koristi RLS `krug_insert_authenticated` i postojeći
 * `krug_bootstrap_creator` trigger; svjesno NE generiramo članove iznad creatora.
 */
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Check, ChevronLeft, Users, Heart, Home as HomeIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { showError } from '@/hooks/useStatusFeedback';
import { KRUG_PRESETS, type KrugPresetUiKey } from '@/lib/krugPresets';
import { useModuleGate } from '@/hooks/useModuleGate';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { formatErrorForUser } from '@/lib/errorMessages';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (krugId: string) => void;
}

const STEPS: Array<'name' | 'preset' | 'confirm'> = ['name', 'preset', 'confirm'];

const PRESET_ICON: Record<KrugPresetUiKey, JSX.Element> = {
  partner: <Heart className="w-5 h-5" />,
  su_roditelj: <Users className="w-5 h-5" />,
  cimer: <HomeIcon className="w-5 h-5" />,
};

export function CreateKrugDialog({ open, onOpenChange, onCreated }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { requestModule } = useModuleGate();
  const { hasModuleAccess } = useFeatureAccess();

  const [stepIdx, setStepIdx] = useState(0);
  const [name, setName] = useState('');
  const [preset, setPreset] = useState<KrugPresetUiKey | null>(null);

  useEffect(() => {
    if (open) {
      setStepIdx(0);
      setName('');
      setPreset(null);
    }
  }, [open]);

  const create = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('not_authenticated');
      if (!preset) throw new Error('preset_required');
      const trimmed = name.trim();
      if (trimmed.length < 2) throw new Error('name_too_short');

      const { data, error } = await supabase
        .from('krug')
        .insert({
          name: trimmed,
          preset,
          created_by: user.id,
        })
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data?.id) throw new Error('insert_returned_no_row');
      return data.id as string;
    },
    onSuccess: (krugId) => {
      qc.invalidateQueries({ queryKey: ['krug', 'my'] });
      onOpenChange(false);
      onCreated(krugId);
    },
    onError: (err: any) => {
      if (!hasModuleAccess('krug')) {
        requestModule('krug');
        return;
      }
      showError(formatErrorForUser(err, (key, defaultOrOpts, opts) => t(key, defaultOrOpts, opts), {
        fallbackText: t('krug.create.error', 'Kreiranje Kruga nije uspjelo. Pokušaj ponovno.'),
      }));
    },
  });

  const step = STEPS[stepIdx];
  const canNext =
    (step === 'name' && name.trim().length >= 2) ||
    (step === 'preset' && !!preset) ||
    step === 'confirm';

  const presetSpec = preset ? KRUG_PRESETS.find((p) => p.key === preset) ?? null : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !create.isPending && onOpenChange(o)}>
      <DialogContent className="z-[60] max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {stepIdx > 0 && (
              <button
                type="button"
                onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
                disabled={create.isPending}
                className="p-1 -ml-1 rounded hover:bg-accent"
                aria-label={t('common.back', 'Natrag')}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            {t('krug.create.title', 'Novi Krug')}
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              {stepIdx + 1}/{STEPS.length}
            </span>
          </DialogTitle>
        </DialogHeader>

        {step === 'name' && (
          <div className="space-y-2">
            <Label htmlFor="krug-name">{t('krug.create.nameLabel', 'Naziv Kruga')}</Label>
            <Input
              id="krug-name"
              autoFocus
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('krug.create.namePlaceholder', 'npr. Naš dom')}
            />
            <p className="text-xs text-muted-foreground">
              {t('krug.create.nameHint', 'Min 2 znaka. Naziv vidi cijeli Krug.')}
            </p>
          </div>
        )}

        {step === 'preset' && (
          <div className="space-y-2">
            <Label>{t('krug.create.presetLabel', 'Tip Kruga')}</Label>
            <div className="space-y-2">
              {KRUG_PRESETS.map((spec) => {
                const active = preset === spec.key;
                return (
                  <button
                    key={spec.key}
                    type="button"
                    onClick={() => setPreset(spec.key)}
                    className={cn(
                      'w-full text-left rounded-lg border p-3 flex items-center gap-3 transition-colors',
                      'hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                      active && 'border-primary bg-primary/5',
                    )}
                  >
                    <div
                      className={cn(
                        'w-10 h-10 rounded-md flex items-center justify-center shrink-0',
                        active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {PRESET_ICON[spec.key]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm">
                        {t(spec.i18nKey, spec.key)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t('krug.create.maxPunopravni', 'Maks. punopravnih: {{n}}', {
                          n: spec.maxPunopravni,
                        })}
                      </div>
                    </div>
                    {active && <Check className="w-4 h-4 text-primary" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 'confirm' && presetSpec && (
          <Card className="p-4 space-y-3">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">{t('krug.create.nameLabel', 'Naziv Kruga')}</div>
              <div className="font-medium">{name.trim()}</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">{t('krug.create.presetLabel', 'Tip Kruga')}</div>
              <Badge variant="secondary">
                {t(presetSpec.i18nKey, presetSpec.key)} · {presetSpec.maxPunopravni}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {t(
                'krug.create.confirmHint',
                'Bit ćeš vlasnik Kruga i automatski punopravni član. Tip se kasnije ne mijenja.',
              )}
            </p>
          </Card>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={create.isPending}
          >
            {t('common.cancel', 'Odustani')}
          </Button>
          {step !== 'confirm' ? (
            <Button
              onClick={() => setStepIdx((i) => Math.min(STEPS.length - 1, i + 1))}
              disabled={!canNext}
            >
              {t('common.next', 'Dalje')}
            </Button>
          ) : (
            <Button
              onClick={() => requestModule('krug', { onGranted: () => create.mutate() })}
              disabled={create.isPending}
            >
              {create.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {t('krug.create.submit', 'Kreiraj Krug')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
