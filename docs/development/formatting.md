# Code formatting

CSharpier 1.3.0 formats C# across the API, backend modules, workers, tools, infrastructure helpers and tests. Prettier 3.9.10 formats supported web/mobile, component-library, client, test and frontend-configuration files. Both use default formatting rules; EditorConfig supplies the standard frontend two-space indentation. ESLint checks correctness, not formatting.

```powershell
dotnet tool restore
npm ci
npm run format:api
npm run format:api:check
npm run format:frontend
npm run format:frontend:check
```

Versions are pinned in `dotnet-tools.json`, `package.json` and `package-lock.json`. Do not substitute `dotnet format` or hand-edited formatting rules. CI runs both checks. Ignore files protect generated contracts, EF migrations and snapshots, vendored dependencies, native generated projects and build artifacts. Formatting never requires a database connection.

VS Code uses `.vscode/settings.json` to format whole files on save. Install the two recommended extensions (`csharpier.csharpier-vscode` and `esbenp.prettier-vscode`); they use the repository tools rather than independently chosen global versions. New computers need the .NET/Node versions already required by this repository.

Local `AGENTS.md` repeats these instructions and remains ignored, as do other machine-local agent files. This document and the formatter/CI configuration are versioned.
