import { settings } from "../settings";
import { applyMusicVolume, musicFx } from "./loudness";
import { musicGraphFor } from "./musicGraph";

// Smooth fades and "ducking" (a short volume dip) for the menu music.
// Both work through factors on the player's volume (see applyMusicVolume), so they never fight
// with the volume slider or with "Normalize Volume".

const FADE_IN_MS = 1500;
const FADE_OUT_MS = 700;
const STEP_MS = 50;

const NOTIFICATION_SOUNDS = new Set([
  "deck_ui_toast.wav",
  "deck_ui_message_toast.wav",
  "deck_ui_achievement_toast.wav",
]);
const DUCK_LEVEL = 0.35;
const NOTIFICATION_HOLD_MS = 2200;
const DEVICE_DUCK_LEVEL = 0.3;
const DEVICE_HOLD_MS = 2500;
// Without "Smooth Fades", a player in the music chain still gets a very short fade before it stops,
// so it does not click or pop. The fade runs on the audio clock (see VOLUME_GLIDE in loudness.ts).
const DECLICK_MS = 160;

let currentPlayer: any = null;
const fadeTimers = new WeakMap<object, ReturnType<typeof setInterval>>();

function reapply(el: any) {
  if (!el) return;
  applyMusicVolume(el, typeof el.alVolume === "number" ? el.alVolume : el.volume);
}

/** Tells the fade code which player is the current menu music (ducking applies to it). */
export function setFadePlayer(el: any): void {
  currentPlayer = el;
}

function rampFade(el: any, to: number, ms: number, done?: () => void) {
  const old = fadeTimers.get(el);
  if (old) clearInterval(old);
  const from = typeof el.alFade === "number" ? el.alFade : 1;
  const steps = Math.max(1, Math.round(ms / STEP_MS));
  let n = 0;
  const timer = setInterval(() => {
    n++;
    el.alFade = from + ((to - from) * n) / steps;
    reapply(el);
    if (n >= steps) {
      clearInterval(timer);
      fadeTimers.delete(el);
      el.alFade = to;
      reapply(el);
      done?.();
    }
  }, STEP_MS);
  fadeTimers.set(el, timer);
}

const declickTimers = new WeakMap<object, ReturnType<typeof setTimeout>>();

function stopFade(el: any) {
  const old = fadeTimers.get(el);
  if (old) clearInterval(old);
  fadeTimers.delete(el);
  const pending = declickTimers.get(el);
  if (pending) clearTimeout(pending);
  declickTimers.delete(el);
}

// The short fade before a stop. Returns false when the player is not in the music chain.
function declick(el: any, done?: () => void): boolean {
  if (!musicGraphFor(el)) return false;
  stopFade(el);
  el.alFade = 0;
  reapply(el);
  const timer = setTimeout(() => {
    declickTimers.delete(el);
    done?.();
  }, DECLICK_MS);
  declickTimers.set(el, timer);
  return true;
}

/** A new player starts silent and rises to the normal volume (when "Smooth Fades" is on). */
export function fadeInMusic(el: any): void {
  if (!el) return;
  if (!settings.smooth_fades) {
    stopFade(el);
    el.alFade = 1;
    reapply(el);
    return;
  }
  el.alFade = 0;
  reapply(el);
  rampFade(el, 1, FADE_IN_MS);
}

/**
 * Lowers the player to silence, then calls done. Without "Smooth Fades" it only takes a moment
 * (just long enough to avoid a click).
 */
export function fadeOutMusic(el: any, done?: () => void): void {
  if (!el) {
    done?.();
    return;
  }
  if (!settings.smooth_fades) {
    if (!declick(el, done)) done?.();
    return;
  }
  rampFade(el, 0, FADE_OUT_MS, done);
}

/** Pauses the music, with a fade out when "Smooth Fades" is on. */
export function pauseMusicSmooth(el: any): void {
  if (!el) return;
  fadeOutMusic(el, () => {
    el.pause();
  });
}

/** Continues the music, with a fade in when "Smooth Fades" is on. */
export function resumeMusicSmooth(el: any): Promise<void> | void {
  if (!el) return;
  stopFade(el);
  // A player in the music chain starts silent and rises within a moment, so it does not click
  const declicked = !settings.smooth_fades && !!musicGraphFor(el);
  el.alFade = settings.smooth_fades || declicked ? 0 : 1;
  reapply(el);
  const result = el.play();
  if (settings.smooth_fades) rampFade(el, 1, FADE_IN_MS);
  else if (declicked) {
    el.alFade = 1;
    reapply(el);
  }
  return result;
}

let duckTimer: ReturnType<typeof setTimeout> | null = null;
let duckRamp: ReturnType<typeof setInterval> | null = null;

function rampDuck(to: number, ms: number, done?: () => void) {
  if (duckRamp) clearInterval(duckRamp);
  const from = musicFx.duck;
  const steps = Math.max(1, Math.round(ms / STEP_MS));
  let n = 0;
  duckRamp = setInterval(() => {
    n++;
    musicFx.duck = from + ((to - from) * n) / steps;
    reapply(currentPlayer);
    if (n >= steps) {
      if (duckRamp) clearInterval(duckRamp);
      duckRamp = null;
      musicFx.duck = to;
      reapply(currentPlayer);
      done?.();
    }
  }, STEP_MS);
}

/** Lowers the music to `level` (0..1) for `holdMs`, then brings it back smoothly. */
export function duckMusic(level: number, holdMs: number): void {
  if (duckTimer) clearTimeout(duckTimer);
  rampDuck(level, 250);
  duckTimer = setTimeout(() => {
    duckTimer = null;
    rampDuck(1, 700);
  }, holdMs);
}

/** Call with the name of every Steam sound effect that is about to play ("deck_ui_toast.wav"). */
export function maybeDuckForSound(soundName: string): void {
  if (!settings.duck_notifications) return;
  if (!NOTIFICATION_SOUNDS.has(soundName)) return;
  duckMusic(DUCK_LEVEL, NOTIFICATION_HOLD_MS);
}

/** Call when a new audio device (headphones, Bluetooth speaker) was connected. */
export function duckForNewDevice(): void {
  if (!settings.soft_new_device) return;
  duckMusic(DEVICE_DUCK_LEVEL, DEVICE_HOLD_MS);
}

/** Resets everything (when the plugin is unloaded). */
export function stopFx(): void {
  if (duckTimer) clearTimeout(duckTimer);
  if (duckRamp) clearInterval(duckRamp);
  duckTimer = null;
  duckRamp = null;
  musicFx.duck = 1;
  currentPlayer = null;
}
