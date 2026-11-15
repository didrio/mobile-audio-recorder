import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { deviceKey, type DeviceRef } from '@/features/audio/audio-route';
import { zustandStorage } from '@/lib/storage';

type InputDevicesState = {
  /**
   * The input picked in Settings → Recording → Input; `null` lets the system choose. Kept while the
   * device is gone (the default records meanwhile), so plugging it back in picks it again.
   */
  preferredInput: DeviceRef | null;
  setPreferredInput: (device: DeviceRef | null) => void;
  /** Which channel (0-based) of a multi-channel input the take records, per device (`deviceKey`). */
  channelByDevice: Record<string, number>;
  setChannel: (device: Pick<DeviceRef, 'name' | 'category'>, channel: number) => void;
  /** Input gain (0…1) per device, where the hardware lets the app set it (iOS). */
  gainByDevice: Record<string, number>;
  setGain: (device: Pick<DeviceRef, 'name' | 'category'>, gain: number) => void;
};

/** Per-device input choices (T38), remembered across launches. */
export const useInputDevicesStore = create<InputDevicesState>()(
  persist(
    (set) => ({
      preferredInput: null,
      setPreferredInput: (device) =>
        set({
          preferredInput: device && { id: device.id, name: device.name, category: device.category },
        }),
      channelByDevice: {},
      setChannel: (device, channel) =>
        set((state) => ({
          channelByDevice: { ...state.channelByDevice, [deviceKey(device)]: channel },
        })),
      gainByDevice: {},
      setGain: (device, gain) =>
        set((state) => ({
          gainByDevice: {
            ...state.gainByDevice,
            [deviceKey(device)]: Math.min(1, Math.max(0, gain)),
          },
        })),
    }),
    {
      name: 'settings.input-devices',
      version: 1,
      storage: createJSONStorage(() => zustandStorage),
      partialize: (state) => ({
        preferredInput: state.preferredInput,
        channelByDevice: state.channelByDevice,
        gainByDevice: state.gainByDevice,
      }),
    },
  ),
);
