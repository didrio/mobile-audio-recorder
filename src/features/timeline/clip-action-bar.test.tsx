import { render, screen, userEvent } from '@testing-library/react-native';

import { ClipActionBar } from './clip-action-bar';

function renderBar(canSplit: boolean) {
  const props = {
    onSplit: jest.fn(),
    onSplitUnavailable: jest.fn(),
    onDuplicate: jest.fn(),
    onOptions: jest.fn(),
    onDelete: jest.fn(),
  };
  const view = render(<ClipActionBar canSplit={canSplit} {...props} />);
  return { view, ...props };
}

describe('ClipActionBar', () => {
  it('splits when the playhead is inside the clip', async () => {
    const { view, onSplit, onSplitUnavailable } = renderBar(true);
    await view;
    const user = userEvent.setup();

    await user.press(screen.getByRole('button', { name: 'Split' }));

    expect(onSplit).toHaveBeenCalled();
    expect(onSplitUnavailable).not.toHaveBeenCalled();
  });

  it('looks dimmed but says why when the playhead is outside the clip', async () => {
    const { view, onSplit, onSplitUnavailable } = renderBar(false);
    await view;
    const user = userEvent.setup();

    await user.press(screen.getByRole('button', { name: 'Split' }));

    expect(onSplitUnavailable).toHaveBeenCalled();
    expect(onSplit).not.toHaveBeenCalled();
  });
});
