import * as python from "./python";

// The newer settings (1.3.0 and later) live here, in one place. Each key is also the name used in
// the config file. The older settings are still kept in the global state.
export interface Settings {
  /** 0 = completely random, 100 = strictest variety (avoid recent packs and series). */
  variety_level: number;
  smooth_fades: boolean;
  duck_notifications: boolean;
  soft_new_device: boolean;
  tod_enabled: boolean;
  tod_morning: string;
  tod_afternoon: string;
  tod_night: string;
  favorite_music: string[];
  blocked_music: string[];
  battery_saver: boolean;
  /** Battery percent (5-50). Below it, and not charging, the music pauses. */
  battery_threshold: number;
  /** Minutes for the sleep timer (it is started by a button). */
  sleep_timer_minutes: number;
  play_counts: Record<string, number>;
  update_check: boolean;
  hide_descriptions: boolean;
  ui_tab: string;
  ui_collapsed: Record<string, boolean>;
}

export const DEFAULT_SETTINGS: Settings = {
  variety_level: 100,
  smooth_fades: false,
  duck_notifications: false,
  soft_new_device: false,
  tod_enabled: false,
  tod_morning: "",
  tod_afternoon: "",
  tod_night: "",
  favorite_music: [],
  blocked_music: [],
  battery_saver: false,
  battery_threshold: 20,
  sleep_timer_minutes: 30,
  play_counts: {},
  update_check: true,
  hide_descriptions: false,
  ui_tab: "music",
  ui_collapsed: {},
};

export const settings: Settings = {
  ...DEFAULT_SETTINGS,
  favorite_music: [],
  blocked_music: [],
  play_counts: {},
  ui_collapsed: {},
};

type Listener = () => void;
const listeners = new Set<Listener>();
const notify = () => listeners.forEach((l) => l());

const stringList = (v: any): string[] =>
  Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];

const clampNumber = (v: any, min: number, max: number, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
};

/** Reads the settings from the saved config (anything missing or broken gets its default). */
export function loadSettings(data: any): void {
  const d = data || {};
  // Older builds (1.2.5 - 1.2.8) had a "Pure Random Music" switch: that is variety 0 now
  const legacyPureRandom = d.pure_random_music === true;
  settings.variety_level = clampNumber(
    d.variety_level ?? (legacyPureRandom ? 0 : DEFAULT_SETTINGS.variety_level),
    0,
    100,
    DEFAULT_SETTINGS.variety_level
  );
  settings.smooth_fades = d.smooth_fades === true;
  settings.duck_notifications = d.duck_notifications === true;
  settings.soft_new_device = d.soft_new_device === true;
  settings.tod_enabled = d.tod_enabled === true;
  settings.tod_morning = typeof d.tod_morning === "string" ? d.tod_morning : "";
  settings.tod_afternoon = typeof d.tod_afternoon === "string" ? d.tod_afternoon : "";
  settings.tod_night = typeof d.tod_night === "string" ? d.tod_night : "";
  settings.favorite_music = stringList(d.favorite_music);
  settings.blocked_music = stringList(d.blocked_music);
  settings.battery_saver = d.battery_saver === true;
  settings.battery_threshold = clampNumber(d.battery_threshold, 5, 50, DEFAULT_SETTINGS.battery_threshold);
  settings.sleep_timer_minutes = clampNumber(d.sleep_timer_minutes, 1, 240, DEFAULT_SETTINGS.sleep_timer_minutes);
  const counts: Record<string, number> = {};
  if (d.play_counts && typeof d.play_counts === "object") {
    for (const [k, v] of Object.entries(d.play_counts)) {
      if (typeof v === "number" && Number.isFinite(v) && v > 0) counts[k] = Math.floor(v);
    }
  }
  settings.play_counts = counts;
  settings.update_check = d.update_check !== false;
  settings.hide_descriptions = d.hide_descriptions === true;
  settings.ui_tab = typeof d.ui_tab === "string" ? d.ui_tab : DEFAULT_SETTINGS.ui_tab;
  const collapsed: Record<string, boolean> = {};
  if (d.ui_collapsed && typeof d.ui_collapsed === "object") {
    for (const [k, v] of Object.entries(d.ui_collapsed)) if (v === true) collapsed[k] = true;
  }
  settings.ui_collapsed = collapsed;
  notify();
}

/** Changes one setting, saves it in the config file and updates the menu. */
export function updateSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  (settings as any)[key] = value;
  python.setConfig({ [key]: value });
  notify();
}

/** Changes a setting without saving it (for values that are saved elsewhere). */
export function setSettingQuiet<K extends keyof Settings>(key: K, value: Settings[K]): void {
  (settings as any)[key] = value;
  notify();
}

/** Re-draws the menu after a change that was made outside of a menu control. */
export function notifySettingsChanged(): void {
  notify();
}

export function subscribeSettings(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
