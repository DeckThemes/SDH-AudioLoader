import { Pack } from "../classes";
import * as python from "../python";

// "Normalize Volume": every pack gets a gain (a volume multiplier) that makes it about as loud as
// the other packs, so the volume sliders mean the same thing for all of them.
// The loudness of a file is its RMS level, measured by decoding the file in the Steam screen.
// Measurements are saved in the config, so each file is only measured once.

export const loudnessSettings = { enabled: false };

// Target levels (RMS, in dBFS). Quiet packs are boosted towards them, loud packs are turned down.
const REF_MUSIC_DB = -18;
const REF_EFFECT_DB = -26;
// Never change a volume by more than this (about -18 dB .. +18 dB)
const MIN_GAIN = 0.125;
const MAX_GAIN = 8;
// A boost may let the loudest moment go this far over the maximum (1.3 is about +2 dB).
// Short peaks like that are not noticeable, and it lets quiet but "peaky" music be boosted.
const PEAK_ALLOWANCE = 1.3;
// A pack can have many sound effects. Measuring this many of them is enough.
const MAX_EFFECT_FILES = 16;
// File lists are asked for again after this long (a pack may have been updated)
const LIST_MAX_AGE_MS = 5 * 60 * 1000;
// Files bigger than this are not measured (decoding them needs a lot of memory)
const MAX_FILE_BYTES = 20 * 1024 * 1024;
// Measuring does not need full quality. Decoding at this sample rate uses much less memory.
const MEASURE_RATE = 16000;

type Entry = { rms: number; peak: number; size: number };

let cache: Record<string, Entry> = {};

export function loadLoudnessCache(data: any) {
  cache = data && typeof data === "object" && !Array.isArray(data) ? data : {};
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

// Only one file is decoded at a time
let measureQueue: Promise<unknown> = Promise.resolve();

function measure(url: string): Promise<{ rms: number; peak: number } | null> {
  const job = measureQueue.then(() => measureNow(url));
  measureQueue = job.catch(() => null);
  return job;
}

const TOO_BIG = { rms: 0, peak: 0 };

async function measureNow(url: string): Promise<{ rms: number; peak: number } | null> {
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
    let sum = 0;
    let count = 0;
    let peak = 0;
    for (let c = 0; c < audio.numberOfChannels; c++) {
      const samples = audio.getChannelData(c);
      for (let i = 0; i < samples.length; i++) {
        const v = samples[i];
        sum += v * v;
        const a = v < 0 ? -v : v;
        if (a > peak) peak = a;
      }
      count += samples.length;
    }
    if (count === 0) return null;
    return { rms: Math.sqrt(sum / count), peak };
  } catch (e) {
    python.logEvent(`Normalize Volume: could not measure ${url}: ${e}`);
    return null;
  }
}

export function gainFor(rms: number, peak: number, refDb: number): number {
  if (!(rms > 0)) return 1;
  const wanted = Math.pow(10, (refDb - 20 * Math.log10(rms)) / 20);
  // Boosting must not push the loudest moment over the maximum
  const limit = peak > 0 ? Math.max(PEAK_ALLOWANCE / peak, 1) : MAX_GAIN;
  return Math.max(MIN_GAIN, Math.min(MAX_GAIN, wanted, limit));
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
  if (old && old.size === size) return old;
  const m = await measure(`/sounds_custom/${packPath}/${file}`);
  if (!m) return null;
  const entry = { rms: m.rms, peak: m.peak, size };
  cache[key] = entry;
  saveSoon();
  return entry;
}

// ---- music ----

// Music volume with the gain applied. el.alVolume is the slider value, el.alGain the pack's gain.
export function applyMusicVolume(el: any, volume: number) {
  if (!el) return;
  el.alVolume = volume;
  const gain = loudnessSettings.enabled && typeof el.alGain === "number" ? el.alGain : 1;
  el.volume = Math.max(0, Math.min(1, volume * gain));
}

// The gain of a music file that was measured before (1 if not, or if the option is off)
export function cachedMusicGain(packPath: string | undefined, file: string): number {
  if (!loudnessSettings.enabled || !packPath) return 1;
  const e = cache[`${packPath}/${file}`];
  return e ? gainFor(e.rms, e.peak, REF_MUSIC_DB) : 1;
}

// Measures the music file if needed and applies its gain to the player
export async function normalizeMusic(el: any, packPath: string, file: string) {
  if (!loudnessSettings.enabled || !el) return;
  try {
    const sizes = await listFiles(packPath);
    const entry = await entryFor(packPath, file, sizes[file] ?? -1);
    if (!entry || !loudnessSettings.enabled) return;
    el.alGain = gainFor(entry.rms, entry.peak, REF_MUSIC_DB);
    applyMusicVolume(el, typeof el.alVolume === "number" ? el.alVolume : el.volume);
    python.logEvent(`Normalize Volume: music ${packPath}/${file} gain ${el.alGain.toFixed(2)}`);
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
  if (!loudnessSettings.enabled || !pack) return volume;
  return volume * (effectGains[pack.truncatedPackPath] ?? 1);
}

// Measures a sound pack (once per session) and then updates the sound volume
export function ensureEffectGain(pack: Pack | undefined): Promise<void> {
  if (!loudnessSettings.enabled || !pack) return Promise.resolve();
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
      let power = 0;
      let measured = 0;
      let peak = 0;
      for (const name of chosen) {
        const entry = await entryFor(path, name, sizes[name]);
        if (entry && entry.rms > 0) {
          power += entry.rms * entry.rms;
          measured++;
          if (entry.peak > peak) peak = entry.peak;
        }
      }
      if (measured > 0) gain = gainFor(Math.sqrt(power / measured), peak, REF_EFFECT_DB);
      python.logEvent(`Normalize Volume: sounds of ${path}: ${measured} files, gain ${gain.toFixed(2)}`);
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
