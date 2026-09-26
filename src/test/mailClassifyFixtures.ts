import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Doslovni tekstovi stavki iz žive baze (rujan 2026), pretvoreni u tekst
 * istim putem kao `mail-process` (body-plain ili htmlToText). Prvi redak
 * nosi naslov, drugi pošiljatelja, tijelo je iza `---`.
 */
const DIR = join(__dirname, 'fixtures', 'mailClassify');

export function loadMailFixture(id: string): { subject: string; from: string; body: string } {
  const raw = readFileSync(join(DIR, `${id}.txt`), 'utf8');
  const [head, ...rest] = raw.split('\n---\n');
  const subject = /^SUBJECT: (.*)$/m.exec(head)?.[1] ?? '';
  const from = /^FROM: (.*)$/m.exec(head)?.[1] ?? '';
  return { subject, from, body: rest.join('\n---\n') };
}

export function loadPdfFixture(id: string): string {
  return readFileSync(join(DIR, `${id}.pdf.txt`), 'utf8');
}

/** Vlastiti OIB-ovi vlasnika (business_profiles: Akrobat, Tactura). */
export const OWN_OIBS = ['39916265994', '33941873288'];
