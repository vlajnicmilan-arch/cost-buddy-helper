/**
 * AddKrugMemberDialog — vlasnik dodaje postojećeg korisnika u Krug po emailu.
 *
 * Honest Skeleton v1:
 * - lookup ide kroz edge function `krug-add-member` (service-role find_user_by_email)
 * - poziva novog (još neregistriranog) korisnika nije podržano — vraća user_not_found
 *   poruku; flow za email pozive čeka idući val
 * - cap za `punopravni` enforcan kao UX disable (KRUG_PRESETS.maxPunopravni)
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mail, Loader2 } from 'lucide-react';
import { useKrugAddMember, type KrugAddError, type KrugAddRole } from '@/hooks/useKrugMemberMutations';
import { canAddPunopravni } from '@/lib/krugPresets';
import { useStatusFeedback } from '@/hooks/useStatusFeedback';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  krugId: string;
  preset: string | null | undefined;
  /** Trenutni broj punopravnih (uključuje ownera). */
  punopravniCount: number;
}

export function AddKrugMemberDialog({ open, onOpenChange, krugId, preset, punopravniCount }: Props) {
  const { t } = useTranslation();
  const { showSuccess, showError } = useStatusFeedback();
  const addMember = useKrugAddMember();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<KrugAddRole>('punopravni');

  const punopravniDisabled = !canAddPunopravni(preset, punopravniCount);
  const effectiveRole: KrugAddRole = punopravniDisabled ? 'obicni' : role;

  const reset = () => {
    setEmail('');
    setRole('punopravni');
  };

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    const res = await addMember.mutateAsync({ krugId, email: trimmed, role: effectiveRole });
    if (res.ok) {
      showSuccess(t('krug.member.add.success', 'Član dodan'));
      handleClose(false);
    } else {
      showError(translateAddError(res.error, t));
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('krug.member.add.title', 'Dodaj člana')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="krug-member-email">{t('krug.member.add.emailLabel', 'Email')}</Label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="krug-member-email"
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="ime@primjer.hr"
                className="pl-9"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {t(
                'krug.member.add.emailHint',
                'Pozivamo postojećeg korisnika aplikacije. Pozivi novim korisnicima dolaze u sljedećem valu.',
              )}
            </p>
          </div>

          <div className="space-y-2">
            <Label>{t('krug.member.add.roleLabel', 'Uloga')}</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={effectiveRole === 'punopravni' ? 'default' : 'outline'}
                disabled={punopravniDisabled}
                onClick={() => setRole('punopravni')}
                className="h-auto py-2"
              >
                {t('krug.role.punopravni', 'Punopravni član')}
              </Button>
              <Button
                type="button"
                variant={effectiveRole === 'obicni' ? 'default' : 'outline'}
                onClick={() => setRole('obicni')}
                className="h-auto py-2"
              >
                {t('krug.role.obicni', 'Obični član')}
              </Button>
            </div>
            {punopravniDisabled && (
              <p className="text-xs text-muted-foreground">
                {t('krug.member.add.punopravniCapReached', 'Dosegnut je maks. broj punopravnih članova za ovaj preset.')}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => handleClose(false)} disabled={addMember.isPending}>
              {t('common.cancel', 'Odustani')}
            </Button>
            <Button onClick={handleSubmit} disabled={!email.trim() || addMember.isPending}>
              {addMember.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('krug.member.add.submit', 'Dodaj')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function translateAddError(err: KrugAddError, t: (k: string, d?: string) => string): string {
  switch (err) {
    case 'user_not_found':
      return t('krug.member.add.errors.user_not_found', 'Korisnik s tim emailom još nema račun.');
    case 'already_member':
      return t('krug.member.add.errors.already_member', 'Korisnik je već član ovog Kruga.');
    case 'cannot_add_self':
      return t('krug.member.add.errors.cannot_add_self', 'Ne možeš dodati samog sebe.');
    case 'not_owner':
      return t('krug.member.add.errors.not_owner', 'Samo vlasnik Kruga može dodavati članove.');
    case 'invalid_input':
      return t('krug.member.add.errors.invalid_input', 'Neispravan email.');
    case 'lookup_failed':
    case 'insert_failed':
    case 'unauthorized':
    case 'unexpected':
    default:
      return t('krug.member.add.errors.generic', 'Greška pri dodavanju člana.');
  }
}
