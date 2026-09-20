/**
 * Potvrda izlaska iz dijeljenog novčanika (kartica računa).
 *
 * Radnja briše ISKLJUČIVO korisnikovo članstvo — nijedna transakcija se ne
 * dira, vlasnikov saldo ostaje kakav jest.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmActionDialog } from '@/components/common/ConfirmActionDialog';
import { usePaymentSourceMembers } from '@/hooks/usePaymentSourceMembers';
import { CustomPaymentSource } from '@/types/customPaymentSource';

interface Props {
  source: CustomPaymentSource | null;
  onClose: () => void;
  onLeft?: () => void;
}

export const LeaveSharedSourceDialog = ({ source, onClose, onLeft }: Props) => {
  const { t } = useTranslation();
  const { leaveSharedSource } = usePaymentSourceMembers(source?.id ?? null);
  const [pending, setPending] = useState(false);

  const handleConfirm = async () => {
    if (!source) return;
    setPending(true);
    const ok = await leaveSharedSource(source.id);
    setPending(false);
    onClose();
    if (ok) onLeft?.();
  };

  return (
    <ConfirmActionDialog
      open={!!source}
      onOpenChange={(open) => !open && onClose()}
      title={t('paymentSourceMembers.leaveShare', 'Napusti dijeljenje')}
      description={t(
        'paymentSourceMembers.leaveShareConfirm',
        'Tuđe transakcije s ovog računa nestat će iz vašeg pregleda. Vaši troškovi plaćeni s njega izlaze iz vaših statistika. Vaše uplate s vlastitih računa u njega ostaju.',
      )}
      confirmLabel={t('paymentSourceMembers.leaveShare', 'Napusti dijeljenje')}
      destructive
      pending={pending}
      onConfirm={handleConfirm}
    />
  );
};
