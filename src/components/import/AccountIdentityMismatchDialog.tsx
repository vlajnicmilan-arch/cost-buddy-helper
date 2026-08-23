/**
 * PITANJE PRI NESLAGANJU IDENTITETA RAČUNA.
 *
 * Uvoz je zaustavljen jer izvod glasi na drugi račun od odredišnog novčanika.
 * Oba identiteta stoje jedan ispod drugog. Nastavak je moguć samo kao svjesna
 * korisnikova potvrda — i nigdje se ne pamti kao pravilo.
 */
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { maskAccountIdentity } from '@/lib/importReview/accountIdentityGuard';

interface Props {
  open: boolean;
  statementIdentifier: string;
  walletIdentifier: string;
  walletName: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export const AccountIdentityMismatchDialog = ({
  open,
  statementIdentifier,
  walletIdentifier,
  walletName,
  onCancel,
  onConfirm,
}: Props) => {
  const { t } = useTranslation();
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="account-identity-mismatch"
      className="fixed inset-0 z-[95] bg-background/90 backdrop-blur-sm p-3 sm:p-6 flex items-center justify-center"
    >
      <div className="w-full max-w-md rounded-xl border border-border/50 bg-background shadow-2xl p-4 space-y-3">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
          {t('import.identityMismatch.title', 'Izvod ne pripada ovom novčaniku')}
        </h2>

        <div className="space-y-1 text-sm">
          <p className="text-muted-foreground">
            {t('import.identityMismatch.statement', 'Izvod glasi na')}
          </p>
          <p data-testid="identity-statement" className="font-mono break-all">
            {maskAccountIdentity(statementIdentifier)}
          </p>
          <p className="pt-2 text-muted-foreground">
            {t('import.identityMismatch.wallet', 'Novčanik {{name}} je', { name: walletName })}
          </p>
          <p data-testid="identity-wallet" className="font-mono break-all">
            {maskAccountIdentity(walletIdentifier)}
          </p>
        </div>

        <p className="text-xs text-muted-foreground">
          {t(
            'import.identityMismatch.hint',
            'Odaberi drugi novčanik ili prekini uvoz. Ako svejedno nastaviš, ovo se neće zapamtiti kao pravilo.',
          )}
        </p>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            variant="outline"
            className="min-h-11 flex-1"
            data-testid="identity-cancel"
            onClick={onCancel}
          >
            {t('import.identityMismatch.cancel', 'Prekini uvoz')}
          </Button>
          <Button
            variant="destructive"
            className="min-h-11 flex-1"
            data-testid="identity-confirm"
            onClick={onConfirm}
          >
            {t('import.identityMismatch.confirm', 'Svejedno uvezi')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AccountIdentityMismatchDialog;
