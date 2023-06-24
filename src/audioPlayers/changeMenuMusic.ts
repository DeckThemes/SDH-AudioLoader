import { Mappings, Pack } from "../classes";

function findMapping(origFileName: string, mappings: Mappings | undefined): string {
  if (mappings && Object.keys(mappings || {}).includes(origFileName)) {
    const randIndex = Math.trunc(Math.random() * mappings[origFileName].length);
    return mappings[origFileName][randIndex];
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
  setGlobalState("selectedMusic", newMusic);

  // Stops the old music
  if (menuMusic !== null) {
    menuMusic.pause();
    menuMusic.currentTime = 0;
    setGlobalState("menuMusic", null);
  }

  // Start the new one, if the user selected a music at all
  if (newMusic !== "None" && gamesRunning.length === 0) {
    const currentPack = soundPacks.find((e) => e.name === newMusic);

    const musicFilePath = createFullPath(
      findMapping("menu_music.mp3", currentPack?.mappings),
      currentPack?.truncatedPackPath
    );
    const introFilePath = createFullPath(
      findMapping("intro_music.mp3", currentPack?.mappings),
      currentPack?.truncatedPackPath
    );

    let newMenuMusic: HTMLAudioElement;

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
      newMenuMusic.volume = musicVolume;
      newMenuMusic.play();
      createWindowObject(newMenuMusic);
    } else {
      newMenuMusic = new Audio(musicFilePath);
      playAndLoopMenuMusic();
    }

    function playAndLoopMenuMusic(wasFromIntro: boolean = false) {
      newMenuMusic.play();
      newMenuMusic.loop = true;
      // If someone has changed the volume before the intro ended, this would overwrite it with the original as this function does not have up to date data
      if (!wasFromIntro) {
        newMenuMusic.volume = musicVolume;
      }
      createWindowObject(newMenuMusic);
    }

    // Self explanatory, just extracted it to a function so that I can run it once on the intro, and once on the menu music
    // TODO: Not actually sure if it needs to be set the 2nd time
    function createWindowObject(menuMusic: HTMLAudioElement) {
      const setVolume = (value: number) => {
        menuMusic.volume = value;
      };
      // @ts-ignore
      window.AUDIOLOADER_MENUMUSIC = {
        play: menuMusic.play.bind(menuMusic),
        pause: menuMusic.pause.bind(menuMusic),
        origVolume: menuMusic.volume,
        // @ts-ignore
        setVolume: setVolume.bind(this),
      };
      setGlobalState("menuMusic", menuMusic);
    }
  }
}
