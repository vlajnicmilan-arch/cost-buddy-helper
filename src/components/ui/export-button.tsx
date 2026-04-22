import { ReactNode } from 'react';
import { Button, ButtonProps } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Download, Share2, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ExportMode } from '@/lib/fileExport';

interface ExportButtonProps {
  label: ReactNode;
  icon?: ReactNode;
  onExport: (mode: ExportMode) => void | Promise<void>;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  disabled?: boolean;
  className?: string;
  /** Hide the chevron, just show the label */
  compact?: boolean;
}

/**
 * Reusable export trigger that opens a dropdown with two options:
 *  - Download (save locally / to Documents)
 *  - Share (open native/web share sheet)
 */
export const ExportButton = ({
  label,
  icon,
  onExport,
  variant = 'outline',
  size = 'sm',
  disabled,
  className,
  compact,
}: ExportButtonProps) => {
  const { t } = useTranslation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} disabled={disabled} className={className}>
          {icon ?? <Download className="w-4 h-4 mr-1" />}
          {label}
          {!compact && <ChevronDown className="w-3 h-3 ml-1 opacity-70" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-[60]">
        <DropdownMenuItem onClick={() => onExport('save')}>
          <Download className="w-4 h-4 mr-2" />
          {t('fileExport.download', 'Preuzmi')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onExport('share')}>
          <Share2 className="w-4 h-4 mr-2" />
          {t('fileExport.share', 'Podijeli')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
