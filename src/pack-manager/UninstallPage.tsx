import { PanelSectionRow, ButtonItem } from "decky-frontend-lib";
import { useState, VFC } from "react";
import { FaTrash } from "react-icons/fa";
import * as python from "../python";

import { useGlobalState } from "../state/GlobalState";
import { Pack } from "../classes";

export const UninstallPage: VFC = () => {
  const {
    soundPacks,
    activeSound,
    selectedMusic,
    menuMusic,
    soundVolume,
    musicVolume,
    setGlobalState,
  } = useGlobalState();

  const [isUninstalling, setUninstalling] = useState(false);

  function fetchLocalPacks() {
    python.resolve(python.reloadPacksDir(), () => {
      python.resolve(python.getSoundPacks(), (data: any) => {
        setGlobalState("soundPacks", data);
      });
    });
  }

  function handleUninstall(listEntry: Pack) {
    setUninstalling(true);
    python.resolve(python.deletePack(listEntry.name), () => {
      fetchLocalPacks();
      if (activeSound === listEntry.name || selectedMusic === listEntry.name) {
        console.log(
          "Audio Loader - Attempted to uninstall applied sound/music, changing applied packs to Default"
        );
        if (activeSound === listEntry.name)
          setGlobalState("activeSound", "Default");
        if (selectedMusic === listEntry.name) {
          setGlobalState("selectedMusic", "None");
          if (menuMusic !== null) {
            menuMusic.StopPlayback();
            setGlobalState("menuMusic", null);
          }
        }
        const configObj = {
          selected_pack:
            activeSound === listEntry.name ? "Default" : activeSound,
          selected_music:
            selectedMusic === listEntry.name ? "None" : activeSound,
          sound_volume: soundVolume,
          music_volume: musicVolume,
        };
        python.setConfig(configObj);
      }
      setUninstalling(false);
    });
  }

  if (soundPacks.length === 0) {
    return (
      <PanelSectionRow>
        <span>No packs installed, find some in the 'Browse Packs' tab.</span>
      </PanelSectionRow>
    );
  }

  return (
    <>
      {soundPacks
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((e: Pack) => (
          <PanelSectionRow>
            <ButtonItem
              label={e.name}
              onClick={() => handleUninstall(e)}
              disabled={isUninstalling}
            >
              <FaTrash />
            </ButtonItem>
          </PanelSectionRow>
        ))}
    </>
  );
};
