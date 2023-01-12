import { SingleDropdownOption } from "decky-frontend-lib";
import { createContext, FC, useContext, useEffect, useState } from "react";
import { Pack, packDbEntry } from "../classes";

interface PublicGlobalState {
  menuMusic: any;
  soundPatchInstance: any;
  volumePatchInstance: any;
  gainNode: any;
  soundVolume: number;
  musicVolume: number;
  gamesRunning: Number[];
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
  setGlobalState(key: string, data: any): void;
  getGlobalState(key: string): any;
}

// This class creates the getter and setter functions for all of the global state data.
export class GlobalState {
  private menuMusic: any = null;
  private soundPatchInstance: any = null;
  private volumePatchInstance: any = null;
  private gainNode: any = null;
  private soundVolume: number = 1;
  private musicVolume: number = 0.5;
  private gamesRunning: Number[] = [];
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
      soundPatchInstance: this.soundPatchInstance,
      volumePatchInstance: this.volumePatchInstance,
      gainNode: this.gainNode,
      soundVolume: this.soundVolume,
      musicVolume: this.musicVolume,
      gamesRunning: this.gamesRunning,
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

  getGlobalState(key: string) {
    return this[key];
  }

  setGlobalState(key: string, data: any) {
    this[key] = data;
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

  const getGlobalState = (key: string) => globalStateClass.getGlobalState(key);
  const setGlobalState = (key: string, data: any) =>
    globalStateClass.setGlobalState(key, data);

  return (
    <GlobalStateContext.Provider
      value={{
        ...publicState,
        getGlobalState,
        setGlobalState,
      }}
    >
      {children}
    </GlobalStateContext.Provider>
  );
};
