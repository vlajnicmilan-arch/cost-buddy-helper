import { describe, it, expect } from 'vitest';
import {
  resolveExpenseBusinessProfileId,
  resolveSavedBusinessProfileId,
  shouldOfferOwnerFundingChoice,
  paymentSourceToCustomId,
} from '../expenseBusinessAttribution';

const projects = [
  { id: 'pr-biz', business_profile_id: 'bp-1' },
  { id: 'pr-biz2', business_profile_id: 'bp-2' },
  { id: 'pr-personal', business_profile_id: null },
];

const sources = [
  { id: 's-personal', business_profile_id: null },
  { id: 's-bp1', business_profile_id: 'bp-1' },
  { id: 's-bp2', business_profile_id: 'bp-2' },
];

describe('expenseBusinessAttribution', () => {
  it('odabrani firmin projekt određuje tvrtku troška', () => {
    expect(
      resolveExpenseBusinessProfileId({
        selectedProjectId: 'pr-biz',
        projects,
        fallbackBusinessProfileId: null,
      }),
    ).toBe('bp-1');
  });

  it('odabrani osobni projekt → NULL i u poslovnom pogledu', () => {
    expect(
      resolveExpenseBusinessProfileId({
        selectedProjectId: 'pr-personal',
        projects,
        fallbackBusinessProfileId: 'bp-1',
      }),
    ).toBeNull();
  });

  it('bez projekta ostaje današnji izvor', () => {
    expect(
      resolveExpenseBusinessProfileId({
        selectedProjectId: null,
        projects,
        fallbackBusinessProfileId: 'bp-2',
      }),
    ).toBe('bp-2');
  });

  it('nepoznat projekt ne mijenja ponašanje (fallback)', () => {
    expect(
      resolveExpenseBusinessProfileId({
        selectedProjectId: 'pr-x',
        projects,
        fallbackBusinessProfileId: 'bp-1',
      }),
    ).toBe('bp-1');
  });

  it('upis: projekt nosi konačnu vrijednost, aktivni profil je ne nadglasava', () => {
    expect(resolveSavedBusinessProfileId({ project_id: 'pr-personal', business_profile_id: null }, 'bp-1')).toBeNull();
    expect(resolveSavedBusinessProfileId({ project_id: 'pr-biz', business_profile_id: 'bp-1' }, null)).toBe('bp-1');
  });

  it('upis: bez projekta vrijedi stari fallback na aktivni profil', () => {
    expect(resolveSavedBusinessProfileId({ business_profile_id: null }, 'bp-1')).toBe('bp-1');
    expect(resolveSavedBusinessProfileId({ business_profile_id: 'bp-2' }, 'bp-1')).toBe('bp-2');
    expect(resolveSavedBusinessProfileId({}, null)).toBeNull();
  });

  it('pozajmica: firmin projekt + osobni novčanik → nudi se izbor', () => {
    expect(
      shouldOfferOwnerFundingChoice({
        expenseBusinessProfileId: 'bp-1',
        customPaymentSourceId: 's-personal',
        sources,
      }),
    ).toBe(true);
  });

  it('pozajmica: novčanik druge tvrtke → nudi se izbor', () => {
    expect(
      shouldOfferOwnerFundingChoice({
        expenseBusinessProfileId: 'bp-1',
        customPaymentSourceId: 's-bp2',
        sources,
      }),
    ).toBe(true);
  });

  it('pozajmica: novčanik iste tvrtke ili osobni trošak → nema izbora', () => {
    expect(
      shouldOfferOwnerFundingChoice({
        expenseBusinessProfileId: 'bp-1',
        customPaymentSourceId: 's-bp1',
        sources,
      }),
    ).toBe(false);
    expect(
      shouldOfferOwnerFundingChoice({
        expenseBusinessProfileId: null,
        customPaymentSourceId: 's-personal',
        sources,
      }),
    ).toBe(false);
  });

  it('paymentSourceToCustomId', () => {
    expect(paymentSourceToCustomId('custom:s-bp1')).toBe('s-bp1');
    expect(paymentSourceToCustomId('cash')).toBeNull();
    expect(paymentSourceToCustomId(null)).toBeNull();
  });
});
