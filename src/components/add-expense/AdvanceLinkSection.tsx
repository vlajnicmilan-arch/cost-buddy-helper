/**
 * Section for marking an expense as an advance to a collaborator,
 * or linking unlinked advances to a final invoice.
 * See mem://features/collaborator-advances
 *
 * Renders ONLY when a project is selected.
 */
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, HandCoins, Link2 } from 'lucide-react';
import { useProjectCollaborators } from '@/hooks/useProjectCollaborators';
import { useExpenses } from '@/hooks/useExpenses';
import { getUnlinkedAdvancesFromExpenses } from '@/hooks/useCollaboratorAdvances';
import { useCurrency } from '@/contexts/CurrencyContext';
import { clickableProps } from '@/lib/a11y';

interface Props {
  projectId: string;
  type: 'expense' | 'income' | 'transfer';
  amount: string;
  isAdvance: boolean;
  onIsAdvanceChange: (value: boolean) => void;
  collaboratorId: string | null;
  onCollaboratorIdChange: (value: string | null) => void;
  linkedAdvanceIds: string[];
  onLinkedAdvanceIdsChange: (ids: string[]) => void;
  // Editing mode: exclude this expense id from linked checks (so editing
  // a final invoice still shows its own already-linked advances as available).
  editingExpenseId?: string | null;
}

