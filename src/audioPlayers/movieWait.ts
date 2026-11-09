import * as python from "../python";

// How long to wait for a movie to show up at all. If none starts by then, there is no movie.
const APPEAR_MS = 2500;
// At startup the plugin can load before the movie begins, so it looks a little longer
export const STARTUP_APPEAR_MS = 5000;
// A movie counts as finished when nothing has been playing for this long
const QUIET_MS = 800;
// Never wait longer than this in total
const MAX_WAIT_MS = 60000;
const POLL_MS = 250;
// A video this big (compared to its window) is a movie even without sound. Custom startup
// videos often have no sound at all.
const FULLSCREEN_RATIO = 0.85;
const MAX_LISTED = 6;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// The screens that can hold the movie. The plugin runs in its own hidden page, but Steam plays
// the startup movie in the main window of the Steam screen, which has its own document.
function allDocuments(): Document[] {
  const docs: Document[] = [];
  const add = (d: any) => {
    if (d && typeof d.querySelectorAll === "function" && !docs.includes(d)) docs.push(d);
  };
  try {
    add(document);
  } catch {
    // no document here
  }
  try {
    const store = (window as any).SteamUIStore;
    const windowStore = store?.WindowStore;
    add(windowStore?.GamepadUIMainWindowInstance?.BrowserWindow?.document);
    const windows = windowStore?.SteamUIWindows;
    if (Array.isArray(windows)) windows.forEach((w: any) => add(w?.BrowserWindow?.document));
    add(store?.GetFocusedWindowInstance?.()?.BrowserWindow?.document);
  } catch {
    // Steam's window list is not available: only the plugin's own page is checked
  }
  return docs;
}

function allVideos(): HTMLVideoElement[] {
  const videos: HTMLVideoElement[] = [];
  for (const doc of allDocuments()) {
    try {
      videos.push(...(Array.from(doc.querySelectorAll("video")) as HTMLVideoElement[]));
    } catch {
      // this page cannot be read
    }
  }
  return videos;
}

function isFullscreenSize(v: HTMLVideoElement): boolean {
  try {
    const win = v.ownerDocument?.defaultView;
    if (!win || !win.innerWidth || !win.innerHeight) return false;
    return v.clientWidth >= win.innerWidth * FULLSCREEN_RATIO && v.clientHeight >= win.innerHeight * FULLSCREEN_RATIO;
  } catch {
    return false;
  }
}

const isPlayingVideo = (v: HTMLVideoElement) => !v.paused && !v.ended;

// A movie is a video that is playing with sound, or a playing video that fills the screen.
// (Silent small videos, like the little background videos on game pages, do not count.)
export function isMovie(v: HTMLVideoElement): boolean {
  if (!isPlayingVideo(v)) return false;
  return (!v.muted && v.volume > 0) || isFullscreenSize(v);
}

function moviePlaying(): boolean {
  try {
    return allVideos().some(isMovie);
  } catch {
    return false;
  }
}

function describe(): string {
  try {
    const docs = allDocuments();
    const videos = allVideos();
    const list = videos.slice(0, MAX_LISTED).map((v) => {
      const src = String((v as any).currentSrc || (v as any).src || "").split("/").pop() || "?";
      return `${isPlayingVideo(v) ? "playing" : "stopped"}${v.muted ? " muted" : ""} ${v.clientWidth ?? "?"}x${v.clientHeight ?? "?"} ${src}`;
    });
    return `${docs.length} page(s), ${videos.length} video(s)${list.length ? ": " + list.join("; ") : ""}`;
  } catch {
    return "could not look at the videos";
  }
}

// Used by "Wait for Startup Movie": returns when the startup (or wake-up) movie has finished.
// Returns quickly when there is no movie.
export async function waitForMovies(appearMs: number = APPEAR_MS): Promise<void> {
  const start = Date.now();
  let seen = false;
  let lastPlaying = 0;
  let loggedFirst = false;
  while (Date.now() - start < MAX_WAIT_MS) {
    const now = Date.now();
    if (moviePlaying()) {
      if (!seen) {
        seen = true;
        python.logEvent(`Movie wait: a movie started (${describe()})`);
      }
      lastPlaying = now;
    } else if (seen && now - lastPlaying > QUIET_MS) {
      break;
    } else if (!seen && now - start > appearMs) {
      break;
    }
    // Once, early on, write what the videos look like: this explains a missed movie afterwards
    if (!seen && !loggedFirst && now - start > 1000) {
      loggedFirst = true;
      python.logEvent(`Movie wait: looking for a movie (${describe()})`);
    }
    await wait(POLL_MS);
  }
  python.logEvent(
    `Movie wait: ${seen ? "a movie played" : `no movie found (${describe()})`}, waited ${Date.now() - start} ms`
  );
}
