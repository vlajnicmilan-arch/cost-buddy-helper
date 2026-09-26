/**
 * Krug "Dijeli samo X": provjera svote, polje i prikaz "X od Y".
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import {
  validateSharedAmount,
  effectiveSharedAmount,
  isPartialShare,
} from '@/lib/krugSharedAmount';

vi.mock('react-i18next', async () => ({
  ...(await import('@/test/mocks/reactI18next')).createReactI18nextMock(),
  useTranslation: () => ({
    t: (_key: string, fallback?: string, vars?: Record<string, string>) =>
      (fallback ?? _key).replace(/\{\{(\w+)\}\}/g, (_m, k) => String(vars?.[k] ?? '')),
    i18n: { language: 'en' },
  }),
}));

import { KrugSharedAmountField, KrugSharedOfLine } from './KrugSharedAmount';

describe('validateSharedAmount', () => {
  it('prazno = cijeli iznos (null)', () => {
    expect(validateSharedAmount('', 40)).toEqual({ ok: true, value: null });
    expect(validateSharedAmount('   ', 40)).toEqual({ ok: true, value: null });
  });
  it('prihvaća svotu ≤ iznos, i zarez', () => {
    expect(validateSharedAmount('12', 40)).toEqual({ ok: true, value: 12 });
    expect(validateSharedAmount('12,50', 40)).toEqual({ ok: true, value: 12.5 });
    expect(validateSharedAmount('40', 40)).toEqual({ ok: true, value: 40 });
  });
  it('odbija veću svotu, nulu i smeće', () => {
    expect(validateSharedAmount('40.01', 40)).toEqual({ ok: false, error: 'exceeds' });
    expect(validateSharedAmount('0', 40)).toEqual({ ok: false, error: 'invalid' });
    expect(validateSharedAmount('abc', 40)).toEqual({ ok: false, error: 'invalid' });
  });
  it('LEAST pravilo kao u preview-u', () => {
    expect(effectiveSharedAmount(null, 40)).toBe(40);
    expect(effectiveSharedAmount(12, 40)).toBe(12);
    expect(effectiveSharedAmount(12, 10)).toBe(10);
    expect(isPartialShare(12, 40)).toBe(true);
    expect(isPartialShare(null, 40)).toBe(false);
    expect(isPartialShare(12, 10)).toBe(false);
  });
});

function FieldHarness() {
  const [v, setV] = useState('');
  return <KrugSharedAmountField value={v} onChange={setV} expenseAmount={40} currency="EUR" />;
}

describe('KrugSharedAmountField', () => {
  it('prikazuje grešku kad je svota veća od iznosa', () => {
    render(<FieldHarness />);
    const input = screen.getByTestId('krug-shared-amount');
    fireEvent.change(input, { target: { value: '41' } });
    expect(screen.getByText('Dijeljena svota ne smije biti veća od iznosa troška.')).toBeTruthy();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    fireEvent.change(input, { target: { value: '12' } });
    expect(input.getAttribute('aria-invalid')).toBe('false');
  });
});

describe('KrugSharedOfLine', () => {
  it('prikazuje "X od Y" kad se dijeli dio', () => {
    render(<KrugSharedOfLine sharedAmount={12} expenseAmount={40} currency="EUR" />);
    const el = screen.getByTestId('krug-shared-of');
    expect(el.textContent).toContain('12.00');
    expect(el.textContent).toContain('40.00');
  });
  it('ne prikazuje ništa za cijeli iznos (NULL)', () => {
    render(<KrugSharedOfLine sharedAmount={null} expenseAmount={40} currency="EUR" />);
    expect(screen.queryByTestId('krug-shared-of')).toBeNull();
  });
  it('nakon spajanja na manji iznos koristi LEAST i ne prikazuje dio', () => {
    render(<KrugSharedOfLine sharedAmount={12} expenseAmount={10} currency="EUR" />);
    expect(screen.queryByTestId('krug-shared-of')).toBeNull();
  });
});
