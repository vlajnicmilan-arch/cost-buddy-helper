/**
 * CentarBrandIcon — višebojna dashboard ikona za "Centar" tab u BottomNav.
 *
 * 2×2 raspored zaobljenih kvadratića (kao lucide LayoutDashboard),
 * svaki u boji jednog modula. Boje su literalne (ne `currentColor`)
 * jer simbol nosi 4 boje istovremeno.
 */
import { MODULE_HSL } from '@/lib/moduleColors';

interface Props {
  size?: number;
  className?: string;
}

const SIZE = 9;
const RX = 2;
// 2×2 raspored s razmakom u sredini: 3 | 9 | 1 (gap) | 9 | 2
const LEFT = 3;
const RIGHT = 12;
const TOP = 3;
const BOTTOM = 12;

const RECTS: Array<{ x: number; y: number; hsl: string }> = [
  { x: LEFT,  y: TOP,    hsl: MODULE_HSL.projects }, // gore-lijevo, plava
  { x: RIGHT, y: TOP,    hsl: MODULE_HSL.wallet },   // gore-desno, zelena
  { x: LEFT,  y: BOTTOM, hsl: MODULE_HSL.budgets },  // dolje-lijevo, ljubičasta
  { x: RIGHT, y: BOTTOM, hsl: MODULE_HSL.krug },     // dolje-desno, narančasta
];

export const CentarBrandIcon = ({ size = 20, className }: Props) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {RECTS.map((r, i) => (
        <rect
          key={i}
          x={r.x}
          y={r.y}
          width={SIZE}
          height={SIZE}
          rx={RX}
          fill={`hsl(${r.hsl})`}
        />
      ))}
    </svg>
  );
};
