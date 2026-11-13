import { render, screen, userEvent } from '@testing-library/react-native';

import { TrackHeaders } from './track-headers';

const tracks = [
  { id: 'a', name: 'Track 1' },
  { id: 'b', name: 'Vocals' },
];
const crossScroll = { get: () => 0, set: () => {}, value: 0 } as never;

function renderHeaders(overrides: Partial<Parameters<typeof TrackHeaders>[0]> = {}) {
  const onArm = jest.fn();
  const onEdit = jest.fn();
  const view = render(
    <TrackHeaders
      tracks={tracks}
      orientation="portrait"
      rulerSize={44}
      lane={120}
      inset={3}
      crossScroll={crossScroll}
      armedTrackId="b"
      disabled={false}
      onArm={onArm}
      onEdit={onEdit}
      {...overrides}
    />,
  );
  return { view, onArm, onEdit };
}

describe('TrackHeaders', () => {
  it('shows each track with its arm state', async () => {
    await renderHeaders().view;

    expect(screen.getByText('Vocals')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Arm Vocals' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'Arm Track 1' })).not.toBeSelected();
  });

  it('arms a track and opens its settings', async () => {
    const { view, onArm, onEdit } = renderHeaders();
    await view;
    const user = userEvent.setup();

    await user.press(screen.getByRole('button', { name: 'Arm Track 1' }));
    await user.press(screen.getByRole('button', { name: 'Vocals settings' }));

    expect(onArm).toHaveBeenCalledWith('a');
    expect(onEdit).toHaveBeenCalledWith('b');
  });

  it('locks the tracks while recording', async () => {
    await renderHeaders({ disabled: true }).view;

    expect(screen.getByRole('button', { name: 'Arm Track 1' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Vocals settings' })).toBeDisabled();
  });
});
