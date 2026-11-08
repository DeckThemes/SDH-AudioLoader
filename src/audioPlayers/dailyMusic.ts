import { Pack } from "../classes";
import * as python from "../python";

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
// "Pure Random Music": when on, picks ignore the history and the series rules (only the pack
// that is playing right now is skipped, when there is more than one).
export const varietySettings = { pureRandom: false };
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
  python.setConfig({ recent_music: recentMusic });
}

// Picks a pack that was not played lately. First choice: a pack from a series that has not been
// played in the last few times. If that is not possible, it relaxes step by step.
// The series is chosen first (all series equal), then a pack inside it, so a big series with
// 30 packs does not take over.
export function chooseVaried(
  names: string[],
  current: string,
  recent: string[],
  rnd: () => number = Math.random
): string {
  if (varietySettings.pureRandom) {
    const others = names.filter((x) => x !== current);
    const all = others.length > 0 ? others : names;
    return all[Math.floor(rnd() * all.length)];
  }
  const n = names.length;
  const avoidCount = Math.min(12, Math.floor(n / 2));
  const avoidPacks = new Set([...recent.slice(-avoidCount), current]);
  const avoidSeries = new Set([...recent.slice(-3), current].map(seriesOf));

  const tiers: string[][] = [
    names.filter((x) => !avoidPacks.has(x) && !avoidSeries.has(seriesOf(x))),
    names.filter((x) => !avoidPacks.has(x)),
    names.filter((x) => x !== current),
    names,
  ];
  const pool = tiers.find((t) => t.length > 0) || names;

  const bySeries = new Map<string, string[]>();
  for (const x of pool) {
    const k = seriesOf(x);
    bySeries.set(k, [...(bySeries.get(k) || []), x]);
  }
  const groups = Array.from(bySeries.values());
  const group = groups[Math.floor(rnd() * groups.length)];
  return group[Math.floor(rnd() * group.length)];
}

// For "New Music Every Replay": picks a music pack that was not played lately.
// Returns null if no music packs are installed.
export function pickReplayMusic(soundPacks: Pack[], current: string): string | null {
  const names = soundPacks.filter((p) => p.music).map((p) => p.name);
  if (names.length === 0) return null;
  return chooseVaried(names, current, recentMusic);
}
