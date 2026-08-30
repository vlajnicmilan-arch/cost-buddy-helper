/**
 * Brana: pozivnica mora biti dostupna NEPRIJAVLJENOM posjetitelju,
 * a povratna adresa mora preživjeti prijelaz na /auth.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  rememberAuthReturn,
  readAuthReturn,
  consumeAuthReturn,
  resolveAuthReturnPath,
} from '@/lib/authReturn';
import { isPublicRoute } from '@/lib/publicRoutes';

describe('authReturn', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('stores and reads a safe in-app path', () => {
    rememberAuthReturn('/join-project/abc123');
    expect(readAuthReturn()).toBe('/join-project/abc123');
  });

  it('rejects off-site and protocol-relative paths', () => {
    rememberAuthReturn('//evil.example.com');
    expect(readAuthReturn()).toBeNull();
    rememberAuthReturn('https://evil.example.com');
    expect(readAuthReturn()).toBeNull();
  });

  it('consume clears the stored path', () => {
    rememberAuthReturn('/join-budget/tok');
    expect(consumeAuthReturn()).toBe('/join-budget/tok');
    expect(readAuthReturn()).toBeNull();
  });

  it('resolves in priority order: next → state → stored', () => {
    expect(resolveAuthReturnPath('?next=/a', '/b', '/c')).toBe('/a');
    expect(resolveAuthReturnPath('', '/b', '/c')).toBe('/b');
    expect(resolveAuthReturnPath('', null, '/c')).toBe('/c');
    expect(resolveAuthReturnPath('', null, null)).toBeNull();
  });

  it('ignores an unsafe ?next=', () => {
    expect(resolveAuthReturnPath('?next=//evil.com', null, '/join-project/x')).toBe('/join-project/x');
  });

  it('survives the round trip through /auth (sign-in returns to the invite)', () => {
    // 1. anonymous visitor opens the invite and clicks "create account"
    rememberAuthReturn('/join-project/tok-1');
    // 2. App.tsx computes the destination once the user exists
    const target = resolveAuthReturnPath('', undefined, readAuthReturn());
    expect(target).toBe('/join-project/tok-1');
  });
});

describe('invite routes are public', () => {
  it('join-project and join-budget count as public routes', () => {
    expect(isPublicRoute('/join-project/abc')).toBe(true);
    expect(isPublicRoute('/join-budget/abc')).toBe(true);
  });
});

describe('App.tsx registers invite routes in every routing phase', () => {
  it('has the routes outside the authenticated phase', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/App.tsx', 'utf8');
    const projectRoutes = src.match(/path="\/join-project\/:token"/g) || [];
    const budgetRoutes = src.match(/path="\/join-budget\/:token"/g) || [];
    // no-storage-mode phase + cloud-without-user phase + authenticated phase
    expect(projectRoutes.length).toBeGreaterThanOrEqual(3);
    expect(budgetRoutes.length).toBeGreaterThanOrEqual(3);
  });
});