export const AdvanceLinkSection = ({
  projectId,
  type,
  amount,
  isAdvance,
  onIsAdvanceChange,
  collaboratorId,
  onCollaboratorIdChange,
  linkedAdvanceIds,
  onLinkedAdvanceIdsChange,
  editingExpenseId,
}: Props) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const { collaborators, addCollaborator } = useProjectCollaborators(projectId);
  const { allExpenses } = useExpenses();
  const [showAddNew, setShowAddNew] = useState(false);
  const [newFirst, setNewFirst] = useState('');
  const [newLast, setNewLast] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [saving, setSaving] = useState(false);

  // Compute available unlinked advances for the selected collaborator.
  // Treat the currently-edited invoice as if its linked advances were not linked yet,
  // so they remain selectable.
  const advancesForCollaborator = useMemo(() => {
    if (!collaboratorId) return [];
    const filtered = (allExpenses || []).map(e => {
      if (editingExpenseId && e.id === editingExpenseId) {
        return { ...e, linked_advance_ids: [] };
      }
      return e;
    });
    return getUnlinkedAdvancesFromExpenses(filtered as any, collaboratorId);
  }, [allExpenses, collaboratorId, editingExpenseId]);

  // If user un-selects a collaborator or selects "is advance", reset linked ids.
  const toggleAdvance = (next: boolean) => {
    onIsAdvanceChange(next);
    if (next) {
      onLinkedAdvanceIdsChange([]);
    }
  };

  const toggleLinkedAdvance = (id: string, checked: boolean) => {
    const set = new Set(linkedAdvanceIds);
    if (checked) set.add(id); else set.delete(id);
    onLinkedAdvanceIdsChange(Array.from(set));
  };

  const handleAddCollaborator = async () => {
    if (!newFirst.trim() && !newLast.trim()) return;
    setSaving(true);
    try {
      const created = await addCollaborator({
        first_name: newFirst.trim() || '-',
        last_name: newLast.trim() || '-',
        service_description: newDesc.trim() || t('projects.advances.defaultService', 'Suradnja na projektu'),
        total_price: 0,
        paid_amount: 0,
        status: 'active',
      } as any);
      if (created) {
        onCollaboratorIdChange((created as any).id);
        setShowAddNew(false);
        setNewFirst(''); setNewLast(''); setNewDesc('');
      }
    } finally {
      setSaving(false);
    }
  };

  const linkedSum = useMemo(() => {
    if (linkedAdvanceIds.length === 0) return 0;
    return linkedAdvanceIds.reduce((s, id) => {
      const a = advancesForCollaborator.find(e => e.id === id);
      return a ? s + Number(a.amount || 0) : s;
    }, 0);
  }, [linkedAdvanceIds, advancesForCollaborator]);

  const parsedAmount = parseFloat(amount.replace(',', '.')) || 0;
  const netAfter = Math.max(parsedAmount - linkedSum, 0);
  const surplus = Math.max(linkedSum - parsedAmount, 0);

  // Only meaningful for expense transactions
  if (type !== 'expense') return null;

  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="flex items-center gap-2 text-sm font-medium">
          <HandCoins className="h-4 w-4 text-primary" />
          {t('projects.advances.sectionTitle', 'Avans / suradnik')}
        </Label>
        {isAdvance && (
          <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300">
            {t('projects.advances.advanceBadge', 'Avans')}
          </Badge>
        )}
      </div>

      <div
        className="flex items-start gap-2 cursor-pointer rounded-md p-2 hover:bg-muted/50"
        {...clickableProps(() => toggleAdvance(!isAdvance))}
      >
        <Checkbox
          checked={isAdvance}
          onCheckedChange={(c) => toggleAdvance(c === true)}
          className="mt-0.5"
        />
        <div className="flex-1">
          <div className="text-sm font-medium">
            {t('projects.advances.isAdvance', 'Ovo je avans suradniku')}
          </div>
          <div className="text-xs text-muted-foreground">
            {t('projects.advances.isAdvanceHelp', 'Označi ako se ovaj iznos kasnije oduzima od konačnog računa')}
          </div>
        </div>
      </div>

      {/* Collaborator selector — shown whenever collaborator dimension is needed */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">
          {t('projects.advances.collaborator', 'Suradnik')}
          {!isAdvance && (
            <span className="ml-1 italic">{t('projects.advances.optional', '(opcionalno)')}</span>
          )}
        </Label>
        <div className="flex gap-2">
          <Select
            value={collaboratorId || ''}
            onValueChange={(v) => onCollaboratorIdChange(v || null)}
          >
            <SelectTrigger className="flex-1 h-10">
              <SelectValue placeholder={t('projects.advances.selectCollaborator', 'Odaberi suradnika')} />
            </SelectTrigger>
            <SelectContent className="z-[70]">
              {collaborators.length === 0 && (
                <div className="px-2 py-2 text-xs text-muted-foreground">
                  {t('projects.advances.noCollaborators', 'Nema suradnika u projektu')}
                </div>
              )}
              {collaborators.map(c => (
                <SelectItem key={c.id} value={c.id}>
                  {c.first_name} {c.last_name}
                  {c.company_name ? ` (${c.company_name})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0"
            onClick={() => setShowAddNew(s => !s)}
            aria-label={t('projects.advances.addNewCollaborator', 'Dodaj novog suradnika')}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {showAddNew && (
        <div className="space-y-2 rounded-md border border-dashed border-border/60 bg-background p-3">
          <div className="text-xs font-medium text-muted-foreground">
            {t('projects.advances.newCollaborator', 'Novi suradnik')}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder={t('projects.advances.firstName', 'Ime')}
              value={newFirst}
              onChange={(e) => setNewFirst(e.target.value)}
            />
            <Input
              placeholder={t('projects.advances.lastName', 'Prezime')}
              value={newLast}
              onChange={(e) => setNewLast(e.target.value)}
            />
          </div>
          <Input
            placeholder={t('projects.advances.serviceDescription', 'Opis usluge (npr. parketar)')}
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddNew(false)}>
              {t('common.cancel', 'Odustani')}
            </Button>
            <Button type="button" size="sm" onClick={handleAddCollaborator} disabled={saving}>
              {t('common.save', 'Spremi')}
            </Button>
          </div>
        </div>
      )}

      {/* Link unlinked advances to this final invoice */}
      {!isAdvance && collaboratorId && advancesForCollaborator.length > 0 && (
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Link2 className="h-3.5 w-3.5" />
            {t('projects.advances.unlinkedAdvances', 'Nepovezani avansi za ovog suradnika')}
          </Label>
          <div className="space-y-1.5">
            {advancesForCollaborator.map(adv => {
              const checked = linkedAdvanceIds.includes(adv.id);
              const label = `${formatAmount(Number(adv.amount))} • ${new Date(adv.date as any).toLocaleDateString('hr-HR')}${adv.description ? ` • ${adv.description}` : ''}`;
              return (
                <div
                  key={adv.id}
                  className="flex items-start gap-2 rounded-md bg-background p-2 cursor-pointer hover:bg-muted/40"
                  {...clickableProps(() => toggleLinkedAdvance(adv.id, !checked))}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(c) => toggleLinkedAdvance(adv.id, c === true)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 text-xs">{label}</div>
                </div>
              );
            })}
          </div>

          {linkedAdvanceIds.length > 0 && parsedAmount > 0 && (
            <div className="rounded-md bg-primary/5 px-3 py-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('projects.advances.gross', 'Bruto iznos')}</span>
                <span className="font-medium">{formatAmount(parsedAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('projects.advances.minusAdvances', 'Oduzeti avansi')}</span>
                <span className="font-medium">−{formatAmount(linkedSum)}</span>
              </div>
              <div className="mt-1 flex justify-between border-t border-border/40 pt-1">
                <span className="font-medium">{t('projects.advances.netBooked', 'Neto knjiženo')}</span>
                <span className="font-semibold text-primary">{formatAmount(netAfter)}</span>
              </div>
              {surplus > 0 && (
                <div className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">
                  {t('projects.advances.surplusWarning', 'Avansi premašuju iznos računa za {{amount}} — kreirat će se potraživanje od suradnika.', { amount: formatAmount(surplus) })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!isAdvance && collaboratorId && advancesForCollaborator.length === 0 && (
        <div className="text-xs italic text-muted-foreground">
          {t('projects.advances.noUnlinked', 'Nema nepovezanih avansa za ovog suradnika.')}
        </div>
      )}
    </div>
  );
};
