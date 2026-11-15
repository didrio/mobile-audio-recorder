import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { ActionSheetIOS, Alert } from 'react-native';

import { listFolders } from './folders-repo';
import type { ProjectSummary } from './projects-repo';
import { RecentlyDeletedScreen } from './recently-deleted-screen';
import { listDeleted, purgeItems, restoreItems } from './trash-repo';

jest.mock('expo-router', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  const Toolbar = ({ children }: { children: ReactNode }) => children;
  Toolbar.Button = function Button({
    children,
    accessibilityLabel,
    disabled,
    onPress,
  }: {
    children: string;
    accessibilityLabel?: string;
    disabled?: boolean;
    onPress?: () => void;
  }) {
    return (
      <Text
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled }}
        onPress={disabled ? undefined : onPress}>
        {children}
      </Text>
    );
  };
  Toolbar.Spacer = function Spacer() {
    return null;
  };
  return { Stack: { Screen: () => null, Toolbar } };
});
jest.mock('./folders-repo', () => ({ listFolders: jest.fn() }));
jest.mock('./projects-repo', () => ({}));
jest.mock('./trash-repo', () => ({
  listDeleted: jest.fn(),
  restoreItems: jest.fn(() => Promise.resolve()),
  purgeItems: jest.fn(() => Promise.resolve([])),
}));
jest.mock('@/features/audio/audio-engine', () => ({ forgetTakes: jest.fn() }));

const idea = (overrides: Partial<ProjectSummary>): ProjectSummary => ({
  id: 'p1',
  name: 'Idea 1',
  createdAt: 0,
  updatedAt: 0,
  duration: 0,
  notes: '',
  folderId: null,
  favorite: false,
  deletedAt: Date.now() - 2 * 86_400_000,
  ...overrides,
});

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<RecentlyDeletedScreen />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

describe('RecentlyDeletedScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(listFolders).mockResolvedValue([]);
  });

  it('explains when nothing is deleted', async () => {
    jest.mocked(listDeleted).mockResolvedValue({ folders: [], ideas: [] });
    await renderScreen();

    expect(await screen.findByText(/Nothing recently deleted/)).toBeOnTheScreen();
  });

  it('lists deleted items with the days left and restores one from its menu', async () => {
    jest
      .mocked(listDeleted)
      .mockResolvedValue({ folders: [], ideas: [idea({ id: 'a', name: 'Chorus riff' })] });
    const sheet = jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation((_options, callback) => callback(0));
    const user = userEvent.setup();
    await renderScreen();

    expect(await screen.findByText('28 days left')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: /Chorus riff/ }));

    expect(sheet).toHaveBeenCalled();
    await waitFor(() =>
      expect(restoreItems).toHaveBeenCalledWith({ ideaIds: ['a'], folderIds: [] }),
    );
  });

  it('asks before deleting for good', async () => {
    jest
      .mocked(listDeleted)
      .mockResolvedValue({ folders: [], ideas: [idea({ id: 'a', name: 'Chorus riff' })] });
    jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation((_options, callback) => callback(1));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();
    await renderScreen();

    await user.press(await screen.findByRole('button', { name: /Chorus riff/ }));

    expect(purgeItems).not.toHaveBeenCalled();
    expect(alert.mock.calls[0]![0]).toBe('Delete “Chorus riff” now?');
    alert.mock.calls[0]![2]!.find((button) => button.text === 'Delete')!.onPress!();
    await waitFor(() => expect(purgeItems).toHaveBeenCalledWith({ ideaIds: ['a'], folderIds: [] }));
  });

  it('restores several items in select mode', async () => {
    jest.mocked(listDeleted).mockResolvedValue({
      folders: [],
      ideas: [idea({ id: 'a', name: 'One' }), idea({ id: 'b', name: 'Two' })],
    });
    const user = userEvent.setup();
    await renderScreen();

    await user.press(await screen.findByRole('button', { name: 'Select' }));
    await user.press(screen.getByRole('button', { name: /One/ }));
    await user.press(screen.getByRole('button', { name: /Two/ }));
    await user.press(screen.getByRole('button', { name: 'Restore' }));

    await waitFor(() =>
      expect(restoreItems).toHaveBeenCalledWith({ ideaIds: ['a', 'b'], folderIds: [] }),
    );
  });
});
