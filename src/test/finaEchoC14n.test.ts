import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  serialize,
  canonicalize,
  digestBase64,
  sortAttrNames,
  type XmlNode,
} from '../../supabase/functions/fina-echo-probe/c14n';
import { readWsdlEcho } from '../../supabase/functions/fina-echo-probe/wsdl';


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

const samplesDir = path.resolve(
  __dirname,
  '../../supabase/functions/fina-echo-probe/samples',
);

const readSample = (file: string) => readFileSync(path.join(samplesDir, file), 'utf8');

const extract = (xml: string, tag: string) => {
  const start = xml.indexOf(`<${tag} `);
  const end = xml.indexOf(`</${tag}>`) + `</${tag}>`.length;
  return xml.slice(start, end);
};

const timestampDigest = (xml: string) => {
  const ref = xml.match(/<ds:Reference URI="#id-ts">[\s\S]*?<ds:DigestValue>([^<]+)</);
  return ref?.[1];
};

describe('fina-echo-probe c14n against sent envelopes', () => {
  const expectedBody =
    '<soapenv:Body xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"' +
    ' xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd"' +
    ' wsu:Id="id-body">' +
    '<echo:EchoBuyerSoapIn xmlns:echo="http://fina.hr/eracun/b2b/ws/erp/v0.1">' +
    '<v01:HeaderBuyer xmlns:v01="http://fina.hr/eracun/b2b/invoicewebservicecomponents/v0.1">';

  it('declares xmlns:v01 on the first element that visibly uses it', () => {
    for (const file of ['echo-V1.xml', 'echo-V2.xml']) {
      const canonical = canonicalize(extract(readSample(file), 'soapenv:Body'));
      expect(canonical.startsWith(expectedBody)).toBe(true);
      expect(canonical).toContain('</v01:HeaderBuyer></echo:EchoBuyerSoapIn></soapenv:Body>');
      expect(canonical).not.toContain('EchoBuyerSoapIn xmlns:echo="http://fina.hr/eracun/b2b/ws/erp/v0.1" xmlns:v01=');
    }
  });

  it('produces the independently verified body digests', async () => {
    const v1 = canonicalize(extract(readSample('echo-V1.xml'), 'soapenv:Body'));
    const v2 = canonicalize(extract(readSample('echo-V2.xml'), 'soapenv:Body'));
    expect(await digestBase64('SHA-256', v1)).toBe('zIcvnTSzMi9TOiMtd0vMgQVjy8IBq64mZOlfG72Sn3U=');
    expect(await digestBase64('SHA-1', v2)).toBe('5tP5QQPb6XTaeLBfzONMqd8qmLk=');
  });

  it('leaves the timestamp digests unchanged', async () => {
    const v1 = readSample('echo-V1.xml');
    const v2 = readSample('echo-V2.xml');
    expect(timestampDigest(v1)).toBe('Io04pLJoAQ5wltxfgPPEmzUpLxSFyNZRJxTTQL/Ae+A=');
    expect(timestampDigest(v2)).toBe('6R3d1sCXVz1Ae6nHQe6Fs6e0j0Q=');
    for (const [xml, algo] of [[v1, 'SHA-256'], [v2, 'SHA-1']] as const) {
      const canonical = canonicalize(extract(xml, 'wsu:Timestamp'));
      expect(await digestBase64(algo, canonical)).toBe(timestampDigest(xml));
    }
  });
});
