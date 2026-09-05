import { describe, it, expect } from 'vitest';
import {
  transitionMessage,
  transitionAttachment,
  transitionDocument,
  canTransitionMessage,
  IngestTransitionError,
  INITIAL_STATES,
} from '@/lib/ingestStateMachines';

describe('ingest state machines — PORUKA', () => {
  it('dopušta specificirane prijelaze', () => {
    expect(transitionMessage('primljena', 'u_obradi')).toBe('u_obradi');
    expect(transitionMessage('u_obradi', 'zavrsena')).toBe('zavrsena');
    expect(transitionMessage('primljena', 'ceka_kvotu')).toBe('ceka_kvotu');
    expect(transitionMessage('ceka_kvotu', 'u_obradi')).toBe('u_obradi');
    expect(transitionMessage('ceka_kvotu', 'istekla')).toBe('istekla');
    expect(transitionMessage('primljena', 'zaustavljena_branom')).toBe('zaustavljena_branom');
    expect(transitionMessage('zaustavljena_branom', 'u_obradi')).toBe('u_obradi');
    expect(transitionMessage('zaustavljena_branom', 'obrisana')).toBe('obrisana');
    expect(transitionMessage('u_obradi', 'neuspjela')).toBe('neuspjela');
    expect(transitionMessage('neuspjela', 'u_obradi')).toBe('u_obradi');
    expect(transitionMessage('neuspjela', 'neuspjela_konacno')).toBe('neuspjela_konacno');
  });

  it('baca na prijelaz izvan tablice', () => {
    expect(() => transitionMessage('primljena', 'zavrsena')).toThrow(IngestTransitionError);
    expect(() => transitionMessage('zavrsena', 'u_obradi')).toThrow(IngestTransitionError);
    expect(() => transitionMessage('istekla', 'u_obradi')).toThrow(IngestTransitionError);
    expect(canTransitionMessage('primljena', 'zavrsena')).toBe(false);
  });

  it('početno stanje je primljena', () => {
    expect(INITIAL_STATES.message).toBe('primljena');
  });
});

describe('ingest state machines — PRIVITAK', () => {
  it('ceka_sken → siguran | karantena', () => {
    expect(transitionAttachment('ceka_sken', 'siguran')).toBe('siguran');
    expect(transitionAttachment('ceka_sken', 'karantena')).toBe('karantena');
  });
  it('terminalna stanja ne idu dalje', () => {
    expect(() => transitionAttachment('siguran', 'karantena')).toThrow(IngestTransitionError);
    expect(() => transitionAttachment('karantena', 'siguran')).toThrow(IngestTransitionError);
  });
});

describe('ingest state machines — DOKUMENT', () => {
  it('glavni tok', () => {
    expect(transitionDocument('klasificiran', 'izvucen')).toBe('izvucen');
    expect(transitionDocument('izvucen', 'na_pregledu')).toBe('na_pregledu');
    expect(transitionDocument('na_pregledu', 'potvrdjen')).toBe('potvrdjen');
    expect(transitionDocument('potvrdjen', 'povezan')).toBe('povezan');
  });
  it('grane', () => {
    expect(transitionDocument('klasificiran', 'nije_za_nas')).toBe('nije_za_nas');
    expect(transitionDocument('izvucen', 'odbaceno')).toBe('odbaceno');
    expect(transitionDocument('na_pregledu', 'odbacio_korisnik')).toBe('odbacio_korisnik');
  });
  it('odbacio_korisnik postoji samo iz na_pregledu', () => {
    expect(() => transitionDocument('klasificiran', 'odbacio_korisnik')).toThrow(IngestTransitionError);
    expect(() => transitionDocument('izvucen', 'odbacio_korisnik')).toThrow(IngestTransitionError);
  });
  it('preskakanje koraka nije dopušteno', () => {
    expect(() => transitionDocument('klasificiran', 'povezan')).toThrow(IngestTransitionError);
    expect(() => transitionDocument('povezan', 'potvrdjen')).toThrow(IngestTransitionError);
  });
  // Oslobađanje lažno povezanog dokumenta (uvoz ne postoji) — serverska brana
  // je u `mail_item_release_linked`, stroj stanja samo dopušta prijelaz.
  it('povezan se smije vratiti na pregled', () => {
    expect(transitionDocument('povezan', 'na_pregledu')).toBe('na_pregledu');
  });
});
