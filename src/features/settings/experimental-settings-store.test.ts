import { storage } from '@/lib/storage';

import { useExperimentalSettingsStore } from './experimental-settings-store';

describe('useExperimentalSettingsStore', () => {
  it('starts with the vertical timeline off', () => {
    expect(useExperimentalSettingsStore.getInitialState().verticalTimeline).toBe(false);
  });

  it('turns the vertical timeline on and persists it', () => {
    useExperimentalSettingsStore.getState().setVerticalTimeline(true);

    expect(useExperimentalSettingsStore.getState().verticalTimeline).toBe(true);
    expect(storage.getString('settings.experimental')).toContain('"verticalTimeline":true');

    useExperimentalSettingsStore.getState().setVerticalTimeline(false);
    expect(storage.getString('settings.experimental')).toContain('"verticalTimeline":false');
  });
});
