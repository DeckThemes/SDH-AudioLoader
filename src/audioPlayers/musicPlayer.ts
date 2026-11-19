import { Pack, RepeatMode, Track } from "../classes";
import { saveConfig } from "../config";
import { findMappedFiles, resolvePackFile, soundStem } from "../logic/resolveSound";
import { GlobalState } from "../state/GlobalState";

let gs: GlobalState | null = null;

// Which part of a track is playing. Packs can have an intro that plays before the first song.
let phase: "intro" | "main" = "main";
// True when the user pressed pause themselves, so closing a game doesn't override it
let userPaused = false;
// Shuffle bookkeeping: tracks not yet played this cycle (null = cycle not started), and what was played
let bag: string[] | null = null;
let history: string[] = [];
let errorStreak = 0;
// False while Steam is only open in its desktop UI (not Big Picture / Gaming Mode)
let gamepadUI = true;

const HISTORY_LIMIT = 50;
const RESTART_THRESHOLD_SECONDS = 3;

export function initMusicPlayer(state: GlobalState) {
  gs = state;
}

const st = () => gs!.getPublicState();
const set = (key: string, value: any) => gs!.setGlobalState(key, value);
const keyOf = (t: Track) => `${t.pack}::${t.file}`;
const audioEl = (): HTMLAudioElement | null => st().menuMusic;
const canPlay = () => gamepadUI && st().gamesRunning.length === 0;

// Pauses the music while Steam is in the desktop UI and resumes it when Big Picture / Gaming Mode returns
export function setGamepadUI(active: boolean) {
  gamepadUI = active;
  const a = audioEl();
  if (!a) return;
  if (!active) a.pause();
  else if (!userPaused && st().gamesRunning.length === 0) a.play().catch(() => {});
}

// ---------------------------------------------------------------- queue

// A pack's songs: whatever its menu_music mapping lists, otherwise its single menu_music file.
export function getPackTracks(pack: Pack): Track[] {
  const mapped = findMappedFiles(pack, "menu_music.mp3");
  let files: string[];
  if (mapped) {
    files = Array.from(new Set(mapped));
  } else {
    const candidates = pack.files?.["menu_music"];
    files = [
      candidates && candidates.length > 0
      ? candidates.includes("menu_music.mp3")
      ? "menu_music.mp3"
      : candidates[0]
      : "menu_music.mp3",
    ];
  }
  return files.map((file) => ({
    pack: pack.name,
    file,
    label: files.length > 1 ? soundStem(file) : pack.name,
  }));
}

// The player queue is every song of every installed music pack, ordered by pack name.
export function getQueue(): Track[] {
  return st()
  .soundPacks.filter((p) => p.music)
  .slice()
  .sort((a, b) => a.name.localeCompare(b.name))
  .flatMap(getPackTracks);
}

const trackPath = (pack: Pack, file: string) =>
`/sounds_custom/${pack.truncatedPackPath || "error"}/${file}`;

function shuffled<T>(items: T[]): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------- playback core

function disposeAudio() {
  const a = audioEl();
  if (a) {
    a.onended = null;
    a.onplay = null;
    a.onpause = null;
    a.onerror = null;
    a.onplaying = null;
    a.pause();
    a.currentTime = 0;
  }
  set("menuMusic", null);
  set("musicPlaying", false);
}

function exposeWindowObject(a: HTMLAudioElement) {
  // @ts-ignore
  window.AUDIOLOADER_MENUMUSIC = {
    play: a.play.bind(a),
    pause: a.pause.bind(a),
    origVolume: a.volume,
    setVolume: (value: number) => {
      a.volume = value;
    },
  };
}

function playTrack(track: Track, withIntro: boolean) {
  const pack = st().soundPacks.find((p) => p.name === track.pack);
  if (!pack) return;

  disposeAudio();
  userPaused = false;

  set("selectedMusic", track.pack);
  set("selectedTrack", track.file);
  set("currentTrack", track);
  saveConfig();

  const mainSrc = trackPath(pack, track.file);
  const useIntro = withIntro && pack.hasIntro;
  const introFile = resolvePackFile(pack, "intro_music.mp3") || "intro_music.mp3";

  const a = new Audio(useIntro ? trackPath(pack, introFile) : mainSrc);
  phase = useIntro ? "intro" : "main";
  a.volume = st().musicVolume;
  a.loop = phase === "main" && st().musicRepeat === "one";

  a.onplay = () => set("musicPlaying", true);
  a.onpause = () => set("musicPlaying", false);
  a.onplaying = () => {
    errorStreak = 0;
  };
  a.onended = () => {
    if (phase === "intro") {
      startMainPhase(a, mainSrc);
      return;
    }
    handleEnded();
  };
  a.onerror = () => {
    console.warn("Audio Loader: could not play", a.src);
    if (phase === "intro") {
      // A missing intro shouldn't stop the song itself from playing
      startMainPhase(a, mainSrc);
      return;
    }
    errorStreak++;
    // Skip a broken song, but give up once every song in a row has failed
    if (errorStreak < getQueue().length) {
      const next = pickNext(false);
      if (next) {
        playTrack(next, packChanged(next));
        return;
      }
    }
    set("musicPlaying", false);
  };

  set("menuMusic", a);
  exposeWindowObject(a);

  // While a game is running the music stays loaded but paused; resumeAfterGame() starts it.
  if (canPlay()) {
    a.play().catch((e) => console.warn("Audio Loader: play() rejected", e));
  }
}

function startMainPhase(a: HTMLAudioElement, mainSrc: string) {
  phase = "main";
  a.src = mainSrc;
  a.loop = st().musicRepeat === "one";
  a.play().catch((e) => console.warn("Audio Loader: play() rejected", e));
}

