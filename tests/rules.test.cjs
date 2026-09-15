const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const R = require("../game-rules.js");
const data = require("../data/sammeltjes.json");
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(require.resolve("../shared-config.js"), "utf8"), sandbox);
const polygon = sandbox.window.SAMMELTJES_SHARED_CONFIG.WIERINGEN_POLYGON;
const base = { ...data.find((item) => item.id === "rietritter"), lat: 52.91, lng: 4.97,
  type: "roaming", speedKmh: 3.6, availabilityMode: "all-day", radius: 100 };
const now = new Date("2026-09-15T17:00:00Z");
function walk(entity, player, seconds, options = {}) {
  for (let i = 0; i < seconds * 5; i++) R.step(entity, { player, dt: .2, now, random: R.seededRandom("walk"), ...options });
}
test("Alle bestaande Sammeltjes behouden hun gegevens en zijn geldig", () => {
  assert.deepEqual(R.validate(data, polygon), []);
  for (const item of data) {
    const normalized = R.normalize(item);
    assert.equal(normalized.lat, item.lat); assert.equal(normalized.image, item.image);
    assert.equal(normalized.availabilityMode, item.availabilityMode);
  }
});
test("Nieuwsgierig nadert met ingestelde snelheid en stopt dichtbij", () => {
  const entity = R.create({ ...base, behavior: "curious" });
  const player = R.destination(base, 40, 90);
  walk(entity, player, 10);
  assert.ok(Math.abs(R.distance(R.point(entity), player) - 30) < .05);
  walk(entity, player, 40);
  assert.ok(R.distance(R.point(entity), player) > 11.7);
  assert.ok(R.distance(R.point(entity), player) <= 12.1);
  assert.equal(entity.status, "blij je te zien");
});
test("Bang wijkt kort uit en neemt een rustpauze", () => {
  const entity = R.create({ ...base, behavior: "scared" });
  const player = R.destination(base, 30, 90);
  walk(entity, player, 4);
  assert.ok(R.distance(R.point(entity), player) > 32);
  const resting = R.point(entity);
  walk(entity, player, 3);
  assert.deepEqual(R.point(entity), resting);
  assert.equal(entity.status, "rust even uit");
});
test("Verlegen en vaste bewoners blijven nabij de speler staan", () => {
  for (const overrides of [{ behavior: "shy" }, { type: "fixed", behavior: "curious" }, { speedKmh: 0 }]) {
    const entity = R.create({ ...base, ...overrides });
    walk(entity, R.destination(base, 30, 0), 10);
    assert.deepEqual(R.point(entity), { lat: base.lat, lng: base.lng });
  }
});
test("Bekend vriendje reageert ook wanneer het al verzameld is", () => {
  const entity = { ...R.create({ ...base, behavior: "curious" }), collected: true, enabled: true, active: false };
  walk(entity, R.destination(base, 35, 90), 4);
  assert.ok(R.distance(base, R.point(entity)) > 3.8);
});
test("Een geblokkeerd pad veroorzaakt geen sprong of beweging door water", () => {
  const entity = R.create({ ...base, behavior: "curious", type: "wild" });
  walk(entity, R.destination(base, 40, 90), 30, { canOccupy: () => false });
  assert.deepEqual(R.point(entity), { lat: base.lat, lng: base.lng });
});
test("Alle bewegende types blijven binnen de woonradius", () => {
  for (const type of ["wild", "roaming"]) {
    const entity = R.create({ ...base, type, radius: 50, behavior: "curious" });
    for (let i = 0; i < 1500; i++) {
      const player = R.destination(R.point(entity), 45, 90);
      R.step(entity, { player, dt: .2, now });
      assert.ok(R.distance(base, R.point(entity)) <= 50.01);
    }
  }
});
test("Dagritme gebruikt Nederlandse zomer- en wintertijd", () => {
  const item = { ...base, availabilityMode: "schedule", activeFrom: "09:00", activeUntil: "23:00" };
  assert.equal(R.available(item, new Date("2026-07-01T20:59:00Z")), true);
  assert.equal(R.available(item, new Date("2026-07-01T21:00:00Z")), false);
  assert.equal(R.available(item, new Date("2026-01-01T21:59:00Z")), true);
  assert.equal(R.available(item, new Date("2026-01-01T22:00:00Z")), false);
});
test("Dagritme kan over middernacht doorlopen", () => {
  const item = { ...base, availabilityMode: "schedule", activeFrom: "21:00", activeUntil: "07:00" };
  assert.equal(R.available(item, new Date("2026-09-15T22:30:00Z")), true);
  assert.equal(R.available(item, new Date("2026-09-16T05:00:00Z")), false);
});
test("Willekeurige uren zijn stabiel en passen volledig in het venster", () => {
  const item = { ...base, availabilityMode: "random-hours", activeFrom: "09:30", activeUntil: "23:00", randomHoursPerDay: 4 };
  assert.deepEqual(R.activeSlots(item, now), R.activeSlots(item, now));
  const slots = R.activeSlots(item, now);
  assert.equal(slots.length, 4);
  assert.equal(new Set(slots.map((s) => s.start)).size, 4);
  for (const slot of slots) assert.ok(slot.start >= 570 && slot.start + 60 <= 1380);
  assert.ok(R.validate([{ ...item, randomHoursPerDay: 15 }], polygon).some((error) => error.includes("tijdvenster")));
});
test("Ongeldige waarden, dubbele IDs en onveilige afbeeldingen worden geweigerd", () => {
  assert.ok(R.validate([{ ...base, speedKmh: 999 }], polygon).length);
  assert.ok(R.validate([{ ...base, lat: NaN }], polygon).length);
  assert.ok(R.validate([{ ...base, image: 'assets/../secret.webp' }], polygon).length);
  assert.ok(R.validate([base, base], polygon).length);
});
