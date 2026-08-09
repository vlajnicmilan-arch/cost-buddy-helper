import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

/**
 * ČUVAR ŠIRINE POSTAVKI (isti rod kao `eracunPanelNoHorizontalOverflow`).
 *
 * Uzrok kvara koji se NE smije vratiti: Radix ScrollArea ubacuje unutarnji
 * `div` sa `display:table` (inline stil). Tablica se širi na `max-content`, pa
 * je sadržaj predvorja postavki na mobitelu bio ŠIRI od dijaloga; Root ima
 * `overflow-hidden`, vodoravne trake nema → desni stupac (prekidači) se
 * AMPUTIRAO bez scrolla. Vidljiv je bio tek u landscape orijentaciji.
 */
describe('Postavke — bez vodoravnog preljeva', () => {
  const scrollArea = read('src/components/ui/scroll-area.tsx');
  const dialog = read('src/components/settings/SettingsDialog.tsx');
  const notif = read('src/components/settings/NotificationsSection.tsx');

  it('ScrollArea Viewport gasi Radixov display:table na unutarnjem divu', () => {
    expect(scrollArea).toContain('[&>div]:!block');
    expect(scrollArea).toContain('[&>div]:!w-full');
    expect(scrollArea).toContain('[&>div]:!min-w-0');
  });

  it('ScrollArea Root ne može narasti preko roditelja', () => {
    expect(scrollArea).toMatch(/relative overflow-hidden w-full min-w-0/);
  });

  it('omotač sadržaja postavki je širinski stegnut', () => {
    expect(dialog).toMatch(/max-h-\[70vh\] w-full min-w-0 overflow-x-hidden/);
    expect(dialog).toMatch(/space-y-6 py-4 pr-2 w-full min-w-0/);
    expect(dialog).not.toMatch(/<ScrollArea className="max-h-\[70vh\]">/);
  });

  it('svaki redak obavijesti ima razmak i skupljiv tekst', () => {
    const rows = notif.match(/flex items-center justify-between gap-3 min-w-0/g) ?? [];
    expect(rows.length).toBeGreaterThanOrEqual(4);
  });

  it('nijedan prekidač u obavijestima se ne smije stisnuti', () => {
    const switches = notif.match(/<Switch\b/g) ?? [];
    const shrink = notif.match(/shrink-0/g) ?? [];
    expect(switches.length).toBeGreaterThan(0);
    expect(shrink.length).toBeGreaterThanOrEqual(switches.length);
  });
});
