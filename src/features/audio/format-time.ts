/** `m:ss.t` (tenths), e.g. `0:07.3`, `12:04.0`. Negative and non-finite values show as zero. */
export function formatTimecode(seconds: number): string {
  const tenths = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds * 10) : 0;
  const minutes = Math.floor(tenths / 600);
  const secs = Math.floor((tenths % 600) / 10);
  return `${minutes}:${String(secs).padStart(2, '0')}.${tenths % 10}`;
}

/** `m:ss`, rounded to the nearest second, for list rows. */
export function formatDuration(seconds: number): string {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
