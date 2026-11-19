### Summary
Turns the single looping menu music into a real, first-class music player, and makes the settings and sound resolution more robust. `changeMenuMusic.ts` is replaced by a new `musicPlayer.ts` that owns the queue, playback state and game pause/resume. Music no longer sits behind the "Enable Legacy Features" toggle, which is removed. Default behavior is otherwise unchanged: repeat defaults to "one", so the menu music loops as before.

### Music player
- **Controls in the Quick Access Menu:** Previous, Play/Pause and Next buttons, a now-playing line, and shuffle and repeat toggles.
- **Queue:** every song of every installed music pack, ordered by pack name. Skip wraps at both ends.
- **Previous** restarts the current song after 3 seconds of playback, otherwise goes back. In shuffle mode it goes back to the last song actually played, using a capped history.
- **Shuffle** plays each song once per cycle in random order and never repeats a song back to back.
- **Repeat** cycles through Off, All and One. Off stops at the end of the queue or shuffle cycle.
- **Song dropdown** appears when a pack maps several songs to `menu_music`.
- **Intros:** `intro_music` plays before the first song, or when skip moves into a new pack.
- **Error handling:** a missing intro or broken song is skipped instead of stopping playback. Playback gives up only after every song in a row has failed.
- **Games:** music pauses while a game runs and resumes afterwards, unless the user paused it themselves.
- **Desktop UI:** music only plays in Big Picture / Gaming Mode. It pauses while Steam is open in the desktop UI and resumes when you return.

### Legacy toggle removed
- The "Enable Legacy Features" toggle and its `legacy_enabled` config key are removed. The music controls are always shown, and music plays whenever a music pack is selected.
- Existing configs with a `legacy_enabled` key keep working; the key is ignored.

### Random on launch
- **Random Sound Pack on Launch** picks a different sound pack each time Steam starts.
- **Random Music on Launch** starts a random song from all installed music packs.

### Multi-format audio
- The backend now indexes each pack folder (`index_audio_files` in `audio_utils.py`) and sends the list to the frontend as `pack.files`.
- Supported extensions: `.mp3 .ogg .oga .opus .wav .flac .m4a .aac .webm .weba`.
- New `logic/resolveSound.ts` (`soundStem`, `isIgnored`, `findMappedFiles`, `resolvePackFile`) matches sounds by stem, so a pack can use any supported extension.
- The UI sound patch in `index.tsx` now uses these helpers for the ignore list and mapping lookup.
- Intro detection (`has_intro`) is no longer tied to `intro_music.mp3`.

### Persistent settings
- New `config.ts` provides `saveConfig()`, which builds the complete config from global state. Every setting change goes through it, so no call site can drop a key.
- The backend `set_config` now merges into the existing `config.json` instead of overwriting it.
- New config keys: `selected_track`, `music_shuffle`, `music_repeat`, `random_sound_on_launch`, `random_music_on_launch`. Missing keys fall back to defaults.

### Docs
The README is rewritten with:
- A features overview.
- A guide to manually adding your own music (supported formats, `pack.json` examples, gotchas, and steps for regular Linux and Steam Deck Desktop Mode).
- Manual build and install instructions for regular Linux and for the Steam Deck (building on the Deck with nvm, or building on a PC and copying over SSH).
- A config reference table and a project layout table.

### Notes for reviewers
- **Start here:** `src/audioPlayers/musicPlayer.ts` is the core of the PR, and `src/index.tsx` is the UI wiring.
- **Behavior change:** because music is no longer gated, anyone who had a music pack selected with legacy features off will hear it after updating. The default selection is "None", so fresh installs are unaffected.
- **Formatting:** `index.tsx` was run through prettier with the repo's `.prettierrc`, so some of its diff is formatting rather than logic.
- **No new dependencies.** The new button icons come from `react-icons/fa`, which was already used.
- **Backwards compatible:** existing `config.json` files load unchanged and existing packs keep working.
- **Version not bumped:** I left the version in `package.json` and `plugin.json` alone. Please bump it at release time in whatever way you normally do.
- **LICENSE:** adds a 2026 copyright line for my contributions alongside the original. The MIT license and the original notice are unchanged.

### Testing
- [ ] Verify on a Deck or other Decky install: skip, previous, shuffle and repeat modes
- [ ] Verify game pause/resume, and that a manual pause survives closing a game
- [ ] Verify music pauses in the desktop UI and resumes in Big Picture / Gaming Mode
- [ ] Verify settings survive a Steam restart
- [ ] Verify packs with mixed formats and intros
- [ ] Verify the manual build and install steps on regular Linux and on a Steam Deck
