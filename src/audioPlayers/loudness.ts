import { Pack } from "../classes";
import * as python from "../python";
import { glide, MusicGraph, musicGraphFor, onMusicGraphAttached, requestMusicGraph } from "./musicGraph";

// "Normalize Volume" (one switch for music, one for sound effects): every pack gets a gain (a volume
// multiplier) that makes it about as loud as the other packs, so the volume sliders mean the same
// thing for all of them.
//
// Loudness is measured the way people hear it (ITU-R BS.1770 / LUFS, like streaming services do):
// - "K-weighting" counts deep bass less and the middle/high range more, like the ear does
// - quiet parts and silence are left out ("gating"), so a long quiet intro or a pause does not make a
//   loud song look quiet
// Files are decoded in the Steam screen. Measurements are saved in the config, so each file is only
// measured once.
//
// Music goes through a Web Audio chain (musicGraph.ts) when this is on: that lets quiet music be
// boosted past the normal maximum, and a gentle leveler (compressor) evens out loud parts inside a
// song and stops boosted music from distorting.

export const loudnessSettings = { music: false, effects: false };

// Target loudness (LUFS). Quiet packs are boosted towards it, loud packs are turned down.
const TARGET_MUSIC_LUFS = -20;
const TARGET_EFFECT_LUFS = -24;
// Limits of the change: music -30 dB .. +20 dB, sound effects -30 dB .. +18 dB
const MIN_GAIN = 0.03;
const MAX_MUSIC_GAIN = 10;
const MAX_EFFECT_GAIN = 8;
// Sound effects go through a limiter: a boost may let the loudest moment go this far over the
// maximum (2 is about +6 dB), the limiter catches the rest. Music has its own leveler.
const EFFECT_PEAK_ALLOWANCE = 2;
// The limiter that sound effects go through while this is on (index.tsx). Web Audio's compressor
// adds a small "make-up gain" by itself (0.6 * its gain reduction at full scale): the volume takes
// it back off, so the sounds are not made louder by the limiter.
export const EFFECT_LIMITER = { threshold: -1, knee: 0, ratio: 20, attack: 0.001, release: 0.1 };
const EFFECT_LIMITER_MAKEUP = Math.pow(
  10,
  (0.6 * -EFFECT_LIMITER.threshold * (1 - 1 / EFFECT_LIMITER.ratio)) / 20
);
// Music leveler: above the threshold, loud parts rise only 1/ratio as much
const LEVELER_THRESHOLD_DB = -16;
const LEVELER_RATIO = 3;
// Web Audio's compressor adds a "make-up gain" by itself (0.6 * the gain reduction at full scale).
// The volume node takes it back off, so the leveler only lowers the loud parts.
const LEVELER_MAKEUP = Math.pow(10, (0.6 * -LEVELER_THRESHOLD_DB * (1 - 1 / LEVELER_RATIO)) / 20);
// A pack can have many sound effects. Measuring this many of them is enough.
const MAX_EFFECT_FILES = 16;
// File lists are asked for again after this long (a pack may have been updated)
const LIST_MAX_AGE_MS = 5 * 60 * 1000;
// Files bigger than this are not measured (decoding them needs a lot of memory)
const MAX_FILE_BYTES = 20 * 1024 * 1024;
// Measuring does not need full quality. Decoding at this sample rate uses much less memory.
const MEASURE_RATE = 16000;
// Saved measurements of an older kind (plain RMS) are measured again
const CACHE_VERSION = 2;

// lufs is null for a silent file
type Entry = { lufs: number | null; peak: number; size: number; v: number };

let cache: Record<string, Entry> = {};

export function loadLoudnessCache(data: any) {
  cache = {};
  if (!data || typeof data !== "object" || Array.isArray(data)) return;
  for (const [key, e] of Object.entries<any>(data)) {
    if (e && e.v === CACHE_VERSION && (e.lufs === null || Number.isFinite(e.lufs))) cache[key] = e;
  }
}

