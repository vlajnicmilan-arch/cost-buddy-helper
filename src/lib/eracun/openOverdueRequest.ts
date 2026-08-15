/**
 * META KLIKA ZA „PREKORAČENI RAČUNI".
 *
 * Klik na obavijest/stavku „Za pažnju" mora nekamo voditi. Postojeći routing
 * mehanizam (`data.route`) vodi na početni ekran, a ovaj mali kanal kaže
 * eRačun widgetu da se otvori s filterom „Prekoračeni".
 *
 * PRAVILO OTVARANJA: uvijek se otvara eRačuni panel u TRENUTNO aktivnom
 * kontekstu (osobno ili aktivni poslovni profil); razrada po profilima ostaje
 * u tekstu obavijesti. Nikad nikamo = ne postoji.
 */
const KEY = 'eracun:open-overdue';
export const ERACUN_OPEN_OVERDUE_EVENT = 'eracun:open-overdue';

let memoryFlag = false;

export const requestOpenOverdueInvoices = (): void => {
  memoryFlag = true;
  try {
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* private mode — memory fallback nosi zahtjev */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ERACUN_OPEN_OVERDUE_EVENT));
  }
};

/** Vraća true jednom (i briše zahtjev) — cold mount nakon navigacije. */
export const consumeOpenOverdueRequest = (): boolean => {
  let stored: string | null = null;
  try {
    stored = sessionStorage.getItem(KEY);
    if (stored) sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  const had = memoryFlag || !!stored;
  memoryFlag = false;
  return had;
};
