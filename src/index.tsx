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
import { VFC, useState, useEffect } from "react";
import { RiFolderMusicFill } from "react-icons/ri";
import { Pack } from "./classes";
import { AudioParent } from "./gamepadAudioFinder/gamepadAudioFinder";
import * as python from "./python";

const Content: VFC<{ serverAPI: ServerAPI }> = ({}) => {
  const [activeSound, setActiveSound] = useState<number>(-2);
  const [soundPacks, setSoundPacks] = useState<Pack[]>([]);

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
        console.log(activeSound);
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
              `sounds_custom/${soundPacks[activeSound].packPath
                .split("/")
                .pop()}/`
            );
            break;
        }
        args[0] = newSoundURL;
        console.log(newSoundURL);
        return [newSoundURL];
      }
    );
  }

  return (
    <div>
      <PanelSection title="Packs">
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
      </PanelSection>
      <PanelSection title="Configuration">
        <PanelSectionRow>
          <ToggleField
            bottomSeparator={false}
            checked={false}
            label={"Limit Music to Library"}
            disabled={true}
          />
        </PanelSectionRow>
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
    content: <Content serverAPI={serverApi} />,
    icon: <RiFolderMusicFill />,
    onDismount: () => {
      unpatch(
        AudioParent.GamepadUIAudio.m_AudioPlaybackManager.__proto__,
        "PlayAudioURL"
      );
    },
  };
});
