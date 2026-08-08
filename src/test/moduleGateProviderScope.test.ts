/**
 * Source-level guard: svi globalni hostovi i AppRoutes MORAJU biti unutar
 * <ModuleGateProvider> u src/App.tsx.
 *
 * Uzrok kvara 8.8.2026: ModuleGateProvider je omatao samo <AppRoutes />, a
 * globalni <GlobalReceiptScanHost /> (koji mounta AddExpenseDialog) bio je
 * njegov sibling IZNAD providera. useModuleGate je tamo padao na no-op
 * fallback, pa Krug chip nije reagirao na klik.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const APP = resolve(__dirname, '..', 'App.tsx');

const REQUIRED_INSIDE = [
  'GlobalReceiptScanHost',
  'GlobalPDFImportHost',
  'GlobalDecisionCaptureHost',
  'RouteAwareGlobalOverlays',
  'CorrectionDeleteConfirmHost',
  'ReconciliationDialogHost',
  'ImportBatchDialogHost',
  'AppRoutes',
];

export const assertHostsInsideGate = (src: string) => {
  const open = src.indexOf('<ModuleGateProvider>');
  const close = src.indexOf('</ModuleGateProvider>');
  if (open === -1 || close === -1) {
    throw new Error('ModuleGateProvider nije pronađen u App.tsx');
  }
  const inside = src.slice(open, close);
  const missing = REQUIRED_INSIDE.filter((name) => !inside.includes(`<${name} />`));
  if (missing.length > 0) {
    throw new Error(
      `Sljedeći globalni hostovi su IZVAN ModuleGateProvider-a: ${missing.join(', ')}`,
    );
  }
};

describe('App.tsx — ModuleGateProvider scope', () => {
  const src = readFileSync(APP, 'utf8');

  it('svi globalni hostovi i AppRoutes su unutar ModuleGateProvider-a', () => {
    expect(() => assertHostsInsideGate(src)).not.toThrow();
  });

  it('ModuleGateProvider je unutar BackButtonProvider-a', () => {
    const back = src.indexOf('<BackButtonProvider>');
    const gate = src.indexOf('<ModuleGateProvider>');
    expect(back).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(back);
  });

  it('samodokaz — staro stablo (host iznad providera) bi palo', () => {
    const broken = `
      <BackButtonProvider>
        <GlobalReceiptScanHost />
        <GlobalPDFImportHost />
        <GlobalDecisionCaptureHost />
        <RouteAwareGlobalOverlays />
        <CorrectionDeleteConfirmHost />
        <ReconciliationDialogHost />
        <ImportBatchDialogHost />
        <ModuleGateProvider>
          <AppRoutes />
        </ModuleGateProvider>
      </BackButtonProvider>`;
    expect(() => assertHostsInsideGate(broken)).toThrow(/GlobalReceiptScanHost/);
  });
});
