import { useEffect, useState } from "react";
import { Settings, settings, subscribeSettings } from "../settings";

/** For the menu: re-renders when a setting changes. */
export function useSettings(): Settings {
  const [, setTick] = useState(0);
  useEffect(() => subscribeSettings(() => setTick((t) => t + 1)), []);
  return settings;
}
