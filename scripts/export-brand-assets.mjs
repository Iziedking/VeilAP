import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

const root = process.cwd();
const brandDir = path.join(root, "public", "brand");
const outputDir = path.join(brandDir, "exports");

await mkdir(outputDir, { recursive: true });

const icon = await readFile(path.join(brandDir, "veil-arena-x-app-icon.svg"));
for (const size of [1024, 512, 400, 192]) {
  await sharp(icon)
    .resize(size, size, { fit: "fill" })
    .png({ compressionLevel: 9, palette: true })
    .toFile(path.join(outputDir, `veil-arena-x-app-icon-${size}.png`));
}

const mark = await readFile(path.join(brandDir, "veilap-mark.svg"));
await sharp(mark)
  .resize(512, 384, { fit: "contain" })
  .png({ compressionLevel: 9, palette: true })
  .toFile(path.join(outputDir, "veilap-mark-512.png"));

const header = await readFile(path.join(brandDir, "veil-arena-x-header.svg"));
await sharp(header)
  .resize(1500, 500, { fit: "fill" })
  .png({ compressionLevel: 9 })
  .toFile(path.join(outputDir, "veil-arena-x-header-1500x500.png"));

console.log(`Exported Veil Arena brand assets to ${outputDir}`);
