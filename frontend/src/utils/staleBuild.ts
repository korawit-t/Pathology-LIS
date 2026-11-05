// A tab that stays open across a redeploy keeps running the old bundle. Its
// lazily loaded chunks are named by content hash, and the new build has
// replaced them, so the first page or module it hasn't loaded yet fails with
// a 404. Vite reports that as a `vite:preloadError` event.
//
// We don't reload for the user, which is what Vite's docs suggest: a few of
// these imports run inside a page (GrossEditView, the PDF page selector), and
// reloading there would throw away whatever was typed and not yet saved.
// Instead the failure raises the same "new version" notice the poll does
// (useNewBuildAvailable), and the user reloads once their work is saved.

export const STALE_BUILD_EVENT = "lis:stale-build";

// Chrome / Edge, Firefox, Safari, and Vite's own CSS preload failure.
const CHUNK_ERROR_RE =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i;

export function isStaleChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return CHUNK_ERROR_RE.test(message);
}

export function announceStaleBuild(): void {
  window.dispatchEvent(new Event(STALE_BUILD_EVENT));
}

// Called once from main.tsx. The error itself is left to propagate as before.
export function watchForStaleChunks(): void {
  window.addEventListener("vite:preloadError", announceStaleBuild);
}

// The one place the app reloads itself for a new build, always on a click.
export function reloadForNewBuild(): void {
  window.location.reload();
}
