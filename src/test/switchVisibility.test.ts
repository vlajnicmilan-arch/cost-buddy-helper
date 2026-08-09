/**
 * ČUVAR VIDLJIVOSTI PREKIDAČA (Switch) — v2 NAČELO.
 *
 * v0 (nevidljivo): staza `bg-input` + proziran rub, klizač `bg-background`.
 * v1 (i dalje nevidljivo u osobnoj tamnoj temi): `bg-muted` + `border-border` —
 * oba AMBIJENTALNA tokena, razlika prema pozadini je matematička, ne vidljiva.
 * v2: isključena staza i rub izvedeni iz FOREGROUND tokena (`muted-foreground`),
 * koji je po definiciji na suprotnom kraju ljestvice od pozadine u SVAKOJ temi.
 *
 * Test pada i na v0 i na v1 stilu.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const switchSrc = readFileSync('src/components/ui/switch.tsx', 'utf8');
const notifSrc = readFileSync('src/components/settings/NotificationsSection.tsx', 'utf8');

describe('Switch — vidljiv u oba stanja, neovisno o temi', () => {
  it('isključena staza je foreground-bazirana, nikad ambijentalna', () => {
    expect(switchSrc).toMatch(/data-\[state=unchecked\]:bg-muted-foreground\//);
    for (const banned of [
      'data-[state=unchecked]:bg-input',
      'data-[state=unchecked]:bg-muted ',
      'data-[state=unchecked]:bg-muted"',
      'data-[state=unchecked]:bg-background',
    ]) {
      expect(switchSrc).not.toContain(banned);
    }
  });

  it('rub isključene staze je također foreground-baziran', () => {
    expect(switchSrc).toMatch(/data-\[state=unchecked\]:border-muted-foreground\//);
    expect(switchSrc).not.toContain('border-transparent');
  });

  it('klizač ima suprotnost prema stazi u oba stanja', () => {
    expect(switchSrc).toContain('data-[state=unchecked]:bg-background');
    expect(switchSrc).toContain('data-[state=checked]:bg-primary-foreground');
  });

  it('uključena staza ostaje primarna boja', () => {
    expect(switchSrc).toContain('data-[state=checked]:bg-primary');
  });
});

describe('Prekidači kategorija obavijesti — uzak ekran', () => {
  it('prekidači se ne stišću', () => {
    const categoryRows = notifSrc.match(/shrink-0/g) ?? [];
    expect(categoryRows.length).toBeGreaterThanOrEqual(6);
  });

  it('tekst retka je skraćiv (min-w-0 + truncate), pa ne gura prekidač van', () => {
    expect(notifSrc).toContain('min-w-0');
    expect(notifSrc).toContain('truncate');
  });
});
