import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { MoneyInput } from '@/components/ui/money-input';
import { Loader2 } from 'lucide-react';
import {
  buildAddPersonPlan,
  inheritedDefaults,
  POSITION_SUGGESTION_KEYS,
  type PersonProjectSelection,
} from '@/lib/addPersonPlan';

export interface AddPersonSubmit {
  firstName: string;
  lastName: string;
  selections: PersonProjectSelection[];
}

interface AddPersonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: { id: string; name: string }[];
  saving?: boolean;
  onSubmit: (data: AddPersonSubmit) => void | Promise<void>;
}

/**
 * "+ Osoba" from the top-level "Ljudi" list: creates one person and one
 * engagement per selected project. Access rights (Članovi) are deliberately
 * out of scope here — this form only describes work on site.
 */
export const AddPersonDialog = ({
  open,
  onOpenChange,
  projects,
  saving = false,
  onSubmit,
}: AddPersonDialogProps) => {
  const { t } = useTranslation();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [selections, setSelections] = useState<PersonProjectSelection[]>([]);

  useEffect(() => {
    if (!open) return;
    setFirstName('');
    setLastName('');
    setSelections([]);
  }, [open]);

  const positionOptions = useMemo(
    () =>
      POSITION_SUGGESTION_KEYS.map((k) =>
        t(`people.add.positions.${k}`, { defaultValue: k }),
      ),
    [t],
  );

  const toggleProject = (projectId: string, checked: boolean) => {
    setSelections((prev) => {
      if (!checked) return prev.filter((s) => s.projectId !== projectId);
      if (prev.some((s) => s.projectId === projectId)) return prev;
      const defaults = inheritedDefaults(prev);
      return [...prev, { projectId, ...defaults }];
    });
  };

  const updateSelection = (projectId: string, patch: Partial<PersonProjectSelection>) => {
    setSelections((prev) => prev.map((s) => (s.projectId === projectId ? { ...s, ...patch } : s)));
  };

  const plan = buildAddPersonPlan({ firstName, lastName, selections });

  const handleSave = async () => {
    if (!plan.valid || saving) return;
    await onSubmit({ firstName: plan.firstName, lastName: plan.lastName, selections });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('people.add.title', 'Nova osoba')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="person-first">{t('people.add.firstName', 'Ime')}</Label>
              <Input
                id="person-first"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="min-h-[44px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="person-last">{t('people.add.lastName', 'Prezime')}</Label>
              <Input
                id="person-last"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="min-h-[44px]"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('people.add.projects', 'Projekti')}</Label>
            {projects.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('people.add.noProjects', 'Nema dostupnih projekata')}
              </p>
            ) : (
              <div className="space-y-2">
                {projects.map((p) => {
                  const sel = selections.find((s) => s.projectId === p.id) ?? null;
                  return (
                    <div key={p.id} className="rounded-lg border border-border/50 p-2.5 space-y-2.5">
                      <label className="flex items-center gap-2.5 min-h-[44px] cursor-pointer">
                        <Checkbox
                          checked={!!sel}
                          onCheckedChange={(c) => toggleProject(p.id, c === true)}
                        />
                        <span className="text-sm font-medium truncate">{p.name}</span>
                      </label>

                      {sel && (
                        <div className="space-y-2 pl-7">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">
                                {t('people.add.hourlyRate', 'Satnica')}
                              </Label>
                              <MoneyInput
                                value={sel.hourlyRate}
                                onChange={(e) => updateSelection(p.id, { hourlyRate: e.target.value })}
                                placeholder={t('people.add.hourlyRatePlaceholder', 'npr. 7,00')}
                                className="min-h-[44px]"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">
                                {t('people.add.position', 'Pozicija')}
                              </Label>
                              <Input
                                value={sel.position}
                                onChange={(e) => updateSelection(p.id, { position: e.target.value })}
                                list={`person-positions-${p.id}`}
                                className="min-h-[44px]"
                              />
                              <datalist id={`person-positions-${p.id}`}>
                                {positionOptions.map((o) => (
                                  <option key={o} value={o} />
                                ))}
                              </datalist>
                            </div>
                          </div>
                          {sel.hourlyRate.trim() === '' && (
                            <p className="text-xs text-muted-foreground">
                              {t(
                                'people.add.rateEmptyHint',
                                'Satnica nije upisana — zarada se ne može obračunati dok se ne upiše.',
                              )}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {t(
                'people.add.positionNote',
                'Pozicija opisuje posao na gradilištu. Uloge i prava pristupa dodjeljuju se u Članovima.',
              )}
            </p>
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              className="flex-1 min-h-[44px]"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              {t('common.cancel')}
            </Button>
            <Button className="flex-1 min-h-[44px]" onClick={handleSave} disabled={!plan.valid || saving}>
              {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              {t('common.save')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
