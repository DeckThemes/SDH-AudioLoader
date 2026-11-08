# Audio Loader Encore

> **Unofficial fork** of [DeckThemes/SDH-AudioLoader](https://github.com/DeckThemes/SDH-AudioLoader) by EMERALD0874 and Beebles. All the original work belongs to them. This fork is **not** supported by the DeckThemes team. Please do not ask them about problems with it; open an issue here instead.

Encore adds new options to the "legacy" menu music of Audio Loader (turn on **Enable Legacy Features** in the plugin menu to see them):

- **New Music Every Day**: picks a different music pack each day. Choosing "None" keeps the music off until the next day.
- **New Music Every Replay**: every time the music starts again (when it ends, after a game closes, or after the Deck wakes up), it switches to a different music pack.
- **Music after sleep**: the menu music did not come back after the Deck woke from sleep. Encore notices the wake-up and starts the music again. It also restarts the music if it should be playing but has gone silent, and it leaves it alone while a game is running or when another plugin paused it on purpose.

The two toggles can be used together. With "New Music Every Day" and "New Music Every Replay" both on, the first music of a new day is the daily pick, and later replays rotate to other packs.

## Honest status
Tested on one Steam Deck, mainly the daily toggle and the sleep/wake fix. The two replay toggles were checked with simulated players only. They may have bugs. If something does not work, please open an issue and say which toggles you had on.

## Installation
Encore is not in the Decky plugin store.

1. Install [Decky Loader](https://github.com/SteamDeckHomebrew/decky-loader).
2. **Remove the original Audio Loader first** (the two would fight over the same sounds). Your settings and sound packs stay where they are.
3. Download the latest zip from the [Releases page](../../releases) (or, from the **Actions** tab, the artifact of the newest successful run), and unzip it. You get a folder called `Audio Loader Encore`.
4. Switch to Desktop Mode and copy that folder into `/home/deck/homebrew/plugins/` (this folder needs admin rights), then restart the Deck.

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
