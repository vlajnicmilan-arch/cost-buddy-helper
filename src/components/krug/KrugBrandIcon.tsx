/**
 * KrugBrandIcon — multi-color brand simbol za "Krug" tab u BottomNav.
 *
 * Krug podijeljen na 4 luka (po 80°, 10° gap) u bojama 4 modula:
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

// r=9, C = 2π·9 ≈ 56.549; svaki luk = 80° → L ≈ 12.566
const R = 9;
const C = 2 * Math.PI * R;
const ARC_LEN = (80 / 360) * C;
const DASH = `${ARC_LEN} ${C - ARC_LEN}`;

// Rotacije postavljaju početak luka tako da se luk završava 5° prije osi
// (10° gap između susjednih lukova). Smjer crtanja je CW od 3 sata.
const SEGMENTS: Array<{ rotate: number; hsl: string }> = [
  { rotate: 185, hsl: MODULE_HSL.projects }, // top-left, plava
  { rotate: -85, hsl: MODULE_HSL.wallet },   // top-right, zelena
  { rotate: 95,  hsl: MODULE_HSL.budgets },  // bottom-left, ljubičasta
  { rotate: 5,   hsl: MODULE_HSL.krug },     // bottom-right, narančasta
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
