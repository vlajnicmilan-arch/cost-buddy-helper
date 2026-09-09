import { describe, it, expect } from 'vitest';
import {
  isRlsDenied,
  moduleForTable,
  parseModuleWriteDenial,
} from '@/lib/moduleWriteDenied';

describe('odbijeni upis u modulnu tablicu', () => {
  it('prepoznaje 42501', () => {
    expect(isRlsDenied({ code: '42501', message: 'permission denied' })).toBe(true);
  });

  it('prepoznaje poruku o row-level security policyju', () => {
    expect(isRlsDenied({ code: null, message: 'new row violates row-level security policy' })).toBe(true);
  });

  it('obična greška nije RLS odbijenica', () => {
    expect(isRlsDenied({ code: '23505', message: 'duplicate key' })).toBe(false);
    expect(isRlsDenied(null)).toBe(false);
  });

  it('mapira tablice na module', () => {
    expect(moduleForTable('recurring_transactions')).toBe('smjer');
    expect(moduleForTable('installment_plans')).toBe('smjer');
    expect(moduleForTable('savings_goals')).toBe('smjer');
    expect(moduleForTable('krug')).toBe('krug');
    expect(moduleForTable('projects')).toBe('projekti');
    expect(moduleForTable('clients')).toBe('biznis');
    expect(moduleForTable('expenses')).toBeNull();
  });

  it('vraća opis odbijenice s modulom paywalla i doslovnim kodom', () => {
    const d = parseModuleWriteDenial('recurring_transactions', {
      code: '42501',
      message: 'new row violates row-level security policy for table "recurring_transactions"',
    });
    expect(d).not.toBeNull();
    expect(d!.module).toBe('smjer');
    expect(d!.gateModule).toBe('smjer');
    expect(d!.code).toBe('42501');
    expect(d!.message).toContain('row-level security');
  });

  it('krug odbijenica vodi na krug paywall', () => {
    expect(parseModuleWriteDenial('krug', { code: '42501' })!.gateModule).toBe('krug');
    expect(parseModuleWriteDenial('clients', { code: '42501' })!.gateModule).toBe('business');
    expect(parseModuleWriteDenial('projects', { code: '42501' })!.gateModule).toBe('projects');
  });

  it('nemodulna tablica ili nemodulna greška ne aktivira poruku', () => {
    expect(parseModuleWriteDenial('expenses', { code: '42501' })).toBeNull();
    expect(parseModuleWriteDenial('krug', { code: '23505', message: 'dup' })).toBeNull();
  });
});
