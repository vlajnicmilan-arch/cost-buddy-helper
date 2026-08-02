/**
 * MilestoneSelectRow — izbor faze odmah uz odabir projekta.
 *
 * Faza je NAMJERNO preskočiva: dio troškova (gorivo, opći materijal, sitni
 * alat) ne pripada nijednoj fazi, a kriva faza kvari usporedbu planiranog i
 * stvarnog troška više nego prazna. Zato "Bez faze" ostaje default.
 *
 * Komponenta je čisti prikaz + dohvat faza odabranog projekta; ne dira
 * write-logiku (roditelj šalje `milestone_id` u payload).
 */
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Milestone } from 'lucide-react';
import { useProjectMilestones } from '@/hooks/useProjectMilestones';

interface MilestoneSelectRowProps {
  projectId: string | null;
  value: string | null;
  onChange: (id: string | null) => void;
}

export const MilestoneSelectRow = ({ projectId, value, onChange }: MilestoneSelectRowProps) => {
  const { t } = useTranslation();
  const { milestones } = useProjectMilestones(projectId);

  if (!projectId || milestones.length === 0) return null;

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2 text-sm font-medium">
        <Milestone className="w-4 h-4" />
        {t('transactions.assignToMilestone', 'Pridruži fazi')}
        <span className="text-xs font-normal text-muted-foreground">
          {t('common.optional', 'neobavezno')}
        </span>
      </Label>
      <Select
        value={value || 'none'}
        onValueChange={(v) => onChange(v === 'none' ? null : v)}
      >
        <SelectTrigger data-testid="milestone-select">
          <SelectValue placeholder={t('transactions.noMilestone', 'Bez faze')} />
        </SelectTrigger>
        <SelectContent className="bg-popover z-[70]">
          <SelectItem value="none">
            <span className="text-muted-foreground">{t('transactions.noMilestone', 'Bez faze')}</span>
          </SelectItem>
          {milestones.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
