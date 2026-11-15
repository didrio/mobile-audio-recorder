import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { listFolders, moveItems, type Folder } from './folders-repo';
import { MoveToScreen } from './move-to-screen';

const mockBack = jest.fn();
let mockParams: { ideas?: string; folders?: string } = {};

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ back: mockBack }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock('./folders-repo', () => ({
  listFolders: jest.fn(),
  moveItems: jest.fn(() => Promise.resolve()),
}));
jest.mock('@/features/audio/audio-engine', () => ({ forgetTakes: jest.fn() }));

const folder = (id: string, name: string, parentId: string | null = null): Folder => ({
  id,
  name,
  parentId,
  createdAt: 0,
  updatedAt: 0,
  deletedAt: null,
});

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  });
  const QueryProvider = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(<MoveToScreen />, { wrapper: QueryProvider });
}

describe('MoveToScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(listFolders)
      .mockResolvedValue([
        folder('demos', 'Demos'),
        folder('rough', 'Rough', 'demos'),
        folder('lyrics', 'Lyrics'),
      ]);
  });

  it('won’t move a folder into itself or below it', async () => {
    mockParams = { folders: 'demos' };
    await renderScreen();

    expect(await screen.findByRole('button', { name: 'Demos' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Rough' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Lyrics' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Ideas' })).toBeEnabled();
  });

  it('moves the items to the chosen folder and closes', async () => {
    mockParams = { ideas: 'a,b', folders: 'lyrics' };
    const user = userEvent.setup();
    await renderScreen();

    expect(screen.getByText('Move 3 items to')).toBeOnTheScreen();
    await user.press(await screen.findByRole('button', { name: 'Rough' }));

    expect(moveItems).toHaveBeenCalledWith({ ideaIds: ['a', 'b'], folderIds: ['lyrics'] }, 'rough');
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });
});
