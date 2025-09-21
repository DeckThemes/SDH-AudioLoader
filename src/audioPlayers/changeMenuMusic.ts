import { DeckSound, Mappings, Pack } from "../classes";

export interface MenuMusicController {
  play(): void;
  pause(): void;
  destroy(): void;
  volume: number;
  currentTime: number;
}

class WebAudioMenuMusic implements MenuMusicController {
  private context: AudioContext;
  private gainNode: GainNode;
  private source: AudioBufferSourceNode | null = null;
  private mainBuffer: AudioBuffer;
  private introBuffer: AudioBuffer | null;
  private isPlaying: boolean = false;
  private startedAtSec: number = 0;
  private offsetSec: number = 0;
  private currentTrack: "intro" | "main";

  constructor(
    context: AudioContext,
    gainNode: GainNode,
    mainBuffer: AudioBuffer,
    introBuffer: AudioBuffer | null,
    initialVolume: number
  ) {
    this.context = context;
    this.gainNode = gainNode;
    this.mainBuffer = mainBuffer;
    this.introBuffer = introBuffer;
    this.currentTrack = introBuffer ? "intro" : "main";
    this.gainNode.gain.value = initialVolume;

    // Start immediately
    this.startCurrentTrack();
  }

  private get activeBuffer(): AudioBuffer {
    return this.currentTrack === "intro" && this.introBuffer ? this.introBuffer : this.mainBuffer;
  }

  private startCurrentTrack() {
    // Stop exiting source (like going from intro to main)
    if (this.source) {
      try {
        this.source.onended = null;
        this.source.stop();
      } catch {}
      try {
        this.source.disconnect();
      } catch {}
      this.source = null;
    }

    const buffer = this.activeBuffer;
    const bufferSource = this.context.createBufferSource();
    bufferSource.buffer = buffer;
    bufferSource.loop = this.currentTrack === "main";
    bufferSource.connect(this.gainNode);

    if (this.currentTrack === "intro") {
      bufferSource.onended = () => {
        // Move to main, reset offset, and start looping
        this.currentTrack = "main";
        this.offsetSec = 0;
        this.startCurrentTrack();
      };
    }

    const offset = Math.max(0, this.offsetSec % buffer.duration);
    bufferSource.start(0, offset);

    this.source = bufferSource;
    this.startedAtSec = this.context.currentTime;
    this.isPlaying = true;
  }

  play(): void {
    if (this.isPlaying) return;
    this.startCurrentTrack();
  }

  pause(): void {
    if (!this.isPlaying) return;
    // accumulate offset elapsed since start
    this.offsetSec =
      (this.offsetSec + (this.context.currentTime - this.startedAtSec)) %
      this.activeBuffer.duration;
    try {
      this.source?.stop();
    } catch {}
    this.source = null;
    this.isPlaying = false;
  }

  destroy(): void {
    try {
      this.source?.stop();
    } catch {}
    try {
      this.source?.disconnect();
    } catch {}
    try {
      this.gainNode.disconnect();
    } catch {}
    try {
      this.context.close();
    } catch {}
    this.isPlaying = false;
  }

  get volume(): number {
    return this.gainNode.gain.value;
  }

  set volume(value: number) {
    this.gainNode.gain.setValueAtTime(value, this.context.currentTime + 0.01);
  }

  get currentTime(): number {
    if (this.isPlaying) {
      return (
        (this.offsetSec + (this.context.currentTime - this.startedAtSec)) %
        this.activeBuffer.duration
      );
    }
    return this.offsetSec % this.activeBuffer.duration;
  }

  set currentTime(value: number) {
    const buffer = this.activeBuffer;
    // Clamp to [0, duration)
    const clamped = Math.max(0, Math.min(buffer.duration - 0.000001, value));
    this.offsetSec = clamped;
    if (this.isPlaying) {
      this.startCurrentTrack();
    }
  }
}

function findMapping(origFileName: DeckSound, mappings: Mappings | undefined): string {
  if (!mappings) return origFileName;
  const typedMap = mappings as Partial<Record<DeckSound, string[]>>;
  const candidates = typedMap[origFileName];
  if (candidates && candidates.length > 0) {
    const randIndex = Math.trunc(Math.random() * candidates.length);
    return candidates[randIndex];
  }
  return origFileName;
}

function createFullPath(fileName: string, truncatedPackPath: string | undefined) {
  return `/sounds_custom/${truncatedPackPath || "error"}/${fileName}`;
}

export async function changeMenuMusic(
  newMusic: string,
  menuMusic: MenuMusicController | null,
  setGlobalState: (key: string, value: any) => void,
  gamesRunning: any,
  soundPacks: Pack[],
  musicVolume: number
) {
  setGlobalState("selectedMusic", newMusic);

  // Stop and clear the old music
  if (menuMusic !== null) {
    try {
      menuMusic.pause();
      menuMusic.currentTime = 0;
      // Cleanup audio resources if available
      // @ts-ignore
      if (typeof menuMusic.destroy === "function") menuMusic.destroy();
    } catch {}
    setGlobalState("menuMusic", null);
  }

  // Start the new one, if the user selected a music at all
  if (newMusic !== "None" && gamesRunning.length === 0) {
    const currentPack = soundPacks.find((e) => e.name === newMusic);
    if (!currentPack) return;

    const musicFilePath = createFullPath(
      findMapping("menu_music.mp3", currentPack?.mappings),
      currentPack?.truncatedPackPath
    );
    const introFilePath = createFullPath(
      findMapping("intro_music.mp3", currentPack?.mappings),
      currentPack?.truncatedPackPath
    );

    // Prepare Web Audio graph
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const musicGain = new GainNode(audioContext, { gain: musicVolume });
    musicGain.connect(audioContext.destination);

    const fetchAndDecode = async (url: string): Promise<AudioBuffer> => {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      return await audioContext.decodeAudioData(arrayBuffer);
    };

    // Load buffers
    const [mainBuffer, maybeIntroBuffer] = await Promise.all([
      fetchAndDecode(musicFilePath),
      currentPack?.hasIntro ? fetchAndDecode(introFilePath) : Promise.resolve(null as any),
    ]);

    const controller = new WebAudioMenuMusic(
      audioContext,
      musicGain,
      mainBuffer,
      currentPack?.hasIntro ? maybeIntroBuffer : null,
      musicVolume
    );

    // Expose controls on window for debugging/external control
    // @ts-ignore
    window.AUDIOLOADER_MENUMUSIC = {
      play: controller.play.bind(controller),
      pause: controller.pause.bind(controller),
      origVolume: musicVolume,
      setVolume: (value: number) => {
        controller.volume = value;
        // Keep a live volume property for convenience
        // @ts-ignore
        window.AUDIOLOADER_MENUMUSIC.volume = value;
      },
      volume: musicVolume,
    };

    setGlobalState("menuMusic", controller);
  }
}
