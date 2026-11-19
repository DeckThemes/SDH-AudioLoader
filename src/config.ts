import * as python from "./python";
import { GlobalState } from "./state/GlobalState";

let state: GlobalState | null = null;

export function setConfigState(s: GlobalState) {
  state = s;
}

// Builds the complete config object from current global state and writes it to disk.
// Every setting goes through here so no call site can accidentally drop a key.
export function saveConfig() {
  if (!state) return;
  const s = state.getPublicState();
  python.setConfig({
    selected_pack: s.activeSound,
    selected_music: s.selectedMusic,
    selected_track: s.selectedTrack,
    sound_volume: s.soundVolume,
    music_volume: s.musicVolume,
    legacy_enabled: s.legacyEnabled,
    music_shuffle: s.musicShuffle,
    music_repeat: s.musicRepeat,
    random_sound_on_launch: s.randomSoundOnLaunch,
    random_music_on_launch: s.randomMusicOnLaunch,
  });
}
