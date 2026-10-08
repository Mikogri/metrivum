# Generated contract inputs

The single source of generated API artifacts is `contracts/generated/` at the repository root
(`openapi.json`, `api.d.ts`, `features.ts`). They are produced by `infra/export-contracts.ps1` and
checked by CI, so this package re-exports them instead of keeping a second copy that could drift.
`generated/contracts.ts` only points at those files; do not hand-edit the files it re-exports.
