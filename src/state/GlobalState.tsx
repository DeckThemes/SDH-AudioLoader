import { SingleDropdownOption } from "decky-frontend-lib";
import { createContext, FC, useContext, useEffect, useState } from "react";
import { Pack, packDbEntry } from "../classes";

interface PublicGlobalState {
  menuMusic: any;
  activeSound: string;
  soundPacks: Pack[];
  selectedMusic: string;
  browserPackList: packDbEntry[];
  searchFieldValue: string;
  selectedSort: number;
  selectedTarget: SingleDropdownOption;
  isInstalling: boolean;
}

// The localThemeEntry interface refers to the theme data as given by the python function, the Theme class refers to a theme after it has been formatted and the generate function has been added

interface PublicGlobalStateContext extends PublicGlobalState {
  setMenuMusic(value: any): void;
  setActiveSound(value: string): void;
  setSoundPacks(packArr: Pack[]): void;
  setSelectedMusic(value: string): void;
  setBrowserPackList(packArr: packDbEntry[]): void;
  setSearchValue(value: string): void;
  setSort(value: number): void;
  setTarget(value: SingleDropdownOption): void;
  setInstalling(bool: boolean): void;
}

// This class creates the getter and setter functions for all of the global state data.
export class GlobalState {
  private menuMusic: any = null;
  private activeSound: string = "Default";
  private soundPacks: Pack[] = [];
  private selectedMusic: string = "None";
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
      menuMusic: this.menuMusic,
      activeSound: this.activeSound,
      soundPacks: this.soundPacks,
      selectedMusic: this.selectedMusic,
      browserPackList: this.browserPackList,
      searchFieldValue: this.searchFieldValue,
      selectedSort: this.selectedSort,
      selectedTarget: this.selectedTarget,
      isInstalling: this.isInstalling,
    };
  }

  setMenuMusic(value: any) {
    this.menuMusic = value;
    this.forceUpdate;
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

  setSelectedMusic(value: string) {
    this.selectedMusic = value;
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

  const setMenuMusic = (value: any) => globalStateClass.setMenuMusic(value);
  const setActiveSound = (value: string) =>
    globalStateClass.setActiveSound(value);
  const setSoundPacks = (packArr: Pack[]) =>
    globalStateClass.setSoundPacks(packArr);
  const setSelectedMusic = (value: string) =>
    globalStateClass.setSelectedMusic(value);
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
        setMenuMusic,
        setActiveSound,
        setSoundPacks,
        setSelectedMusic,
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
