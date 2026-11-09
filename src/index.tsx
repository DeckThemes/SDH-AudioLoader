import {
  afterPatch,
  beforePatch,
  definePlugin,
  ServerAPI,
  staticClasses,
  Tabs,
} from "decky-frontend-lib";
import { VFC } from "react";
import { RiFolderMusicFill } from "react-icons/ri";
import * as api from "./api";
import { Permissions } from "./apiTypes";
import {
  changeMenuMusic,
  effectVolumeFor,
  endSleepTimerPause,
  ensureEffectGain,
  loadLoudnessCache,
  loadRecentMusic,
  maybeDuckForSound,
  menuMusicControl,
  note,
  nowPlayingSettings,
  loudnessSettings,
  pauseMusicSmooth,
  pickReplayMusic,
  pickTodaysMusic,
  playRandomMusic,
  refreshEffectVolume,
  resumeMusicSmooth,
  setEffectVolumeApplier,
  startMusicGuard,
  startMusicLimits,
  stopFx,
  stopMusicLowPassAudio,
  startMusicLowPassContextMonitor,
  configureMusicLowPass,
  timeOfDayPack,
  STARTUP_APPEAR_MS,
  waitForMovies,
} from "./audioPlayers";
import { AudioParent } from "./gamepadAudioFinder";
import {
  ExpandedViewPage,
  PackBrowserPage,
  SettingsPage,
  StarredPacksPage,
  SubmissionsPage,
  UninstallPage,
} from "./pack-manager";
import { Content } from "./menu/Content";
import * as python from "./python";
import { loadSettings } from "./settings";
import { GlobalState, GlobalStateContextProvider, useGlobalState } from "./state/GlobalState";

const PackManagerRouter: VFC = () => {
  const { apiMeData, currentTab, setGlobalState } = useGlobalState();

  return (
    <div
      style={{
        marginTop: "40px",
        height: "calc(100% - 40px)",
        background: "#0005",
      }}
    >
      <Tabs
        activeTab={currentTab}
        // @ts-ignore
        onShowTab={(tabID: string) => {
          setGlobalState("currentTab", tabID);
        }}
        tabs={[
          {
            title: "Browse",
            content: <PackBrowserPage />,
            id: "BrowsePacks",
          },
          ...(!!apiMeData
            ? [
                {
                  title: "Starred Themes",
                  content: <StarredPacksPage />,
                  id: "StarredPacks",
                },
                ...(apiMeData.permissions.includes(Permissions.viewSubs)
                  ? [
                      {
                        title: "Submissions",
                        content: <SubmissionsPage />,
                        id: "AudioSubmissions",
                      },
                    ]
                  : []),
              ]
            : []),
          {
            title: "Uninstall",
            content: <UninstallPage />,
            id: "UninstallPacks",
          },
          {
            title: "Settings",
            content: <SettingsPage />,
            id: "AudioLoaderSettings",
          },
        ]}
      />
    </div>
  );
};

