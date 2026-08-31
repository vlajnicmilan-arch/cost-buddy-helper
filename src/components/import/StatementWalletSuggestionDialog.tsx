/**
 * PITANJE O PREPOZNATOM RAČUNU — ručni uvoz izvoda s diska.
 *
 * Dva pitanja, jedno sučelje:
 *  - `switch`: izvod je prepoznat kao drugi novčanik od odabranog
 *  - `save`:   nijedan novčanik nije prepoznat, a odabrani nema upisan
 *              IBAN/broj računa — nudi se da se zapamti na novčaniku
 *
 * Ništa se ne pamti bez izričitog odgovora korisnika.
 */
import { Landmark } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { maskAccountIdentity } from '@/lib/importReview/accountIdentityGuard';

export type StatementWalletQuestion =
  | {
      kind: 'switch';
      statementIdentifier: string;
      selectedName: string;
      suggestedName: string;
    }
  | {
      kind: 'save';
      statementIdentifier: string;
      selectedName: string;
    };

interface Props {
  question: StatementWalletQuestion;
  /** „Prebaci na …" / „Spremi na novčanik" */
  onAccept: () => void;
  /** „Ipak uvezi u …" / „Ne spremaj" */
  onDecline: () => void;
  onCancel: () => void;
}

export const StatementWalletSuggestionDialog = ({
  question,
  onAccept,
  onDecline,
  onCancel,
}: Props) => {
  const { t } = useTranslation();
  const identity = maskAccountIdentity(question.statementIdentifier);

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="statement-wallet-suggestion"
      className="fixed inset-0 z-[95] bg-background/90 backdrop-blur-sm p-3 sm:p-6 flex items-center justify-center"
    >
      <div className="w-full max-w-md rounded-xl border border-border/50 bg-background shadow-2xl p-4 space-y-3">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Landmark className="h-5 w-5 text-primary shrink-0" />
          {question.kind === 'switch'
            ? t('import.walletSuggestion.switchTitle', 'Izvod pripada drugom novčaniku')
            : t('import.walletSuggestion.saveTitle', 'Zapamtiti račun na novčaniku?')}
        </h2>

        <div className="space-y-1 text-sm">
          <p className="text-muted-foreground">
            {t('import.walletSuggestion.statement', 'Izvod glasi na')}
          </p>
          <p data-testid="suggestion-identity" className="font-mono break-all">
            {identity}
          </p>
          <p className="pt-2 text-muted-foreground">
            {t('import.walletSuggestion.selected', 'Odabrani novčanik')}
          </p>
          <p className="break-all">{question.selectedName}</p>
          {question.kind === 'switch' && (
            <>
              <p className="pt-2 text-muted-foreground">
                {t('import.walletSuggestion.recognized', 'Prepoznati novčanik')}
              </p>
              <p data-testid="suggestion-target" className="break-all">
                {question.suggestedName}
              </p>
            </>
          )}
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            className="min-h-11 flex-1"
            data-testid="suggestion-accept"
            onClick={onAccept}
          >
            {question.kind === 'switch'
              ? t('import.walletSuggestion.switchTo', 'Prebaci na {{name}}', {
                  name: question.suggestedName,
                })
              : t('import.walletSuggestion.save', 'Spremi na {{name}}', {
                  name: question.selectedName,
                })}
          </Button>
          <Button
            variant="outline"
            className="min-h-11 flex-1"
            data-testid="suggestion-decline"
            onClick={onDecline}
          >
            {question.kind === 'switch'
              ? t('import.walletSuggestion.keep', 'Ipak uvezi u {{name}}', {
                  name: question.selectedName,
                })
              : t('import.walletSuggestion.skipSave', 'Ne spremaj')}
          </Button>
          <Button
            variant="ghost"
            className="min-h-11 w-full"
            data-testid="suggestion-cancel"
            onClick={onCancel}
          >
            {t('import.walletSuggestion.cancel', 'Prekini uvoz')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default StatementWalletSuggestionDialog;
