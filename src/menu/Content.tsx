import {
  ButtonItem,
  DialogButton,
  DropdownItem,
  Focusable,
  PanelSection,
  PanelSectionRow,
  Router,
  ServerAPI,
} from "decky-frontend-lib";
import { useEffect, useMemo, useState, VFC } from "react";
import {
  FaBookOpen,
  FaInfoCircle,
  FaMusic,
  FaPause,
  FaPlay,
  FaSlidersH,
  FaStepForward,
  FaVolumeUp,
} from "react-icons/fa";
import {
  applyMusicVolume,
  BUILD_TAG,
  buildDebugInfo,
  cancelSleepTimer,
  changeMenuMusic,
  configureMusicLowPass,
  endSleepTimerPause,
  formatNotes,
  getTodayKey,
  limitStatusText,
  loudnessSettings,
  menuMusicControl,
  nowPlayingSettings,
  normalizeRunningMusic,
  pauseMusicSmooth,
  pickTodaysMusic,
  playStats,
  previewMusicLowPass,
  refreshEffectVolume,
  resumeMusicSmooth,
  shortCredits,
  skipMusic,
  sleepTimerEndsAt,
  startSleepTimer,
} from "../audioPlayers";
import * as python from "../python";
import { notifySettingsChanged, updateSetting } from "../settings";
import { useSettings } from "./useSettings";
import { GlobalState, useGlobalState } from "../state/GlobalState";
import { ACCENT, cardStyle, FocusButton, Group, Info, Note, PANEL_BORDER, Slider, smallText, showTextWindow, Toggle } from "./parts";
import { checkUpdateOnce, forceUpdateCheck, getUpdateInfo, isNewer } from "./update";

type TabId = "music" | "sounds" | "effects" | "library" | "info";

const TABS: { id: TabId; label: string; icon: JSX.Element }[] = [
  { id: "music", label: "Music", icon: <FaMusic /> },
  { id: "sounds", label: "Sounds", icon: <FaVolumeUp /> },
  { id: "effects", label: "Effects", icon: <FaSlidersH /> },
  { id: "library", label: "Library", icon: <FaBookOpen /> },
  { id: "info", label: "Info", icon: <FaInfoCircle /> },
];

const TabRow: VFC<{ active: TabId; onChange: (id: TabId) => void }> = ({ active, onChange }) => (
  <PanelSectionRow>
    {/* @ts-ignore */}
    <Focusable style={{ display: "flex", gap: "4px", width: "100%" }} flow-children="row">
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <FocusButton
            key={tab.id}
            style={{
              flex: "1 1 0",
              minWidth: 0,
              height: "40px",
              padding: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: isActive ? "#ffffff" : "#a99bc4",
              background: isActive
                ? "linear-gradient(145deg, rgba(120, 70, 190, 0.85), rgba(60, 40, 110, 0.9))"
                : "rgba(40, 32, 70, 0.6)",
              border: isActive ? "1px solid rgba(200, 160, 255, 0.8)" : "1px solid rgba(120, 100, 170, 0.3)",
              borderRadius: "8px",
            }}
            onClick={() => onChange(tab.id)}
          >
            {tab.icon}
          </FocusButton>
        );
      })}
    </Focusable>
  </PanelSectionRow>
);

// ---- Header and Now Playing card ----

