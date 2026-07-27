import { describe, it, expect } from 'vitest';
import { capitalizeNewChar } from '../textCase';

describe('capitalizeNewChar', () => {
  it('kapitalizira prvi znak polja', () => {
    const r = capitalizeNewChar('', 'a', null);
    expect(r.value).toBe('A');
    expect(r.cappedIdx).toBe(0);
  });

  it('kapitalizira slovo nakon točke + razmaka', () => {
    const r = capitalizeNewChar('Prvo. ', 'Prvo. d', null);
    expect(r.value).toBe('Prvo. D');
    expect(r.cappedIdx).toBe(6);
  });

  it('kapitalizira nakon uskličnika i upitnika', () => {
    expect(capitalizeNewChar('Ok! ', 'Ok! z', null).value).toBe('Ok! Z');
    expect(capitalizeNewChar('Sto? ', 'Sto? p', null).value).toBe('Sto? P');
  });

  it('ne dira sredinu riječi', () => {
    const r = capitalizeNewChar('abc', 'abcd', null);
    expect(r.value).toBe('abcd');
    expect(r.cappedIdx).toBeNull();
  });

  it('hrvatski dijakritici č ć š đ ž', () => {
    expect(capitalizeNewChar('', 'č', null).value).toBe('Č');
    expect(capitalizeNewChar('', 'ć', null).value).toBe('Ć');
    expect(capitalizeNewChar('', 'š', null).value).toBe('Š');
    expect(capitalizeNewChar('', 'đ', null).value).toBe('Đ');
    expect(capitalizeNewChar('', 'ž', null).value).toBe('Ž');
  });

  it('anti-borba: ako korisnik obriše i vrati malo slovo, ne re-kapitaliziramo', () => {
    // Prvi unos "a" -> "A"
    const r1 = capitalizeNewChar('', 'a', null);
    expect(r1.value).toBe('A');
    // Korisnik obriše
    const r2 = capitalizeNewChar('A', '', r1.cappedIdx);
    expect(r2.value).toBe('');
    // Korisnik upiše ponovo malo "a"
    const r3 = capitalizeNewChar('', 'a', r2.cappedIdx);
    // Ovdje idx=0 nije "lastCapped" jer smo ga resetirali brisanjem — normalno kapitaliziramo.
    expect(r3.value).toBe('A');
  });

  it('anti-borba: overwrite na istom indexu ne re-kapitalizira', () => {
    // Simulacija: korisnik selekt+type na kapitaliziranom slovu
    const prev = 'A';
    // Korisnik selektira 'A' i tipka 'b' — u našem modelu to je length isti,
    // pa krećemo od dodavanja: pretpostavimo prev='' next='b' s lastCapped=0
    const r = capitalizeNewChar('', 'b', 0);
    // lastCappedIdx === insertStart -> ne kapitaliziramo
    expect(r.value).toBe('b');
    expect(r.cappedIdx).toBeNull();
  });

  it('paste u sredini polja ne dira sadržaj', () => {
    const r = capitalizeNewChar('abc', 'abhelloc', null);
    expect(r.value).toBe('abhelloc');
    expect(r.cappedIdx).toBeNull();
  });

  it('paste na početku polja kapitalizira prvo slovo', () => {
    const r = capitalizeNewChar('', 'hello world', null);
    expect(r.value).toBe('Hello world');
    expect(r.cappedIdx).toBe(0);
  });

  it('prazan string ostaje prazan', () => {
    const r = capitalizeNewChar('', '', null);
    expect(r.value).toBe('');
    expect(r.cappedIdx).toBeNull();
  });

  it('brisanje ne kapitalizira i čisti stale marker', () => {
    const r = capitalizeNewChar('Abc', 'Ab', 5);
    expect(r.value).toBe('Ab');
    expect(r.cappedIdx).toBeNull();
  });

  it('ne kapitalizira ako nije slovo (broj, interpunkcija)', () => {
    expect(capitalizeNewChar('', '1', null).value).toBe('1');
    expect(capitalizeNewChar('', '.', null).value).toBe('.');
  });

  it('ne kapitalizira ako je već veliko slovo', () => {
    const r = capitalizeNewChar('', 'A', null);
    expect(r.value).toBe('A');
    expect(r.cappedIdx).toBeNull();
  });

  it('razmak+tab prije prvog slova računa se kao početak', () => {
    const r = capitalizeNewChar('  ', '  a', null);
    expect(r.value).toBe('  A');
  });
});
