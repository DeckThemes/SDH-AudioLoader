// Music picking and the loading of saved settings.
const test = require("node:test");
const assert = require("node:assert/strict");
const { chooseVaried, seriesOf } = require("../../src/audioPlayers/dailyMusic.ts");
const { settings, loadSettings, DEFAULT_SETTINGS } = require("../../src/settings.ts");

const names = [
  "Borderlands - Track A", "Borderlands - Track B", "Borderlands 2 - Track C",
  "Persona 5 - Last Surprise", "Persona 4 - Pursuing My True Self",
  "Halo - Theme", "Doom - E1M1", "Portal - Still Alive", "Skyrim - Dragonborn", "Fallout - Main Theme",
];
const opts = (o) => ({ variety: 100, favorites: [], blocked: [], ...o });
const many = (n, fn) => Array.from({ length: n }, fn);

test("the pack that plays right now is never picked again", () => {
  for (const variety of [0, 50, 100]) {
    const picks = many(300, () => chooseVaried(names, "Halo - Theme", [], Math.random, opts({ variety })));
    assert.ok(!picks.includes("Halo - Theme"), "variety " + variety);
  }
});

test("blocked packs are never picked", () => {
  const blocked = ["Halo - Theme", "Doom - E1M1", "Portal - Still Alive"];
  const picks = many(500, () => chooseVaried(names, "Skyrim - Dragonborn", [], Math.random, opts({ blocked, variety: 50 })));
  assert.ok(picks.every((p) => !blocked.includes(p)));
});

test("favorites come up more often than other packs", () => {
  const favorites = ["Doom - E1M1"];
  const picks = many(4000, () => chooseVaried(names, "Halo - Theme", [], Math.random, opts({ favorites, variety: 0 })));
  const fav = picks.filter((p) => p === "Doom - E1M1").length;
  const other = picks.filter((p) => p === "Portal - Still Alive").length;
  assert.ok(fav > other * 1.8, `favorite ${fav} vs normal ${other}`);
});

test("at full variety, recent packs and recent series are avoided", () => {
  const recent = ["Persona 5 - Last Surprise", "Halo - Theme", "Doom - E1M1"];
  const picks = many(500, () => chooseVaried(names, "Doom - E1M1", recent, Math.random, opts({ variety: 100 })));
  for (const p of picks) {
    assert.ok(!recent.includes(p), "repeated " + p);
    assert.notEqual(seriesOf(p), seriesOf("Persona 5 - Last Surprise"));
  }
});

test("with a single pack it still returns something", () => {
  assert.equal(chooseVaried(["Only One"], "Only One", [], Math.random, opts({ variety: 100 })), "Only One");
});

test("packs of one series share a series name", () => {
  assert.equal(seriesOf("Borderlands - Track A"), seriesOf("Borderlands 2 - Track C"));
  assert.notEqual(seriesOf("Halo - Theme"), seriesOf("Doom - E1M1"));
});

test("saved settings: missing or broken values get their defaults", () => {
  loadSettings(undefined);
  assert.equal(settings.variety_level, DEFAULT_SETTINGS.variety_level);
  loadSettings({ variety_level: "abc", favorite_music: "nope", battery_threshold: 9999, sleep_timer_minutes: -5 });
  assert.equal(settings.variety_level, DEFAULT_SETTINGS.variety_level);
  assert.deepEqual(settings.favorite_music, []);
  assert.equal(settings.battery_threshold, 50);
  assert.equal(settings.sleep_timer_minutes, 1);
});

test("saved settings: the old 'Pure Random' switch becomes variety 0", () => {
  loadSettings({ pure_random_music: true });
  assert.equal(settings.variety_level, 0);
  loadSettings({ pure_random_music: true, variety_level: 70 });
  assert.equal(settings.variety_level, 70);
});
