import { Pack } from "../classes";
import * as python from "../python";

// "Show Now Playing": a small on-screen message when new music starts
export const nowPlayingSettings = { enabled: false };

const MAX_CREDITS = 60;
// The same pack is not announced again within this time (restarts after sleep can retry a few times)
const REPEAT_MS = 20000;
// Whatever the pack, never show two messages closer together than this
const MIN_GAP_MS = 3000;

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
  // Smooth scrolling: only "transform" is animated (the browser can do that on the graphics card,
  // so it stays smooth). The distance is measured once the title is on screen: the text moves
  // left by exactly as much as it is wider than its box, so its end stops at the right edge.
  const start = (box: HTMLElement | null) => {
    if (!box || (box as any).__alStarted) return;
    const span = box.firstElementChild as HTMLElement | null;
    if (!span || typeof (span as any).animate !== "function") return;
    (box as any).__alStarted = true;
    const distance = span.scrollWidth - box.clientWidth;
    if (distance <= 0) return;
    span.animate(
      [{ transform: "translate3d(0, 0, 0)" }, { transform: `translate3d(${-distance}px, 0, 0)` }],
      { duration: scrollS * 1000, delay: SCROLL_DELAY_S * 1000, easing: "linear", fill: "both" }
    );
  };
  const title = (
    <div ref={start} style={{ overflow: "hidden", whiteSpace: "nowrap", width: "100%" }}>
      <span style={{ display: "inline-block", willChange: "transform" }}>{text}</span>
    </div>
  );
  return { title, durationMs };
}

export function announceMusic(pack: Pack | undefined) {
  if (!nowPlayingSettings.enabled || !pack) return;
  const now = Date.now();
  if (now - lastAt < MIN_GAP_MS) return;
  if (pack.name === lastPack && now - lastAt < REPEAT_MS) return;
  lastPack = pack.name;
  lastAt = now;
  const { title, durationMs } = titleFor(`Now Playing: ${pack.name}`);
  python.toast(title, shortCredits(pack.author), durationMs);
}
