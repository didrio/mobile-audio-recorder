import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Alert } from 'react-native';

import { useIdeasSortStore } from './ideas-sort-store';
import {
  createProject,
  deleteProject,
  duplicateProject,
  listProjects,
  renameProject,
  type ProjectSummary,
} from './projects-repo';
import { ProjectsScreen } from './projects-screen';

const mockPush = jest.fn();

jest.mock('expo-router', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  const Toolbar = ({ children }: { children: ReactNode }) => children;
  Toolbar.Menu = function Menu({
    accessibilityLabel,
    children,
  }: {
    accessibilityLabel: string;
    children: ReactNode;
  }) {
    return (
      <>
        <Text>{accessibilityLabel}</Text>
        {children}
      </>
    );
  };
  Toolbar.MenuAction = function MenuAction({
    children,
    onPress,
    isOn,
  }: {
    children: string;
    onPress?: () => void;
    isOn?: boolean;
  }) {
    return (
      <Text accessibilityRole="menuitem" accessibilityState={{ checked: isOn }} onPress={onPress}>
        {children}
      </Text>
    );
  };
  return {
    Stack: { Screen: () => null, SearchBar: () => null, Toolbar },
    useRouter: () => ({ push: mockPush }),
  };
});

// The real swipeable needs Reanimated's UI runtime; this stand-in renders the row and its actions.
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: ({
      children,
      renderRightActions,
    }: {
      children: ReactNode;
      renderRightActions: () => ReactNode;
    }) => (
      <View>
        {children}
        {renderRightActions()}
      </View>
    ),
  };
});

jest.mock('./projects-repo', () => ({
  listProjects: jest.fn(),
  createProject: jest.fn(),
  getProject: jest.fn(),
  deleteProject: jest.fn(),
  duplicateProject: jest.fn(),
  renameProject: jest.fn(),
}));
jest.mock('@/features/audio/audio-engine', () => ({ forgetTakes: jest.fn() }));

const mockedListProjects = jest.mocked(listProjects);

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
  return render(<ProjectsScreen />, { wrapper: QueryProvider });
}

const idea = (overrides: Partial<ProjectSummary>): ProjectSummary => ({
  id: 'p1',
  name: 'Idea 1',
  createdAt: 0,
  updatedAt: 0,
  duration: 0,
  ...overrides,
});

describe('ProjectsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useIdeasSortStore.setState({ order: 'recent' });
  });

  it('offers to record a new idea and explains the empty list', async () => {
    mockedListProjects.mockResolvedValue([]);
    await renderScreen();

    expect(screen.getByRole('button', { name: 'Record new idea' })).toBeOnTheScreen();
    expect(await screen.findByText(/Your ideas show up here/)).toBeOnTheScreen();
  });

  it('lists saved ideas with their length', async () => {
    mockedListProjects.mockResolvedValue([
      idea({ id: 'a', name: 'Chorus riff', duration: 83 }),
      idea({ id: 'b', name: 'Idea 2', duration: 5.4 }),
    ]);
    await renderScreen();

    expect(await screen.findByText('Chorus riff')).toBeOnTheScreen();
    expect(screen.getByText('1:23')).toBeOnTheScreen();
    expect(screen.getByText('Idea 2')).toBeOnTheScreen();
    expect(screen.getByText('0:05')).toBeOnTheScreen();
  });

  it('sorts by the chosen order and remembers it', async () => {
    mockedListProjects.mockResolvedValue([
      idea({ id: 'a', name: 'Zeta', updatedAt: 200 }),
      idea({ id: 'b', name: 'Alpha', updatedAt: 100 }),
    ]);
    const user = userEvent.setup();
    await renderScreen();
    await screen.findByText('Zeta');
    const names = () => screen.getAllByText(/^(Zeta|Alpha)$/).map((node) => node.props.children);
    expect(names()).toEqual(['Zeta', 'Alpha']);

    await user.press(screen.getByRole('menuitem', { name: 'Name' }));

    expect(names()).toEqual(['Alpha', 'Zeta']);
    expect(useIdeasSortStore.getState().order).toBe('name');
  });

  it('creates an idea from the "+" menu and opens it without recording', async () => {
    mockedListProjects.mockResolvedValue([]);
    jest.mocked(createProject).mockResolvedValue(idea({ id: 'new' }));
    const user = userEvent.setup();
    await renderScreen();

    await user.press(screen.getByRole('menuitem', { name: 'New Idea' }));

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/project/[id]', params: { id: 'new' } });
  });

  it('duplicates and renames from the row actions', async () => {
    mockedListProjects.mockResolvedValue([idea({ id: 'a', name: 'Chorus riff' })]);
    jest.mocked(duplicateProject).mockResolvedValue(idea({ id: 'b', name: 'Chorus riff copy' }));
    const user = userEvent.setup();
    await renderScreen();
    await screen.findByText('Chorus riff');

    await user.press(screen.getByRole('button', { name: 'Duplicate Chorus riff' }));
    expect(duplicateProject).toHaveBeenCalledWith('a');

    await user.press(screen.getByRole('button', { name: 'Rename Chorus riff' }));
    const input = await screen.findByLabelText('Idea name');
    await user.clear(input);
    await user.type(input, 'Verse riff');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    expect(renameProject).toHaveBeenCalledWith('a', 'Verse riff');
  });

  it('asks before deleting', async () => {
    mockedListProjects.mockResolvedValue([idea({ id: 'a', name: 'Chorus riff' })]);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();
    await renderScreen();
    await screen.findByText('Chorus riff');

    await user.press(screen.getByRole('button', { name: 'Delete Chorus riff' }));

    expect(deleteProject).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0]![2]!;
    buttons.find((button) => button.text === 'Delete')!.onPress!();
    await waitFor(() => expect(deleteProject).toHaveBeenCalledWith('a'));
  });
});
