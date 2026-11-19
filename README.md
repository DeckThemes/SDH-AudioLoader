# Audio Loader

A plugin for the [Decky Loader](https://github.com/SteamDeckHomebrew/decky-loader) that replaces Steam UI sounds and plays music in the menus.

# Overview

Audio Loader searches every folder in `~/homebrew/sounds` for a `pack.json` file describing a sound pack or music pack. Users can install packs from the curated Pack Manager while connected to the internet, or by manually adding folders (not recommended).

[Information on how to create, test, and upload a pack can be found here.](https://docs.deckthemes.com/#/AudioLoader/README)

# Features

## Sound packs
- Replace Steam UI sound effects with the sounds from any installed sound pack.
- Separate volume slider for UI sounds.
- **Random Sound Pack on Launch**: picks a different installed sound pack every time Steam starts.

## Music

- Pick a music pack from the **Music Pack** dropdown.
- If the pack maps several songs to `menu_music`, a **Song** dropdown lets you pick a specific one. See [Adding your own music](#adding-your-own-music) to use your own songs.
- Packs with an `intro_music` file play the intro before the first song.
- Music pauses while a game is running and resumes when it closes (unless you paused it yourself).
- Music only plays in Big Picture / Gaming Mode. It pauses while Steam is open in the desktop UI and resumes when you return.
- Separate volume slider for music.

### Music player
- **Previous / Play-Pause / Next** buttons with a now-playing line.
- **Skip** moves through every song of every installed music pack, ordered by pack name, and wraps around at the ends.
- **Previous** restarts the current song if it has been playing for more than 3 seconds, otherwise goes back to the last song (in shuffle mode, the last song actually played).
- **Shuffle** plays every song once per cycle in random order and never repeats the same song back to back.
- **Repeat** has three modes, cycled by the button:

  | Mode | Button | Behavior |
  |---|---|---|
  | Off | plain | Stops after the last song in the queue (or the end of a shuffle cycle) |
  | All | blue | Continues through the queue and starts over when it ends |
  | One | blue, with a large "1" | Loops the current song (the default, and how Audio Loader has always behaved) |

- **Random Music on Launch**: starts a random song from all installed music packs every time Steam starts.
- A missing intro or a broken song file is skipped instead of stopping playback.

### Remembered settings
Everything is saved to `config.json` and restored on the next boot: selected sound pack, selected music pack and song, both volumes, shuffle, repeat mode, and both random-on-launch toggles.

## Pack Manager
Browse, install, star and uninstall packs from the Pack Manager (**Manage Packs** in the Quick Access Menu). Log in with a DeckThemes account key to see starred packs and submissions.

# Installation

1. Install the [Decky Loader](https://github.com/SteamDeckHomebrew/decky-loader).
1. Use the bundled Plugin Store to download Audio Loader.

# Adding your own music

You can add your own songs without publishing anything: a music pack is just a folder with a `pack.json` and your audio files.

## Supported file types

Audio Loader recognizes these extensions (case-insensitive):

`.mp3` `.ogg` `.oga` `.opus` `.wav` `.flac` `.m4a` `.aac` `.webm` `.weba`

Steam plays the files with its built-in Chromium audio engine, so anything Chromium can decode should work. **`.mp3` and `.ogg` are the safest choices.** If a file in another format won't play, convert it (for example `ffmpeg -i song.flac song.mp3`).

## Step by step

These steps work the same on a regular Linux machine and on a Steam Deck. The only difference is how you open a terminal:

- **Regular Linux:** open any terminal.
- **Steam Deck:** switch to **Desktop Mode** and open **Konsole**. If you have never used `sudo` on your Deck, set a password first by running `passwd`.

Decky runs as root and owns `~/homebrew`, so the commands below use `sudo`.

1. **Make a folder** for your pack inside `~/homebrew/sounds`. The folder name is up to you:
   ```bash
   sudo mkdir -p ~/homebrew/sounds/MyMusic
   ```
2. **Copy your songs** directly into that folder. Subfolders are not scanned.
   ```bash
   sudo cp ~/Music/*.mp3 ~/homebrew/sounds/MyMusic/
   ```
   On a Steam Deck, music on an SD card is usually under `/run/media/`, for example `sudo cp /run/media/*/Music/*.mp3 ~/homebrew/sounds/MyMusic/`.
3. **Create `pack.json`** in the same folder (see the examples below). For a single song:
   ```bash
   sudo tee ~/homebrew/sounds/MyMusic/pack.json > /dev/null <<'EOF'
   {
     "name": "My Music",
     "author": "You",
     "version": "v1.0",
     "music": true
   }
   EOF
   ```
   (For this single-song form, the song must be named `menu_music` plus an extension, for example `menu_music.mp3`.)
4. **Reload the pack list.** Open the plugin's **Music Pack** dropdown (it rescans every time it opens), or restart Decky with `sudo systemctl restart plugin_loader`.
5. **Select your pack.** Pick your pack in the **Music Pack** dropdown. On a Steam Deck, go back to Gaming Mode first, since the plugin's Quick Access Menu panel is only there.

## `pack.json` for a single song

Name the file `menu_music` plus any supported extension (for example `menu_music.mp3`):

```json
{
  "name": "My Music",
  "author": "You",
  "version": "v1.0",
  "music": true
}
```

## `pack.json` for several songs

List every song in the `menu_music.mp3` mapping. The file names must match your files exactly, including the extension and capitalization:

```json
{
  "name": "My Music",
  "author": "You",
  "version": "v1.0",
  "music": true,
  "mappings": {
    "menu_music.mp3": ["first_song.mp3", "second_song.ogg", "third_song.flac"]
  }
}
```

Each listed file appears in the **Song** dropdown and in the player queue, so skip, shuffle, and repeat all work across them. Formats can be mixed freely.

## Intro (optional)

Add a file named `intro_music` plus a supported extension (for example `intro_music.mp3`) and it plays once before the pack's first song whenever the pack is started, or when skip moves into this pack from another one.

## Rules and gotchas

- **Only mapped songs are queued.** Extra audio files in the folder that aren't listed in the `menu_music.mp3` mapping are ignored. (With no mapping at all, only the single `menu_music` file is used. If you have several `menu_music.*` files, the `.mp3` is preferred.)
- **`name` is required and must be unique.** A pack whose `name` matches an already loaded pack is skipped, and a pack with no `pack.json`, or with invalid JSON, is not loaded. Check the log if a pack doesn't show up (`journalctl -u plugin_loader -f`).
- **`"music": true` is required**, otherwise the pack is treated as a sound-effects pack and won't appear under **Music Pack**.
- **File names are case-sensitive** on Linux: `Song.MP3` in the mapping will not find `song.mp3`.
- **Avoid `#`, `?` and `%` in file names.** They break the URL the player uses. Spaces and normal punctuation are fine.
- **Keep the folder under `~/homebrew/sounds`.** Steam reaches it through a symlink the plugin creates, so a pack stored anywhere else won't play.
- To remove a pack, use the **Uninstall** tab in the Pack Manager, or delete its folder.

# Manual build

Everything below applies to the plugin on its own: you build `dist/index.js` once, then copy a handful of files into Decky's plugin folder.

### Requirements
- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/) 18 or newer
- [pnpm](https://pnpm.io/) (`npm install -g pnpm`, or `corepack enable`)
- A working [Decky Loader](https://github.com/SteamDeckHomebrew/decky-loader) install to test on
- Optional: `zip`, to package the result

### Build
```bash
git clone https://github.com/EMERALD0874/SDH-AudioLoader.git
cd SDH-AudioLoader
pnpm install --frozen-lockfile
pnpm run build
```

This wipes `dist/` and regenerates `dist/index.js` from `src/`. A successful build ends with `created dist/index.js`. The warning about `output.name` is harmless.

Use `pnpm run watch` to rebuild automatically while you edit.

> Use pnpm with the lockfile rather than `npm install`. A plain `npm install` pulls a newer `@types/node` that the project's TypeScript version can't parse, which fills the output with `ffi.d.ts` errors (the bundle is still produced).

### What gets installed
The plugin only needs these files at runtime: `main.py`, `plugin.json`, `package.json`, `audio_utils.py`, `audio_remoteinstall.py` and the `dist/` folder. They go in a folder under `~/homebrew/plugins/`.

Your packs and settings live in `~/homebrew/sounds` (including `config.json`), outside the plugin folder, so reinstalling or updating the plugin does not touch them.

### Install on regular Linux
Run this from the repo, on the machine where Decky is installed:

```bash
DEST=~/homebrew/plugins/SDH-AudioLoader
sudo mkdir -p "$DEST"
sudo cp -r main.py plugin.json package.json audio_utils.py audio_remoteinstall.py dist "$DEST/"
sudo systemctl restart plugin_loader
```

If you already installed Audio Loader from the Plugin Store, its folder may be named `Audio Loader` instead. Set `DEST=~/homebrew/plugins/"Audio Loader"` to replace that install instead of creating a second copy.

If the plugin looks unchanged afterward, close and reopen Big Picture (or restart Steam) so the UI reloads the new bundle.

### Install on a Steam Deck
Switch to **Desktop Mode** and open **Konsole**. If you have never used `sudo` on your Deck, set a password first by running `passwd`. You can build in either of two ways.

**Option A: build on the Deck.** SteamOS has a read-only system partition, so install Node.js into your home folder with [nvm](https://github.com/nvm-sh/nvm) instead of using `pacman`:

```bash
# after installing nvm, in a new terminal:
nvm install 20
npm install -g pnpm
```

Then clone, build, and install with the same commands as on regular Linux (see above). When you are done, return to Gaming Mode. If the plugin doesn't pick up the new version, reboot the Deck.

**Option B: build on another computer, then copy to the Deck.** Build on your PC as shown above, then on the Deck enable SSH (this needs the password from `passwd`):

```bash
sudo systemctl enable --now sshd
```

From your PC, copy the files to the Deck's home folder, then install them with `sudo` over SSH:

```bash
ssh deck@steamdeck 'mkdir -p ~/audioloader-build'
scp -r main.py plugin.json package.json audio_utils.py audio_remoteinstall.py dist deck@steamdeck:~/audioloader-build/
ssh -t deck@steamdeck 'sudo mkdir -p ~/homebrew/plugins/SDH-AudioLoader && sudo cp -r ~/audioloader-build/* ~/homebrew/plugins/SDH-AudioLoader/ && sudo systemctl restart plugin_loader'
```

Replace `steamdeck` with your Deck's hostname or IP address. (`scp` can't write to `~/homebrew` directly because Decky owns it, which is why the files go through the home folder first.)

### Package as a zip
```bash
pnpm run build
mkdir -p /tmp/SDH-AudioLoader
cp -r main.py plugin.json package.json audio_utils.py audio_remoteinstall.py README.md LICENSE dist /tmp/SDH-AudioLoader/
(cd /tmp && zip -r ~/SDH-AudioLoader.zip SDH-AudioLoader)
rm -rf /tmp/SDH-AudioLoader
```

To install from the zip, unzip it into `~/homebrew/plugins/` (use `sudo`) and restart Decky.

### Debugging
Follow Decky's log while the plugin loads:

```bash
journalctl -u plugin_loader -f
```

# Configuration reference

Settings are stored in `~/homebrew/sounds/config.json`. They are normally changed from the UI, but can be edited by hand while Steam is closed. Missing keys fall back to their defaults.

| Key | Default | Description |
|---|---|---|
| `selected_pack` | `"Default"` | Active sound pack |
| `selected_music` | `"None"` | Active music pack |
| `selected_track` | `""` | Last played song file within the music pack |
| `sound_volume` | `1` | UI sound volume (0 to 1) |
| `music_volume` | `0.5` | Music volume (0 to 1) |
| `music_shuffle` | `false` | Shuffle on or off |
| `music_repeat` | `"one"` | `"off"`, `"all"` or `"one"` |
| `random_sound_on_launch` | `false` | Pick a random sound pack at launch |
| `random_music_on_launch` | `false` | Pick a random song at launch |

# Project layout

| Path | Purpose |
|---|---|
| `main.py` | Decky backend: finds packs, reads and writes `config.json` |
| `audio_utils.py`, `audio_remoteinstall.py` | Backend helpers and pack installation |
| `src/index.tsx` | Plugin entry point, Quick Access Menu UI, launch behavior |
| `src/audioPlayers/musicPlayer.ts` | Music player: queue, shuffle, repeat, intros |
| `src/config.ts` | Builds and saves the full config from current state |
| `src/state/GlobalState.tsx` | Shared state for the UI and player |
| `src/pack-manager/` | Pack Manager pages |
| `dist/index.js` | Built bundle that Decky loads |
