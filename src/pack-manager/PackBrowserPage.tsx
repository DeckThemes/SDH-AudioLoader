import {
  DropdownOption,
  PanelSectionRow,
  DropdownItem,
  TextField,
  Focusable,
  ButtonItem,
} from "decky-frontend-lib";
import { useEffect, VFC, useMemo, useRef } from "react";
import { Pack, packDbEntry } from "../classes";
import * as python from "../python";
import { useGlobalState } from "../state/GlobalState";
import "../audiomanager.css";
import { motion } from "framer-motion";

export const PackBrowserPage: VFC = () => {
  const {
    soundPacks,
    setSoundPacks,
    browserPackList,
    setBrowserPackList,
    searchFieldValue,
    setSearchValue,
    selectedSort,
    setSort,
    selectedTarget,
    setTarget,
    isInstalling,
    setInstalling,
  } = useGlobalState();

  async function fetchPackDb() {
    python.resolve(python.fetchPackDb(), (response: any) => {
      if (response.body) {
        setBrowserPackList(JSON.parse(response.body));
      } else {
        console.log(
          "AudioLoader - Fetching PackDb Failed, no json string was returned by the fetch"
        );
      }
    });
  }

  function fetchLocalPacks() {
    python.resolve(python.reloadPacksDir(), () => {
      python.resolve(python.getSoundPacks(), (data: any) => {
        setSoundPacks(data);
      });
    });
  }

  function reloadPacks() {
    fetchPackDb();
    fetchLocalPacks();
  }
  useEffect(() => {
    fetchPackDb();
  }, []);

  const searchFilter = (e: packDbEntry) => {
    // This filter just implements the search stuff
    if (searchFieldValue.length > 0) {
      // Convert the theme and search to lowercase so that it's not case-sensitive
      if (
        // This checks for the theme name
        !e.name.toLowerCase().includes(searchFieldValue.toLowerCase()) &&
        // This checks for the author name
        !e.author.toLowerCase().includes(searchFieldValue.toLowerCase()) &&
        // This checks for the description
        !e.description.toLowerCase().includes(searchFieldValue.toLowerCase())
      ) {
        // return false just means it won't show in the list
        return false;
      }
    }
    return true;
  };

  const sortOptions = useMemo(
    (): DropdownOption[] => [
      { data: 1, label: "Alphabetical (A to Z)" },
      { data: 2, label: "Alphabetical (Z to A)" },
      { data: 3, label: "Last Updated (Newest)" },
      { data: 4, label: "Last Updated (Oldest)" },
    ],
    []
  );

  const targetOptions = useMemo(
    (): DropdownOption[] => [
      { data: 1, label: "All" },
      { data: 2, label: "Installed" },
      { data: 3, label: "Music" },
      { data: 4, label: "Sound" },
    ],
    []
  );

  function checkIfPackInstalled(themeObj: packDbEntry) {
    const filteredArr: Pack[] = soundPacks.filter(
      (e: Pack) =>
        e.data.name === themeObj.name && e.data.author === themeObj.author
    );
    if (filteredArr.length > 0) {
      if (filteredArr[0].data.version === themeObj.version) {
        return "installed";
      } else {
        return "outdated";
      }
    } else {
      return "uninstalled";
    }
  }

  const installRef = useRef(-1);

  return (
    <>
      <PanelSectionRow>
        <DropdownItem
          label="Sort"
          rgOptions={sortOptions}
          strDefaultLabel="Last Updated (Newest)"
          selectedOption={selectedSort}
          onChange={(e) => setSort(e.data)}
        />
        <DropdownItem
          label="Filter"
          rgOptions={targetOptions}
          strDefaultLabel="All"
          selectedOption={selectedTarget.data}
          onChange={(e) => setTarget(e)}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <TextField
          label="Search"
          value={searchFieldValue}
          onChange={(e) => setSearchValue(e.target.value)}
        />
      </PanelSectionRow>
      {/* I wrap everything in a Focusable, because that ensures that the dpad/stick navigation works correctly */}
      <Focusable style={{ display: "flex", flexWrap: "wrap" }}>
        {browserPackList
          // searchFilter also includes backend version check
          .filter(searchFilter)
          .filter((e: packDbEntry) => {
            if (selectedTarget.label === "All") {
              return true;
            } else if (selectedTarget.label === "Installed") {
              const strValue = checkIfPackInstalled(e);
              return strValue === "installed" || strValue === "outdated";
            } else if (selectedTarget.label === "Music") {
              return e.music;
            } else {
              return !e.music;
            }
          })
          .sort((a, b) => {
            // This handles the sort option the user has chosen
            switch (selectedSort) {
              case 2:
                // Z-A
                // localeCompare just sorts alphabetically
                return b.name.localeCompare(a.name);
              case 3:
                // New-Old
                return (
                  new Date(b.last_changed).valueOf() -
                  new Date(a.last_changed).valueOf()
                );
              case 4:
                // Old-New
                return (
                  new Date(a.last_changed).valueOf() -
                  new Date(b.last_changed).valueOf()
                );
              default:
                // This is just A-Z
                return a.name.localeCompare(b.name);
            }
          })
          .map((e: packDbEntry, i) => {
            const installStatus = checkIfPackInstalled(e);
            return (
              // The outer 2 most divs are the background darkened/blurred image, and everything inside is the text/image/buttons
              <>
                <div
                  className="AudioLoader_PackBrowser_SingleItem_Container1"
                  style={{
                    width: "100%",
                    marginLeft: "10px",
                    marginRight: "10px",
                    marginBottom: "20px",
                  }}
                >
                  <div
                    className="AudioLoader_PackBrowser_SingleItem_Container2"
                    style={{
                      // Really this could be combined with the above div, its just that in CSSLoader there's 2 here, and I didn't want to merge them because its 1am
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      height: "100%",
                    }}
                  >
                    <div
                      // I'm still using the format of div-with-a-bg-image, because I think that could make it a bit easier to add icons/text in front if we want
                      className="AudioLoader_PackBrowser_SingleItem_PreviewImageContainer"
                      style={{
                        width: "200px",
                        height: "200px",
                        position: "relative",
                      }}
                    >
                      <div
                        style={{
                          backgroundImage:
                            "url(https://i.imgur.com/nISGpci.png)",
                          position: "absolute",
                          top: "10%",
                          left: "0",
                          width: "80%",
                          height: "80%",
                          backgroundSize: "cover",
                          zIndex: 3,
                          borderRadius: "2px",
                        }}
                      />
                      <div
                        style={{
                          backgroundImage: 'url("' + e.preview_image + '")',
                          backgroundColor: "#21323d",
                          position: "absolute",
                          top: "10%",
                          left: "0",
                          width: "80%",
                          height: "80%",
                          backgroundSize: "cover",
                          zIndex: 2,
                          borderRadius: "2px",
                        }}
                      />
                      <motion.div
                        animate={
                          installRef.current === i ? { rotate: 360 } : {}
                        }
                        exit={{}}
                        transition={{
                          repeat: installRef.current === i ? Infinity : 0,
                          duration: installRef.current === i ? 1.82 : 0.001,
                          ease: "linear",
                        }}
                        style={{
                          backgroundImage:
                            'url("https://i.imgur.com/V9t3728.png")',
                          position: "absolute",
                          top: "12.5%",
                          right: "0",
                          width: "75%",
                          height: "75%",
                          backgroundSize: "cover",
                          zIndex: 1,
                          rotate: 0,
                        }}
                      />
                    </div>
                    <div
                      style={{
                        width: "calc(100% - 220px)", // The calc is here so that the text section doesn't expand into the image
                        display: "flex",
                        flexDirection: "column",
                        height: "100%",
                        marginLeft: "1em",
                        justifyContent: "center",
                      }}
                    >
                      <span
                        className="AudioLoader_PackBrowser_SingleItem_ThemeName"
                        style={{
                          fontSize: "1.25em",
                          fontWeight: "bold",
                          // This stuff here truncates it if it's too long (prolly not gonna happen on audioloader, just code from cssloader)
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          width: "90%",
                        }}
                      >
                        {e.name}
                      </span>
                      <span
                        className="AudioLoader_PackBrowser_SingleItem_AuthorText"
                        style={{
                          marginRight: "auto",
                          fontSize: "1em",
                          // The text shadows are leftover from cssloader, you can experiment with removing them if you want
                          textShadow: "rgb(48, 48, 48) 0px 0 10px",
                        }}
                      >
                        {e.author}
                      </span>
                      <span
                        className="AudioLoader_PackBrowser_SingleItem_ThemeTarget"
                        style={{
                          fontSize: "1em",
                          textShadow: "rgb(48, 48, 48) 0px 0 10px",
                        }}
                      >
                        {e.music ? "Music" : "Sound"} | {e.version}
                      </span>
                      <span
                        className="AudioLoader_PackBrowser_SingleItem_DescriptionText"
                        style={{
                          fontSize: "13px",
                          textShadow: "rgb(48, 48, 48) 0px 0 10px",
                          color: "#969696",
                          WebkitLineClamp: "3",
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                          display: "-webkit-box",
                        }}
                      >
                        {e.description ? (
                          e.description
                        ) : (
                          <span>
                            <i style={{ color: "#666" }}>
                              No description provided.
                            </i>
                          </span>
                        )}
                      </span>

                      <div
                        className="AudioLoader_PackBrowser_SingleItem_InstallButtonContainer"
                        style={{
                          marginTop: "1em",
                          width: "245px",
                          overflow: "hidden",
                        }}
                      >
                        <PanelSectionRow>
                          <div
                            className="AudioLoader_PackBrowser_SingleItem_InstallContainer"
                            style={{
                              // This padding here overrides the default padding put on PanelSectionRow's by Valve
                              // Before this, I was using negative margin to "shrink" the element, but this is a much better solution
                              paddingTop: "0px",
                              paddingBottom: "0px",
                            }}
                          >
                            <ButtonItem
                              bottomSeparator="none"
                              layout="below"
                              disabled={
                                isInstalling || installStatus === "installed"
                              }
                              onClick={() => {
                                setInstalling(true);
                                installRef.current = i;
                                python.resolve(
                                  python.downloadPack(e.id),
                                  () => {
                                    fetchLocalPacks();
                                    setInstalling(false);
                                    if (installRef.current === i)
                                      installRef.current = -1;
                                  }
                                );
                              }}
                            >
                              <span className="AudioLoader_PackBrowser_SingleItem_InstallText">
                                {installStatus === "outdated"
                                  ? "Update Available"
                                  : installStatus === "uninstalled"
                                  ? "Install"
                                  : "Installed"}
                              </span>
                            </ButtonItem>
                          </div>
                        </PanelSectionRow>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            );
          })}
      </Focusable>
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          onClick={() => {
            reloadPacks();
          }}
        >
          Reload Packs
        </ButtonItem>
      </PanelSectionRow>
    </>
  );
};
