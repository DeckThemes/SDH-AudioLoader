import { GlobalState } from "../state/GlobalState";
import * as python from "../python";
import { changeMenuMusic, menuMusicControl } from "./changeMenuMusic";
import { getTodayKey, pickReplayMusic, pickTodaysMusic, timeOfDayPack } from "./dailyMusic";
import { endSleepTimerPause } from "./limits";
import { waitForMovies } from "./movieWait";
import { note } from "./stats";

// Shown in the first on-screen message and in the settings, to tell which build is installed
export const BUILD_TAG = "v1.3.5";

// Small on-screen messages that show what the music guard is doing. They are also written to the
// Decky log. Set this to false once everything works.
const SHOW_DEBUG_TOASTS = false;

// How often the guard looks at the clocks and at the music player
const TICK_MS = 1000;
// While the Deck sleeps, the normal clock keeps counting but timers stand still. If the clock got
// this far ahead of the timers, the Deck was asleep.
const SLEEP_EXTRA_MS = 2000;
// Backup in case timers do not stand still during sleep: ticks this far apart also count as sleep
const BIG_GAP_MS = 6000;
// Ignore repeated wake signals that come close together
const WAKE_COOLDOWN_MS = 10000;
// After waking, give Steam and the sound system time to come back before restarting the music
const WAKE_DELAY_MS = 5000;
// How long to wait before checking whether a player really plays
const CHECK_MS = 3000;
// Pause between failed attempts
const RETRY_GAP_MS = 5000;
// How many times to build a new player before giving up
const MAX_REBUILDS = 3;
// The music should play all the time. If it does not for this many ticks in a row, restart it.
const SILENT_TICKS = 4;
// Never restart silent music more than this many times within 10 minutes (a wake-up is exempt)
const MAX_SILENT_RESTARTS = 3;
const SILENT_WINDOW_MS = 10 * 60 * 1000;

type Reason = "wake" | "silent";

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

let busy = false;

function say(message: string) {
  python.logEvent(message);
  if (SHOW_DEBUG_TOASTS) python.toast("Audio Loader", message);
}

// "New Music Every Replay": switches to a different random music pack right now.
// Returns true if new music was started.
export function playRandomMusic(state: GlobalState): boolean {
  const s = state.getPublicState();
  if (
    !s.legacyEnabled ||
    s.gamesRunning.length > 0 ||
    menuMusicControl.pausedByOtherPlugin ||
    s.selectedMusic === "None"
  ) {
    return false;
  }
  if (!s.replayRandomMusic) return false;
  if (menuMusicControl.pausedByLimit !== null) return false;
  // "Music by Time of Day" decides the music for this part of the day, when it has a choice
  const timePick = timeOfDayPack(s.soundPacks);
  const pick = timePick ?? pickReplayMusic(s.soundPacks, s.selectedMusic);
  if (!pick) return false;
  note(timePick ? `Music for the replay (time of day): ${pick}` : `New music for the replay: ${pick}`);
  // Remember what is playing now, so the next start (for example coming back from Desktop Mode)
  // picks something different from it
  python.setConfig({ selected_music: pick });
  changeMenuMusic(
    pick,
    s.menuMusic,
    state.setGlobalState.bind(state),
    s.gamesRunning,
    s.soundPacks,
    s.musicVolume
  );
  return true;
}

// The "Skip" button: switches to a different music pack right now, whatever the replay toggle says.
// Returns true if new music was started.
export function skipMusic(state: GlobalState): boolean {
  const s = state.getPublicState();
  if (!s.legacyEnabled || s.gamesRunning.length > 0 || s.selectedMusic === "None") return false;
  const pick = pickReplayMusic(s.soundPacks, s.selectedMusic);
  if (!pick) return false;
  note(`Skipped to: ${pick}`);
  python.setConfig({ selected_music: pick });
  // Like choosing the music by hand: with "New Music Every Day" on, it becomes today's music
  if (s.dailyRandomMusic) {
    const today = getTodayKey();
    state.setGlobalState("dailyMusicDate", today);
    state.setGlobalState("dailyMusicPick", pick);
    python.setConfig({ daily_music_date: today, daily_music_pick: pick });
  }
  changeMenuMusic(
    pick,
    s.menuMusic,
    state.setGlobalState.bind(state),
    s.gamesRunning,
    s.soundPacks,
    s.musicVolume
  );
  return true;
}

const hooked = new WeakSet<object>();
const loopTurnedOff = new WeakSet<object>();

