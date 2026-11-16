import { render, screen, userEvent } from '@testing-library/react-native';

import { LaneOverlay } from './lane-overlay';

const tracks = Array.from({ length: 8 }, (_, index) => ({
  id: `t${index}`,
  name: `Track ${index + 1}`,
  muted: index === 1,
  solo: false,
}));

function renderOverlay(overrides: Partial<Parameters<typeof LaneOverlay>[0]> = {}) {
  let scroll = 0;
  const laneScroll = {
    get: () => scroll,
    set: (next: number) => {
      scroll = next;
    },
  } as never;
  const props = { onArm: jest.fn(), onAddTrack: jest.fn() };
  const view = render(
    <LaneOverlay
      tracks={tracks}
      start={32}
      timeStart={44}
      viewport={440}
      lane={88}
      inset={3}
      footer={44}
      laneScroll={laneScroll}
      drag={
        {
          id: { get: () => null, set: () => {} },
          top: { get: () => 0, set: () => {} },
          target: { get: () => 0, set: () => {} },
          progress: { get: () => 0, set: () => {} },
          lift: { get: () => 0, set: () => {} },
          dropped: { get: () => -1, set: () => {} },
        } as never
      }
      draft={null}
      armedTrackId="t0"
      armDisabled={false}
      addTrackDisabled={false}
      {...props}
      {...overrides}
    />,
  );
  return { view, getScroll: () => scroll, ...props };
}

describe('LaneOverlay', () => {
  it('arms a track from its name, and shows mute and a moving volume', async () => {
    const { view, onArm } = renderOverlay({ draft: { trackId: 't0', gain: 0.5 } });
    await view;
    const user = userEvent.setup();

    expect(screen.getByText('−6.0 dB')).toBeOnTheScreen();
    expect(screen.getByLabelText('muted')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Arm Track 2' }));

    expect(onArm).toHaveBeenCalledWith('t1');
  });

  it('opens the track sheet on a long-press of its name, a tap still arms', async () => {
    const onEditTrack = jest.fn();
    const { view, onArm } = renderOverlay({ onEditTrack });
    await view;
    const user = userEvent.setup();

    await user.longPress(screen.getByRole('button', { name: 'Arm Track 2' }));

    expect(onEditTrack).toHaveBeenCalledWith('t1');
    expect(onArm).not.toHaveBeenCalled();
  });

  it('does not open the track sheet while editing is disabled', async () => {
    const onEditTrack = jest.fn();
    await renderOverlay({ onEditTrack, editDisabled: true }).view;
    const user = userEvent.setup();

    await user.longPress(screen.getByRole('button', { name: 'Arm Track 2' }));

    expect(onEditTrack).not.toHaveBeenCalled();
  });

  it('marks the armed track on its name button', async () => {
    await renderOverlay().view;

    expect(screen.getByRole('button', { name: 'Arm Track 1' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'Arm Track 2' })).not.toBeSelected();
  });

  it('adds a track from the row after the last lane', async () => {
    const { view, onAddTrack } = renderOverlay();
    await view;
    const user = userEvent.setup();

    await user.press(screen.getByRole('button', { name: 'New track' }));

    expect(onAddTrack).toHaveBeenCalled();
  });

  it('says how many tracks are below, and pages down to them', async () => {
    const { view, getScroll } = renderOverlay();
    await view;
    const user = userEvent.setup();

    expect(screen.queryByRole('button', { name: /above/ })).not.toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: '3 more tracks below' }));

    expect(getScroll()).toBe(308); // a page is 5 lanes, capped at the end (8 lanes + the row)
  });

  it('turns sideways in the vertical timeline: tracks to the right, paged by whole columns', async () => {
    // 8 columns of 85 in 340 points: 4 show, 4 to the right.
    const { view, getScroll, onAddTrack } = renderOverlay({
      vertical: true,
      viewport: 340,
      lane: 85,
    });
    await view;
    const user = userEvent.setup();

    expect(screen.queryByRole('button', { name: /to the left/ })).not.toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: '4 more tracks to the right' }));
    expect(getScroll()).toBe(340); // a page is 4 columns

    await user.press(screen.getByRole('button', { name: 'New track' }));
    expect(onAddTrack).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Arm Track 1' })).toBeSelected();
  });

  it('locks tracks while recording', async () => {
    await renderOverlay({ armDisabled: true, addTrackDisabled: true }).view;

    expect(screen.getByRole('button', { name: 'Arm Track 1' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'New track' })).toBeDisabled();
  });
});
