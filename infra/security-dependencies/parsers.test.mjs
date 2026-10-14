import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const require = createRequire(import.meta.url);
const braces = require('../../vendor/braces');
const decode = require('../../vendor/decode-uri-component');

test('braces preserves representative glob compilation, expansion and AST APIs', () => {
  assert.deepEqual(braces('src/{web,mobile}/**/*.{ts,tsx}'), ['src/(web|mobile)/**/*.(ts|tsx)']);
  assert.deepEqual(braces.expand('file-{01..03}-{a,b}'), ['file-01-a', 'file-01-b', 'file-02-a', 'file-02-b', 'file-03-a', 'file-03-b']);
  assert.equal(braces.stringify(braces.parse('a/{b,c}/d')), 'a/{b,c}/d');
  assert.equal(braces.compile(braces.parse('{a,b}')), '(a|b)');
  assert.throws(() => braces.expand('{1..9999}'), /range limit/);
});

test('deep brace and parenthesis inputs reject explicitly on every string entry point', () => {
  for (const pattern of ['{'.repeat(4999) + 'x' + '}'.repeat(4999), '('.repeat(4999) + 'x' + ')'.repeat(4999), '{('.repeat(3000)]) {
    for (const operation of [braces, braces.create, braces.parse, braces.compile, braces.expand, braces.stringify]) {
      assert.throws(() => operation(pattern), { name: 'SyntaxError', message: /nesting exceeds/ });
    }
  }
  assert.doesNotThrow(() => braces.compile('\\{'.repeat(1000)));
  assert.doesNotThrow(() => braces.compile('"' + '{'.repeat(1000) + '"'));
  assert.doesNotThrow(() => braces.compile('[' + '{'.repeat(1000) + ']'));
});

test('direct deep ASTs also reject before stack exhaustion', () => {
  let node = { type: 'text', value: 'x' };
  for (let index = 0; index < 1000; index++) node = { type: 'root', nodes: [node] };
  for (const operation of [braces.compile, braces.stringify, braces.expand]) {
    assert.throws(() => operation(node), { name: 'SyntaxError', message: /nesting exceeds/ });
  }
});

test('decode preserves legacy CommonJS, plus normalization and UTF-8 semantics', () => {
  for (const [input, expected] of [['a+b%2Bc', 'a b+c'], ['%C5%BC%C3%B3%C5%82%C4%87', 'żółć'], ['%F0%9F%9A%B4', '🚴'], ['%26%3D%3F%23%2F', '&=?#/'], ['%FFok%20yes', '%FFok yes'], ['%C2', '�'], ['%', '%']]) {
    assert.equal(decode(input), expected);
  }
  assert.throws(() => decode(null), TypeError);
});

test('malformed percent payload completes in an isolated process with a hard deadline', () => {
  const result = spawnSync(process.execPath, ['-e', `const decode = require(${JSON.stringify(require.resolve('../../vendor/decode-uri-component'))}); const input = '%FF'.repeat(30000); if (decode(input) !== input) process.exit(1);`], { timeout: 10000, encoding: 'utf8' });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
});
