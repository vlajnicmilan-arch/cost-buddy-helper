/**
 * Guard — "Uredi" samo autoru transakcije.
 *
 * Prije popravka je `TransactionDetailDialog` svakome nudio Edit; RLS bi tek na
 * spremanju odbio promjenu, pa je korisnik vidio put koji ne postoji (Krug:
 * Milan je mogao otvoriti edit tuđeg troška). Autorstvo se čita iz
 * `submitted_by ?? user_id`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(resolve(__dirname, '../components/TransactionDetailDialog.tsx'), 'utf8');

describe('TransactionDetailDialog edit gate', () => {
  it('derives the author from submitted_by with a user_id fallback', () => {
    expect(SRC).toMatch(/const authorId = expense\.submitted_by \|\| expense\.user_id/);
  });

  it('computes canEdit from the viewer identity', () => {
    expect(SRC).toMatch(/const canEdit =[\s\S]{0,200}authorId === user\?\.id/);
  });

  it('renders the edit button only when canEdit', () => {
    expect(SRC).toMatch(/\{canEdit && \(\s*\n\s*<Button/);
  });

  it('re-checks the gate inside handleEdit', () => {
    expect(SRC).toMatch(/const handleEdit = \([\s\S]{0,80}?if \(!canEdit\) return;/);
  });
});