// With one of the replay toggles on, the music must not loop by itself: it plays to the end, and
// the moment it ends the next music starts. That way no piece of the old music is heard again.
function watchForReplay(state: GlobalState, el: any) {
  if (!el) return;
  const wanted = (s: ReturnType<GlobalState["getPublicState"]>) => s.replayRandomMusic;
  if (wanted(state.getPublicState())) {
    if (el.loop) {
      el.loop = false;
      loopTurnedOff.add(el);
    }
  } else if (loopTurnedOff.has(el)) {
    el.loop = true;
    loopTurnedOff.delete(el);
  }
  if (hooked.has(el)) return;
  hooked.add(el);
  el.addEventListener("ended", () => {
    // An intro that just turned into the main music is not a replay
    if (!el.ended || el.onended) return;
    const s = state.getPublicState();
    if (s.menuMusic !== el || !wanted(s)) return;
    playRandomMusic(state);
  });
}

const isPlaying = (el: any) => !!el && !el.paused && !el.ended && el.currentTime > 0;

// Gets the music playing again.
// - "wake": the Deck just woke up. A player that looks fine can still be silent after sleep, so
//   a brand new player is always built.
// - "silent": the music should be playing but is not. First try plain "play", and build a new
//   player if that does not work.
export async function restoreMusic(state: GlobalState, reason: Reason): Promise<void> {
  busy = true;
  try {
    if (reason === "wake") {
      say(`Woke from sleep (${BUILD_TAG}). Restarting the music in a few seconds...`);
      // The sound system needs a moment after waking, a restart right away can end up silent
      await wait(WAKE_DELAY_MS);
      // "Wait for Startup Movie": let the wake-up movie finish before the music comes back
      if (state.getPublicState().waitForMovie) {
        menuMusicControl.waitingForMovie = true;
        try {
          await waitForMovies();
        } finally {
          menuMusicControl.waitingForMovie = false;
        }
      }
    } else {
      say(`The music was not playing (${BUILD_TAG}). Restarting it...`);
    }

    const setGlobalState = state.setGlobalState.bind(state);
    let s = state.getPublicState();

    if (!s.legacyEnabled) {
      python.logEvent("Not restarting: legacy features are off");
      return;
    }
    if (s.gamesRunning.length > 0) {
      say("Music not restarted: Audio Loader thinks a game is running.");
      return;
    }
    if (menuMusicControl.pausedByOtherPlugin) {
      say("Music not restarted: another plugin paused it on purpose.");
      return;
    }
    // Waking up ends the Sleep Timer's pause. Battery Saver keeps the music paused.
    if (reason === "wake" && menuMusicControl.pausedByLimit === "sleepTimer") {
      endSleepTimerPause(state);
      s = state.getPublicState();
    }
    if (menuMusicControl.pausedByLimit !== null) {
      note("Music not restarted: Battery Saver paused it");
      return;
    }

    let musicToPlay = s.selectedMusic;
    // A new day after sleeping means a new pick for "New Music Every Day"
    let newDay = false;
    const timePick = reason === "wake" ? timeOfDayPack(s.soundPacks) : null;
    if (timePick) {
      musicToPlay = timePick;
      setGlobalState("selectedMusic", timePick);
      python.setConfig({ selected_music: timePick });
      note(`Music after waking (time of day): ${timePick}`);
    } else if (reason === "wake" && s.dailyRandomMusic) {
      const choice = pickTodaysMusic(
        s.soundPacks,
        s.dailyMusicDate,
        s.dailyMusicPick,
        setGlobalState
      );
      if (choice) {
        musicToPlay = choice.pick;
        newDay = choice.isNew;
      }
    }
    // "New Music Every Replay": waking up counts as a replay (the first music of a new day
    // still comes from "New Music Every Day")
    if (reason === "wake" && !timePick && s.replayRandomMusic && !newDay && musicToPlay !== "None") {
      const pick = pickReplayMusic(s.soundPacks, musicToPlay);
      if (pick) {
        musicToPlay = pick;
        setGlobalState("selectedMusic", pick);
        python.setConfig({ selected_music: pick });
        note(`Music after waking (new music every replay): ${pick}`);
      }
    }
    if (musicToPlay === "None") {
      say("Music not restarted: no music is selected.");
      return;
    }

    // Step 1 (silent music only): if the player still exists, just press play and see if it moves
    const old = s.menuMusic;
    if (reason === "silent" && old && !old.error) {
      const before = old.currentTime;
      try {
        await old.play();
      } catch {
        // play() was refused, step 2 will build a new player
      }
      await wait(CHECK_MS);
      if (isPlaying(old) && old.currentTime !== before) {
        say("Music is playing again.");
        return;
      }
    }

    // Step 2: build a brand new player, and check that it really plays
    for (let attempt = 0; attempt < MAX_REBUILDS; attempt++) {
      s = state.getPublicState();
      // Stop if the user (or a game) changed something while we were waiting
      if (
        !s.legacyEnabled ||
        s.gamesRunning.length > 0 ||
        s.selectedMusic !== musicToPlay ||
        menuMusicControl.pausedByOtherPlugin
      ) {
        python.logEvent("Stopped restarting: something changed while waiting");
        return;
      }

      changeMenuMusic(
        musicToPlay,
        s.menuMusic,
        setGlobalState,
        s.gamesRunning,
        s.soundPacks,
        s.musicVolume
      );

      await wait(CHECK_MS);
      if (!isPlaying(state.getPublicState().menuMusic)) {
        // One more short look, a player that just changed track can briefly show time 0
        await wait(1000);
      }
      if (isPlaying(state.getPublicState().menuMusic)) {
        say(attempt === 0 ? "Music restarted." : `Music restarted (try ${attempt + 1}).`);
        return;
      }
      if (attempt < MAX_REBUILDS - 1) await wait(RETRY_GAP_MS);
    }
    say(`Could not get the music playing again, even after ${MAX_REBUILDS} tries.`);
  } finally {
    busy = false;
  }
}

