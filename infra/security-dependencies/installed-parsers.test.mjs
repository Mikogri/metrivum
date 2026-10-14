import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);

test('micromatch resolves the patched braces fork and still matches build globs', () => {
  const caller = createRequire(require.resolve('micromatch'));
  assert.equal(caller('braces/package.json').name, '@trainflow/braces');
  const micromatch = require('micromatch');
  assert.deepEqual(micromatch(['src/web/app.ts', 'src/mobile/app.tsx', 'src/web/app.css'], 'src/{web,mobile}/**/*.{ts,tsx}'), ['src/web/app.ts', 'src/mobile/app.tsx']);
});

test('Expo Router query-string resolves patched CommonJS decoder and preserves query contracts', () => {
  const routerRequire = createRequire(require.resolve('expo-router/package.json'));
  const queryRequire = createRequire(routerRequire.resolve('query-string'));
  assert.equal(queryRequire('decode-uri-component/package.json').name, '@trainflow/decode-uri-component');
  const query = routerRequire('query-string');
  assert.deepEqual({ ...query.parse('name=%C5%BC%C3%B3%C5%82%C4%87&tag=a&tag=b&text=a+b%2Bc') }, { name: 'żółć', tag: ['a', 'b'], text: 'a b+c' });
  assert.deepEqual({ ...query.parse('tag[]=a&tag[]=b', { arrayFormat: 'bracket' }) }, { tag: ['a', 'b'] });
  const parameters = { redirect: '/app?x=1&y=2', emoji: '🚴', plus: 'a+b' };
  assert.deepEqual({ ...query.parse(query.stringify(parameters)) }, parameters);
});

test('xcode uses the patched CommonJS uuid release and generates compatible project identifiers', () => {
  const xcodeRequire = createRequire(require.resolve('xcode'));
  assert.equal(xcodeRequire('uuid/package.json').version, '11.1.1');
  const uuid = xcodeRequire('uuid');
  for (const version of ['v3', 'v5']) {
    assert.throws(() => uuid[version]('x', uuid[version].DNS, new Uint8Array(8), 4), RangeError);
  }
  assert.throws(() => uuid.v6({}, new Uint8Array(8), 4), RangeError);
  const project = require('xcode').project('not-read.pbxproj');
  project.hash = { project: { objects: {} } };
  const identifiers = Array.from({ length: 100 }, () => project.generateUuid());
  assert.equal(new Set(identifiers).size, identifiers.length);
  for (const identifier of identifiers) assert.match(identifier, /^[A-F0-9]{24}$/);
});
