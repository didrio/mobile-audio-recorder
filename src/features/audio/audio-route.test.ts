import { headphonesConnected, speakerModeApplies } from './audio-route';

const device = (category: string) => ({ id: category, name: category, category });
const info = (outputs: { current?: string[]; available?: string[] }) => ({
  currentOutputs: (outputs.current ?? []).map(device),
  availableOutputs: (outputs.available ?? []).map(device),
});

describe('headphonesConnected', () => {
  it('on iOS, reads the outputs of the current route', () => {
    expect(headphonesConnected(info({ current: ['Speaker'] }), 'ios')).toBe(false);
    expect(headphonesConnected(info({ current: ['Headphones'] }), 'ios')).toBe(true);
    expect(headphonesConnected(info({ current: ['BluetoothA2DPOutput'] }), 'ios')).toBe(true);
    expect(headphonesConnected(info({ current: ['BluetoothHFP'] }), 'ios')).toBe(true);
    // Paired but not the current route: the speaker plays.
    expect(
      headphonesConnected(info({ current: ['Speaker'], available: ['Headphones'] }), 'ios'),
    ).toBe(false);
  });

  it('on Android, counts any connected headphones (the current route is never reported)', () => {
    expect(
      headphonesConnected(
        info({ available: ['Built-in Speaker', 'Built-in Earpiece'] }),
        'android',
      ),
    ).toBe(false);
    expect(
      headphonesConnected(info({ available: ['Built-in Speaker', 'Wired Headphones'] }), 'android'),
    ).toBe(true);
    expect(headphonesConnected(info({ available: ['Bluetooth A2DP'] }), 'android')).toBe(true);
    expect(headphonesConnected(info({ available: ['Bluetooth LE Speaker'] }), 'android')).toBe(
      false,
    );
  });
});

describe('speakerModeApplies', () => {
  it('cleans takes only in speaker mode without headphones', () => {
    expect(speakerModeApplies(true, false)).toBe(true);
    expect(speakerModeApplies(true, true)).toBe(false);
    expect(speakerModeApplies(false, false)).toBe(false);
  });
});
