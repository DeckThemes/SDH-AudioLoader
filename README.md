# Audio Loader Encore

> **Unofficial fork** of [DeckThemes/SDH-AudioLoader](https://github.com/DeckThemes/SDH-AudioLoader) by EMERALD0874 and Beebles. All the original work belongs to them. This fork is **not** supported by the DeckThemes team. Please do not ask them about problems with it; open an issue here instead.

Encore adds new options to the "legacy" menu music of Audio Loader (turn on **Enable Legacy Features** in the plugin menu to see them). The menu has tabs: **Music**, **Sounds**, **Effects**, **Library** and **Info**, and the settings inside are grouped (the groups open and close, and **Hide Descriptions** in the Info tab makes the menu shorter).

**Music tab**
- **Now Playing card** at the top: the current pack and its credits, with **Pause/Play** and **Skip** buttons.
- **New Music Every Day**: picks a different music pack each day. Choosing "None" keeps the music off until the next day.
- **New Music Every Replay**: every time the music starts again (when it ends, after a game closes, or after the Deck wakes up), it switches to a different music pack.
- **Variety** slider: 0 is completely random. Higher avoids packs played recently and packs from the same series (like several games of one franchise). At 100 it avoids the last 12 packs and the last 3 series.
- **Music by Time of Day**: choose a music pack for the morning (5:00-11:59), afternoon (12:00-17:59) and night (18:00-4:59). It is used when the Deck starts or wakes up, and for replays. A part of the day left on "Not set" follows the normal rules.
- **Show Now Playing**: a small message with the music pack's name and its credits whenever new music starts. A long pack name scrolls so it can be read completely.
- **Wait for Startup Movie**: the music waits until the startup or wake-up movie has finished.
- **Smooth Fades**: the music fades in when it starts, fades out when a game starts or you pause it, and blends into the next music.
- **Lower Music for Notifications**: briefly lowers the music when Steam plays a notification, message or achievement sound.
- **Soft Start for New Audio Device**: lowers the music for a moment when headphones or a Bluetooth speaker connect.
- **Battery Saver**: pauses the music when the battery is below a level you choose and the charger is not connected.
- **Sleep Timer**: stops the music after the time you set. It comes back when the Deck wakes up, a game closes, or you press Resume.

**Sounds tab**
- **Normalize Volume**: makes every sound pack and music pack about equally loud, so the two volume sliders mean the same thing for all packs. Each pack is measured the first time it is used (a few seconds; the result is saved). Quiet packs are boosted and loud ones turned down, by at most about 18 dB. Steam's own default sounds are not changed. A boost cannot go past the maximum volume, so keep the music slider below 100% if you want quiet packs raised.

**Effects tab**
- **Muffled Music (Low-Pass Filter)**: three separate toggles: **Steam Menu** (Steam button), **Quick Access Menu (...)**, and **Game Loading** (from pressing play until the game has started). While one is active, the menu music is smoothly muffled. A **Filter Strength** slider (0-100%) sets how muffled it is, and you hear the filter for a moment when you move it. Only Encore's menu music is filtered, not Steam's sound effects or the game.

**Library tab**
- **Favorites and blocked packs**: favorites come up 3 times as often, blocked packs are never picked automatically (you can still choose them by hand).
- **Play stats**: the most and least played packs.

**Info tab**
- **Updates**: shows the installed version and whether a newer release exists on GitHub (checked when the menu opens, at most every 6 hours, and you can turn it off). Nothing is installed automatically.
- **Recent Music Decisions**, **Copy Debug Info** and **Show Debug Info**: what the plugin decided lately (which music and why) and your settings, to paste when reporting a problem.

**Music after sleep**: the menu music did not come back after the Deck woke from sleep. Encore notices the wake-up and starts the music again. It also restarts the music if it should be playing but has gone silent, and it leaves it alone while a game is running or when another plugin paused it on purpose.

The toggles can be used together. With "New Music Every Day" and "New Music Every Replay" both on, the first music of a new day is the daily pick, and later replays rotate to other packs. Priority at startup and after waking: Time of Day, then Daily, then Replay.

The two menu toggles of the low-pass filter read which side menu Steam has open. The game loading toggle uses Steam's game launch events and ends when the game process starts.

## Honest status
Tested on one Steam Deck, mainly the daily toggle and the sleep/wake fix. Everything else was checked with simulated players only, and the menu layout was never seen inside Steam before release. Parts that depend on Steam's own events (menu detection for the low-pass filter, game loading, battery, new audio devices, notification sounds) may behave differently on a real Deck. If something does not work, please open an issue, say which toggles you had on, and paste the **Copy Debug Info** text.

## Test checklist (for anyone trying Encore)
1. Install, turn on **Enable Legacy Features**, pick a music pack. Music plays.
2. Open the **Info** tab: the version is shown. Press **Show Debug Info**.
3. **Skip** (Now Playing card) switches to another pack.
4. Turn on **New Music Every Replay**, start and close a game: different music plays afterwards.
5. Put the Deck to sleep and wake it: the music comes back.
6. **Effects** tab: turn on **Steam Menu**, press the Steam button: the music is muffled. Same for **Quick Access Menu (...)** and **Game Loading**.
7. Turn on **Smooth Fades**: music fades in when it starts.
8. **Sleep Timer**: start a short timer (5 min): the music stops, and comes back after a wake-up or **Resume Music**.
9. Switch to Desktop Mode and back: the music should not be the same pack as before.

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
