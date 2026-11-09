import * as python from "../python";
import { settings } from "../settings";
import { Pack } from "../classes";

// A short memory of what the plugin decided lately (which music, and why). It is shown in the
// Info tab, included in "Copy debug info", and also written to the Decky log.
const MAX_NOTES = 40;
const notes: { at: number; text: string }[] = [];

/** Writes a line to the Decky log and keeps it in the "recent decisions" list. */
export function note(text: string): void {
  notes.push({ at: Date.now(), text });
  while (notes.length > MAX_NOTES) notes.shift();
  python.logEvent(text);
}

export function recentNotes(count = MAX_NOTES): { at: number; text: string }[] {
  return notes.slice(-count);
}

export function clearNotes(): void {
  notes.length = 0;
}

const clock = (at: number) => {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

export function formatNotes(count = MAX_NOTES): string {
  return recentNotes(count)
    .map((n) => `${clock(n.at)}  ${n.text}`)
    .join("\n");
}

/** The most played (or least played) packs: [name, plays]. Only packs that still exist. */
export function playStats(
  soundPacks: Pack[],
  count: number,
  order: "most" | "least"
): [string, number][] {
  const names = soundPacks.filter((p) => p.music).map((p) => p.name);
  const rows: [string, number][] = names.map((n) => [n, settings.play_counts[n] || 0]);
  rows.sort((a, b) => (order === "most" ? b[1] - a[1] : a[1] - b[1]) || a[0].localeCompare(b[0]));
  if (order === "most") return rows.filter((r) => r[1] > 0).slice(0, count);
  return rows.slice(0, count);
}

export interface DebugContext {
  version: string;
  buildTag: string;
  legacyEnabled: boolean;
  selectedMusic: string;
  musicPlaying: boolean;
  gamesRunning: number;
  packCount: number;
  toggles: Record<string, any>;
  extra?: Record<string, any>;
}

/** Text for "Copy debug info": settings and the last decisions, without anything personal. */
export function buildDebugInfo(ctx: DebugContext): string {
  const lines: string[] = [];
  lines.push(`Audio Loader Encore ${ctx.version || "?"} (${ctx.buildTag})`);
  lines.push(`Time: ${new Date().toString()}`);
  lines.push(
    `Legacy: ${ctx.legacyEnabled}, music: "${ctx.selectedMusic}", playing: ${ctx.musicPlaying}, games running: ${ctx.gamesRunning}, music packs: ${ctx.packCount}`
  );
  lines.push("");
  lines.push("Settings:");
  for (const [k, v] of Object.entries(ctx.toggles)) lines.push(`  ${k}: ${JSON.stringify(v)}`);
  lines.push(
    `  variety_level: ${settings.variety_level}, favorites: ${settings.favorite_music.length}, blocked: ${settings.blocked_music.length}`
  );
  lines.push(
    `  time of day: ${settings.tod_enabled} (morning "${settings.tod_morning}", afternoon "${settings.tod_afternoon}", night "${settings.tod_night}")`
  );
  lines.push(
    `  battery saver: ${settings.battery_saver} (${settings.battery_threshold}%), smooth fades: ${settings.smooth_fades}, duck notifications: ${settings.duck_notifications}, soft new device: ${settings.soft_new_device}`
  );
  if (ctx.extra) for (const [k, v] of Object.entries(ctx.extra)) lines.push(`  ${k}: ${JSON.stringify(v)}`);
  lines.push("");
  lines.push("Recent decisions:");
  const n = formatNotes(25);
  lines.push(n === "" ? "  (none yet)" : n);
  return lines.join("\n");
}
