/**
 * "Predaj vlasništvo i izađi" — vlasnikov izlazak iz Kruga.
 *
 * Vlasnik ne može samo izaći: Krug nikad ne smije ostati bez vlasnika.
 * Zato je izlazak spojen s ručnim odabirom nasljednika (punopravni član),
 * a sve se izvršava atomski u RPC-u `krug_owner_leave`.
 *
 * Ako punopravnih članova nema, dijalog to pošteno kaže — arhiviranje Kruga
 * je zasebna isporuka i ovdje se NE simulira.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, LogOut, AlertCircle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { showSuccess, showError } from '@/hooks/useStatusFeedback';
import { useUserProfiles } from '@/hooks/useUserProfiles';
import { getMemberDisplayName } from '@/lib/krugDisplay';
import type { KrugMemberView } from '@/hooks/useKrug';
import {
  useKrugOwnerLeave,
  isKrugOwnerLeaveOk,
  type KrugOwnerLeaveOutcome,
} from '@/hooks/useKrugOwnerLeave';

interface Props {
  krugId: string;
  members: KrugMemberView[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLeft?: () => void;
}

export function KrugOwnerLeaveDialog({ krugId, members, open, onOpenChange, onLeft }: Props) {
  const { t } = useTranslation();
  const ownerLeave = useKrugOwnerLeave();
  const [successorId, setSuccessorId] = useState<string>('');

  const candidates = useMemo(
    () => members.filter((m) => m.kind === 'punopravni'),
    [members],
  );
  const candidateIds = useMemo(() => candidates.map((c) => c.user_id), [candidates]);
  const profileMap = useUserProfiles(candidateIds);

  useEffect(() => {
    if (!open) setSuccessorId('');
  }, [open]);

  const nameOf = (userId: string) =>
    getMemberDisplayName(
      profileMap.get(userId),
      userId,
      t('krug.member.unknown', 'Nepoznat član'),
    );

  const handleConfirm = async () => {
    if (!successorId) return;
    try {
      const outcome = await ownerLeave.mutateAsync({ krugId, successorId });
      if (isKrugOwnerLeaveOk(outcome)) {
        showSuccess(t('krug.ownerLeave.success', 'Vlasništvo je preneseno, izašao si iz Kruga'));
        onOpenChange(false);
        onLeft?.();
        return;
      }
      showError(
        t(
          `krug.ownerLeave.errors.${outcome as KrugOwnerLeaveOutcome}`,
          t('krug.ownerLeave.errors.generic', 'Greška pri predaji vlasništva'),
        ),
      );
    } catch {
      showError(t('krug.ownerLeave.errors.generic', 'Greška pri predaji vlasništva'));
    }
  };

  const hasCandidates = candidates.length > 0;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {hasCandidates
              ? t('krug.ownerLeave.title', 'Predati vlasništvo i izaći?')
              : t('krug.ownerLeave.noSuccessorTitle', 'Nema nasljednika')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {hasCandidates
              ? t(
                  'krug.ownerLeave.body',
                  'Odaberi punopravnog člana koji postaje vlasnik Kruga. Ti izlaziš iz Kruga i gubiš pristup njegovim dijeljenim podacima.',
                )
              : t(
                  'krug.ownerLeave.noSuccessor',
                  'Izlazak bez nasljednika stiže uskoro — arhiviranje kruga.',
                )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {hasCandidates && (
          <div className="space-y-2">
            <Label htmlFor="krug-successor">
              {t('krug.ownerLeave.selectLabel', 'Novi vlasnik')}
            </Label>
            <Select value={successorId} onValueChange={setSuccessorId}>
              <SelectTrigger id="krug-successor" className="min-h-[44px]">
                <SelectValue
                  placeholder={t('krug.ownerLeave.selectPlaceholder', 'Odaberi člana')}
                />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((c) => (
                  <SelectItem key={c.user_id} value={c.user_id}>
                    {nameOf(c.user_id)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {successorId && (
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                {t('krug.ownerLeave.consequence', {
                  name: nameOf(successorId),
                  defaultValue: '{{name}} postaje vlasnik; ti izlaziš i gubiš pristup.',
                })}
              </p>
            )}
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={ownerLeave.isPending}>
            {t('krug.ownerLeave.cancel', 'Odustani')}
          </AlertDialogCancel>
          {hasCandidates && (
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleConfirm();
              }}
              disabled={ownerLeave.isPending || !successorId}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {ownerLeave.isPending ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <LogOut className="w-4 h-4 mr-1" />
              )}
              {t('krug.ownerLeave.confirm', 'Predaj i izađi')}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
