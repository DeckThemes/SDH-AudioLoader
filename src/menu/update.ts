import * as python from "../python";
import { settings, notifySettingsChanged } from "../settings";
import { note } from "../audioPlayers/stats";

// "Check for Updates": asks GitHub (through the backend) for the newest release.
export interface UpdateInfo {
  current: string;
  latest: string;
  url: string;
  error: string;
}

const RECHECK_MS = 6 * 60 * 60 * 1000;
let info: UpdateInfo | null = null;
let checkedAt = 0;
let running: Promise<void> | null = null;

export function getUpdateInfo(): UpdateInfo | null {
  return info;
}

/** True when version `a` is newer than version `b` (like "1.3.1" and "1.3.0"). */
export function isNewer(a: string, b: string): boolean {
  const parse = (v: string) =>
    String(v || "")
      .replace(/^v/i, "")
      .split(".")
      .map((p) => parseInt(p, 10) || 0);
  const x = parse(a);
  const y = parse(b);
  if (!a || !b) return false;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

export function forceUpdateCheck(): Promise<void> {
  if (running) return running;
  running = (async () => {
    try {
      const r: any = await python.checkForUpdate();
      if (r?.success && r.result) {
        info = r.result as UpdateInfo;
        checkedAt = Date.now();
        note(
          info.error
            ? `Update check failed: ${info.error}`
            : `Update check: installed v${info.current}, newest v${info.latest}`
        );
      } else {
        info = { current: "", latest: "", url: "", error: "no answer from the backend" };
      }
    } catch (e) {
      info = { current: "", latest: "", url: "", error: String(e) };
    } finally {
      running = null;
      notifySettingsChanged();
    }
  })();
  return running;
}

/** Checks once when the menu opens (at most every 6 hours), if the user did not turn it off. */
export function checkUpdateOnce(): void {
  if (!settings.update_check) return;
  if (info && Date.now() - checkedAt < RECHECK_MS) return;
  void forceUpdateCheck();
}