const packChanged = (next: Track) => st().currentTrack?.pack !== next.pack;

// Picks the track that follows the current one. manual = the user pressed skip, so it always wraps.
function pickNext(manual: boolean): Track | null {
  const queue = getQueue();
  if (queue.length === 0) return null;

  const cur = st().currentTrack;
  const curKey = cur ? keyOf(cur) : null;
  const { musicShuffle, musicRepeat } = st();

  if (musicShuffle) {
    const valid = new Set(queue.map(keyOf));
    if (bag !== null) bag = bag.filter((k) => valid.has(k));

    if (bag === null || bag.length === 0) {
      // A finished cycle ends playback unless repeating or skipping manually (bag === null: no cycle yet)
      if (bag !== null && !manual && musicRepeat === "off") return null;
      const others = queue.map(keyOf).filter((k) => k !== curKey);
      bag = shuffled(others.length > 0 ? others : queue.map(keyOf));
    }
    const nextKey = bag.shift()!;
    return queue.find((t) => keyOf(t) === nextKey) ?? null;
  }

  const idx = curKey ? queue.findIndex((t) => keyOf(t) === curKey) : -1;
  if (idx === -1) return queue[0];
  if (idx + 1 < queue.length) return queue[idx + 1];
  return manual || musicRepeat !== "off" ? queue[0] : null;
}

function handleEnded() {
  const cur = st().currentTrack;
  if (st().musicRepeat === "one" && cur) {
    const a = audioEl();
    if (a) {
      a.currentTime = 0;
      a.play().catch(() => {});
    }
    return;
  }
  const next = pickNext(false);
  if (!next) {
    // End of the queue with repeat off
    set("musicPlaying", false);
    return;
  }
  rememberCurrent();
  playTrack(next, packChanged(next));
}

function rememberCurrent() {
  const cur = st().currentTrack;
  if (!cur) return;
  history.push(keyOf(cur));
  if (history.length > HISTORY_LIMIT) history.shift();
}

const musicActive = () => st().selectedMusic !== "None";

// ---------------------------------------------------------------- public controls

// Starts a pack from the top (intro first), or from a specific song in it.
export function startPack(packName: string, trackFile?: string) {
  if (packName === "None") {
    stopMusic();
    set("selectedMusic", "None");
    set("selectedTrack", "");
    saveConfig();
    return;
  }
  const pack = st().soundPacks.find((p) => p.name === packName);
  if (!pack) {
    stopMusic();
    return;
  }
  const tracks = getPackTracks(pack);
  const track = tracks.find((t) => t.file === trackFile) ?? tracks[0];
  history = [];
  bag = null;
  playTrack(track, true);
}

// Resumes whatever pack/song is saved in settings (used at boot)
export function startCurrent() {
  if (!musicActive()) return;
  startPack(st().selectedMusic, st().selectedTrack);
}

// Starts a random song from every installed music pack
export function startRandomMusic() {
  const queue = getQueue();
  if (queue.length === 0) return;
  history = [];
  bag = null;
  playTrack(queue[Math.floor(Math.random() * queue.length)], true);
}

// Stops playback but keeps the saved selection
export function stopMusic() {
  disposeAudio();
  set("currentTrack", null);
  userPaused = false;
}

export function nextTrack() {
  if (!musicActive()) return;
  const next = pickNext(true);
  if (!next) return;
  rememberCurrent();
  playTrack(next, packChanged(next));
}

export function previousTrack() {
  if (!musicActive()) return;
  const a = audioEl();
  // Like most players: if the song has been playing a while, restart it instead of going back
  if (a && a.currentTime > RESTART_THRESHOLD_SECONDS) {
    a.currentTime = 0;
    return;
  }
  const queue = getQueue();
  if (queue.length === 0) return;
  const cur = st().currentTrack;

  let prev: Track | undefined;
  if (st().musicShuffle) {
    while (history.length > 0 && !prev) {
      const key = history.pop()!;
      prev = queue.find((t) => keyOf(t) === key);
    }
  } else {
    const idx = cur ? queue.findIndex((t) => keyOf(t) === keyOf(cur)) : -1;
    prev = idx > 0 ? queue[idx - 1] : queue[queue.length - 1];
  }

  if (!prev) {
    if (a) a.currentTime = 0;
    return;
  }
  playTrack(prev, packChanged(prev));
}

export function togglePlayPause() {
  if (!musicActive()) return;
  const a = audioEl();
  if (!a) {
    // Nothing loaded (e.g. the queue ended): start from the saved selection
    startCurrent();
    return;
  }
  if (a.paused) {
    userPaused = false;
    if (canPlay()) a.play().catch(() => {});
  } else {
    userPaused = true;
    a.pause();
  }
}

export function setShuffle(on: boolean) {
  set("musicShuffle", on);
  bag = null;
  saveConfig();
}

export function setRepeat(mode: RepeatMode) {
  set("musicRepeat", mode);
  const a = audioEl();
  if (a && phase === "main") a.loop = mode === "one";
  saveConfig();
}

export function cycleRepeat() {
  const order: RepeatMode[] = ["off", "all", "one"];
  setRepeat(order[(order.indexOf(st().musicRepeat) + 1) % order.length]);
}

export function setMusicVolume(value: number) {
  set("musicVolume", value);
  const a = audioEl();
  if (a) a.volume = value;
  saveConfig();
}

export function pauseForGame() {
  audioEl()?.pause();
}

export function resumeAfterGame() {
  const a = audioEl();
  if (a && !userPaused && gamepadUI) a.play().catch(() => {});
}
