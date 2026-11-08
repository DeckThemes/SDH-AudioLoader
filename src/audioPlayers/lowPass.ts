/**
 * Context-aware low-pass processing for Audio Loader Encore's own menu-music
 * HTMLAudioElement. It deliberately does not touch Steam UI effects or game audio.
 */

export interface MusicLowPassSettings {
  enabled: boolean;
  steamMenus: boolean;
  gameLaunching: boolean;
  /** 0-100. 0 is almost transparent; 100 is a 500 Hz low-pass. */
  strength: number;
}

type FilterContext = "steamMenus" | "gameLaunching";

type AudioGraph = {
  element: HTMLAudioElement;
  context: AudioContext;
  source: MediaElementAudioSourceNode;
  filter: BiquadFilterNode;
};

const DEFAULT_SETTINGS: MusicLowPassSettings = {
  enabled: false,
  steamMenus: false,
  gameLaunching: false,
  strength: 50,
};

const MIN_CUTOFF_HZ = 500;
const MAX_CUTOFF_HZ = 20000;
const TRANSITION_SECONDS = 0.08;

let settings: MusicLowPassSettings = { ...DEFAULT_SETTINGS };
const activeContexts = new Set<FilterContext>();
let currentElement: HTMLAudioElement | null = null;
let graph: AudioGraph | null = null;
let sharedAudioContext: AudioContext | null = null;
let hasUserGesture = false;
let unsupportedLogged = false;
let graphErrorLogged = false;

function shouldFilter(): boolean {
  return (
    settings.enabled &&
    ((settings.steamMenus && activeContexts.has("steamMenus")) ||
      (settings.gameLaunching && activeContexts.has("gameLaunching")))
  );
}

