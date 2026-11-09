import {
  ConfirmModal,
  DialogButton,
  Focusable,
  PanelSectionRow,
  showModal,
  SliderField,
  ToggleField,
} from "decky-frontend-lib";
import { CSSProperties, ReactNode, useState, VFC } from "react";
import { FaChevronDown, FaChevronRight } from "react-icons/fa";
import { updateSetting } from "../settings";
import { useSettings } from "./useSettings";

// Small building blocks for the menu: they hide the description texts when "Hide Descriptions"
// is on, and the groups remember whether they were open or closed.

export const ACCENT = "#c9a0ff";
export const PANEL_BORDER = "1px solid rgba(190, 140, 255, 0.28)";

export const cardStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: PANEL_BORDER,
  borderRadius: "8px",
  background: "linear-gradient(135deg, rgba(58, 30, 88, 0.6), rgba(24, 24, 58, 0.4))",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 2px 6px rgba(0,0,0,0.18)",
  padding: "10px 12px",
};

export const smallText: CSSProperties = { fontSize: "12px", lineHeight: 1.35, opacity: 0.75 };

// A button that shows its own highlight while the controller (or mouse) is on it. Our buttons set
// their own colors, which hides Steam's built-in highlight, so we draw one here.
export const FocusButton: VFC<{
  style: CSSProperties;
  onClick: () => void;
  children: ReactNode;
}> = ({ style, onClick, children }) => {
  const [focused, setFocused] = useState(false);
  const on = () => setFocused(true);
  const off = () => setFocused(false);
  const highlight: CSSProperties = focused
    ? {
        border: "2px solid #ffffff",
        boxShadow: "0 0 0 2px rgba(201, 160, 255, 0.9), 0 0 12px rgba(201, 160, 255, 0.7)",
        filter: "brightness(1.35)",
        transform: "scale(1.03)",
      }
    : {};
  return (
    <DialogButton
      style={{ transition: "all 0.12s ease", ...style, ...highlight }}
      onClick={onClick}
      onFocus={on}
      onBlur={off}
      onGamepadFocus={on}
      onGamepadBlur={off}
    >
      {children}
    </DialogButton>
  );
};

export const Note: VFC<{ children: ReactNode }> = ({ children }) => {
  const s = useSettings();
  if (s.hide_descriptions) return null;
  return (
    <PanelSectionRow>
      <div style={smallText}>{children}</div>
    </PanelSectionRow>
  );
};

export const Info: VFC<{ children: ReactNode }> = ({ children }) => (
  <PanelSectionRow>
    <div style={smallText}>{children}</div>
  </PanelSectionRow>
);

export const Toggle: VFC<{
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}> = ({ label, description, checked, onChange }) => {
  const s = useSettings();
  return (
    <PanelSectionRow>
      <ToggleField
        label={label}
        description={s.hide_descriptions ? undefined : description}
        checked={checked}
        onChange={onChange}
      />
    </PanelSectionRow>
  );
};

export const Slider: VFC<{
  label: string;
  description?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  icon?: JSX.Element;
}> = ({ label, description, value, min, max, step, onChange, icon }) => {
  const s = useSettings();
  return (
    <PanelSectionRow>
      <SliderField
        label={label}
        description={s.hide_descriptions ? undefined : description}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={onChange}
        icon={icon}
      />
    </PanelSectionRow>
  );
};

/** A titled group that can be opened and closed. The choice is remembered. */
export const Group: VFC<{
  id: string;
  title: string;
  defaultCollapsed?: boolean;
  children: ReactNode;
}> = ({ id, title, defaultCollapsed = false, children }) => {
  const s = useSettings();
  const stored = s.ui_collapsed[id];
  const collapsed = stored === undefined ? defaultCollapsed : stored;
  return (
    <>
      <PanelSectionRow>
        <FocusButton
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 10px",
            minWidth: 0,
            background: "rgba(190, 140, 255, 0.1)",
            border: PANEL_BORDER,
            borderRadius: "6px",
            fontSize: "13px",
            fontWeight: 600,
            letterSpacing: "0.3px",
            color: ACCENT,
          }}
          onClick={() => {
            const next = { ...s.ui_collapsed, [id]: !collapsed };
            updateSetting("ui_collapsed", next);
          }}
        >
          {collapsed ? <FaChevronRight size={11} /> : <FaChevronDown size={11} />}
          <span>{title}</span>
        </FocusButton>
      </PanelSectionRow>
      {!collapsed && children}
    </>
  );
};

/** Shows long text (like the debug info) in a window the user can read. */
export function showTextWindow(title: string, text: string): void {
  showModal(
    <ConfirmModal
      bAlertDialog
      strTitle={title}
      strOKButtonText="Close"
      strDescription={
        <div style={{ whiteSpace: "pre-wrap", fontSize: "11px", maxHeight: "60vh", overflow: "auto" }}>{text}</div>
      }
    />
  );
}

export const ButtonRow: VFC<{ children: ReactNode }> = ({ children }) => (
  <PanelSectionRow>
    {/* @ts-ignore */}
    <Focusable style={{ display: "flex", gap: "8px", width: "100%" }} flow-children="row">
      {children}
    </Focusable>
  </PanelSectionRow>
);
