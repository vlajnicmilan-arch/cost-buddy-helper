import { useFeatureAccess } from '@/hooks/useFeatureAccess';

/**
 * Ima li korisnik PRAVO na poslovni modul.
 *
 * Zamjenjuje bivši korisnički prekidač `businessFeatureEnabled` iz
 * AppStateContext-a: pravo je izvedeno isključivo iz pretplate/entitlementa
 * (`business_module`), pa se ne gubi čišćenjem preglednika niti prijavom
 * s drugog uređaja.
 */
export function useBusinessFeature(): boolean {
  const { hasAccess } = useFeatureAccess();
  return hasAccess('business_module');
}
