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

    const updatePosition = () => {
      const element = document.querySelector(currentStepData.targetSelector);
      
      if (element) {
        const rect = element.getBoundingClientRect();
        const padding = 8;
        
        setHighlightPosition({
          top: rect.top - padding + window.scrollY,
          left: rect.left - padding,
          width: rect.width + padding * 2,
          height: rect.height + padding * 2,
        });

        // Calculate tooltip position based on step configuration
        const tooltipHeight = 200; // Approximate tooltip height
        const tooltipWidth = 320;
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        
        let newPosition: TooltipPosition = {};
        
        switch (currentStepData.position) {
          case 'top':
            newPosition = {
              bottom: windowHeight - rect.top + 16,
              left: Math.max(16, Math.min(rect.left + rect.width / 2 - tooltipWidth / 2, windowWidth - tooltipWidth - 16)),
            };
            break;
          case 'bottom':
            newPosition = {
              top: rect.bottom + window.scrollY + 16,
              left: Math.max(16, Math.min(rect.left + rect.width / 2 - tooltipWidth / 2, windowWidth - tooltipWidth - 16)),
            };
            break;
          case 'left':
            newPosition = {
              top: rect.top + window.scrollY + rect.height / 2 - tooltipHeight / 2,
              right: windowWidth - rect.left + 16,
            };
            break;
          case 'right':
            newPosition = {
              top: rect.top + window.scrollY + rect.height / 2 - tooltipHeight / 2,
              left: rect.right + 16,
            };
            break;
          default:
            newPosition = {
              top: rect.bottom + window.scrollY + 16,
              left: Math.max(16, Math.min(rect.left, windowWidth - tooltipWidth - 16)),
            };
        }
        
        setTooltipPosition(newPosition);

        // Scroll element into view if needed
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    };

    // Initial position update
    const timer = setTimeout(updatePosition, 100);
    
    // Update on resize
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition);
    };
  }, [isActive, currentStep, currentStepData]);

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
