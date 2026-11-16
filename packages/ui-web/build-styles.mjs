import { cp, writeFile } from "node:fs/promises";
await cp("src/tokens", "dist/tokens", { recursive: true });
await cp("src/styles", "dist/styles", { recursive: true });
await writeFile(
  "dist/styles.css",
  '@import "./styles/index.css";\n@import "./components.css";\n',
);
