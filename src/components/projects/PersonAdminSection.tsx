/**
 * Way out of a mistake on a person's card: correct the name, archive, delete.
 *
 * Deleting the identity keeps every engagement, hour and payout — the FK is
 * ON DELETE SET NULL — so the dialog says that with numbers instead of a
 * scary generic warning. Archiving is offered in the same place as the milder
 * option.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Archive, ArchiveRestore, Loader2, Pencil, Trash2 } from 'lucide-react';
import { useCurrency } from '@/contexts/CurrencyContext';
import { usePersonAdmin } from '@/hooks/usePersonAdmin';
import { showError, showSuccess } from '@/hooks/useStatusFeedback';
import { buildPersonRenamePlan, summarizePersonDeleteImpact } from '@/lib/personDeleteImpact';
import type { PersonAggregate } from '@/lib/workerIdentity';

interface PersonAdminSectionProps {
  personId: string;
  firstName: string;
  lastName: string;
  archived: boolean;
  linkedUserId?: string | null;
  aggregate: PersonAggregate | null;
  /** Called after any successful change so the list can refetch. */
  onChanged?: () => void;
  /** Called after the person is gone, so the card can close. */
  onDeleted?: () => void;
}

export const PersonAdminSection = ({
  personId,
  firstName,
  lastName,
  archived,
  linkedUserId = null,
  aggregate,
  onChanged,
  onDeleted,
}: PersonAdminSectionProps) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const { renamePerson, archivePerson, deletePerson, pending } = usePersonAdmin();

  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [first, setFirst] = useState(firstName);
  const [last, setLast] = useState(lastName);

  useEffect(() => {
    if (renameOpen) {
      setFirst(firstName);
      setLast(lastName);
    }
  }, [renameOpen, firstName, lastName]);

  const impact = summarizePersonDeleteImpact(
    (aggregate?.byProject ?? []).map((b) => ({
      engagementId: b.engagementId,
      projectId: b.projectId,
      hours: b.hours,
      earned: b.earned,
      paid: b.paid,
    })),
    { linkedUserId },
  );

  const submitRename = async () => {
    const plan = buildPersonRenamePlan({ firstName: first, lastName: last }, { firstName, lastName });
    if (!plan.valid) {
      showError(t('people.admin.renameInvalid', 'Ime je obavezno'));
      return;
    }
    if (!plan.changed) {
      setRenameOpen(false);
      return;
    }
    const res = await renamePerson(personId, plan.firstName, plan.lastName);
    if (res.ok) {
      setRenameOpen(false);
      showSuccess(t('people.admin.renamed', 'Ime ispravljeno'));
      onChanged?.();
    } else {
      showError(
        t('people.admin.renameFailed', 'Ispravak imena nije uspio: {{reason}}', {
          reason: res.dbMessage ?? '',
        }),
      );
    }
  };

  const toggleArchive = async () => {
    const res = await archivePerson(personId, !archived);
    if (res.ok) {
      showSuccess(
        archived
          ? t('people.admin.unarchived', 'Osoba vraćena na popis')
          : t('people.admin.archived', 'Osoba arhivirana'),
      );
      onChanged?.();
    } else {
      showError(
        t('people.admin.archiveFailed', 'Arhiviranje nije uspjelo: {{reason}}', {
          reason: res.dbMessage ?? '',
        }),
      );
    }
  };

  const submitDelete = async () => {
    const res = await deletePerson(personId);
    if (res.ok) {
      setDeleteOpen(false);
      showSuccess(t('people.admin.deleted', 'Osoba obrisana. Angažmani su ostali na projektima.'));
      onChanged?.();
      onDeleted?.();
    } else {
      showError(
        t('people.admin.deleteFailed', 'Brisanje nije uspjelo: {{reason}}', {
          reason: res.dbMessage ?? '',
        }),
      );
    }
  };

  return (
    <>
      <Separator />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" className="min-h-[44px]" onClick={() => setRenameOpen(true)}>
          <Pencil className="w-4 h-4 mr-1.5" />
          {t('people.admin.rename', 'Ispravi ime')}
        </Button>
        <Button variant="outline" size="sm" className="min-h-[44px]" onClick={toggleArchive} disabled={pending}>
          {archived ? (
            <ArchiveRestore className="w-4 h-4 mr-1.5" />
          ) : (
            <Archive className="w-4 h-4 mr-1.5" />
          )}
          {archived
            ? t('people.admin.unarchive', 'Vrati iz arhive')
            : t('people.admin.archive', 'Arhiviraj')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="min-h-[44px] text-destructive"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="w-4 h-4 mr-1.5" />
          {t('people.admin.delete', 'Obriši osobu')}
        </Button>
      </div>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="z-[60] max-w-md">
          <DialogHeader>
            <DialogTitle>{t('people.admin.renameTitle', 'Ispravi ime i prezime')}</DialogTitle>
            <DialogDescription>
              {t(
                'people.admin.renameDescription',
                'Ime se mijenja i na svim angažmanima ove osobe u projektima.',
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="person-first">{t('people.admin.firstName', 'Ime')}</Label>
              <Input id="person-first" value={first} onChange={(e) => setFirst(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="person-last">{t('people.admin.lastName', 'Prezime')}</Label>
              <Input id="person-last" value={last} onChange={(e) => setLast(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameOpen(false)} disabled={pending}>
              {t('common.cancel', 'Odustani')}
            </Button>
            <Button onClick={submitRename} disabled={pending}>
              {pending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {t('common.save', 'Spremi')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="z-[60] max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t('people.admin.deleteTitle', 'Obrisati {{name}}?', {
                name: `${firstName} ${lastName}`.trim(),
              })}
            </DialogTitle>
            <DialogDescription>
              {t('people.admin.deleteLead', 'Briše se samo osoba — evo što ostaje:')}
            </DialogDescription>
          </DialogHeader>

          <ul className="space-y-1.5 text-sm">
            <li>
              {t(
                'people.admin.deleteEngagements',
                '{{count}} angažmana ostaje na projektima — samo prestaju biti povezani s ovom osobom.',
                { count: impact.engagementCount },
              )}
            </li>
            <li>
              {t('people.admin.deleteMoney', 'Sati, satnice i isplate se NE diraju ({{hours}} h, isplaćeno {{paid}}).', {
                hours: impact.hours,
                paid: formatAmount(impact.paid),
              })}
            </li>
            {impact.cutsAccountLink && (
              <li className="text-destructive">
                {t('people.admin.deleteLink', 'Veza s računom se prekida.')}
              </li>
            )}
          </ul>

          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button variant="ghost" onClick={() => setDeleteOpen(false)} disabled={pending} className="sm:mr-auto">
              {t('common.cancel', 'Odustani')}
            </Button>
            {!archived && (
              <Button
                variant="outline"
                disabled={pending}
                onClick={async () => {
                  setDeleteOpen(false);
                  await toggleArchive();
                }}
              >
                <Archive className="w-4 h-4 mr-1.5" />
                {t('people.admin.archiveInstead', 'Radije arhiviraj')}
              </Button>
            )}
            <Button variant="destructive" onClick={submitDelete} disabled={pending}>
              {pending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {t('people.admin.delete', 'Obriši osobu')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
