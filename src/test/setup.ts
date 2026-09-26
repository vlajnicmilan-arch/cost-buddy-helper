import "@testing-library/jest-dom";
import { vi } from "vitest";

// Tests must never write diagnostics to the live app_diagnostics_logs table.
// Files that assert on the logger declare their own vi.mock (or vi.unmock).
vi.mock("@/lib/diagnosticLogger", () => ({
  logDiagnostic: vi.fn(),
  logPerformance: vi.fn(),
  withPerfTracking: async (_action: string, fn: () => Promise<unknown>) => fn(),
  getDiagnosticSessionId: () => "test-session",
}));

(globalThis as any).__APP_VERSION__ = "0.0.0-test";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

