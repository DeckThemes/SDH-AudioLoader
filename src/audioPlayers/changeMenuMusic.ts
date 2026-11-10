import { Mappings, Pack } from "../classes";
import * as python from "../python";
import { announceMusic } from "./nowPlaying";
import { rememberMusic } from "./dailyMusic";
import { applyMusicVolume, cachedMusicGain, loudnessSettings, normalizeMusic } from "./loudness";
import { setMusicLowPassPlayer } from "./lowPass";
import { fadeInMusic, fadeOutMusic, setFadePlayer } from "./fade";

// Other plugins can pause the music through window.AUDIOLOADER_MENUMUSIC. The music guard must
// not fight them, so a pause made that way is remembered here until play() is called again or
// new music is started.
// lastGameEventAt: when a game last started or stopped. Timers are slowed down while a game runs,
// and the music guard must not mistake that for the Deck waking up from sleep.
// pausedByLimit: the music was paused on purpose by Battery Saver or the Sleep Timer (limits.ts).
export const menuMusicControl = {
  pausedByOtherPlugin: false,
  pausedByLimit: null as null | "battery" | "sleepTimer",
  waitingForMovie: false,
  lastGameEventAt: 0,
};

// A refused play() would otherwise disappear silently, so write it to the log
function reportPlayError(error: any) {
  python.logEvent(`The music player refused to play: ${error}`);
}

// The last file used for each pack, so a pack with several songs does not pick the same one twice
const lastFileUsed: Record<string, string> = {};

function findMapping(
  origFileName: string,
  mappings: Mappings | undefined,
  packKey: string = ""
): string {
  if (mappings && Object.keys(mappings || {}).includes(origFileName)) {
    const mappedFiles: string[] = mappings[origFileName as keyof Mappings];
    const key = `${packKey}/${origFileName}`;
    const others = mappedFiles.filter((f) => f !== lastFileUsed[key]);
    const pool = others.length > 0 ? others : mappedFiles;
    const picked = pool[Math.trunc(Math.random() * pool.length)];
    lastFileUsed[key] = picked;
    return picked;
  }
  return origFileName;
}

function createFullPath(fileName: string, truncatedPackPath: string | undefined) {
  return `/sounds_custom/${truncatedPackPath || "error"}/${fileName}`;
}

export function changeMenuMusic(
  newMusic: string,
  menuMusic: HTMLAudioElement | null,
  setGlobalState: (key: string, value: any) => void,
  gamesRunning: any,
  soundPacks: Pack[],
  musicVolume: number
) {
  menuMusicControl.pausedByOtherPlugin = false;
  // Choosing or restarting music on purpose ends a Sleep Timer pause (Battery Saver stays)
  if (menuMusicControl.pausedByLimit === "sleepTimer") menuMusicControl.pausedByLimit = null;
  setGlobalState("selectedMusic", newMusic);

  // Stops the old music. With "Smooth Fades" on, it fades out while the new music fades in.
  if (menuMusic !== null) {
    const old = menuMusic;
    setGlobalState("menuMusic", null);
    const stopOld = () => {
      old.pause();
      old.currentTime = 0;
    };
    if (!old.paused && !old.ended) fadeOutMusic(old, stopOld);
    else stopOld();
  }

  // Start the new one, if the user selected a music at all
  if (newMusic !== "None" && gamesRunning.length === 0) {
    const currentPack = soundPacks.find((e) => e.name === newMusic);

    const musicFileName = findMapping(
      "menu_music.mp3",
      currentPack?.mappings,
      currentPack?.truncatedPackPath
    );
    const musicFilePath = createFullPath(musicFileName, currentPack?.truncatedPackPath);
    const introFilePath = createFullPath(
      findMapping("intro_music.mp3", currentPack?.mappings, currentPack?.truncatedPackPath),
      currentPack?.truncatedPackPath
    );

    let newMenuMusic: HTMLAudioElement;

    // "Normalize Music Volume": the gain of this pack's music, if it was measured before
    const musicGain = cachedMusicGain(currentPack?.truncatedPackPath, musicFileName);

    // If there is an intro, it must play that, and add an onended listener to change to the normal music
    // If there's no intro, it can just go straight to playAndLoopMenuMusic()
    if (currentPack?.hasIntro) {
      function handleIntroEnd() {
        newMenuMusic.currentTime = 0;
        newMenuMusic.src = musicFilePath;
        newMenuMusic.onended = null;
        playAndLoopMenuMusic();
      }
      newMenuMusic = new Audio(introFilePath);
      newMenuMusic.onended = handleIntroEnd;
      (newMenuMusic as any).alGain = musicGain;
      applyMusicVolume(newMenuMusic, musicVolume);
      newMenuMusic.play().catch(reportPlayError);
      createWindowObject(newMenuMusic);
    } else {
      newMenuMusic = new Audio(musicFilePath);
      (newMenuMusic as any).alGain = musicGain;
      playAndLoopMenuMusic();
    }

    // "Show Now Playing": tell which pack the music comes from
    announceMusic(currentPack);
    rememberMusic(currentPack?.name);
    // "Smooth Fades": the new music rises from silence
    fadeInMusic(newMenuMusic);

    // Measure this music (once) if it is not known yet, and fix its volume when that is done
    if (loudnessSettings.music && currentPack) {
      normalizeMusic(newMenuMusic, currentPack.truncatedPackPath, musicFileName);
    }

    function playAndLoopMenuMusic(wasFromIntro: boolean = false) {
      newMenuMusic.play().catch(reportPlayError);
      newMenuMusic.loop = true;
      // If someone has changed the volume before the intro ended, this would overwrite it with the original as this function does not have up to date data
      if (!wasFromIntro) {
        applyMusicVolume(newMenuMusic, musicVolume);
      }
      createWindowObject(newMenuMusic);
    }

    // Self explanatory, just extracted it to a function so that I can run it once on the intro, and once on the menu music
    // TODO: Not actually sure if it needs to be set the 2nd time
    function createWindowObject(menuMusic: HTMLAudioElement) {
      const setVolume = (value: number) => {
        applyMusicVolume(menuMusic, value);
      };
      // @ts-ignore
      window.AUDIOLOADER_MENUMUSIC = {
        play: () => {
          menuMusicControl.pausedByOtherPlugin = false;
          return menuMusic.play();
        },
        pause: () => {
          menuMusicControl.pausedByOtherPlugin = true;
          menuMusic.pause();
        },
        origVolume: menuMusic.volume,
        // @ts-ignore
        setVolume: setVolume.bind(this),
      };
      setMusicLowPassPlayer(menuMusic);
      setFadePlayer(menuMusic);
      setGlobalState("menuMusic", menuMusic);
    }
  }
}
