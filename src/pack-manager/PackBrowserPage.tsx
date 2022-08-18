import {
  DropdownOption,
  PanelSectionRow,
  DropdownItem,
  ButtonItem,
  TextField,
  Focusable,
} from "decky-frontend-lib";
import { useEffect, VFC, useMemo } from "react";
import { Pack, packDbEntry } from "../classes";
import * as python from "../python";
import { useGlobalState } from "../state/GlobalState";

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
    const response = await python.fetchPackDb();
    if (response.success) {
      setBrowserPackList(JSON.parse(response.result.body));
    } else {
      console.log("AudioLoader - Fetching PackDb Failed");
    }
  }

  function reloadPacks() {
    fetchPackDb();
    python.resolve(python.getSoundPacks(), (data: any) => {
      setSoundPacks(data);
    });
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
        !e.author.toLowerCase().includes(searchFieldValue.toLowerCase())
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
          .map((e: packDbEntry) => {
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
                      className="AudioLoader_PackBrowser_SingleItem_PreviewImage"
                      style={{
                        width: "200px",
                        backgroundImage: 'url("' + e.preview_image + '")',
                        backgroundSize: "cover",
                        backgroundRepeat: "no-repeat",
                        height: "200px",
                        display: "flex",
                        position: "relative",
                        flexDirection: "column",
                        alignItems: "center",
                      }}
                    />
                    <div
                      style={{
                        width: "calc(100% - 220px)", // The calc is here so that the text section doesn't expand into the image
                        display: "flex",
                        flexDirection: "column",
                        height: "100%",
                        marginLeft: "5px",
                      }}
                    >
                      <span
                        className="AudioLoader_PackBrowser_SingleItem_ThemeName"
                        style={{
                          marginTop: "5px",
                          fontSize: "1.5em",
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
                        className="AudioLoader_PackBrowser_SingleItem_AuthorText"
                        style={{
                          fontSize: "0.75em",
                          textShadow: "rgb(48, 48, 48) 0px 0 10px",
                          color: "#aaa",
                        }}
                      >
                        {e.description ? (
                          e.description
                        ) : (
                          <span>
                            <i>No Description Provided</i>
                          </span>
                        )}
                      </span>

                      <div
                        className="AudioLoader_PackBrowser_SingleItem_InstallButtonContainer"
                        style={{
                          marginTop: "auto",
                          width: "245px",
                        }}
                      >
                        <PanelSectionRow>
                          <div
                            className="AudioLoader_PackBrowser_SingleItem_OpenExpandedViewContainer"
                            style={{
                              // This padding here overrides the default padding put on PanelSectionRow's by Valve
                              // Before this, I was using negative margin to "shrink" the element, but this is a much better solution
                              paddingTop: "0px",
                              paddingBottom: "0px",
                            }}
                          >
                            <ButtonItem
                              bottomSeparator={false}
                              layout="below"
                              disabled={
                                isInstalling || installStatus === "installed"
                              }
                              onClick={() => {}}
                            >
                              <span className="AudioLoader_PackBrowser_SingleItem_OpenExpandedViewText">
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