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
import { VFC } from "react";
import { RiFolderMusicFill } from "react-icons/ri";
import { AudioParent } from "./gamepadAudioFinder/gamepadAudioFinder";

// interface AddMethodArgs {
//   left: number;
//   right: number;
// }

const Content: VFC<{ serverAPI: ServerAPI }> = ({}) => {
  // const [result, setResult] = useState<number | undefined>();

  // const onClick = async () => {
  //   const result = await serverAPI.callPluginMethod<AddMethodArgs, number>(
  //     "add",
  //     {
  //       left: 2,
  //       right: 2,
  //     }
  //   );
  //   if (result.success) {
  //     setResult(result.result);
  //   }
  // };

  function reloadPatch() {
    unpatch(
      AudioParent.GamepadUIAudio.m_AudioPlaybackManager.__proto__,
      "PlayAudioURL"
    );

    beforePatch(
      AudioParent.GamepadUIAudio.m_AudioPlaybackManager.__proto__,
      "PlayAudioURL",
      (args) => {
        const newSoundURL = args[0].replace("sounds/", "sounds_custom/");
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
            label={`Sound Effects`}
            menuLabel={`Sound Effects`}
            rgOptions={[
              { label: "Default", data: 0 },
              { label: "Phantom", data: 1 },
            ]}
            selectedOption={0}
          />
        </PanelSectionRow>
      </PanelSection>
      <PanelSection title="Configuration">
        <PanelSectionRow>
          <ToggleField
            bottomSeparator={false}
            checked={false}
            label={"Limit Music to Library"}
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
