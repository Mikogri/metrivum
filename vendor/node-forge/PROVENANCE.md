# Metrivum node-forge backport

Private package: `@metrivum/node-forge@1.4.0-trainflow.1`. This is a local fork, not an upstream release or a claim that node-forge 1.4.0 is unaffected. Metrivum owns this backport until a reviewed upstream patch release can replace it.

## Source and license

- Original: [Digital Bazaar node-forge 1.4.0](https://github.com/digitalbazaar/forge/tree/v1.4.0).
- Registry source: <https://registry.npmjs.org/node-forge/-/node-forge-1.4.0.tgz>.
- Verified tarball SRI: `sha512-LarFH0+6VfriEhqMMcLX2F7SwSXeWwnEAJEsYm5QKWchiVYVvJyV9v7UDvUv+w5HO23ZpQTXDv/GxdDdMyOuoQ==`.
- Original copyright and full BSD/GPL terms are retained in `LICENSE`; this fork chooses BSD-3-Clause. `UPSTREAM-README.md` is the original documentation.
- `upstream-files.sha256.json` records all original `lib/*.js` hashes from that verified tarball.

## Security change

[GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) has no patched registry release as checked on 2026-10-14. [Upstream PR 1152](https://github.com/digitalbazaar/forge/pull/1152), commit `ceba34402e329f0365134f23fe19898756527d65`, remains unmerged. `UPSTREAM-1152.patch` records its exact patch and authorship. Only its `lib/rsa.js` hunk is applied here; the resulting RSA file is byte-identical to that commit. Metrivum does not represent the patch as maintainer-approved.

The change rejects unused children inside the nested DigestAlgorithm sequence. Existing validation already rejects extra outer DigestInfo children. ASN.1 OID with absent or NULL parameters remains supported. All other runtime source files are unchanged. The package retains CommonJS `lib/index.js`, all `lib/*.js` deep imports, Node engine and browser runtime mappings. It omits prebuilt browser bundles and Flash artifacts so an unpatched bundle cannot be used accidentally; no repository consumer imports those artifacts.

## Verification and replacement

Run `node --test infra/security-dependencies/node-forge.test.cjs` from the repository root after installing its local override. The regressions reject nested garbage with/without NULL, duplicate NULL and outer garbage; preserve SHA1/SHA256/SHA384/SHA512 signing and RSA encryption; verify source provenance; and exercise the actual Expo code-signing dependency resolution, certificates, PEM, CSR, development certificates and update signing. Three nested-malformation tests failed against original 1.4.0 before applying the backport. Tests construct invalid encoded messages with a local private key to verify the vulnerable parser directly; they are not a full low-exponent forgery demonstration.

Keep the local fork and tests under review when advisories change. Replace the override with an official compatible patched release once available, regenerate the lockfile, rerun these regressions and Expo compatibility checks, and remove the fork. A clean registry audit alone cannot evaluate a private fork; these source-integrity and behavior tests are required evidence.
