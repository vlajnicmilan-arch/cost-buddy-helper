/**
 * BusinessModeGuard — NEUTRALIZIRAN (Read-Only politika, kolovoz 2026).
 *
 * Prije je ovaj guard AUTOMATSKI gasio business mode korisniku koji je
 * izgubio Business access. Prema Milanovoj politici (Faza Read-Only)
 * ništa se ne skriva ni ne mijenja: business podaci ostaju vidljivi,
 * pisanje je blokirano pojedinačnim useWriteGuard hookovima + server
 * triggerima. Ovaj file namjerno više ne poduzima nikakvu akciju.
 */
export const BusinessModeGuard = () => {
  return null;
};
