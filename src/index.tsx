import {
  ButtonItem,
  definePlugin,
  Menu,
  MenuItem,
  PanelSection,
  PanelSectionRow,
  ServerAPI,
  showContextMenu,
  staticClasses,
  DropdownItem,
  beforePatch,
  unpatch,
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

  return (
    <div>
      <PanelSection title="Sound Effects">
        <PanelSectionRow>
          <DropdownItem
            bottomSeparator={true}
            label={`Sound Effects Pack`}
            menuLabel={`Sound Effects Pack`}
            rgOptions={[
              { label: "Default", data: 0 },
              { label: "Phantom", data: 1 },
            ]}
            selectedOption={0}
          />
        </PanelSectionRow>
      </PanelSection>
      <PanelSection title="Other">
        <PanelSectionRow>
          <ButtonItem
            layout="below"
            onClick={(e) =>
              showContextMenu(
                <Menu label="Menu" cancelText="CAAAANCEL" onCancel={() => {}}>
                  <MenuItem onSelected={() => {}}>Item #1</MenuItem>
                  <MenuItem onSelected={() => {}}>Item #2</MenuItem>
                  <MenuItem onSelected={() => {}}>Item #3</MenuItem>
                </Menu>,
                e.currentTarget ?? window
              )
            }
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
      const newSoundURL = args[0].replace("sounds/", "sounds_custom/");
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
