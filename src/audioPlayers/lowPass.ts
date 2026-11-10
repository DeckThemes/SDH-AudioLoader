import { findSP } from "decky-frontend-lib";
import * as python from "../python";
import { musicWantsGraph } from "./loudness";
import {
  allMusicGraphs,
  glide,
  MusicGraph,
  onMusicGraphAttached,
  openCutoff,
  releaseOtherMusicGraphs,
  requestMusicGraph,
  resumeMusicContext,
  stopMusicGraphs,
} from "./musicGraph";

// Music low-pass filter ("muffled music"): the menu music gets a low-pass filter while a Steam menu,
// the Quick Access (...) menu or a pop-up (confirmation box, notification) is open, or while a game
// is loading. Only Encore's own menu music is filtered. Steam's sound effects and the game's sound
// are not touched. The filter lives in the music's Web Audio chain (musicGraph.ts).

export interface MusicLowPassSettings {
  steamMenu: boolean;
  quickAccess: boolean;
  gameLoading: boolean;
  popups: boolean;
  /** 0-100. 0 is almost no change (20 kHz), 100 is a strong filter (500 Hz). */
  strength: number;
}

type FilterContext = "steamMenu" | "quickAccess" | "gameLoading" | "popup" | "preview";

const MIN_CUTOFF_HZ = 500;
const MAX_CUTOFF_HZ = 20000;
// Filter moving in (a menu opened) and moving out (it closed), in seconds (about 5x this until done).
// Opening up is slower: a sudden return of the high sounds is easy to hear.
const CLOSE_SECONDS = 0.08;
const OPEN_SECONDS = 0.25;
const MENU_POLL_MS = 250;
// Steam gives no sure "loading is over" signal on every version, so a loading state ends by itself
const LOADING_FAILSAFE_MS = 5 * 60 * 1000;
// When a game has loaded, the music is stopped right after. The filter stays on until the music is
// paused (at most this long), so the music is not heard unfiltered for a moment before it stops.
const LOADING_HOLD_MS = 4000;
const PREVIEW_MS = 1500;
// Pop-ups: Steam plays these sounds when a dialog opens and closes, and for notifications
const POPUP_OPEN_SOUNDS = new Set(["deck_ui_show_modal.wav"]);
const POPUP_CLOSE_SOUNDS = new Set(["deck_ui_hide_modal.wav"]);
const NOTIFICATION_SOUNDS = new Set([
  "deck_ui_toast.wav",
  "deck_ui_message_toast.wav",
  "deck_ui_achievement_toast.wav",
  "steam_chatroom_notification.wav",
]);
const NOTIFICATION_MS = 3500;
// A dialog that was opened (by its sound) but never closed ends by itself after this long
const POPUP_FAILSAFE_MS = 2 * 60 * 1000;
// When dialogs can be seen on the screen, a dialog that is gone this long counts as closed
const POPUP_GONE_MS = 1200;
// Values of Steam's SideMenu enum
const SIDE_MENU_MAIN = 1;
const SIDE_MENU_QUICK_ACCESS = 2;

let settings: MusicLowPassSettings = {
  steamMenu: false,
  quickAccess: false,
  gameLoading: false,
  popups: false,
  strength: 50,
};
const activeContexts = new Set<FilterContext>();
let currentElement: HTMLAudioElement | null = null;
let previewTimer: ReturnType<typeof setTimeout> | null = null;
let loadingHoldUntil = 0;
let lastFiltered = false;
// Pop-up state
let popupOpenedAt = 0;
let notificationUntil = 0;
let dialogSeenEver = false;
let dialogGoneSince = 0;

function anyEnabled(): boolean {
  return settings.steamMenu || settings.quickAccess || settings.gameLoading || settings.popups;
}

function loadingHeld(): boolean {
  return (
    loadingHoldUntil > Date.now() && !!currentElement && !currentElement.paused && !currentElement.ended
  );
}

export function shouldFilter(): boolean {
  return (
    (settings.steamMenu && activeContexts.has("steamMenu")) ||
    (settings.quickAccess && activeContexts.has("quickAccess")) ||
    (settings.gameLoading && (activeContexts.has("gameLoading") || loadingHeld())) ||
    (settings.popups && activeContexts.has("popup")) ||
    (anyEnabled() && activeContexts.has("preview"))
  );
}

export function cutoffForStrength(strength: number): number {
  const normalized = Math.max(0, Math.min(100, strength)) / 100;
  // A logarithmic scale sounds even: every step changes the sound by a similar amount
  return MAX_CUTOFF_HZ * Math.pow(MIN_CUTOFF_HZ / MAX_CUTOFF_HZ, normalized);
}

