import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTutorial } from '@/contexts/TutorialContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ChevronLeft, ChevronRight, X, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface HighlightPosition {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface TooltipPosition {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  transform?: string;
}

export const TutorialOverlay = () => {
  const { t } = useTranslation();
  const { isActive, currentStep, steps, nextStep, prevStep, skipTutorial, getStepTitle, getStepDescription } = useTutorial();
  const [highlightPosition, setHighlightPosition] = useState<HighlightPosition | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition>({});
  const tooltipRef = useRef<HTMLDivElement>(null);

  const currentStepData = steps[currentStep];
  const progress = ((currentStep + 1) / steps.length) * 100;

  useEffect(() => {
    if (!isActive || !currentStepData) {
      setHighlightPosition(null);
      return;
    }

    // Bug B fix: reset highlight immediately on step change so the previous
    // step's spotlight does not linger over a wrong target while we resolve
    // the new one (e.g. payment-sources step when PaymentSourcesSection
    // hasn't mounted yet — it renders null until at least 1 visible source
    // exists, which races with the post-onboarding refetch).
    setHighlightPosition(null);

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let positionTimer: ReturnType<typeof setTimeout> | null = null;

    const measureAndPosition = (element: Element) => {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });

      positionTimer = setTimeout(() => {
        if (cancelled) return;
        const rect = element.getBoundingClientRect();
        const padding = 8;

        setHighlightPosition({
          top: rect.top - padding,
          left: rect.left - padding,
          width: rect.width + padding * 2,
          height: rect.height + padding * 2,
        });

        const tooltipWidth = 320;
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;

        let newPosition: TooltipPosition = {};

        const centerX = Math.max(16, Math.min(rect.left + rect.width / 2 - tooltipWidth / 2, windowWidth - tooltipWidth - 16));

        switch (currentStepData.position) {
          case 'top':
            newPosition = { bottom: windowHeight - rect.top + 16, left: centerX };
            break;
          case 'bottom':
            newPosition = { top: rect.bottom + 16, left: centerX };
            break;
          case 'left':
            newPosition = { top: rect.top + rect.height / 2 - 100, right: windowWidth - rect.left + 16 };
            break;
          case 'right':
            newPosition = { top: rect.top + rect.height / 2 - 100, left: rect.right + 16 };
            break;
          default:
            newPosition = { top: rect.bottom + 16, left: centerX };
        }

        if (newPosition.top !== undefined && newPosition.top + 220 > windowHeight) {
          newPosition = { bottom: windowHeight - rect.top + 16, left: centerX };
        }
        if (newPosition.bottom !== undefined && newPosition.bottom + 220 > windowHeight) {
          newPosition = { top: rect.bottom + 16, left: centerX };
        }

        setTooltipPosition(newPosition);
      }, 350);
    };

    const tryResolve = (attempt: number) => {
      if (cancelled) return;
      const element = document.querySelector(currentStepData.targetSelector);
      if (element) {
        measureAndPosition(element);
        return;
      }
      // Bug B fix: one short retry (~250ms) to absorb mount-lag of late targets
      // (e.g. PaymentSourcesSection appearing after custom-source refetch).
      // If still missing, skip rather than highlight a wrong element.
      if (attempt === 0) {
        retryTimer = setTimeout(() => tryResolve(1), 250);
        return;
      }
      if (currentStep < steps.length - 1) {
        nextStep();
      } else {
        skipTutorial();
      }
    };

    const initialTimer = setTimeout(() => tryResolve(0), 100);

    const handleResize = () => {
      const element = document.querySelector(currentStepData.targetSelector);
      if (element) measureAndPosition(element);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelled = true;
      clearTimeout(initialTimer);
      if (retryTimer) clearTimeout(retryTimer);
      if (positionTimer) clearTimeout(positionTimer);
      window.removeEventListener('resize', handleResize);
    };
  }, [isActive, currentStep, currentStepData, nextStep, skipTutorial, steps.length]);

  if (!isActive || !currentStepData) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] pointer-events-none"
      >
        {/* Backdrop with cutout */}
        <svg className="absolute inset-0 w-full h-full pointer-events-auto">
          <defs>
            <mask id="tutorial-mask">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              {highlightPosition && (
                <rect
                  x={highlightPosition.left}
                  y={highlightPosition.top}
                  width={highlightPosition.width}
                  height={highlightPosition.height}
                  rx="12"
                  fill="black"
                />
              )}
            </mask>
          </defs>
          <rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill="rgba(0, 0, 0, 0.75)"
            mask="url(#tutorial-mask)"
            onClick={skipTutorial}
          />
        </svg>

        {/* Highlight border */}
        {highlightPosition && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute pointer-events-none"
            style={{
              top: highlightPosition.top,
              left: highlightPosition.left,
              width: highlightPosition.width,
              height: highlightPosition.height,
            }}
          >
            <div className="absolute inset-0 rounded-xl border-2 border-primary animate-pulse" />
            <div className="absolute inset-0 rounded-xl ring-4 ring-primary/30" />
          </motion.div>
        )}

        {/* Tooltip */}
        <motion.div
          ref={tooltipRef}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          className="absolute z-[101] pointer-events-auto"
          style={{
            ...tooltipPosition,
            width: 'min(320px, calc(100vw - 32px))',
          }}
        >
          <Card className="shadow-2xl border-primary/20 bg-card/95 backdrop-blur-sm">
            <CardContent className="p-4">
              {/* Header with step indicator */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-primary">
                  <Sparkles className="w-4 h-4" />
                  <span className="text-xs font-medium">
                    Korak {currentStep + 1} od {steps.length}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 -mr-2 -mt-1"
                  onClick={skipTutorial}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {/* Progress bar */}
              <Progress value={progress} className="h-1 mb-4" />

              {/* Content */}
              <h3 className="font-semibold text-foreground mb-2">
                {getStepTitle(currentStepData)}
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                {getStepDescription(currentStepData)}
              </p>

              {/* Navigation */}
              <div className="flex items-center justify-between gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={prevStep}
                  disabled={currentStep === 0}
                  className="gap-1"
                >
                  <ChevronLeft className="w-4 h-4" />
                  {t('tutorial.back', 'Natrag')}
                </Button>
                
                <div className="flex gap-1">
                  {steps.map((_, index) => (
                    <div
                      key={index}
                      className={cn(
                        "w-1.5 h-1.5 rounded-full transition-colors",
                        index === currentStep 
                          ? "bg-primary" 
                          : index < currentStep 
                            ? "bg-primary/50" 
                            : "bg-muted"
                      )}
                    />
                  ))}
                </div>

                <Button
                  size="sm"
                  onClick={nextStep}
                  className="gap-1"
                >
                  {currentStep === steps.length - 1 ? t('tutorial.finish', 'Završi') : t('tutorial.next', 'Dalje')}
                  {currentStep < steps.length - 1 && <ChevronRight className="w-4 h-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