let saveTimer: any = null;
function saveSoon() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      Promise.resolve(python.setConfig({ loudness_cache: cache })).catch(() => {});
    } catch {
      // saving is not important, the files are measured again next time
    }
  }, 3000);
}

// ---- measuring ----

type Biquad = { b0: number; b1: number; b2: number; a1: number; a2: number };

// The two K-weighting filters of BS.1770, for any sample rate (same formulas as libebur128)
function kWeighting(rate: number): [Biquad, Biquad] {
  let f0 = 1681.974450955533;
  const G = 3.999843853973347;
  let Q = 0.7071752369554196;
  let K = Math.tan((Math.PI * f0) / rate);
  const Vh = Math.pow(10, G / 20);
  const Vb = Math.pow(Vh, 0.4996667741545416);
  let a0 = 1 + K / Q + K * K;
  const shelf: Biquad = {
    b0: (Vh + (Vb * K) / Q + K * K) / a0,
    b1: (2 * (K * K - Vh)) / a0,
    b2: (Vh - (Vb * K) / Q + K * K) / a0,
    a1: (2 * (K * K - 1)) / a0,
    a2: (1 - K / Q + K * K) / a0,
  };
  f0 = 38.13547087602444;
  Q = 0.5003270373238773;
  K = Math.tan((Math.PI * f0) / rate);
  a0 = 1 + K / Q + K * K;
  const highPass: Biquad = { b0: 1, b1: -2, b2: 1, a1: (2 * (K * K - 1)) / a0, a2: (1 - K / Q + K * K) / a0 };
  return [shelf, highPass];
}

/**
 * Integrated loudness (LUFS) and sample peak of decoded audio. lufs is null when it is silent.
 * Blocks of 400 ms (75 % overlap) are gated: below -70 LUFS, and more than 10 LU below the
 * average, they do not count.
 */
export function measureLoudness(channels: Float32Array[], rate: number): { lufs: number | null; peak: number } {
  const length = channels.length > 0 ? channels[0].length : 0;
  if (length === 0 || !(rate > 0)) return { lufs: null, peak: 0 };
  const [f1, f2] = kWeighting(rate);
  const step = Math.max(1, Math.round(rate * 0.1));
  const segments = Math.max(1, Math.floor(length / step));
  // Sum of the K-weighted squares of every 100 ms segment, all channels together
  const sums = new Float64Array(segments);
  let total = 0;
  let peak = 0;
  for (const samples of channels) {
    // state of the shelf filter (x: input, y: output) and of the high-pass filter (y: input, z: output)
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0, z1 = 0, z2 = 0;
    for (let i = 0; i < length; i++) {
      const x = samples[i];
      const a = x < 0 ? -x : x;
      if (a > peak) peak = a;
      const y = f1.b0 * x + f1.b1 * x1 + f1.b2 * x2 - f1.a1 * y1 - f1.a2 * y2;
      const z = f2.b0 * y + f2.b1 * y1 + f2.b2 * y2 - f2.a1 * z1 - f2.a2 * z2;
      x2 = x1;
      x1 = x;
      y2 = y1;
      y1 = y;
      z2 = z1;
      z1 = z;
      const segment = Math.floor(i / step);
      if (segment < segments) sums[segment] += z * z;
      total += z * z;
    }
  }
  const toLufs = (power: number) => -0.691 + 10 * Math.log10(power);
  const blocks: number[] = [];
  if (segments < 4) {
    // Shorter than one block (a short sound effect): the whole file is one block
    blocks.push(total / length);
  } else {
    for (let j = 0; j + 4 <= segments; j++) {
      blocks.push((sums[j] + sums[j + 1] + sums[j + 2] + sums[j + 3]) / (4 * step));
    }
  }
  const audible = blocks.filter((z) => z > 0 && toLufs(z) > -70);
  if (audible.length === 0) return { lufs: null, peak };
  const mean = (list: number[]) => list.reduce((s, z) => s + z, 0) / list.length;
  const relativeGate = toLufs(mean(audible)) - 10;
  const counted = audible.filter((z) => toLufs(z) > relativeGate);
  const lufs = toLufs(mean(counted.length > 0 ? counted : audible));
  return { lufs: Number.isFinite(lufs) ? lufs : null, peak };
}

