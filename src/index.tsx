import {
  afterPatch,
  beforePatch,
  ButtonItem,
  definePlugin,
  DialogButton,
  DropdownItem,
  Focusable,
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
import {
  FaMusic,
  FaPause,
  FaPlay,
  FaRandom,
  FaRedo,
  FaStepBackward,
  FaStepForward,
  FaVolumeUp,
} from "react-icons/fa";
import { RiFolderMusicFill } from "react-icons/ri";
import * as api from "./api";
import { Permissions } from "./apiTypes";
import {
  toggleRepeat,
  getPackTracks,
  initMusicPlayer,
  nextTrack,
  pauseForGame,
  previousTrack,
  resumeAfterGame,
  setGamepadUI,
  setMusicVolume,
  setShuffle,
  startCurrent,
  startPack,
  startRandomMusic,
  stopMusic,
  togglePlayPause,
} from "./audioPlayers";
import { saveConfig, setConfigState } from "./config";
import { AudioParent } from "./gamepadAudioFinder";
import { isIgnored, resolvePackFile } from "./logic/resolveSound";
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
    soundPacks,
    selectedMusic,
    selectedTrack,
    currentTrack,
    musicPlaying,
    musicShuffle,
    musicRepeat,
    randomSoundOnLaunch,
    randomMusicOnLaunch,
    soundVolume,
    musicVolume,
    gainNode,
    dummyFuncResult,
    setGlobalState,
  } = useGlobalState();

  useEffect(() => {
    python.dummyFuncTest();
  }, []);

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

  // The songs inside the selected music pack (only packs that map several menu_music files have more than one)
  const selectedPackTracks = useMemo(() => {
    const pack = soundPacks.find((p) => p.music && p.name === selectedMusic);
    return pack ? getPackTracks(pack) : [];
  }, [soundPacks, selectedMusic]);

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

  const playerDisabled = selectedMusic === "None";
  const ACCENT = "#1a9fff"; // shuffle on / repeat on
  const playerButtonStyle = (color?: string) => ({
    minWidth: 0,
    flex: 1,
    padding: "10px 0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color,
  });

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
        saveConfig();
      }}
      />
      </PanelSectionRow>
      <PanelSectionRow>
      <ToggleField
      label="Random Sound Pack on Launch"
      description="Picks a different sound pack each time Steam starts."
      checked={randomSoundOnLaunch}
      onChange={(value: boolean) => {
        setGlobalState("randomSoundOnLaunch", value);
        saveConfig();
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
        gainNode.gain.setValueAtTime(value, gainNode.context.currentTime + 0.01);
        // gainNode.gain.value = value;
        setGlobalState("soundVolume", value);
        saveConfig();
      }}
      icon={<FaVolumeUp />}
      />
      </PanelSectionRow>
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
        startPack(option.label as string);
      }}
      />
      </PanelSectionRow>
      {selectedPackTracks.length > 1 && (
        <PanelSectionRow>
        <DropdownItem
        bottomSeparator="none"
        menuLabel="Song"
        rgOptions={selectedPackTracks.map((t, i) => ({ label: t.label, data: i }))}
        selectedOption={Math.max(
          0,
          selectedPackTracks.findIndex((t) => t.file === selectedTrack)
        )}
        onChange={async (option) => {
          startPack(selectedMusic, selectedPackTracks[option.data as number]?.file);
        }}
        />
        </PanelSectionRow>
      )}
      <PanelSectionRow>
      <div
      style={{
        fontSize: "0.85em",
        opacity: 0.8,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
      >
      {currentTrack
        ? `${currentTrack.label}${
          currentTrack.label !== currentTrack.pack ? ` — ${currentTrack.pack}` : ""
        }`
        : playerDisabled
        ? "No music pack selected"
        : "Stopped"}
        </div>
        </PanelSectionRow>
        <PanelSectionRow>
        <Focusable style={{ display: "flex", gap: "6px" }} flow-children="horizontal">
        <DialogButton
        disabled={playerDisabled}
        style={playerButtonStyle()}
        onClick={() => previousTrack()}
        >
        <FaStepBackward />
        </DialogButton>
        <DialogButton
        disabled={playerDisabled}
        style={playerButtonStyle()}
        onClick={() => togglePlayPause()}
        >
        {musicPlaying ? <FaPause /> : <FaPlay />}
        </DialogButton>
        <DialogButton
        disabled={playerDisabled}
        style={playerButtonStyle()}
        onClick={() => nextTrack()}
        >
        <FaStepForward />
        </DialogButton>
        <DialogButton
        style={playerButtonStyle(musicShuffle ? ACCENT : undefined)}
        onClick={() => setShuffle(!musicShuffle)}
        >
        <FaRandom />
        </DialogButton>
        <DialogButton
        style={playerButtonStyle(musicRepeat === "one" ? ACCENT : undefined)}
        onClick={() => toggleRepeat()}
        >
        <FaRedo />
        </DialogButton>
        </Focusable>
        </PanelSectionRow>
        <PanelSectionRow>
        <ToggleField
        label="Random Music on Launch"
        description="Starts a random song from your installed music packs each time Steam starts."
        checked={randomMusicOnLaunch}
        onChange={(value: boolean) => {
          setGlobalState("randomMusicOnLaunch", value);
          saveConfig();
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
        onChange={(value) => setMusicVolume(value)}
        icon={<FaMusic style={{ transform: "scale(0.8, 1) translate(-2px, -2px)" }} />}
        />
        </PanelSectionRow>
        </PanelSection>
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
  setConfigState(state);
  initMusicPlayer(state);
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
        const { soundVolume } = state.getPublicState();
        const setGlobalState = state.setGlobalState.bind(state);
        // @ts-ignore
        const gainNode = new GainNode(this.context, { gain: soundVolume });
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
          if (currentPack && isIgnored(currentPack, soundName)) {
            newSoundURL = args[0];
            break;
          }
          // Mapping check
          const packFile = currentPack && resolvePackFile(currentPack, soundName);
          if (packFile) {
            newSoundURL = `/sounds_custom/${
              currentPack?.truncatedPackPath || "/error"
            }/${packFile}`;
            break;
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

  python.getAndSetSoundPacks().then(() => {
    python.resolve(python.getConfig(), (data: any) => {
      // This sets the config data in globalState
      const configSelectedMusic = data?.selected_music || "None";
      const configSoundVolume = data?.sound_volume ?? 1;
      const configMusicVolume = data?.music_volume ?? 0.5;
      const configRepeat = data?.music_repeat;

      setGlobalState("activeSound", data?.selected_pack || "Default");
      setGlobalState("selectedMusic", configSelectedMusic);
      setGlobalState("selectedTrack", data?.selected_track ?? "");
      setGlobalState("soundVolume", configSoundVolume);
      setGlobalState("musicVolume", configMusicVolume);
      setGlobalState("musicShuffle", data?.music_shuffle ?? false);
      setGlobalState(
        "musicRepeat",
        // "all" was removed (the queue always wraps), so old configs map to "off"
        configRepeat === "off" || configRepeat === "all" ? "off" : "one"
      );
      setGlobalState("randomSoundOnLaunch", data?.random_sound_on_launch ?? false);
      setGlobalState("randomMusicOnLaunch", data?.random_music_on_launch ?? false);

      const { soundPacks, randomSoundOnLaunch, randomMusicOnLaunch } = state.getPublicState();

      // Random sound pack: picks from the installed (non-music) sound packs
      if (randomSoundOnLaunch) {
        const candidates = soundPacks.filter((p) => !p.music);
        if (candidates.length > 0) {
          const pick = candidates[Math.floor(Math.random() * candidates.length)];
          setGlobalState("activeSound", pick.name);
        }
      }

      if (randomMusicOnLaunch) {
        startRandomMusic();
      } else {
        startCurrent();
      }
    });
  });

  const AppStateRegistrar =
  // SteamClient is something exposed by the SP tab of SteamUI, it's not a decky-frontend-lib thingy, but you can still call it normally
  // Refer to the SteamClient.d.ts or just console.log(SteamClient) to see all of it's methods
  SteamClient.GameSessions.RegisterForAppLifetimeNotifications((update: AppState) => {
    const { gamesRunning } = state.getPublicState();
    const setGlobalState = state.setGlobalState.bind(state);
    if (update.bRunning) {
      // Because gamesRunning is in globalState, array methods like push and splice don't work
      setGlobalState("gamesRunning", [...gamesRunning, update.unAppID]);
      pauseForGame();
    } else {
      // This happens when an app is closed
      const filteredGames = gamesRunning.filter((e) => e !== update.unAppID);
      setGlobalState("gamesRunning", filteredGames);
      // Resumes unless the user paused the music themselves
      if (filteredGames.length === 0) resumeAfterGame();
    }
  });

  // EUIMode: 4 = Big Picture / Gaming Mode, 7 = desktop UI. Music only plays in the former.
  const UIModeRegistrar = SteamClient.UI?.RegisterForUIModeChanged?.((mode: number) => {
    setGamepadUI(mode === 4);
  });

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
    title: <div className={staticClasses.Title}>Audio Loader</div>,
    content: (
      <GlobalStateContextProvider globalStateClass={state}>
      <Content serverAPI={serverApi} />
      </GlobalStateContextProvider>
    ),
    icon: <RiFolderMusicFill />,
    onDismount: () => {
      const { soundPatchInstance, volumePatchInstance } = state.getPublicState();
      stopMusic();
      soundPatchInstance.unpatch();
      volumePatchInstance.unpatch();
      AppStateRegistrar.unregister();
      UIModeRegistrar?.unregister();
    },
  };
});
