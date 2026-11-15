import { act, renderHook } from '@testing-library/react-native';

import { CLIP_HOLD_MS, isClip, useClipHold } from './clip-hold';

describe('clip hold', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('counts peaks at full scale as clipped', () => {
    expect(isClip(1)).toBe(true);
    expect(isClip(0.985)).toBe(true);
    expect(isClip(0.9)).toBe(false);
  });

  it('stays red until the hold time after the last clipped buffer', async () => {
    const { result } = await renderHook(() => useClipHold());
    expect(result.current.clipped).toBe(false);

    await act(() => result.current.report(0.5));
    expect(result.current.clipped).toBe(false);

    await act(() => result.current.report(1));
    expect(result.current.clipped).toBe(true);
    await act(() => jest.advanceTimersByTime(CLIP_HOLD_MS - 100));
    await act(() => result.current.report(0.99));
    await act(() => jest.advanceTimersByTime(CLIP_HOLD_MS - 100));
    expect(result.current.clipped).toBe(true);

    await act(() => jest.advanceTimersByTime(200));
    expect(result.current.clipped).toBe(false);
  });

  it('clears at once on reset', async () => {
    const { result } = await renderHook(() => useClipHold());
    await act(() => result.current.report(1));
    await act(() => result.current.reset());
    expect(result.current.clipped).toBe(false);
  });
});
