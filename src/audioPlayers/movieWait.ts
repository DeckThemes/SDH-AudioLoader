import * as python from "../python";

// How long to wait for a movie to show up at all. If none starts by then, there is no movie.
const APPEAR_MS = 2500;
// A movie counts as finished when nothing has been playing for this long
const QUIET_MS = 800;
// Never wait longer than this in total
const MAX_WAIT_MS = 60000;
const POLL_MS = 250;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// A movie is any video in the Steam screen that is playing with sound. (Silent videos, like
// the little background videos on game pages, do not count.)
function moviePlaying(): boolean {
  try {
    const videos = Array.from(document.querySelectorAll("video")) as HTMLVideoElement[];
    return videos.some((v) => !v.paused && !v.ended && !v.muted && v.volume > 0);
  } catch {
    return false;
  }
}

// Used by "Wait for Startup Movie": returns when the startup (or wake-up) movie has finished.
// Returns quickly when there is no movie.
export async function waitForMovies(): Promise<void> {
  const start = Date.now();
  let seen = false;
  let lastPlaying = 0;
  while (Date.now() - start < MAX_WAIT_MS) {
    const now = Date.now();
    if (moviePlaying()) {
      seen = true;
      lastPlaying = now;
    } else if (seen && now - lastPlaying > QUIET_MS) {
      break;
    } else if (!seen && now - start > APPEAR_MS) {
      break;
    }
    await wait(POLL_MS);
  }
  python.logEvent(`Movie wait: ${seen ? "a movie played" : "no movie found"}, waited ${Date.now() - start} ms`);
}
