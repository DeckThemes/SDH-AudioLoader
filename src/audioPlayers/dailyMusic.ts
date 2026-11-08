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

  const candidates = musicNames.filter((n) => n !== lastPick);
  const pool = candidates.length > 0 ? candidates : musicNames;
  const pick = pool[Math.floor(Math.random() * pool.length)];
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

// For "New Music Every Replay": picks a random music pack that is different from the current one
// (when there is more than one). Returns null if no music packs are installed.
export function pickReplayMusic(soundPacks: Pack[], current: string): string | null {
  const names = soundPacks.filter((p) => p.music).map((p) => p.name);
  if (names.length === 0) return null;
  const others = names.filter((n) => n !== current);
  const pool = others.length > 0 ? others : names;
  return pool[Math.floor(Math.random() * pool.length)];
}
