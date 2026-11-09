import {
  afterPatch,
  beforePatch,
  ButtonItem,
  definePlugin,
  DropdownItem,
  PanelSection,
  PanelSectionRow,
  Router,
  ServerAPI,
  SliderField,
  staticClasses,
  Tabs,
  ToggleField,
} from "decky-frontend-lib";
import { useEffect, useMemo, VFC } from "react";
import { FaMusic, FaVolumeUp } from "react-icons/fa";
import { RiFolderMusicFill } from "react-icons/ri";
import * as api from "./api";
import { Permissions } from "./apiTypes";
import {
  applyMusicVolume,
  changeMenuMusic,
  effectVolumeFor,
  ensureEffectGain,
  getTodayKey,
  loadLoudnessCache,
  loadRecentMusic,
  varietySettings,
  nowPlayingSettings,
  loudnessSettings,
  normalizeRunningMusic,
  refreshEffectVolume,
  setEffectVolumeApplier,
  pickReplayMusic,
  menuMusicControl,
  pickTodaysMusic,
  playRandomMusic,
  waitForMovies,
  startMusicGuard,
  configureMusicLowPass,
  previewMusicLowPass,
  startMusicLowPassContextMonitor,
  stopMusicLowPassAudio,
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
import * as python from "./python";
import { GlobalState, GlobalStateContextProvider, useGlobalState } from "./state/GlobalState";

const Content: VFC<{ serverAPI: ServerAPI }> = ({}) => {
  const {
    activeSound,
    gamesRunning,
    soundPacks,
    menuMusic,
    legacyEnabled,
    selectedMusic,
    dailyRandomMusic,
    dailyMusicDate,
    dailyMusicPick,
    replayRandomMusic,
    pureRandomMusic,
    waitForMovie,
    normalizeVolume,
    showNowPlaying,
    lowPassSteamMenu,
    lowPassQuickAccess,
    lowPassGameLoading,
    lowPassStrength,
    soundVolume,
    musicVolume,
    dummyFuncResult,
    setGlobalState,
  } = useGlobalState();

  useEffect(() => {
    python.dummyFuncTest();
  }, []);

  function restartMusicPlayer(newMusic: string) {
    changeMenuMusic(
      newMusic,
      menuMusic,
      (key, val) => setGlobalState(key, val),
      gamesRunning,
      soundPacks,
      musicVolume
    );
  }

  function refetchLocalPacks() {
    python.reloadBackend();
  }

  const SoundPackDropdownOptions = useMemo(() => {
    return [
      { label: "Default", data: -1 },
      ...soundPacks
        // Only shows sound packs
        .filter((e) => !e.music)
        .map((p, index) => ({ label: p.name, data: index }))
        // TODO: because this sorts after assigning indexes, the sort might make the indexes out of order, make sure this doesn't happen
        .sort((a, b) => a.label.localeCompare(b.label)),
    ];
  }, [soundPacks]);

  const MusicPackDropdownOptions = useMemo(() => {
    return [
      { label: "None", data: -1 },
      ...soundPacks
        // Only show music packs
        .filter((e) => e.music)
        .map((p, index) => ({ label: p.name, data: index }))
        // TODO: because this sorts after assigning indexes, the sort might make the indexes out of order, make sure this doesn't happen
        .sort((a, b) => a.label.localeCompare(b.label)),
    ];
  }, [soundPacks]);

  if (!dummyFuncResult) {
    return (
      <PanelSectionRow>
        <span>
          AudioLoader failed to initialize, try reloading, and if that doesn't work, try restarting
          your deck.
        </span>
      </PanelSectionRow>
    );
  }

  return (
    <div className="audioloader_QAM">
      <style>
        {`
        .audioloader_QAM div[class^="gamepaddialog_FieldLabel_"] {
          display: none;
        }
        `}
      </style>
      <PanelSection title="Packs">
        <PanelSectionRow>
          <DropdownItem
            bottomSeparator="none"
            onMenuWillOpen={() => refetchLocalPacks()}
            menuLabel="Sound Pack"
            rgOptions={SoundPackDropdownOptions}
            selectedOption={
              // activeSound now stores a string, this just finds the corresponding option for the label
              // the "?? -2" is there incase find returns undefined (the currently selected theme was deleted or something)
              // it NEEDS to be a nullish coalescing operator because 0 needs to be treated as true
              SoundPackDropdownOptions.find((e) => e.label === activeSound)?.data ?? -1
            }
            onChange={async (option) => {
              setGlobalState("activeSound", option.label as string);
              refreshEffectVolume();

              const configObj = {
                selected_pack: option.label,
                selected_music: selectedMusic,
                sound_volume: soundVolume,
                music_volume: musicVolume,
                legacy_enabled: legacyEnabled,
              };
              python.setConfig(configObj);
            }}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <SliderField
            bottomSeparator="standard"
            label={undefined}
            value={soundVolume}
            min={0}
            max={1}
            step={0.01}
            onChange={(value) => {
              setGlobalState("soundVolume", value);
              // Sets the gain node (with the pack's "Normalize Volume" gain, when that is on)
              refreshEffectVolume();
              const configObj = {
                selected_pack: activeSound,
                selected_music: selectedMusic,
                sound_volume: value,
                music_volume: musicVolume,
                legacy_enabled: legacyEnabled,
              };
              python.setConfig(configObj);
            }}
            icon={<FaVolumeUp />}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <ToggleField
            label="Normalize Volume"
            description="Makes every sound pack and music pack about equally loud, so the volume sliders mean the same for all of them. A pack is measured the first time you use it, which takes a few seconds."
            checked={normalizeVolume}
            onChange={(value: boolean) => {
              loudnessSettings.enabled = value;
              setGlobalState("normalizeVolume", value);
              python.setConfig({ normalize_volume: value });
              // Fix the music that is playing right now, and the sound effects
              if (menuMusic) {
                applyMusicVolume(menuMusic, musicVolume);
                if (value) normalizeRunningMusic(menuMusic);
              }
              refreshEffectVolume();
            }}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <ToggleField
            label="Enable Legacy Features"
            description="Legacy features are unsupported by Audio Loader maintainers. They may break at any time. Issues should be reported on our GitHub. Please do not reach out to us on Discord regarding legacy feature issues."
            checked={legacyEnabled}
            onChange={(value: boolean) => {
              setGlobalState("legacyEnabled", value);
              // With "New Music Every Day" on, turning legacy back on also checks the date
              let musicToPlay = selectedMusic;
              if (value && dailyRandomMusic) {
                const choice = pickTodaysMusic(
                  soundPacks,
                  dailyMusicDate,
                  dailyMusicPick,
                  setGlobalState
                );
                if (choice) musicToPlay = choice.pick;
              }
              const configObj = {
                selected_pack: activeSound,
                selected_music: musicToPlay,
                sound_volume: soundVolume,
                music_volume: musicVolume,
                legacy_enabled: value,
              };
              python.setConfig(configObj);
              restartMusicPlayer(value ? musicToPlay : "None");
            }}
          />
        </PanelSectionRow>
        {legacyEnabled && (
          <>
            <PanelSectionRow>
              <DropdownItem
                bottomSeparator="none"
                onMenuWillOpen={() => refetchLocalPacks()}
                menuLabel="Music Pack"
                rgOptions={MusicPackDropdownOptions}
                selectedOption={
                  MusicPackDropdownOptions.find((e) => e.label === selectedMusic)?.data ?? -1
                }
                onChange={async (option) => {
                  const configObj = {
                    selected_pack: activeSound,
                    selected_music: option.label,
                    sound_volume: soundVolume,
                    music_volume: musicVolume,
                    legacy_enabled: legacyEnabled,
                  };
                  python.setConfig(configObj);
                  // If the music is picked by hand, that becomes today's music
                  if (dailyRandomMusic) {
                    const today = getTodayKey();
                    setGlobalState("dailyMusicDate", today);
                    setGlobalState("dailyMusicPick", option.label);
                    python.setConfig({ daily_music_date: today, daily_music_pick: option.label });
                  }
                  restartMusicPlayer(legacyEnabled ? (option.label as string) : "None");
                }}
              />
            </PanelSectionRow>
            <PanelSectionRow>
              <ToggleField
                label="New Music Every Day"
                description={`Picks a different music pack each day: today one, tomorrow another. Choosing None keeps the music off until the next day.`}
                checked={dailyRandomMusic}
                onChange={(value: boolean) => {
                  setGlobalState("dailyRandomMusic", value);
                  python.setConfig({ daily_random_music: value });
                  if (value) {
                    // Start fresh: choose a pack that is different from the one playing now
                    const choice = pickTodaysMusic(soundPacks, "", selectedMusic, setGlobalState);
                    if (choice && choice.pick !== selectedMusic) restartMusicPlayer(choice.pick);
                  }
                }}
              />
            </PanelSectionRow>
            <PanelSectionRow>
              <ToggleField
                label="New Music Every Replay"
                description="Every time the music starts again (when it ends, after a game closes, or after the Deck wakes up), it switches to a different music pack. Works together with New Music Every Day."
                checked={replayRandomMusic}
                onChange={(value: boolean) => {
                  setGlobalState("replayRandomMusic", value);
                  python.setConfig({ random_music_every_replay: value });
                }}
              />
            </PanelSectionRow>
            <PanelSectionRow>
              <ToggleField
                label="Pure Random Music"
                description="Turns off the variety rules. Music is picked completely at random, so a pack or series can come back soon. Only the music that is playing right now is skipped."
                checked={pureRandomMusic}
                onChange={(value: boolean) => {
                  setGlobalState("pureRandomMusic", value);
                  varietySettings.pureRandom = value;
                  python.setConfig({ pure_random_music: value });
                }}
              />
            </PanelSectionRow>
            <PanelSectionRow>
              <ToggleField
                label="Show Now Playing"
                description="Shows a small message with the music pack's name and its credits whenever new music starts."
                checked={showNowPlaying}
                onChange={(value: boolean) => {
                  nowPlayingSettings.enabled = value;
                  setGlobalState("showNowPlaying", value);
                  python.setConfig({ show_now_playing: value });
                }}
              />
            </PanelSectionRow>
            <PanelSectionRow>
              <ToggleField
                label="Wait for Startup Movie"
                description="When the Deck starts or wakes up, the music waits until the startup or wake-up movie has finished before it begins."
                checked={waitForMovie}
                onChange={(value: boolean) => {
                  setGlobalState("waitForMovie", value);
                  python.setConfig({ wait_for_startup_movie: value });
                }}
              />
            </PanelSectionRow>
            <PanelSectionRow>
              <SliderField
                bottomSeparator="standard"
                label={undefined}
                value={musicVolume}
                min={0}
                max={1}
                step={0.01}
                onChange={(value) => {
                  setGlobalState("musicVolume", value);
                  applyMusicVolume(menuMusic, value);
                  // @ts-ignore
                  window.AUDIOLOADER_MENUMUSIC.volume = value;
                  const configObj = {
                    selected_pack: activeSound,
                    selected_music: selectedMusic,
                    sound_volume: soundVolume,
                    music_volume: value,
                    legacy_enabled: legacyEnabled,
                  };
                  python.setConfig(configObj);
                }}
                icon={<FaMusic style={{ transform: "scale(0.8, 1) translate(-2px, -2px)" }} />}
              />
            </PanelSectionRow>
          </>
        )}
      </PanelSection>
      {legacyEnabled && (
        <PanelSection title="Music Low-Pass Filter">
          <PanelSectionRow>
            <ToggleField
              label="Steam Menu"
              description="Muffles the music while the Steam menu (Steam button) is open."
              checked={lowPassSteamMenu}
              onChange={(value: boolean) => {
                setGlobalState("lowPassSteamMenu", value);
                configureMusicLowPass({
                  steamMenu: value,
                  quickAccess: lowPassQuickAccess,
                  gameLoading: lowPassGameLoading,
                  strength: lowPassStrength,
                });
                python.setConfig({ low_pass_steam_menu: value });
              }}
            />
          </PanelSectionRow>
          <PanelSectionRow>
            <ToggleField
              label="Quick Access Menu (...)"
              description="Muffles the music while the Quick Access (...) menu is open."
              checked={lowPassQuickAccess}
              onChange={(value: boolean) => {
                setGlobalState("lowPassQuickAccess", value);
                configureMusicLowPass({
                  steamMenu: lowPassSteamMenu,
                  quickAccess: value,
                  gameLoading: lowPassGameLoading,
                  strength: lowPassStrength,
                });
                python.setConfig({ low_pass_quick_access: value });
              }}
            />
          </PanelSectionRow>
          <PanelSectionRow>
            <ToggleField
              label="Game Loading"
              description="Muffles the music from the moment you press play on a game until the game has started."
              checked={lowPassGameLoading}
              onChange={(value: boolean) => {
                setGlobalState("lowPassGameLoading", value);
                configureMusicLowPass({
                  steamMenu: lowPassSteamMenu,
                  quickAccess: lowPassQuickAccess,
                  gameLoading: value,
                  strength: lowPassStrength,
                });
                python.setConfig({ low_pass_game_loading: value });
              }}
            />
          </PanelSectionRow>
          <PanelSectionRow>
            <SliderField
              bottomSeparator="standard"
              label={`Filter Strength (${lowPassStrength}%)`}
              description="Higher is more muffled. You hear the filter for a moment when you move this."
              value={lowPassStrength}
              min={0}
              max={100}
              step={1}
              onChange={(value) => {
                setGlobalState("lowPassStrength", value);
                configureMusicLowPass({
                  steamMenu: lowPassSteamMenu,
                  quickAccess: lowPassQuickAccess,
                  gameLoading: lowPassGameLoading,
                  strength: value,
                });
                previewMusicLowPass();
                python.setConfig({ low_pass_strength: value });
              }}
              icon={<FaMusic />}
            />
          </PanelSectionRow>
        </PanelSection>
      )}
      <PanelSection title="Settings">
        <PanelSectionRow>
          <ButtonItem
            bottomSeparator="none"
            layout="below"
            onClick={() => {
              Router.CloseSideMenus();
              Router.Navigate("/audiopack-manager");
            }}
          >
            Manage Packs
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>
    </div>
  );
};

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
      const configPureRandom = data?.pure_random_music ?? false;
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
      setGlobalState("pureRandomMusic", configPureRandom);
      varietySettings.pureRandom = configPureRandom;
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
      const loadedHistoryCount = Array.isArray(data?.recent_music) ? data.recent_music.length : 0;
      loudnessSettings.enabled = configNormalize;
      // Starts measuring the active sound pack when "Normalize Volume" is on
      refreshEffectVolume();

      const { soundPacks } = state.getPublicState();

      // With "New Music Every Day" on, today's music replaces the saved selection
      let musicToPlay = configSelectedMusic;
      let newDay = false;
      if (configLegacyEnabled && configDailyRandom) {
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
      if (configLegacyEnabled && configReplay && !newDay && musicToPlay !== "None") {
        const pick = pickReplayMusic(soundPacks, musicToPlay);
        if (pick) {
          musicToPlay = pick;
          // Remember what plays now, so the next start picks something different from it
          python.setConfig({ selected_music: pick });
        }
      }

      // Written to the Decky log, so a repeat can be explained afterwards
      python.logEvent(
        `Startup music: saved="${configSelectedMusic}", legacy=${configLegacyEnabled}, daily=${configDailyRandom}, ` +
          `newDay=${newDay}, everyReplay=${configReplay}, packs=${soundPacks.length}, ` +
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
          waitForMovies()
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
            menuMusic.pause();
            // menuMusic.currentTime = 0;
            // setGlobalState("menuMusic", null);
          }
        } else {
          const filteredGames = gamesRunning.filter((e) => e !== update.unAppID);
          // This happens when an app is closed
          setGlobalState("gamesRunning", filteredGames);

          // I'm re-using the filter here because I don't believe the getPublicState() method will update the values if they are changed
          if (filteredGames.length === 0) {
            // With "New Music Every Replay" on, coming back from a game starts different music
            if (playRandomMusic(state)) {
              // new music started
            } else if (menuMusic !== null) {
              menuMusic.play();
            }
          }
        }
      }
    });

  // Keeps the music playing, and brings it back after the Deck wakes from sleep
  // (see audioPlayers/musicGuard.ts)
  const stopMusicGuard = startMusicGuard(state);
  const stopLowPassContextMonitor = startMusicLowPassContextMonitor();

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
        <Content serverAPI={serverApi} />
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
    },
  };
});
