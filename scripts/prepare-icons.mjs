import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../assets/icons");
const source = path.join(directory, "sprietje-source.png");
for (const size of [48, 180, 192, 512]) {
  await sharp(source)
    .rotate()
    .resize(size, size, {fit:"cover"})
    .flatten({background:"#176b68"})
    .png({compressionLevel:9, palette:true, quality:90, effort:7})
    .toFile(path.join(directory, `sprietje-${size}.png`));
}
console.log("Vier Sprietje-iconen gemaakt voor browser, iPhone en app-installatie.");
