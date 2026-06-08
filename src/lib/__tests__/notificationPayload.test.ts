import { describe, it, expect } from 'vitest';
import { normalizePayload } from '@/lib/notificationPayload';

describe('normalizePayload', () => {
  it('returns nulls when type and data are missing', () => {
    const p = normalizePayload(null, null);
    expect(p.route).toBeNull();
    expect(p.highlight).toBeNull();
  });

  it('uses standardized route + nested highlight from DB jsonb', () => {
    const p = normalizePayload('project_transaction', {
      route: '/projects?id=P1',
      fallback_route: '/projects',
      highlight: { type: 'expense', id: 'E1' },
    });
    expect(p.route).toBe('/projects?id=P1');
    expect(p.highlight).toEqual({ type: 'expense', id: 'E1' });
  });

  it('uses flat highlight_type/highlight_id from FCM data', () => {
    const p = normalizePayload('milestone_deadline', {
      route: '/projects?id=P1',
      highlight_type: 'milestone',
      highlight_id: 'M1',
    });
    expect(p.route).toBe('/projects?id=P1');
    expect(p.highlight).toEqual({ type: 'milestone', id: 'M1' });
  });

  it('reads highlight.tab from nested DB payload', () => {
    const p = normalizePayload('milestone_deadline', {
      route: '/projects?id=P1',
      highlight: { type: 'milestone', id: 'M1', tab: 'phases' },
    });
    expect(p.highlight).toEqual({ type: 'milestone', id: 'M1', tab: 'phases' });
  });

  it('reads highlight_tab from flat FCM payload', () => {
    const p = normalizePayload('overdue_invoice', {
      route: '/projects?id=P1',
      highlight_type: 'invoice',
      highlight_id: 'I1',
      highlight_tab: 'funding',
    });
    expect(p.highlight).toEqual({ type: 'invoice', id: 'I1', tab: 'funding' });
  });

  it('falls back to legacy mapping for project_transaction without route', () => {
    const p = normalizePayload('project_transaction', { project_id: 'P1', expense_id: 'E1' });
    expect(p.route).toBe('/projects?id=P1');
    expect(p.highlight).toEqual({ type: 'expense', id: 'E1', tab: 'transactions' });
    expect(p.fallback_route).toBe('/projects');
  });

  it('legacy budget_alert resolves to /budgets and budget highlight', () => {
    const p = normalizePayload('budget_alert', { budget_id: 'B1' });
    expect(p.route).toBe('/budgets?id=B1');
    expect(p.highlight).toEqual({ type: 'budget', id: 'B1' });
  });

  it('legacy payment_source_transaction resolves to wallet and expense highlight', () => {
    const p = normalizePayload('payment_source_transaction', {
      payment_source_id: 'S1',
      expense_id: 'E2',
    });
    expect(p.route).toBe('/wallet?source=S1');
    expect(p.highlight).toEqual({ type: 'expense', id: 'E2' });
  });

  it('legacy milestone_deadline maps to phases tab', () => {
    const p = normalizePayload('milestone_deadline', { project_id: 'P1', milestone_id: 'M1' });
    expect(p.route).toBe('/projects?id=P1');
    expect(p.highlight).toEqual({ type: 'milestone', id: 'M1', tab: 'phases' });
  });

  it('legacy milestone_budget maps to phases tab', () => {
    const p = normalizePayload('milestone_budget', { project_id: 'P1', milestone_id: 'M2' });
    expect(p.highlight).toEqual({ type: 'milestone', id: 'M2', tab: 'phases' });
  });

  it('legacy overdue_invoice maps to funding tab', () => {
    const p = normalizePayload('overdue_invoice', { project_id: 'P1', invoice_id: 'I1' });
    expect(p.highlight).toEqual({ type: 'invoice', id: 'I1', tab: 'funding' });
  });

  it('legacy project_activity maps to activity tab', () => {
    const p = normalizePayload('project_activity', { project_id: 'P1' });
    expect(p.highlight).toEqual({ type: 'project', id: 'P1', tab: 'activity' });
  });

  it('legacy note_added maps to activity tab', () => {
    const p = normalizePayload('note_added', { project_id: 'P1', note_id: 'N1' });
    expect(p.highlight).toEqual({ type: 'note', id: 'N1', tab: 'activity' });
  });

  it('legacy project_loss_zone maps to overview tab', () => {
    const p = normalizePayload('project_loss_zone', { project_id: 'P1' });
    expect(p.highlight).toEqual({ type: 'project', id: 'P1', tab: 'overview' });
  });

  it('legacy app_update resolves to /install', () => {
    const p = normalizePayload('app_update', { version: '1.2.3' });
    expect(p.route).toBe('/install');
  });

  it('legacy reminder resolves to /calendar', () => {
    const p = normalizePayload('reminder', { reminder_id: 'R1' });
    expect(p.route).toBe('/calendar');
    expect(p.highlight).toEqual({ type: 'reminder', id: 'R1' });
  });

  it('unknown type returns null route', () => {
    const p = normalizePayload('weird_unknown', { foo: 'bar' });
    expect(p.route).toBeNull();
    expect(p.highlight).toBeNull();
  });

  it('reads type from data when not provided explicitly', () => {
    const p = normalizePayload(null, { type: 'project_transaction', project_id: 'P1' });
    expect(p.type).toBe('project_transaction');
    expect(p.route).toBe('/projects?id=P1');
  });
});
