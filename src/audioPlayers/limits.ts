import { GlobalState } from "../state/GlobalState";
import { settings, notifySettingsChanged } from "../settings";
import { menuMusicControl } from "./changeMenuMusic";
import { duckForNewDevice, pauseMusicSmooth, resumeMusicSmooth } from "./fade";
import { note } from "./stats";

// Battery Saver and the Sleep Timer: both pause the menu music on purpose, and resume it later.
// While one of them has paused the music, the music guard leaves it alone
// (menuMusicControl.pausedByLimit).

const CHECK_MS = 30000;
// The music comes back when the battery is this many percent above the limit (or charging)
const RESUME_MARGIN = 3;

const battery = { has: false, level: 1, charging: false, known: false };
let sleepTimer: ReturnType<typeof setTimeout> | null = null;
let sleepEndsAt: number | null = null;
let activeState: GlobalState | null = null;

export function isBatteryLow(percentLimit: number, extraMargin = 0): boolean {
  if (!battery.known || !battery.has || battery.charging) return false;
  return battery.level * 100 < percentLimit + extraMargin;
}

export function batteryInfo() {
  return { ...battery };
}

function musicIsWanted(state: GlobalState): boolean {
  const s = state.getPublicState();
  return s.legacyEnabled && s.selectedMusic !== "None" && s.gamesRunning.length === 0;
}

function pauseFor(state: GlobalState, reason: "battery" | "sleepTimer") {
  const s = state.getPublicState();
  menuMusicControl.pausedByLimit = reason;
  if (s.menuMusic && !s.menuMusic.paused) pauseMusicSmooth(s.menuMusic);
  note(reason === "battery" ? "Music paused: battery is low (Battery Saver)" : "Music stopped: the Sleep Timer ran out");
  notifySettingsChanged();
}

function resumeFrom(state: GlobalState, reason: "battery" | "sleepTimer") {
  if (menuMusicControl.pausedByLimit !== reason) return;
  menuMusicControl.pausedByLimit = null;
  const s = state.getPublicState();
  note(reason === "battery" ? "Music resumed: battery is fine again" : "Music resumed after the Sleep Timer");
  if (musicIsWanted(state) && s.menuMusic && !menuMusicControl.pausedByOtherPlugin) {
    Promise.resolve(resumeMusicSmooth(s.menuMusic)).catch(() => {});
  }
  notifySettingsChanged();
}

/** Looks at the battery and pauses or resumes the music. Runs on battery changes and every 30 s. */
export function evaluateBattery(state: GlobalState): void {
  const limit = settings.battery_saver ? settings.battery_threshold : 0;
  if (!settings.battery_saver) {
    resumeFrom(state, "battery");
    return;
  }
  if (menuMusicControl.pausedByLimit === "battery") {
    if (!isBatteryLow(limit, RESUME_MARGIN)) resumeFrom(state, "battery");
    return;
  }
  if (isBatteryLow(limit) && musicIsWanted(state) && menuMusicControl.pausedByLimit === null) {
    pauseFor(state, "battery");
  }
}

// ---- Sleep Timer ----

export function sleepTimerEndsAt(): number | null {
  return sleepEndsAt;
}

export function startSleepTimer(minutes: number): void {
  cancelSleepTimer(false);
  const ms = Math.max(1, Math.round(minutes)) * 60 * 1000;
  sleepEndsAt = Date.now() + ms;
  sleepTimer = setTimeout(() => {
    sleepTimer = null;
    sleepEndsAt = null;
    if (activeState && musicIsWanted(activeState)) pauseFor(activeState, "sleepTimer");
    notifySettingsChanged();
  }, ms);
  note(`Sleep Timer started: ${Math.round(minutes)} minutes`);
  notifySettingsChanged();
}

export function cancelSleepTimer(announce = true): void {
  if (sleepTimer) clearTimeout(sleepTimer);
  sleepTimer = null;
  const wasRunning = sleepEndsAt !== null;
  sleepEndsAt = null;
  if (wasRunning && announce) note("Sleep Timer cancelled");
  if (announce) notifySettingsChanged();
}

/** The Sleep Timer's pause ends: the Deck woke up, a game closed, or the user pressed Resume. */
export function endSleepTimerPause(state: GlobalState): void {
  cancelSleepTimer(false);
  resumeFrom(state, "sleepTimer");
}

export function limitStatusText(): string {
  const parts: string[] = [];
  if (menuMusicControl.pausedByLimit === "battery") parts.push("paused: battery low");
  if (menuMusicControl.pausedByLimit === "sleepTimer") parts.push("stopped by Sleep Timer");
  if (sleepEndsAt !== null) {
    const min = Math.max(1, Math.ceil((sleepEndsAt - Date.now()) / 60000));
    parts.push(`Sleep Timer: ${min} min left`);
  }
  return parts.join(", ");
}

/** Starts watching the battery and new audio devices. Returns a function that stops it. */
export function startMusicLimits(state: GlobalState): () => void {
  activeState = state;
  const hooks: { unregister?: () => void }[] = [];
  try {
    const system = (SteamClient as any)?.System;
    if (typeof system?.RegisterForBatteryStateChanges === "function") {
      hooks.push(
        system.RegisterForBatteryStateChanges((st: any) => {
          battery.known = true;
          battery.has = !!st?.bHasBattery;
          battery.level = typeof st?.flLevel === "number" ? st.flLevel : 1;
          // eACState 2/3: power connected. eBatteryState 2/3: charging / full.
          battery.charging =
            st?.eACState === 2 || st?.eACState === 3 || st?.eBatteryState === 2 || st?.eBatteryState === 3;
          evaluateBattery(state);
        })
      );
    }
    if (typeof system?.Audio?.RegisterForDeviceAdded === "function") {
      hooks.push(system.Audio.RegisterForDeviceAdded(() => duckForNewDevice()));
    }
  } catch (error) {
    note(`Battery Saver / new device detection is not available: ${error}`);
  }
  const timer = setInterval(() => evaluateBattery(state), CHECK_MS);
  return () => {
    clearInterval(timer);
    hooks.forEach((h) => {
      try {
        h.unregister?.();
      } catch {
        // nothing to clean up
      }
    });
    cancelSleepTimer(false);
    activeState = null;
    menuMusicControl.pausedByLimit = null;
  };
}
