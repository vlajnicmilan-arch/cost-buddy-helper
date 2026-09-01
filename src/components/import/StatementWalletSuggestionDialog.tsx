/**
 * PITANJE O PREPOZNATOM RAČUNU — ručni uvoz izvoda s diska.
 *
 * Uvoz nastavlja bez pitanja samo kad je pripadnost POTVRĐENA. Ishodi:
 *  - `own_report`:  datoteka je izvještaj iz same aplikacije (Centar),
 *                   a ne bankovni izvod — samo prekid, bez "ipak uvezi"
 *  - `switch`:      izvod je prepoznat kao drugi novčanik od odabranog
 *  - `unconfirmed`: ništa nije prepoznato — korisnik potvrđuje ili prekida;
 *                   uz IBAN bez upisanog identiteta nudi se i spremanje
 *  - `save`:        (zadržano) nudi se da se IBAN zapamti na novčaniku
 *
 * Ništa se ne pamti bez izričitog odgovora korisnika.
 */
import { Landmark, FileWarning, HelpCircle } from 'lucide-react';
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
    }
  | {
      kind: 'own_report';
      selectedName: string;
    }
  | {
      kind: 'unconfirmed';
      /** IBAN/broj računa s dokumenta, ili '' kad ga nema. */
      statementIdentifier: string;
      selectedName: string;
      detectedBank?: string | null;
      holderName?: string | null;
      rowCount: number;
      /** Smije li se ponuditi "Spremi ovaj broj računa na …". */
      canSaveIdentifier: boolean;
      /** Ništa se nije uspjelo pročitati s dokumenta (nema banke ni računa). */
      noReadInfo?: boolean;
    };

interface Props {
  question: StatementWalletQuestion;
  /** „Prebaci na …" / „Spremi na novčanik" / „Ipak uvezi u …" */
  onAccept: () => void;
  /** „Ipak uvezi u …" / „Ne spremaj" */
  onDecline: () => void;
  /** Samo za `unconfirmed`: spremi IBAN na odabrani novčanik i nastavi. */
  onSave?: () => void;
  onCancel: () => void;
}

export const StatementWalletSuggestionDialog = ({
  question,
  onAccept,
  onDecline,
  onSave,
  onCancel,
}: Props) => {
  const { t } = useTranslation();

  // 1. VLASTITI IZVJEŠTAJ — ispis same aplikacije; jedini izlaz je prekid.
  if (question.kind === 'own_report') {
    return (
      <div
        role="dialog"
        aria-modal="true"
        data-testid="statement-wallet-suggestion"
        className="fixed inset-0 z-[95] bg-background/90 backdrop-blur-sm p-3 sm:p-6 flex items-center justify-center"
      >
        <div className="w-full max-w-md rounded-xl border border-border/50 bg-background shadow-2xl p-4 space-y-3">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <FileWarning className="h-5 w-5 text-destructive shrink-0" />
            {t('import.walletSuggestion.ownReportTitle', 'Ovo je izvještaj iz aplikacije Centar')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t(
              'import.walletSuggestion.ownReportBody',
              'Ova datoteka je izvještaj iz aplikacije Centar, a ne bankovni izvod. Ti podaci već jesu u aplikaciji — uvoz bi ih udvostručio, pa nije dopušten.',
            )}
          </p>
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
    );
  }

  // 4. NEPOTVRĐENO — ništa nije prepoznato; korisnik odlučuje.
  if (question.kind === 'unconfirmed') {
    const identity = question.statementIdentifier
      ? maskAccountIdentity(question.statementIdentifier)
      : null;
    return (
      <div
        role="dialog"
        aria-modal="true"
        data-testid="statement-wallet-suggestion"
        className="fixed inset-0 z-[95] bg-background/90 backdrop-blur-sm p-3 sm:p-6 flex items-center justify-center"
      >
        <div className="w-full max-w-md rounded-xl border border-border/50 bg-background shadow-2xl p-4 space-y-3">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <HelpCircle className="h-5 w-5 text-primary shrink-0" />
            {t('import.walletSuggestion.unconfirmedTitle', 'Ne mogu potvrditi pripadnost izvoda')}
          </h2>

          <p className="text-sm text-muted-foreground">
            {t(
              'import.walletSuggestion.unconfirmedBody',
              'Ne mogu potvrditi da ovaj izvod pripada odabranom novčaniku. S dokumenta sam pročitao:',
            )}
          </p>

          <div className="space-y-1 text-sm">
            {question.detectedBank && (
              <p data-testid="suggestion-bank" className="break-all">
                🏦 {question.detectedBank}
              </p>
            )}
            {identity && (
              <p data-testid="suggestion-identity" className="font-mono break-all">
                {identity}
              </p>
            )}
            {question.holderName && (
              <p data-testid="suggestion-holder" className="break-all">
                👤 {question.holderName}
              </p>
            )}
            <p data-testid="suggestion-rows" className="text-muted-foreground">
              {t('import.walletSuggestion.unconfirmedRows', 'Redaka za uvoz: {{count}}', {
                count: question.rowCount,
              })}
            </p>
            <p className="pt-2 text-muted-foreground">
              {t('import.walletSuggestion.selected', 'Odabrani novčanik')}
            </p>
            <p className="break-all">{question.selectedName}</p>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              className="min-h-11 flex-1"
              data-testid="suggestion-accept"
              onClick={onAccept}
            >
              {t('import.walletSuggestion.keep', 'Ipak uvezi u {{name}}', {
                name: question.selectedName,
              })}
            </Button>
            {question.canSaveIdentifier && question.statementIdentifier && onSave && (
              <Button
                variant="outline"
                className="min-h-11 flex-1"
                data-testid="suggestion-save"
                onClick={onSave}
              >
                {t('import.walletSuggestion.saveIdentifier', 'Spremi ovaj broj računa na {{name}}', {
                  name: question.selectedName,
                })}
              </Button>
            )}
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
  }

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
