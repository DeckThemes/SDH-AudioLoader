// Code from https://github.com/NGnius/PowerTools/blob/dev/src/python.ts
import { ServerAPI } from "decky-frontend-lib";

var server: ServerAPI | undefined = undefined;

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

export function setServer(s: ServerAPI) {
  server = s;
}

export function getSoundPacks(): Promise<any> {
  return server!.callPluginMethod("get_sound_packs", {});
}

export function getConfig(): Promise<any> {
  return server!.callPluginMethod("get_config", {});
}

export function setConfig(configObj: object) {
  return server!.callPluginMethod("set_config", { configObj: configObj });
}
