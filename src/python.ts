// Code from https://github.com/NGnius/PowerTools/blob/dev/src/python.ts
import { ServerAPI } from "decky-frontend-lib";
import { Pack } from "./classes";
import { GlobalState } from "./state/GlobalState";

var server: ServerAPI | undefined = undefined;
var globalState: GlobalState | undefined = undefined;

export function setServer(s: ServerAPI) {
  server = s;
}
export function setStateClass(s: GlobalState): void {
  globalState = s;
}

export function toast(title: string, message: string) {
  // This is a weirdo self-invoking function, but it works.
  return (() => {
    try {
      return server?.toaster.toast({
        title: title,
        body: message,
        duration: 8000,
      });
    } catch (e) {
      console.log("CSSLoader Toaster Error", e);
    }
  })();
}

export function resolve(promise: Promise<any>, setter: any) {
  (async function () {
    let data = await promise;
    if (data.success) {
      console.debug("Got resolved", data, "promise", promise);
      setter(data.result);
    } else {
      console.warn("Resolve failed:", data, "promise", promise);
    }
  })();
}

export function execute(promise: Promise<any>) {
  (async function () {
    let data = await promise;
    if (data.success) {
      console.debug("Got executed", data, "promise", promise);
    } else {
      console.warn("Execute failed:", data, "promise", promise);
    }
  })();
}

export function getAndSetSoundPacks(): Promise<any> {
  const setGlobalState = globalState!.setGlobalState.bind(globalState);
  return server!
    .callPluginMethod<{}, Pack[]>("get_sound_packs", {})
    .then((data) => {
      if (data.success) {
        console.log(data.result);
        setGlobalState("soundPacks", data.result);
      }
    });
}

// getSoundPacks just fetches the packs already stored in python memory, you need to call this reload function to re-fetch the folder list
export function reloadBackend(): Promise<void> {
  return server!
    .callPluginMethod("parse_packs", {
      packsDir: "/home/deck/homebrew/sounds",
    })
    .then(() => {
      getAndSetSoundPacks();
    });
}

export function dummyFuncTest(): void {
  const setGlobalState = globalState!.setGlobalState.bind(globalState);
  server!.callPluginMethod<{}, boolean>("dummy_function", {}).then((res) => {
    if (res.success) {
      setGlobalState("dummyFuncResult", res.result);
      return;
    }
    setGlobalState("dummyFuncResult", false);
  });
}

export async function getBackendVersion(): Promise<any> {
  return server!.callPluginMethod("get_loader_version", {});
}

export async function fetchPackDb(): Promise<any> {
  return server!.fetchNoCors("https://api.deckthemes.com/themes/legacy/audio", {
    method: "GET",
  });
}

export function downloadThemeFromUrl(themeId: string): Promise<any> {
  const { apiUrl } = globalState!.getPublicState();
  return server!.callPluginMethod("download_theme_from_url", {
    id: themeId,
    url: apiUrl,
  });
}

export function storeRead(key: string) {
  return server!.callPluginMethod("store_read", { key: key });
}

export function storeWrite(key: string, value: string) {
  return server!.callPluginMethod("store_write", { key: key, val: value });
}

export function downloadPack(uuid: string): Promise<any> {
  return server!.callPluginMethod("download_pack", { uuid: uuid });
}

export function deletePack(name: string): Promise<any> {
  return server!.callPluginMethod("delete_pack", { name: name });
}

export function getConfig(): Promise<any> {
  return server!.callPluginMethod("get_config", {});
}

export function setConfig(configObj: object) {
  return server!.callPluginMethod("set_config", { configObj: configObj });
}

export function dummyFunction(): Promise<any> {
  return server!.callPluginMethod("dummy_function", {});
}
