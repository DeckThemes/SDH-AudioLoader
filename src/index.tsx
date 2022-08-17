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
import { VFC, useEffect } from "react";
import { RiFolderMusicFill } from "react-icons/ri";
import { AudioParent } from "./gamepadAudioFinder";
import * as python from "./python";
import {
  GlobalState,
  GlobalStateContextProvider,
  useGlobalState,
} from "./state/GlobalState";

const Content: VFC<{ serverAPI: ServerAPI }> = ({}) => {
  const { activeSound, setActiveSound, soundPacks, setSoundPacks } =
    useGlobalState();

  console.log(activeSound, setActiveSound, soundPacks, setSoundPacks);

  useEffect(() => {
    python.resolve(python.getSoundPacks(), setSoundPacks);
    reloadPatch();
  }, []);

  function reloadPatch() {
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
          case -2: // Default
            newSoundURL = args[0];
            break;
          case -1: // Silent
            // Set path to somewhere that doesn't exist so nothing plays
            newSoundURL = args[0].replace("sounds/", "sounds_silent/");
            break;
          default:
            newSoundURL = args[0].replace(
              "sounds/",
              `sounds_custom/${soundPacks[activeSound].path}/`
            );
            break;
        }
        args[0] = newSoundURL;
        return [newSoundURL];
      }
    );
  }

  return (
    <div>
      <PanelSection title="Packs">
        <PanelSectionRow>
          <DropdownItem
            bottomSeparator={true}
            label={`Sounds`}
            menuLabel={`Sounds`}
            rgOptions={[
              { label: "Default", data: -2 },
              { label: "Silent", data: -1 },
            ].concat(
              soundPacks
                .map((p, index) => ({ label: p.name, data: index }))
                .sort((a, b) => a.label.localeCompare(b.label))
            )}
            selectedOption={activeSound}
            onChange={async (option) => {
              setActiveSound(option.data);
            }}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <DropdownItem
            bottomSeparator={false}
            label={`Music`}
            menuLabel={`Music`}
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
            onClick={() => reloadPatch()}
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
      const newSoundURL = args[0].replace("sounds/", "sounds/");
      args[0] = newSoundURL;
      return [newSoundURL];
    }
  );

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
