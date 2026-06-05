/**
 * KrugBrandIcon — multi-color brand simbol za "Krug" tab u BottomNav.
 *
 * Krug podijeljen na 4 luka (po 60°, 30° gap) u bojama 4 modula:
 *   - top-left:     Projekti (plava)
 *   - top-right:    Novčanik (zelena)
 *   - bottom-left:  Budžeti (ljubičasta)
 *   - bottom-right: Krug (narančasta)
 *
 * Pregled (teal) namjerno izostavljen — predstavlja okvir, ne segment.
 * Boje su literalne (ne `currentColor`) jer simbol nosi 4 boje istovremeno.
 */
import { MODULE_HSL } from '@/lib/moduleColors';

interface Props {
  size?: number;
  className?: string;
}

// r=9, C = 2π·9 ≈ 56.549; svaki luk = 60° → L ≈ 9.425
const R = 9;
const C = 2 * Math.PI * R;
const ARC_LEN = (60 / 360) * C;
const DASH = `${ARC_LEN} ${C - ARC_LEN}`;

// Centri lukova ostaju na 45°/135°/225°/315°; rotate = centar − 30°
// (luk se crta CW od `rotate` u trajanju 60°, gap 30° između susjednih).
const SEGMENTS: Array<{ rotate: number; hsl: string }> = [
  { rotate: 195, hsl: MODULE_HSL.projects }, // top-left, plava
  { rotate: -75, hsl: MODULE_HSL.wallet },   // top-right, zelena
  { rotate: 105, hsl: MODULE_HSL.budgets },  // bottom-left, ljubičasta
  { rotate: 15,  hsl: MODULE_HSL.krug },     // bottom-right, narančasta
];

export const KrugBrandIcon = ({ size = 20, className }: Props) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {SEGMENTS.map((s, i) => (
        <circle
          key={i}
          cx="12"
          cy="12"
          r={R}
          stroke={`hsl(${s.hsl})`}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={DASH}
          transform={`rotate(${s.rotate} 12 12)`}
        />
      ))}
    </svg>
  );
};
