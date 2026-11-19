import { Pack } from "../classes";

export const soundStem = (name: string): string => name.replace(/\.[^./]+$/, "");

type PackSoundInfo = Pick<Pack, "ignore" | "mappings" | "files">;

export function isIgnored(pack: PackSoundInfo, soundName: string): boolean {
  const stem = soundStem(soundName);
  return (pack.ignore || []).some((ignored) => soundStem(ignored) === stem);
}

export function findMappedFiles(pack: PackSoundInfo, soundName: string): string[] | undefined {
  const mappings = (pack.mappings || {}) as Record<string, unknown>;
  const stem = soundStem(soundName);
  const key = Object.keys(mappings).find((k) => k === soundName) ?? Object.keys(mappings).find((k) => soundStem(k) === stem);
  if (key === undefined) return undefined;

  const mapped = mappings[key];
  if (Array.isArray(mapped) && mapped.length > 0 && mapped.every((item) => typeof item === "string")) {
    return mapped as string[];
  }
  return undefined;
}

export function resolvePackFile(pack: PackSoundInfo, soundName: string): string | undefined {
  const mapped = findMappedFiles(pack, soundName);
  if (mapped) {
    return mapped[Math.trunc(Math.random() * mapped.length)];
  }

  const candidates = pack.files?.[soundStem(soundName)];
  if (candidates && candidates.length > 0) {
    return candidates.includes(soundName) ? soundName : candidates[0];
  }

  return undefined;
}
