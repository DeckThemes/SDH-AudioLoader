import {
  ButtonItem,
  definePlugin,
  PanelSection,
  PanelSectionRow,
  ServerAPI,
  staticClasses,
  DropdownItem,
  beforePatch,
  unpatch,
  ToggleField,
} from "decky-frontend-lib";
import { VFC, useMemo } from "react";
import { RiFolderMusicFill } from "react-icons/ri";
import { AudioParent } from "./gamepadAudioFinder";
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
    musicEnabled,
    setMusicEnabled,
    musicLibraryOnly,
    setMusicLibraryOnly,
  } = useGlobalState();

  function reloadPlugin() {
    python.resolve(python.getSoundPacks(), (data: any) => {
      setSoundPacks(data);
    });
    python.resolve(python.getConfig(), (data: any) => {
      // This just has fallbacks incase the fetch fails or the config is improperly formatted
      setActiveSound(data?.selected_pack || "Default");
      setMusicEnabled(data?.music_enabled || false);
      setMusicLibraryOnly(data?.music_library_only || false);
    });

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
          case "Silent":
            // Set path to somewhere that doesn't exist so nothing plays
            newSoundURL = args[0].replace("sounds/", "sounds_silent/");
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
      { label: "Default", data: -2 },
      { label: "Silent", data: -1 },
      ...soundPacks
        .map((p, index) => ({ label: p.name, data: index }))
        // TODO: because this sorts after assigning indexes, the sort might make the indexes out of order, make sure this doesn't happen
        .sort((a, b) => a.label.localeCompare(b.label)),
    ];
  }, [soundPacks]);

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
                ?.data ?? -2
            }
            onChange={async (option) => {
              setActiveSound(option.label);

              const configObj = {
                music_enabled: musicEnabled,
                music_library_only: musicLibraryOnly,
                selected_pack: option.label,
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
            rgOptions={[{ label: "Coming Soon", data: 0 }]}
            selectedOption={0}
            disabled={true}
          />
        </PanelSectionRow>
      </PanelSection>
      <PanelSection title="Settings">
        <PanelSectionRow>
          <ToggleField
            bottomSeparator={false}
            checked={false}
            label={"Limit Music to Library"}
            disabled={true}
          />
        </PanelSectionRow>
      </PanelSection>
      <PanelSection title="Management">
        <PanelSectionRow>
          <ButtonItem bottomSeparator={false} layout="below">
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

export default definePlugin((serverApi: ServerAPI) => {
  python.setServer(serverApi);

  const state: GlobalState = new GlobalState();

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
        case "Silent":
          // Set path to somewhere that doesn't exist so nothing plays
          newSoundURL = args[0].replace("sounds/", "sounds_silent/");
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

  // For some reason when I didn't make these arrow functions they gave me "can't set property of undefined errors", so just leave them as arrow functions
  python.resolve(python.getSoundPacks(), (data: any) => {
    state.setSoundPacks(data);
  });
  python.resolve(python.getConfig(), (data: any) => {
    // This just has fallbacks incase the fetch fails or the config is improperly formatted
    state.setActiveSound(data?.selected_pack || "Default");
    state.setMusicEnabled(data?.music_enabled || false);
    state.setMusicLibraryOnly(data?.music_library_only || false);
  });

  return {
    title: <div className={staticClasses.Title}>Audio Loader</div>,
    content: (
      <GlobalStateContextProvider globalStateClass={state}>
        <Content serverAPI={serverApi} />
      </GlobalStateContextProvider>
    ),
    icon: <RiFolderMusicFill />,
    onDismount: () => {
      unpatch(
        AudioParent.GamepadUIAudio.m_AudioPlaybackManager.__proto__,
        "PlayAudioURL"
      );
    },
  };
});
