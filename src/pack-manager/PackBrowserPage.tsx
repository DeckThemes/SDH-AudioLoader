import {
  DropdownOption,
  PanelSectionRow,
  Dropdown,
  TextField,
  Focusable,
  DialogButton,
} from "decky-frontend-lib";
import { useLayoutEffect, VFC, useMemo, useRef, useState } from "react";
import { Pack, packDbEntry } from "../classes";
import * as python from "../python";
import { FaSyncAlt } from "react-icons/fa";
import { useGlobalState } from "../state/GlobalState";
import "../audiomanager.css";
import { PackDisplayCard } from "../components/packDisplayCard";

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
    setInstalling,
  } = useGlobalState();

  const [backendVersion, setBackendVer] = useState<number>(2);
  function reloadBackendVer() {
    python.resolve(python.getBackendVersion(), setBackendVer);
    console.log(backendVersion);
  }

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
  useLayoutEffect(() => {
    fetchPackDb();
    reloadBackendVer();
  }, []);

  const searchFilter = (e: packDbEntry) => {
    // This means only compatible themes will show up, newer ones won't
    if (e.manifest_version > backendVersion) {
      return false;
    }
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

  function downloadCallback(e: packDbEntry, i: number) {
    setInstalling(true);
    installRef.current = i;
    python.resolve(python.downloadPack(e.id), () => {
      fetchLocalPacks();
      setInstalling(false);
      if (installRef.current === i) installRef.current = -1;
    });
  }

  return (
    <>
      <PanelSectionRow>
        <Focusable style={{ display: "flex", maxWidth: "100%" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              minWidth: "40%",
              maxWidth: "40%",
            }}
          >
            <span>Sort</span>
            <Dropdown
              menuLabel="Sort"
              rgOptions={sortOptions}
              strDefaultLabel="Last Updated (Newest)"
              selectedOption={selectedSort}
              onChange={(e) => setSort(e.data)}
            />
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              minWidth: "40%",
              maxWidth: "40%",
              marginLeft: "auto",
            }}
          >
            <span>Filter</span>
            <Dropdown
              menuLabel="Filter"
              rgOptions={targetOptions}
              strDefaultLabel="All"
              selectedOption={selectedTarget.data}
              onChange={(e) => setTarget(e)}
            />
          </div>
        </Focusable>
      </PanelSectionRow>
      <div style={{ justifyContent: "center", display: "flex" }}>
        <Focusable
          style={{ display: "flex", alignItems: "center", width: "96%" }}
        >
          <div style={{ minWidth: "75%", marginRight: "auto" }}>
            <TextField
              label="Search"
              value={searchFieldValue}
              onChange={(e) => setSearchValue(e.target.value)}
            />
          </div>
          <DialogButton
            onClick={() => {
              reloadPacks();
            }}
            style={{
              maxWidth: "20%",
              height: "50%",
              // marginRight: "auto",
              // marginLeft: "auto",
            }}
          >
            <FaSyncAlt
              style={{ transform: "translate(0, 2px)", marginRight: 8 }}
            />
            <span>Refresh</span>
          </DialogButton>
        </Focusable>
      </div>
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
            return (
              <PackDisplayCard
                data={e}
                i={i}
                installRef={installRef}
                downloadCallback={downloadCallback}
              />
            );
          })}
      </Focusable>
    </>
  );
};
