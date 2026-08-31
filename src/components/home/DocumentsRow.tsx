import { FileClock, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

interface DocumentsRowProps {
  pendingCount: number;
}

export const DocumentsRow = ({ pendingCount }: DocumentsRowProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => navigate('/dokumenti')}
      className="mb-4 h-auto min-h-[68px] w-full justify-start gap-3 rounded-xl border-l-4 border-l-document-pending bg-card p-3 text-left hover:bg-muted/30 sm:p-4"
      data-testid="documents-home-row"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-document-pending/15">
        <FileClock className="h-5 w-5 text-document-pending" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold sm:text-base">
          {t('documents.title', 'Dokumenti')}
        </span>
        <span className="block text-xs font-normal text-muted-foreground">
          {pendingCount > 0
            ? t('documents.homeRow.pending', { count: pendingCount })
            : t('documents.homeRow.clear', 'Nema dokumenata na čekanju')}
        </span>
      </span>
      {pendingCount > 0 && (
        <span className="shrink-0 rounded-full bg-document-pending px-2.5 py-1 text-xs font-bold text-document-pending-foreground">
          {pendingCount}
        </span>
      )}
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Button>
  );
};