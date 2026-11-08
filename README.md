# Audio Loader Encore

> **Unofficial fork** of [DeckThemes/SDH-AudioLoader](https://github.com/DeckThemes/SDH-AudioLoader) by EMERALD0874 and Beebles. All the original work belongs to them. This fork is **not** supported by the DeckThemes team. Please do not ask them about problems with it; open an issue here instead.

Encore adds new options to the "legacy" menu music of Audio Loader (turn on **Enable Legacy Features** in the plugin menu to see them):

- **New Music Every Day**: picks a different music pack each day. Choosing "None" keeps the music off until the next day.
- **New Music Every Replay**: every time the music starts again (when it ends, after a game closes, or after the Deck wakes up), it switches to a different music pack.
- **Wait for Startup Movie**: the music waits until the Deck's startup movie (or wake-up movie) has finished before it begins. It looks for a video playing with sound; if it finds none within a couple of seconds, the music starts normally.
- **Normalize Volume**: makes every sound pack and music pack about equally loud, so the two volume sliders mean the same thing for all packs. Each pack is measured the first time it is used (a few seconds; the result is saved). Quiet packs are boosted and loud ones turned down, by at most about 12 dB. Steam's own default sounds are not changed.
- **Music after sleep**: the menu music did not come back after the Deck woke from sleep. Encore notices the wake-up and starts the music again. It also restarts the music if it should be playing but has gone silent, and it leaves it alone while a game is running or when another plugin paused it on purpose.

The toggles can be used together. With "New Music Every Day" and "New Music Every Replay" both on, the first music of a new day is the daily pick, and later replays rotate to other packs.

## Honest status
Tested on one Steam Deck, mainly the daily toggle and the sleep/wake fix. The two replay toggles were checked with simulated players only. They may have bugs. If something does not work, please open an issue and say which toggles you had on.

## Installation (from Decky Loader, no computer needed)
Encore is not in the Decky plugin store, but Decky can install it straight from a link:

1. Install [Decky Loader](https://github.com/SteamDeckHomebrew/decky-loader).
2. **Uninstall the original Audio Loader first** (in Decky's plugin list), because the two would fight over the same sounds. Your sound packs and settings stay where they are.
3. Open the Decky menu, go to **Settings** (the gear), then **General**, and turn on **Developer Mode**.
4. Open the new **Developer** page and choose **Install Plugin from URL**.
5. Paste this link and install: `https://github.com/jwvdqx/SDH-AudioLoader-Encore/releases/latest/download/Audio-Loader-Encore.zip`
6. Decky may ask you to confirm. Accept. If the plugin does not show up, restart Decky Loader or the Deck.

You can also download the zip from the [Releases page](../../releases) and copy the `Audio Loader Encore` folder into `/home/deck/homebrew/plugins/` yourself.

## Building it yourself
`pnpm install` and then `pnpm build` create `dist/index.js`. The GitHub Action in `.github/workflows/build.yml` does this automatically and collects the files the Deck needs.

## Credits and license
Based on Audio Loader by EMERALD0874 and Beebles, MIT license (see `LICENSE`, the original copyright notice is kept). Encore changes by jwvdqx, made with the help of Claude (Anthropic).

---

# Original README (Audio Loader)
A plugin for the [Decky Loader](https://github.com/SteamDeckHomebrew/decky-loader) that allows users to replace Steam UI sounds and (eventually) add music when outside of a game.

# Overview
This plugin searches all folders in `/home/deck/homebrew/themes` for a `pack.json` file describing the music or sound pack. Users can install packs from the curated Pack Manager while connected to the internet or by manually adding folders (not recommended).

[Information on how to create, test, and upload a pack can be found here.](https://docs.deckthemes.com/#/AudioLoader/README)

# Installation
1. Install the [Decky Loader](https://github.com/SteamDeckHomebrew/decky-loader).
1. Use the bundled Plugin Store to download the Audio Loader.
