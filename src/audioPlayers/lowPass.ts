import * as python from "../python";

// Music low-pass filter ("muffled music"): the menu music gets a low-pass filter while a Steam menu,
// the Quick Access (...) menu is open, or while a game is loading. Only Encore's own menu music is
// filtered. Steam's sound effects and the game's sound are not touched.

export interface MusicLowPassSettings {
  steamMenu: boolean;
  quickAccess: boolean;
  gameLoading: boolean;
  /** 0-100. 0 is almost no change (20 kHz), 100 is a strong filter (500 Hz). */
  strength: number;
}

type FilterContext = "steamMenu" | "quickAccess" | "gameLoading" | "preview";

type AudioGraph = {
  element: HTMLAudioElement;
  context: AudioContext;
  source: MediaElementAudioSourceNode;
  filter: BiquadFilterNode;
};

const MIN_CUTOFF_HZ = 500;
const MAX_CUTOFF_HZ = 20000;
const TRANSITION_SECONDS = 0.08;
const MENU_POLL_MS = 250;
// Steam gives no sure "loading is over" signal on every version, so a loading state ends by itself
const LOADING_FAILSAFE_MS = 5 * 60 * 1000;
const PREVIEW_MS = 1500;
// Values of Steam's SideMenu enum
const SIDE_MENU_MAIN = 1;
const SIDE_MENU_QUICK_ACCESS = 2;

let settings: MusicLowPassSettings = { steamMenu: false, quickAccess: false, gameLoading: false, strength: 50 };
const activeContexts = new Set<FilterContext>();
let currentElement: HTMLAudioElement | null = null;
let graph: AudioGraph | null = null;
let sharedAudioContext: AudioContext | null = null;
let attaching = false;
let unsupportedLogged = false;
let graphErrorLogged = false;
let previewTimer: ReturnType<typeof setTimeout> | null = null;

function anyEnabled(): boolean {
  return settings.steamMenu || settings.quickAccess || settings.gameLoading;
}

export function shouldFilter(): boolean {
  return (
    (settings.steamMenu && activeContexts.has("steamMenu")) ||
    (settings.quickAccess && activeContexts.has("quickAccess")) ||
    (settings.gameLoading && activeContexts.has("gameLoading")) ||
    (anyEnabled() && activeContexts.has("preview"))
  );
}

export function cutoffForStrength(strength: number): number {
  const normalized = Math.max(0, Math.min(100, strength)) / 100;
  // A logarithmic scale sounds even: every step changes the sound by a similar amount
  return MAX_CUTOFF_HZ * Math.pow(MIN_CUTOFF_HZ / MAX_CUTOFF_HZ, normalized);
}

function applyFilterTarget(): void {
  if (!graph) return;
  const now = graph.context.currentTime;
  const nyquist = graph.context.sampleRate / 2;
  const bypassCutoff = Math.min(MAX_CUTOFF_HZ, Math.max(1000, nyquist - 1));
  const target = shouldFilter() ? cutoffForStrength(settings.strength) : bypassCutoff;
  try {
    graph.filter.frequency.cancelScheduledValues(now);
    graph.filter.frequency.setTargetAtTime(target, now + 0.015, TRANSITION_SECONDS);
  } catch (error) {
    console.warn("Audio Loader: could not update the low-pass filter", error);
  }
}

function resumeContext(context: AudioContext): void {
  if (context.state === "running" || context.state === "closed") return;
  try {
    Promise.resolve(context.resume()).catch(() => {});
  } catch {
    // tried again on the next check
  }
}

// Connects the music player to the filter. This is only done when a filter is wanted. Once an
// audio element is connected to Web Audio it cannot be disconnected from it again, so this
// first makes sure the audio system is running: a stopped one would make the music silent.
async function attachCurrentElement(): Promise<void> {
  const element = currentElement;
  if (!element || graph?.element === element || attaching) return;
  const AudioContextConstructor = (window as any).AudioContext;
  if (typeof AudioContextConstructor !== "function") {
    if (!unsupportedLogged) {
      unsupportedLogged = true;
      python.logEvent("Low-pass filter: Web Audio is not available, the filter is off");
    }
    return;
  }
  attaching = true;
  try {
    const context: AudioContext = sharedAudioContext || new AudioContextConstructor();
    sharedAudioContext = context;
    if (context.state !== "running") {
      try {
        await context.resume();
      } catch {
        // checked right below
      }
    }
    // Things may have changed while waiting
    if (currentElement !== element || !shouldFilter()) return;
    if (context.state !== "running") {
      if (!graphErrorLogged) {
        graphErrorLogged = true;
        python.logEvent(`Low-pass filter: the audio system is "${context.state}", the filter is skipped for now`);
      }
      return;
    }

    const source = context.createMediaElementSource(element);
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 0.70710678;
    source.connect(filter);
    filter.connect(context.destination);
    graph = { element, context, source, filter };
    // Start open (no change to the sound), then move to the wanted cutoff smoothly
    filter.frequency.value = Math.min(MAX_CUTOFF_HZ, Math.max(1000, context.sampleRate / 2 - 1));
    applyFilterTarget();
    python.logEvent("Low-pass filter: connected to the music player");
  } catch (error) {
    // Another plugin may already own this element. The normal sound path stays as it was.
    if (!graphErrorLogged) {
      graphErrorLogged = true;
      python.logEvent(`Low-pass filter: could not connect to the music player: ${error}`);
    }
  } finally {
    attaching = false;
  }
}

function update(): void {
  if (shouldFilter()) void attachCurrentElement();
  applyFilterTarget();
}