const Header: VFC<{ version: string }> = ({ version }) => {
  const settings = useSettings();
  const info = getUpdateInfo();
  const newer = settings.update_check && !!info && !info.error && isNewer(info.latest, version);
  return (
    <PanelSectionRow>
      <div style={{ ...cardStyle, padding: "8px 12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontWeight: 700, color: ACCENT }}>Audio Loader Encore</span>
          <span style={smallText}>v{version || "?"}</span>
        </div>
        {newer && (
          <div style={{ ...smallText, opacity: 1, marginTop: "4px", color: "#9fe3a5" }}>
            Update available: v{info!.latest}. Install it from Decky: "Install Plugin from URL".
          </div>
        )}
      </div>
    </PanelSectionRow>
  );
};

const NowPlayingCard: VFC<{ state: GlobalState }> = ({ state }) => {
  const { menuMusic, selectedMusic, soundPacks, legacyEnabled, gamesRunning } = useGlobalState();
  const settings = useSettings();
  const [, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  // The status line (timers, pauses) changes on its own
  useEffect(() => {
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, []);

  if (!legacyEnabled) return null;
  const pack = soundPacks.find((p) => p.name === selectedMusic);
  const paused = !menuMusic || menuMusic.paused;
  const status = limitStatusText();
  const canControl = selectedMusic !== "None" && gamesRunning.length === 0;

  return (
    <PanelSectionRow>
      <div style={cardStyle}>
        <div style={{ ...smallText, textTransform: "uppercase", letterSpacing: "0.8px", fontSize: "10px", color: ACCENT }}>
          {selectedMusic === "None" ? "No music" : paused ? "Paused" : "Now playing"}
        </div>
        <div style={{ fontSize: "15px", fontWeight: 600, margin: "2px 0", overflowWrap: "anywhere" }}>
          {selectedMusic === "None" ? "Music is off" : selectedMusic}
        </div>
        {selectedMusic !== "None" && <div style={smallText}>{shortCredits(pack?.author)}</div>}
        {gamesRunning.length > 0 && <div style={smallText}>A game is running</div>}
        {status !== "" && <div style={{ ...smallText, color: "#f0c987", opacity: 1 }}>{status}</div>}
        {settings.hide_descriptions ? null : null}
        {canControl && (
          // @ts-ignore
          <Focusable style={{ display: "flex", gap: "8px", marginTop: "8px" }} flow-children="row">
            <DialogButton
              style={{ flex: 1, minWidth: 0, padding: "6px" }}
              onClick={() => {
                if (!menuMusic) return;
                if (menuMusic.paused) {
                  menuMusicControl.pausedByOtherPlugin = false;
                  if (menuMusicControl.pausedByLimit === "sleepTimer") endSleepTimerPause(state);
                  Promise.resolve(resumeMusicSmooth(menuMusic)).catch(() => {});
                } else {
                  menuMusicControl.pausedByOtherPlugin = true;
                  pauseMusicSmooth(menuMusic);
                }
                setTimeout(refresh, 900);
              }}
            >
              {paused ? <FaPlay /> : <FaPause />}
            </DialogButton>
            <DialogButton
              style={{ flex: 1, minWidth: 0, padding: "6px" }}
              onClick={() => {
                menuMusicControl.pausedByOtherPlugin = false;
                skipMusic(state);
                setTimeout(refresh, 600);
              }}
            >
              <FaStepForward />
            </DialogButton>
          </Focusable>
        )}
      </div>
    </PanelSectionRow>
  );
};

// ---- Tabs ----

const PowerGroup: VFC<{ state: GlobalState }> = ({ state }) => {
  const settings = useSettings();
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 15000);
    return () => clearInterval(timer);
  }, []);
  const timerRunning = sleepTimerEndsAt() !== null;
  const stoppedByTimer = menuMusicControl.pausedByLimit === "sleepTimer";
  return (
    <Group id="music-power" title="Battery & Sleep Timer" defaultCollapsed>
      <Toggle
        label="Battery Saver"
        description="Pauses the music when the battery is low and the charger is not connected. It comes back when you charge or the battery recovers."
        checked={settings.battery_saver}
        onChange={(value) => {
          updateSetting("battery_saver", value);
          python.logEvent(`Battery Saver ${value ? "on" : "off"}`);
        }}
      />
      {settings.battery_saver && (
        <Slider
          label={`Pause below ${settings.battery_threshold}%`}
          value={settings.battery_threshold}
          min={5}
          max={50}
          step={5}
          onChange={(value) => updateSetting("battery_threshold", value)}
        />
      )}
      <Slider
        label={`Sleep Timer: ${settings.sleep_timer_minutes} min`}
        description="Stops the music after this time. It comes back when the Deck wakes up, a game closes, or you press Resume."
        value={settings.sleep_timer_minutes}
        min={5}
        max={120}
        step={5}
        onChange={(value) => updateSetting("sleep_timer_minutes", value)}
      />
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          onClick={() => {
            if (stoppedByTimer) endSleepTimerPause(state);
            else if (timerRunning) cancelSleepTimer();
            else startSleepTimer(settings.sleep_timer_minutes);
            setTick((t) => t + 1);
          }}
        >
          {stoppedByTimer
            ? "Resume Music"
            : timerRunning
              ? `Cancel Sleep Timer (${limitStatusText().replace(/^.*Sleep Timer: /, "")})`
              : "Start Sleep Timer"}
        </ButtonItem>
      </PanelSectionRow>
    </Group>
  );
};

const MusicTab: VFC<{ state: GlobalState }> = ({ state }) => {
  const g = useGlobalState();
  const settings = useSettings();
  const {
    legacyEnabled,
    selectedMusic,
    soundPacks,
    menuMusic,
    gamesRunning,
    musicVolume,
    dailyRandomMusic,
    dailyMusicDate,
    dailyMusicPick,
    replayRandomMusic,
    waitForMovie,
    showNowPlaying,
    activeSound,
    soundVolume,
    setGlobalState,
  } = g;

  const musicOptions = useMemo(
    () => [
      { label: "None", data: -1 },
      ...soundPacks
        .filter((e) => e.music)
        .map((p, index) => ({ label: p.name, data: index }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ],
    [soundPacks]
  );
  const todOptions = useMemo(
    () => [
      { label: "Not set (normal rules)", data: -1 },
      ...soundPacks
        .filter((e) => e.music)
        .map((p, index) => ({ label: p.name, data: index }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ],
    [soundPacks]
  );

  const restart = (newMusic: string) =>
    changeMenuMusic(newMusic, menuMusic, (k, v) => setGlobalState(k, v), gamesRunning, soundPacks, musicVolume);

  const saveBase = (extra: object) =>
    python.setConfig({
      selected_pack: activeSound,
      selected_music: selectedMusic,
      sound_volume: soundVolume,
      music_volume: musicVolume,
      legacy_enabled: legacyEnabled,
      ...extra,
    });

  const todDropdown = (label: string, key: "tod_morning" | "tod_afternoon" | "tod_night") => (
    <PanelSectionRow>
      <DropdownItem
        bottomSeparator="none"
        menuLabel={label}
        label={label}
        rgOptions={todOptions}
        selectedOption={todOptions.find((o) => o.label === settings[key])?.data ?? -1}
        onChange={(option) => updateSetting(key, option.data === -1 ? "" : (option.label as string))}
      />
    </PanelSectionRow>
  );

  return (
    <PanelSection>
      <NowPlayingCard state={state} />
      <Toggle
        label="Enable Legacy Features"
        description="Legacy features are unsupported by Audio Loader maintainers. They may break at any time. Issues should be reported on our GitHub. Please do not reach out to us on Discord regarding legacy feature issues."
        checked={legacyEnabled}
        onChange={(value) => {
          setGlobalState("legacyEnabled", value);
          let musicToPlay = selectedMusic;
          if (value && dailyRandomMusic) {
            const choice = pickTodaysMusic(soundPacks, dailyMusicDate, dailyMusicPick, setGlobalState);
            if (choice) musicToPlay = choice.pick;
          }
          python.setConfig({
            selected_pack: activeSound,
            selected_music: musicToPlay,
            sound_volume: soundVolume,
            music_volume: musicVolume,
            legacy_enabled: value,
          });
          restart(value ? musicToPlay : "None");
        }}
      />
      {!legacyEnabled && <Note>Turn this on to use the music features.</Note>}
      {legacyEnabled && (
        <>
          <PanelSectionRow>
            <DropdownItem
              bottomSeparator="none"
              onMenuWillOpen={() => python.reloadBackend()}
              menuLabel="Music Pack"
              label="Music Pack"
              rgOptions={musicOptions}
              selectedOption={musicOptions.find((e) => e.label === selectedMusic)?.data ?? -1}
              onChange={(option) => {
                saveBase({ selected_music: option.label });
                // If the music is picked by hand, that becomes today's music
                if (dailyRandomMusic) {
                  const today = getTodayKey();
                  setGlobalState("dailyMusicDate", today);
                  setGlobalState("dailyMusicPick", option.label);
                  python.setConfig({ daily_music_date: today, daily_music_pick: option.label });
                }
                restart(option.label as string);
              }}
            />
          </PanelSectionRow>
          <Slider
            label="Music Volume"
            value={musicVolume}
            min={0}
            max={1}
            step={0.01}
            icon={<FaMusic style={{ transform: "scale(0.8, 1) translate(-2px, -2px)" }} />}
            onChange={(value) => {
              setGlobalState("musicVolume", value);
              applyMusicVolume(menuMusic, value);
              // @ts-ignore
              if (window.AUDIOLOADER_MENUMUSIC) window.AUDIOLOADER_MENUMUSIC.volume = value;
              saveBase({ music_volume: value });
            }}
          />

          <Group id="music-rotation" title="Rotation">
            <Toggle
              label="New Music Every Day"
              description="Picks a different music pack each day. Choosing None keeps the music off until the next day."
              checked={dailyRandomMusic}
              onChange={(value) => {
                setGlobalState("dailyRandomMusic", value);
                python.setConfig({ daily_random_music: value });
                if (value) {
                  const choice = pickTodaysMusic(soundPacks, "", selectedMusic, setGlobalState);
                  if (choice && choice.pick !== selectedMusic) restart(choice.pick);
                }
              }}
            />
            <Toggle
              label="New Music Every Replay"
              description="Every time the music starts again (when it ends, after a game closes, or after the Deck wakes up), it switches to a different music pack."
              checked={replayRandomMusic}
              onChange={(value) => {
                setGlobalState("replayRandomMusic", value);
                python.setConfig({ random_music_every_replay: value });
              }}
            />
            <Slider
              label={`Variety: ${settings.variety_level === 0 ? "Pure Random" : settings.variety_level + "%"}`}
              description="0 is completely random, so a pack or series can come back soon. Higher avoids recent packs and packs from the same series. At 100 it avoids the last 12 packs and the last 3 series."
              value={settings.variety_level}
              min={0}
              max={100}
              step={10}
              onChange={(value) => updateSetting("variety_level", value)}
            />
            <Toggle
              label="Music by Time of Day"
              description={'Chooses a music pack for the morning (5:00-11:59), afternoon (12:00-17:59) and night (18:00-4:59). It is used when the Deck starts or wakes up, and for replays. A part of the day set to "Not set" follows the normal rules.'}
              checked={settings.tod_enabled}
              onChange={(value) => updateSetting("tod_enabled", value)}
            />
            {settings.tod_enabled && (
              <>
                {todDropdown("Morning", "tod_morning")}
                {todDropdown("Afternoon", "tod_afternoon")}
                {todDropdown("Night", "tod_night")}
              </>
            )}
          </Group>

          <Group id="music-playback" title="Playback">
            <Toggle
              label="Show Now Playing"
              description="Shows a small message with the music pack's name and its credits whenever new music starts."
              checked={showNowPlaying}
              onChange={(value) => {
                nowPlayingSettings.enabled = value;
                setGlobalState("showNowPlaying", value);
                python.setConfig({ show_now_playing: value });
              }}
            />
            <Toggle
              label="Wait for Startup Movie"
              description="When the Deck starts or wakes up, the music waits until the startup or wake-up movie has finished."
              checked={waitForMovie}
              onChange={(value) => {
                setGlobalState("waitForMovie", value);
                python.setConfig({ wait_for_startup_movie: value });
              }}
            />
            <Toggle
              label="Smooth Fades"
              description="The music fades in when it starts, fades out when a game starts or you pause it, and blends into the next music when it changes."
              checked={settings.smooth_fades}
              onChange={(value) => updateSetting("smooth_fades", value)}
            />
            <Toggle
              label="Lower Music for Notifications"
              description="Briefly lowers the music when Steam plays a notification, message or achievement sound."
              checked={settings.duck_notifications}
              onChange={(value) => updateSetting("duck_notifications", value)}
            />
            <Toggle
              label="Soft Start for New Audio Device"
              description="When you connect headphones or a Bluetooth speaker, the music is lowered for a moment so it does not surprise you."
              checked={settings.soft_new_device}
              onChange={(value) => updateSetting("soft_new_device", value)}
            />
          </Group>

          <PowerGroup state={state} />
        </>
      )}
    </PanelSection>
  );
};

const SoundsTab: VFC = () => {
  const { activeSound, soundPacks, soundVolume, musicVolume, selectedMusic, legacyEnabled, normalizeVolume, menuMusic, setGlobalState } =
    useGlobalState();
  const options = useMemo(
    () => [
      { label: "Default", data: -1 },
      ...soundPacks
        .filter((e) => !e.music)
        .map((p, index) => ({ label: p.name, data: index }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ],
    [soundPacks]
  );
  const save = (extra: object) =>
    python.setConfig({
      selected_pack: activeSound,
      selected_music: selectedMusic,
      sound_volume: soundVolume,
      music_volume: musicVolume,
      legacy_enabled: legacyEnabled,
      ...extra,
    });
  return (
    <PanelSection>
      <PanelSectionRow>
        <DropdownItem
          bottomSeparator="none"
          onMenuWillOpen={() => python.reloadBackend()}
          menuLabel="Sound Pack"
          label="Sound Pack"
          rgOptions={options}
          selectedOption={options.find((e) => e.label === activeSound)?.data ?? -1}
          onChange={(option) => {
            setGlobalState("activeSound", option.label as string);
            refreshEffectVolume();
            save({ selected_pack: option.label });
          }}
        />
      </PanelSectionRow>
      <Slider
        label="Sound Volume"
        value={soundVolume}
        min={0}
        max={1}
        step={0.01}
        icon={<FaVolumeUp />}
        onChange={(value) => {
          setGlobalState("soundVolume", value);
          refreshEffectVolume();
          save({ sound_volume: value });
        }}
      />
      <Toggle
        label="Normalize Volume"
        description="Makes every sound pack and music pack about equally loud, so the volume sliders mean the same for all of them. A pack is measured the first time you use it, which takes a few seconds."
        checked={normalizeVolume}
        onChange={(value) => {
          loudnessSettings.enabled = value;
          setGlobalState("normalizeVolume", value);
          python.setConfig({ normalize_volume: value });
          if (menuMusic) {
            applyMusicVolume(menuMusic, musicVolume);
            if (value) normalizeRunningMusic(menuMusic);
          }
          refreshEffectVolume();
        }}
      />
    </PanelSection>
  );
};

const EffectsTab: VFC = () => {
  const { legacyEnabled, lowPassSteamMenu, lowPassQuickAccess, lowPassGameLoading, lowPassStrength, setGlobalState } = useGlobalState();
  const apply = (patch: Partial<{ steamMenu: boolean; quickAccess: boolean; gameLoading: boolean; strength: number }>) =>
    configureMusicLowPass({
      steamMenu: lowPassSteamMenu,
      quickAccess: lowPassQuickAccess,
      gameLoading: lowPassGameLoading,
      strength: lowPassStrength,
      ...patch,
    });
  return (
    <PanelSection>
      {!legacyEnabled && <Info>Turn on Legacy Features (Music tab) to use these.</Info>}
      <Group id="effects-lowpass" title="Muffled Music (Low-Pass Filter)">
        <Note>Muffles the menu music while one of these is active. Sounds and games are not changed.</Note>
        <Toggle
          label="Steam Menu"
          description="While the Steam menu (Steam button) is open."
          checked={lowPassSteamMenu}
          onChange={(value) => {
            setGlobalState("lowPassSteamMenu", value);
            apply({ steamMenu: value });
            python.setConfig({ low_pass_steam_menu: value });
          }}
        />
        <Toggle
          label="Quick Access Menu (...)"
          description="While the Quick Access (...) menu is open."
          checked={lowPassQuickAccess}
          onChange={(value) => {
            setGlobalState("lowPassQuickAccess", value);
            apply({ quickAccess: value });
            python.setConfig({ low_pass_quick_access: value });
          }}
        />
        <Toggle
          label="Game Loading"
          description="From the moment you press play on a game until the game has started."
          checked={lowPassGameLoading}
          onChange={(value) => {
            setGlobalState("lowPassGameLoading", value);
            apply({ gameLoading: value });
            python.setConfig({ low_pass_game_loading: value });
          }}
        />
        <Slider
          label={`Filter Strength: ${lowPassStrength}%`}
          description="Higher is more muffled. You hear the filter for a moment when you move this."
          value={lowPassStrength}
          min={0}
          max={100}
          step={1}
          icon={<FaMusic />}
          onChange={(value) => {
            setGlobalState("lowPassStrength", value);
            apply({ strength: value });
            previewMusicLowPass();
            python.setConfig({ low_pass_strength: value });
          }}
        />
      </Group>
    </PanelSection>
  );
};

const LibraryTab: VFC = () => {
  const { soundPacks } = useGlobalState();
  const settings = useSettings();
  const [picked, setPicked] = useState<string>("");
  const musicNames = useMemo(
    () => soundPacks.filter((p) => p.music).map((p) => p.name).sort((a, b) => a.localeCompare(b)),
    [soundPacks]
  );
  const options = useMemo(() => musicNames.map((n, i) => ({ label: n, data: i })), [musicNames]);
  const current = musicNames.includes(picked) ? picked : musicNames[0] ?? "";
  const isFavorite = settings.favorite_music.includes(current);
  const isBlocked = settings.blocked_music.includes(current);
  const toggleIn = (list: string[], name: string, on: boolean) =>
    on ? Array.from(new Set([...list, name])) : list.filter((n) => n !== name);
  const most = playStats(soundPacks, 5, "most");
  const least = playStats(soundPacks, 5, "least");
  const names = (list: string[]) => {
    const text = list.filter((n) => musicNames.includes(n)).join(", ");
    return text === "" ? "none" : text.length > 140 ? text.slice(0, 137) + "..." : text;
  };

  return (
    <PanelSection>
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          onClick={() => {
            Router.CloseSideMenus();
            Router.Navigate("/audiopack-manager");
          }}
        >
          Manage Packs
        </ButtonItem>
      </PanelSectionRow>

      <Group id="library-favorites" title="Favorites & Blocked">
        <Note>Favorites come up 3 times as often. Blocked packs are never picked automatically, but you can still choose them by hand.</Note>
        {musicNames.length === 0 ? (
          <Info>No music packs are installed.</Info>
        ) : (
          <>
            <PanelSectionRow>
              <DropdownItem
                bottomSeparator="none"
                menuLabel="Music Pack"
                label="Music Pack"
                rgOptions={options}
                selectedOption={options.find((o) => o.label === current)?.data ?? 0}
                onChange={(option) => setPicked(option.label as string)}
              />
            </PanelSectionRow>
            <Toggle
              label="Favorite"
              checked={isFavorite}
              onChange={(value) => {
                updateSetting("favorite_music", toggleIn(settings.favorite_music, current, value));
                if (value && isBlocked) updateSetting("blocked_music", toggleIn(settings.blocked_music, current, false));
              }}
            />
            <Toggle
              label="Never Pick Automatically"
              checked={isBlocked}
              onChange={(value) => {
                updateSetting("blocked_music", toggleIn(settings.blocked_music, current, value));
                if (value && isFavorite) updateSetting("favorite_music", toggleIn(settings.favorite_music, current, false));
              }}
            />
            <Info>Favorites: {names(settings.favorite_music)}</Info>
            <Info>Blocked: {names(settings.blocked_music)}</Info>
          </>
        )}
      </Group>

      <Group id="library-stats" title="Play Stats" defaultCollapsed>
        <Info>
          <b>Most played</b>
          {most.length === 0 ? <div>Nothing played yet.</div> : most.map(([n, c]) => <div key={n}>{c}x  {n}</div>)}
        </Info>
        <Info>
          <b>Least played</b>
          {least.length === 0 ? <div>No music packs.</div> : least.map(([n, c]) => <div key={n}>{c}x  {n}</div>)}
        </Info>
      </Group>
    </PanelSection>
  );
};

const InfoTab: VFC<{ version: string }> = ({ version }) => {
  const settings = useSettings();
  const g = useGlobalState();
  const [checking, setChecking] = useState(false);
  const info = getUpdateInfo();

  const updateText = () => {
    if (checking) return "Checking...";
    if (!info) return "Not checked yet.";
    if (info.error) return "Could not check (no internet?).";
    return isNewer(info.latest, version) ? `Update available: v${info.latest}` : `You have the newest version (v${info.latest}).`;
  };

  const debugText = () =>
    buildDebugInfo({
      version,
      buildTag: BUILD_TAG,
      legacyEnabled: g.legacyEnabled,
      selectedMusic: g.selectedMusic,
      musicPlaying: !!g.menuMusic && !g.menuMusic.paused,
      gamesRunning: g.gamesRunning.length,
      packCount: g.soundPacks.filter((p) => p.music).length,
      toggles: {
        daily: g.dailyRandomMusic,
        everyReplay: g.replayRandomMusic,
        nowPlaying: g.showNowPlaying,
        waitForMovie: g.waitForMovie,
        normalize: g.normalizeVolume,
        lowPass: [g.lowPassSteamMenu, g.lowPassQuickAccess, g.lowPassGameLoading, g.lowPassStrength],
      },
      extra: { status: limitStatusText() },
    });

  const notes = formatNotes(8);

  return (
    <PanelSection>
      <Group id="info-updates" title="Updates">
        <Info>Installed: v{version || "?"} ({BUILD_TAG})</Info>
        <Info>{updateText()}</Info>
        <PanelSectionRow>
          <ButtonItem
            layout="below"
            disabled={checking}
            onClick={async () => {
              setChecking(true);
              await forceUpdateCheck();
              setChecking(false);
              notifySettingsChanged();
            }}
          >
            Check for Updates
          </ButtonItem>
        </PanelSectionRow>
        <Toggle
          label="Check for Updates Automatically"
          description="Looks at GitHub when the menu opens (at most every 6 hours). Nothing is installed automatically."
          checked={settings.update_check}
          onChange={(value) => updateSetting("update_check", value)}
        />
      </Group>

      <Group id="info-decisions" title="Recent Music Decisions">
        {notes === "" ? (
          <Info>Nothing yet.</Info>
        ) : (
          <PanelSectionRow>
            <div style={{ ...smallText, whiteSpace: "pre-wrap", fontFamily: "monospace", fontSize: "10.5px", width: "100%" }}>{notes}</div>
          </PanelSectionRow>
        )}
      </Group>

      <Group id="info-debug" title="Debug">
        <Note>Copies the settings and the latest music decisions, so you can paste them when reporting a problem.</Note>
        <PanelSectionRow>
          <ButtonItem
            layout="below"
            onClick={async () => {
              const text = debugText();
              python.logEvent("Debug info requested:\n" + text);
              try {
                await navigator.clipboard.writeText(text);
                python.toast("Audio Loader Encore", "Debug info copied.", 3000);
              } catch {
                showTextWindow("Debug info", text);
              }
            }}
          >
            Copy Debug Info
          </ButtonItem>
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => showTextWindow("Debug info", debugText())}>
            Show Debug Info
          </ButtonItem>
        </PanelSectionRow>
      </Group>

      <Toggle
        label="Hide Descriptions"
        description="Hides the small help texts to make the menu shorter."
        checked={settings.hide_descriptions}
        onChange={(value) => updateSetting("hide_descriptions", value)}
      />
    </PanelSection>
  );
};

// ---- The menu ----

let cachedVersion = "";

export const Content: VFC<{ serverAPI: ServerAPI; state: GlobalState }> = ({ state }) => {
  const settings = useSettings();
  const { dummyFuncResult } = useGlobalState();
  const [version, setVersion] = useState(cachedVersion);

  useEffect(() => {
    python.dummyFuncTest();
    if (!cachedVersion) {
      python
        .getPluginVersion()
        .then((r: any) => {
          if (r?.success && typeof r.result === "string") {
            cachedVersion = r.result;
            setVersion(r.result);
          }
        })
        .catch(() => {});
    }
    checkUpdateOnce();
  }, []);

  if (!dummyFuncResult) {
    return (
      <PanelSectionRow>
        <span>
          AudioLoader failed to initialize, try reloading, and if that doesn't work, try restarting your deck.
        </span>
      </PanelSectionRow>
    );
  }

  const tab = (TABS.some((t) => t.id === settings.ui_tab) ? settings.ui_tab : "music") as TabId;
  return (
    <div className="audioloader_QAM">
      <style>
        {`
        .audioloader_QAM div[class^="gamepaddialog_FieldLabel_"] {
          display: none;
        }
        `}
      </style>
      <PanelSection>
        <Header version={version} />
        <TabRow active={tab} onChange={(id) => updateSetting("ui_tab", id)} />
        <PanelSectionRow>
          <div style={{ ...smallText, textTransform: "uppercase", letterSpacing: "1px", fontSize: "10px", color: ACCENT, borderBottom: PANEL_BORDER, paddingBottom: "4px", width: "100%" }}>
            {TABS.find((t) => t.id === tab)!.label}
          </div>
        </PanelSectionRow>
      </PanelSection>
      {tab === "music" && <MusicTab state={state} />}
      {tab === "sounds" && <SoundsTab />}
      {tab === "effects" && <EffectsTab />}
      {tab === "library" && <LibraryTab />}
      {tab === "info" && <InfoTab version={version} />}
    </div>
  );
};
