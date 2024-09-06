import * as python from "../python";
import { ToggleField } from "decky-frontend-lib";
import { useGlobalState } from "../state";
import { useState } from "react";

export function LegacyDropdown() {
  const { legacyEnabled, setGlobalState } = useGlobalState();

  const [loading, setLoading] = useState(false);

  function handleCheck(checked: boolean) {
    setLoading(true);
    python.resolve(python.storeWrite("legacyEnabled", checked ? "true" : "false"), () => {
      setLoading(false);
      setGlobalState("legacyEnabled", checked);
    });
  }

  return (
    <ToggleField
      label="Enable Legacy Features"
      description="Legacy features are unsupported by Audio Loader maintainers. They may break at any time. Issues should be reported on our GitHub. Please do not reach out to us on Discord regarding legacy feature issues."
      disabled={loading}
      checked={legacyEnabled}
      onChange={handleCheck}
    />
  );
}
