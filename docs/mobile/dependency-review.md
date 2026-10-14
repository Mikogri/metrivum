# Mobile dependency review — 2026-10-14

The previous 31 affected npm dependency nodes came from four advisories. The current locked workspace installs with zero reported npm advisories, without downgrading Expo. Expo remains SDK 57 with React Native 0.86.3 and React 19.2.3; native packages now match `expo install --check` (including Reanimated 4.5.1 and Worklets 0.10.1).

| Dependency | Remediation |
| --- | --- |
| `node-forge` | Private source fork of 1.4.0, backporting upstream PR 1152's RSA DigestAlgorithm validation. Provenance, source hashes and exact patch are in `vendor/node-forge`. |
| `braces` | Private source fork of 3.0.3, bounding nesting in parsing and recursive AST consumers. Literal/escaped input remains supported. |
| `decode-uri-component` | Fixed 0.5.0 decoding algorithm adapted to CommonJS, retaining the legacy plus-to-space behavior required by query-string/Expo Router. Malformed UTF-8 handling can differ; see its patch notes. |
| `uuid` | Official 11.1.1, scoped to `xcode`. CommonJS v4 compatibility and affected buffer operations are tested. |

The three forks have distinct private package names and retained licenses; these are maintained source patches, not claimed upstream releases. Registry audit alone cannot validate private source: `npm run test:security-dependencies` runs 17 exploit, compatibility and installed-caller regressions, including actual Expo signing helpers. Replace forks when compatible upstream fixes are available; do not remove them solely because a renamed package is absent from audit output.

Use npm 11.21.0 and supported Node branches from root `package.json`. npm 11.17.0 mishandles these workspace overrides. CI uses the pinned installer and clean installation with scripts disabled. Root file dependencies plus `$` overrides ensure callers resolve the vendored implementations.

Android/iOS Metro exports and the Expo compatibility check passed. Native/device verification boundaries are recorded in [dependency remediation](../architecture/dependency-remediation-2026-10-14.md). Package audits do not prove operating-system, SDK, external model or device security.