function applyFilterTo(graph: MusicGraph, filtered: boolean): void {
  const target = filtered ? Math.min(cutoffForStrength(settings.strength), openCutoff(graph.context)) : openCutoff(graph.context);
  glide(graph, graph.filter.frequency, target, filtered ? CLOSE_SECONDS : OPEN_SECONDS);
}

function applyFilterTarget(): void {
  const filtered = shouldFilter();
  lastFiltered = filtered;
  for (const graph of allMusicGraphs()) applyFilterTo(graph, filtered);
}

onMusicGraphAttached((graph) => applyFilterTo(graph, shouldFilter()));

function update(): void {
  if (shouldFilter() && currentElement) void requestMusicGraph(currentElement);
  applyFilterTarget();
}

function setContext(context: FilterContext, active: boolean): void {
  if (active === activeContexts.has(context)) return;
  if (active) activeContexts.add(context);
  else activeContexts.delete(context);
  // The music usually stops right after a game has loaded: keep the filter until it has
  if (context === "gameLoading") loadingHoldUntil = active ? 0 : Date.now() + LOADING_HOLD_MS;
  update();
}

/** Applies the settings (when loading them, and whenever one is changed). */
export function configureMusicLowPass(next: Partial<MusicLowPassSettings>): void {
  settings = {
    steamMenu: !!next.steamMenu,
    quickAccess: !!next.quickAccess,
    gameLoading: !!next.gameLoading,
    popups: !!next.popups,
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
  if (currentElement !== element) {
    currentElement = element;
    releaseOtherMusicGraphs(element);
  }
  update();
}

/** Call with the name of every Steam sound effect that is about to play ("deck_ui_toast.wav"). */
export function lowPassForSound(soundName: string): void {
  if (POPUP_OPEN_SOUNDS.has(soundName)) {
    popupOpenedAt = Date.now();
    dialogGoneSince = 0;
  } else if (POPUP_CLOSE_SOUNDS.has(soundName)) {
    popupOpenedAt = 0;
  } else if (NOTIFICATION_SOUNDS.has(soundName)) {
    notificationUntil = Date.now() + NOTIFICATION_MS;
  } else {
    return;
  }
  checkPopups();
}

// Is a dialog (confirmation box and the like) shown in the Steam screen right now?
function dialogOnScreen(): boolean {
  const docs: Document[] = [];
  try {
    const sp = findSP?.();
    if (sp?.document) docs.push(sp.document);
  } catch {
    // not available on this Steam version
  }
  if (typeof document !== "undefined" && !docs.includes(document)) docs.push(document);
  for (const doc of docs) {
    try {
      const found = doc.querySelectorAll(".ModalPosition, .GenericConfirmDialog");
      for (let i = 0; i < found.length; i++) {
        const rect = (found[i] as HTMLElement).getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) return true;
      }
    } catch {
      // try the next one
    }
  }
  return false;
}

function checkPopups(): void {
  const now = Date.now();
  const onScreen = settings.popups ? dialogOnScreen() : false;
  if (onScreen) {
    dialogSeenEver = true;
    dialogGoneSince = 0;
  } else if (popupOpenedAt > 0) {
    if (!dialogGoneSince) dialogGoneSince = now;
    // A missed "closed" sound: dialogs can be seen on this Steam version, and this one is gone
    if (dialogSeenEver && now - dialogGoneSince > POPUP_GONE_MS) popupOpenedAt = 0;
  }
  if (popupOpenedAt > 0 && now - popupOpenedAt > POPUP_FAILSAFE_MS) popupOpenedAt = 0;
  setContext("popup", onScreen || popupOpenedAt > 0 || notificationUntil > now);
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
 * Starts watching the Steam menus, pop-ups and the game loading. Returns a function that stops it.
 * - Steam menu / Quick Access menu: Steam's own menu store tells which side menu is open.
 * - Pop-ups: the dialog sounds, notifications sounds and the dialogs on the screen.
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
    checkPopups();
    // The hold after a game has loaded ends when the music stops (or after a while)
    if (shouldFilter() !== lastFiltered) update();
    // "Normalize Music Volume" may still be waiting for the music chain
    if (currentElement && (lastFiltered || musicWantsGraph())) void requestMusicGraph(currentElement);
    // A connected player may have been stopped by the system (like after sleep): wake it up
    resumeMusicContext();
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
    loadingHoldUntil = 0;
    popupOpenedAt = 0;
    notificationUntil = 0;
    applyFilterTarget();
  };
}

/** Frees the audio resources when the plugin is unloaded. */
export function stopMusicLowPassAudio(): void {
  stopMusicGraphs();
  currentElement = null;
  activeContexts.clear();
}
