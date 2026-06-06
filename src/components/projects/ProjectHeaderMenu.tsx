import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import {
  MoreVertical,
  Pencil,
  BarChart3,
  Flag,
  RotateCcw,
  Archive,
  ArchiveRestore,
  Trash2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';

interface ProjectHeaderMenuProps {
  isManager: boolean;
  isReadOnly: boolean;
  projectCompleted: boolean;
  projectArchived: boolean;
  viewMode: 'lite' | 'full';
  onEdit: () => void;
  onOpenReports: () => void;
  onComplete: () => void;
  onReopen: () => void;
  onArchiveToggle: () => void;
  onDelete: () => void;
  onToggleViewMode: () => void;
}

/**
 * ⋮ dropdown in the ProjectFullScreenView header.
 * Consolidates Edit / Reports / Complete / Reopen / Archive / Delete / view-mode toggle.
 * Share button stays in the header proper (high-frequency action for multi-user projects).
 */
export const ProjectHeaderMenu = ({
  isManager,
  isReadOnly,
  projectCompleted,
  projectArchived,
  viewMode,
  onEdit,
  onOpenReports,
  onComplete,
  onReopen,
  onArchiveToggle,
  onDelete,
  onToggleViewMode,
}: ProjectHeaderMenuProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const closeAnd = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="shrink-0 h-9 w-9"
          aria-label={t('common.actions', 'Akcije')}
        >
          <MoreVertical className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 z-[70]">
        {isManager && (
          <DropdownMenuItem disabled={isReadOnly} onSelect={(e) => { e.preventDefault(); closeAnd(onEdit)(); }}>
            <Pencil className="w-4 h-4 mr-2" />
            {t('projects.menu.editProject', 'Uredi projekt')}
          </DropdownMenuItem>
        )}

        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); closeAnd(onOpenReports)(); }}>
          <BarChart3 className="w-4 h-4 mr-2" />
          {t('projects.menu.report', 'Izvještaj')}
        </DropdownMenuItem>

        {isManager && !projectCompleted && (
          <DropdownMenuItem disabled={isReadOnly} onSelect={(e) => { e.preventDefault(); closeAnd(onComplete)(); }}>
            <Flag className="w-4 h-4 mr-2" />
            {t('projects.menu.complete', 'Završi projekt')}
          </DropdownMenuItem>
        )}

        {isManager && projectCompleted && (
          <DropdownMenuItem disabled={isReadOnly} onSelect={(e) => { e.preventDefault(); closeAnd(onReopen)(); }}>
            <RotateCcw className="w-4 h-4 mr-2" />
            {t('projects.menu.reopen', 'Ponovo otvori')}
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); closeAnd(onToggleViewMode)(); }}>
          {viewMode === 'lite' ? (
            <>
              <Eye className="w-4 h-4 mr-2" />
              {t('projects.menu.showAllTabs', 'Prikaži sve tabove')}
            </>
          ) : (
            <>
              <EyeOff className="w-4 h-4 mr-2" />
              {t('projects.menu.showLiteTabs', 'Lite prikaz')}
            </>
          )}
        </DropdownMenuItem>

        {isManager && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={isReadOnly} onSelect={(e) => { e.preventDefault(); closeAnd(onArchiveToggle)(); }}>
              {projectArchived ? (
                <>
                  <ArchiveRestore className="w-4 h-4 mr-2" />
                  {t('projects.menu.unarchive', 'Vrati iz arhive')}
                </>
              ) : (
                <>
                  <Archive className="w-4 h-4 mr-2" />
                  {t('projects.menu.archive', 'Arhiviraj projekt')}
                </>
              )}
            </DropdownMenuItem>

            {projectArchived && (
              <DropdownMenuItem
                disabled={isReadOnly}
                className="text-destructive focus:text-destructive"
                onSelect={(e) => { e.preventDefault(); closeAnd(onDelete)(); }}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {t('projects.menu.deletePermanently', 'Obriši trajno')}
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
