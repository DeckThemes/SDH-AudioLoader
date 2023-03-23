import { PanelSectionRow, Focusable, DialogButton } from "decky-frontend-lib";
import { useEffect, useState, VFC } from "react";
import { FaTrash } from "react-icons/fa";
import { AiOutlineDownload } from "react-icons/ai";
import * as python from "../python";

import { useGlobalState } from "../state";
import { Pack } from "../classes";
import { MinimalCSSThemeInfo, PartialCSSThemeInfo } from "../apiTypes";
import { genericGET } from "../api";

export type LocalThemeStatus = "installed" | "outdated" | "local";

export const UninstallPage: VFC = () => {
  const { soundPacks, browseThemeList } = useGlobalState();

  const [isUninstalling, setUninstalling] = useState(false);

  const [updateStatuses, setUpdateStatuses] = useState<
    [string, LocalThemeStatus, false | MinimalCSSThemeInfo][]
  >([]);

  function handleUninstall(listEntry: Pack) {
    setUninstalling(true);
    python.resolve(python.deletePack(listEntry.name), () => {
      python.reloadBackend().then(() => {
        setUninstalling(false);
      });
    });
  }

  function updateTheme(remoteEntry: MinimalCSSThemeInfo | false) {
    if (remoteEntry && remoteEntry?.id) {
      const id = remoteEntry.id;
      setUninstalling(true);
      python.resolve(python.downloadThemeFromUrl(id), () => {
        python.reloadBackend();
        setUninstalling(false);
      });
    }
  }

  // This gets the update status of all installed themes by querying them all.
  useEffect(() => {
    console.log(soundPacks);
    if (soundPacks.length > 0) {
      let themeArr: MinimalCSSThemeInfo[] = [];
      let idsToQuery: string[] = [];
      soundPacks.forEach((e) => {
        const entryInBrowseList: PartialCSSThemeInfo | undefined =
          browseThemeList.items.find((f) => e.id === f.id || e.id === f.name);
        if (entryInBrowseList) {
          themeArr.push(entryInBrowseList);
          return;
        }
        idsToQuery.push(e.id);
      });
      if (idsToQuery.length > 0) {
        const queryStr = "?ids=" + idsToQuery.join(".");
        genericGET(`/themes/ids${queryStr}`).then(
          (data: MinimalCSSThemeInfo[]) => {
            if (data) {
              themeArr.push(...data);
            }
            formatData();
          }
        );
      } else {
        formatData();
      }
      function formatData() {
        if (themeArr.length > 0) {
          let updateStatusArr: [
            string,
            LocalThemeStatus,
            false | MinimalCSSThemeInfo
          ][] = [];
          soundPacks.forEach((localEntry) => {
            const remoteEntry = themeArr.find(
              (remote) =>
                remote.id === localEntry.id || remote.name === localEntry.id
            );
            if (remoteEntry) {
              if (remoteEntry.version === localEntry.version) {
                updateStatusArr.push([localEntry.id, "installed", remoteEntry]);
                return;
              }
              updateStatusArr.push([localEntry.id, "outdated", remoteEntry]);
              return;
            }
            updateStatusArr.push([localEntry.id, "local", false]);
            return;
          });
          console.log(updateStatusArr);
          setUpdateStatuses(updateStatusArr);
        }
      }
    }
  }, [soundPacks]);

  if (soundPacks.length === 0) {
    return (
      <PanelSectionRow>
        <span>No custom packs installed, find some in the 'Browse' tab.</span>
      </PanelSectionRow>
    );
  }

  return (
    <>
      <div>
        <div>
          {soundPacks.map((e: Pack) => {
            let [updateStatus, remoteEntry]: [
              string,
              false | MinimalCSSThemeInfo
            ] = ["installed", false];
            const themeArrPlace = updateStatuses.find((f) => f[0] === e.id);
            if (themeArrPlace) {
              updateStatus = themeArrPlace[1];
              remoteEntry = themeArrPlace[2];
            }
            return (
              <PanelSectionRow>
                <div
                  style={{
                    display: "flex",
                    // TODO: I think that this 96% can be deleted, have to check
                    width: "96%",
                  }}
                >
                  <span>{e.name}</span>
                  <span
                    style={{
                      color: "#dcdedf55",
                      marginLeft: "8px",
                    }}
                  >
                    {e.version}
                  </span>
                  <Focusable
                    style={{
                      display: "flex",
                      marginLeft: "auto",
                      position: "relative",
                      minWidth: "60%",
                      maxWidth: "60%",
                    }}
                  >
                    {/* Update Button */}
                    {updateStatus === "outdated" && (
                      <DialogButton
                        style={{
                          marginRight: "8px",
                          minWidth: "calc(50% - 8px)",
                          maxWidth: "calc(50% - 8px)",
                          filter:
                            "invert(6%) sepia(90%) saturate(200%) hue-rotate(160deg) contrast(122%)",
                        }}
                        onClick={() => updateTheme(remoteEntry)}
                        disabled={isUninstalling}
                      >
                        <AiOutlineDownload />
                      </DialogButton>
                    )}
                    {updateStatus === "local" && (
                      <span
                        style={{
                          position: "absolute",
                          top: "50%",
                          right: "50%",
                          transform: "translate(0, -50%)",
                        }}
                      >
                        <i>Local Theme</i>
                      </span>
                    )}
                    <DialogButton
                      style={{
                        minWidth: "calc(50% - 8px)",
                        maxWidth: "calc(50% - 8px)",
                        marginLeft: "auto",
                      }}
                      onClick={() => handleUninstall(e)}
                      disabled={isUninstalling}
                    >
                      <FaTrash />
                    </DialogButton>
                  </Focusable>
                </div>
              </PanelSectionRow>
            );
          })}
        </div>
      </div>
    </>
  );
};
