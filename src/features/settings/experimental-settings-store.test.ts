import { storage } from '@/lib/storage';

import { useExperimentalSettingsStore } from './experimental-settings-store';

describe('useExperimentalSettingsStore', () => {
  it('starts with the vertical timeline and Speaker mode off', () => {
    expect(useExperimentalSettingsStore.getInitialState().verticalTimeline).toBe(false);
    expect(useExperimentalSettingsStore.getInitialState().speakerMode).toBe(false);
  });

  it('turns Speaker mode on and persists it', () => {
    useExperimentalSettingsStore.getState().setSpeakerMode(true);

    expect(useExperimentalSettingsStore.getState().speakerMode).toBe(true);
    expect(storage.getString('settings.experimental')).toContain('"speakerMode":true');

    useExperimentalSettingsStore.getState().setSpeakerMode(false);
    expect(storage.getString('settings.experimental')).toContain('"speakerMode":false');
  });

  it('turns the vertical timeline on and persists it', () => {
    useExperimentalSettingsStore.getState().setVerticalTimeline(true);

    expect(useExperimentalSettingsStore.getState().verticalTimeline).toBe(true);
    expect(storage.getString('settings.experimental')).toContain('"verticalTimeline":true');

    useExperimentalSettingsStore.getState().setVerticalTimeline(false);
    expect(storage.getString('settings.experimental')).toContain('"verticalTimeline":false');
  });
});
