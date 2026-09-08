/**
 * Tihi auto-login dok korisnik čeka potvrdu maila.
 *
 * Korisnik se registrira na jednom uređaju, a potvrdu klikne na drugom. Tab s
 * ekranom "Provjerite svoj email" tada ostaje zaglavljen. Lozinka je u tom
 * trenutku još u stanju obrasca (nigdje spremljena), pa se potvrda otkriva
 * tihim pokušajem prijave — bez ijedne promjene na poslužitelju, bez toastova
 * i bez telemetrije.
 */

export const AUTO_LOGIN_POLL_MS = 15_000; // rate limit prijava po IP-u — ne smanjivati
export const AUTO_LOGIN_MAX_MS = 10 * 60 * 1000;
export const AUTO_LOGIN_FOCUS_DEBOUNCE_MS = 5_000;

type AuthError = { message?: string } | null | undefined;

export interface VerificationAutoLoginOptions {
  /** Trenutne vjerodajnice — čitaju se pri svakom pokušaju. */
  getCredentials: () => { email: string; password: string };
  signIn: (email: string, password: string) => Promise<{ error: AuthError }>;
}

/** Pokreće polling; vraća funkciju za zaustavljanje (cleanup). */
export function startVerificationAutoLogin(
  options: VerificationAutoLoginOptions,
): () => void {
  const { getCredentials, signIn } = options;
  const startedAt = Date.now();
  let stopped = false;
  let inFlight = false;
  let lastRun = 0;
  let timer: ReturnType<typeof setInterval> | undefined;

  const stop = () => {
    stopped = true;
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
  };

  const attempt = async () => {
    if (stopped || inFlight) return;
    if (Date.now() - startedAt >= AUTO_LOGIN_MAX_MS) {
      stop();
      return;
    }
    const { email, password } = getCredentials();
    if (!password.trim()) return;
    inFlight = true;
    lastRun = Date.now();
    try {
      const { error } = await signIn(email.trim(), password);
      if (stopped) return;
      if (!error) {
        // Sesija postoji — postojeći router preuzima kao i nakon ručne prijave.
        stop();
        return;
      }
      if (!error.message?.includes('Email not confirmed')) {
        // Bilo koja druga greška — tihi prekid, bez poruke.
        stop();
      }
    } catch {
      stop();
    } finally {
      inFlight = false;
    }
  };

  const onWake = () => {
    if (stopped) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (Date.now() - lastRun < AUTO_LOGIN_FOCUS_DEBOUNCE_MS) return;
    void attempt();
  };

  timer = setInterval(() => { void attempt(); }, AUTO_LOGIN_POLL_MS);
  window.addEventListener('focus', onWake);
  document.addEventListener('visibilitychange', onWake);

  return () => {
    stop();
    window.removeEventListener('focus', onWake);
    document.removeEventListener('visibilitychange', onWake);
  };
}
