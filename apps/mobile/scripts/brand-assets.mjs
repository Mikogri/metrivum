import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  compositeImagesAsync,
  createSquareAsync,
  generateImageAsync,
} from "@expo/image-utils";

const root = fileURLToPath(new URL("../", import.meta.url));
const assets = new URL("../assets/brand/", import.meta.url);
await mkdir(assets, { recursive: true });
// Keep the symbol inside Android's adaptive-icon safe area; the OS supplies the mask.
const { source } = await generateImageAsync(
  { projectRoot: root, cacheType: "metrivum-brand" },
  {
    src: fileURLToPath(new URL("metrivum-mark.png", assets)),
    width: 576,
    height: 576,
    resizeMode: "contain",
    backgroundColor: "transparent",
  },
);
for (const [name, color] of [
  ["icon.png", "#0d0f0e"],
  ["adaptive-icon.png", "#00000000"],
]) {
  const background = await createSquareAsync({ size: 1024, color });
  await writeFile(
    new URL(name, assets),
    await compositeImagesAsync({
      foreground: source,
      background,
      x: 224,
      y: 224,
    }),
  );
}
