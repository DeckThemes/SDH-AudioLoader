import { Pack } from "../classes";

export function changeMenuMusic(
  newMusic: string,
  menuMusic: HTMLAudioElement | null,
  setGlobalState: (key: string, value: any) => void,
  gamesRunning: any,
  soundPacks: Pack[],
  musicVolume: number
) {
  setGlobalState("selectedMusic", newMusic);
  if (menuMusic !== null) {
    menuMusic.pause();
    menuMusic.currentTime = 0;
    setGlobalState("menuMusic", null);
  }
  // This makes sure if you are in a game, music doesn't start playing
  if (newMusic !== "None" && gamesRunning.length === 0) {
    const currentPack = soundPacks.find((e) => e.name === newMusic);
    let musicFileName = "menu_music.mp3";
    if (Object.keys(currentPack?.mappings || {}).includes("menu_music.mp3")) {
      const randIndex = Math.trunc(
        Math.random() * currentPack?.mappings["menu_music.mp3"].length
      );
      musicFileName = currentPack?.mappings["menu_music.mp3"][randIndex];
    }
    const newMenuMusic = new Audio(
      `/sounds_custom/${
        currentPack?.truncatedPackPath || "error"
      }/${musicFileName}`
    );
    newMenuMusic.play();
    newMenuMusic.loop = true;
    newMenuMusic.volume = musicVolume;
    const setVolume = (value: number) => {
      newMenuMusic.volume = value;
    };
    // Update menuMusic in globalState after every change so that it reflects the changes the next time it checks
    // @ts-ignore
    window.AUDIOLOADER_MENUMUSIC = {
      play: newMenuMusic.play.bind(newMenuMusic),
      pause: newMenuMusic.pause.bind(newMenuMusic),
      origVolume: newMenuMusic.volume,
      setVolume: setVolume.bind(this),
    };
    setGlobalState("menuMusic", newMenuMusic);
  }
}
