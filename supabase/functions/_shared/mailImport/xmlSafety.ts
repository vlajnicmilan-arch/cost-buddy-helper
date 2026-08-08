/**
 * MAIL UVOZ — sigurnosni ulaz za XML.
 *
 * DTD i vanjski entiteti su TVRDO ISKLJUČENI. Ne pokušavamo "očistiti" ulaz;
 * dokument koji sadrži DOCTYPE ili deklaraciju entiteta se odbija prije nego
 * ijedan parser vidi bajtove. Time XXE i billion-laughs nemaju gdje nastati.
 */

export type XmlRejection =
  | 'doctype_nije_dopusten'
  | 'entitet_nije_dopusten'
  | 'vanjski_entitet'
  | 'prazan_dokument';

export interface XmlSafetyVerdict {
  safe: boolean;
  reason: XmlRejection | null;
}

/** Uklanja komentare kako se zabranjeni oblici ne bi mogli sakriti u njima. */
const stripComments = (xml: string): string => xml.replace(/<!--[\s\S]*?-->/g, '');

export function inspectXml(xml: string): XmlSafetyVerdict {
  const text = stripComments(xml ?? '');
  if (text.trim().length === 0) return { safe: false, reason: 'prazan_dokument' };

  if (/<!DOCTYPE/i.test(text)) return { safe: false, reason: 'doctype_nije_dopusten' };
  if (/<!ENTITY/i.test(text)) return { safe: false, reason: 'entitet_nije_dopusten' };
  if (/\bSYSTEM\s+["']/i.test(text) || /\bPUBLIC\s+["']/i.test(text)) {
    return { safe: false, reason: 'vanjski_entitet' };
  }
  return { safe: true, reason: null };
}

export function isXmlSafe(xml: string): boolean {
  return inspectXml(xml).safe;
}

export class XmlUnsafeError extends Error {
  readonly reason: XmlRejection;
  constructor(reason: XmlRejection) {
    super(`xml_unsafe: ${reason}`);
    this.name = 'XmlUnsafeError';
    this.reason = reason;
  }
}

/** Baca prije parsiranja. Jedini dopušten ulaz u `parseUbl`. */
export function assertXmlSafe(xml: string): string {
  const verdict = inspectXml(xml);
  if (!verdict.safe) throw new XmlUnsafeError(verdict.reason!);
  return xml;
}
