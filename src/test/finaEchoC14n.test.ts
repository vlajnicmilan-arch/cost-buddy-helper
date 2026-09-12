import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  serialize,
  canonicalize,
  digestBase64,
  sortAttrNames,
  type XmlNode,
} from '../../supabase/functions/fina-echo-probe/c14n';
import { readWsdlEcho } from '../../supabase/functions/fina-echo-probe/index';

const body: XmlNode = {
  name: 'soapenv:Body',
  attrs: {
    'wsu:Id': 'id-body',
    'xmlns:wsu': 'urn:wsu',
    'xmlns:soapenv': 'urn:soap',
  },
  children: [
    {
      name: 'echo:EchoBuyer',
      attrs: { 'xmlns:echo': 'urn:echo' },
      children: [
        { name: 'v01:BuyerID', children: ['9934:12345678901'] },
        { name: 'v01:MessageType', children: ['9999'] },
        { name: 'v01:Note', children: ['a & b < c'] },
      ],
    },
  ],
};

describe('fina-echo-probe exclusive c14n', () => {
  it('sorts namespace declarations before plain attributes', () => {
    expect(sortAttrNames(['URI', 'xmlns:b', 'xmlns', 'Algorithm', 'xmlns:a'])).toEqual([
      'xmlns',
      'xmlns:a',
      'xmlns:b',
      'Algorithm',
      'URI',
    ]);
  });

  it('canonicalisation is idempotent', () => {
    const once = serialize(body);
    expect(canonicalize(once)).toBe(once);
    expect(canonicalize(canonicalize(once))).toBe(once);
  });

  it('re-canonicalising reordered / self-closed input yields the same string', () => {
    const canonical = serialize(body);
    const reordered =
      '<soapenv:Body xmlns:soapenv="urn:soap" wsu:Id="id-body" xmlns:wsu="urn:wsu">' +
      '<echo:EchoBuyer xmlns:echo="urn:echo">' +
      '<v01:BuyerID>9934:12345678901</v01:BuyerID>' +
      '<v01:MessageType>9999</v01:MessageType>' +
      '<v01:Note>a &amp; b &lt; c</v01:Note>' +
      '</echo:EchoBuyer></soapenv:Body>';
    expect(canonicalize(reordered)).toBe(canonical);
    expect(canonicalize('<a><b/></a>')).toBe('<a><b></b></a>');
  });

  it('digest matches a manually computed sha256/sha1 of the canonical string', async () => {
    const canonical = serialize(body);
    expect(await digestBase64('SHA-256', canonical)).toBe(
      createHash('sha256').update(canonical, 'utf8').digest('base64'),
    );
    expect(await digestBase64('SHA-1', canonical)).toBe(
      createHash('sha1').update(canonical, 'utf8').digest('base64'),
    );
  });
});

describe('fina-echo-probe WSDL reading', () => {
  it('extracts echo operation, soapAction and targetNamespace', () => {
    const wsdl = `<?xml version="1.0"?>
<wsdl:definitions targetNamespace="http://fina.hr/eracun/b2b/sync/EchoBuyer/v0.1">
  <wsdl:binding name="B2BSoapBinding">
    <wsdl:operation name="EchoBuyer">
      <wsdlsoap:operation soapAction="EchoBuyer"/>
      <wsdl:input message="impl:EchoBuyerRequest"/>
    </wsdl:operation>
  </wsdl:binding>
</wsdl:definitions>`;
    expect(readWsdlEcho(wsdl)).toEqual({
      targetNamespace: 'http://fina.hr/eracun/b2b/sync/EchoBuyer/v0.1',
      operation: 'EchoBuyer',
      soapAction: 'EchoBuyer',
      inputMessage: 'EchoBuyerRequest',
    });
  });
});
