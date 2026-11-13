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
  const props = { onEdit: jest.fn(), onAddTrack: jest.fn() };
  const view = render(
    <LaneOverlay
      tracks={tracks}
      top={32}
      left={44}
      viewport={440}
      lane={88}
      inset={3}
      footer={44}
      laneScroll={laneScroll}
      draft={null}
      armedTrackId="t0"
      editDisabled={false}
      addTrackDisabled={false}
      {...props}
      {...overrides}
    />,
  );
  return { view, getScroll: () => scroll, ...props };
}

describe('LaneOverlay', () => {
  it('opens a track from its name, and shows mute and a moving volume', async () => {
    const { view, onEdit } = renderOverlay({ draft: { trackId: 't0', gain: 0.5 } });
    await view;
    const user = userEvent.setup();

    expect(screen.getByText('−6.0 dB')).toBeOnTheScreen();
    expect(screen.getByLabelText('muted')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Track 2 settings' }));

    expect(onEdit).toHaveBeenCalledWith('t1');
  });

  it('says which track is armed in its name button', async () => {
    await renderOverlay().view;

    expect(screen.getByRole('button', { name: 'Track 1 settings, armed' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Track 2 settings' })).toBeOnTheScreen();
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

  it('locks tracks while recording', async () => {
    await renderOverlay({ editDisabled: true, addTrackDisabled: true }).view;

    expect(screen.getByRole('button', { name: 'Track 1 settings, armed' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'New track' })).toBeDisabled();
  });
});
