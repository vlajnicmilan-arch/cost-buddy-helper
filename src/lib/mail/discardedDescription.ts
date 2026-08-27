/**
 * DOKUMENTI → „Odbačeno": OPIS STAVKE PO VRSTI.
 *
 * Odbačena stavka nije nužno račun. Gmailova potvrda prosljeđivanja, duplikat
 * privitka ili nepodržani privitak nemaju ni iznos ni izdavatelja, pa su se
 * prikazivali kao prazni računi („— · —") — popis je izgledao pokvareno.
 * Ovdje se za svaku vrstu određuje vlastiti naslov i kratko objašnjenje.
 *
 * Čista funkcija: vraća i18n ključeve i rezervni tekst, bez ovisnosti o UI-ju.
 */

export interface DiscardedDescription {
  /** `special` = vlastiti opis; `invoice` = uobičajena polja računa. */
  kind: 'special' | 'invoice';
  titleKey: string;
  titleFallback: string;
  reasonKey: string;
  reasonFallback: string;
}

const SPECIAL: Record<string, { title: string; reason: string }> = {
  verifikacija_prosljedjivanja: {
    title: 'Gmail potvrda prosljeđivanja',
    reason: 'Poruka od Googlea za potvrdu prosljeđivanja — nije dokument.',
  },
  privitak_nepodrzan: {
    title: 'Privitak nije podržan',
    reason: 'Mail je stigao, ali privitak nije bilo moguće pročitati.',
  },
  duplikat_privitka: {
    title: 'Duplikat privitka',
    reason: 'Isti privitak je već obrađen ranije.',
  },
  izvod: {
    title: 'Bankovni izvod',
    reason: 'Izvod nije spojen s računom plaćanja.',
  },
  nije_za_nas: {
    title: 'Nije dokument za obradu',
    reason: 'U poruci nema računa ni izvoda.',
  },
  nepoznato: {
    title: 'Neprepoznata poruka',
    reason: 'Vrstu dokumenta nije bilo moguće odrediti.',
  },
};

export const describeDiscardedItem = (params: {
  classification: string | null;
  extraction?: Record<string, unknown> | null;
  subject?: string | null;
}): DiscardedDescription => {
  const cls = params.classification ?? '';
  // Potvrda plaćanja s izjavom „ovo nije račun" ima SVOJ razlog — generičko
  // „u poruci nema računa" bi lagalo: pošiljatelj je izričito rekao što je.
  if (cls === 'nije_za_nas' && params.extraction?.not_invoice_declaration) {
    return {
      kind: 'special',
      titleKey: 'documents.discarded.kind.potvrda_placanja.title',
      titleFallback: 'Potvrda plaćanja — nije račun',
      reasonKey: 'documents.discarded.kind.potvrda_placanja.reason',
      reasonFallback: 'Pošiljatelj sam navodi da ovo nije račun.',
    };
  }
  const special = SPECIAL[cls];
  if (special) {
    return {
      kind: 'special',
      titleKey: `documents.discarded.kind.${cls}.title`,
      titleFallback: special.title,
      reasonKey: `documents.discarded.kind.${cls}.reason`,
      reasonFallback: special.reason,
    };
  }
  return {
    kind: 'invoice',
    titleKey: '',
    titleFallback: '',
    reasonKey: '',
    reasonFallback: '',
  };
};
