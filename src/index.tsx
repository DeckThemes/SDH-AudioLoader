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
  unpatch,
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
    setActiveSound,
    soundPacks,
    setSoundPacks,
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
    console.log(newMusic, menuMusic);
    if (menuMusic !== null) {
      menuMusic.StopPlayback();
    }
    if (newMusic === "None") {
      setMenuMusic(null);
    } else {
      const currentPack = soundPacks.find((e) => e.name === newMusic);
      const newMenuMusic =
        AudioParent.GamepadUIAudio.AudioPlaybackManager.PlayAudioURLWithRepeats(
          `/sounds_custom/${currentPack?.path || "/error"}/menu_music.mp3`,
          999 // if someone complains this isn't infinite, just say it's a Feature™ for if you go afk
        );
      setMenuMusic(newMenuMusic);
    }
  }

  function reloadPlugin() {
    dummyFuncTest();
    python.resolve(python.reloadPacksDir(), () => {
      python.resolve(python.getSoundPacks(), (data: any) => {
        setSoundPacks(data);
      });
    });

    python.resolve(python.getConfig(), (data: any) => {
      // This just has fallbacks incase the fetch fails or the config is improperly formatted
      setActiveSound(data?.selected_pack || "Default");
      setSelectedMusic(data?.selected_music || "None");
    });

    restartMusicPlayer(selectedMusic);

    unpatch(
      AudioParent.GamepadUIAudio.m_AudioPlaybackManager.__proto__,
      "PlayAudioURL"
    );

    beforePatch(
      AudioParent.GamepadUIAudio.m_AudioPlaybackManager.__proto__,
      "PlayAudioURL",
      (args) => {
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
            bottomSeparator={true}
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
              setActiveSound(option.label);

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
            bottomSeparator={false}
            label="Music"
            menuLabel="Music"
            rgOptions={MusicPackDropdownOptions}
            selectedOption={
              MusicPackDropdownOptions.find((e) => e.label === selectedMusic)
                ?.data ?? -1
            }
            onChange={async (option) => {
              setSelectedMusic(option.label);

              const configObj = {
                selected_pack: activeSound,
                selected_music: option.label,
              };
              python.setConfig(configObj);
              restartMusicPlayer(option.label);
            }}
          />
        </PanelSectionRow>
      </PanelSection>
      <PanelSection title="Settings">
        <PanelSectionRow>
          <ButtonItem
            bottomSeparator={false}
            layout="below"
            onClick={() => {
              Router.CloseSideMenus();
              Router.Navigate("/audiopack-manager");
            }}
          >
            Manage Packs
          </ButtonItem>
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem
            bottomSeparator={true}
            layout="below"
            onClick={() => reloadPlugin()}
          >
            Reload Plugin
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
  let gamesRunning: Number[] = [];

  beforePatch(
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
        const { soundPacks, menuMusic, selectedMusic } = state.getPublicState();
        if (selectedMusic !== "None") {
          if (update.bRunning) {
            gamesRunning.push(update.unAppID);
            if (menuMusic != null) {
              menuMusic.StopPlayback();
              state.setMenuMusic(null);
            }
          } else {
            for (let i = gamesRunning.length; i >= 0; i--) {
              if (gamesRunning[i] === update.unAppID) gamesRunning.splice(i, 1);
            }
            if (gamesRunning.length === 0) {
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
              // You need to update menuMusic in globalState after every change so that it reflects the changes the next time it checks
              state.setMenuMusic(newMenuMusic);
            }
          }
        }
      }
    );

  // This variable is used to debounce these, as they tend to get called multiple times and I don't want stacked audio
  let sideMenuOpen = false;
  beforePatch(Router, "OpenSideMenu", (args) => {
    if (!sideMenuOpen) {
      sideMenuOpen = true;
      // AudioParent.GamepadUIAudio.PlayAudioURL("/sounds_custom/drip.wav"); we might not use PlayAudioURL but this is where you would call it for QAM music
      console.log("Side Menu Opened");
    }
    return args;
  });
  beforePatch(Router, "CloseSideMenus", (args) => {
    if (sideMenuOpen) {
      sideMenuOpen = false;
      console.log("Side Menu Closed");
    }
    return args;
  });

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
      if (menuMusic != null) {
        menuMusic.StopPlayback();
        menuMusic = null;
      }

      unpatch(Router, "OpenSideMenu");
      unpatch(Router, "CloseSideMenus");
      unpatch(
        AudioParent.GamepadUIAudio.m_AudioPlaybackManager.__proto__,
        "PlayAudioURL"
      );
      AppStateRegistrar.unregister();
    },
  };
});
