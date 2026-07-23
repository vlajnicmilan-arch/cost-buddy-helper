/**
 * Regresija — lightbox state machine (privacy-independent).
 * Dokaz invarijanti iz komentara u centarLightboxState.ts.
 *
 * Ovi testovi vežu se na sljedeći Milanov scenarij (HITNA REGRESIJA #2):
 *   Desktop: open → X → open → Esc → back → MORA napustiti landing s 1 back-om.
 *   Mobile:  open → back → zatvara lightbox, ostaje na landingu; drugi back → izlaz.
 *
 * Državni stroj se testira jer je čist i jer bez njega prije nije bilo
 * dokaza da "svaki put zatvaranja ostavlja čistu historiju".
 */
import { describe, it, expect } from "vitest";
import {
  reduce,
  type LightboxPhase,
  type LightboxAction,
  type LightboxEffect,
} from "@/pages/lib/centarLightboxState";

function runScript(script: LightboxAction[]): {
  phases: LightboxPhase[];
  effects: LightboxEffect[];
} {
  let phase: LightboxPhase = "idle";
  const phases: LightboxPhase[] = [phase];
  const effects: LightboxEffect[] = [];
  for (const a of script) {
    const t = reduce(phase, a);
    phase = t.next;
    phases.push(phase);
    effects.push(...t.effects);
  }
  return { phases, effects };
}

const pushCount = (fx: LightboxEffect[]) =>
  fx.filter((e) => e === "push").length;
const backCount = (fx: LightboxEffect[]) =>
  fx.filter((e) => e === "back").length;

describe("centar lightbox state machine — history integrity", () => {
  it("I1: happy path X-close — push i back se izjednače", () => {
    const { phases, effects } = runScript([
      "user_open",
      "user_close",
      "popstate", // popstate iz našeg history.back()
    ]);
    expect(phases.at(-1)).toBe("idle");
    expect(pushCount(effects)).toBe(1);
    expect(backCount(effects)).toBe(1);
  });

  it("I1: happy path Escape-close — push == back", () => {
    const { phases, effects } = runScript(["user_open", "user_close", "popstate"]);
    expect(phases.at(-1)).toBe("idle");
    expect(pushCount(effects)).toBe(backCount(effects));
  });

  it("mobile back gesture — popstate zatvara overlay bez dodatnog back-a", () => {
    // Otvori, korisnik pritisne mobilni back → popstate direktno.
    const { phases, effects } = runScript(["user_open", "popstate"]);
    expect(phases.at(-1)).toBe("idle");
    // Push je bio 1 (za open); browser je već pop-ao pushed marker,
    // pa NE smijemo emitirati dodatni 'back' (inače pop-amo landing entry).
    expect(pushCount(effects)).toBe(1);
    expect(backCount(effects)).toBe(0);
  });

  it("Milan scenario desktop: open→X→open→Esc→popstate — 1 back izlazi", () => {
    // Nakon oba open+close, phase mora biti idle i push == back.
    const { phases, effects } = runScript([
      "user_open",
      "user_close",
      "popstate", // iz prvog history.back()
      "user_open",
      "user_close",
      "popstate", // iz drugog history.back()
    ]);
    expect(phases.at(-1)).toBe("idle");
    expect(pushCount(effects)).toBe(2);
    expect(backCount(effects)).toBe(2);
    // ⇒ history je čista, korisnikov sljedeći back izlazi s landinga.
  });

  it("I3: guard protiv duplog otvaranja (rapid re-click) — nema drugog push-a", () => {
    const { phases, effects } = runScript(["user_open", "user_open", "user_open"]);
    expect(phases.at(-1)).toBe("open");
    expect(pushCount(effects)).toBe(1);
  });

  it("I4: user_close u idle je no-op — nema back-a", () => {
    const { effects } = runScript(["user_close", "user_close"]);
    expect(backCount(effects)).toBe(0);
  });

  it("I5: popstate u closing ne emitira back (naš back je već konzumiran)", () => {
    const { phases, effects } = runScript([
      "user_open",
      "user_close",
      // sad je phase = closing, back je već emitiran jednom
      "popstate",
      "popstate", // eventualni spurious popstate ne smije emitirati back
    ]);
    expect(phases.at(-1)).toBe("idle");
    expect(backCount(effects)).toBe(1);
  });

  it("I2: unmount dok je overlay otvoren — čisti pushed marker (push == back)", () => {
    // Bez ove tranzicije history leaka: SPA nav dok je slika otvorena.
    const { phases, effects } = runScript(["user_open", "unmount"]);
    expect(phases.at(-1)).toBe("idle");
    expect(pushCount(effects)).toBe(1);
    expect(backCount(effects)).toBe(1);
  });

  it("I2: unmount u closing ne dupli back", () => {
    const { phases, effects } = runScript(["user_open", "user_close", "unmount"]);
    expect(phases.at(-1)).toBe("idle");
    expect(backCount(effects)).toBe(1); // samo iz user_close
  });

  it("I2: unmount u idle je no-op", () => {
    const { phases, effects } = runScript(["unmount"]);
    expect(phases.at(-1)).toBe("idle");
    expect(pushCount(effects)).toBe(0);
    expect(backCount(effects)).toBe(0);
  });

  it("stres — 20× open/close ciklus zadržava push==back i završi u idle", () => {
    const script: LightboxAction[] = [];
    for (let i = 0; i < 20; i++) {
      script.push("user_open", "user_close", "popstate");
    }
    const { phases, effects } = runScript(script);
    expect(phases.at(-1)).toBe("idle");
    expect(pushCount(effects)).toBe(20);
    expect(backCount(effects)).toBe(20);
  });

  it("mješoviti scenarij X → mobile back → X — push==back, idle", () => {
    const { phases, effects } = runScript([
      "user_open",
      "user_close",
      "popstate", // naš back
      "user_open",
      "popstate", // mobilni back gesta
      "user_open",
      "user_close",
      "popstate",
    ]);
    expect(phases.at(-1)).toBe("idle");
    expect(pushCount(effects)).toBe(backCount(effects));
  });
});
