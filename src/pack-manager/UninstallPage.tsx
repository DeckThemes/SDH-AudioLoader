import { PanelSectionRow, ButtonItem } from "decky-frontend-lib";
import { useState, VFC } from "react";
import { FaTrash } from "react-icons/fa";
import * as python from "../python";

import { useGlobalState } from "../state/GlobalState";
import { Pack } from "../classes";

export const UninstallPage: VFC = () => {
  const {
    soundPacks,
    setSoundPacks,
    activeSound,
    setActiveSound,
    musicEnabled,
    musicLibraryOnly,
  } = useGlobalState();

  const [isUninstalling, setUninstalling] = useState(false);

  function fetchLocalPacks() {
    python.resolve(python.reloadPacksDir(), () => {
      python.resolve(python.getSoundPacks(), (data: any) => {
        setSoundPacks(data);
      });
    });
  }

  function handleUninstall(listEntry: Pack) {
    setUninstalling(true);
    python.resolve(python.deletePack(listEntry.data.name), () => {
      fetchLocalPacks();
      if (activeSound === listEntry.data.name) {
        console.log(
          "Audio Loader - Attempted to uninstall applied sound, changing applied sound to Default"
        );
        setActiveSound("Default");
        const configObj = {
          music_enabled: musicEnabled,
          music_library_only: musicLibraryOnly,
          selected_pack: "Default",
        };
        python.setConfig(configObj);
      }
      setUninstalling(false);
    });
  }

  if (soundPacks.length === 0) {
    return (
      <PanelSectionRow>
        <span>
          No custom themes installed, find some in the 'Browse Themes' tab.
        </span>
      </PanelSectionRow>
    );
  }

  return (
    <>
      {soundPacks.map((e: Pack) => (
        <PanelSectionRow>
          <ButtonItem
            label={e.data.name}
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
