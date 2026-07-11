import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = path.join(root, "data", "sammeltjes.json");
const sharedSource = await fs.readFile(path.join(root, "shared-config.js"), "utf8");
const sandbox = { window: {} };
vm.runInNewContext(sharedSource, sandbox);

const polygon = sandbox.window.SAMMELTJES_SHARED_CONFIG?.WIERINGEN_POLYGON;
const items = JSON.parse(await fs.readFile(dataPath, "utf8"));
const errors = [];
const ids = new Set();
let runtimeImageBytes = 0;

if (!Array.isArray(items) || items.length === 0) {
  errors.push("data/sammeltjes.json bevat geen Sammeltjes.");
}
if (!Array.isArray(polygon) || polygon.length < 3) {
  errors.push("shared-config.js bevat geen geldige grens van Wieringen.");
}

for (const [index, item] of items.entries()) {
  const label = item.name || item.id || `regel ${index + 1}`;
  if (!item.id || !item.name || !item.description) {
    errors.push(`${label}: id, name en description zijn verplicht.`);
  }
  if (ids.has(item.id)) {
    errors.push(`${label}: dubbel ID '${item.id}'.`);
  }
  ids.add(item.id);
  if (!["fixed", "roaming", "wild"].includes(item.type)) {
    errors.push(`${label}: ongeldig type '${item.type}'.`);
  }
  if (!["common", "rare", "legendary"].includes(item.rarity)) {
    errors.push(`${label}: ongeldige rarity '${item.rarity}'.`);
  }
  if (!Number.isFinite(item.radius) || item.radius < 50 || item.radius > 500) {
    errors.push(`${label}: radius moet tussen 50 en 500 meter liggen.`);
  }
  if (!Number.isFinite(item.lat) || !Number.isFinite(item.lng) || !pointInPolygon(item, polygon)) {
    errors.push(`${label}: locatie ligt niet binnen Wieringen.`);
  }
  if (typeof item.active !== "boolean") {
    errors.push(`${label}: active moet true of false zijn.`);
  }
  for (const imagePath of [item.image, item.thumbnail]) {
    if (!imagePath || !/\.webp$/i.test(imagePath)) {
      errors.push(`${label}: runtime-afbeeldingen moeten geoptimaliseerde WebP-bestanden zijn.`);
      continue;
    }
    try {
      runtimeImageBytes += (await fs.stat(path.join(root, imagePath))).size;
    } catch (error) {
      errors.push(`${label}: afbeelding ontbreekt: ${imagePath}`);
    }
  }
}

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `${items.length} Sammeltjes gevalideerd; alle locaties liggen op Wieringen en ${(runtimeImageBytes / 1024 / 1024).toFixed(2)} MB aan runtime-afbeeldingen is aanwezig.`
  );
}

function pointInPolygon(point, points) {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const current = points[index];
    const before = points[previous];
    if (
      current.lng > point.lng !== before.lng > point.lng &&
      point.lat < ((before.lat - current.lat) * (point.lng - current.lng)) / (before.lng - current.lng) + current.lat
    ) {
      inside = !inside;
    }
  }
  return inside;
}
