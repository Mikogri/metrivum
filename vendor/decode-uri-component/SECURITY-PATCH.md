# Metrivum decode-uri-component compatibility fork

Private package `@metrivum/decode-uri-component@0.5.0-trainflow.1`, based on npm `decode-uri-component@0.5.0` (MIT; see license).

- Source: https://github.com/SamVerschueren/decode-uri-component/tree/v0.5.0
- Tarball: https://registry.npmjs.org/decode-uri-component/-/decode-uri-component-0.5.0.tgz
- Upstream SHA-512: `1BiQVoK8C9gUbQU6NzAtO/tkz2qOFpEObMWpcFvhx4fYnj4Oc5yzaJN/LD36ihkVUdXyh5ZekzX+yM+ty/SrPg==`
- Advisory: https://github.com/advisories/GHSA-vcc3-ghjq-m6fr

Version 0.5.0 replaces recursive malformed UTF-8 decoding with a bounded scan. Expo Router's query-string 7 expects the 0.2.x CommonJS function. This fork changes only the export to `module.exports`, retains 0.2.x `+`-to-space normalization, and sets explicit private CommonJS package metadata. The decoding algorithm is the upstream security fix. Malformed sequences may decode differently from 0.2.x; valid UTF-8, encoded plus, query arrays and URI delimiters are covered by regression tests.

This is an auditable compatibility port, not a claimed upstream CommonJS release. Remove it when Expo Router's dependency supports the patched upstream ESM package. Run `node --test infra/security-dependencies/parsers.test.mjs`.
