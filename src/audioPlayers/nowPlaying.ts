import { Pack } from "../classes";
import * as python from "../python";

// "Show Now Playing": a small on-screen message when new music starts
export const nowPlayingSettings = { enabled: false };

const MAX_CREDITS = 60;
// The same pack is not announced again within this time (restarts after sleep can retry a few times)
const REPEAT_MS = 20000;

let lastPack = "";
let lastAt = 0;

export function shortCredits(author: string | undefined): string {
  const text = (author || "").replace(/\s+/g, " ").trim();
  if (text === "" || text === "Unknown") return "Unknown author";
  const credits = `by ${text}`;
  return credits.length > MAX_CREDITS ? credits.slice(0, MAX_CREDITS - 3).trimEnd() + "..." : credits;
}

export function announceMusic(pack: Pack | undefined) {
  if (!nowPlayingSettings.enabled || !pack) return;
  const now = Date.now();
  if (pack.name === lastPack && now - lastAt < REPEAT_MS) return;
  lastPack = pack.name;
  lastAt = now;
  python.toast(`Now Playing: ${pack.name}`, shortCredits(pack.author));
}
