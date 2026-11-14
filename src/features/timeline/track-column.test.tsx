import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { TrackColumn } from './track-column';

const tracks = [
  { id: 'a', name: 'Track 1', volume: 1, muted: false, solo: false },
  { id: 'b', name: 'Vocals', volume: 0.5, muted: true, solo: false },
];
const laneScroll = { get: () => 0, set: () => {}, value: 0 } as never;
const sharedValue = (value: unknown) => ({ get: () => value, set: () => {}, value }) as never;
const drag = {
  id: sharedValue(null),
  top: sharedValue(0),
  target: sharedValue(0),
  progress: sharedValue(0),
  lift: sharedValue(0),
  dropped: sharedValue(-1),
};

function renderColumn(overrides: Partial<Parameters<typeof TrackColumn>[0]> = {}) {
  const props = {
    onEdit: jest.fn(),
    onMoveTrack: jest.fn(),
    onToggleMute: jest.fn(),
    onToggleSolo: jest.fn(),
    onVolumeDrag: jest.fn(),
    onVolumeRelease: jest.fn(),
  };
  const view = render(
    <GestureHandlerRootView>
      <TrackColumn
        tracks={tracks}
        top={32}
        width={236}
        armWidth={38}
        expanded
        lane={88}
        laneScroll={laneScroll}
        viewport={500}
        maxLaneScroll={0}
        drag={drag}
        editDisabled={false}
        anySolo={false}
        draft={null}
        {...props}
        {...overrides}
      />
    </GestureHandlerRootView>,
  );
  return { view, ...props };
}

describe('TrackColumn', () => {
  it('shows no buttons while collapsed: each cell is a grab handle only', async () => {
    await renderColumn({ expanded: false }).view;

    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Mute Vocals' })).not.toBeOnTheScreen();
    expect(screen.queryByRole('adjustable', { name: 'Vocals volume' })).not.toBeOnTheScreen();
  });

  it('moves a track with the screen reader actions on its grab handle', async () => {
    const { view, onMoveTrack } = renderColumn({ expanded: false });
    await view;

    const first = screen.getByLabelText('Reorder Track 1');
    const second = screen.getByLabelText('Reorder Vocals');
    expect(first.props.accessibilityActions).toEqual([{ name: 'moveDown', label: 'Move down' }]);
    await fireEvent(second, 'accessibilityAction', { nativeEvent: { actionName: 'moveUp' } });

    expect(onMoveTrack).toHaveBeenCalledWith('b', 0);
  });

  it('offers no reordering while recording', async () => {
    await renderColumn({ expanded: false, editDisabled: true }).view;

    expect(screen.getByLabelText('Reorder Vocals').props.accessibilityActions).toEqual([]);
  });

  it('opens a track, mutes and solos it', async () => {
    const { view, onEdit, onToggleMute, onToggleSolo } = renderColumn();
    await view;
    const user = userEvent.setup();

    expect(screen.getByRole('button', { name: 'Mute Vocals' })).toBeSelected();
    await user.press(screen.getByRole('button', { name: 'Track 1 settings' }));
    await user.press(screen.getByRole('button', { name: 'Mute Track 1' }));
    await user.press(screen.getByRole('button', { name: 'Solo Vocals' }));

    expect(onEdit).toHaveBeenCalledWith('a');
    expect(onToggleMute).toHaveBeenCalledWith('a');
    expect(onToggleSolo).toHaveBeenCalledWith('b');
  });

  it('shows each volume in dB and steps it by 1 dB for screen readers', async () => {
    const { view, onVolumeRelease } = renderColumn();
    await view;

    const slider = screen.getByRole('adjustable', { name: 'Vocals volume' });
    expect(slider).toHaveAccessibilityValue({ text: '−6.0 dB' });
    await fireEvent(slider, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });

    expect(onVolumeRelease).toHaveBeenCalledWith('b', expect.closeTo(10 ** (-5 / 20)));
  });

  it('shows a slider being dragged at its live value', async () => {
    await renderColumn({ draft: { trackId: 'a', gain: 0.5 } }).view;

    expect(screen.getByRole('adjustable', { name: 'Track 1 volume' })).toHaveAccessibilityValue({
      text: '−6.0 dB',
    });
  });

  it('locks the track sheet while recording', async () => {
    await renderColumn({ editDisabled: true }).view;

    expect(screen.getByRole('button', { name: 'Track 1 settings' })).toBeDisabled();
  });
});