// Starts watching the music. Returns a function that stops the watching.
// The music loops forever, so when it should be playing but is not, something is wrong.
// The guard restarts it when:
//  1. The Deck woke up from sleep.
//  2. The music should be playing but is not: no player, paused, frozen, or reporting an error.
// It leaves the music alone when legacy features are off, no music is selected, a game is
// running, or another plugin paused it on purpose.
export function startMusicGuard(state: GlobalState): () => void {
  let lastWakeAt = 0;
  let lastWall = Date.now();
  let lastMono = performance.now();
  let lastTime = -1;
  let silentTicks = 0;
  let silentRestarts: number[] = [];

  const resetWatch = () => {
    silentTicks = 0;
    lastTime = -1;
  };

  const trigger = (reason: Reason) => {
    if (busy) return;
    const now = Date.now();
    if (reason === "wake" && now - lastWakeAt < WAKE_COOLDOWN_MS) return;
    // Nothing to do (and no messages to show) for people who do not use the legacy music
    if (!state.getPublicState().legacyEnabled) return;
    if (reason === "wake") {
      lastWakeAt = now;
      silentRestarts = [];
    }
    restoreMusic(state, reason).catch((e) => python.logEvent(`Restarting the music failed: ${e}`));
  };

  const checkMusic = () => {
    const s = state.getPublicState();
    watchForReplay(state, s.menuMusic);
    const shouldPlay =
      s.legacyEnabled &&
      s.selectedMusic !== "None" &&
      s.gamesRunning.length === 0 &&
      !menuMusicControl.pausedByOtherPlugin &&
      menuMusicControl.pausedByLimit === null &&
      !menuMusicControl.waitingForMovie;
    if (busy || !shouldPlay) {
      resetWatch();
      return;
    }

    const el = s.menuMusic;
    let silent = false;
    if (!el) silent = true; // no player at all
    else if (el.error && el.error.code === 4) silent = false; // bad file, a restart cannot help
    else if (el.error || el.paused || el.ended) silent = true;
    else if (el.currentTime === lastTime) silent = true; // says "playing" but is not moving
    lastTime = el ? el.currentTime : -1;

    if (!silent) {
      silentTicks = 0;
      return;
    }
    silentTicks++;
    if (silentTicks < SILENT_TICKS) return;

    resetWatch();
    const now = Date.now();
    silentRestarts = silentRestarts.filter((t) => now - t < SILENT_WINDOW_MS);
    if (silentRestarts.length >= MAX_SILENT_RESTARTS) return;
    silentRestarts.push(now);
    trigger("silent");
  };

  const timer = setInterval(() => {
    const wall = Date.now();
    const mono = performance.now();
    const previousWall = lastWall;
    const wallGap = wall - lastWall;
    const monoGap = mono - lastMono;
    lastWall = wall;
    lastMono = mono;

    // Timers are also slowed down while a game runs. A long gap that overlaps a game starting or
    // stopping is not a sleep, and treating it as one made the music restart again and again.
    const gameInGap = menuMusicControl.lastGameEventAt >= previousWall - TICK_MS;
    if (wallGap - monoGap > SLEEP_EXTRA_MS || (wallGap > BIG_GAP_MS && !gameInGap)) {
      resetWatch();
      trigger("wake");
      return;
    }
    checkMusic();
  }, TICK_MS);

  // Steam's own wake-up event. Some Steam versions removed it, so only use it if it exists.
  let steamHook: { unregister(): void } | undefined;
  try {
    steamHook = (SteamClient as any)?.System?.RegisterForOnResumeFromSuspend?.(() =>
      trigger("wake")
    );
  } catch {
    python.logEvent("Steam's own wake-up event is not available in this Steam version");
  }

  python.logEvent(`Music guard started (${BUILD_TAG})`);

  return () => {
    clearInterval(timer);
    try {
      steamHook?.unregister();
    } catch {
      // nothing to clean up
    }
  };
}
