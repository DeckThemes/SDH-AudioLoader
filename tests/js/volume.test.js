// Volume math of "Normalize Music Volume" and "Normalize Sound Effect Volume".
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  gainFor,
  musicGainFor,
  effectGainFor,
  combinedLoudness,
  measureLoudness,
} = require("../../src/audioPlayers/loudness.ts");

const TARGET = -20;
const MAX = 10;
const db = (gain) => 20 * Math.log10(gain);

function sine(freq, amplitude, seconds, rate) {
  const out = new Float32Array(Math.round(seconds * rate));
  for (let i = 0; i < out.length; i++) out[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / rate);
  return out;
}

test("a pack at the target loudness is left alone", () => {
  assert.ok(Math.abs(gainFor(TARGET, TARGET, MAX) - 1) < 1e-9);
});

test("a loud pack is turned down, a quiet pack is turned up, by the full difference", () => {
  assert.ok(Math.abs(db(gainFor(-8, TARGET, MAX)) - -12) < 1e-6);
  assert.ok(Math.abs(db(gainFor(-32, TARGET, MAX)) - 12) < 1e-6);
});

test("music: very loud and very quiet packs are brought much closer", () => {
  // a loud pop song (-7 LUFS) and a quiet ambient track (-30 LUFS): 23 dB apart before
  const loud = -7 + db(musicGainFor(-7));
  const quiet = -30 + db(musicGainFor(-30));
  assert.ok(Math.abs(loud - quiet) < 0.5, `still ${Math.abs(loud - quiet).toFixed(1)} dB apart`);
});

test("the change has limits", () => {
  assert.ok(musicGainFor(-90) <= 10 + 1e-9);
  assert.ok(musicGainFor(20) >= 0.03 - 1e-9);
});

test("sound effects: a boost does not push the loudest moment far past the maximum", () => {
  // quiet on average, but with one very loud peak: the boost has to stay small
  const gain = effectGainFor(-40, 0.9);
  assert.ok(gain * 0.9 <= 2 + 1e-9, "peak after boost: " + gain * 0.9);
  // a quiet pack without big peaks gets the whole boost
  assert.ok(effectGainFor(-36, 0.1) > 3.9);
});

test("silence or a broken measurement gives no change", () => {
  assert.equal(gainFor(null, TARGET, MAX), 1);
  assert.equal(gainFor(NaN, TARGET, MAX), 1);
  assert.equal(combinedLoudness([null, null]), null);
});

test("several files together: their loudness is averaged by power", () => {
  assert.ok(Math.abs(combinedLoudness([-20, -20]) - -20) < 1e-9);
  // the loud file counts much more than the quiet one
  assert.ok(combinedLoudness([-10, -40]) > -14);
});

test("loudness of a 1 kHz tone matches the standard (-3.01 LUFS at full scale)", () => {
  for (const rate of [16000, 48000]) {
    const { lufs, peak } = measureLoudness([sine(1000, 1, 3, rate)], rate);
    assert.ok(Math.abs(lufs - -3.01) < 0.1, `rate ${rate}: ${lufs}`);
    assert.ok(Math.abs(peak - 1) < 1e-3);
  }
});

test("deep bass counts less than the middle range, like the ear hears it", () => {
  const rate = 16000;
  const bass = measureLoudness([sine(40, 0.5, 3, rate)], rate).lufs;
  const mid = measureLoudness([sine(1000, 0.5, 3, rate)], rate).lufs;
  assert.ok(mid - bass > 1, `bass ${bass}, mid ${mid}`);
});

test("silence and quiet parts do not make a song look quieter", () => {
  const rate = 16000;
  const tone = sine(1000, 0.25, 4, rate);
  const withSilence = new Float32Array(tone.length * 3);
  withSilence.set(tone, tone.length); // silence, tone, silence
  const a = measureLoudness([tone], rate).lufs;
  const b = measureLoudness([withSilence], rate).lufs;
  assert.ok(Math.abs(a - b) < 0.5, `${a} vs ${b}`);
});

test("short sound effects (under 0.4 s) are measured too", () => {
  const rate = 16000;
  const { lufs } = measureLoudness([sine(1000, 0.5, 0.15, rate)], rate);
  assert.ok(lufs !== null && Math.abs(lufs - (-3.01 + db(0.5))) < 0.5, String(lufs));
});

test("a silent file is reported as silent", () => {
  assert.equal(measureLoudness([new Float32Array(16000)], 16000).lufs, null);
  assert.equal(measureLoudness([], 16000).lufs, null);
});