// Only one file is decoded at a time
let measureQueue: Promise<unknown> = Promise.resolve();

function measure(url: string): Promise<{ lufs: number | null; peak: number } | null> {
  const job = measureQueue.then(() => measureNow(url));
  measureQueue = job.catch(() => null);
  return job;
}

// Too big to measure: left as it is
const TOO_BIG = { lufs: null, peak: 0 };

async function measureNow(url: string): Promise<{ lufs: number | null; peak: number } | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.arrayBuffer();
    if (data.byteLength > MAX_FILE_BYTES) {
      python.logEvent(`Normalize Volume: ${url} is too big to measure, left as it is`);
      return TOO_BIG;
    }
    // An offline context only decodes, it never touches the real sound output
    const context = new OfflineAudioContext(1, 1, MEASURE_RATE);
    const audio = await context.decodeAudioData(data);
    const channels: Float32Array[] = [];
    for (let c = 0; c < audio.numberOfChannels; c++) channels.push(audio.getChannelData(c));
    return measureLoudness(channels, audio.sampleRate);
  } catch (e) {
    python.logEvent(`Normalize Volume: could not measure ${url}: ${e}`);
    return null;
  }
}

/**
 * The volume multiplier that brings audio of this loudness to the target.
 * peakLimit: the loudest moment may not be boosted past this (no limit when left out).
 */
export function gainFor(lufs: number | null, targetLufs: number, maxGain: number, peak = 0, peakLimit = 0): number {
  if (lufs === null || !Number.isFinite(lufs)) return 1;
  const wanted = Math.pow(10, (targetLufs - lufs) / 20);
  const limit = peakLimit > 0 && peak > 0 ? Math.max(peakLimit / peak, 1) : Infinity;
  return Math.max(MIN_GAIN, Math.min(maxGain, wanted, limit));
}

export function musicGainFor(lufs: number | null): number {
  return gainFor(lufs, TARGET_MUSIC_LUFS, MAX_MUSIC_GAIN);
}

export function effectGainFor(lufs: number | null, peak: number): number {
  return gainFor(lufs, TARGET_EFFECT_LUFS, MAX_EFFECT_GAIN, peak, EFFECT_PEAK_ALLOWANCE);
}

/** Loudness of several files together (their power is averaged). null if all are silent. */
export function combinedLoudness(values: (number | null)[]): number | null {
  const audible = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (audible.length === 0) return null;
  const power = audible.reduce((s, v) => s + Math.pow(10, v / 10), 0) / audible.length;
  return 10 * Math.log10(power);
}

const fileLists: Record<string, { at: number; promise: Promise<Record<string, number>> }> = {};

// The audio files of a pack: name -> size in bytes
function listFiles(packPath: string): Promise<Record<string, number>> {
  const old = fileLists[packPath];
  if (old && Date.now() - old.at < LIST_MAX_AGE_MS) return old.promise;
  const promise = python
    .listPackFiles(packPath)
    .then((r: any) => (r && r.success && r.result && typeof r.result === "object" ? r.result : {}))
    .catch(() => ({}));
  fileLists[packPath] = { at: Date.now(), promise };
  return promise;
}

async function entryFor(
  packPath: string,
  file: string,
  size: number
): Promise<Entry | null> {
  const key = `${packPath}/${file}`;
  const old = cache[key];
  if (old && old.size === size && old.v === CACHE_VERSION) return old;
  const m = await measure(`/sounds_custom/${packPath}/${file}`);
  if (!m) return null;
  const entry: Entry = { lufs: m.lufs, peak: m.peak, size, v: CACHE_VERSION };
  cache[key] = entry;
  saveSoon();
  return entry;
}

