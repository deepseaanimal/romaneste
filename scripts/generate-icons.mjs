import sharp from "sharp";
import { readFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const svg = readFileSync(join(root, "public/icon.svg"));

const outputs = [
  { name: "apple-touch-icon.png", size: 180 },
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
  { name: "icon-512-maskable.png", size: 512 },
];

mkdirSync(join(root, "public"), { recursive: true });

for (const { name, size } of outputs) {
  const out = join(root, "public", name);
  await sharp(svg).resize(size, size).png().toFile(out);
  console.log(`  ✓ ${name} (${size}×${size})`);
}