function setContext(context: FilterContext, active: boolean): void {
  if (active === activeContexts.has(context)) return;
  if (active) activeContexts.add(context);
  else activeContexts.delete(context);
  update();
}

/** Applies the settings (when loading them, and whenever one is changed). */
export function configureMusicLowPass(next: MusicLowPassSettings): void {
  settings = {
    steamMenu: !!next.steamMenu,
    quickAccess: !!next.quickAccess,
    gameLoading: !!next.gameLoading,
    strength: Math.max(0, Math.min(100, Number(next.strength) || 0)),
  };
  update();
}

/** Call after the strength slider was moved: the filter is heard for a moment as a preview. */
export function previewMusicLowPass(): void {
  if (!anyEnabled()) return;
  if (previewTimer) clearTimeout(previewTimer);
  setContext("preview", true);
  previewTimer = setTimeout(() => {
    previewTimer = null;
    setContext("preview", false);
  }, PREVIEW_MS);
}

/** Tells the filter which audio element is the menu music now. */
export function setMusicLowPassPlayer(element: HTMLAudioElement | null): void {
  if (currentElement === element) {
    update();
    return;
  }
  if (graph) {
    try {
      graph.source.disconnect();
      graph.filter.disconnect();
    } catch {
      // the old player may already be gone
    }
    graph = null;
  }
  currentElement = element;
  update();
}

// Which Steam side menu is open: 0 none, 1 Steam menu, 2 Quick Access (...) menu. undefined = unknown.
export function readOpenSideMenu(): number | undefined {
  try {
    const store = (window as any).SteamUIStore;
    const main = store?.WindowStore?.GamepadUIMainWindowInstance;
    const menu = main?.MenuStore ?? store?.GetFocusedWindowInstance?.()?.MenuStore;
    if (!menu) return undefined;
    if (typeof menu.GetOpenSideMenu === "function") return menu.GetOpenSideMenu();
    return typeof menu.m_eOpenSideMenu === "number" ? menu.m_eOpenSideMenu : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Starts watching the Steam menus and the game loading. Returns a function that stops it.
 * - Steam menu / Quick Access menu: Steam's own menu store tells which side menu is open.
 * - Game loading: from the moment Steam starts a game launch until the game is running.
 */
export function startMusicLowPassContextMonitor(): () => void {
  let menuLogged = false;
  const checkMenus = () => {
    const open = readOpenSideMenu();
    if (!menuLogged) {
      menuLogged = true;
      python.logEvent(
        open === undefined
          ? "Low-pass filter: could not read Steam's menu state, the menu options will not work"
          : "Low-pass filter: reading Steam's menu state works"
      );
    }
    setContext("steamMenu", open === SIDE_MENU_MAIN);
    setContext("quickAccess", open === SIDE_MENU_QUICK_ACCESS);
    // A filtered player may have been stopped by the system (like after sleep): wake it up
    if (graph) resumeContext(graph.context);
  };
  const menuTimer = setInterval(checkMenus, MENU_POLL_MS);
  checkMenus();

  const launchIds = new Set<number>();
  const launchTimers = new Map<number, ReturnType<typeof setTimeout>>();
  const finishLaunch = (id: number) => {
    const timer = launchTimers.get(id);
    if (timer) clearTimeout(timer);
    launchTimers.delete(id);
    launchIds.delete(id);
    setContext("gameLoading", launchIds.size > 0);
  };

  let started: { unregister?: () => void } | undefined;
  let ended: { unregister?: () => void } | undefined;
  let lifetime: { unregister?: () => void } | undefined;
  try {
    const apps = (SteamClient as any).Apps;
    const sessions = (SteamClient as any).GameSessions;
    if (typeof apps?.RegisterForGameActionStart === "function") {
      started = apps.RegisterForGameActionStart((gameActionId: number, _appId: string, action: string) => {
        if (String(action).toLowerCase() !== "launchapp") return;
        launchIds.add(gameActionId);
        setContext("gameLoading", true);
        const old = launchTimers.get(gameActionId);
        if (old) clearTimeout(old);
        launchTimers.set(gameActionId, setTimeout(() => finishLaunch(gameActionId), LOADING_FAILSAFE_MS));
      });
    }
    if (typeof apps?.RegisterForGameActionEnd === "function") {
      ended = apps.RegisterForGameActionEnd((gameActionId: number) => finishLaunch(gameActionId));
    }
    if (typeof sessions?.RegisterForAppLifetimeNotifications === "function") {
      lifetime = sessions.RegisterForAppLifetimeNotifications((state: any) => {
        // The game process is running: the loading interval is over
        if (state?.bRunning) Array.from(launchIds).forEach(finishLaunch);
      });
    }
  } catch (error) {
    python.logEvent(`Low-pass filter: could not watch Steam's game launch events: ${error}`);
  }

  return () => {
    clearInterval(menuTimer);
    started?.unregister?.();
    ended?.unregister?.();
    lifetime?.unregister?.();
    Array.from(launchTimers.values()).forEach(clearTimeout);
    launchTimers.clear();
    launchIds.clear();
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = null;
    activeContexts.clear();
    applyFilterTarget();
  };
}

/** Frees the audio resources when the plugin is unloaded. */
export function stopMusicLowPassAudio(): void {
  if (graph) {
    try {
      graph.source.disconnect();
      graph.filter.disconnect();
    } catch {
      // already disconnected
    }
  }
  if (sharedAudioContext) {
    try {
      Promise.resolve(sharedAudioContext.close()).catch(() => {});
    } catch {
      // nothing to do
    }
  }
  graph = null;
  sharedAudioContext = null;
  currentElement = null;
  activeContexts.clear();
}
