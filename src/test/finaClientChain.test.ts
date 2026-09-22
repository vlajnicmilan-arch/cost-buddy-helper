/**
 * Brana: u TLS rukovanje ide list + izdavatelj, nikad korijenski certifikat.
 */
import { describe, it, expect } from 'vitest';
import { FINA_CA_PEM } from '../../supabase/functions/_shared/fina/finaCa.ts';
import { buildClientChain } from '../../supabase/functions/_shared/fina/chain.ts';
import {
  parseCertificate,
  splitPemCertificates,
} from '../../supabase/functions/_shared/fina/certInfo.ts';

const CA_PEMS = splitPemCertificates(FINA_CA_PEM);
const byCn = (cn: string) => CA_PEMS.find((p) => parseCertificate(p).subjectCn === cn)!;

describe('client certificate chain', () => {
  it('appends the issuer found in the CA bundle and stops before the root', () => {
    // Fina RDC 2025 stoji na mjestu lista: izdavatelj mu je Fina Root CA,
    // a korijen se ne šalje.
    const chain = buildClientChain(byCn('Fina RDC 2025'), [], CA_PEMS);
    expect(chain.cns).toEqual(['Fina RDC 2025']);
    expect(chain.cns).not.toContain('Fina Root CA');
  });

  it('prefers the issuer that came inside the p12', () => {
    const chain = buildClientChain(byCn('Fina RDC 2020'), [byCn('Fina RDC 2020')], CA_PEMS);
    expect(chain.cns).toEqual(['Fina RDC 2020']);
    expect(chain.issuerSource).toBe('none');
  });

  it('never returns a root-only chain and always keeps the leaf first', () => {
    const chain = buildClientChain(byCn('Fina Root CA'), [], CA_PEMS);
    expect(chain.cns[0]).toBe('Fina Root CA');
    expect(chain.cns).toHaveLength(1);
    expect(splitPemCertificates(chain.pem)).toHaveLength(1);
  });

  it('reads subject and issuer CN for diagnostics', () => {
    const info = parseCertificate(byCn('Fina RDC 2020'));
    expect(info.subjectCn).toBe('Fina RDC 2020');
    expect(info.issuerCn).toBe('Fina Root CA');
    expect(info.aki).toBeTruthy();
  });
});

