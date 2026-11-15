/**
 * Lets sheets opened over the idea (the notes sheet, T24; clip options, T16) read and move the
 * playhead, and refresh playback after an edit, while the editor screen owns the transport
 * (`use-transport.ts`). The editor registers itself while it is mounted; with no editor (a sheet
 * opened on its own), reads give 0 and the rest does nothing.
 */
export type TransportLink = {
  /** Where the playhead is now, in seconds (moves while playing). */
  playheadTime: () => number;
  /** Moves the playhead there and brings it into view; while playing, playback continues from there. */
  seek: (time: number) => void;
  /** Clips were edited: while playing, continue from where playback is with the edited clips. */
  replay: () => void;
};

let current: TransportLink | null = null;

/** Registers the editor's transport. Returns the function that unregisters it. */
export function registerTransportLink(link: TransportLink): () => void {
  current = link;
  return () => {
    if (current === link) current = null;
  };
}

export function playheadTime(): number {
  return current?.playheadTime() ?? 0;
}

export function seekTo(time: number) {
  current?.seek(time);
}

export function replayEdited() {
  current?.replay();
}