// ---- music ----

// Music volume with the gain applied. el.alVolume is the slider value, el.alGain the pack's gain.
// musicFx.duck: a temporary volume factor shared by all music (0..1, see fade.ts).
// el.alFade: the fade factor of one player (0..1, see fade.ts).
export const musicFx = { duck: 1 };

// How fast volume changes reach the music chain (seconds, see glide)
const VOLUME_GLIDE = 0.025;
const GAIN_GLIDE = 0.15;

function musicGainOf(el: any): number {
  return loudnessSettings.music && typeof el.alGain === "number" && Number.isFinite(el.alGain) ? el.alGain : 1;
}

function applyToGraph(graph: MusicGraph, el: any, level: number, gain: number) {
  const leveler = graph.leveler;
  const on = loudnessSettings.music;
  // Off: ratio 1 is a pass-through (no compression, no make-up gain)
  const threshold = on ? LEVELER_THRESHOLD_DB : 0;
  const ratio = on ? LEVELER_RATIO : 1;
  const volumeTarget = level / (on ? LEVELER_MAKEUP : 1);
  if (el.volume !== 1) el.volume = 1;
  glide(graph, graph.boost.gain, gain, GAIN_GLIDE);
  if (leveler.ratio.value !== ratio || leveler.threshold.value !== threshold) {
    // Switching the leveler adds or removes its make-up gain at once: the volume node makes up for
    // it at the same moment, so there is no jump in volume
    const wasOn = leveler.ratio.value !== 1;
    const factor = (wasOn ? LEVELER_MAKEUP : 1) / (on ? LEVELER_MAKEUP : 1);
    leveler.ratio.value = ratio;
    leveler.threshold.value = threshold;
    try {
      const param = graph.volume.gain;
      const now = graph.context.currentTime;
      const current = param.value;
      param.cancelScheduledValues(now);
      param.setValueAtTime(current * factor, now);
      param.setTargetAtTime(volumeTarget, now, VOLUME_GLIDE);
      return;
    } catch {
      // the glide below still gets there
    }
  }
  glide(graph, graph.volume.gain, volumeTarget, VOLUME_GLIDE);
}

export function applyMusicVolume(el: any, volume: number) {
  if (!el) return;
  el.alVolume = volume;
  const gain = musicGainOf(el);
  const fade = typeof el.alFade === "number" ? el.alFade : 1;
  const level = Math.max(0, Math.min(1, volume * fade * musicFx.duck));
  const graph = musicGraphFor(el);
  if (graph) {
    applyToGraph(graph, el, level, gain);
    return;
  }
  // Without the music chain the player itself cannot go above its maximum
  el.volume = Math.max(0, Math.min(1, level * gain));
  if (loudnessSettings.music) void requestMusicGraph(el);
}

// A player was just connected: put the volume on its nodes
onMusicGraphAttached((graph) => {
  const el: any = graph.element;
  applyMusicVolume(el, typeof el.alVolume === "number" ? el.alVolume : 1);
});

/** True when "Normalize Music Volume" wants the music chain. */
export function musicWantsGraph(): boolean {
  return loudnessSettings.music;
}

// The gain of a music file that was measured before (1 if not, or if the option is off)
export function cachedMusicGain(packPath: string | undefined, file: string): number {
  if (!loudnessSettings.music || !packPath) return 1;
  const e = cache[`${packPath}/${file}`];
  return e && e.v === CACHE_VERSION ? musicGainFor(e.lufs) : 1;
}

