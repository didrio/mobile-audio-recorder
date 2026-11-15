import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { ActionSheetIOS, Alert } from 'react-native';

import type { IdeasScope } from './folder-tree';
import { createFolder, deleteItems, listFolders, type Folder } from './folders-repo';
import { useIdeasSortStore } from './ideas-sort-store';
import {
  createProject,
  duplicateProject,
  listProjects,
  renameProject,
  setFavorite,
  type ProjectSummary,
} from './projects-repo';
import { IdeasListScreen } from './projects-screen';
import { listDeleted } from './trash-repo';

const mockPush = jest.fn();

jest.mock('expo-router', () => {
  const { Text, TextInput } = jest.requireActual<typeof import('react-native')>('react-native');
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
  return {
    Stack: {
      Screen: () => null,
      SearchBar: ({ onChangeText }: { onChangeText: (event: unknown) => void }) => (
        <TextInput
          accessibilityLabel="Search"
          onChangeText={(text) => onChangeText({ nativeEvent: { text } })}
        />
      ),
      Toolbar,
    },
    useRouter: () => ({ push: mockPush }),
    useLocalSearchParams: () => ({}),
  };
});

// The real swipeable needs Reanimated's UI runtime; this stand-in renders the row and its actions.
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: ({
      children,
      renderLeftActions,
      renderRightActions,
    }: {
      children: ReactNode;
      renderLeftActions?: () => ReactNode;
      renderRightActions: () => ReactNode;
    }) => (
      <View>
        {renderLeftActions?.()}
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
  setFavorite: jest.fn(() => Promise.resolve()),
}));
jest.mock('./folders-repo', () => ({
  listFolders: jest.fn(),
  createFolder: jest.fn(),
  renameFolder: jest.fn(),
  moveItems: jest.fn(),
  deleteItems: jest.fn(() => Promise.resolve([])),
}));
jest.mock('./trash-repo', () => ({
  listDeleted: jest.fn(),
  restoreItems: jest.fn(),
  purgeItems: jest.fn(),
}));
jest.mock('@/features/audio/audio-engine', () => ({ forgetTakes: jest.fn() }));

const mockedListProjects = jest.mocked(listProjects);
const mockedListFolders = jest.mocked(listFolders);

function renderScreen(scope: IdeasScope = { kind: 'root' }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  });
  const QueryProvider = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(<IdeasListScreen scope={scope} />, { wrapper: QueryProvider });
}

const idea = (overrides: Partial<ProjectSummary>): ProjectSummary => ({
  id: 'p1',
  name: 'Idea 1',
  createdAt: 0,
  updatedAt: 0,
  duration: 0,
  notes: '',
  folderId: null,
  favorite: false,
  deletedAt: null,
  ...overrides,
});

const folder = (id: string, name: string, parentId: string | null = null): Folder => ({
  id,
  name,
  parentId,
  createdAt: 0,
  updatedAt: 0,
  deletedAt: null,
});

/** Demos/ (Rough/), with one idea in each and one at the root. */
function seedTree() {
  mockedListFolders.mockResolvedValue([
    folder('demos', 'Demos'),
    folder('rough', 'Rough', 'demos'),
  ]);
  mockedListProjects.mockResolvedValue([
    idea({ id: 'a', name: 'Chorus riff', updatedAt: 3 }),
    idea({ id: 'b', name: 'Verse demo', folderId: 'demos', updatedAt: 2 }),
    idea({ id: 'c', name: 'Bridge take', folderId: 'rough', favorite: true, updatedAt: 1 }),
  ]);
}

