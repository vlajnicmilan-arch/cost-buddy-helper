/**
 * PRIPADNOST TROŠKA TVRTKI — jedino mjesto odluke.
 *
 * Pravilo: kad je u trošku odabran projekt, trošak pripada tvrtki TOG projekta
 * (osobni projekt → NULL). Bez odabranog projekta vrijedi današnje ponašanje
 * (aktivni/rutirani poslovni profil).
 *
 * Ovdje se NE dira motor salda ni unutrašnjost ownerLoanLogic — samo se
 * određuje business_profile_id i uvjet za izbor „pozajmica / materijal".
 */
import { isPersonalSourceForProfile } from '@/lib/receiptBusinessRouting';

export interface AttributableProject {
  id: string;
  business_profile_id?: string | null;
}

/** Pripadnost tvrtki za trošak koji se tek sprema (iz dijaloga). */
export const resolveExpenseBusinessProfileId = (params: {
  selectedProjectId: string | null | undefined;
  projects: readonly AttributableProject[];
  /** Današnji izvor: aktivni profil ili profil prepoznat sa skena. */
  fallbackBusinessProfileId: string | null | undefined;
}): string | null => {
  const { selectedProjectId, projects, fallbackBusinessProfileId } = params;
  if (selectedProjectId) {
    const project = projects.find((p) => p.id === selectedProjectId);
    // Projekt poznat → njegova tvrtka je mjerodavna (osobni projekt → NULL).
    if (project) return project.business_profile_id ?? null;
  }
  return fallbackBusinessProfileId ?? null;
};

/**
 * Pripadnost pri upisu/izmjeni: ako trošak nosi projekt, vrijednost koju je
 * pozivatelj izračunao je konačna (uključujući NULL) — aktivni profil je više
 * ne smije nadglasati. Bez projekta ostaje stari fallback.
 */
export const resolveSavedBusinessProfileId = (
  expense: { project_id?: string | null; business_profile_id?: string | null },
  activeBusinessProfileId: string | null | undefined,
): string | null => {
  if (expense.project_id) return expense.business_profile_id ?? null;
  return expense.business_profile_id ?? activeBusinessProfileId ?? null;
};

/**
 * Izbor „Pozajmica vlasnika / Materijalni trošak" se nudi kad je trošak
 * poslovni, a odabrani novčanik je osobni ili pripada drugoj tvrtki.
 */
export const shouldOfferOwnerFundingChoice = (params: {
  expenseBusinessProfileId: string | null | undefined;
  customPaymentSourceId: string | null | undefined;
  sources: readonly { id: string; business_profile_id?: string | null }[];
}): boolean => {
  const { expenseBusinessProfileId, customPaymentSourceId, sources } = params;
  if (!expenseBusinessProfileId) return false;
  return isPersonalSourceForProfile({
    customPaymentSourceId,
    sources,
    targetBusinessProfileId: expenseBusinessProfileId,
  });
};

/** `custom:UUID` → UUID; sve ostalo → null (isto pravilo kao ownerLoanLogic). */
export const paymentSourceToCustomId = (paymentSource: string | null | undefined): string | null => {
  if (!paymentSource || typeof paymentSource !== 'string') return null;
  return paymentSource.startsWith('custom:') ? paymentSource.slice('custom:'.length) : null;
};
