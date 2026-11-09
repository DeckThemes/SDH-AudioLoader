import { Pack } from "../classes";
import * as python from "../python";
import { settings } from "../settings";

// Today's date on the Deck's own clock, like "2026-11-07"
export function getTodayKey(): string {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

export interface DailyMusicChoice {
  pick: string;
  date: string;
  // true when a new pick was made just now (a new day, or nothing was picked yet)
  isNew: boolean;
}

// Decides which music pack should play today.
// - Same day as the last pick: keep it. This includes "None", so if the user turned the
//   music off by hand, it stays off for the rest of that day.
// - New day: choose a random music pack, avoiding the previous pick when there is more than one.
// Returns null if no music packs are installed.
export function chooseDailyMusic(
  soundPacks: Pack[],
  lastDate: string,
  lastPick: string
): DailyMusicChoice | null {
  const musicNames = soundPacks.filter((p) => p.music).map((p) => p.name);
  if (musicNames.length === 0) return null;

  const today = getTodayKey();
  const stillValid = lastPick === "None" || musicNames.includes(lastPick);
  if (lastDate === today && stillValid) {
    return { pick: lastPick, date: today, isNew: false };
  }

  const pick = chooseVaried(musicNames, lastPick, recentMusic);
  return { pick, date: today, isNew: true };
}

// Runs chooseDailyMusic and, when a new pick was made, remembers it (screen state + config file).
// The caller still has to start the music itself.
export function pickTodaysMusic(
  soundPacks: Pack[],
  lastDate: string,
  lastPick: string,
  setGlobalState: (key: string, value: any) => void
): DailyMusicChoice | null {
  const choice = chooseDailyMusic(soundPacks, lastDate, lastPick);
  if (!choice) return null;

  setGlobalState("selectedMusic", choice.pick);
  if (choice.isNew) {
    setGlobalState("dailyMusicDate", choice.date);
    setGlobalState("dailyMusicPick", choice.pick);
    python.setConfig({
      daily_music_date: choice.date,
      daily_music_pick: choice.pick,
      selected_music: choice.pick,
    });
  }
  return choice;
}

// ---- Variety: avoid hearing the same music (or the same series) again and again ----

const HISTORY_SIZE = 30;
// Packs played lately, oldest first. Saved in the config file as "recent_music".
export let recentMusic: string[] = [];

// The "series" of a pack name, so "Persona 5 - Last Surprise" and "Persona 4 - Pursuing My True Self"
// count as the same series. Takes the text before " - ", ":" or "|", ignores case and trailing numbers.
export function seriesOf(name: string): string {
  const first = name.split(/\s[-\u2013\u2014|]\s|:\s|\s\|\s/)[0] || name;
  const key = first.toLowerCase().replace(/^the\s+/, "").replace(/[\s\d.:]+$/g, "").trim();
  return key || name.toLowerCase();
}

export function loadRecentMusic(saved: any) {
  recentMusic = Array.isArray(saved) ? saved.filter((n) => typeof n === "string").slice(-HISTORY_SIZE) : [];
}

// Call when a music pack starts playing. The same pack twice in a row is counted once.
export function rememberMusic(name: string | undefined) {
  if (!name || name === "None") return;
  if (recentMusic[recentMusic.length - 1] === name) return;
  recentMusic = [...recentMusic.filter((n) => n !== name), name].slice(-HISTORY_SIZE);
  settings.play_counts[name] = (settings.play_counts[name] || 0) + 1;
  python.setConfig({ recent_music: recentMusic, play_counts: settings.play_counts });
}

export interface PickOptions {
  /** 0 = completely random ... 100 = strictest variety */
  variety: number;
  favorites: string[];
  blocked: string[];
}

export function currentPickOptions(): PickOptions {
  return {
    variety: settings.variety_level,
    favorites: settings.favorite_music,
    blocked: settings.blocked_music,
  };
}

function weightedPick<T>(items: T[], weight: (item: T) => number, rnd: () => number): T {
  const total = items.reduce((sum, item) => sum + weight(item), 0);
  let point = rnd() * total;
  for (const item of items) {
    point -= weight(item);
    if (point < 0) return item;
  }
  return items[items.length - 1];
}

const FAVORITE_WEIGHT = 3;

// Picks a pack that was not played lately.
// - "blocked" packs are never picked (unless every pack is blocked).
// - "favorites" come up more often (3 times as likely).
// - "variety" decides how strict the rules are. At 100: no pack from the last 12 plays, and no
//   series from the last 3 plays, when that is possible. Lower numbers relax this step by step.
//   At 0 the pick is completely random (only the pack playing right now is skipped).
// When the strict rules leave nothing, they are relaxed step by step.
// The series is chosen first (all series equal), then a pack inside it, so a big series with
// 30 packs does not take over.
export function chooseVaried(
  names: string[],
  current: string,
  recent: string[],
  rnd: () => number = Math.random,
  options: PickOptions = currentPickOptions()
): string {
  const favorites = new Set(options.favorites);
  const allowed = names.filter((x) => !options.blocked.includes(x));
  const base = allowed.length > 0 ? allowed : names;
  const packWeight = (x: string) => (favorites.has(x) ? FAVORITE_WEIGHT : 1);

  const variety = Math.max(0, Math.min(100, options.variety));
  if (variety === 0) {
    const others = base.filter((x) => x !== current);
    const pool = others.length > 0 ? others : base;
    return weightedPick(pool, packWeight, rnd);
  }

  const n = base.length;
  const avoidCount = Math.floor((Math.min(12, Math.floor(n / 2)) * variety) / 100);
  const seriesCount = Math.round((3 * variety) / 100);
  const avoidPacks = new Set([...(avoidCount > 0 ? recent.slice(-avoidCount) : []), current]);
  const avoidSeries = new Set(
    [...(seriesCount > 0 ? recent.slice(-seriesCount) : []), current].map(seriesOf)
  );

  const tiers: string[][] = [
    base.filter((x) => !avoidPacks.has(x) && !avoidSeries.has(seriesOf(x))),
    base.filter((x) => !avoidPacks.has(x)),
    base.filter((x) => x !== current),
    base,
  ];
  const pool = tiers.find((t) => t.length > 0) || base;

  const bySeries = new Map<string, string[]>();
  for (const x of pool) {
    const k = seriesOf(x);
    bySeries.set(k, [...(bySeries.get(k) || []), x]);
  }
  const groups = Array.from(bySeries.values());
  const group = weightedPick(groups, (g) => (g.some((x) => favorites.has(x)) ? 2 : 1), rnd);
  return weightedPick(group, packWeight, rnd);
}

// For "New Music Every Replay": picks a music pack that was not played lately.
// Returns null if no music packs are installed.
export function pickReplayMusic(soundPacks: Pack[], current: string): string | null {
  const names = soundPacks.filter((p) => p.music).map((p) => p.name);
  if (names.length === 0) return null;
  return chooseVaried(names, current, recentMusic);
}

// ---- Time of day ----

export type DaySlot = "morning" | "afternoon" | "night";

// Morning 05:00-11:59, afternoon 12:00-17:59, night 18:00-04:59
export function slotForHour(hour: number): DaySlot {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  return "night";
}

// With "Music by Time of Day" on: the music pack chosen for the current part of the day, or null
// when the feature is off, nothing is chosen for this part, or that pack is not installed.
export function timeOfDayPack(soundPacks: Pack[], now: Date = new Date()): string | null {
  if (!settings.tod_enabled) return null;
  const slot = slotForHour(now.getHours());
  const wanted = slot === "morning" ? settings.tod_morning : slot === "afternoon" ? settings.tod_afternoon : settings.tod_night;
  if (!wanted) return null;
  return soundPacks.some((p) => p.music && p.name === wanted) ? wanted : null;
}
