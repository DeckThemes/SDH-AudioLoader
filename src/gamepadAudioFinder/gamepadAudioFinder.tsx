import { Module, findModuleChild } from "decky-frontend-lib";

export const AudioParent = findModuleChild((m: Module) => {
  if (typeof m !== "object") return undefined;
  for (let prop in m) {
    if (m[prop]?.GamepadUIAudio) {
      return m[prop];
    }
  }
});
