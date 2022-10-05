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
  SidebarNavigation,
} from "decky-frontend-lib";
import { VFC, useMemo, useEffect, useState } from "react";
import { RiFolderMusicFill } from "react-icons/ri";
import { AudioParent } from "./gamepadAudioFinder";
import { PackBrowserPage, UninstallPage } from "./pack-manager";
import * as python from "./python";
import {
  GlobalState,
  GlobalStateContextProvider,
  useGlobalState,
} from "./state/GlobalState";

const Content: VFC<{ serverAPI: ServerAPI }> = ({}) => {
  const {
    activeSound,
    gamesRunning,
    setActiveSound,
    soundPacks,
    menuMusic,
    setMenuMusic,
    selectedMusic,
    setSelectedMusic,
  } = useGlobalState();

  const [dummyFuncResult, setDummyResult] = useState<boolean>(false);

  function dummyFuncTest() {
    python.resolve(python.dummyFunction(), setDummyResult);
  }

  useEffect(() => {
    dummyFuncTest();
  }, []);

  function restartMusicPlayer(newMusic: string) {
    if (menuMusic !== null) {
      menuMusic.StopPlayback();
      setMenuMusic(null);
    }
    // This makes sure if you are in a game, music doesn't start playing
    if (newMusic !== "None" && gamesRunning.length === 0) {
      const currentPack = soundPacks.find((e) => e.name === newMusic);
      const newMenuMusic =
        AudioParent.GamepadUIAudio.AudioPlaybackManager.PlayAudioURLWithRepeats(
          `/sounds_custom/${currentPack?.path || "/error"}/menu_music.mp3`,
          999 // if someone complains this isn't infinite, just say it's a Feature™ for if you go afk
        );
      setMenuMusic(newMenuMusic);
    }
  }

  const SoundPackDropdownOptions = useMemo(() => {
    return [
      { label: "Default", data: -1 },
      ...soundPacks
        // Only shows sound packs
        .filter((e) => !e.data.music)
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
        .filter((e) => e.data.music)
        .map((p, index) => ({ label: p.name, data: index }))
        // TODO: because this sorts after assigning indexes, the sort might make the indexes out of order, make sure this doesn't happen
        .sort((a, b) => a.label.localeCompare(b.label)),
    ];
  }, [soundPacks]);

  if (!dummyFuncResult) {
    return (
      <PanelSectionRow>
        <span>
          AudioLoader failed to initialize, try reloading, and if that doesn't
          work, try restarting your deck.
        </span>
      </PanelSectionRow>
    );
  }

  return (
    <div>
      <PanelSection title="Packs">
        <PanelSectionRow>
          <DropdownItem
            bottomSeparator="standard"
            label="Sounds"
            menuLabel="Sounds"
            rgOptions={SoundPackDropdownOptions}
            selectedOption={
              // activeSound now stores a string, this just finds the corresponding option for the label
              // the "?? -2" is there incase find returns undefined (the currently selected theme was deleted or something)
              // it NEEDS to be a nullish coalescing operator because 0 needs to be treated as true
              SoundPackDropdownOptions.find((e) => e.label === activeSound)
                ?.data ?? -1
            }
            onChange={async (option) => {
              setActiveSound(option.label as string);

              const configObj = {
                selected_pack: option.label,
                selected_music: selectedMusic,
              };
              python.setConfig(configObj);
            }}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <DropdownItem
            bottomSeparator="none"
            label="Music"
            menuLabel="Music"
            rgOptions={MusicPackDropdownOptions}
            selectedOption={
              MusicPackDropdownOptions.find((e) => e.label === selectedMusic)
                ?.data ?? -1
            }
            onChange={async (option) => {
              setSelectedMusic(option.label as string);

              const configObj = {
                selected_pack: activeSound,
                selected_music: option.label,
              };
              python.setConfig(configObj);
              restartMusicPlayer(option.label as string);
            }}
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
  return (
    <SidebarNavigation
      title="Pack Manager"
      showTitle
      pages={[
        {
          title: "Browse Packs",
          content: <PackBrowserPage />,
          route: "/audiopack-manager/browser",
        },
        {
          title: "Uninstall Packs",
          content: <UninstallPage />,
          route: "/audiopack-manager/uninstall",
        },
      ]}
    />
  );
};

export default definePlugin((serverApi: ServerAPI) => {
  python.setServer(serverApi);

  const state: GlobalState = new GlobalState();
  let menuMusic: any = null;

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
          const currentPack = soundPacks.find((e) => e.name === activeSound);
          if (currentPack?.ignore.includes(args[0].slice(8))) {
            newSoundURL = args[0];
            break;
          }
          newSoundURL = args[0].replace(
            "sounds/",
            `sounds_custom/${currentPack?.path || "/error"}/`
          );
          break;
      }
      args[0] = newSoundURL;
      return [newSoundURL];
    }
  );
  state.setMusicPatchInstance(patchInstance);

  python.resolve(python.getSoundPacks(), (packs: any) => {
    state.setSoundPacks(packs);
    // This is nested in here so that all data has loaded before it attempts to find audio paths
    python.resolve(python.getConfig(), (data: any) => {
      // This sets the config data in globalState
      state.setActiveSound(data?.selected_pack || "Default");
      const configSelectedMusic = data?.selected_music || "None";
      state.setSelectedMusic(configSelectedMusic);

      // Plays menu music initially
      // TODO: Add check if game is currently running
      if (configSelectedMusic !== "None") {
        const { soundPacks } = state.getPublicState();
        const currentPack = soundPacks.find(
          (e) => e.name === configSelectedMusic
        );
        menuMusic =
          AudioParent.GamepadUIAudio.AudioPlaybackManager.PlayAudioURLWithRepeats(
            `/sounds_custom/${currentPack?.path || "/error"}/menu_music.mp3`,
            999 // if someone complains this isn't infinite, just say it's a Feature™ for if you go afk
          );
        state.setMenuMusic(menuMusic);
      }
    });
  });

  const AppStateRegistrar =
    // SteamClient is something exposed by the SP tab of SteamUI, it's not a decky-frontend-lib thingy, but you can still call it normally
    // Refer to the SteamClient.d.ts or just console.log(SteamClient) to see all of it's methods
    SteamClient.GameSessions.RegisterForAppLifetimeNotifications(
      (update: AppState) => {
        const { soundPacks, menuMusic, selectedMusic, gamesRunning } =
          state.getPublicState();
        if (selectedMusic !== "None") {
          if (update.bRunning) {
            // Because gamesRunning is in globalState, array methods like push and splice don't work
            state.setGamesRunning([...gamesRunning, update.unAppID]);
            if (menuMusic != null) {
              menuMusic.StopPlayback();
              state.setMenuMusic(null);
            }
          } else {
            state.setGamesRunning(
              gamesRunning.filter((e) => e !== update.unAppID)
            );

            // I'm re-using the filter here because I don't believe the getPublicState() method will update the values if they are changed
            if (gamesRunning.filter((e) => e !== update.unAppID).length === 0) {
              const currentMusic = soundPacks.find(
                (e) => e.name === selectedMusic
              );
              const newMenuMusic =
                AudioParent.GamepadUIAudio.AudioPlaybackManager.PlayAudioURLWithRepeats(
                  `/sounds_custom/${
                    currentMusic?.path || "/error"
                  }/menu_music.mp3`,
                  999 // if someone complains this isn't infinite, just say it's a Feature™ for if you go afk
                );
              // Update menuMusic in globalState after every change so that it reflects the changes the next time it checks
              state.setMenuMusic(newMenuMusic);
            }
          }
        }
      }
    );

  serverApi.routerHook.addRoute("/audiopack-manager", () => (
    <GlobalStateContextProvider globalStateClass={state}>
      <PackManagerRouter />
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
      const { menuMusic, musicPatchInstance } = state.getPublicState();
      if (menuMusic != null) {
        menuMusic.StopPlayback();
        state.setMenuMusic(null);
      }
      musicPatchInstance.unpatch();
      AppStateRegistrar.unregister();
    },
  };
});
