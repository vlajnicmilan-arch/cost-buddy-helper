/**
 * Zajednički POTPUN lažni modul za `react-i18next`.
 *
 * Krnji mockovi (samo `useTranslation`) pucaju čim testni lanac uvoza dosegne
 * `src/i18n/index.ts`, koji radi `.use(initReactI18next)`:
 *   Error: [vitest] No "initReactI18next" export is defined on the "react-i18next" mock.
 *
 * Zato svaki test koji mockira `react-i18next` mora krenuti od ove tvornice
 * i po potrebi prepisati samo ono što stvarno mijenja:
 *
 *   vi.mock('react-i18next', () => ({
 *     ...createReactI18nextMock(),
 *     useTranslation: () => ({ t: mojT }),
 *   }));
 *
 * ili kraće, kroz `t` / `language` izmjene:
 *
 *   vi.mock('react-i18next', () => createReactI18nextMock({ t: mojT }));
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export type MockTFunction = (key: string, ...args: any[]) => any;

export interface ReactI18nextMockOverrides {
  /** Zamjena za `t()`. Zadano: vraća fallback (2. argument) ako je string, inače ključ. */
  t?: MockTFunction;
  /** Vrijednost `i18n.language`. Zadano 'hr'. */
  language?: string;
  /** Bilo koji dodatni izvoz koji test želi prepisati (npr. vlastiti useTranslation). */
  [extraExport: string]: unknown;
}

const defaultT: MockTFunction = (key: string, fallback?: unknown) =>
  typeof fallback === 'string' ? fallback : key;

export function createReactI18nextMock(overrides: ReactI18nextMockOverrides = {}) {
  const { t, language = 'hr', ...rest } = overrides;
  const tFn: MockTFunction = t ?? defaultT;

  const i18n = {
    language,
    languages: [language],
    resolvedLanguage: language,
    t: tFn,
    changeLanguage: async () => tFn,
    exists: () => true,
    on: () => {},
    off: () => {},
    use() {
      return this;
    },
    init: async () => {},
  };

  const passthrough = ({ children }: { children?: unknown } = {}) => (children ?? null) as any;

  return {
    useTranslation: () => ({ t: tFn, i18n, ready: true }),
    Trans: passthrough,
    Translation: ({ children }: { children?: unknown }) =>
      (typeof children === 'function' ? (children as any)(tFn, { i18n }) : (children ?? null)) as any,
    I18nextProvider: passthrough,
    withTranslation: () => (Component: any) => Component,
    useSSR: () => {},
    initReactI18next: { type: '3rdParty' as const, init: () => {} },
    getI18n: () => i18n,
    setI18n: () => {},
    setDefaults: () => {},
    getDefaults: () => ({}),
    composeInitialProps: (fn: any) => fn,
    getInitialProps: () => ({}),
    date: () => '',
    ...rest,
  };
}
