/**
 * CentarBrandIcon — višebojna dashboard ikona za "Centar" tab u BottomNav.
 *
 * Točan lucide LayoutDashboard oblik (masonry raspored):
 * gore-lijevo i dolje-desno viši, gore-desno i dolje-lijevo niži.
 * Samo obrisi (stroke) u bojama modula — fill="none".
 */
import { MODULE_HSL } from '@/lib/moduleColors';

interface Props {
  size?: number;
  className?: string;
}

export const CentarBrandIcon = ({ size = 20, className }: Props) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="3"  y="3"  width="7" height="9" rx="1" stroke={`hsl(${MODULE_HSL.projects})`} />
      <rect x="14" y="3"  width="7" height="5" rx="1" stroke={`hsl(${MODULE_HSL.wallet})`} />
      <rect x="14" y="12" width="7" height="9" rx="1" stroke={`hsl(${MODULE_HSL.krug})`} />
      <rect x="3"  y="16" width="7" height="5" rx="1" stroke={`hsl(${MODULE_HSL.budgets})`} />
    </svg>
  );
};
