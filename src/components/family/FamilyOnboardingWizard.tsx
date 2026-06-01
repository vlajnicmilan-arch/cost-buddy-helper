import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Circle, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  groupId: string;
  hasSharedResource: boolean;
  hasInvitedMember: boolean;
  hasSharedGoal: boolean;
  onGoToAccounts: () => void;
  onGoToTeam: () => void;
  onGoToSavings: () => void;
}

const dismissKey = (groupId: string) => `family_wizard_dismissed_${groupId}`;

export const FamilyOnboardingWizard = ({
  groupId,
  hasSharedResource,
  hasInvitedMember,
  hasSharedGoal,
  onGoToAccounts,
  onGoToTeam,
  onGoToSavings,
}: Props) => {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(localStorage.getItem(dismissKey(groupId)) === '1');
  }, [groupId]);

  const allDone = hasSharedResource && hasInvitedMember && hasSharedGoal;
  if (dismissed || allDone) return null;

  const handleDismiss = () => {
    localStorage.setItem(dismissKey(groupId), '1');
    setDismissed(true);
  };

  const Row = ({
    done,
    label,
    onClick,
  }: {
    done: boolean;
    label: string;
    onClick: () => void;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={done}
      className="w-full flex items-center gap-3 p-3 rounded-lg bg-background/60 hover:bg-background transition-colors text-left disabled:opacity-70 disabled:cursor-default min-h-11"
    >
      {done ? (
        <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
      ) : (
        <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
      )}
      <span className={`text-sm flex-1 ${done ? 'line-through text-muted-foreground' : 'font-medium'}`}>
        {label}
      </span>
    </button>
  );

  return (
    <div className="rounded-xl p-4 bg-primary/5 border border-primary/20 space-y-3">
      <div className="flex items-start gap-2">
        <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm">{t('family.wizard.title')}</h3>
          <p className="text-xs text-muted-foreground">{t('family.wizard.subtitle')}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleDismiss}
          className="h-7 w-7 -mr-1 -mt-1"
          aria-label={t('family.wizard.dismiss')}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="space-y-1.5">
        <Row done={hasSharedResource} label={t('family.wizard.step1')} onClick={onGoToAccounts} />
        <Row done={hasInvitedMember} label={t('family.wizard.step2')} onClick={onGoToTeam} />
        <Row done={hasSharedGoal} label={t('family.wizard.step3')} onClick={onGoToSavings} />
      </div>
    </div>
  );
};
