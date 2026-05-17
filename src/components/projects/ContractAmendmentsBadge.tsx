import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useProjectContractAmendments } from '@/hooks/useProjectContractAmendments';
import { FileSignature } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  projectId: string;
}

/**
 * Compact indicator shown under the "Ugovoreno" KPI card.
 * Renders nothing when no contract amendments exist.
 */
export const ContractAmendmentsBadge = ({ projectId }: Props) => {
  const { t } = useTranslation();
  const { formatAmount } = useCurrency();
  const { amendments, total, refetch } = useProjectContractAmendments(projectId);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || detail.projectId === projectId) refetch();
    };
    window.addEventListener('contract-amendment-added', handler as EventListener);
    return () => window.removeEventListener('contract-amendment-added', handler as EventListener);
  }, [projectId, refetch]);

  if (amendments.length === 0 || total <= 0) return null;

  return (
    <div
      className={cn(
        'mt-1 flex items-center justify-center gap-1 text-[10px] font-medium',
        'text-warning'
      )}
      title={t('projects.contractAmendment.tooltip', 'Aneksi ugovora s klijentom')}
    >
      <FileSignature className="w-3 h-3" />
      <span>
        +{formatAmount(total)} ({amendments.length})
      </span>
    </div>
  );
};