// Sintetički lanac (samo za test): Test Root -> Test Intermediate -> Test Leaf.
const TEST_LEAF = `-----BEGIN CERTIFICATE-----
MIIDADCCAeigAwIBAgIUV2hKWsgiBhRka/0FXor+EjONNeUwDQYJKoZIhvcNAQEL
BQAwHDEaMBgGA1UEAwwRVGVzdCBJbnRlcm1lZGlhdGUwHhcNMjYwOTIyMjI0NTMy
WhcNMzYwOTE5MjI0NTMyWjAUMRIwEAYDVQQDDAlUZXN0IExlYWYwggEiMA0GCSqG
SIb3DQEBAQUAA4IBDwAwggEKAoIBAQCpkoItLgCN3GVOTNSS2v7c9P5O8iT/XRVk
jHSWRseBgFrWUabHDZMpTUAjvLSvOsViBxQxIxPhHaRb+MxuHCSw7MCDpZGqmBCh
ZfwYvQen6modJekyMfdszF4RNrpLECTCesxlNJFPQgZbgVpuEwz58um+uum1Yvpt
P98RqYdEG6rVgnzzSgsAyln/fAg6ar7ZhPRVFi69+daaLR7dlMKtqkla2KPV68K7
or38DWXZT2BFd9oFPvPrYc+7GNMmoCMRPCjZ7AL7dsTGCTHLTFbrwenYFwYoijl5
uoBZRosUQz9sE6da9IoxzyZF1etJqRpSirqBFiod2pczsIw4hCajAgMBAAGjQjBA
MB0GA1UdDgQWBBS3gSM1+v1UMZ5ccw7FNoRUefbaxDAfBgNVHSMEGDAWgBSDXXNS
/D/EUC5FQZCVTFQU8o/CjzANBgkqhkiG9w0BAQsFAAOCAQEAKWH/q0rfNpNzctKS
ODHoT+/F8lHRp1WbhSpYy34hJvz8Qi8X4D9YJGfv2q3LeZ+ID0jTbocYKtYE6lFW
8y4qV4+QFZyMJ+gsytiSsyqz3Nr7OYgKbNReI5zkEfOhPTkLHQ3pbnMNX/schznW
JTeHCTDrdi0EsGVku93ZLW1fDFFvsNg6zxYDyrvU+ZDyf9RDnQEv+QKpALFqgn3m
keTnjwWr5L/03mdSTut44ymKnpWg66JhXn/nR6ZN9moNTcrWnvXbRNoWKciRhHzC
kWq60n6e2dKFayZCI/xVjwWVYtdSntpfOGI5sK4MTAon690VLcRxMsJmCHOXxa3U
oJh4+Q==
-----END CERTIFICATE-----`;
const TEST_INTERMEDIATE = `-----BEGIN CERTIFICATE-----
MIIDDjCCAfagAwIBAgIUfKwASs4mnxiTHai6T2UKs1cn4k0wDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJVGVzdCBSb290MB4XDTI2MDkyMjIyNDUzMloXDTM2MDkx
OTIyNDUzMlowHDEaMBgGA1UEAwwRVGVzdCBJbnRlcm1lZGlhdGUwggEiMA0GCSqG
SIb3DQEBAQUAA4IBDwAwggEKAoIBAQC9ZfSB9KHvmrph2rrAi63kOpsdP2BYMSAq
ekS5QdHsSywwQ8BQUGj1QmQjVTo9lwF4luY1Q2fLz6bLXehXitMO3vUcWwwCObS0
yzq9BuIEpiGiGa8LoaBQE0Wj+A+6qUJyFY162B+6fEGhFhfgySb8axudkZpsS42M
o32UE9cIafN5huDUeafQAKMdXHsHkaNIjek8u1YwoSRXNvf8Z4Ws1ZPCRbAdJwS8
f1qVVUME2xiSx+9UoMo0m+yeLLTHE7ruqQKReoHD5NwcYYgWON+xvUZeUgItlPYM
llo6rqOvgV/sk2qCQ38fKrGTH+hgkEyHINF5kysu0Dp65C3/PyszAgMBAAGjUDBO
MAwGA1UdEwQFMAMBAf8wHQYDVR0OBBYEFINdc1L8P8RQLkVBkJVMVBTyj8KPMB8G
A1UdIwQYMBaAFPc7cImEAaBjdcF6+CMESlNsMtM4MA0GCSqGSIb3DQEBCwUAA4IB
AQAaSs+uHDiEUzXXMMVVTeAxcJmNe1q7KTQnCSvVpQUmJM1IZe/EBQLnYEcKVIpU
06T1HCbtoPmW6inmxqFQq34r3DznBpR7cAK9ewdwbfpdZqvZWvlx2VIwGwVSJ7nB
lcr1PQ9JGabJE/qTyBdSKD47razcBTDoWniSw8VS0r4J0ppJAYJ7/6TiSuhsFkAZ
DUk6BCFCf48O4sumK8YT6/KTniwuGoEVG6CVdAQBeLhskb9rdVDP5H0tHAE9KDMw
AJzfJRO0nwMHQuDaBngJfDH3SwscNIm7I2bJ+zxM1FMGGxbQVXEWW43Qx/Mgh5rk
4RfnunVZkjk8xie0rZ/q10Ul
-----END CERTIFICATE-----`;
const TEST_ROOT = `-----BEGIN CERTIFICATE-----
MIIDCTCCAfGgAwIBAgIUYaSKAVz2MXq3ACDYlqjjKaqtJQcwDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJVGVzdCBSb290MB4XDTI2MDkyMjIyNDUzMloXDTM2MDkx
OTIyNDUzMlowFDESMBAGA1UEAwwJVGVzdCBSb290MIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEAifk38CiOGEfAwra0QWWpGPtJJiZUAcj3WszcI4tGFAPB
rGWe4RiMv/3fwwWgNlZMtgkH2l4uqVDEXIou49iyIOTqArXOIov7N4LrBiSO9Q7n
MoLxI9Oyo2i30kB3hystnRD7M2KtM8WZgg3emPVgBAju/aJ6eO2YPEzgFa1d45h5
d7zy1LbhMmeX4T5SBdCh+XifGNdFS15Dv1IvBYAJXypu/RozZTvNi4DegJhw7YZZ
Br6/Y+bVTQntf9ZMIZsaFTc26+sr3w8MTXkHGpssWheNyNg3M9xQCCexDvz2dsGP
BlsYwiC48xtKq4SfPZ++FHh/pzKCAa3ORfdzD9jq0wIDAQABo1MwUTAdBgNVHQ4E
FgQU9ztwiYQBoGN1wXr4IwRKU2wy0zgwHwYDVR0jBBgwFoAU9ztwiYQBoGN1wXr4
IwRKU2wy0zgwDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEADW7F
oGB7ppPFGEk/UMf3rzsqrx3wkkx7a/4+cqE/Yztjobkg+84odRI4kkKRmotH7IH0
ezaqder9BLdRRB7OilpxtYGpHYm8NKdFnEUlRxv2yJUNmTmx5dzNZFrqiJp9p4+r
yjJKT+hLu4hghFTDl+SAZLPUphB6Q+9EhabBMGXHvKmNwqMn41Ry+27pR0qIKcwQ
RqcnMohXexBtrzFKFhHQd+snwtzGq/P/UOxzGl2tSnxBeaeSjvQvoCIFqFzXvM+9
fnrUUsiQhAIMzaq6Fr2FQTK3r6Efl+xzNzplk41vCidR2lZqmkFlF1ZM0lWE5roH
aNVyUPsvIOjSju4YtA==
-----END CERTIFICATE-----`;

describe('chain assembly on a three-level chain', () => {
  it('sends leaf + intermediate, never the root', () => {
    const chain = buildClientChain(TEST_LEAF, [], [TEST_INTERMEDIATE, TEST_ROOT]);
    expect(chain.cns).toEqual(['Test Leaf', 'Test Intermediate']);
    expect(chain.issuerSource).toBe('ca_bundle');
    expect(splitPemCertificates(chain.pem)).toHaveLength(2);
  });

  it('prefers an issuer that came inside the p12', () => {
    const chain = buildClientChain(TEST_LEAF, [TEST_INTERMEDIATE], [TEST_ROOT]);
    expect(chain.cns).toEqual(['Test Leaf', 'Test Intermediate']);
    expect(chain.issuerSource).toBe('p12');
  });

  it('sends the leaf alone when no issuer is known', () => {
    const chain = buildClientChain(TEST_LEAF, [], [TEST_ROOT]);
    expect(chain.cns).toEqual(['Test Leaf']);
  });
});
