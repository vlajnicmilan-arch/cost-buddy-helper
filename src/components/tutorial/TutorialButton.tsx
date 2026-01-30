import { Button } from '@/components/ui/button';
import { useTutorial } from '@/contexts/TutorialContext';
import { HelpCircle, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface TutorialButtonProps {
  variant?: 'icon' | 'full';
  className?: string;
}

export const TutorialButton = ({ variant = 'icon', className }: TutorialButtonProps) => {
  const { t } = useTranslation();
  const { startTutorial, hasCompletedTutorial, resetTutorial } = useTutorial();

  const handleClick = () => {
    if (hasCompletedTutorial) {
      resetTutorial();
    }
    startTutorial();
  };

  if (variant === 'full') {
    return (
      <Button
        variant="outline"
        onClick={handleClick}
        className={className}
      >
        {hasCompletedTutorial ? (
          <>
            <RotateCcw className="w-4 h-4 mr-2" />
            {t('tutorial.restart', 'Ponovi vodič')}
          </>
        ) : (
          <>
            <HelpCircle className="w-4 h-4 mr-2" />
            {t('tutorial.start', 'Pokreni vodič')}
          </>
        )}
      </Button>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClick}
            className={className}
          >
            {hasCompletedTutorial ? (
              <RotateCcw className="w-4 h-4" />
            ) : (
              <HelpCircle className="w-4 h-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            {hasCompletedTutorial 
              ? t('tutorial.restart', 'Ponovi vodič')
              : t('tutorial.start', 'Pokreni vodič')
            }
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
