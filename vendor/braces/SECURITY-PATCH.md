# TrainFlow braces fork

Private package `@trainflow/braces@3.0.3-trainflow.1`, based on the complete npm `braces@3.0.3` distribution (MIT; see LICENSE).

- Source: https://github.com/micromatch/braces
- Tarball: https://registry.npmjs.org/braces/-/braces-3.0.3.tgz
- Upstream SHA-512: `yQbXgO/OSZVD2IsiLlro+7Hf6Q18EJrKSEsdoMzKePKXct3gvD8oLcOQdIzGupr5Fj+EDe8gO/lxc1BzfMpxvA==`
- Advisory: https://github.com/advisories/GHSA-vfj7-8cjw-p6xm

As of 2026-10-14, the npm registry has no patched release. The local patch adds a fixed nesting ceiling of 128 before pushing braces or parentheses in `lib/parse.js`, and depth guards in recursive compile, expand and stringify traversal (including caller-supplied ASTs). Rejected patterns throw an explicit SyntaxError before stack exhaustion. Escapes, quotes and bracket literals still use the upstream parser. Package metadata uses a distinct private name/version; no upstream release is impersonated.

Normal patterns retain upstream behavior. Patterns near/above the ceiling intentionally fail. Existing range limits remain unchanged; this patch addresses stack exhaustion, not a general expansion memory quota. Replace this fork with a compatible upstream patched release when available. Run `node --test infra/security-dependencies/parsers.test.mjs`.
