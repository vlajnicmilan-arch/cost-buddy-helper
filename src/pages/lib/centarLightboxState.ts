/**
 * Centar landing — lightbox state machine (pure).
 *
 * Cilj: jedan izvor istine za "lightbox otvoren" i njegov history marker.
 * SVI putevi zatvaranja (X, Escape, backdrop, popstate/back gesta, unmount)
 * moraju završiti u fazi `idle` s HISTORY ČISTOM (nema leaka pushed entryja
 * niti duplog pop-a preko landing entryja).
 *
 * Prethodna implementacija (inline u CentarLanding.tsx) je imala tri rupe:
 *   1) Bez guard-a protiv duplog pushState-a — brzi open→X→open ciklus mogao
 *      je gurnuti dva markera dok popstate iz prvog history.back() još nije
 *      stigao.
 *   2) Bez razlikovanja "korisnikov close" vs "popstate close" — race dvaju
 *      popstate-a (naš history.back() + korisnikov back gesta) znao je pop-nuti
 *      i landing entry pa korisnik "ne može napustiti stranicu jednim backom".
 *   3) Cleanup effect-a nije pop-ao pushed marker kad se overlay zatekao
 *      otvoren u trenutku unmounta (SPA navigacija ili StrictMode remount),
 *      pa je history nakon toga imao višak entryja.
 *
 * State machine ispod eksplicitno ograđuje sve tri rupe:
 *   phase ∈ {idle, open, closing}
 *   action ∈ {user_open, user_close, popstate, unmount}
 *
 * Invarijante (dokazane u src/test/centarLightboxState.test.ts):
 *   I1  broj emitiranih 'push' == broj emitiranih 'back'  (nema history leaka)
 *   I2  nakon 'unmount' phase je uvijek 'idle'
 *   I3  'user_open' u fazi != idle NE emitira dodatni 'push' (guard duplog otvaranja)
 *   I4  'user_close' u fazi != open NE emitira 'back' (idempotentan close)
 *   I5  'popstate' u fazi 'closing' NE emitira 'back' (naš back je već konzumiran)
 */

export type LightboxPhase = "idle" | "open" | "closing";
export type LightboxAction =
  | "user_open"
  | "user_close"
  | "popstate"
  | "unmount";
export type LightboxEffect = "push" | "back" | "show" | "hide" | null;

export interface Transition {
  next: LightboxPhase;
  effects: LightboxEffect[];
}

export function reduce(phase: LightboxPhase, action: LightboxAction): Transition {
  switch (phase) {
    case "idle": {
      if (action === "user_open") {
        return { next: "open", effects: ["show", "push"] };
      }
      // popstate / user_close / unmount u idle: no-op
      return { next: "idle", effects: [] };
    }
    case "open": {
      if (action === "user_close") {
        // Korisnik zatvara (X/Esc/backdrop) — sakrij DOM, pop-aj pushed marker.
        return { next: "closing", effects: ["hide", "back"] };
      }
      if (action === "popstate") {
        // Browser back gesta konzumirala je naš marker — samo sakrij DOM.
        return { next: "idle", effects: ["hide"] };
      }
      if (action === "unmount") {
        // Effect cleanup — moramo POP-ati pushed marker inače history leaka.
        return { next: "idle", effects: ["hide", "back"] };
      }
      // user_open u open fazi: guard — ne emitiraj drugi push
      return { next: "open", effects: [] };
    }
    case "closing": {
      if (action === "popstate") {
        // Popstate iz našeg history.back() — samo sjedni na idle.
        return { next: "idle", effects: [] };
      }
      if (action === "unmount") {
        // DOM je već sakriven; pushed marker je već popped (back je emitiran).
        // Ništa dalje ne emitiramo.
        return { next: "idle", effects: [] };
      }
      // user_open/user_close tijekom closing: ignoriraj (state se stabilizira).
      return { next: "closing", effects: [] };
    }
  }
}
