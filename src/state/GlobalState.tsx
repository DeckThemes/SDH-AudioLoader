import { SingleDropdownOption } from "decky-frontend-lib";
import { createContext, FC, useContext, useEffect, useState } from "react";
import { Pack, packDbEntry } from "../classes";

interface PublicGlobalState {
  activeSound: string;
  soundPacks: Pack[];
  musicEnabled: boolean;
  musicLibraryOnly: boolean;
  browserPackList: packDbEntry[];
  searchFieldValue: string;
  selectedSort: number;
  selectedTarget: SingleDropdownOption;
  isInstalling: boolean;
}

// The localThemeEntry interface refers to the theme data as given by the python function, the Theme class refers to a theme after it has been formatted and the generate function has been added

interface PublicGlobalStateContext extends PublicGlobalState {
  setActiveSound(value: string): void;
  setSoundPacks(packArr: Pack[]): void;
  setMusicEnabled(value: boolean): void;
  setMusicLibraryOnly(value: boolean): void;
  setBrowserPackList(packArr: packDbEntry[]): void;
  setSearchValue(value: string): void;
  setSort(value: number): void;
  setTarget(value: SingleDropdownOption): void;
  setInstalling(bool: boolean): void;
}

// This class creates the getter and setter functions for all of the global state data.
export class GlobalState {
  private activeSound: string = "Default";
  private soundPacks: Pack[] = [];
  private musicEnabled: boolean = false;
  private musicLibraryOnly: boolean = false;
  private browserPackList: packDbEntry[] = [];
  private searchFieldValue: string = "";
  private selectedSort: number = 3;
  private selectedTarget: SingleDropdownOption = {
    data: 1,
    label: "All",
  };
  private isInstalling: boolean = false;

  // You can listen to this eventBus' 'stateUpdate' event and use that to trigger a useState or other function that causes a re-render
  public eventBus = new EventTarget();

  getPublicState() {
    return {
      activeSound: this.activeSound,
      soundPacks: this.soundPacks,
      musicEnabled: this.musicEnabled,
      musicLibraryOnly: this.musicLibraryOnly,
      browserPackList: this.browserPackList,
      searchFieldValue: this.searchFieldValue,
      selectedSort: this.selectedSort,
      selectedTarget: this.selectedTarget,
      isInstalling: this.isInstalling,
    };
  }

  setActiveSound(value: string) {
    this.activeSound = value;
    this.forceUpdate();
  }

  setSoundPacks(packArr: Pack[]) {
    // This formats the raw data grabbed by python into the Pack class format
    let list: Pack[] = [];
    packArr.forEach((e: any) => {
      let entry = new Pack();
      entry.data = e;
      list.push(entry);
    });
    list.forEach((e) => e.init());

    this.soundPacks = list;
    this.forceUpdate();
  }

  setMusicEnabled(value: boolean) {
    this.musicEnabled = value;
    this.forceUpdate();
  }

  setMusicLibraryOnly(value: boolean) {
    this.musicLibraryOnly = value;
    this.forceUpdate();
  }

  setBrowserPackList(packArr: packDbEntry[]) {
    this.browserPackList = packArr;
    this.forceUpdate();
  }

  setSearchValue(value: string) {
    this.searchFieldValue = value;
    this.forceUpdate();
  }

  setSort(value: number) {
    this.selectedSort = value;
    this.forceUpdate();
  }

  setTarget(value: SingleDropdownOption) {
    this.selectedTarget = value;
    this.forceUpdate();
  }

  setInstalling(bool: boolean) {
    this.isInstalling = bool;
    this.forceUpdate();
  }

  private forceUpdate() {
    this.eventBus.dispatchEvent(new Event("stateUpdate"));
  }
}

const GlobalStateContext = createContext<PublicGlobalStateContext>(null as any);
export const useGlobalState = () => useContext(GlobalStateContext);

interface ProviderProps {
  globalStateClass: GlobalState;
}

// This is a React Component that you can wrap multiple separate things in, as long as they both have used the same instance of the CssLoaderState class, they will have synced state
export const GlobalStateContextProvider: FC<ProviderProps> = ({
  children,
  globalStateClass,
}) => {
  const [publicState, setPublicState] = useState<PublicGlobalState>({
    ...globalStateClass.getPublicState(),
  });

  useEffect(() => {
    function onUpdate() {
      setPublicState({ ...globalStateClass.getPublicState() });
    }

    globalStateClass.eventBus.addEventListener("stateUpdate", onUpdate);

    return () =>
      globalStateClass.eventBus.removeEventListener("stateUpdate", onUpdate);
  }, []);

  const setActiveSound = (value: string) =>
    globalStateClass.setActiveSound(value);
  const setSoundPacks = (packArr: Pack[]) =>
    globalStateClass.setSoundPacks(packArr);
  const setMusicEnabled = (value: boolean) =>
    globalStateClass.setMusicEnabled(value);
  const setMusicLibraryOnly = (value: boolean) =>
    globalStateClass.setMusicLibraryOnly(value);
  const setBrowserPackList = (packArr: packDbEntry[]) =>
    globalStateClass.setBrowserPackList(packArr);
  const setSearchValue = (value: string) =>
    globalStateClass.setSearchValue(value);
  const setSort = (value: number) => globalStateClass.setSort(value);
  const setTarget = (value: SingleDropdownOption) =>
    globalStateClass.setTarget(value);
  const setInstalling = (bool: boolean) => globalStateClass.setInstalling(bool);

  return (
    <GlobalStateContext.Provider
      value={{
        ...publicState,
        setActiveSound,
        setSoundPacks,
        setMusicEnabled,
        setMusicLibraryOnly,
        setBrowserPackList,
        setSearchValue,
        setSort,
        setTarget,
        setInstalling,
      }}
    >
      {children}
    </GlobalStateContext.Provider>
  );
};
