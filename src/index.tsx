import {
  ButtonItem,
  definePlugin,
  PanelSection,
  PanelSectionRow,
  ServerAPI,
  staticClasses,
  DropdownItem,
  Router,
  beforePatch,
  Tabs,
  afterPatch,
  SliderField,
} from "decky-frontend-lib";
import { Permissions } from "./apiTypes";
import { VFC, useMemo, useEffect } from "react";
import { RiFolderMusicFill } from "react-icons/ri";
import { FaVolumeUp, FaMusic } from "react-icons/fa";
import { AudioParent } from "./gamepadAudioFinder";
import {
  UninstallPage,
  SettingsPage,
  StarredPacksPage,
  SubmissionsPage,
  PackBrowserPage,
  ExpandedViewPage,
} from "./pack-manager";
import * as python from "./python";
import * as api from "./api";
import { GlobalState, GlobalStateContextProvider, useGlobalState } from "./state/GlobalState";
import { changeMenuMusic } from "./audioPlayers";

const Content: VFC<{ serverAPI: ServerAPI }> = ({}) => {
  const {
    activeSound,
    gamesRunning,
    soundPacks,
    menuMusic,
    selectedMusic,
    soundVolume,
    musicVolume,
    gainNode,
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

              const configObj = {
                selected_pack: option.label,
                selected_music: selectedMusic,
                sound_volume: soundVolume,
                music_volume: musicVolume,
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
              gainNode.gain.setValueAtTime(value, gainNode.context.currentTime + 0.01);
              // gainNode.gain.value = value;
              setGlobalState("soundVolume", value);
              const configObj = {
                selected_pack: activeSound,
                selected_music: selectedMusic,
                sound_volume: value,
                music_volume: musicVolume,
              };
              python.setConfig(configObj);
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
              const configObj = {
                selected_pack: activeSound,
                selected_music: option.label,
                sound_volume: soundVolume,
                music_volume: musicVolume,
              };
              python.setConfig(configObj);
              restartMusicPlayer(option.label as string);
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
              menuMusic.volume = value;
              // @ts-ignore
              window.AUDIOLOADER_MENUMUSIC.volume = value;
              const configObj = {
                selected_pack: activeSound,
                selected_music: selectedMusic,
                sound_volume: soundVolume,
                music_volume: value,
              };
              python.setConfig(configObj);
            }}
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
    function (_, ret) {
      const { soundVolume } = state.getPublicState();
      const setGlobalState = state.setGlobalState.bind(state);
      // @ts-ignore
      const gainNode = new GainNode(this.context, { gain: soundVolume });
      gainNode.connect(ret);
      try {
        setGlobalState("gainNode", gainNode);
      } catch (e) {
        console.log(e);
      }
      return gainNode;
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
            const randIndex = Math.trunc(Math.random() * currentPack?.mappings[soundName].length);
            const mappedFileName = currentPack?.mappings[soundName][randIndex];
            newSoundURL = `/sounds_custom/${
              currentPack?.truncatedPackPath || "/error"
            }/${mappedFileName}`;
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

      setGlobalState("activeSound", data?.selected_pack || "Default");
      setGlobalState("selectedMusic", configSelectedMusic);
      setGlobalState("soundVolume", configSoundVolume);
      setGlobalState("musicVolume", configMusicVolume);

      const { soundPacks } = state.getPublicState();

      // Plays menu music initially
      changeMenuMusic(configSelectedMusic, null, setGlobalState, [], soundPacks, configMusicVolume);
    });
  });

  const AppStateRegistrar =
    // SteamClient is something exposed by the SP tab of SteamUI, it's not a decky-frontend-lib thingy, but you can still call it normally
    // Refer to the SteamClient.d.ts or just console.log(SteamClient) to see all of it's methods
    SteamClient.GameSessions.RegisterForAppLifetimeNotifications((update: AppState) => {
      const { menuMusic, selectedMusic, gamesRunning } = state.getPublicState();
      const setGlobalState = state.setGlobalState.bind(state);
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
            if (menuMusic !== null) {
              menuMusic.play();
            }
          }
        }
      }
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
      const { menuMusic, soundPatchInstance, volumePatchInstance } = state.getPublicState();
      const setGlobalState = state.setGlobalState.bind(state);
      if (menuMusic != null) {
        menuMusic.pause();
        menuMusic.currentTime = 0;
        setGlobalState("menuMusic", null);
      }
      soundPatchInstance.unpatch();
      volumePatchInstance.unpatch();
      AppStateRegistrar.unregister();
    },
  };
});