export default definePlugin((serverApi: ServerAPI) => {
  console.log("DEFINE PLUGIN CALL");
  const state: GlobalState = new GlobalState();
  python.setServer(serverApi);
  python.setStateClass(state);
  api.setServer(serverApi);
  api.setStateClass(state);

  python.resolve(python.storeRead("shortToken"), (token: string) => {
    if (token) {
      state.setGlobalState("apiShortToken", token);
    }
  });

  // Big thanks to AA and Mintexists for help finding this
  const soundVolumePatchInstance = afterPatch(
    AudioParent.m_GamepadUIAudioStore.m_AudioPlaybackManager.__proto__,
    "GetActiveDestination",
    async function (_, ret) {
      try {
        const { soundVolume, soundPacks, activeSound } = state.getPublicState();
        const setGlobalState = state.setGlobalState.bind(state);
        const activePack = soundPacks.find((e) => e.name === activeSound);
        // @ts-ignore
        const gainNode = new GainNode(this.context, {
          gain: effectVolumeFor(soundVolume, activePack),
        });
        gainNode.connect(await ret);
        setGlobalState("gainNode", gainNode);
        return gainNode;
      } catch (e) {
        console.log("Audio Loader could not set gain node for sound effect volume", e);
      }
      return null;
    }
  );
  const setGlobalState = state.setGlobalState.bind(state);
  setGlobalState("volumePatchInstance", soundVolumePatchInstance);

  // The sound effect intercept/player
  // Needs to be stored in globalstate in order to unpatch
  const patchInstance = beforePatch(
    AudioParent.GamepadUIAudio.m_AudioPlaybackManager.__proto__,
    "PlayAudioURL",
    (args) => {
      // Since this isn't in a react component, this uses the getter function of the globalState instead of just the react variables
      // It does the same thing
      const { soundPacks, activeSound } = state.getPublicState();
      // "Lower Music for Notifications"
      try {
        maybeDuckForSound(String(args[0]).split("/").pop() || "");
      } catch {
        // never let this get in the way of the sound
      }
      let newSoundURL: string = "";
      switch (activeSound) {
        case "Default":
          newSoundURL = args[0];
          break;
        default:
          const soundName = args[0].slice(8);
          const currentPack = soundPacks.find((e) => e.name === activeSound);
          // Ignore check
          if (currentPack?.ignore.includes(soundName)) {
            newSoundURL = args[0];
            break;
          }
          // Mapping check
          if (Object.keys(currentPack?.mappings || {}).includes(soundName)) {
            const mappings = currentPack?.mappings?.[soundName as keyof typeof currentPack.mappings] as string[] | undefined;
            if (Array.isArray(mappings) && mappings.every(item => typeof item === 'string')) {
              const randIndex = Math.trunc(Math.random() * mappings.length);
              const mappedFileName = mappings[randIndex];
              newSoundURL = `/sounds_custom/${currentPack?.truncatedPackPath || "/error"
                }/${mappedFileName}`;
              break;
            }
          }
          // Default path-replacing behavior
          newSoundURL = args[0].replace(
            "sounds/",
            `sounds_custom/${currentPack?.truncatedPackPath || "/error"}/`
          );
          break;
      }
      args[0] = newSoundURL;
      return [newSoundURL];
    }
  );
  setGlobalState("soundPatchInstance", patchInstance);

  // "Normalize Volume": puts the current sound volume (with the active pack's gain) on the gain node
  setEffectVolumeApplier(() => {
    const { gainNode, soundVolume, soundPacks, activeSound } = state.getPublicState();
    const activePack = soundPacks.find((e) => e.name === activeSound);
    if (gainNode) {
      gainNode.gain.setValueAtTime(
        effectVolumeFor(soundVolume, activePack),
        gainNode.context.currentTime + 0.01
      );
    }
    ensureEffectGain(activePack);
  });

  python.getAndSetSoundPacks().then(() => {
    python.resolve(python.getConfig(), (data: any) => {
      // This sets the config data in globalState
      const configSelectedMusic = data?.selected_music || "None";
      const configSoundVolume = data?.sound_volume ?? 1;
      const configMusicVolume = data?.music_volume ?? 0.5;
      const configLegacyEnabled = data?.legacy_enabled ?? false;
      const configDailyRandom = data?.daily_random_music ?? false;
      const configDailyDate = data?.daily_music_date ?? "";
      const configDailyPick = data?.daily_music_pick ?? "";
      const configReplay = data?.random_music_every_replay ?? false;
      const configWaitMovie = data?.wait_for_startup_movie ?? false;
      const configNormalize = data?.normalize_volume ?? false;
      const configNowPlaying = data?.show_now_playing ?? false;
      // Older builds (1.2.6) had a master switch and one menu toggle: keep what the user had chosen
      const oldLowPass = data?.low_pass_enabled === true;
      const configLowPassSteamMenu = data?.low_pass_steam_menu ?? (oldLowPass && data?.low_pass_steam_menus === true);
      const configLowPassQuickAccess = data?.low_pass_quick_access ?? (oldLowPass && data?.low_pass_steam_menus === true);
      const configLowPassGameLoading = data?.low_pass_game_loading ?? (oldLowPass && data?.low_pass_game_launching === true);
      const configLowPassStrength = data?.low_pass_strength ?? 50;

      setGlobalState("activeSound", data?.selected_pack || "Default");
      setGlobalState("selectedMusic", configSelectedMusic);
      setGlobalState("soundVolume", configSoundVolume);
      setGlobalState("musicVolume", configMusicVolume);
      setGlobalState("legacyEnabled", configLegacyEnabled);
      setGlobalState("dailyRandomMusic", configDailyRandom);
      setGlobalState("dailyMusicDate", configDailyDate);
      setGlobalState("dailyMusicPick", configDailyPick);
      setGlobalState("replayRandomMusic", configReplay);
      setGlobalState("waitForMovie", configWaitMovie);
      setGlobalState("normalizeVolume", configNormalize);
      setGlobalState("showNowPlaying", configNowPlaying);
      setGlobalState("lowPassSteamMenu", configLowPassSteamMenu);
      setGlobalState("lowPassQuickAccess", configLowPassQuickAccess);
      setGlobalState("lowPassGameLoading", configLowPassGameLoading);
      setGlobalState("lowPassStrength", configLowPassStrength);
      configureMusicLowPass({
        steamMenu: configLowPassSteamMenu,
        quickAccess: configLowPassQuickAccess,
        gameLoading: configLowPassGameLoading,
        strength: configLowPassStrength,
      });
      nowPlayingSettings.enabled = configNowPlaying;
      loadLoudnessCache(data?.loudness_cache);
      loadRecentMusic(data?.recent_music);
      loadSettings(data);
      const loadedHistoryCount = Array.isArray(data?.recent_music) ? data.recent_music.length : 0;
      loudnessSettings.enabled = configNormalize;
      // Starts measuring the active sound pack when "Normalize Volume" is on
      refreshEffectVolume();

      const { soundPacks } = state.getPublicState();

      // With "New Music Every Day" on, today's music replaces the saved selection
      let musicToPlay = configSelectedMusic;
      let newDay = false;
      // "Music by Time of Day" decides first, when it has a choice for this part of the day
      const timePick = configLegacyEnabled ? timeOfDayPack(soundPacks) : null;
      if (timePick) {
        musicToPlay = timePick;
        setGlobalState("selectedMusic", timePick);
        python.setConfig({ selected_music: timePick });
      } else if (configLegacyEnabled && configDailyRandom) {
        const choice = pickTodaysMusic(
          soundPacks,
          configDailyDate,
          configDailyPick,
          setGlobalState
        );
        if (choice) {
          musicToPlay = choice.pick;
          newDay = choice.isNew;
        }
      }

      // With "New Music Every Replay" on, starting up counts as a replay too (the first music of
      // a new day still comes from "New Music Every Day")
      if (configLegacyEnabled && configReplay && !timePick && !newDay && musicToPlay !== "None") {
        const pick = pickReplayMusic(soundPacks, musicToPlay);
        if (pick) {
          musicToPlay = pick;
          // Remember what plays now, so the next start picks something different from it
          python.setConfig({ selected_music: pick });
        }
      }

      // Written to the Decky log, so a repeat can be explained afterwards
      note(
        `Startup music: saved="${configSelectedMusic}", legacy=${configLegacyEnabled}, daily=${configDailyRandom}, ` +
          `newDay=${newDay}, everyReplay=${configReplay}, timeOfDay=${timePick ?? "-"}, packs=${soundPacks.length}, ` +
          `history=${loadedHistoryCount}, chosen="${musicToPlay}"`
      );

      // Plays menu music initially only if legacy settings are enabled
      if (configLegacyEnabled) {
        const startMusic = () =>
          changeMenuMusic(
            musicToPlay,
            null,
            setGlobalState,
            [],
            soundPacks,
            configMusicVolume
          );
        if (configWaitMovie && musicToPlay !== "None") {
          // "Wait for Startup Movie": start when the movie is over, unless something else
          // (like the user picking music) has started the music in the meantime
          menuMusicControl.waitingForMovie = true;
          waitForMovies(STARTUP_APPEAR_MS)
            .catch(() => {})
            .then(() => {
              menuMusicControl.waitingForMovie = false;
              const now = state.getPublicState();
              if (now.legacyEnabled && now.menuMusic === null) startMusic();
            });
        } else {
          startMusic();
        }
      }
    });
  });

  const AppStateRegistrar =
    // SteamClient is something exposed by the SP tab of SteamUI, it's not a decky-frontend-lib thingy, but you can still call it normally
    // Refer to the SteamClient.d.ts or just console.log(SteamClient) to see all of it's methods
    SteamClient.GameSessions.RegisterForAppLifetimeNotifications((update: AppState) => {
      const { menuMusic, selectedMusic, gamesRunning } = state.getPublicState();
      const setGlobalState = state.setGlobalState.bind(state);
      menuMusicControl.lastGameEventAt = Date.now();
      if (selectedMusic !== "None") {
        if (update.bRunning) {
          // Because gamesRunning is in globalState, array methods like push and splice don't work
          setGlobalState("gamesRunning", [...gamesRunning, update.unAppID]);
          if (menuMusic != null) {
            // Fades out when "Smooth Fades" is on
            pauseMusicSmooth(menuMusic);
          }
        } else {
          const filteredGames = gamesRunning.filter((e) => e !== update.unAppID);
          // This happens when an app is closed
          setGlobalState("gamesRunning", filteredGames);

          // I'm re-using the filter here because I don't believe the getPublicState() method will update the values if they are changed
          if (filteredGames.length === 0) {
            // A Sleep Timer pause ends when a game closes
            if (menuMusicControl.pausedByLimit === "sleepTimer") endSleepTimerPause(state);
            // With "New Music Every Replay" on, coming back from a game starts different music
            if (playRandomMusic(state)) {
              // new music started
            } else if (menuMusic !== null && menuMusicControl.pausedByLimit === null) {
              Promise.resolve(resumeMusicSmooth(menuMusic)).catch(() => {});
            }
          }
        }
      }
    });

  // Keeps the music playing, and brings it back after the Deck wakes from sleep
  // (see audioPlayers/musicGuard.ts)
  const stopMusicGuard = startMusicGuard(state);
  const stopLowPassContextMonitor = startMusicLowPassContextMonitor();
  // Battery Saver, Sleep Timer and "Soft Start for New Audio Device"
  const stopMusicLimits = startMusicLimits(state);

  serverApi.routerHook.addRoute("/audiopack-manager", () => (
    <GlobalStateContextProvider globalStateClass={state}>
      <PackManagerRouter />
    </GlobalStateContextProvider>
  ));

  serverApi.routerHook.addRoute("/pack-manager-expanded-view", () => (
    <GlobalStateContextProvider globalStateClass={state}>
      <ExpandedViewPage />
    </GlobalStateContextProvider>
  ));

  return {
    title: <div className={staticClasses.Title}>Audio Loader Encore</div>,
    content: (
      <GlobalStateContextProvider globalStateClass={state}>
        <Content serverAPI={serverApi} state={state} />
      </GlobalStateContextProvider>
    ),
    icon: <RiFolderMusicFill />,
    onDismount: () => {
      const { menuMusic, soundPatchInstance, volumePatchInstance } = state.getPublicState();
      const setGlobalState = state.setGlobalState.bind(state);
      if (menuMusic != null) {
        menuMusic.pause();
        menuMusic.currentTime = 0;
        setGlobalState("menuMusic", null);
      }
      soundPatchInstance.unpatch();
      volumePatchInstance.unpatch();
      setEffectVolumeApplier(null);
      AppStateRegistrar.unregister();
      stopMusicGuard();
      stopLowPassContextMonitor();
      stopMusicLowPassAudio();
      stopMusicLimits();
      stopFx();
    },
  };
});
