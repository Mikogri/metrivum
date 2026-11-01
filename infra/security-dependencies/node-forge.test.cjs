const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createHash, generateKeyPairSync } = require('node:crypto');
const { readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');
const { createRequire } = require('node:module');
const forge = require('../../vendor/node-forge');

test('vendored runtime differs from verified upstream only by PR 1152', () => {
  const base = join(__dirname, '../../vendor/node-forge');
  const hashes = require('../../vendor/node-forge/upstream-files.sha256.json');
  assert.equal(Object.keys(hashes).length, readdirSync(join(base, 'lib')).filter(name => name.endsWith('.js')).length);
  for (const [file, expected] of Object.entries(hashes)) {
    let bytes = readFileSync(join(base, file));
    if (file === 'lib/rsa.js') {
      let source = bytes.toString();
      const before = '// validate DigestInfo structure and element count';
      const after = '// validate DigestInfo structure and element counts (outer DigestInfo\n' +
        '          // and nested DigestAlgorithm). asn1.validate ignores extra children,\n' +
        '          // so length must be checked explicitly at each nesting level to\n' +
        '          // prevent low-exponent PKCS#1 v1.5 signature forgery (CVE-2026-85393).';
      assert.ok(source.includes(after));
      source = source.replace(after, before).replace(
        'obj.value.length !== 2 ||\n            obj.value[0].value.length !==\n              ((\'parameters\' in capture) ? 2 : 1)) {',
        'obj.value.length !== 2) {');
      bytes = Buffer.from(source);
    }
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, file);
  }
});

const pem = generateKeyPairSync('rsa', {
  modulusLength: 1024,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const privateKey = forge.pki.privateKeyFromPem(pem.privateKey);
const publicKey = forge.pki.publicKeyFromPem(pem.publicKey);
const { asn1 } = forge;
const sequence = children => asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, children);
const nullValue = () => asn1.create(asn1.Class.UNIVERSAL, asn1.Type.NULL, false, '');
const octets = value => asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, value);
const digest = forge.md.sha256.create().update('Metrivum regression').digest().getBytes();
const oid = () => asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false,
  asn1.oidToDer(forge.pki.oids.sha256).getBytes());
const signature = children => privateKey.sign(asn1.toDer(sequence(children)).getBytes(), 'NONE');

for (const parameters of [[], [nullValue()]]) {
  test(`accepts standard SHA256 DigestInfo with ${parameters.length} NULL parameters`, () => {
    assert.equal(publicKey.verify(digest, signature([sequence([oid(), ...parameters]), octets(digest)])), true);
  });
}

for (const [name, children] of [
  ['nested garbage after NULL (GHSA-86w9-cpqp-85rv)', [sequence([oid(), nullValue(), octets('garbage')]), octets(digest)]],
  ['nested garbage without NULL', [sequence([oid(), octets('garbage')]), octets(digest)]],
  ['duplicate NULL', [sequence([oid(), nullValue(), nullValue()]), octets(digest)]],
  ['outer garbage (previous CVE-2026-33894 fix)', [sequence([oid(), nullValue()]), octets(digest), octets('garbage')]],
]) {
  test(`rejects ${name}`, () => {
    assert.throws(() => publicKey.verify(digest, signature(children)), /valid RSASSA-PKCS1-v1_5 DigestInfo/);
  });
}

test('keeps RSA digest signing and encryption compatible', () => {
  for (const algorithm of ['sha1', 'sha256', 'sha384', 'sha512']) {
    const md = forge.md[algorithm].create().update('compatibility');
    const signed = privateKey.sign(md);
    assert.equal(publicKey.verify(md.digest().getBytes(), signed), true);
    assert.equal(publicKey.verify(forge.md[algorithm].create().update('changed').digest().getBytes(), signed), false);
  }
  assert.equal(privateKey.decrypt(publicKey.encrypt('payload')), 'payload');
});

test('installed Expo code signing uses this exact patched RSA implementation', () => {
  const fromExpo = createRequire(require.resolve('@expo/code-signing-certificates'));
  const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
  assert.equal(hash(fromExpo.resolve('node-forge/lib/rsa.js')), hash(require.resolve('../../vendor/node-forge/lib/rsa.js')));
  const expo = require('@expo/code-signing-certificates');
  const pair = expo.convertKeyPairPEMToKeyPair({ privateKeyPEM: pem.privateKey, publicKeyPEM: pem.publicKey });
  const now = Date.now();
  const certificate = expo.generateSelfSignedCodeSigningCertificate({
    keyPair: pair,
    validityNotBefore: new Date(now - 60_000),
    validityNotAfter: new Date(now + 86_400_000),
    commonName: 'Metrivum dependency regression',
  });
  const decoded = expo.convertCertificatePEMToCertificate(expo.convertCertificateToCertificatePEM(certificate));
  expo.validateSelfSignedCertificate(decoded, pair);
  const bytes = Buffer.from('Expo update manifest');
  assert.equal(typeof expo.signBufferRSASHA256AndVerify(pair.privateKey, decoded, bytes), 'string');
  const csr = expo.convertCSRPEMToCSR(expo.convertCSRToCSRPEM(expo.generateCSR(pair, 'Metrivum development')));
  assert.equal(csr.verify(), true);
  const development = expo.generateDevelopmentCertificateFromCSR(pair.privateKey, decoded, csr, 'test-app-id', '@test/scope');
  assert.equal(decoded.verify(development), true);
});
