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

// Titles longer than this do not fit in the message, so they scroll
const SCROLL_FROM_CHARS = 26;
const SCROLL_DELAY_S = 1.2;
const HOLD_AFTER_S = 1.5;

// A title that scrolls to the end once, so a long pack name can be read completely.
// Returns the message title and how long the message must stay on screen.
function titleFor(text: string): { title: any; durationMs: number } {
  if (text.length <= SCROLL_FROM_CHARS) return { title: text, durationMs: 8000 };
  const scrollS = Math.min(8, Math.max(3, text.length * 0.16));
  const durationMs = Math.round((SCROLL_DELAY_S + scrollS + HOLD_AFTER_S) * 1000);
  // The text starts at the left edge. At the end of the animation its right edge is at the right
  // edge of the box (left: 100% is the box width, translateX(-100%) is the text width).
  const title = (
    <div style={{ overflow: "hidden", whiteSpace: "nowrap", position: "relative", width: "100%" }}>
      <style>
        {`@keyframes audioloader_scroll_title {
          from { left: 0%; transform: translateX(0%); }
          to { left: 100%; transform: translateX(-100%); }
        }`}
      </style>
      <span
        style={{
          position: "relative",
          display: "inline-block",
          animation: `audioloader_scroll_title ${scrollS}s ease-in-out ${SCROLL_DELAY_S}s 1 both`,
        }}
      >
        {text}
      </span>
    </div>
  );
  return { title, durationMs };
}

export function announceMusic(pack: Pack | undefined) {
  if (!nowPlayingSettings.enabled || !pack) return;
  const now = Date.now();
  if (pack.name === lastPack && now - lastAt < REPEAT_MS) return;
  lastPack = pack.name;
  lastAt = now;
  const { title, durationMs } = titleFor(`Now Playing: ${pack.name}`);
  python.toast(title, shortCredits(pack.author), durationMs);
}
