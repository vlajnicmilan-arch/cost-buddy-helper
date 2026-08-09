/**
 * ČUVAR VIDLJIVOSTI PREKIDAČA (Switch).
 *
 * Uzrok kvara koji se NE smije vratiti: u tamnim temama staza je bila
 * `bg-input` uz `border-transparent` (utopljena u pozadinu), a klizač
 * `bg-background` (crn na crnom) — prekidači kategorija obavijesti bili su
 * nevidljivi na mobitelu. Statički obrazac, isti rod kao
 * `eracunPanelNoHorizontalOverflow`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const switchSrc = readFileSync('src/components/ui/switch.tsx', 'utf8');
const notifSrc = readFileSync('src/components/settings/NotificationsSection.tsx', 'utf8');

describe('Switch — vidljiv u oba stanja', () => {
  it('staza ima vidljiv rub, nikad border-transparent', () => {
    expect(switchSrc).toContain('border-border');
    expect(switchSrc).not.toContain('border-transparent');
  });

  it('isključena staza ne koristi bg-input (nevidljiv u tamnom)', () => {
    expect(switchSrc).not.toContain('data-[state=unchecked]:bg-input');
    expect(switchSrc).toContain('data-[state=unchecked]:bg-muted');
  });

  it('klizač ima vlastitu boju u oba stanja, nikad bg-background', () => {
    expect(switchSrc).not.toContain('bg-background shadow-lg');
    expect(switchSrc).toContain('data-[state=unchecked]:bg-muted-foreground');
    expect(switchSrc).toContain('data-[state=checked]:bg-primary-foreground');
  });

  it('uključena staza ostaje primarna boja', () => {
    expect(switchSrc).toContain('data-[state=checked]:bg-primary');
  });
});

describe('Prekidači kategorija obavijesti — uzak ekran', () => {
  it('prekidač se ne smije stisnuti ni zalijepiti za tekst', () => {
    const rows = notifSrc.match(/<Switch\b[^]*?\/>/g) ?? [];
    expect(rows.length).toBeGreaterThan(0);
    const categoryRows = notifSrc.match(/className="ml-3 shrink-0"/g) ?? [];
    expect(categoryRows.length).toBeGreaterThanOrEqual(2);
  });

  it('tekst retka je skraćiv (min-w-0 + truncate), pa ne gura prekidač van', () => {
    expect(notifSrc).toContain('min-w-0');
    expect(notifSrc).toContain('truncate');
  });
});
