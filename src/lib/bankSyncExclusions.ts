// Računi koje NE sinkroniziramo (Milan ih ručno isključio).
// Ostaju vidljivi u Walletu, samo se preskaču u sync-u.
export const SYNC_EXCLUDED_ACCOUNT_IDS = new Set<string>([
  'd3782fc0-fc57-46ad-b3a3-9f22b62e478b', // Erste Žiroračun HR41...6997, prazan, Milan ne treba sync
]);

export const isAccountSyncExcluded = (id: string): boolean =>
  SYNC_EXCLUDED_ACCOUNT_IDS.has(id);