function cutoffForStrength(strength: number): number {
  const normalized = Math.max(0, Math.min(100, strength)) / 100;
  // Logarithmic mapping gives a useful, perceptually smoother sweep.
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

function attachCurrentElement(): void {
  if (!settings.enabled || !currentElement || graph?.element === currentElement) {
    applyFilterTarget();
    return;
  }
  if (!hasUserGesture) return;

  const AudioContextConstructor = window.AudioContext;
  if (!AudioContextConstructor || typeof AudioContextConstructor !== "function") {
    if (!unsupportedLogged) {
      unsupportedLogged = true;
      console.warn("Audio Loader: Web Audio API is unavailable; music low-pass filtering is disabled.");
    }
    return;
  }

  try {
    // One MediaElementAudioSourceNode per HTMLAudioElement, created once per player.
    const context = sharedAudioContext || new AudioContextConstructor();
    sharedAudioContext = context;
    const source = context.createMediaElementSource(currentElement);
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 0.70710678;
    source.connect(filter);
    filter.connect(context.destination);

    graph = { element: currentElement, context, source, filter };
    applyFilterTarget();

    if (context.state === "suspended") {
      context.resume().catch((error) => {
        console.warn("Audio Loader: the low-pass AudioContext could not resume yet", error);
      });
    }
  } catch (error) {
    // Another plugin may already have claimed this element with createMediaElementSource.
    // Fail safely: leave the player's normal audio path untouched.
    if (!graphErrorLogged) {
      graphErrorLogged = true;
      console.warn("Audio Loader: could not attach the music low-pass filter", error);
    }
  }
}

function setContext(context: FilterContext, active: boolean): void {
  if (active) activeContexts.add(context);
  else activeContexts.delete(context);

  if (active && shouldFilter()) attachCurrentElement();
  applyFilterTarget();
}

/** Apply saved settings. Pass userInitiated=true from an actual settings interaction. */
export function configureMusicLowPass(
  next: MusicLowPassSettings,
  userInitiated: boolean = false
): void {
  settings = {
    enabled: !!next.enabled,
    steamMenus: !!next.steamMenus,
    gameLaunching: !!next.gameLaunching,
    strength: Math.max(0, Math.min(100, Number(next.strength) || 0)),
  };

  if (userInitiated) hasUserGesture = true;
  if (settings.enabled && hasUserGesture) attachCurrentElement();
  applyFilterTarget();
}

/** Register the current menu-music element. */
export function setMusicLowPassPlayer(element: HTMLAudioElement | null): void {
  if (currentElement === element) {
    attachCurrentElement();
    return;
  }

  if (graph) {
    try {
      graph.source.disconnect();
      graph.filter.disconnect();
    } catch {
      // The old player may already have been disposed by the browser.
    }
    graph = null;
  }

  currentElement = element;
  attachCurrentElement();
}

/**
 * Watch Steam's foreground window focus plus Steam's native game-action events.
 * Losing focus in Game Mode is the supported cross-view signal for a foreground
 * Steam popup such as Quick Access or the Steam menu. It is intentionally one
 * toggle because Steam does not expose a stable public event that distinguishes
 * every individual popup/dialog from this plugin's shared JS context.
 */
export function startMusicLowPassContextMonitor(): () => void {
  const onBlur = () => setContext("steamMenus", true);
  const onFocus = () => setContext("steamMenus", false);
  const onUserGesture = () => {
    hasUserGesture = true;
    if (settings.enabled) attachCurrentElement();
    if (graph?.context.state === "suspended") {
      graph.context.resume().catch(() => {});
    }
  };

  window.addEventListener("blur", onBlur);
  window.addEventListener("focus", onFocus);
  window.addEventListener("pointerdown", onUserGesture, true);
  window.addEventListener("keydown", onUserGesture, true);
  window.addEventListener("touchstart", onUserGesture, true);
  if (typeof document !== "undefined" && !document.hasFocus()) onBlur();

  const launchActionIds = new Set<number>();
  const launchTimers = new Map<number, ReturnType<typeof setTimeout>>();
  const finishLaunch = (id: number) => {
    const timer = launchTimers.get(id);
    if (timer) clearTimeout(timer);
    launchTimers.delete(id);
    launchActionIds.delete(id);
    setContext("gameLaunching", launchActionIds.size > 0);
  };

  let gameActionStart: RegisteredEvent | undefined;
  let gameActionEnd: RegisteredEvent | undefined;
  let appLifetime: RegisteredEvent | undefined;

  try {
    if (typeof SteamClient !== "undefined") {
      const apps = (SteamClient as any).Apps;
      const sessions = (SteamClient as any).GameSessions;

      if (typeof apps?.RegisterForGameActionStart === "function") {
        gameActionStart = apps.RegisterForGameActionStart(
          (gameActionId: number, _appId: string, action: string) => {
            if (String(action).toLowerCase() !== "launchapp") return;
            launchActionIds.add(gameActionId);
            setContext("gameLaunching", true);
            // Failsafe for client versions that omit the corresponding end/lifetime event.
            const previous = launchTimers.get(gameActionId);
            if (previous) clearTimeout(previous);
            launchTimers.set(gameActionId, setTimeout(() => finishLaunch(gameActionId), 15 * 60 * 1000));
          }
        );
      }

      if (typeof apps?.RegisterForGameActionEnd === "function") {
        gameActionEnd = apps.RegisterForGameActionEnd((gameActionId: number) => {
          finishLaunch(gameActionId);
        });
      }

      if (typeof sessions?.RegisterForAppLifetimeNotifications === "function") {
        appLifetime = sessions.RegisterForAppLifetimeNotifications((state: AppState) => {
          // Once Steam reports that the game process is running, the launch/loading interval is over.
          if (state?.bRunning) {
            Array.from(launchActionIds).forEach(finishLaunch);
          }
        });
      }
    }
  } catch (error) {
    console.warn("Audio Loader: could not register Steam low-pass context events", error);
  }

  return () => {
    window.removeEventListener("blur", onBlur);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("pointerdown", onUserGesture, true);
    window.removeEventListener("keydown", onUserGesture, true);
    window.removeEventListener("touchstart", onUserGesture, true);
    gameActionStart?.unregister();
    gameActionEnd?.unregister();
    appLifetime?.unregister();
    Array.from(launchTimers.values()).forEach(clearTimeout);
    launchTimers.clear();
    launchActionIds.clear();
    activeContexts.clear();
    applyFilterTarget();
  };
}

/** Release audio graph resources when the Decky plugin is dismounted. */
export function stopMusicLowPassAudio(): void {
  if (graph) {
    try {
      graph.source.disconnect();
      graph.filter.disconnect();
    } catch {
      // Ignore already-disconnected nodes.
    }
  }
  if (sharedAudioContext) sharedAudioContext.close().catch(() => {});
  graph = null;
  sharedAudioContext = null;
  currentElement = null;
  activeContexts.clear();
}
