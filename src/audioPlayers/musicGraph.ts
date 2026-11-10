import * as python from "../python";

// The Web Audio chain of a menu music player. It is used by "Normalize Music Volume" (which can
// boost quiet music above the normal maximum and evens out loud parts) and by the low-pass filter:
//
//   player -> boost (pack gain) -> leveler (compressor) -> low-pass filter -> volume -> speakers
//
// Once a player is connected to Web Audio it cannot be disconnected from it again (its sound would
// stop), so a player is only connected when one of the options needs it, and only when the audio
// system is running.
//
// The volume node carries the slider volume, the fades and the ducking. All its changes are made
// smoothly on the audio clock, so volume steps and pauses do not click or pop.

export type MusicGraph = {
  element: HTMLAudioElement;
  context: AudioContext;
  source: MediaElementAudioSourceNode;
  boost: GainNode;
  leveler: DynamicsCompressorNode;
  filter: BiquadFilterNode;
  volume: GainNode;
};

const MAX_CUTOFF_HZ = 20000;
// How long a failed start of the audio system waits before it is tried again
const RETRY_MS = 2000;

const graphs = new Map<HTMLAudioElement, MusicGraph>();
const attaching = new Set<HTMLAudioElement>();
// Players that another plugin already connected: never tried again
const refused = new WeakSet<HTMLAudioElement>();
const attachListeners: ((graph: MusicGraph) => void)[] = [];
let sharedContext: AudioContext | null = null;
let lastFailAt = 0;
let unsupportedLogged = false;
let errorLogged = false;

export function musicGraphFor(element: any): MusicGraph | undefined {
  return element ? graphs.get(element) : undefined;
}

export function allMusicGraphs(): MusicGraph[] {
  return Array.from(graphs.values());
}

/** fn is called right after a player was connected (to put the current values on the nodes). */
export function onMusicGraphAttached(fn: (graph: MusicGraph) => void): void {
  attachListeners.push(fn);
}

/** The cutoff that leaves the sound unchanged. */
export function openCutoff(context: BaseAudioContext): number {
  return Math.min(MAX_CUTOFF_HZ, Math.max(1000, context.sampleRate / 2 - 1));
}

/** Moves an audio value smoothly to a new value (about 5 * seconds until it is there). */
export function glide(graph: MusicGraph, param: AudioParam, value: number, seconds: number): void {
  try {
    const now = graph.context.currentTime;
    if (typeof (param as any).cancelAndHoldAtTime === "function") (param as any).cancelAndHoldAtTime(now);
    else param.cancelScheduledValues(now);
    param.setTargetAtTime(value, now, Math.max(0.001, seconds));
  } catch {
    try {
      param.value = value;
    } catch {
      // nothing more to do
    }
  }
}

export function resumeMusicContext(): void {
  const context = sharedContext;
  if (!context || context.state === "running" || context.state === "closed") return;
  try {
    Promise.resolve(context.resume()).catch(() => {});
  } catch {
    // tried again on the next check
  }
}

/** Connects the player to Web Audio (once). Resolves with its chain, or null if that is not possible. */
export async function requestMusicGraph(element: HTMLAudioElement | null): Promise<MusicGraph | null> {
  if (!element) return null;
  const existing = graphs.get(element);
  if (existing) return existing;
  if (attaching.has(element) || refused.has(element)) return null;
  if (Date.now() - lastFailAt < RETRY_MS) return null;
  const AudioContextConstructor = (window as any).AudioContext;
  if (typeof AudioContextConstructor !== "function") {
    if (!unsupportedLogged) {
      unsupportedLogged = true;
      python.logEvent("Music audio chain: Web Audio is not available");
    }
    return null;
  }
  attaching.add(element);
  try {
    const context: AudioContext = sharedContext || new AudioContextConstructor();
    sharedContext = context;
    if (context.state !== "running") {
      try {
        await context.resume();
      } catch {
        // checked right below
      }
    }
    if (context.state !== "running") {
      lastFailAt = Date.now();
      if (!errorLogged) {
        errorLogged = true;
        python.logEvent(`Music audio chain: the audio system is "${context.state}", tried again later`);
      }
      return null;
    }

    const source = context.createMediaElementSource(element);
    const boost = context.createGain();
    const leveler = context.createDynamicsCompressor();
    const filter = context.createBiquadFilter();
    const volume = context.createGain();
    boost.gain.value = 1;
    // Starts as a pass-through: ratio 1 compresses nothing and adds no make-up gain
    leveler.threshold.value = 0;
    leveler.knee.value = 0;
    leveler.ratio.value = 1;
    leveler.attack.value = 0.005;
    leveler.release.value = 0.25;
    filter.type = "lowpass";
    filter.Q.value = 0.70710678;
    filter.frequency.value = openCutoff(context);
    // The player did the volume up to now: the volume node takes over at the same level
    volume.gain.value = Math.max(0, Math.min(1, element.volume));
    source.connect(boost);
    boost.connect(leveler);
    leveler.connect(filter);
    filter.connect(volume);
    volume.connect(context.destination);
    element.volume = 1;
    const graph: MusicGraph = { element, context, source, boost, leveler, filter, volume };
    graphs.set(element, graph);
    python.logEvent("Music audio chain: connected to the music player");
    for (const fn of attachListeners) {
      try {
        fn(graph);
      } catch (error) {
        console.warn("Audio Loader: music chain listener failed", error);
      }
    }
    return graph;
  } catch (error) {
    // Another plugin may already own this player. The normal sound path stays as it was.
    refused.add(element);
    if (!errorLogged) {
      errorLogged = true;
      python.logEvent(`Music audio chain: could not connect to the music player: ${error}`);
    }
    return null;
  } finally {
    attaching.delete(element);
  }
}

function disconnect(graph: MusicGraph): void {
  try {
    graph.source.disconnect();
    graph.boost.disconnect();
    graph.leveler.disconnect();
    graph.filter.disconnect();
    graph.volume.disconnect();
  } catch {
    // the old player may already be gone
  }
  graphs.delete(graph.element);
}

/**
 * Frees the chains of old players. A player that is still fading out keeps its chain until it is
 * paused, so its fade is not cut off.
 */
export function releaseOtherMusicGraphs(current: HTMLAudioElement | null): void {
  for (const graph of Array.from(graphs.values())) {
    if (graph.element === current) continue;
    if (graph.element.paused || graph.element.ended) {
      disconnect(graph);
    } else {
      const el = graph.element;
      const onPause = () => {
        el.removeEventListener("pause", onPause);
        const g = graphs.get(el);
        if (g && el !== current) disconnect(g);
      };
      el.addEventListener("pause", onPause);
    }
  }
}

/** Frees all audio resources (when the plugin is unloaded). */
export function stopMusicGraphs(): void {
  Array.from(graphs.values()).forEach(disconnect);
  if (sharedContext) {
    try {
      Promise.resolve(sharedContext.close()).catch(() => {});
    } catch {
      // nothing to do
    }
  }
  sharedContext = null;
}