describe('IdeasListScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useIdeasSortStore.setState({ order: 'recent' });
    mockedListFolders.mockResolvedValue([]);
    jest.mocked(listDeleted).mockResolvedValue({ folders: [], ideas: [] });
  });

  it('offers to record a new idea and explains the empty list', async () => {
    mockedListProjects.mockResolvedValue([]);
    await renderScreen();

    expect(screen.getByRole('button', { name: 'Record new idea' })).toBeOnTheScreen();
    expect(await screen.findByText(/Your ideas show up here/)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Favorites' })).not.toBeOnTheScreen();
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
    // A blank idea made on purpose starts with the grid on.
    expect(createProject).toHaveBeenCalledWith({ grid: true, folderId: null });
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

  it('shows a Recently Deleted row at the bottom of the root once something is deleted', async () => {
    mockedListProjects.mockResolvedValue([idea({ id: 'a', name: 'Chorus riff' })]);
    jest.mocked(listDeleted).mockResolvedValue({
      folders: [],
      ideas: [idea({ id: 'z', name: 'Old', deletedAt: 5 })],
    });
    const user = userEvent.setup();
    await renderScreen();

    await user.press(await screen.findByRole('button', { name: /Recently Deleted/ }));
    expect(mockPush).toHaveBeenCalledWith('/recently-deleted');
  });

  it('hides the Recently Deleted row when nothing is deleted', async () => {
    mockedListProjects.mockResolvedValue([idea({ id: 'a', name: 'Chorus riff' })]);
    await renderScreen();

    await screen.findByText('Chorus riff');
    expect(screen.queryByRole('button', { name: /Recently Deleted/ })).not.toBeOnTheScreen();
  });

  it('asks before deleting an idea', async () => {
    mockedListProjects.mockResolvedValue([idea({ id: 'a', name: 'Chorus riff' })]);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();
    await renderScreen();
    await screen.findByText('Chorus riff');

    await user.press(screen.getByRole('button', { name: 'Delete Chorus riff' }));

    expect(deleteItems).not.toHaveBeenCalled();
    expect(alert.mock.calls[0]![0]).toBe('Delete “Chorus riff”?');
    alert.mock.calls[0]![2]!.find((button) => button.text === 'Delete')!.onPress!();
    await waitFor(() =>
      expect(deleteItems).toHaveBeenCalledWith({ ideaIds: ['a'], folderIds: [] }),
    );
  });

  it('shows Favorites first, then folders, then the root’s ideas', async () => {
    seedTree();
    const user = userEvent.setup();
    await renderScreen();

    const favorites = await screen.findByRole('button', { name: 'Favorites 1' });
    const titles = screen
      .getAllByText(/^(Favorites|Demos|Chorus riff|Verse demo|Bridge take)$/)
      .map((node) => node.props.children);
    // Ideas inside folders aren't listed at the root.
    expect(titles).toEqual(['Favorites', 'Demos', 'Chorus riff']);

    await user.press(favorites);
    expect(mockPush).toHaveBeenCalledWith('/favorites');
    await user.press(screen.getByRole('button', { name: 'Demos 2' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/folder/[id]', params: { id: 'demos' } });
  });

  it('shows a folder’s contents and records into it', async () => {
    seedTree();
    jest.mocked(createProject).mockResolvedValue(idea({ id: 'new', folderId: 'demos' }));
    const user = userEvent.setup();
    await renderScreen({ kind: 'folder', id: 'demos' });

    expect(await screen.findByText('Rough')).toBeOnTheScreen();
    expect(screen.getByText('Verse demo')).toBeOnTheScreen();
    expect(screen.queryByText('Chorus riff')).not.toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Record new idea' }));
    expect(createProject).toHaveBeenCalledWith({ grid: false, folderId: 'demos' });
  });

  it('lists every starred idea in Favorites with its folder', async () => {
    seedTree();
    await renderScreen({ kind: 'favorites' });

    expect(await screen.findByText('Bridge take')).toBeOnTheScreen();
    expect(screen.getByText(/Demos › Rough/)).toBeOnTheScreen();
    expect(screen.queryByText('Chorus riff')).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Record new idea' })).not.toBeOnTheScreen();
  });

  it('stars and unstars from the swipe action without moving the idea', async () => {
    seedTree();
    const user = userEvent.setup();
    await renderScreen({ kind: 'folder', id: 'rough' });

    await user.press(await screen.findByRole('button', { name: 'Unfavorite Bridge take' }));
    expect(setFavorite).toHaveBeenCalledWith(['c'], false);
  });

  it('creates a folder in the current folder', async () => {
    seedTree();
    jest.mocked(createFolder).mockResolvedValue(folder('new', 'Takes', 'demos'));
    const user = userEvent.setup();
    await renderScreen({ kind: 'folder', id: 'demos' });
    await screen.findByText('Rough');

    await user.press(screen.getByRole('menuitem', { name: 'New Folder' }));
    await user.type(await screen.findByLabelText('Folder name'), 'Takes');
    await user.press(screen.getByRole('button', { name: 'Create' }));

    expect(createFolder).toHaveBeenCalledWith('demos', 'Takes');
  });

  it('counts what’s inside a folder before deleting it', async () => {
    seedTree();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();
    await renderScreen();

    await user.press(await screen.findByRole('button', { name: 'Delete Demos' }));

    expect(alert.mock.calls[0]![0]).toBe('Delete “Demos” and its 1 folder and 2 ideas?');
    alert.mock.calls[0]![2]!.find((button) => button.text === 'Delete')!.onPress!();
    await waitFor(() =>
      expect(deleteItems).toHaveBeenCalledWith({ ideaIds: [], folderIds: ['demos'] }),
    );
  });

  it('moves and deletes several items in select mode', async () => {
    seedTree();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();
    await renderScreen();
    await screen.findByText('Chorus riff');

    await user.press(screen.getByRole('button', { name: 'Select' }));
    expect(screen.queryByRole('button', { name: 'Favorites 1' })).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Move' })).toBeDisabled();

    await user.press(screen.getByRole('button', { name: /^Chorus riff/ }));
    await user.press(screen.getByRole('button', { name: 'Demos 2' }));
    expect(screen.getByRole('button', { name: /^Chorus riff/ })).toBeSelected();
    expect(mockPush).not.toHaveBeenCalled();

    await user.press(screen.getByRole('button', { name: 'Move' }));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/move-to',
      params: { ideas: 'a', folders: 'demos' },
    });

    await user.press(screen.getByRole('button', { name: 'Select' }));
    await user.press(screen.getByRole('button', { name: 'Select All' }));
    await user.press(screen.getByRole('button', { name: 'Delete' }));
    expect(alert.mock.calls[0]![0]).toBe('Delete 1 folder and 1 idea?');
    alert.mock.calls[0]![2]!.find((button) => button.text === 'Delete')!.onPress!();
    await waitFor(() =>
      expect(deleteItems).toHaveBeenCalledWith({ ideaIds: ['a'], folderIds: ['demos'] }),
    );
    expect(screen.getByRole('button', { name: 'Select' })).toBeOnTheScreen();
  });

  it('searches every folder from the root and shows where results live', async () => {
    seedTree();
    const user = userEvent.setup();
    await renderScreen();
    await screen.findByText('Chorus riff');

    await user.type(screen.getByLabelText('Search'), 'take');

    const result = await screen.findByRole('button', { name: /^Bridge take/ });
    expect(within(result).getByText(/Demos › Rough/)).toBeOnTheScreen();
    expect(screen.queryByText('Chorus riff')).not.toBeOnTheScreen();
  });

  it('searches only inside the current folder', async () => {
    seedTree();
    const user = userEvent.setup();
    await renderScreen({ kind: 'folder', id: 'rough' });
    await screen.findByText('Bridge take');

    await user.type(screen.getByLabelText('Search'), 'riff');

    expect(await screen.findByText(/Nothing matches/)).toBeOnTheScreen();
  });

  it('opens the Move sheet from an idea’s long-press menu', async () => {
    seedTree();
    const sheet = jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation(() => {});
    const user = userEvent.setup();
    await renderScreen();

    await user.longPress(await screen.findByRole('button', { name: /^Chorus riff/ }));

    const [options, choose] = sheet.mock.calls[0]!;
    expect(options.options).toEqual([
      'Favorite',
      'Rename',
      'Duplicate',
      'Move to…',
      'Select',
      'Delete',
      'Cancel',
    ]);
    choose(options.options.indexOf('Move to…'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/move-to',
      params: { ideas: 'a', folders: '' },
    });
  });
});
