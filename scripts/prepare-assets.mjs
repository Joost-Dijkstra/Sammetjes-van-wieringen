import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(root, "assets", "sammeltjes");
const fullDir = path.join(root, "assets", "sammeltjes-webp", "full");
const thumbDir = path.join(root, "assets", "sammeltjes-webp", "thumbs");
const vendorDir = path.join(root, "vendor", "leaflet");

await Promise.all([
  mkdir(fullDir, { recursive: true }),
  mkdir(thumbDir, { recursive: true }),
  mkdir(vendorDir, { recursive: true })
]);

const pngFiles = (await readdir(sourceDir)).filter((name) => name.toLowerCase().endsWith(".png"));

for (const fileName of pngFiles) {
  const sourcePath = path.join(sourceDir, fileName);
  const baseName = path.parse(fileName).name;

  await Promise.all([
    sharp(sourcePath)
      .rotate()
      .resize({ width: 768, height: 1024, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, effort: 5 })
      .toFile(path.join(fullDir, `${baseName}.webp`)),
    sharp(sourcePath)
      .rotate()
      .resize({ width: 320, height: 426, fit: "cover", position: "attention", withoutEnlargement: true })
      .webp({ quality: 72, effort: 5 })
      .toFile(path.join(thumbDir, `${baseName}.webp`))
  ]);
}

const dataPath = path.join(root, "data", "sammeltjes.json");
const records = JSON.parse(await readFile(dataPath, "utf8"));
for (const record of records) {
  record.image = `assets/sammeltjes-webp/full/${record.id}.webp`;
  record.thumbnail = `assets/sammeltjes-webp/thumbs/${record.id}.webp`;
}
await writeFile(dataPath, `${JSON.stringify(records, null, 2)}\n`, "utf8");

await cp(path.join(root, "node_modules", "leaflet", "dist", "leaflet.css"), path.join(vendorDir, "leaflet.css"));
await cp(path.join(root, "node_modules", "leaflet", "dist", "leaflet.js"), path.join(vendorDir, "leaflet.js"));
await cp(path.join(root, "node_modules", "leaflet", "dist", "images"), path.join(vendorDir, "images"), {
  recursive: true
});

console.log(`${pngFiles.length} Sammeltjes geoptimaliseerd en Leaflet lokaal klaargezet.`);
