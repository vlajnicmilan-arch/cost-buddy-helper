import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useFamilySplitSuggestion } from '@/hooks/useFamilySplitSuggestion';
import { useFamilySplitSettings } from '@/hooks/useFamilySplitSettings';
import type { FamilySplitMode } from '@/lib/familySplitSuggestion';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { clickableProps } from '@/lib/a11y';

interface Props {
  groupId: string;
  currentMode: FamilySplitMode;
  isOwner: boolean;
  onSwitchTab?: (tab: 'settings') => void;
}

const DISMISS_KEY_PREFIX = 'family_split_suggestion_dismissed_';
const DISMISS_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 dana

function isDismissed(groupId: string, reason: string): boolean {
  try {
    const raw = localStorage.getItem(`${DISMISS_KEY_PREFIX}${groupId}`);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { reason: string; at: number };
    if (parsed.reason !== reason) return false;
    return Date.now() - parsed.at < DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

function persistDismiss(groupId: string, reason: string) {
  try {
    localStorage.setItem(
      `${DISMISS_KEY_PREFIX}${groupId}`,
      JSON.stringify({ reason, at: Date.now() }),
    );
  } catch {
    // ignore quota
  }
}

export function SplitModeSuggestionBanner({
  groupId,
  currentMode,
  isOwner,
  onSwitchTab,
}: Props) {
  const { t } = useTranslation();
  const { result, loading } = useFamilySplitSuggestion({ groupId, currentMode });
  const { save: saveSettings } = useFamilySplitSettings(groupId);
  const [dismissedTick, setDismissedTick] = useState(0);
  const [applying, setApplying] = useState(false);

  const visible = useMemo(() => {
    if (loading || !result || !result.suggestedMode) return false;
    if (isDismissed(groupId, result.reason)) return false;
    return true;
  }, [loading, result, groupId, dismissedTick]);

  if (!visible || !result || !result.suggestedMode) return null;

  const handleApply = async () => {
    if (!isOwner) {
      onSwitchTab?.('settings');
      return;
    }
    setApplying(true);
    try {
      await saveSettings({ split_mode: result.suggestedMode! });
      showSuccess(t('family.split.suggestion.applied'));
      persistDismiss(groupId, result.reason);
      setDismissedTick((x) => x + 1);
    } catch (e: any) {
      showError(e?.message || t('family.split.suggestion.applyFailed'));
    } finally {
      setApplying(false);
    }
  };

  const handleDismiss = () => {
    persistDismiss(groupId, result.reason);
    setDismissedTick((x) => x + 1);
  };

  const title = t(`family.split.suggestion.title_${result.suggestedMode}`);
  const description = t(
    result.suggestedMode === 'proportional_income'
      ? 'family.split.suggestion.descToProportional'
      : 'family.split.suggestion.descToEqual',
    { gini: Math.round(result.gini * 100) },
  );

  return (
    <section className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-sm text-foreground">{title}</h3>
            <Badge variant="secondary" className="text-[10px] h-5">
              {t('family.split.suggestion.basedOn', {
                periods: result.periodsAnalyzed,
              })}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-snug">
            {description}
          </p>
        </div>
        <div
          {...clickableProps(handleDismiss)}
          aria-label={t('common.dismiss', 'Odbaci')}
          className="text-muted-foreground hover:text-foreground p-1 -m-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-3.5 w-3.5" />
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          onClick={handleApply}
          size="sm"
          disabled={applying}
          className="flex-1 h-9"
        >
          {isOwner
            ? t(`family.split.suggestion.applyButton_${result.suggestedMode}`)
            : t('family.split.suggestion.openSettings')}
        </Button>
      </div>
    </section>
  );
}
