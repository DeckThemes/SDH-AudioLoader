// Volume math of "Normalize Volume": how much a pack is turned up or down.
const test = require("node:test");
const assert = require("node:assert/strict");
const { gainFor } = require("../../src/audioPlayers/loudness.ts");

const REF_DB = -20;
const dbToGain = (db) => Math.pow(10, db / 20);
const rmsAt = (db) => dbToGain(db);

test("a pack at the wanted loudness is left alone", () => {
  assert.ok(Math.abs(gainFor(rmsAt(REF_DB), 0.1, REF_DB) - 1) < 1e-9);
});

test("a loud pack is turned down, a quiet pack is turned up", () => {
  assert.ok(gainFor(rmsAt(-14), 0.2, REF_DB) < 1);
  assert.ok(gainFor(rmsAt(-30), 0.2, REF_DB) > 1);
});

test("the change never goes past about 18 dB", () => {
  const up = gainFor(rmsAt(-60), 0.001, REF_DB);
  const down = gainFor(rmsAt(0), 1, REF_DB);
  assert.ok(up <= 8 + 1e-9, "boost too big: " + up);
  assert.ok(down >= 0.125 - 1e-9, "cut too big: " + down);
});

test("a boost does not push the loudest moment past the maximum", () => {
  // quiet on average, but with one very loud peak: the boost has to stay small
  const gain = gainFor(rmsAt(-35), 0.9, REF_DB);
  assert.ok(gain * 0.9 <= 1.3 + 1e-9, "peak after boost: " + gain * 0.9);
});

test("silence or a broken measurement gives no change", () => {
  assert.equal(gainFor(0, 0, REF_DB), 1);
  assert.equal(gainFor(NaN, 0.5, REF_DB), 1);
});