// Measures the music file if needed and applies its gain to the player
export async function normalizeMusic(el: any, packPath: string, file: string) {
  if (!loudnessSettings.music || !el) return;
  try {
    const sizes = await listFiles(packPath);
    const entry = await entryFor(packPath, file, sizes[file] ?? -1);
    if (!entry || !loudnessSettings.music) return;
    el.alGain = musicGainFor(entry.lufs);
    applyMusicVolume(el, typeof el.alVolume === "number" ? el.alVolume : el.volume);
    const lufs = entry.lufs === null ? "silent" : `${entry.lufs.toFixed(1)} LUFS`;
    python.logEvent(`Normalize Volume: music ${packPath}/${file} ${lufs}, gain ${el.alGain.toFixed(2)}`);
  } catch (e) {
    python.logEvent(`Normalize Volume: music failed: ${e}`);
  }
}

// For a player that is already running (the option was just switched on)
export function normalizeRunningMusic(el: any) {
  try {
    const match = /\/sounds_custom\/(.+)\/([^/]+)$/.exec(decodeURIComponent(el?.src || ""));
    if (match) normalizeMusic(el, match[1], match[2]);
  } catch {
    // nothing to do
  }
}

// ---- sound effects ----

const effectGains: Record<string, number> = {};
const effectBusy: Record<string, Promise<void>> = {};

let applier: (() => void) | null = null;
// index.tsx registers a function that puts the current sound volume onto the gain node
export function setEffectVolumeApplier(fn: (() => void) | null) {
  applier = fn;
}
export function refreshEffectVolume() {
  try {
    applier?.();
  } catch (e) {
    python.logEvent(`Normalize Volume: could not apply the volume: ${e}`);
  }
}

export function effectVolumeFor(volume: number, pack: Pack | undefined): number {
  if (!loudnessSettings.effects) return volume;
  const gain = pack ? effectGains[pack.truncatedPackPath] ?? 1 : 1;
  return (volume * gain) / EFFECT_LIMITER_MAKEUP;
}

// Measures a sound pack (once per session) and then updates the sound volume
export function ensureEffectGain(pack: Pack | undefined): Promise<void> {
  if (!loudnessSettings.effects || !pack) return Promise.resolve();
  const path = pack.truncatedPackPath;
  if (effectGains[path] !== undefined) return Promise.resolve();
  const running: Promise<void> | undefined = effectBusy[path];
  if (running !== undefined) return running;
  const job = (async () => {
    let gain = 1;
    try {
      const sizes = await listFiles(path);
      const musicFiles = new Set<string>(["menu_music.mp3", "intro_music.mp3"]);
      for (const key of ["menu_music.mp3", "intro_music.mp3"]) {
        const mapped = (pack.mappings as any)?.[key];
        if (Array.isArray(mapped)) mapped.forEach((f: string) => musicFiles.add(f));
      }
      const names = Object.keys(sizes)
        .filter((n) => !musicFiles.has(n))
        .sort();
      // An even spread over the pack when there are many files
      const step = Math.max(1, Math.ceil(names.length / MAX_EFFECT_FILES));
      const chosen = names.filter((_, i) => i % step === 0);
      const values: (number | null)[] = [];
      let peak = 0;
      for (const name of chosen) {
        const entry = await entryFor(path, name, sizes[name]);
        if (entry && entry.lufs !== null) {
          values.push(entry.lufs);
          if (entry.peak > peak) peak = entry.peak;
        }
      }
      const lufs = combinedLoudness(values);
      gain = effectGainFor(lufs, peak);
      python.logEvent(
        `Normalize Volume: sounds of ${path}: ${values.length} files, ` +
          `${lufs === null ? "silent" : lufs.toFixed(1) + " LUFS"}, gain ${gain.toFixed(2)}`
      );
    } catch (e) {
      python.logEvent(`Normalize Volume: sound pack failed: ${e}`);
    }
    effectGains[path] = gain;
    refreshEffectVolume();
  })().finally(() => {
    delete effectBusy[path];
  });
  effectBusy[path] = job;
  return job;
}
