import {
  currentInput,
  currentOutput,
  deviceKey,
  headphonesConnected,
  inputChannel,
  inputLabel,
  inputName,
  outputLabel,
  outputRouteOf,
  pickableInputs,
  resolvePreferredInput,
  speakerModeApplies,
} from './audio-route';

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

describe('outputRouteOf', () => {
  it('sorts iOS port types into latency routes', () => {
    expect(outputRouteOf('Speaker')).toBe('speaker');
    expect(outputRouteOf('Receiver')).toBe('speaker');
    expect(outputRouteOf('Headphones')).toBe('wired');
    expect(outputRouteOf('LineOut')).toBe('wired');
    expect(outputRouteOf('BluetoothA2DPOutput')).toBe('bluetooth');
    expect(outputRouteOf('BluetoothHFP')).toBe('bluetooth');
    expect(outputRouteOf('BluetoothLE')).toBe('bluetooth');
    expect(outputRouteOf('AirPlay')).toBe('bluetooth');
    expect(outputRouteOf('USBAudio')).toBe('usb');
  });

  it("sorts Android's categories into latency routes", () => {
    expect(outputRouteOf('Built-in Speaker')).toBe('speaker');
    expect(outputRouteOf('Built-in Earpiece')).toBe('speaker');
    expect(outputRouteOf('Wired Headphones')).toBe('wired');
    expect(outputRouteOf('Wired Headset')).toBe('wired');
    expect(outputRouteOf('Bluetooth A2DP')).toBe('bluetooth');
    expect(outputRouteOf('Bluetooth LE Speaker')).toBe('bluetooth');
    expect(outputRouteOf('USB Device')).toBe('usb');
    expect(outputRouteOf('USB Headset')).toBe('usb');
  });

  it('counts unknown outputs as the speaker', () => {
    expect(outputRouteOf('Other (42)')).toBe('speaker');
  });
});

describe('currentOutput', () => {
  it('on iOS, is the current route', () => {
    expect(
      currentOutput(info({ current: ['Headphones'], available: ['Headphones'] }), 'ios')?.category,
    ).toBe('Headphones');
    expect(currentOutput(info({}), 'ios')).toBeNull();
  });

  it('on Android, prefers USB, then wired, then Bluetooth, then the speaker over the earpiece', () => {
    const pick = (available: string[]) => currentOutput(info({ available }), 'android')?.category;
    expect(pick(['Built-in Earpiece', 'Built-in Speaker'])).toBe('Built-in Speaker');
    expect(pick(['Built-in Speaker', 'Bluetooth A2DP'])).toBe('Bluetooth A2DP');
    expect(pick(['Bluetooth A2DP', 'Wired Headphones', 'Built-in Speaker'])).toBe(
      'Wired Headphones',
    );
    expect(pick(['Wired Headphones', 'USB Device'])).toBe('USB Device');
    expect(pick([])).toBeUndefined();
  });
});

describe('inputs', () => {
  const mic = { id: 'mic', name: 'iPhone Microphone', category: 'MicrophoneBuiltIn' };
  const interfaceIn = { id: 'usb-1', name: 'Scarlett 2i2', category: 'USBAudio' };
  const headset = { id: 'bt', name: 'AirPods Pro', category: 'BluetoothHFP' };

  it('finds a remembered input by id, then by name and category (Android ids change)', () => {
    expect(resolvePreferredInput([mic, interfaceIn], interfaceIn)).toBe(interfaceIn);
    const reconnected = { ...interfaceIn, id: 'usb-7' };
    expect(resolvePreferredInput([mic, reconnected], interfaceIn)).toBe(reconnected);
  });

  it('falls back to the system default when the remembered input is gone, or none was picked', () => {
    expect(resolvePreferredInput([mic], interfaceIn)).toBeNull();
    expect(resolvePreferredInput([mic, interfaceIn], null)).toBeNull();
  });

  it('keys per-device settings by name and category', () => {
    expect(deviceKey(interfaceIn)).toBe(deviceKey({ name: 'Scarlett 2i2', category: 'USBAudio' }));
    expect(deviceKey(interfaceIn)).not.toBe(deviceKey(mic));
  });

  it('reads the current input; on Android without a pick, the built-in mic', () => {
    expect(currentInput({ currentInputs: [interfaceIn], availableInputs: [mic] }, 'ios')).toBe(
      interfaceIn,
    );
    expect(currentInput({ currentInputs: [], availableInputs: [mic] }, 'ios')).toBeNull();
    const androidMic = { id: '3', name: 'Pixel', category: 'Built-in Mic' };
    expect(currentInput({ currentInputs: [], availableInputs: [androidMic] }, 'android')).toBe(
      androidMic,
    );
  });

  it('offers Bluetooth mics only when the phone mic setting is off', () => {
    expect(pickableInputs([mic, headset, interfaceIn], true)).toEqual([mic, interfaceIn]);
    expect(pickableInputs([mic, headset], false)).toEqual([mic, headset]);
    expect(pickableInputs([{ id: '9', name: 'Buds', category: 'Bluetooth SCO' }], true)).toEqual(
      [],
    );
  });

  it('keeps the chosen channel only when the input has it', () => {
    expect(inputChannel(1, 2)).toBe(1);
    expect(inputChannel(1, 1)).toBe(0);
    expect(inputChannel(undefined, 2)).toBe(0);
  });

  it('names inputs, with the channel for multi-channel ones', () => {
    expect(inputLabel('iPhone Microphone', 0, 1)).toBe('iPhone Microphone');
    expect(inputLabel('Scarlett 2i2', 1, 2)).toBe('Scarlett 2i2 · Input 2');
  });

  it('names built-in mics plainly when they report no real name', () => {
    expect(inputName(mic)).toBe('iPhone Microphone');
    expect(inputName({ name: 'MicrophoneBuiltIn', category: 'MicrophoneBuiltIn' })).toBe(
      'Built-in Microphone',
    );
    expect(inputName({ name: 'Pixel 9', category: 'Built-in Mic' })).toBe('Built-in Microphone');
    expect(inputName(interfaceIn)).toBe('Scarlett 2i2');
  });

  it('names built-in outputs by role', () => {
    expect(outputLabel(device('Speaker'))).toBe('Speaker');
    expect(outputLabel(device('Built-in Earpiece'))).toBe('Earpiece');
    expect(outputLabel({ id: 'a', name: 'AirPods Pro', category: 'BluetoothA2DPOutput' })).toBe(
      'AirPods Pro',
    );
    expect(outputLabel(null)).toBe('Speaker');
  });
});
